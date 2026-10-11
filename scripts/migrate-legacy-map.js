import { createClient } from '@libsql/client'

const CONFIRMATION_FLAG = '--confirm-legacy-map-migration'
const PAGE_SIZE = 500
const MAX_PAGES = 200
const MAX_FILES = PAGE_SIZE * MAX_PAGES
const EXPECTED_DATABASE_HOST_PREFIX = 'solutte-data-vercel-icfg-oxg7f8ycfh3mkauindzovhrb.'

const REQUIRED_COLUMNS = {
  users: ['id'],
  organiza_devices: ['id', 'user_id', 'actor_user_id'],
  organiza_clients: ['id', 'user_id', 'code', 'legal_name', 'cnpj'],
  organiza_file_index: ['user_id', 'device_id', 'relative_path', 'file_name', 'client_id', 'file_hash', 'document_type', 'department', 'competence_year', 'competence_month', 'indexed_at'],
  organiza_shared_file_index: ['user_id', 'relative_path', 'file_name', 'client_id', 'file_hash', 'document_type', 'department', 'competence_year', 'competence_month', 'indexed_at'],
  organiza_file_map_state: ['user_id', 'revision', 'legacy_migrated', 'updated_at'],
  organiza_file_map_changes: ['user_id', 'relative_path', 'revision', 'operation', 'payload', 'created_at'],
}

const text = (value) => value == null ? '' : String(value)
const number = (value) => Number(value || 0)
const now = () => new Date().toISOString()
const rowsOf = (result) => result.rows || []
const affected = (result) => number(result?.rowsAffected)

function argumentValue(flag) {
  const index = process.argv.indexOf(flag)
  return index >= 0 ? text(process.argv[index + 1]).trim() : ''
}

function log(event, details = {}) {
  console.log(JSON.stringify({ event, time: now(), ...details }))
}

function safeErrorMessage(error, credentials) {
  let message = text(error?.message || error || 'Erro desconhecido.')
  for (const credential of credentials) {
    if (credential) message = message.split(credential).join('[REDACTED]')
  }
  return message.replace(/libsql:\/\/[^\s"'`]+/gi, '[DATABASE_URL_REDACTED]')
}

class MigrationStepError extends Error {
  constructor(phase, cause) {
    super(text(cause?.message || cause || 'Falha sem mensagem.'))
    this.name = 'MigrationStepError'
    this.phase = phase
    this.cause = cause
  }
}

async function assertRequiredSchema(db, context) {
  context.phase = 'preflight.schema_catalog'
  const tableResult = await db.execute({
    sql: `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${Object.keys(REQUIRED_COLUMNS).map(() => '?').join(',')})`,
    args: Object.keys(REQUIRED_COLUMNS),
  })
  const existingTables = new Set(rowsOf(tableResult).map((row) => text(row.name)))
  const missingTables = Object.keys(REQUIRED_COLUMNS).filter((table) => !existingTables.has(table))
  if (missingTables.length) throw new Error(`Schema pré-existente incompleto; tabelas ausentes: ${missingTables.join(', ')}. Nenhum DDL será executado.`)

  for (const [table, expectedColumns] of Object.entries(REQUIRED_COLUMNS)) {
    context.phase = `preflight.columns.${table}`
    const columnsResult = await db.execute(`PRAGMA table_info("${table}")`)
    const actualColumns = new Set(rowsOf(columnsResult).map((row) => text(row.name)))
    const missingColumns = expectedColumns.filter((column) => !actualColumns.has(column))
    if (missingColumns.length) throw new Error(`Colunas ausentes em ${table}: ${missingColumns.join(', ')}. Nenhuma escrita foi iniciada.`)
  }
}

async function writeMapPage(db, userId, files, context) {
  let tx
  let committed = false
  let writePhase = 'page.transaction.begin'
  try {
    tx = await db.transaction('write')

    writePhase = 'page.map_lookup'
    const currentResult = await tx.execute({
      sql: `SELECT relative_path AS relativePath, file_name AS fileName, client_id AS clientId,
        COALESCE(file_hash, '') AS fileHash, COALESCE(document_type, '') AS documentType,
        COALESCE(department, '') AS department, competence_year AS competenceYear,
        competence_month AS competenceMonth
        FROM organiza_shared_file_index WHERE user_id = ? AND relative_path IN (${files.map(() => '?').join(',')})`,
      args: [userId, ...files.map((file) => file.relativePath)],
    })
    const currentByPath = new Map(rowsOf(currentResult).map((row) => [text(row.relativePath), row]))
    const changedFiles = files
      .map((file) => ({ ...file, fileHash: file.fileHash || text(currentByPath.get(file.relativePath)?.fileHash) }))
      .filter((file) => {
        const current = currentByPath.get(file.relativePath)
        return !current
          || text(current.fileName) !== text(file.fileName)
          || text(current.clientId) !== text(file.clientId)
          || text(current.fileHash) !== text(file.fileHash)
          || text(current.documentType) !== text(file.documentType)
          || text(current.department) !== text(file.department)
          || number(current.competenceYear) !== number(file.competenceYear)
          || number(current.competenceMonth) !== number(file.competenceMonth)
      })

    if (!changedFiles.length) {
      writePhase = 'page.read_revision'
      const revisionResult = await tx.execute({
        sql: 'SELECT revision FROM organiza_file_map_state WHERE user_id = ?',
        args: [userId],
      })
      const revision = number(rowsOf(revisionResult)[0]?.revision)
      writePhase = 'page.transaction.commit_unchanged'
      await tx.commit()
      committed = true
      return { revision, documentsWritten: 0, databaseRowsWritten: 0 }
    }

    writePhase = 'page.bump_revision'
    const timestamp = now()
    const stateInsert = await tx.execute({
      sql: 'INSERT OR IGNORE INTO organiza_file_map_state (user_id, revision, updated_at) VALUES (?, 0, ?)',
      args: [userId, timestamp],
    })
    const revisionResult = await tx.execute({
      sql: 'UPDATE organiza_file_map_state SET revision = revision + 1, updated_at = ? WHERE user_id = ? RETURNING revision',
      args: [timestamp, userId],
    })
    const revision = number(rowsOf(revisionResult)[0]?.revision)
    let databaseRowsWritten = affected(stateInsert) + affected(revisionResult)

    const clientIds = [...new Set(changedFiles.map((file) => text(file.clientId)).filter(Boolean))]
    let clientsById = new Map()
    if (clientIds.length) {
      writePhase = 'page.read_client_metadata'
      const clientsResult = await tx.execute({
        sql: `SELECT id, code, legal_name AS legalName, cnpj FROM organiza_clients
          WHERE user_id = ? AND id IN (${clientIds.map(() => '?').join(',')})`,
        args: [userId, ...clientIds],
      })
      clientsById = new Map(rowsOf(clientsResult).map((client) => [text(client.id), {
        code: text(client.code), legalName: text(client.legalName), cnpj: text(client.cnpj),
      }]))
    }

    for (let start = 0; start < changedFiles.length; start += 200) {
      const batchFiles = changedFiles.slice(start, start + 200)
      writePhase = `page.write_batch_${Math.floor(start / 200) + 1}`
      const results = await tx.batch(batchFiles.flatMap((file) => [
        {
          sql: `INSERT INTO organiza_shared_file_index
            (user_id, relative_path, file_name, client_id, file_hash, document_type, department, competence_year, competence_month, indexed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, relative_path) DO UPDATE SET
              file_name = excluded.file_name, client_id = excluded.client_id, file_hash = excluded.file_hash,
              document_type = excluded.document_type, department = excluded.department,
              competence_year = excluded.competence_year, competence_month = excluded.competence_month,
              indexed_at = excluded.indexed_at`,
          args: [userId, file.relativePath, file.fileName, file.clientId, file.fileHash, file.documentType, file.department, file.competenceYear, file.competenceMonth, timestamp],
        },
        {
          sql: `INSERT INTO organiza_file_map_changes
            (user_id, revision, relative_path, operation, payload, created_at)
            VALUES (?, ?, ?, 'upsert', ?, ?)
            ON CONFLICT(user_id, relative_path) DO UPDATE SET
              revision = excluded.revision, operation = excluded.operation,
              payload = excluded.payload, created_at = excluded.created_at`,
          args: [userId, revision, file.relativePath, JSON.stringify({
            ...file,
            ...(clientsById.get(text(file.clientId)) || {}),
            indexedAt: timestamp,
          }), timestamp],
        },
      ]))
      databaseRowsWritten += results.reduce((total, result) => total + affected(result), 0)
    }

    writePhase = 'page.transaction.commit'
    await tx.commit()
    committed = true
    return { revision, documentsWritten: changedFiles.length, databaseRowsWritten }
  } catch (error) {
    if (tx && !committed) {
      try {
        writePhase = `${writePhase}.rollback`
        await tx.rollback()
      } catch (rollbackError) {
        throw new MigrationStepError(`${writePhase}.rollback_failed`, new Error(`${text(error?.message || error)}; rollback também falhou: ${text(rollbackError?.message || rollbackError)}`))
      }
    }
    throw new MigrationStepError(writePhase, error)
  }
}

async function markMigrationComplete(db, userId, context) {
  let tx
  try {
    context.phase = 'finalize.transaction.begin'
    tx = await db.transaction('write')
    context.phase = 'finalize.ensure_state'
    await tx.execute({
      sql: 'INSERT OR IGNORE INTO organiza_file_map_state (user_id, revision, legacy_migrated, updated_at) VALUES (?, 0, 0, ?)',
      args: [userId, now()],
    })
    context.phase = 'finalize.mark_legacy_migrated'
    await tx.execute({
      sql: 'UPDATE organiza_file_map_state SET legacy_migrated = 1, updated_at = ? WHERE user_id = ?',
      args: [now(), userId],
    })
    context.phase = 'finalize.transaction.commit'
    await tx.commit()
  } catch (error) {
    if (tx) {
      try { await tx.rollback() } catch (rollbackError) {
        throw new MigrationStepError(`${context.phase}.rollback_failed`, new Error(`${text(error?.message || error)}; rollback também falhou: ${text(rollbackError?.message || rollbackError)}`))
      }
    }
    throw new MigrationStepError(context.phase, error)
  }
}

async function runMigration() {
  const userId = argumentValue('--user-id')
  const adminDeviceId = argumentValue('--admin-device-id')
  if (!process.argv.includes(CONFIRMATION_FLAG) || !userId || !adminDeviceId) {
    throw new Error(`Uso: npm run map:migrate-legacy -- ${CONFIRMATION_FLAG} --user-id <ID> --admin-device-id <ID>`)
  }

  const databaseUrl = text(process.env.TURSO_DATABASE_URL).trim()
  const authToken = text(process.env.TURSO_AUTH_TOKEN).trim()
  if (!databaseUrl || !authToken) {
    throw new Error('Configure TURSO_DATABASE_URL e TURSO_AUTH_TOKEN no ambiente do processo; os valores não serão exibidos.')
  }
  let databaseHost
  try { databaseHost = new URL(databaseUrl).hostname } catch {
    throw new Error('TURSO_DATABASE_URL não é uma URL válida; o valor não será exibido.')
  }
  if (!databaseHost.startsWith(EXPECTED_DATABASE_HOST_PREFIX)) {
    throw new Error('Destino recusado: TURSO_DATABASE_URL não identifica solutte-data na organização autorizada.')
  }

  const db = createClient({ url: databaseUrl, authToken })
  const context = {
    phase: 'startup',
    currentPage: null,
    lastCompletedPage: 0,
    cursor: '',
    highWaterMark: '',
    revision: 0,
    pageRowsRead: 0,
    pageDocumentsWritten: 0,
    pageDatabaseRowsWritten: 0,
    sourceRowsRead: 0,
    documentsWritten: 0,
    databaseRowsWritten: 0,
  }

  try {
    log('migration_started', {
      database: 'solutte-data',
      workspaceId: userId,
      adminDeviceId,
      pageSize: PAGE_SIZE,
      maxFiles: MAX_FILES,
      maxPages: MAX_PAGES,
    })
    await assertRequiredSchema(db, context)

    context.phase = 'preflight.admin_device'
    const deviceResult = await db.execute({
      sql: 'SELECT id FROM organiza_devices WHERE id = ? AND user_id = ? AND actor_user_id = ? LIMIT 1',
      args: [adminDeviceId, userId, userId],
    })
    if (!rowsOf(deviceResult).length) throw new Error('O dispositivo informado não pertence ao administrador desse workspace.')

    context.phase = 'preflight.migration_state'
    const stateResult = await db.execute({
      sql: 'SELECT revision, legacy_migrated FROM organiza_file_map_state WHERE user_id = ?',
      args: [userId],
    })
    const state = rowsOf(stateResult)[0]
    context.revision = number(state?.revision)
    if (number(state?.legacy_migrated)) {
      log('migration_skipped_already_complete', { revision: context.revision, lastCompletedPage: 0 })
      return
    }

    context.phase = 'preflight.high_water_mark'
    const highWaterResult = await db.execute({
      sql: `SELECT relative_path AS relativePath FROM organiza_file_index
        WHERE user_id = ? AND device_id = ? ORDER BY relative_path DESC LIMIT 1`,
      args: [userId, adminDeviceId],
    })
    context.highWaterMark = text(rowsOf(highWaterResult)[0]?.relativePath)
    log('migration_scope_ready', {
      cursor: context.cursor,
      highWaterMark: context.highWaterMark,
      revision: context.revision,
      lastCompletedPage: context.lastCompletedPage,
    })

    const seenCursors = new Set()
    while (context.cursor !== context.highWaterMark) {
      const page = context.lastCompletedPage + 1
      context.currentPage = page
      context.pageRowsRead = 0
      context.pageDocumentsWritten = 0
      context.pageDatabaseRowsWritten = 0
      if (context.lastCompletedPage >= MAX_PAGES || context.sourceRowsRead >= MAX_FILES) {
        context.phase = 'page.limit_guard'
        throw new Error(`Limite de segurança atingido antes da página ${page} (${MAX_FILES} registros / ${MAX_PAGES} páginas).`)
      }

      log('page_started', {
        page,
        cursor: context.cursor,
        highWaterMark: context.highWaterMark,
        revision: context.revision,
        sourceRowsRead: context.sourceRowsRead,
      })

      context.phase = 'page.read_legacy_metadata'
      const pageResult = await db.execute({
        sql: `SELECT file_name AS fileName, relative_path AS relativePath, client_id AS clientId,
          COALESCE(file_hash, '') AS fileHash, COALESCE(document_type, '') AS documentType,
          COALESCE(department, '') AS department, competence_year AS competenceYear,
          competence_month AS competenceMonth, indexed_at AS indexedAt
          FROM organiza_file_index
          WHERE user_id = ? AND device_id = ? AND relative_path > ? AND relative_path <= ?
          ORDER BY relative_path LIMIT ?`,
        args: [userId, adminDeviceId, context.cursor, context.highWaterMark, PAGE_SIZE],
      })
      const files = rowsOf(pageResult)
      context.pageRowsRead = files.length
      context.sourceRowsRead += files.length
      if (!files.length) throw new Error('A página não retornou registros antes de alcançar o high-water mark.')
      if (context.sourceRowsRead > MAX_FILES) throw new Error(`O limite de ${MAX_FILES} registros seria ultrapassado; a página não será gravada.`)

      const nextCursor = text(files.at(-1)?.relativePath)
      if (!nextCursor || nextCursor <= context.cursor || nextCursor > context.highWaterMark || seenCursors.has(nextCursor)) {
        throw new Error('Cursor inválido ou sem progresso; a página não será gravada.')
      }
      seenCursors.add(nextCursor)
      log('page_read', {
        page,
        rowsRead: files.length,
        cursor: context.cursor,
        nextCursor,
        highWaterMark: context.highWaterMark,
        revision: context.revision,
        sourceRowsRead: context.sourceRowsRead,
      })

      context.phase = 'page.write_shared_map'
      const writeResult = await writeMapPage(db, userId, files, context)
      context.revision = writeResult.revision
      context.pageDocumentsWritten = writeResult.documentsWritten
      context.pageDatabaseRowsWritten = writeResult.databaseRowsWritten
      context.documentsWritten += writeResult.documentsWritten
      context.databaseRowsWritten += writeResult.databaseRowsWritten
      context.cursor = nextCursor
      context.lastCompletedPage = page
      context.currentPage = null
      context.phase = 'page.completed'
      log('page_completed', {
        page,
        rowsRead: files.length,
        documentsWritten: writeResult.documentsWritten,
        databaseRowsWritten: writeResult.databaseRowsWritten,
        cursor: context.cursor,
        highWaterMark: context.highWaterMark,
        revision: context.revision,
        sourceRowsRead: context.sourceRowsRead,
        totalDocumentsWritten: context.documentsWritten,
        totalDatabaseRowsWritten: context.databaseRowsWritten,
      })
    }

    await markMigrationComplete(db, userId, context)
    log('migration_completed', {
      pagesCompleted: context.lastCompletedPage,
      sourceRowsRead: context.sourceRowsRead,
      documentsWritten: context.documentsWritten,
      databaseRowsWritten: context.databaseRowsWritten,
      cursor: context.cursor,
      highWaterMark: context.highWaterMark,
      revision: context.revision,
      legacyMigrated: true,
    })
  } catch (error) {
    const failurePhase = error instanceof MigrationStepError ? error.phase : context.phase
    const underlyingError = error instanceof MigrationStepError ? error.cause : error
    log('migration_failed', {
      phase: failurePhase,
      failedPage: context.currentPage,
      lastCompletedPage: context.lastCompletedPage,
      pageRowsRead: context.pageRowsRead,
      pageDocumentsWritten: context.pageDocumentsWritten,
      pageDatabaseRowsWritten: context.pageDatabaseRowsWritten,
      sourceRowsRead: context.sourceRowsRead,
      totalDocumentsWritten: context.documentsWritten,
      totalDatabaseRowsWritten: context.databaseRowsWritten,
      cursor: context.cursor,
      highWaterMark: context.highWaterMark,
      revision: context.revision,
      error: safeErrorMessage(underlyingError, [databaseUrl, authToken]),
      retry: 'not_attempted',
    })
    process.exitCode = 1
  }
}

runMigration().catch((error) => {
  console.error(JSON.stringify({
    event: 'migration_not_started',
    error: safeErrorMessage(error, [process.env.TURSO_DATABASE_URL, process.env.TURSO_AUTH_TOKEN]),
    retry: 'not_attempted',
  }))
  process.exitCode = 1
})
