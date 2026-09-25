import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import { createClient } from '@libsql/client'
import express from 'express'
import jwt from 'jsonwebtoken'
import { get, put } from '@vercel/blob'

const databaseUrl = process.env.TURSO_DATABASE_URL
const authToken = process.env.TURSO_AUTH_TOKEN
const jwtSecret = process.env.JWT_SECRET

if (!databaseUrl || !authToken || !jwtSecret) {
  throw new Error('Configure TURSO_DATABASE_URL, TURSO_AUTH_TOKEN e JWT_SECRET na Vercel.')
}

const db = createClient({ url: databaseUrl, authToken })
let schemaReady

function initializeSchema() {
  if (!schemaReady) {
    schemaReady = db.batch([
      `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        company TEXT NOT NULL, password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('admin', 'user')) DEFAULT 'user',
        account_status TEXT NOT NULL CHECK (account_status IN ('active', 'pending_payment', 'pending_approval', 'suspended')) DEFAULT 'pending_payment',
        payment_status TEXT NOT NULL CHECK (payment_status IN ('not_required', 'pending', 'paid', 'failed')) DEFAULT 'pending',
        approved_by TEXT, approved_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'paused', 'archived')) DEFAULT 'draft',
        created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS token_usage (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, agent_id TEXT, input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS execution_logs (
        id TEXT PRIMARY KEY, user_id TEXT, agent_id TEXT, event_type TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('info', 'success', 'warning', 'error')) DEFAULT 'info',
        message TEXT NOT NULL, metadata TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS organiza_devices (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, platform TEXT NOT NULL DEFAULT 'windows',
        app_version TEXT NOT NULL DEFAULT '', status TEXT NOT NULL CHECK (status IN ('connected', 'offline', 'revoked')) DEFAULT 'offline',
        clients_root_path TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, last_seen_at TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`,
      `CREATE TABLE IF NOT EXISTS organiza_clients (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, code TEXT NOT NULL, legal_name TEXT NOT NULL, cnpj TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (user_id, code), FOREIGN KEY (user_id) REFERENCES users(id)
      )`,
      `CREATE TABLE IF NOT EXISTS organiza_file_index (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, device_id TEXT NOT NULL, client_id TEXT,
        file_name TEXT NOT NULL, relative_path TEXT NOT NULL, file_hash TEXT, document_type TEXT, department TEXT,
        competence_year INTEGER, competence_month INTEGER, extracted_data TEXT NOT NULL DEFAULT '{}', indexed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (device_id, relative_path), FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (device_id) REFERENCES organiza_devices(id)
      )`,
      `CREATE TABLE IF NOT EXISTS organiza_audit_logs (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, action TEXT NOT NULL, status TEXT NOT NULL,
        message TEXT NOT NULL, metadata TEXT NOT NULL DEFAULT '{}', ip_address TEXT NOT NULL DEFAULT '',
        user_agent TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`,
      `CREATE TABLE IF NOT EXISTS organiza_events (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, device_id TEXT, event_type TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('info', 'success', 'warning', 'error')) DEFAULT 'info',
        message TEXT NOT NULL, metadata TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (device_id) REFERENCES organiza_devices(id)
      )`,
      `CREATE TABLE IF NOT EXISTS organiza_commands (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, device_id TEXT NOT NULL, command_type TEXT NOT NULL,
        payload TEXT NOT NULL DEFAULT '{}', status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')) DEFAULT 'pending',
        result_message TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, completed_at TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (device_id) REFERENCES organiza_devices(id)
      )`,
      `CREATE TABLE IF NOT EXISTS organiza_rules (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, terms TEXT NOT NULL DEFAULT '[]',
        department TEXT NOT NULL CHECK (department IN ('contabil', 'fiscal', 'pessoal', 'juridico')),
        active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`,
      `CREATE TABLE IF NOT EXISTS organiza_pending_files (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, device_id TEXT NOT NULL, file_name TEXT NOT NULL, relative_path TEXT NOT NULL,
        reason TEXT NOT NULL, detected_client_id TEXT, detected_cnpj TEXT NOT NULL DEFAULT '', detected_competence TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL CHECK (status IN ('pending', 'resolution_requested', 'resolved')) DEFAULT 'pending',
        resolution TEXT NOT NULL DEFAULT '{}', destination_path TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        resolved_at TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (device_id) REFERENCES organiza_devices(id), FOREIGN KEY (detected_client_id) REFERENCES organiza_clients(id)
      )`,
      `CREATE TABLE IF NOT EXISTS organiza_folder_structures (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, device_id TEXT, name TEXT NOT NULL, mode TEXT NOT NULL CHECK (mode IN ('standard', 'custom', 'existing')),
        root_path TEXT NOT NULL DEFAULT '', folder_count INTEGER NOT NULL DEFAULT 0, scanned_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (device_id) REFERENCES organiza_devices(id)
      )`,
      `CREATE TABLE IF NOT EXISTS organiza_folder_nodes (
        id TEXT PRIMARY KEY, structure_id TEXT NOT NULL, client_id TEXT, relative_path TEXT NOT NULL, parent_path TEXT NOT NULL DEFAULT '',
        folder_name TEXT NOT NULL, depth INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (structure_id, relative_path), FOREIGN KEY (structure_id) REFERENCES organiza_folder_structures(id), FOREIGN KEY (client_id) REFERENCES organiza_clients(id)
      )`,
      `CREATE TABLE IF NOT EXISTS organiza_izza_learning_sessions (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, query TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, confirmed_at TEXT, FOREIGN KEY (user_id) REFERENCES users(id)
      )`,
      `CREATE TABLE IF NOT EXISTS organiza_izza_learnings (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, phrase TEXT NOT NULL, document_type TEXT NOT NULL, department TEXT NOT NULL DEFAULT '',
        confirmations INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (user_id, phrase, document_type, department), FOREIGN KEY (user_id) REFERENCES users(id)
      )`,
      `CREATE TABLE IF NOT EXISTS organiza_temporary_previews (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, device_id TEXT NOT NULL, index_id TEXT NOT NULL,
        file_name TEXT NOT NULL, blob_url TEXT, mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
        status TEXT NOT NULL CHECK (status IN ('pending', 'ready', 'failed', 'expired')) DEFAULT 'pending',
        error_message TEXT, expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (device_id) REFERENCES organiza_devices(id)
      )`,
      `CREATE TABLE IF NOT EXISTS organiza_notification_schedule (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, day_of_month INTEGER NOT NULL,
        sector TEXT NOT NULL, message TEXT NOT NULL, times TEXT NOT NULL DEFAULT '[]',
        active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users(id)
      )`,
      'CREATE INDEX IF NOT EXISTS idx_users_status ON users(account_status)',
      'CREATE INDEX IF NOT EXISTS idx_logs_created_at ON execution_logs(created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_organiza_devices_user ON organiza_devices(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_organiza_clients_user ON organiza_clients(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_organiza_files_user ON organiza_file_index(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_organiza_audit_user_created ON organiza_audit_logs(user_id, created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_organiza_events_user_created ON organiza_events(user_id, created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_organiza_commands_device_status ON organiza_commands(device_id, status, created_at)',
      'CREATE INDEX IF NOT EXISTS idx_organiza_rules_user ON organiza_rules(user_id, active)',
      'CREATE INDEX IF NOT EXISTS idx_organiza_pending_user_status ON organiza_pending_files(user_id, status, created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_organiza_structures_user ON organiza_folder_structures(user_id, updated_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_organiza_nodes_structure ON organiza_folder_nodes(structure_id, depth)',
      'CREATE INDEX IF NOT EXISTS idx_izza_learning_user ON organiza_izza_learnings(user_id, confirmations DESC)',
      'CREATE INDEX IF NOT EXISTS idx_organiza_previews_expiry ON organiza_temporary_previews(expires_at, status)',
      'CREATE INDEX IF NOT EXISTS idx_organiza_notifications_user ON organiza_notification_schedule(user_id, day_of_month)',
    ], 'write').then(async () => {
      for (const sql of [
        "ALTER TABLE users ADD COLUMN workspace_owner_id TEXT",
        "ALTER TABLE organiza_rules ADD COLUMN destination_path TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE organiza_devices ADD COLUMN structure_mode TEXT NOT NULL DEFAULT 'standard'",
        "ALTER TABLE organiza_devices ADD COLUMN actor_user_id TEXT",
        "ALTER TABLE organiza_file_index ADD COLUMN sync_id TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE organiza_file_index ADD COLUMN extracted_data TEXT NOT NULL DEFAULT '{}'",
        "ALTER TABLE users ADD COLUMN notification_schedule_initialized INTEGER NOT NULL DEFAULT 0",
      ]) {
        try { await db.execute(sql) } catch (error) {
          if (!/duplicate|already exists/i.test(String(error))) throw error
        }
      }
    })
  }
  return schemaReady
}

const app = express()
const allowedOrigins = new Set([
  'https://solutte-organizza.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
])
app.use((req, res, next) => {
  const origin = req.get('origin')
  if (origin && allowedOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  }
  if (req.method === 'OPTIONS') return res.status(204).end()
  next()
})
app.use(express.raw({ type: ['application/octet-stream', 'application/pdf', 'image/png', 'image/jpeg'], limit: '20mb' }))
app.use(express.json({ limit: '2mb' }))
app.use(async (_req, _res, next) => { try { await initializeSchema(); next() } catch (error) { next(error) } })

const id = () => crypto.randomUUID()
const now = () => new Date().toISOString()
const one = async (sql, args = []) => (await db.execute({ sql, args })).rows[0]
const many = async (sql, args = []) => (await db.execute({ sql, args })).rows
const asText = (value) => value == null ? '' : String(value)
const asNumber = (value) => Number(value || 0)
const parsedExtractedData = (value) => {
  try { const parsed = JSON.parse(asText(value) || '{}'); return parsed && typeof parsed === 'object' ? parsed : {} } catch { return {} }
}
const brlFromCents = (value) => (asNumber(value) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const financialSummary = (row) => {
  const data = parsedExtractedData(row?.extractedData)
  if (data.kind === 'payroll_receipt' && asNumber(data.totalCents)) {
    const employees = Array.isArray(data.employees) ? data.employees.filter((item) => asText(item?.name) && asNumber(item?.netCents)).slice(0, 30) : []
    const details = employees.length ? ` ${employees.map((item) => `${asText(item.name)}: ${brlFromCents(item.netCents)}`).join('; ')}.` : ''
    return `Total líquido: ${brlFromCents(data.totalCents)} (${asNumber(data.employeeCount)} pessoa${asNumber(data.employeeCount) === 1 ? '' : 's'}).${details}`
  }
  if (['das', 'inss', 'fgts'].includes(data.kind) && asNumber(data.amountCents)) return `Valor da guia: ${brlFromCents(data.amountCents)}${asText(data.dueDate) ? ` · vencimento: ${asText(data.dueDate)}` : ''}.`
  if (data.status === 'unreadable' || data.status === 'needs_reindex') return 'O documento foi encontrado, mas o valor ainda não foi lido. Use “Ler documento” no mapa financeiro.'
  return ''
}
const comparableClientCode = (value) => {
  const code = asText(value).trim().toUpperCase()
  return /^\d+$/.test(code) ? code.replace(/^0+/, '') || '0' : code
}
const normalizeClientName = (value) => asText(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^A-Za-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
const normalizeRuleTerm = (value) => normalizeClientName(value).toUpperCase()
const normalizeSearchText = (value) => normalizeClientName(value).toUpperCase()
const learningSignature = (value) => {
  const ignored = new Set(['ME', 'O', 'A', 'OS', 'AS', 'UM', 'UMA', 'DO', 'DA', 'DE', 'EM', 'PARA', 'COM', 'POR', 'EMPRESA', 'ARQUIVO', 'DOCUMENTO', 'LOCALIZAR', 'BUSCAR', 'ENCONTRAR', 'MOSTRAR', 'TRAGA', 'QUERO', 'PRECISO', 'JANEIRO', 'FEVEREIRO', 'MARCO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'])
  return normalizeSearchText(value).split(/\s+/).filter((term) => term.length >= 2 && !ignored.has(term) && !/^\d+$/.test(term)).slice(0, 10).join(' ')
}
const IZZA_AI_EMAILS = new Set(['automacaosolutte@gmail.com'])
const IZZA_DOCUMENT_WORDS = [
  'ARQUIVO', 'DOCUMENTO', 'PASTA', 'ABRIR', 'LOCALIZAR', 'BUSCAR', 'ENCONTRAR', 'MOSTRAR', 'TRAGA', 'PROCURE', 'ACHE',
  'DAS', 'DASMEI', 'DARF', 'DCTF', 'EFD', 'SPED', 'EXTRATO', 'RELATORIO', 'BALANCETE', 'BALANCO',
  'FOLHA', 'HOLERITE', 'ESOCIAL', 'FGTS', 'FERIAS', 'ADMISSAO', 'RESCISAO', 'CONTRATO', 'NOTA FISCAL',
  'SIMPLES', 'RECIBO', 'GUIA', 'LIVRO', 'SAIDAS', 'ENTRADAS', 'ALTERACAO', 'CONTRATUAL', 'SOCIAL', 'ESTATUTO',
]
const isLikelyIzzaDocumentRequest = (value) => {
  const words = normalizeSearchText(value).split(/\s+/).filter(Boolean)
  return IZZA_DOCUMENT_WORDS.some((word) => words.some((candidate) => candidate === word || (word.length >= 5 && candidate.startsWith(word))))
}
const isClearlyStructuredIzzaRequest = (value) => {
  const text = normalizeSearchText(value)
  const hasClientCode = /\b\d{1,5}\b/.test(text)
  const hasPeriod = /\b(?:0[1-9]|1[0-2])20\d{2}\b/.test(text) || /\b(?:0?[1-9]|1[0-2])\s*[\/.-]\s*20\d{2}\b/.test(text) || /\b(?:(?:DESTE|DESSE|ESTE|ESSE) ANO|ANO ATUAL)\b/.test(text) || (/\b20\d{2}\b/.test(text) && /\b(?:JANEIRO|FEVEREIRO|MARCO|ABRIL|MAIO|JUNHO|JULHO|AGOSTO|SETEMBRO|OUTUBRO|NOVEMBRO|DEZEMBRO)\b/.test(text))
  const hasDocumentOrFolder = /\b(?:ARQUIVO|DOCUMENTO|PASTA|DAS|DASMEI|DARF|DCTF|EFD|SPED|EXTRATO|RELATORIO|BALANCETE|BALANCO|FOLHA|HOLERITE|ESOCIAL|FGTS|FERIAS|ADMISSAO|RESCISAO|CONTRATO|ALTERACAO|CONTRATUAL|SOCIAL|ESTATUTO|RECIBO|GUIA|LIVRO|SAIDAS|ENTRADAS|FISCAL|CONTABIL|PESSOAL|JURIDICO)\b/.test(text)
  return hasClientCode && hasPeriod && hasDocumentOrFolder
}
const responseOutputText = (response) => {
  if (typeof response?.output_text === 'string') return response.output_text
  for (const item of Array.isArray(response?.output) ? response.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (content?.type === 'output_text' && typeof content.text === 'string') return content.text
    }
  }
  return ''
}

async function interpretIzzaRequestWithAI(userId, query) {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY não configurada.')
  const model = process.env.OPENAI_IZZA_MODEL || 'gpt-5-mini'
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model, store: false, max_output_tokens: 250,
      instructions: `Você interpreta pedidos de busca de documentos do Organizza. Não responda perguntas e não invente dados. Extraia somente o que o usuário escreveu. Use mode=list para listas, plurais, intervalos e últimos meses; use mode=find para um documento específico. Normalize competências como MMAAAA. Para intervalo, preencha competenceStart e competenceEnd. Para “últimos N meses”, preencha recentMonths. Use sort=latest_competence para “último documento” e sort=latest_indexed para “último arquivo inserido/alterado”. Normalize o setor como contabil, fiscal, pessoal ou juridico. Hoje é ${new Date().toISOString().slice(0, 10)}.`,
      input: query,
      text: { format: {
        type: 'json_schema', name: 'organizza_document_search', strict: true,
        schema: {
          type: 'object', additionalProperties: false,
          properties: {
            clientReference: { type: 'string' },
            documentDescription: { type: 'string' },
            competence: { type: 'string', description: 'Competência no formato MMAAAA, somente AAAA ou string vazia.' },
            competenceStart: { type: 'string', description: 'Início do intervalo em MMAAAA ou string vazia.' },
            competenceEnd: { type: 'string', description: 'Fim do intervalo em MMAAAA ou string vazia.' },
            recentMonths: { type: 'integer', minimum: 0, maximum: 36 },
            sort: { type: 'string', enum: ['', 'latest_competence', 'latest_indexed'] },
            mode: { type: 'string', enum: ['find', 'list'] },
            department: { type: 'string', enum: ['', 'contabil', 'fiscal', 'pessoal', 'juridico'] },
          },
          required: ['clientReference', 'documentDescription', 'competence', 'competenceStart', 'competenceEnd', 'recentMonths', 'sort', 'mode', 'department'],
        },
      } },
    }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`OpenAI ${response.status}: ${asText(payload?.error?.message || 'falha na interpretação')}`)
  const usage = payload?.usage || {}
  await db.execute({
    sql: 'INSERT INTO token_usage (id, user_id, agent_id, input_tokens, output_tokens) VALUES (?, ?, ?, ?, ?)',
    args: [id(), userId, 'izza', asNumber(usage.input_tokens), asNumber(usage.output_tokens)],
  })
  const output = JSON.parse(responseOutputText(payload) || '{}')
  return {
    query: [output.clientReference, output.documentDescription, output.competence, output.department].map(asText).filter(Boolean).join(' '),
    filters: {
      clientReference: asText(output.clientReference), documentDescription: asText(output.documentDescription), competence: asText(output.competence),
      competenceStart: asText(output.competenceStart), competenceEnd: asText(output.competenceEnd), recentMonths: Math.max(0, Math.min(36, asNumber(output.recentMonths))),
      sort: ['latest_competence', 'latest_indexed'].includes(output.sort) ? output.sort : '', department: asText(output.department),
    },
    mode: output.mode === 'list' ? 'list' : 'find', model,
  }
}

async function loadOpenAIOrganizationUsage() {
  const adminKey = process.env.OPENAI_ADMIN_KEY || process.env.OPENAI_ADMIN_KY
  if (!adminKey) return { available: false, message: 'A chave administrativa da OpenAI ainda não está configurada.' }
  const endTime = Math.floor(Date.now() / 1000)
  const startTime = endTime - (30 * 24 * 60 * 60)
  const headers = { Authorization: `Bearer ${adminKey}`, 'Content-Type': 'application/json' }
  const [usageResponse, costsResponse] = await Promise.all([
    fetch(`https://api.openai.com/v1/organization/usage/completions?start_time=${startTime}&end_time=${endTime}&bucket_width=1d&limit=31`, { headers }),
    fetch(`https://api.openai.com/v1/organization/costs?start_time=${startTime}&end_time=${endTime}&bucket_width=1d&limit=31`, { headers }),
  ])
  const [usagePayload, costsPayload] = await Promise.all([usageResponse.json().catch(() => ({})), costsResponse.json().catch(() => ({}))])
  if (!usageResponse.ok || !costsResponse.ok) {
    const failed = !usageResponse.ok ? usagePayload : costsPayload
    return { available: false, message: `A OpenAI recusou a consulta administrativa (HTTP ${!usageResponse.ok ? usageResponse.status : costsResponse.status}). Confira as permissões de leitura de Usage e Costs.`, detail: asText(failed?.error?.message).slice(0, 300) }
  }
  const byDay = new Map()
  for (const bucket of Array.isArray(usagePayload?.data) ? usagePayload.data : []) {
    const day = new Date(asNumber(bucket.start_time) * 1000).toISOString().slice(0, 10)
    const current = byDay.get(day) || { day, requests: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 }
    for (const result of Array.isArray(bucket.results) ? bucket.results : []) {
      current.requests += asNumber(result.num_model_requests)
      current.inputTokens += asNumber(result.input_tokens)
      current.outputTokens += asNumber(result.output_tokens)
    }
    byDay.set(day, current)
  }
  for (const bucket of Array.isArray(costsPayload?.data) ? costsPayload.data : []) {
    const day = new Date(asNumber(bucket.start_time) * 1000).toISOString().slice(0, 10)
    const current = byDay.get(day) || { day, requests: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 }
    for (const result of Array.isArray(bucket.results) ? bucket.results : []) current.costUsd += Number(result?.amount?.value || 0)
    byDay.set(day, current)
  }
  const daily = [...byDay.values()].sort((left, right) => left.day.localeCompare(right.day)).map((item) => ({ ...item, totalTokens: item.inputTokens + item.outputTokens, costUsd: Number(item.costUsd.toFixed(6)) }))
  const monthPrefix = new Date().toISOString().slice(0, 7)
  const totals = daily.reduce((sum, item) => ({ requests: sum.requests + item.requests, inputTokens: sum.inputTokens + item.inputTokens, outputTokens: sum.outputTokens + item.outputTokens, totalTokens: sum.totalTokens + item.totalTokens, costUsd: sum.costUsd + item.costUsd }), { requests: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0 })
  const monthCostUsd = daily.filter((item) => item.day.startsWith(monthPrefix)).reduce((sum, item) => sum + item.costUsd, 0)
  return { available: true, periodDays: 30, currency: 'usd', totalCostUsd: Number(totals.costUsd.toFixed(6)), monthCostUsd: Number(monthCostUsd.toFixed(6)), totals, daily }
}
const safeRelativePath = (value, maxLength = 1000) => {
  const normalized = typeof value === 'string' ? value.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').slice(0, maxLength) : ''
  return normalized && !normalized.split('/').some((segment) => !segment || segment === '.' || segment === '..') ? normalized : ''
}

function publicRule(row) {
  let terms = []
  try { terms = JSON.parse(asText(row.terms) || '[]') } catch { terms = [] }
  return {
    id: asText(row.id), name: asText(row.name), terms: Array.isArray(terms) ? terms.map(asText).filter(Boolean) : [],
    department: asText(row.department), destinationPath: asText(row.destination_path), active: Number(row.active) === 1,
    createdAt: asText(row.created_at), updatedAt: asText(row.updated_at),
  }
}

function publicUser(row) {
  return { id: asText(row.id), name: asText(row.name), email: asText(row.email), company: asText(row.company), role: asText(row.role), accountStatus: asText(row.account_status), paymentStatus: asText(row.payment_status), createdAt: asText(row.created_at) }
}

async function logEvent({ userId = null, agentId = null, eventType, status = 'info', message, metadata = {} }) {
  await db.execute({ sql: 'INSERT INTO execution_logs (id, user_id, agent_id, event_type, status, message, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)', args: [id(), userId, agentId, eventType, status, message, JSON.stringify(metadata)] })
}

async function auditOrganizza(req, { action, status, message, metadata = {} }) {
  const forwardedFor = asText(req.get('x-forwarded-for')).split(',')[0].trim()
  await db.execute({
    sql: 'INSERT INTO organiza_audit_logs (id, user_id, action, status, message, metadata, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    args: [id(), asText(req.user.id), action, status, message, JSON.stringify(metadata), forwardedFor.slice(0, 100), asText(req.get('user-agent')).slice(0, 500)],
  })
}

async function requireAuth(req, res, next) {
  const token = req.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ error: 'Autenticação necessária.' })
  try {
    const payload = jwt.verify(token, jwtSecret)
    const device = payload.scope === 'organizza:device' && typeof payload.deviceId === 'string'
      ? await one("SELECT * FROM organiza_devices WHERE id = ? AND user_id = ? AND status != 'revoked'", [payload.deviceId, payload.sub])
      : null
    const requestedActorId = device ? asText(device.actor_user_id || payload.sub) : asText(payload.sub)
    const user = await one('SELECT * FROM users WHERE id = ?', [requestedActorId])
    if (!user || asText(user.account_status) !== 'active') return res.status(401).json({ error: 'Sua conta não possui acesso ativo.' })
    const actorId = asText(user.id)
    const workspaceOwnerId = device ? asText(device.user_id) : asText(user.workspace_owner_id || user.id)
    const workspaceOwner = workspaceOwnerId === actorId ? user : await one('SELECT email FROM users WHERE id = ?', [workspaceOwnerId])
    req.user = { ...user, actor_id: actorId, workspace_owner_id: workspaceOwnerId, workspace_owner_email: asText(workspaceOwner?.email), id: workspaceOwnerId }
    next()
  } catch { return res.status(401).json({ error: 'Sessão inválida ou expirada.' }) }
}

function requireAdmin(req, res, next) {
  if (asText(req.user.role) !== 'admin') return res.status(403).json({ error: 'Acesso restrito à administração.' })
  next()
}

function requireOrganizzaOwner(req, res, next) {
  if (asText(req.user.email).trim().toLowerCase() !== 'automacaosolutte@gmail.com') return res.status(403).json({ error: 'Acesso restrito à administração do Organizza.' })
  next()
}

const defaultNotificationSchedule = [
  [4, 'Folha', 'Data limite para envio da Folha.'],
  [6, 'Folha', 'Quinto Dia Útil chegando, confira os envios.'],
  [8, 'Fiscal', 'Data limite para envio dos Impostos.'],
  [18, 'Fiscal', 'Simples vence em 2 dias, confira os envios.'],
  [22, 'Teste', 'Notificação teste do dia.'],
  [23, 'Fiscal', 'PIS e COFINS vencem em 2 dias, confira os envios.'],
  [28, 'Fiscal', 'IRPJ e CSLL vencem em 2 dias, confira os envios.'],
]
const defaultNotificationTimes = ['09:00', '14:00', '14:40', '16:00']

async function ensureNotificationSchedule(userId) {
  const owner = await one('SELECT notification_schedule_initialized FROM users WHERE id = ?', [userId])
  if (!owner || asNumber(owner.notification_schedule_initialized)) return
  await db.batch([
    ...defaultNotificationSchedule.map(([day, sector, message]) => ({ sql: 'INSERT OR IGNORE INTO organiza_notification_schedule (id, user_id, day_of_month, sector, message, times, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', args: [`default-${userId}-${day}-${normalizeSearchText(sector).toLowerCase()}`, userId, day, sector, message, JSON.stringify(defaultNotificationTimes), now()] })),
    { sql: 'UPDATE users SET notification_schedule_initialized = 1, updated_at = ? WHERE id = ?', args: [now(), userId] },
  ], 'write')
}

function publicNotification(row) {
  let times = []
  try { times = JSON.parse(asText(row.times) || '[]') } catch { times = [] }
  return { id: asText(row.id), day: asNumber(row.day_of_month), sector: asText(row.sector), message: asText(row.message), times, active: Boolean(asNumber(row.active)), createdAt: asText(row.created_at), updatedAt: asText(row.updated_at) }
}

async function requireOneIntegration(req, res, next) {
  const configuredKey = asText(process.env.ORGANIZZA_ONE_INTEGRATION_KEY)
  const suppliedKey = asText(req.get('x-organizza-integration-key'))
  if (!configuredKey || !suppliedKey || configuredKey.length !== suppliedKey.length || !crypto.timingSafeEqual(Buffer.from(configuredKey), Buffer.from(suppliedKey))) {
    return res.status(401).json({ error: 'Integração do ONE não autorizada.' })
  }
  try {
    const email = asText(process.env.ORGANIZZA_ONE_ACCOUNT_EMAIL || 'automacaosolutte@gmail.com').trim().toLowerCase()
    const user = await one("SELECT * FROM users WHERE email = ? AND account_status = 'active'", [email])
    if (!user) return res.status(503).json({ error: 'A conta do Organizza vinculada ao ONE não está disponível.' })
    const requested = Array.isArray(req.body?.allowedCnpjs) ? req.body.allowedCnpjs : []
    req.allowedClientCnpjs = new Set(requested.map((value) => asText(value).replace(/\D/g, '')).filter((value) => value.length === 14).slice(0, 1000))
    if (!req.allowedClientCnpjs.size) return res.status(403).json({ error: 'Nenhuma empresa autorizada foi informada pelo ONE.' })
    req.user = user
    next()
  } catch (error) { next(error) }
}

async function requireOneIntegrationAccount(req, res, next) {
  const configuredKey = asText(process.env.ORGANIZZA_ONE_INTEGRATION_KEY)
  const suppliedKey = asText(req.get('x-organizza-integration-key'))
  if (!configuredKey || !suppliedKey || configuredKey.length !== suppliedKey.length || !crypto.timingSafeEqual(Buffer.from(configuredKey), Buffer.from(suppliedKey))) return res.status(401).json({ error: 'Integração do ONE não autorizada.' })
  try {
    const email = asText(process.env.ORGANIZZA_ONE_ACCOUNT_EMAIL || 'automacaosolutte@gmail.com').trim().toLowerCase()
    const user = await one("SELECT * FROM users WHERE email = ? AND account_status = 'active'", [email])
    if (!user) return res.status(503).json({ error: 'A conta do Organizza vinculada ao ONE não está disponível.' })
    req.user = user
    next()
  } catch (error) { next(error) }
}

function publicDevice(row) {
  return {
    id: asText(row.id), name: asText(row.name), platform: asText(row.platform), appVersion: asText(row.app_version),
    status: asText(row.status), clientsRootPath: row.clients_root_path ? asText(row.clients_root_path) : null, structureMode: asText(row.structure_mode || 'standard'),
    createdAt: asText(row.created_at), lastSeenAt: row.last_seen_at ? asText(row.last_seen_at) : null,
  }
}

async function requestingUserDevice(req, relativePath = '') {
  const workspaceId = asText(req.user.id)
  const actorId = asText(req.user.actor_id || workspaceId)
  const ownerFallback = actorId === workspaceId ? 'OR d.actor_user_id IS NULL' : ''
  return one(`SELECT d.* FROM organiza_devices d
    LEFT JOIN organiza_file_index f ON f.device_id = d.id AND f.relative_path = ?
    WHERE d.user_id = ? AND d.status = 'connected' AND d.clients_root_path IS NOT NULL
      AND (d.actor_user_id = ? ${ownerFallback})
    ORDER BY CASE WHEN f.id IS NOT NULL THEN 0 ELSE 1 END, COALESCE(d.last_seen_at, d.created_at) DESC LIMIT 1`,
  [relativePath, workspaceId, actorId])
}

function publicClient(row) {
  const storedCode = asText(row.code)
  return {
    id: asText(row.id), code: storedCode.startsWith('SEM-CODIGO-') ? '' : storedCode,
    legalName: asText(row.legalName || row.legal_name), cnpj: asText(row.cnpj), createdAt: asText(row.createdAt || row.created_at),
  }
}

function publicStructure(row) {
  return {
    id: asText(row.id), name: asText(row.name), mode: asText(row.mode), rootPath: asText(row.root_path),
    folderCount: asNumber(row.folder_count), deviceId: row.device_id ? asText(row.device_id) : null,
    scannedAt: row.scanned_at ? asText(row.scanned_at) : null, updatedAt: asText(row.updated_at),
  }
}

function publicPendingFile(row) {
  let resolution = {}
  try { resolution = JSON.parse(asText(row.resolution) || '{}') } catch { resolution = {} }
  return {
    id: asText(row.id), deviceId: asText(row.device_id), fileName: asText(row.file_name), relativePath: asText(row.relative_path),
    reason: asText(row.reason), detectedClientId: row.detected_client_id ? asText(row.detected_client_id) : null,
    detectedCnpj: asText(row.detected_cnpj), detectedCompetence: asText(row.detected_competence), status: asText(row.status),
    resolution, destinationPath: asText(row.destination_path), createdAt: asText(row.created_at), resolvedAt: row.resolved_at ? asText(row.resolved_at) : null,
  }
}

async function requireDeviceAuth(req, res, next) {
  const token = req.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ error: 'Autenticação do computador necessária.' })
  try {
    const payload = jwt.verify(token, jwtSecret)
    if (payload.scope !== 'organizza:device' || typeof payload.deviceId !== 'string') return res.status(401).json({ error: 'Credencial de computador inválida.' })
    const device = await one('SELECT * FROM organiza_devices WHERE id = ? AND user_id = ?', [payload.deviceId, payload.sub])
    const user = device ? await one('SELECT * FROM users WHERE id = ?', [payload.sub]) : null
    if (!device || !user || asText(device.status) === 'revoked' || asText(user.account_status) !== 'active') return res.status(401).json({ error: 'Este computador não possui acesso ativo.' })
    req.device = device
    req.user = user
    next()
  } catch { return res.status(401).json({ error: 'Credencial de computador expirada ou inválida.' }) }
}

app.get('/api/health', (_req, res) => res.json({ ok: true }))

app.post('/api/auth/register', async (req, res, next) => {
  try {
    const { name, email, company, password } = req.body || {}
    if (![name, email, company, password].every((value) => typeof value === 'string' && value.trim())) return res.status(400).json({ error: 'Preencha nome, e-mail, empresa e senha.' })
    if (password.length < 8) return res.status(400).json({ error: 'A senha deve ter pelo menos 8 caracteres.' })
    const firstUser = asNumber((await one('SELECT COUNT(*) AS total FROM users')).total) === 0
    const user = { id: id(), name: name.trim(), email: email.trim().toLowerCase(), company: company.trim(), passwordHash: await bcrypt.hash(password, 12), role: firstUser ? 'admin' : 'user', accountStatus: firstUser ? 'active' : 'pending_payment', paymentStatus: firstUser ? 'not_required' : 'pending' }
    try {
      await db.execute({ sql: 'INSERT INTO users (id, name, email, company, password_hash, role, account_status, payment_status, approved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', args: [user.id, user.name, user.email, user.company, user.passwordHash, user.role, user.accountStatus, user.paymentStatus, firstUser ? now() : null] })
    } catch (error) {
      if (/unique/i.test(String(error))) return res.status(409).json({ error: 'Já existe uma conta para este e-mail.' })
      throw error
    }
    await logEvent({ userId: user.id, eventType: 'user.registered', status: 'success', message: `${user.name} realizou o cadastro.`, metadata: { firstUser } })
    res.status(201).json({ user: publicUser(await one('SELECT * FROM users WHERE id = ?', [user.id])), firstUser })
  } catch (error) { next(error) }
})

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {}
    const user = typeof email === 'string' ? await one('SELECT * FROM users WHERE email = ?', [email.trim().toLowerCase()]) : null
    if (!user || typeof password !== 'string' || !(await bcrypt.compare(password, asText(user.password_hash)))) return res.status(401).json({ error: 'E-mail ou senha inválidos.' })
    if (asText(user.account_status) !== 'active') return res.status(403).json({ error: 'Seu cadastro ainda aguarda pagamento ou aprovação administrativa.', status: asText(user.account_status) })
    const token = jwt.sign({ role: asText(user.role) }, jwtSecret, { subject: asText(user.id), expiresIn: '8h' })
    await logEvent({ userId: asText(user.id), eventType: 'user.login', status: 'success', message: `${asText(user.name)} entrou na plataforma.` })
    res.json({ token, user: publicUser(user) })
  } catch (error) { next(error) }
})

app.get('/api/auth/me', requireAuth, (req, res) => res.json({ user: publicUser({ ...req.user, id: req.user.actor_id || req.user.id }) }))

app.get('/api/organizza/workspace/users', requireAuth, requireOrganizzaOwner, async (req, res, next) => {
  try {
    if (asText(req.user.actor_id) !== asText(req.user.workspace_owner_id)) return res.status(403).json({ error: 'Somente o administrador principal pode gerenciar usuários.' })
    const rows = await many(`SELECT id, name, email, role, account_status, created_at FROM users
      WHERE id = ? OR workspace_owner_id = ? ORDER BY name`, [asText(req.user.workspace_owner_id), asText(req.user.workspace_owner_id)])
    res.json({ users: rows.map((row) => ({ id: asText(row.id), name: asText(row.name), email: asText(row.email), role: asText(row.role), active: asText(row.account_status) === 'active', createdAt: asText(row.created_at) })) })
  } catch (error) { next(error) }
})

app.post('/api/organizza/workspace/users', requireAuth, requireOrganizzaOwner, async (req, res, next) => {
  try {
    if (asText(req.user.actor_id) !== asText(req.user.workspace_owner_id)) return res.status(403).json({ error: 'Somente o administrador principal pode cadastrar usuários.' })
    const name = asText(req.body?.name).trim().slice(0, 120)
    const email = asText(req.body?.email).trim().toLowerCase().slice(0, 200)
    const password = asText(req.body?.password)
    if (!name || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Informe nome e e-mail válidos.' })
    if (password.length < 8) return res.status(400).json({ error: 'A senha deve ter pelo menos 8 caracteres.' })
    const userId = id()
    try {
      await db.execute({ sql: `INSERT INTO users (id, name, email, company, password_hash, role, account_status, payment_status, approved_by, approved_at, workspace_owner_id)
        VALUES (?, ?, ?, ?, ?, 'user', 'active', 'not_required', ?, ?, ?)`, args: [userId, name, email, asText(req.user.company), await bcrypt.hash(password, 12), asText(req.user.actor_id), now(), asText(req.user.workspace_owner_id)] })
    } catch (error) {
      if (/unique/i.test(String(error))) return res.status(409).json({ error: 'Já existe uma conta para este e-mail.' })
      throw error
    }
    res.status(201).json({ user: { id: userId, name, email, role: 'user', active: true, createdAt: now() } })
  } catch (error) { next(error) }
})

app.patch('/api/organizza/workspace/users/:id', requireAuth, requireOrganizzaOwner, async (req, res, next) => {
  try {
    if (asText(req.user.actor_id) !== asText(req.user.workspace_owner_id)) return res.status(403).json({ error: 'Somente o administrador principal pode alterar usuários.' })
    const member = await one('SELECT id FROM users WHERE id = ? AND workspace_owner_id = ?', [req.params.id, asText(req.user.workspace_owner_id)])
    if (!member) return res.status(404).json({ error: 'Usuário não encontrado neste escritório.' })
    const active = req.body?.active === true
    await db.execute({ sql: 'UPDATE users SET account_status = ?, updated_at = ? WHERE id = ?', args: [active ? 'active' : 'suspended', now(), req.params.id] })
    res.json({ ok: true, active })
  } catch (error) { next(error) }
})

app.get('/api/organizza/overview', requireAuth, async (req, res, next) => {
  try {
    const userId = asText(req.user.id)
    const [clients, devices, files, movements, latestEvent] = await Promise.all([
      one('SELECT COUNT(*) AS total FROM organiza_clients WHERE user_id = ?', [userId]),
      one("SELECT COUNT(*) AS total FROM organiza_devices WHERE user_id = ? AND status != 'revoked'", [userId]),
      one('SELECT COUNT(*) AS total FROM organiza_file_index WHERE user_id = ?', [userId]),
      one("SELECT COUNT(*) AS total FROM organiza_events WHERE user_id = ? AND date(created_at) = date('now')", [userId]),
      one('SELECT event_type AS eventType, status, message, created_at AS createdAt FROM organiza_events WHERE user_id = ? ORDER BY created_at DESC LIMIT 1', [userId]),
    ])
    res.json({
      clients: asNumber(clients.total), devices: asNumber(devices.total), files: asNumber(files.total), movementsToday: asNumber(movements.total),
      latestEvent: latestEvent ? { eventType: asText(latestEvent.eventType), status: asText(latestEvent.status), message: asText(latestEvent.message), createdAt: asText(latestEvent.createdAt) } : null,
    })
  } catch (error) { next(error) }
})

app.get('/api/organizza/admin/api-usage', requireAuth, requireOrganizzaOwner, async (_req, res, next) => {
  try {
    const [totals, monthly, users, daily, billing] = await Promise.all([
      one(`SELECT COUNT(*) AS requests, COALESCE(SUM(input_tokens), 0) AS inputTokens, COALESCE(SUM(output_tokens), 0) AS outputTokens,
        COALESCE(SUM(input_tokens + output_tokens), 0) AS totalTokens FROM token_usage WHERE agent_id = 'izza'`),
      one(`SELECT COUNT(*) AS requests, COALESCE(SUM(input_tokens), 0) AS inputTokens, COALESCE(SUM(output_tokens), 0) AS outputTokens,
        COALESCE(SUM(input_tokens + output_tokens), 0) AS totalTokens FROM token_usage WHERE agent_id = 'izza' AND created_at >= datetime('now', 'start of month')`),
      many(`SELECT u.id AS userId, u.name, u.email, COUNT(t.id) AS requests,
        COALESCE(SUM(t.input_tokens), 0) AS inputTokens, COALESCE(SUM(t.output_tokens), 0) AS outputTokens,
        COALESCE(SUM(t.input_tokens + t.output_tokens), 0) AS totalTokens, MAX(t.created_at) AS lastUsedAt
        FROM users u LEFT JOIN token_usage t ON t.user_id = u.id AND t.agent_id = 'izza'
        GROUP BY u.id, u.name, u.email ORDER BY totalTokens DESC, u.name ASC`),
      many(`SELECT date(created_at) AS day, COUNT(*) AS requests, COALESCE(SUM(input_tokens), 0) AS inputTokens,
        COALESCE(SUM(output_tokens), 0) AS outputTokens FROM token_usage
        WHERE agent_id = 'izza' AND created_at >= datetime('now', '-29 days') GROUP BY date(created_at) ORDER BY day ASC`),
      loadOpenAIOrganizationUsage().catch((error) => ({ available: false, message: 'Não foi possível consultar o faturamento oficial da OpenAI.', detail: asText(error?.message).slice(0, 300) })),
    ])
    const normalizeUsage = (row) => ({ requests: asNumber(row?.requests), inputTokens: asNumber(row?.inputTokens), outputTokens: asNumber(row?.outputTokens), totalTokens: asNumber(row?.totalTokens) })
    res.json({
      totals: normalizeUsage(totals), monthly: normalizeUsage(monthly),
      users: users.map((row) => ({ userId: asText(row.userId), name: asText(row.name), email: asText(row.email), ...normalizeUsage(row), lastUsedAt: asText(row.lastUsedAt) })),
      daily: daily.map((row) => ({ day: asText(row.day), requests: asNumber(row.requests), inputTokens: asNumber(row.inputTokens), outputTokens: asNumber(row.outputTokens), totalTokens: asNumber(row.inputTokens) + asNumber(row.outputTokens) })),
      billing,
    })
  } catch (error) { next(error) }
})

app.get('/api/organizza/devices', requireAuth, async (req, res, next) => {
  try {
    const devices = await many('SELECT * FROM organiza_devices WHERE user_id = ? ORDER BY COALESCE(last_seen_at, created_at) DESC', [asText(req.user.id)])
    res.json({ devices: devices.map(publicDevice) })
  } catch (error) { next(error) }
})

app.get('/api/organizza/clients', requireAuth, async (req, res, next) => {
  try {
    const clients = await many('SELECT id, code, legal_name AS legalName, cnpj, created_at AS createdAt FROM organiza_clients WHERE user_id = ? ORDER BY code ASC', [asText(req.user.id)])
    res.json({ clients: clients.map(publicClient) })
  } catch (error) { next(error) }
})

app.post('/api/organizza/clients', requireAuth, async (req, res, next) => {
  try {
    const requestedCode = typeof req.body?.code === 'string' ? req.body.code.trim().slice(0, 60) : ''
    const legalName = typeof req.body?.legalName === 'string' ? normalizeClientName(req.body.legalName).slice(0, 300) : ''
    const cnpj = typeof req.body?.cnpj === 'string' ? req.body.cnpj.replace(/\D/g, '').slice(0, 14) : ''
    if (!legalName || cnpj.length !== 14) return res.status(400).json({ error: 'Informe a razão social e um CNPJ com 14 dígitos.' })
    const userId = asText(req.user.id)
    const duplicatedCnpj = await one('SELECT id FROM organiza_clients WHERE user_id = ? AND cnpj = ? LIMIT 1', [userId, cnpj])
    if (duplicatedCnpj) return res.status(409).json({ error: 'Já existe um cliente cadastrado com este CNPJ.' })
    const clientId = id()
    const code = requestedCode || `SEM-CODIGO-${clientId.slice(0, 8).toUpperCase()}`
    const duplicateCode = await one('SELECT id FROM organiza_clients WHERE user_id = ? AND code = ? LIMIT 1', [userId, code])
    if (duplicateCode) return res.status(409).json({ error: 'Já existe um cliente cadastrado com este código.' })
    await db.execute({ sql: 'INSERT INTO organiza_clients (id, user_id, code, legal_name, cnpj, updated_at) VALUES (?, ?, ?, ?, ?, ?)', args: [clientId, userId, code, legalName, cnpj, now()] })
    const devices = await many("SELECT id FROM organiza_devices WHERE user_id = ? AND status = 'connected'", [userId])
    if (devices.length) await db.batch(devices.map((device) => ({ sql: 'INSERT INTO organiza_commands (id, user_id, device_id, command_type, payload) VALUES (?, ?, ?, ?, ?)', args: [id(), userId, asText(device.id), 'structure.refresh', JSON.stringify({ clientId })] })), 'write')
    await db.execute({ sql: 'INSERT INTO organiza_events (id, user_id, event_type, status, message, metadata) VALUES (?, ?, ?, ?, ?, ?)', args: [id(), userId, 'clients.created', 'success', `${legalName} foi cadastrado manualmente.`, JSON.stringify({ clientId, code: requestedCode || null, cnpj })] })
    res.status(201).json({ client: publicClient(await one('SELECT id, code, legal_name AS legalName, cnpj, created_at AS createdAt FROM organiza_clients WHERE id = ?', [clientId])), refreshRequested: devices.length > 0 })
  } catch (error) { next(error) }
})

app.post('/api/organizza/clients/import', requireAuth, async (req, res, next) => {
  try {
    const source = Array.isArray(req.body?.clients) ? req.body.clients : []
    if (!source.length) return res.status(400).json({ error: 'Selecione uma planilha com pelo menos um cliente.' })
    if (source.length > 2_000) return res.status(400).json({ error: 'A importação aceita até 2.000 clientes por vez.' })
    const seenCodes = new Set()
    const clients = source.map((raw, index) => {
      const code = typeof raw?.code === 'string' ? raw.code.trim().slice(0, 60) : ''
      const legalName = typeof raw?.legalName === 'string' ? normalizeClientName(raw.legalName).slice(0, 300) : ''
      const cnpj = typeof raw?.cnpj === 'string' ? raw.cnpj.replace(/\D/g, '').slice(0, 14) : ''
      if (!code || !legalName) throw new Error(`Linha ${index + 2}: informe código e razão social.`)
      if (seenCodes.has(code.toLocaleLowerCase())) throw new Error(`O código ${code} está repetido na planilha.`)
      seenCodes.add(code.toLocaleLowerCase())
      return { code, legalName, cnpj }
    })
    const userId = asText(req.user.id)
    await db.batch(clients.map((client) => ({ sql: `INSERT INTO organiza_clients (id, user_id, code, legal_name, cnpj, updated_at)
      VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, code) DO UPDATE SET legal_name = excluded.legal_name, cnpj = excluded.cnpj, updated_at = excluded.updated_at`, args: [id(), userId, client.code, client.legalName, client.cnpj, now()] })), 'write')
    await db.execute({ sql: 'INSERT INTO organiza_events (id, user_id, event_type, status, message, metadata) VALUES (?, ?, ?, ?, ?, ?)', args: [id(), userId, 'clients.imported', 'success', `${clients.length} cliente(s) importado(s) para o Organizza.`, JSON.stringify({ count: clients.length })] })
    res.status(201).json({ imported: clients.length })
  } catch (error) {
    if (error instanceof Error && (/^Linha /.test(error.message) || /repetido/.test(error.message))) return res.status(400).json({ error: error.message })
    next(error)
  }
})

async function clientDeletionImpact(userId, clientIds) {
  const placeholders = clientIds.map(() => '?').join(', ')
  const args = [userId, ...clientIds]
  const [clients, indexedFiles, pendingFiles, mappedFolders] = await Promise.all([
    one(`SELECT COUNT(*) AS total FROM organiza_clients WHERE user_id = ? AND id IN (${placeholders})`, args),
    one(`SELECT COUNT(*) AS total FROM organiza_file_index WHERE user_id = ? AND client_id IN (${placeholders})`, args),
    one(`SELECT COUNT(*) AS total FROM organiza_pending_files WHERE user_id = ? AND detected_client_id IN (${placeholders}) AND status != 'resolved'`, args),
    one(`SELECT COUNT(*) AS total FROM organiza_folder_nodes n JOIN organiza_folder_structures s ON s.id = n.structure_id WHERE s.user_id = ? AND n.client_id IN (${placeholders})`, args),
  ])
  return { clients: asNumber(clients?.total), impacts: { indexedFiles: asNumber(indexedFiles?.total), pendingFiles: asNumber(pendingFiles?.total), mappedFolders: asNumber(mappedFolders?.total) } }
}

function requestedClientIds(req) {
  return [...new Set((Array.isArray(req.body?.clientIds) ? req.body.clientIds : []).filter((value) => typeof value === 'string' && value).slice(0, 2000))]
}

app.post('/api/organizza/clients/deletion-preview', requireAuth, async (req, res, next) => {
  try {
    const clientIds = requestedClientIds(req)
    if (!clientIds.length) return res.status(400).json({ error: 'Selecione ao menos uma empresa para excluir.' })
    res.json(await clientDeletionImpact(asText(req.user.id), clientIds))
  } catch (error) { next(error) }
})

app.delete('/api/organizza/clients', requireAuth, async (req, res, next) => {
  try {
    const userId = asText(req.user.id)
    const clientIds = requestedClientIds(req)
    if (!clientIds.length) return res.status(400).json({ error: 'Selecione ao menos uma empresa para excluir.' })
    const impact = await clientDeletionImpact(userId, clientIds)
    if (!impact.clients) return res.status(404).json({ error: 'As empresas selecionadas não foram encontradas.' })
    if (req.body?.confirmed !== true) return res.status(409).json({ error: 'Confirme a exclusão depois de revisar os vínculos.', requiresConfirmation: true, ...impact })
    const placeholders = clientIds.map(() => '?').join(', ')
    const relationArgs = [userId, ...clientIds]
    await db.batch([
      { sql: `UPDATE organiza_file_index SET client_id = NULL WHERE user_id = ? AND client_id IN (${placeholders})`, args: relationArgs },
      { sql: `UPDATE organiza_pending_files SET detected_client_id = NULL, updated_at = ? WHERE user_id = ? AND detected_client_id IN (${placeholders})`, args: [now(), ...relationArgs] },
      { sql: `UPDATE organiza_folder_nodes SET client_id = NULL WHERE id IN (SELECT n.id FROM organiza_folder_nodes n JOIN organiza_folder_structures s ON s.id = n.structure_id WHERE s.user_id = ? AND n.client_id IN (${placeholders}))`, args: relationArgs },
      { sql: `DELETE FROM organiza_clients WHERE user_id = ? AND id IN (${placeholders})`, args: relationArgs },
      { sql: 'INSERT INTO organiza_events (id, user_id, event_type, status, message, metadata) VALUES (?, ?, ?, ?, ?, ?)', args: [id(), userId, 'clients.deleted', 'warning', `${impact.clients} empresa(s) excluída(s) do Organizza.`, JSON.stringify({ clientIds, impacts: impact.impacts })] },
    ], 'write')
    await auditOrganizza(req, { action: 'organizza.clients.delete', status: 'completed', message: `${impact.clients} empresa(s) excluída(s).`, metadata: { clientIds, impacts: impact.impacts } })
    res.json({ deleted: impact.clients, impacts: impact.impacts })
  } catch (error) { next(error) }
})

app.get('/api/organizza/structures', requireAuth, async (req, res, next) => {
  try {
    const structures = await many('SELECT * FROM organiza_folder_structures WHERE user_id = ? ORDER BY updated_at DESC LIMIT 20', [asText(req.user.id)])
    const selected = structures[0]
    const nodes = selected ? await many('SELECT client_id AS clientId, relative_path AS relativePath, parent_path AS parentPath, folder_name AS folderName, depth FROM organiza_folder_nodes WHERE structure_id = ? ORDER BY depth, relative_path LIMIT 5000', [asText(selected.id)]) : []
    res.json({ structures: structures.map(publicStructure), activeStructure: selected ? { ...publicStructure(selected), nodes: nodes.map((node) => ({ clientId: node.clientId ? asText(node.clientId) : null, relativePath: asText(node.relativePath), parentPath: asText(node.parentPath), folderName: asText(node.folderName), depth: asNumber(node.depth) })) } : null })
  } catch (error) { next(error) }
})

app.post('/api/organizza/structures/sync', requireDeviceAuth, async (req, res, next) => {
  const startedAt = Date.now()
  try {
    const mode = req.body?.mode
    const rootPath = typeof req.body?.rootPath === 'string' ? req.body.rootPath.trim().slice(0, 1000) : ''
    const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 120) : 'Estrutura de pastas'
    const rawNodes = Array.isArray(req.body?.nodes) ? req.body.nodes.slice(0, 5000) : []
    if (!['existing', 'standard', 'custom'].includes(mode) || !rootPath) return res.status(400).json({ error: 'Informe o modo e a pasta raiz da estrutura.' })
    const userId = asText(req.user.id)
    let registeredClients = await many('SELECT id, code, legal_name AS legalName FROM organiza_clients WHERE user_id = ?', [userId])
    if (mode === 'existing') {
      const discovered = rawNodes.filter((node) => Number(node?.depth) === 1).map((node) => {
        const match = asText(node?.folderName).trim().match(/^([A-Za-z0-9]+)\s*-\s*(.+)$/)
        return match ? { code: match[1].trim().slice(0, 60), legalName: match[2].trim().slice(0, 300) } : null
      }).filter(Boolean)
      const missing = discovered.filter((candidate, index) => discovered.findIndex((item) => comparableClientCode(item.code) === comparableClientCode(candidate.code)) === index)
        .filter((candidate) => !registeredClients.some((client) => comparableClientCode(client.code) === comparableClientCode(candidate.code)))
      if (missing.length) {
        await db.batch(missing.map((client) => ({ sql: 'INSERT INTO organiza_clients (id, user_id, code, legal_name, cnpj, updated_at) VALUES (?, ?, ?, ?, ?, ?)', args: [id(), userId, client.code, client.legalName, '', now()] })), 'write')
        registeredClients = await many('SELECT id, code, legal_name AS legalName FROM organiza_clients WHERE user_id = ?', [userId])
      }
    }
    const clientIds = new Set(registeredClients.map((client) => asText(client.id)))
    const clientByTopFolder = new Map(rawNodes.filter((node) => Number(node?.depth) === 1).map((node) => {
      const match = asText(node?.folderName).trim().match(/^([A-Za-z0-9]+)\s*-\s*(.+)$/)
      const client = match ? registeredClients.find((item) => comparableClientCode(item.code) === comparableClientCode(match[1])) : null
      return [safeRelativePath(node?.relativePath).split('/')[0], client ? asText(client.id) : null]
    }))
    const receivedNodes = rawNodes.map((raw) => {
      const relativePath = typeof raw?.relativePath === 'string' ? raw.relativePath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').slice(0, 1000) : ''
      const parentPath = typeof raw?.parentPath === 'string' ? raw.parentPath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').slice(0, 1000) : ''
      const folderName = typeof raw?.folderName === 'string' ? raw.folderName.trim().slice(0, 240) : ''
      const depth = Number(raw?.depth)
      const topFolder = relativePath.split('/')[0]
      const clientId = typeof raw?.clientId === 'string' && clientIds.has(raw.clientId) ? raw.clientId : clientByTopFolder.get(topFolder) || null
      if (!relativePath || !folderName || !Number.isInteger(depth) || depth < 1 || relativePath.split('/').some((part) => !part || part === '.' || part === '..')) throw new Error('A árvore de pastas recebida é inválida.')
      return { relativePath, parentPath, folderName, depth, clientId }
    })
    const nodes = [...new Map(receivedNodes.map((node) => [node.relativePath, node])).values()]
    const deviceId = asText(req.device.id)
    let structure = await one('SELECT * FROM organiza_folder_structures WHERE user_id = ? AND device_id = ? AND root_path = ? ORDER BY updated_at DESC LIMIT 1', [userId, deviceId, rootPath])
    if (!structure) {
      const structureId = id()
      await db.execute({ sql: 'INSERT INTO organiza_folder_structures (id, user_id, device_id, name, mode, root_path, folder_count, scanned_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', args: [structureId, userId, deviceId, name || 'Estrutura de pastas', mode, rootPath, nodes.length, now(), now()] })
      structure = await one('SELECT * FROM organiza_folder_structures WHERE id = ?', [structureId])
    } else {
      await db.execute({ sql: 'UPDATE organiza_folder_structures SET name = ?, mode = ?, folder_count = ?, scanned_at = ?, updated_at = ? WHERE id = ?', args: [name || asText(structure.name), mode, nodes.length, now(), now(), asText(structure.id)] })
      await db.execute({ sql: 'DELETE FROM organiza_folder_nodes WHERE structure_id = ?', args: [asText(structure.id)] })
      structure = await one('SELECT * FROM organiza_folder_structures WHERE id = ?', [asText(structure.id)])
    }
    for (let start = 0; start < nodes.length; start += 250) {
      await db.batch(nodes.slice(start, start + 250).map((node) => ({ sql: 'INSERT INTO organiza_folder_nodes (id, structure_id, client_id, relative_path, parent_path, folder_name, depth) VALUES (?, ?, ?, ?, ?, ?, ?)', args: [id(), asText(structure.id), node.clientId, node.relativePath, node.parentPath, node.folderName, node.depth] })), 'write')
    }
    await db.execute({ sql: "UPDATE organiza_devices SET structure_mode = ?, clients_root_path = ?, updated_at = ? WHERE id = ?", args: [mode, rootPath, now(), deviceId] })
    await db.execute({ sql: 'INSERT INTO organiza_events (id, user_id, device_id, event_type, status, message, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)', args: [id(), userId, deviceId, 'structure.scanned', 'success', `${nodes.length} pasta(s) da estrutura foram registradas sem leitura de arquivos.`, JSON.stringify({ structureId: asText(structure.id), mode, folderCount: nodes.length })] })
    console.log(JSON.stringify({ level: 'info', event: 'organizza.structure.sync', mode, folders: nodes.length, durationMs: Date.now() - startedAt, requestId: asText(req.get('x-vercel-id')) }))
    res.status(201).json({ structure: publicStructure(structure), discoveredClients: registeredClients.length })
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', event: 'organizza.structure.sync_failed', durationMs: Date.now() - startedAt, requestId: asText(req.get('x-vercel-id')), error: error instanceof Error ? error.message : String(error) }))
    next(error)
  }
})

app.get('/api/organizza/rules', requireAuth, async (req, res, next) => {
  try {
    const rules = await many('SELECT * FROM organiza_rules WHERE user_id = ? ORDER BY created_at DESC', [asText(req.user.id)])
    res.json({ rules: rules.map(publicRule) })
  } catch (error) { next(error) }
})

app.get('/api/organizza/notifications', requireAuth, requireOrganizzaOwner, async (req, res, next) => {
  try {
    const userId = asText(req.user.id)
    await ensureNotificationSchedule(userId)
    const notifications = await many('SELECT * FROM organiza_notification_schedule WHERE user_id = ? ORDER BY day_of_month, sector, created_at', [userId])
    res.json({ notifications: notifications.map(publicNotification) })
  } catch (error) { next(error) }
})

app.post('/api/organizza/notifications', requireAuth, requireOrganizzaOwner, async (req, res, next) => {
  try {
    const userId = asText(req.user.id)
    await ensureNotificationSchedule(userId)
    const day = Number(req.body?.day)
    const sector = asText(req.body?.sector).trim().slice(0, 60)
    const message = asText(req.body?.message).trim().slice(0, 500)
    const times = [...new Set((Array.isArray(req.body?.times) ? req.body.times : []).map(asText).filter((time) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)))].sort()
    if (!Number.isInteger(day) || day < 1 || day > 31 || !sector || !message || !times.length) return res.status(400).json({ error: 'Informe dia, setor, mensagem e ao menos um horário válido.' })
    const notificationId = id()
    await db.execute({ sql: 'INSERT INTO organiza_notification_schedule (id, user_id, day_of_month, sector, message, times, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', args: [notificationId, userId, day, sector, message, JSON.stringify(times), now()] })
    res.status(201).json({ notification: publicNotification(await one('SELECT * FROM organiza_notification_schedule WHERE id = ?', [notificationId])) })
  } catch (error) { next(error) }
})

app.patch('/api/organizza/notifications/:id', requireAuth, requireOrganizzaOwner, async (req, res, next) => {
  try {
    const userId = asText(req.user.id)
    const current = await one('SELECT * FROM organiza_notification_schedule WHERE id = ? AND user_id = ?', [req.params.id, userId])
    if (!current) return res.status(404).json({ error: 'Notificação não encontrada.' })
    const day = Number(req.body?.day)
    const sector = asText(req.body?.sector).trim().slice(0, 60)
    const message = asText(req.body?.message).trim().slice(0, 500)
    const times = [...new Set((Array.isArray(req.body?.times) ? req.body.times : []).map(asText).filter((time) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)))].sort()
    const active = req.body?.active !== false
    if (!Number.isInteger(day) || day < 1 || day > 31 || !sector || !message || !times.length) return res.status(400).json({ error: 'Informe dia, setor, mensagem e ao menos um horário válido.' })
    await db.execute({ sql: 'UPDATE organiza_notification_schedule SET day_of_month = ?, sector = ?, message = ?, times = ?, active = ?, updated_at = ? WHERE id = ? AND user_id = ?', args: [day, sector, message, JSON.stringify(times), active ? 1 : 0, now(), req.params.id, userId] })
    res.json({ notification: publicNotification(await one('SELECT * FROM organiza_notification_schedule WHERE id = ?', [req.params.id])) })
  } catch (error) { next(error) }
})

app.delete('/api/organizza/notifications/:id', requireAuth, requireOrganizzaOwner, async (req, res, next) => {
  try {
    const result = await db.execute({ sql: 'DELETE FROM organiza_notification_schedule WHERE id = ? AND user_id = ?', args: [req.params.id, asText(req.user.id)] })
    if (!asNumber(result.rowsAffected)) return res.status(404).json({ error: 'Notificação não encontrada.' })
    res.json({ ok: true })
  } catch (error) { next(error) }
})

app.post('/api/organizza/rules', requireAuth, async (req, res, next) => {
  try {
    const { name, department } = req.body || {}
    const destinationPath = typeof req.body?.destinationPath === 'string' ? req.body.destinationPath.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').slice(0, 600) : ''
    const rawTerms = Array.isArray(req.body?.terms) ? req.body.terms : asText(req.body?.terms).split(',')
    const terms = [...new Set(rawTerms.map(normalizeRuleTerm).filter(Boolean))].slice(0, 12)
    if (typeof name !== 'string' || !name.trim() || !['contabil', 'fiscal', 'pessoal', 'juridico'].includes(department) || !terms.length) {
      return res.status(400).json({ error: 'Informe um nome, ao menos um termo e um departamento válido.' })
    }
    if (destinationPath.split('/').some((segment) => segment === '..')) return res.status(400).json({ error: 'O destino relativo não pode conter ..' })
    const rule = { id: id(), userId: asText(req.user.id), name: name.trim().slice(0, 120), terms, department, destinationPath }
    await db.execute({ sql: 'INSERT INTO organiza_rules (id, user_id, name, terms, department, destination_path, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', args: [rule.id, rule.userId, rule.name, JSON.stringify(rule.terms), rule.department, rule.destinationPath, now()] })
    await db.execute({ sql: 'INSERT INTO organiza_events (id, user_id, event_type, status, message, metadata) VALUES (?, ?, ?, ?, ?, ?)', args: [id(), rule.userId, 'rules.created', 'success', `Regra "${rule.name}" criada para o Organizza.`, JSON.stringify({ ruleId: rule.id, department: rule.department, terms: rule.terms })] })
    res.status(201).json({ rule: publicRule(await one('SELECT * FROM organiza_rules WHERE id = ?', [rule.id])) })
  } catch (error) { next(error) }
})

app.delete('/api/organizza/rules/:id', requireAuth, async (req, res, next) => {
  try {
    const rule = await one('SELECT * FROM organiza_rules WHERE id = ? AND user_id = ?', [req.params.id, asText(req.user.id)])
    if (!rule) return res.status(404).json({ error: 'Regra não encontrada.' })
    await db.execute({ sql: 'DELETE FROM organiza_rules WHERE id = ?', args: [asText(rule.id)] })
    res.json({ ok: true })
  } catch (error) { next(error) }
})

app.get('/api/organizza/pending-files', requireAuth, async (req, res, next) => {
  try {
    const rows = await many("SELECT * FROM organiza_pending_files WHERE user_id = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 100", [asText(req.user.id)])
    res.json({ pendingFiles: rows.map(publicPendingFile) })
  } catch (error) { next(error) }
})

app.delete('/api/organizza/pending-files/:id', requireAuth, async (req, res, next) => {
  try {
    const pending = await one("SELECT * FROM organiza_pending_files WHERE id = ? AND user_id = ? AND status = 'pending'", [req.params.id, asText(req.user.id)])
    if (!pending) return res.status(404).json({ error: 'A pendência não existe mais ou já está sendo processada.' })
    await db.batch([
      { sql: 'DELETE FROM organiza_pending_files WHERE id = ?', args: [asText(pending.id)] },
      { sql: 'INSERT INTO organiza_events (id, user_id, device_id, event_type, status, message, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)', args: [id(), asText(req.user.id), asText(pending.device_id), 'file.pending_removed', 'info', `${asText(pending.file_name)} foi removido da fila de classificação.`, JSON.stringify({ pendingFileId: asText(pending.id), relativePath: asText(pending.relative_path), physicalFileDeleted: false })] },
    ], 'write')
    res.json({ ok: true })
  } catch (error) { next(error) }
})

app.post('/api/organizza/pending-files/:id/open', requireAuth, async (req, res, next) => {
  try {
    const pending = await one("SELECT * FROM organiza_pending_files WHERE id = ? AND user_id = ? AND status IN ('pending', 'resolution_requested')", [req.params.id, asText(req.user.id)])
    if (!pending) return res.status(404).json({ error: 'O documento pendente não está mais disponível.' })
    const commandId = id()
    await db.batch([
      { sql: 'INSERT INTO organiza_commands (id, user_id, device_id, command_type, payload) VALUES (?, ?, ?, ?, ?)', args: [commandId, asText(req.user.id), asText(pending.device_id), 'file.open_pending', JSON.stringify({ pendingFileId: asText(pending.id), fileName: asText(pending.file_name), relativePath: asText(pending.relative_path) })] },
      { sql: 'INSERT INTO organiza_events (id, user_id, device_id, event_type, status, message, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)', args: [id(), asText(req.user.id), asText(pending.device_id), 'file.pending_open_requested', 'info', `Abertura local solicitada para ${asText(pending.file_name)}.`, JSON.stringify({ pendingFileId: asText(pending.id), commandId })] },
    ], 'write')
    res.status(201).json({ command: { id: commandId } })
  } catch (error) { next(error) }
})

app.post('/api/organizza/pending-files', requireDeviceAuth, async (req, res, next) => {
  try {
    const fileName = typeof req.body?.fileName === 'string' ? req.body.fileName.trim().slice(0, 500) : ''
    const relativePath = typeof req.body?.relativePath === 'string' ? req.body.relativePath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').slice(0, 1000) : ''
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 1000) : ''
    const detectedClientId = typeof req.body?.detectedClientId === 'string' ? req.body.detectedClientId : null
    const detectedCnpj = typeof req.body?.detectedCnpj === 'string' ? req.body.detectedCnpj.replace(/\D/g, '').slice(0, 14) : ''
    const detectedCompetence = typeof req.body?.detectedCompetence === 'string' ? req.body.detectedCompetence.replace(/\D/g, '').slice(0, 6) : ''
    if (!fileName || !relativePath || !reason || relativePath.split('/').some((segment) => !segment || segment === '.' || segment === '..')) return res.status(400).json({ error: 'Dados do arquivo pendente são inválidos.' })
    const client = detectedClientId ? await one('SELECT id FROM organiza_clients WHERE id = ? AND user_id = ?', [detectedClientId, asText(req.user.id)]) : null
    const existing = await one("SELECT * FROM organiza_pending_files WHERE user_id = ? AND device_id = ? AND file_name = ? AND relative_path = ? AND status IN ('pending', 'resolution_requested') ORDER BY created_at DESC LIMIT 1", [asText(req.user.id), asText(req.device.id), fileName, relativePath])
    if (existing) return res.json({ pendingFile: publicPendingFile(existing), alreadyRegistered: true })
    const pendingId = id()
    await db.batch([
      { sql: 'INSERT INTO organiza_pending_files (id, user_id, device_id, file_name, relative_path, reason, detected_client_id, detected_cnpj, detected_competence, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', args: [pendingId, asText(req.user.id), asText(req.device.id), fileName, relativePath, reason, client ? asText(client.id) : null, detectedCnpj, detectedCompetence, now()] },
      { sql: 'INSERT INTO organiza_events (id, user_id, device_id, event_type, status, message, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)', args: [id(), asText(req.user.id), asText(req.device.id), 'file.awaiting_classification', 'warning', `${fileName} está aguardando classificação manual.`, JSON.stringify({ pendingFileId: pendingId, fileName, relativePath, reason })] },
    ], 'write')
    res.status(201).json({ pendingFile: publicPendingFile(await one('SELECT * FROM organiza_pending_files WHERE id = ?', [pendingId])) })
  } catch (error) { next(error) }
})

app.post('/api/organizza/pending-files/:id/resolve', requireAuth, async (req, res, next) => {
  try {
    const pending = await one("SELECT * FROM organiza_pending_files WHERE id = ? AND user_id = ? AND status = 'pending'", [req.params.id, asText(req.user.id)])
    if (!pending) return res.status(404).json({ error: 'Arquivo pendente não encontrado ou já está em tratamento.' })
    const clientId = typeof req.body?.clientId === 'string' ? req.body.clientId : ''
    const department = req.body?.department
    const competence = typeof req.body?.competence === 'string' ? req.body.competence.replace(/\D/g, '') : ''
    const archiveName = typeof req.body?.archiveName === 'string' ? req.body.archiveName.trim().replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ').replace(/\s+/g, ' ').slice(0, 180) : ''
    const destinationPath = typeof req.body?.destinationPath === 'string' ? req.body.destinationPath.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').slice(0, 600) : ''
    const createRule = Boolean(req.body?.createRule)
    const client = await one('SELECT id, code, legal_name AS legalName, cnpj FROM organiza_clients WHERE id = ? AND user_id = ?', [clientId, asText(req.user.id)])
    if (!client || !['contabil', 'fiscal', 'pessoal', 'juridico'].includes(department)) return res.status(400).json({ error: 'Informe um cliente e departamento válidos.' })
    if (department !== 'juridico' && !/^(0[1-9]|1[0-2])20\d{2}$/.test(competence)) return res.status(400).json({ error: 'Informe a competência no formato MMYYYY.' })
    if (destinationPath.split('/').some((segment) => segment === '..')) return res.status(400).json({ error: 'O destino não pode conter ..' })
    let createdRule = null
    if (createRule) {
      const ruleName = typeof req.body?.ruleName === 'string' ? req.body.ruleName.trim().slice(0, 120) : ''
      const rawTerms = Array.isArray(req.body?.terms) ? req.body.terms : asText(req.body?.terms).split(',')
      const terms = [...new Set(rawTerms.map(normalizeRuleTerm).filter(Boolean))].slice(0, 12)
      if (!ruleName || !terms.length) return res.status(400).json({ error: 'Para cadastrar um padrão, informe o nome e ao menos um termo.' })
      createdRule = { id: id(), name: ruleName, terms, department, destinationPath }
      await db.execute({ sql: 'INSERT INTO organiza_rules (id, user_id, name, terms, department, destination_path, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', args: [createdRule.id, asText(req.user.id), createdRule.name, JSON.stringify(createdRule.terms), createdRule.department, createdRule.destinationPath, now()] })
    }
    const commandId = id()
    const resolution = { clientId: asText(client.id), department, competence, archiveName, destinationPath, createRule: Boolean(createdRule), ruleId: createdRule?.id || null }
    await db.batch([
      { sql: 'UPDATE organiza_pending_files SET status = ?, resolution = ?, updated_at = ? WHERE id = ?', args: ['resolution_requested', JSON.stringify(resolution), now(), asText(pending.id)] },
      { sql: 'INSERT INTO organiza_commands (id, user_id, device_id, command_type, payload) VALUES (?, ?, ?, ?, ?)', args: [commandId, asText(req.user.id), asText(pending.device_id), 'file.resolve', JSON.stringify({ pendingFileId: asText(pending.id), fileName: asText(pending.file_name), archiveName, client: { id: asText(client.id), code: asText(client.code), legalName: asText(client.legalName), cnpj: asText(client.cnpj) }, department, competence, destinationPath })] },
      { sql: 'INSERT INTO organiza_events (id, user_id, device_id, event_type, status, message, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)', args: [id(), asText(req.user.id), asText(pending.device_id), 'file.manual_resolution_requested', 'info', `Classificação manual solicitada para ${asText(pending.file_name)}.`, JSON.stringify({ pendingFileId: asText(pending.id), commandId, createRule: Boolean(createdRule) })] },
    ], 'write')
    res.status(201).json({ command: { id: commandId }, rule: createdRule ? publicRule(await one('SELECT * FROM organiza_rules WHERE id = ?', [createdRule.id])) : null })
  } catch (error) { next(error) }
})

app.patch('/api/organizza/pending-files/resolve-auto', requireDeviceAuth, async (req, res, next) => {
  try {
    const fileName = typeof req.body?.fileName === 'string' ? req.body.fileName.trim().slice(0, 500) : ''
    const destinationPath = typeof req.body?.destinationPath === 'string' ? req.body.destinationPath.trim().slice(0, 1000) : ''
    if (!fileName || !destinationPath) return res.status(400).json({ error: 'Informe o arquivo e o destino processado.' })
    const pending = await one("SELECT * FROM organiza_pending_files WHERE user_id = ? AND device_id = ? AND file_name = ? AND status IN ('pending', 'resolution_requested') ORDER BY created_at DESC LIMIT 1", [asText(req.user.id), asText(req.device.id), fileName])
    if (!pending) return res.json({ ok: true, pendingFile: null })
    await db.execute({ sql: "UPDATE organiza_pending_files SET status = 'resolved', destination_path = ?, resolved_at = ?, updated_at = ? WHERE id = ?", args: [destinationPath, now(), now(), asText(pending.id)] })
    res.json({ ok: true, pendingFile: publicPendingFile(await one('SELECT * FROM organiza_pending_files WHERE id = ?', [asText(pending.id)])) })
  } catch (error) { next(error) }
})

app.post('/api/organizza/file-index', requireDeviceAuth, async (req, res, next) => {
  try {
    const source = Array.isArray(req.body?.files) ? req.body.files.slice(0, 500) : []
    if (!source.length) return res.status(400).json({ error: 'Informe ao menos um arquivo para indexar.' })
    const userId = asText(req.user.id)
    const syncId = typeof req.body?.syncId === 'string' ? req.body.syncId.trim().slice(0, 80) : ''
    const knownClientIds = new Set((await many('SELECT id FROM organiza_clients WHERE user_id = ?', [userId])).map((client) => asText(client.id)))
    const files = source.map((raw) => {
      const fileName = typeof raw?.fileName === 'string' ? raw.fileName.trim().replace(/[\\/]/g, '').slice(0, 500) : ''
      const relativePath = safeRelativePath(raw?.relativePath)
      const clientId = typeof raw?.clientId === 'string' && knownClientIds.has(raw.clientId) ? raw.clientId : null
      const department = ['contabil', 'fiscal', 'pessoal', 'juridico'].includes(raw?.department) ? raw.department : null
      const competence = typeof raw?.competence === 'string' ? raw.competence.replace(/\D/g, '') : ''
      const competenceMonth = /^(0[1-9]|1[0-2])20\d{2}$/.test(competence) ? Number(competence.slice(0, 2)) : null
      const competenceYear = competenceMonth ? Number(competence.slice(2)) : null
      const documentType = typeof raw?.documentType === 'string' ? raw.documentType.trim().slice(0, 120) : ''
      const fileHash = typeof raw?.fileHash === 'string' ? raw.fileHash.trim().slice(0, 120) : ''
      const extractedData = raw?.extractedData && typeof raw.extractedData === 'object' ? JSON.stringify(raw.extractedData).slice(0, 8000) : '{}'
      if (!fileName || !relativePath) throw new Error('Um item do índice não possui nome ou caminho relativo válido.')
      return { fileName, relativePath, clientId, department, competenceMonth, competenceYear, documentType, fileHash, extractedData }
    })
    await db.batch(files.map((file) => ({
      sql: `INSERT INTO organiza_file_index (id, user_id, device_id, client_id, file_name, relative_path, file_hash, document_type, department, competence_year, competence_month, extracted_data, indexed_at, sync_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(device_id, relative_path) DO UPDATE SET client_id = excluded.client_id, file_name = excluded.file_name, file_hash = CASE WHEN excluded.file_hash <> '' THEN excluded.file_hash ELSE organiza_file_index.file_hash END, document_type = excluded.document_type, department = excluded.department, competence_year = excluded.competence_year, competence_month = excluded.competence_month, extracted_data = CASE WHEN excluded.file_hash <> '' AND COALESCE(organiza_file_index.file_hash, '') <> excluded.file_hash THEN '{}' WHEN excluded.extracted_data <> '{}' THEN excluded.extracted_data ELSE organiza_file_index.extracted_data END, indexed_at = excluded.indexed_at, sync_id = CASE WHEN excluded.sync_id <> '' THEN excluded.sync_id ELSE organiza_file_index.sync_id END`,
      args: [id(), userId, asText(req.device.id), file.clientId, file.fileName, file.relativePath, file.fileHash, file.documentType, file.department, file.competenceYear, file.competenceMonth, file.extractedData, now(), syncId],
    })), 'write')
    res.status(201).json({ indexed: files.length })
  } catch (error) {
    if (error instanceof Error && /índice/i.test(error.message)) return res.status(400).json({ error: error.message })
    next(error)
  }
})

app.get('/api/organizza/file-index/financial-pending', requireDeviceAuth, async (req, res, next) => {
  try {
    const rows = await many(`SELECT id, file_name AS fileName, relative_path AS relativePath, client_id AS clientId, file_hash AS fileHash,
      document_type AS documentType, department, competence_year AS competenceYear, competence_month AS competenceMonth
      FROM organiza_file_index WHERE user_id = ? AND device_id = ? AND (extracted_data IS NULL OR extracted_data = '{}' OR extracted_data = '' OR COALESCE(json_extract(extracted_data, '$.extractionVersion'), 0) < 2)
      AND (upper(file_name) LIKE '%RECIBO%PAGAMENTO%' OR upper(file_name) LIKE '%DARF%INSS%' OR upper(file_name) LIKE '%INSS%DARF%' OR upper(file_name) LIKE '%FGTS%' OR upper(file_name) LIKE '%DAS%')
      ORDER BY indexed_at ASC LIMIT 1000`, [asText(req.user.id), asText(req.device.id)])
    const pending = rows.filter((row) => {
      const name = normalizeSearchText(asText(row.fileName))
      return /RECIBO\s+DE\s+PAGAMENTO/.test(name) || /DARF.*INSS|INSS.*DARF/.test(name) || /(^|[^A-Z])FGTS([^A-Z]|$)/.test(name) || (/(^|[^A-Z])DAS([^A-Z]|$)/.test(name) && !/DASMEI/.test(name))
    }).map((row) => ({ id: asText(row.id), fileName: asText(row.fileName), relativePath: asText(row.relativePath), clientId: asText(row.clientId), fileHash: asText(row.fileHash), documentType: asText(row.documentType), department: asText(row.department), competenceYear: asNumber(row.competenceYear), competenceMonth: asNumber(row.competenceMonth) }))
    res.json({ pending })
  } catch (error) { next(error) }
})

app.get('/api/organizza/file-index/financial-map', requireDeviceAuth, async (req, res, next) => {
  try {
    const rows = await many(`SELECT f.id, f.file_name AS fileName, f.relative_path AS relativePath, f.client_id AS clientId, f.file_hash AS fileHash,
      f.document_type AS documentType, f.department, f.competence_year AS competenceYear, f.competence_month AS competenceMonth,
      f.extracted_data AS extractedData, f.indexed_at AS indexedAt, c.code, c.legal_name AS legalName
      FROM organiza_file_index f LEFT JOIN organiza_clients c ON c.id = f.client_id
      WHERE f.user_id = ? AND f.device_id = ?
      AND (upper(f.file_name) LIKE '%RECIBO%PAGAMENTO%' OR upper(f.file_name) LIKE '%DARF%INSS%' OR upper(f.file_name) LIKE '%INSS%DARF%'
        OR upper(f.file_name) LIKE '%FGTS%' OR upper(f.file_name) LIKE '%DAS%')
      ORDER BY c.code ASC, f.competence_year DESC, f.competence_month DESC, f.file_name ASC LIMIT 5000`, [asText(req.user.id), asText(req.device.id)])
    const financialRows = rows.filter((row) => {
      const name = normalizeSearchText(asText(row.fileName))
      return /RECIBO\s+DE\s+PAGAMENTO/.test(name) || /DARF.*INSS|INSS.*DARF/.test(name)
        || /(^|[^A-Z])FGTS([^A-Z]|$)/.test(name) || (/(^|[^A-Z])DAS([^A-Z]|$)/.test(name) && !/DASMEI/.test(name))
    })
    const documents = financialRows.map((row) => ({
      id: asText(row.id), fileName: asText(row.fileName), relativePath: asText(row.relativePath), clientId: asText(row.clientId), fileHash: asText(row.fileHash),
      documentType: asText(row.documentType), department: asText(row.department), competenceYear: asNumber(row.competenceYear), competenceMonth: asNumber(row.competenceMonth),
      extractedData: parsedExtractedData(row.extractedData), indexedAt: asText(row.indexedAt), client: { code: asText(row.code), legalName: asText(row.legalName) },
    }))
    res.json({ documents })
  } catch (error) { next(error) }
})

app.post('/api/organizza/file-index/sync-complete', requireDeviceAuth, async (req, res, next) => {
  try {
    const syncId = typeof req.body?.syncId === 'string' ? req.body.syncId.trim().slice(0, 80) : ''
    if (!syncId) return res.status(400).json({ error: 'Identificador da sincronização não informado.' })
    const result = await db.execute({ sql: 'DELETE FROM organiza_file_index WHERE user_id = ? AND device_id = ? AND sync_id <> ?', args: [asText(req.user.id), asText(req.device.id), syncId] })
    res.json({ removed: asNumber(result.rowsAffected) })
  } catch (error) { next(error) }
})

async function searchWithIzza(req, res, next) {
  try {
    const originalQuery = typeof req.body?.query === 'string' ? req.body.query.trim().slice(0, 500) : ''
    let query = originalQuery
    if (query.length < 2) return res.status(400).json({ error: 'Escreva ao menos dois caracteres para a Izza pesquisar.' })
    const userId = asText(req.user.id)
    let likelyDocumentRequest = isLikelyIzzaDocumentRequest(query)
    if (!likelyDocumentRequest) {
      const ignoredScopeWords = new Set(['ME', 'DA', 'DE', 'DO', 'DAS', 'DOS', 'A', 'O', 'AS', 'OS', 'UM', 'UMA', 'EMPRESA', 'MINHA', 'PARA', 'POR', 'FAVOR'])
      const mapTerms = normalizeSearchText(query).split(/\s+/).filter((term) => term.length >= 4 && !ignoredScopeWords.has(term) && !/^\d+$/.test(term)).slice(0, 5)
      for (const term of mapTerms) {
        const mapped = await one(`SELECT 1 AS found FROM organiza_file_index
          WHERE user_id = ? AND (UPPER(file_name) LIKE ? OR UPPER(document_type) LIKE ? OR UPPER(relative_path) LIKE ?) LIMIT 1`,
        [userId, `%${term}%`, `%${term}%`, `%${term}%`])
        if (mapped) { likelyDocumentRequest = true; break }
      }
    }
    if (!likelyDocumentRequest) return res.json({ query: originalQuery, deterministic: true, scopeRejected: true,
      summary: 'Eu sou a Izza e, por enquanto, respondo somente a pedidos para localizar arquivos e documentos no Organizza.', results: [] })
    let aiInterpreted = false
    let aiFilters = null
    let searchMode = /\b(QUAIS|LISTE|LISTAR|TODOS|TODAS|DOCUMENTOS|ARQUIVOS|RELATORIOS)\b/.test(normalizeSearchText(query)) ? 'list' : 'find'
    if (process.env.OPENAI_API_KEY && !isClearlyStructuredIzzaRequest(query)) {
      try {
        const interpretation = await interpretIzzaRequestWithAI(userId, query)
        if (interpretation.query) { query = interpretation.query; searchMode = interpretation.mode; aiFilters = interpretation.filters; aiInterpreted = true }
      } catch (error) {
        console.error('[Izza AI fallback]', error)
        await db.execute({
          sql: 'INSERT INTO execution_logs (id, user_id, agent_id, event_type, status, message, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)',
          args: [id(), userId, 'izza', 'izza.ai.fallback', 'warning', 'A interpretação por IA falhou; a busca segura tradicional foi utilizada.', JSON.stringify({ error: asText(error?.message).slice(0, 500) })],
        }).catch(() => {})
      }
    }
    if (/\bPASTA\b/.test(normalizeSearchText(originalQuery))) searchMode = 'list'
    const text = normalizeSearchText(query)
    const originalText = normalizeSearchText(originalQuery)
    const digits = query.replace(/\D/g, '')
    const namedMonths = { JANEIRO: 1, FEVEREIRO: 2, MARCO: 3, ABRIL: 4, MAIO: 5, JUNHO: 6, JULHO: 7, AGOSTO: 8, SETEMBRO: 9, OUTUBRO: 10, NOVEMBRO: 11, DEZEMBRO: 12 }
    const parseCompetenceValue = (value) => {
      const match = asText(value).match(/^(0[1-9]|1[0-2])(20\d{2})$/)
      return match ? { month: Number(match[1]), year: Number(match[2]), key: Number(`${match[2]}${match[1]}`) } : null
    }
    // O texto original é a fonte de verdade para período. A interpretação por IA
    // pode enriquecer a busca, mas nunca pode apagar mês/ano informados pelo usuário.
    const findWrittenCompetence = (value) => {
      const compact = asText(value).match(/(?:^|\D)(0[1-9]|1[0-2])(20\d{2})(?:\D|$)/)
      if (compact) return compact
      const separated = asText(value).match(/(?:^|\D)(0?[1-9]|1[0-2])\s*[\/.-]\s*(20\d{2})(?:\D|$)/)
      return separated || null
    }
    const originalCompetenceMatch = findWrittenCompetence(originalQuery)
    const interpretedCompetenceMatch = findWrittenCompetence(query)
    const aiCompetence = parseCompetenceValue(aiFilters?.competence)
    const competenceMatch = originalCompetenceMatch || interpretedCompetenceMatch
    const competence = competenceMatch
      ? { month: Number(competenceMatch[1]), year: Number(competenceMatch[2]) }
      : aiCompetence
        ? { month: aiCompetence.month, year: aiCompetence.year }
        : null
    const namedMonth = Object.entries(namedMonths).find(([name]) => new RegExp(`\\b${name}\\b`).test(originalText))?.[1]
      || Object.entries(namedMonths).find(([name]) => new RegExp(`\\b${name}\\b`).test(text))?.[1]
      || 0
    const relativeCurrentYear = /\b(?:(?:DESTE|DESSE|ESTE|ESSE) ANO|ANO ATUAL)\b/.test(originalText) || /\b(?:(?:DESTE|DESSE|ESTE|ESSE) ANO|ANO ATUAL)\b/.test(text)
    const requestedYear = competence?.year || Number(originalText.match(/20\d{2}/)?.[0] || text.match(/20\d{2}/)?.[0] || (relativeCurrentYear ? new Date().getFullYear() : 0))
    const competenceStart = parseCompetenceValue(aiFilters?.competenceStart)
    const competenceEnd = parseCompetenceValue(aiFilters?.competenceEnd)
    const recentMonths = asNumber(aiFilters?.recentMonths)
    const requestedSort = asText(aiFilters?.sort)
    const allClients = await many(`SELECT c.id, c.code, c.legal_name AS legalName, c.cnpj, COUNT(f.id) AS indexedFiles
      FROM organiza_clients c LEFT JOIN organiza_file_index f ON f.user_id = c.user_id AND f.client_id = c.id
      WHERE c.user_id = ? GROUP BY c.id, c.code, c.legal_name, c.cnpj`, [userId])
    const clients = req.allowedClientCnpjs
      ? allClients.filter((client) => req.allowedClientCnpjs.has(asText(client.cnpj).replace(/\D/g, '')))
      : allClients
    const candidates = new Map()
    const originalNumericTokens = originalText.match(/\b\d{1,10}\b/g) || []
    const referenceNumericTokens = normalizeSearchText(aiFilters?.clientReference).match(/\b\d{1,10}\b/g) || []
    const numericTokens = [...new Set((referenceNumericTokens.length ? referenceNumericTokens : originalNumericTokens)
      .filter((token) => token !== String(requestedYear) && token !== String(namedMonth)))]
    for (const client of clients) {
      const code = asText(client.code)
      const normalizedCode = normalizeSearchText(code)
      const numericCode = /^\d+$/.test(code)
      const cnpj = asText(client.cnpj).replace(/\D/g, '')
      const legalName = normalizeSearchText(asText(client.legalName))
      const nameTokens = legalName.split(/\s+/).filter((term) => term.length >= 3 && !['LTDA', 'EIRELI', 'EMPRESA', 'COMERCIO', 'SERVICOS', 'INDUSTRIA'].includes(term))
      const codeMatch = Boolean(code && (numericCode
        ? numericTokens.some((token) => String(Number(code)) === String(Number(token)))
        : new RegExp(`(?:^|[^A-Z0-9])${normalizedCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[^A-Z0-9])`).test(originalText)))
      const cnpjMatch = cnpj.length === 14 && digits.includes(cnpj)
      const nameMatch = (legalName.length >= 4 && text.includes(legalName)) || nameTokens.some((term) => term.length >= 5 && text.includes(term)) || (nameTokens.length >= 2 && nameTokens.filter((term) => text.includes(term)).length >= 2)
      if (codeMatch || cnpjMatch || nameMatch) {
        const candidateKey = codeMatch ? `CODE:${numericCode ? String(Number(code)) : normalizedCode}` : cnpjMatch ? `CNPJ:${cnpj}` : `ID:${asText(client.id)}`
        const current = candidates.get(candidateKey)
        if (!current || asNumber(client.indexedFiles) > asNumber(current.indexedFiles)) candidates.set(candidateKey, client)
      }
    }
    if (!candidates.size) return res.json({ query, deterministic: true, summary: 'Não identifiquei uma empresa única. Informe o código, CNPJ completo ou ao menos duas palavras do nome da empresa.', results: [] })
    if (candidates.size > 1) {
      const options = [...candidates.values()].slice(0, 8).map((item) => `${asText(item.code)} — ${asText(item.legalName)}`)
      return res.json({ query, deterministic: true, summary: `Encontrei ${candidates.size} empresas possíveis: ${options.join('; ')}${candidates.size > options.length ? '; entre outras' : ''}. Informe o código, CNPJ completo ou o nome de uma delas.`, results: [] })
    }
    const client = [...candidates.values()][0]
    const clientId = asText(client.id)
    const resolvedClient = { id: asText(client.id), code: asText(client.code).startsWith('SEM-CODIGO-') ? '' : asText(client.code), legalName: asText(client.legalName), cnpj: asText(client.cnpj) }
    const clientWords = new Set([asText(client.code), asText(client.cnpj), ...normalizeSearchText(asText(client.legalName)).split(/\s+/)])
    const ignored = new Set(['ME', 'DO', 'DA', 'DE', 'EM', 'PARA', 'COM', 'QUE', 'QUAL', 'QUANTO', 'VALOR', 'VALORES', 'VENCIMENTO', 'VENCE', 'SOMA', 'SOMAR', 'TOTAL', 'LIQUIDO', 'LIQUIDA', 'UM', 'UMA', 'O', 'A', 'EMPRESA', 'DOCUMENTO', 'DOCUMENTOS', 'ARQUIVO', 'ARQUIVOS', 'ULTIMO', 'ULTIMOS', 'ULTIMA', 'ULTIMAS', 'RECENTE', 'RECENTES', 'ALTERADO', 'ALTERADA', 'INSERIDO', 'INSERIDA', 'MES', 'MESES', 'LISTE', 'TODOS', 'TODAS', 'FISCAL', 'FISCAIS', 'CONTABIL', 'CONTABEIS', 'PESSOAL', 'JURIDICO', 'ABRIR', 'ABRA', 'BUSQUE', 'BUSCAR', 'LOCALIZE', 'ENCONTRE', 'MOSTRE', 'TRAGA', 'CONSULTE', 'PEGUE', 'QUERO', 'PRECISO', 'PROCURE', 'PESQUISE', 'POR', 'FAVOR', 'DAS', 'DOS', ...Object.keys(namedMonths), String(requestedYear)])
    const documentTerms = text.split(/\s+/).filter((term) => term.length >= 3 && !ignored.has(term) && !clientWords.has(term) && !/^\d+$/.test(term)).slice(0, 8)
    // Preserve o subtipo exatamente como escrito pelo usuário. A interpretação
    // da IA pode ajudar a organizar a busca, mas não pode trocar, por exemplo,
    // “adiantamento” por “pagamento”.
    const originalIdentityTerms = originalText.split(/\s+/)
      .filter((term) => term.length >= 3 && !ignored.has(term) && !clientWords.has(term) && !/^\d+$/.test(term))
      .filter((term) => !documentTerms.some((interpreted) => interpreted === term || interpreted.replace(/S$/, '') === term.replace(/S$/, '')))
      .slice(0, 8)
    const originalDocumentTerms = originalText.split(/\s+/)
      .filter((term) => term.length >= 3 && !ignored.has(term) && !clientWords.has(term) && !/^\d+$/.test(term))
      .slice(0, 8)
    const defaultDocumentRules = [
      { name: 'DASMEI', terms: ['DASMEI'], department: 'fiscal' }, { name: 'DAS', terms: ['DAS'], department: 'fiscal' },
      { name: 'DARF INSS', terms: ['DARF', 'INSS'], department: 'pessoal' }, { name: 'DARF', terms: ['DARF'], department: 'fiscal' }, { name: 'DCTF', terms: ['DCTF'], department: 'fiscal' },
      { name: 'INSS', terms: ['INSS'], department: 'pessoal' }, { name: 'FGTS', terms: ['FGTS'], department: 'pessoal' },
      { name: 'Recibo de Pagamento', terms: ['RECIBO', 'PAGAMENTO'], department: 'pessoal' },
      { name: 'EFD', terms: ['EFD'], department: 'fiscal' }, { name: 'SPED', terms: ['SPED'], department: 'fiscal' },
      { name: 'Balancete', terms: ['BALANCETE'], department: 'contabil' }, { name: 'Relatório financeiro', terms: ['RELATORIO', 'FINANCEIRO'], department: 'contabil' }, { name: 'Extrato bancário', terms: ['EXTRATO'], department: 'contabil' },
      { name: 'Folha de pagamento', terms: ['FOLHA'], department: 'pessoal' }, { name: 'Holerite', terms: ['HOLERITE'], department: 'pessoal' }, { name: 'Contrato', terms: ['CONTRATO'], department: 'juridico' }, { name: 'Certificado digital', terms: ['CERTIFICADO', 'DIGITAL'], department: 'juridico' },
    ]
    const configuredRules = (await many('SELECT name, terms, department FROM organiza_rules WHERE user_id = ? AND active = 1 ORDER BY created_at ASC', [userId])).map((rule) => {
      let terms = []
      try { terms = JSON.parse(asText(rule.terms) || '[]') } catch { terms = [] }
      return { name: asText(rule.name), terms: Array.isArray(terms) ? terms.map(normalizeSearchText).filter(Boolean) : [], department: asText(rule.department) }
    }).filter((rule) => rule.terms.length && ['contabil', 'fiscal', 'pessoal', 'juridico'].includes(rule.department))
    const knownRules = [...configuredRules, ...defaultDocumentRules]
    const containsTerm = (value, term) => {
      const phrase = normalizeSearchText(term).trim().split(/\s+/).map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^A-Z0-9]+')
      return Boolean(phrase && new RegExp(`(?:^|[^A-Z0-9])${phrase}(?:$|[^A-Z0-9])`).test(value))
    }
    const containsRequestedTerm = (value, term) => containsTerm(value, term)
      || (term.endsWith('S') && containsTerm(value, term.slice(0, -1)))
      || containsTerm(value, `${term}S`)
      || (term === 'FOLHA' && (
        containsTerm(value, 'HOLERITE')
        || (containsTerm(value, 'RECIBO') && containsTerm(value, 'PAGAMENTO'))
      ))
    const matchesOriginalIdentity = (value) => originalIdentityTerms.every((term) => containsRequestedTerm(value, term))
    const [personalLearnings, globalLearnings] = await Promise.all([
      many('SELECT phrase, document_type AS documentType, department, confirmations FROM organiza_izza_learnings WHERE user_id = ? ORDER BY confirmations DESC, updated_at DESC', [userId]),
      many(`SELECT phrase, document_type AS documentType, department, COUNT(DISTINCT user_id) AS confirmations
        FROM organiza_izza_learnings GROUP BY phrase, document_type, department HAVING COUNT(DISTINCT user_id) >= 3 ORDER BY confirmations DESC`),
    ])
    const learnedRows = [...personalLearnings, ...globalLearnings]
    const learned = learnedRows.find((item) => {
      const learnedTerms = normalizeSearchText(item.phrase).split(/\s+/).filter((term) => term.length >= 3 && !ignored.has(term) && !clientWords.has(term) && !/^\d+$/.test(term))
      if (!documentTerms.length || !learnedTerms.length) return false
      const overlap = documentTerms.filter((term) => learnedTerms.includes(term)).length
      return overlap >= Math.min(2, documentTerms.length)
    })
    const learnedRule = learned ? { name: asText(learned.documentType), terms: normalizeSearchText(learned.documentType).split(/\s+/).filter((term) => term.length >= 2), department: asText(learned.department) } : null
    // O tipo escrito pelo usuário sempre vence a interpretação da IA. Isso
    // impede que “DAS da empresa 100” vire uma listagem genérica do mês.
    const explicitRule = knownRules.find((rule) => rule.terms.every((term) => containsTerm(originalText, term))) || null
    const recognizedRule = explicitRule || learnedRule || knownRules.find((rule) => rule.terms.every((term) => containsTerm(text, term))) || null
    const interpretedDescription = normalizeSearchText(aiFilters?.documentDescription)
    const genericDescriptions = new Set(['', 'DOCUMENTO', 'DOCUMENTOS', 'ARQUIVO', 'ARQUIVOS', 'DOCUMENTOS FISCAIS', 'ARQUIVOS FISCAIS'])
    const hasSpecificDocument = Boolean(explicitRule) || (aiInterpreted ? !genericDescriptions.has(interpretedDescription) : documentTerms.length > 0)
    const originalTypeOverridesInterpretation = aiInterpreted && originalIdentityTerms.length > 0
    const documentRuleForSearch = hasSpecificDocument && !originalTypeOverridesInterpretation ? recognizedRule : null
    const requestedDocumentTerms = originalTypeOverridesInterpretation
      ? originalDocumentTerms
      : documentRuleForSearch ? documentRuleForSearch.terms : documentTerms
    const financialKindByRule = { DAS: 'das', FGTS: 'fgts', INSS: 'inss', 'DARF INSS': 'inss', 'RECIBO DE PAGAMENTO': 'payroll_receipt' }
    const requestedFinancialKind = financialKindByRule[normalizeSearchText(documentRuleForSearch?.name)] || ''
    const matchesRequestedDocument = (row, documentText) => {
      if (!requestedFinancialKind) return !requestedDocumentTerms.length || requestedDocumentTerms.every((term) => containsRequestedTerm(documentText, term))
      const extracted = parsedExtractedData(row.extractedData)
      if (asText(extracted.kind)) return asText(extracted.kind) === requestedFinancialKind
      const fileName = normalizeSearchText(row.fileName)
      const department = asText(row.department)
      if (requestedFinancialKind === 'das') {
        if (department && department !== 'fiscal') return false
        if (containsTerm(fileName, 'DASMEI') || (!containsTerm(originalText, 'PARCELAMENTO') && containsTerm(fileName, 'PARCELAMENTO'))) return false
        return containsTerm(fileName, 'DAS')
      }
      if (requestedFinancialKind === 'inss') return containsTerm(fileName, 'DARF') && containsTerm(fileName, 'INSS')
      if (requestedFinancialKind === 'fgts') return containsTerm(fileName, 'FGTS')
      return containsTerm(fileName, 'RECIBO') && containsTerm(fileName, 'PAGAMENTO')
    }
    const departmentTerms = {
      juridico: ['CONTRATO', 'PROCURACAO', 'ALTERACAO CONTRATUAL'],
      pessoal: ['FOLHA', 'HOLERITE', 'ESOCIAL', 'FGTS', 'FERIAS', 'ADMISSAO', 'RESCISAO'],
      contabil: ['BALANCETE', 'BALANCO', 'EXTRATO', 'RELATORIO FINANCEIRO', 'RAZAO', 'DIARIO'],
      fiscal: ['DASMEI', 'DAS', 'DARF', 'DCTF', 'EFD', 'SPED', 'NOTA FISCAL', 'ICMS', 'ISS', 'CSLL'],
    }
    const explicitlyRequestedDepartment = [
      ['contabil', ['CONTABIL', 'CONTABEIS', 'CONTABILIDADE']], ['fiscal', ['FISCAL', 'FISCAIS']], ['pessoal', ['PESSOAL', 'FOLHA', 'RH']], ['juridico', ['JURIDICO', 'JURIDICOS']],
    ].find(([, terms]) => terms.some((term) => containsTerm(text, term)))?.[0] || ''
    const inferredDepartment = aiFilters?.department || explicitlyRequestedDepartment || documentRuleForSearch?.department || Object.entries(departmentTerms).find(([, terms]) => terms.some((term) => containsTerm(text, term)))?.[0] || ''
    const suggestedFolder = inferredDepartment ? {
      client: resolvedClient,
      department: inferredDepartment,
      competence: requestedYear && (competence?.month || namedMonth) ? `${String(competence?.month || namedMonth).padStart(2, '0')}${requestedYear}` : '',
    } : null
    const rows = await many(`SELECT f.id, f.device_id AS deviceId, f.client_id AS clientId, f.file_name AS fileName, f.relative_path AS relativePath, f.document_type AS documentType, f.department, f.extracted_data AS extractedData,
      f.competence_year AS competenceYear, f.competence_month AS competenceMonth, f.indexed_at AS indexedAt,
      c.code, c.legal_name AS legalName, c.cnpj
      FROM organiza_file_index f LEFT JOIN organiza_clients c ON c.id = f.client_id
      LEFT JOIN organiza_devices d ON d.id = f.device_id
      WHERE f.user_id = ? AND f.client_id = ?
      ORDER BY CASE WHEN d.actor_user_id = ? THEN 0 ELSE 1 END, f.indexed_at DESC`, [userId, clientId, asText(req.user.actor_id || userId)])
    // A mesma pasta sincronizada pode ser indexada por vários computadores do
    // escritório. Para a Izza, o caminho lógico representa um único documento.
    const logicalRows = [...new Map(rows.map((row) => [`${asText(row.clientId)}::${safeRelativePath(asText(row.relativePath)).toLocaleUpperCase('pt-BR')}`, row])).values()]
    const clientCode = asText(client.code)
    const clientCodePattern = clientCode && !clientCode.startsWith('SEM-CODIGO-') ? new RegExp(`(?:^|[^A-Z0-9])${normalizeSearchText(clientCode).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[^A-Z0-9])`) : null
    const clientName = normalizeSearchText(asText(client.legalName))
    const clientCnpj = asText(client.cnpj).replace(/\D/g, '')
    const belongsToClient = (row) => {
      if (asText(row.clientId) === clientId) return true
      const rowText = normalizeSearchText(`${asText(row.relativePath)} ${asText(row.fileName)}`)
      const rowDigits = `${asText(row.relativePath)} ${asText(row.fileName)}`.replace(/\D/g, '')
      return Boolean((clientCodePattern && clientCodePattern.test(rowText)) || (clientCnpj && rowDigits.includes(clientCnpj)) || (clientName.length >= 4 && rowText.includes(clientName)))
    }
    const now = new Date()
    const recentKeys = new Set(Array.from({ length: recentMonths }, (_, index) => {
      const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - index, 1))
      return (date.getUTCFullYear() * 100) + date.getUTCMonth() + 1
    }))
    const matchesRequestedPeriod = (row) => {
      const year = asNumber(row.competenceYear); const month = asNumber(row.competenceMonth); const key = (year * 100) + month
      if (competenceStart && competenceEnd && (key < competenceStart.key || key > competenceEnd.key)) return false
      if (recentMonths && !recentKeys.has(key)) return false
      if (competence && (month !== competence.month || year !== competence.year)) return false
      if (namedMonth && month !== namedMonth) return false
      if (requestedYear && year !== requestedYear) return false
      return true
    }
    if (searchMode === 'list') {
      const listed = logicalRows.filter((row) => {
        if (!belongsToClient(row)) return false
        const documentText = normalizeSearchText(`${asText(row.fileName)} ${asText(row.documentType)} ${asText(row.relativePath)}`)
        if (!matchesRequestedDocument(row, documentText)) return false
        if (!matchesOriginalIdentity(documentText)) return false
        if (inferredDepartment && asText(row.department) !== inferredDepartment) return false
        if (!matchesRequestedPeriod(row)) return false
        return true
      }).sort((a, b) => {
        if (requestedSort === 'latest_indexed') return asText(b.indexedAt).localeCompare(asText(a.indexedAt))
        const aKey = (asNumber(a.competenceYear) * 100) + asNumber(a.competenceMonth); const bKey = (asNumber(b.competenceYear) * 100) + asNumber(b.competenceMonth)
        return bKey - aKey || asText(a.fileName).localeCompare(asText(b.fileName), 'pt-BR')
      })
      if (requestedSort) listed.splice(1)
      const results = listed.slice(0, 100).map((row) => ({
        id: asText(row.id), deviceId: asText(row.deviceId), fileName: asText(row.fileName), relativePath: asText(row.relativePath), documentType: asText(row.documentType), department: asText(row.department),
        competence: row.competenceMonth && row.competenceYear ? `${String(asNumber(row.competenceMonth)).padStart(2, '0')}${asNumber(row.competenceYear)}` : '',
        client: row.legalName ? { code: asText(row.code).startsWith('SEM-CODIGO-') ? '' : asText(row.code), legalName: asText(row.legalName), cnpj: asText(row.cnpj) } : null,
        indexedAt: asText(row.indexedAt), extractedData: parsedExtractedData(row.extractedData),
      }))
      const folderRows = listed.filter((row) => asText(row.deviceId) === asText(listed[0]?.deviceId))
      const directories = folderRows.map((row) => safeRelativePath(asText(row.relativePath)).split('/').slice(0, -1)).filter((parts) => parts.length)
      const commonParts = directories.length ? directories[0].filter((part, index) => directories.every((parts) => parts[index] === part)) : []
      const mappedFolder = commonParts.length ? {
        client: resolvedClient,
        department: inferredDepartment, competence: requestedYear && (competence?.month || namedMonth) ? `${String(competence?.month || namedMonth).padStart(2, '0')}${requestedYear}` : '',
        relativePath: commonParts.join('/'), deviceId: asText(listed[0]?.deviceId),
      } : null
      const place = [inferredDepartment ? `do Dpto ${inferredDepartment.charAt(0).toUpperCase()}${inferredDepartment.slice(1)}` : '', requestedYear ? `de ${requestedYear}` : ''].filter(Boolean).join(' ')
      const foundKeys = new Set(listed.map((row) => (asNumber(row.competenceYear) * 100) + asNumber(row.competenceMonth)))
      const missingRecent = recentMonths ? [...recentKeys].filter((key) => !foundKeys.has(key)).sort().map((key) => `${String(key % 100).padStart(2, '0')}/${Math.floor(key / 100)}`) : []
      const financialCount = listed.filter((row) => financialSummary(row)).length
      const summary = listed.length
        ? `Encontrei ${listed.length} documento(s) ${place} para ${asText(client.legalName)}.${financialCount ? ` ${financialCount} com valores extraídos, exibidos em cada documento.` : ''}${missingRecent.length ? ` Não encontrei: ${missingRecent.join(', ')}.` : ''}${listed.length > 100 ? ' Estou mostrando os 100 mais recentes.' : ''}`
        : `Não encontrei os documentos solicitados para ${asText(client.legalName)}. Continue pelas opções abaixo.`
      return res.json({ query: originalQuery, deterministic: !aiInterpreted, aiInterpreted, mode: 'list', summary, results, suggestedFolder: mappedFolder || suggestedFolder, resolvedClient, needsGuidance: !listed.length, recognized: { year: requestedYear || competenceStart?.year || 0, department: inferredDepartment, month: competence?.month || namedMonth || 0 } })
    }
    const exact = logicalRows.filter((row) => {
      if (!belongsToClient(row)) return false
      const documentText = normalizeSearchText(`${asText(row.fileName)} ${asText(row.documentType)} ${asText(row.relativePath)}`)
      if (!matchesRequestedDocument(row, documentText)) return false
      if (originalIdentityTerms.length && !originalIdentityTerms.every((term) => containsRequestedTerm(documentText, term))) return false
      if (documentRuleForSearch?.department && asText(row.department) && asText(row.department) !== documentRuleForSearch.department) return false
      if (!matchesRequestedPeriod(row)) return false
      return true
    })
    if (namedMonth && !requestedYear && new Set(exact.map((row) => asNumber(row.competenceYear)).filter(Boolean)).size > 1) return res.json({ query, deterministic: true, summary: `Há documentos de ${Object.keys(namedMonths).find((name) => namedMonths[name] === namedMonth)?.toLowerCase()} em mais de um ano para ${asText(client.legalName)}. Informe também o ano, por exemplo 052026.`, results: [], suggestedFolder })
    if (!exact.length) return res.json({ query, deterministic: true, summary: 'Não consegui encontrar o documento solicitado. Continue pelas opções abaixo.', results: [], suggestedFolder, resolvedClient, needsGuidance: true, recognized: { year: requestedYear || 0, department: inferredDepartment, month: competence?.month || namedMonth || 0 } })
    if (exact.length > 1) {
      const candidates = exact.slice(0, 20).map((row) => ({
        id: asText(row.id), deviceId: asText(row.deviceId), fileName: asText(row.fileName), relativePath: asText(row.relativePath), documentType: asText(row.documentType), department: asText(row.department),
        competence: row.competenceMonth && row.competenceYear ? `${String(asNumber(row.competenceMonth)).padStart(2, '0')}${asNumber(row.competenceYear)}` : '',
        client: row.legalName ? { code: asText(row.code).startsWith('SEM-CODIGO-') ? '' : asText(row.code), legalName: asText(row.legalName), cnpj: asText(row.cnpj) } : null,
        indexedAt: asText(row.indexedAt), extractedData: parsedExtractedData(row.extractedData),
      }))
      const financialCount = exact.filter((row) => financialSummary(row)).length
      return res.json({ query, deterministic: true, summary: `Encontrei ${exact.length} documentos possíveis.${financialCount ? ` ${financialCount} com valores extraídos, exibidos em cada documento.` : ''} Escolha uma das opções abaixo.`, results: candidates, resolvedClient, needsGuidance: true, recognized: { year: requestedYear || 0, department: inferredDepartment, month: competence?.month || namedMonth || 0 } })
    }
    const results = exact.map((row) => ({
      id: asText(row.id), deviceId: asText(row.deviceId), fileName: asText(row.fileName), relativePath: asText(row.relativePath), documentType: asText(row.documentType), department: asText(row.department),
      competence: row.competenceMonth && row.competenceYear ? `${String(asNumber(row.competenceMonth)).padStart(2, '0')}${asNumber(row.competenceYear)}` : '',
      client: row.legalName ? { code: asText(row.code).startsWith('SEM-CODIGO-') ? '' : asText(row.code), legalName: asText(row.legalName), cnpj: asText(row.cnpj) } : null,
      indexedAt: asText(row.indexedAt), extractedData: parsedExtractedData(row.extractedData),
    }))
    const details = financialSummary(exact[0])
    const summary = `Prontinho! Encontrei o documento exato de ${asText(client.legalName)}.${details ? ` ${details}` : ''}`
    res.json({ query: originalQuery, deterministic: !aiInterpreted, aiInterpreted, summary, results })
  } catch (error) { next(error) }
}

app.post('/api/organizza/izza/search', requireAuth, searchWithIzza)
app.post('/api/integrations/one/izza/search', requireOneIntegration, searchWithIzza)

app.post('/api/integrations/one/documents/tree', requireOneIntegration, async (req, res, next) => {
  try {
    const rows = await many(`SELECT f.id, f.device_id AS deviceId, f.file_name AS fileName, f.relative_path AS relativePath,
      f.document_type AS documentType, f.department, f.competence_year AS competenceYear,
      f.competence_month AS competenceMonth, f.indexed_at AS indexedAt,
      c.code, c.legal_name AS legalName, c.cnpj
      FROM organiza_file_index f INNER JOIN organiza_clients c ON c.id = f.client_id
      WHERE f.user_id = ? ORDER BY c.code ASC, f.relative_path ASC`, [asText(req.user.id)])
    const documents = rows.filter((row) => req.allowedClientCnpjs.has(asText(row.cnpj).replace(/\D/g, ''))).map((row) => ({
      id: asText(row.id), deviceId: asText(row.deviceId), fileName: asText(row.fileName), relativePath: asText(row.relativePath),
      documentType: asText(row.documentType), department: asText(row.department), competenceYear: asNumber(row.competenceYear),
      competenceMonth: asNumber(row.competenceMonth), indexedAt: asText(row.indexedAt),
      client: { code: asText(row.code).startsWith('SEM-CODIGO-') ? '' : asText(row.code), legalName: asText(row.legalName), cnpj: asText(row.cnpj) },
    }))
    res.json({ documents })
  } catch (error) { next(error) }
})

const legalPathSegment = (value, limit = 140) => asText(value).replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit)
const legalProcessRelativePath = (body) => {
  const code = legalPathSegment(body?.companyCode, 60)
  const companyName = legalPathSegment(body?.companyName, 240)
  const processType = legalPathSegment(body?.processType, 80)
  const startedAt = /^\d{8}$/.test(asText(body?.startedAt)) ? asText(body.startedAt) : ''
  return code && companyName && processType && startedAt ? `${code} - ${companyName}/Dpto Jurídico/Processos/${processType} - ${startedAt}` : ''
}

app.post('/api/integrations/one/legal/client/prepare', requireOneIntegrationAccount, async (req, res, next) => {
  try {
    const userId = asText(req.user.id)
    const code = legalPathSegment(req.body?.companyCode, 60)
    const legalName = normalizeClientName(req.body?.companyName).slice(0, 300)
    const cnpj = asText(req.body?.cnpj).replace(/\D/g, '').slice(0, 14)
    if (!code || !legalName) return res.status(400).json({ error: 'Informe o código e o nome da empresa.' })
    let client = cnpj ? await one('SELECT * FROM organiza_clients WHERE user_id = ? AND cnpj = ? LIMIT 1', [userId, cnpj]) : null
    if (!client) client = await one('SELECT * FROM organiza_clients WHERE user_id = ? AND code = ? LIMIT 1', [userId, code])
    if (!client) {
      const clientId = id()
      await db.execute({ sql: 'INSERT INTO organiza_clients (id, user_id, code, legal_name, cnpj, updated_at) VALUES (?, ?, ?, ?, ?, ?)', args: [clientId, userId, code, legalName, cnpj, now()] })
    }
    const device = await one("SELECT * FROM organiza_devices WHERE user_id = ? AND status = 'connected' AND clients_root_path IS NOT NULL ORDER BY COALESCE(last_seen_at, created_at) DESC LIMIT 1", [userId])
    if (!device) return res.status(409).json({ error: 'Nenhum Organizza Desktop conectado com a pasta de clientes configurada.' })
    const legalFolders = ['Processos', 'CND', 'Documentos da Empresa', 'Documentos dos Sócios', 'Certificado Digital', 'Declarações', 'Termos e Intimações', 'Situação Fiscal']
    const commandId = id()
    const relativePath = `${code} - ${legalName}`
    await db.execute({ sql: 'INSERT INTO organiza_commands (id, user_id, device_id, command_type, payload) VALUES (?, ?, ?, ?, ?)', args: [commandId, userId, asText(device.id), 'legal.client.prepare', JSON.stringify({ year: new Date().getFullYear(), legalFolders, client: { code, legalName, cnpj } })] })
    res.status(202).json({ commandId, status: 'pending', relativePath })
  } catch (error) { next(error) }
})

app.post('/api/integrations/one/legal/process/prepare', requireOneIntegrationAccount, async (req, res, next) => {
  try {
    const userId = asText(req.user.id)
    const relativePath = legalProcessRelativePath(req.body)
    if (!relativePath) return res.status(400).json({ error: 'Informe empresa, código, tipo e data do processo.' })
    const code = legalPathSegment(req.body?.companyCode, 60)
    const legalName = normalizeClientName(req.body?.companyName).slice(0, 300)
    const cnpj = asText(req.body?.cnpj).replace(/\D/g, '').slice(0, 14)
    let client = cnpj ? await one('SELECT * FROM organiza_clients WHERE user_id = ? AND cnpj = ? LIMIT 1', [userId, cnpj]) : null
    if (!client) client = await one('SELECT * FROM organiza_clients WHERE user_id = ? AND code = ? LIMIT 1', [userId, code])
    if (!client) {
      const clientId = id()
      await db.execute({ sql: 'INSERT INTO organiza_clients (id, user_id, code, legal_name, cnpj, updated_at) VALUES (?, ?, ?, ?, ?, ?)', args: [clientId, userId, code, legalName, cnpj, now()] })
      client = await one('SELECT * FROM organiza_clients WHERE id = ?', [clientId])
    }
    const device = await one("SELECT * FROM organiza_devices WHERE user_id = ? AND status = 'connected' AND clients_root_path IS NOT NULL ORDER BY COALESCE(last_seen_at, created_at) DESC LIMIT 1", [userId])
    if (!device) return res.status(409).json({ error: 'Nenhum Organizza Desktop conectado com a pasta de clientes configurada.' })
    const commandId = id()
    const folders = ['01 - Documentos recebidos', '01 - Documentos recebidos/A classificar', '02 - Documentos gerados', '03 - Protocolos', '04 - Exigências', '05 - Documentos finais']
    const legalFolders = ['Processos', 'CND', 'Documentos da Empresa', 'Documentos dos Sócios', 'Certificado Digital', 'Declarações', 'Termos e Intimações', 'Situação Fiscal']
    await db.execute({ sql: 'INSERT INTO organiza_commands (id, user_id, device_id, command_type, payload) VALUES (?, ?, ?, ?, ?)', args: [commandId, userId, asText(device.id), 'legal.process.prepare', JSON.stringify({ relativePath, folders, legalFolders, year: new Date().getFullYear(), client: { code, legalName, cnpj } })] })
    res.status(202).json({ commandId, status: 'pending', relativePath })
  } catch (error) { next(error) }
})

app.post('/api/integrations/one/legal/process/document', requireOneIntegrationAccount, async (req, res, next) => {
  try {
    const userId = asText(req.user.id)
    const processPath = legalProcessRelativePath(req.body)
    const kind = req.body?.kind === 'pdf' ? 'pdf' : req.body?.kind === 'docx' ? 'docx' : ''
    const fileName = legalPathSegment(req.body?.fileName, 220)
    const client = { code: legalPathSegment(req.body?.companyCode, 60), legalName: normalizeClientName(req.body?.companyName).slice(0, 300), cnpj: asText(req.body?.cnpj).replace(/\D/g, '').slice(0, 14) }
    const encoded = asText(req.body?.contentsBase64)
    const contents = Buffer.from(encoded, 'base64')
    const validSignature = kind === 'pdf' ? contents.subarray(0, 5).toString() === '%PDF-' : kind === 'docx' && contents[0] === 0x50 && contents[1] === 0x4b
    if (!processPath || !kind || !fileName.toLowerCase().endsWith(`.${kind}`) || encoded.length > 1_800_000 || contents.length < 100 || contents.length > 1_300_000 || !validSignature) return res.status(400).json({ error: 'Somente contratos DOCX ou PDF válidos de até 1,3 MB podem ser enviados.' })
    const device = await one("SELECT * FROM organiza_devices WHERE user_id = ? AND status = 'connected' AND clients_root_path IS NOT NULL ORDER BY COALESCE(last_seen_at, created_at) DESC LIMIT 1", [userId])
    if (!device) return res.status(409).json({ error: 'Nenhum Organizza Desktop conectado com a pasta de clientes configurada.' })
    const relativePath = `${processPath}/02 - Documentos gerados/${fileName}`
    const commandId = id()
    await db.execute({ sql: 'INSERT INTO organiza_commands (id, user_id, device_id, command_type, payload) VALUES (?, ?, ?, ?, ?)', args: [commandId, userId, asText(device.id), 'legal.process.document.save', JSON.stringify({ relativePath, kind, contentsBase64: encoded, client })] })
    res.status(202).json({ commandId, status: 'pending', relativePath })
  } catch (error) { next(error) }
})

app.post('/api/integrations/one/documents/open', requireOneIntegration, async (req, res, next) => {
  try {
    const indexId = asText(req.body?.indexId)
    const file = await one(`SELECT f.id, f.device_id AS deviceId, f.file_name AS fileName, f.relative_path AS relativePath, c.cnpj
      FROM organiza_file_index f INNER JOIN organiza_clients c ON c.id = f.client_id
      WHERE f.id = ? AND f.user_id = ?`, [indexId, asText(req.user.id)])
    if (!file || !req.allowedClientCnpjs.has(asText(file.cnpj).replace(/\D/g, ''))) return res.status(404).json({ error: 'Documento não encontrado entre as empresas autorizadas.' })
    const commandId = id()
    await db.batch([
      { sql: 'INSERT INTO organiza_commands (id, user_id, device_id, command_type, payload) VALUES (?, ?, ?, ?, ?)', args: [commandId, asText(req.user.id), asText(file.deviceId), 'file.open', JSON.stringify({ indexId: asText(file.id), relativePath: asText(file.relativePath), fileName: asText(file.fileName) })] },
      { sql: 'INSERT INTO organiza_events (id, user_id, device_id, event_type, status, message, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)', args: [id(), asText(req.user.id), asText(file.deviceId), 'one.open_requested', 'info', `O ONE solicitou a abertura de ${asText(file.fileName)}.`, JSON.stringify({ commandId, indexId })] },
    ], 'write')
    res.status(201).json({ command: { id: commandId }, message: 'Solicitação enviada ao Organizza Desktop.' })
  } catch (error) { next(error) }
})

async function authorizedOneFile(req, indexId) {
  const file = await one(`SELECT f.id, f.device_id AS deviceId, f.file_name AS fileName, f.relative_path AS relativePath, c.cnpj
    FROM organiza_file_index f INNER JOIN organiza_clients c ON c.id = f.client_id
    WHERE f.id = ? AND f.user_id = ?`, [indexId, asText(req.user.id)])
  return file && req.allowedClientCnpjs.has(asText(file.cnpj).replace(/\D/g, '')) ? file : null
}

app.post('/api/integrations/one/documents/preview', requireOneIntegration, async (req, res, next) => {
  try {
    const indexId = asText(req.body?.indexId)
    const file = await authorizedOneFile(req, indexId)
    if (!file) return res.status(404).json({ error: 'Documento não encontrado entre as empresas autorizadas.' })
    const previewId = id(); const commandId = id(); const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
    await db.batch([
      { sql: 'INSERT INTO organiza_temporary_previews (id, user_id, device_id, index_id, file_name, expires_at) VALUES (?, ?, ?, ?, ?, ?)', args: [previewId, asText(req.user.id), asText(file.deviceId), indexId, asText(file.fileName), expiresAt] },
      { sql: 'INSERT INTO organiza_commands (id, user_id, device_id, command_type, payload) VALUES (?, ?, ?, ?, ?)', args: [commandId, asText(req.user.id), asText(file.deviceId), 'file.preview', JSON.stringify({ previewId, indexId, relativePath: asText(file.relativePath), fileName: asText(file.fileName) })] },
    ], 'write')
    res.status(202).json({ previewId, status: 'pending', expiresAt })
  } catch (error) { next(error) }
})

app.post('/api/integrations/one/documents/preview/status', requireOneIntegration, async (req, res, next) => {
  try {
    const previewId = asText(req.body?.previewId)
    const preview = await one(`SELECT p.*, c.cnpj FROM organiza_temporary_previews p
      INNER JOIN organiza_file_index f ON f.id = p.index_id INNER JOIN organiza_clients c ON c.id = f.client_id
      WHERE p.id = ? AND p.user_id = ?`, [previewId, asText(req.user.id)])
    if (!preview || !req.allowedClientCnpjs.has(asText(preview.cnpj).replace(/\D/g, ''))) return res.status(404).json({ error: 'Visualização não encontrada.' })
    if (new Date(asText(preview.expires_at)).getTime() <= Date.now()) return res.json({ previewId, status: 'expired' })
    res.json({ previewId, status: asText(preview.status), fileName: asText(preview.file_name), mimeType: asText(preview.mime_type), error: asText(preview.error_message), expiresAt: asText(preview.expires_at) })
  } catch (error) { next(error) }
})

app.post('/api/integrations/one/documents/preview/content', requireOneIntegration, async (req, res, next) => {
  try {
    const previewId = asText(req.body?.previewId)
    const preview = await one(`SELECT p.*, c.cnpj FROM organiza_temporary_previews p
      INNER JOIN organiza_file_index f ON f.id = p.index_id INNER JOIN organiza_clients c ON c.id = f.client_id
      WHERE p.id = ? AND p.user_id = ? AND p.status = 'ready'`, [previewId, asText(req.user.id)])
    if (!preview || !req.allowedClientCnpjs.has(asText(preview.cnpj).replace(/\D/g, ''))) return res.status(404).json({ error: 'Visualização não encontrada.' })
    if (new Date(asText(preview.expires_at)).getTime() <= Date.now()) return res.status(410).json({ error: 'Esta cópia temporária expirou.' })
    const blob = await get(asText(preview.blob_url), { access: 'private' })
    if (!blob || blob.statusCode !== 200 || !blob.stream) return res.status(404).json({ error: 'A cópia temporária não está mais disponível.' })
    const bytes = Buffer.from(await new Response(blob.stream).arrayBuffer())
    res.setHeader('Content-Type', asText(preview.mime_type)); res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(asText(preview.file_name))}`); res.setHeader('Cache-Control', 'private, no-store'); res.send(bytes)
  } catch (error) { next(error) }
})

app.post('/api/organizza/previews/:id/upload', requireDeviceAuth, async (req, res, next) => {
  try {
    if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'Arquivo temporário vazio.' })
    const preview = await one("SELECT * FROM organiza_temporary_previews WHERE id = ? AND user_id = ? AND device_id = ? AND status = 'pending'", [req.params.id, asText(req.user.id), asText(req.device.id)])
    if (!preview) return res.status(404).json({ error: 'Solicitação de visualização não encontrada ou já concluída.' })
    if (new Date(asText(preview.expires_at)).getTime() <= Date.now()) return res.status(410).json({ error: 'A solicitação de visualização expirou.' })
    const mimeType = asText(req.get('content-type') || 'application/octet-stream')
    const blob = await put(`one-previews/${asText(req.user.id)}/${asText(preview.id)}/${asText(preview.file_name)}`, req.body, { access: 'private', contentType: mimeType, addRandomSuffix: true })
    await db.execute({ sql: "UPDATE organiza_temporary_previews SET blob_url = ?, mime_type = ?, status = 'ready' WHERE id = ?", args: [blob.url, mimeType, asText(preview.id)] })
    res.status(201).json({ ok: true })
  } catch (error) { next(error) }
})

app.patch('/api/organizza/previews/:id', requireDeviceAuth, async (req, res, next) => {
  try {
    const message = asText(req.body?.message).slice(0, 500) || 'O computador não conseguiu preparar o documento.'
    const result = await db.execute({ sql: "UPDATE organiza_temporary_previews SET status = 'failed', error_message = ? WHERE id = ? AND user_id = ? AND device_id = ? AND status = 'pending'", args: [message, req.params.id, asText(req.user.id), asText(req.device.id)] })
    if (!asNumber(result.rowsAffected)) return res.status(404).json({ error: 'Solicitação de visualização não encontrada.' })
    res.json({ ok: true })
  } catch (error) { next(error) }
})

app.post('/api/organizza/izza/navigation', requireAuth, async (req, res, next) => {
  try {
    const clientId = asText(req.body?.clientId)
    const clientReference = asText(req.body?.clientReference).trim()
    let client = clientId ? await one('SELECT id, code, legal_name AS legalName, cnpj FROM organiza_clients WHERE id = ? AND user_id = ?', [clientId, asText(req.user.id)]) : null
    if (!client && clientReference) {
      const reference = normalizeSearchText(clientReference)
      const digits = clientReference.replace(/\D/g, '')
      const numericTokens = reference.match(/\b\d{1,10}\b/g) || []
      const ignored = new Set(['ME', 'DE', 'DA', 'DO', 'DAS', 'DOS', 'EMPRESA', 'ARQUIVO', 'DOCUMENTO', 'PASTA', 'ALVARA', 'CONTRATO', 'SOCIAL', 'FISCAL', 'CONTABIL', 'PESSOAL', 'JURIDICO'])
      const referenceTerms = reference.split(/\s+/).filter((term) => term.length >= 3 && !ignored.has(term) && !/^\d+$/.test(term))
      const clients = await many('SELECT id, code, legal_name AS legalName, cnpj FROM organiza_clients WHERE user_id = ?', [asText(req.user.id)])
      const matches = clients.filter((item) => {
        const cnpj = asText(item.cnpj).replace(/\D/g, '')
        const legalName = normalizeSearchText(item.legalName)
        const nameTerms = legalName.split(/\s+/).filter((term) => term.length >= 3 && !['LTDA', 'EIRELI', 'COMERCIO', 'SERVICOS'].includes(term))
        const nameOverlap = referenceTerms.filter((term) => nameTerms.includes(term)).length
        return numericTokens.some((token) => comparableClientCode(item.code) === comparableClientCode(token)) || comparableClientCode(item.code) === comparableClientCode(clientReference) || (digits.length === 14 && cnpj === digits) || (reference.length >= 3 && legalName.includes(reference)) || (nameOverlap >= Math.min(2, nameTerms.length, referenceTerms.length) && nameOverlap > 0)
      })
      if (matches.length > 1) return res.status(409).json({ error: `Encontrei ${matches.length} empresas: ${matches.slice(0, 8).map((item) => `${asText(item.code)} — ${asText(item.legalName)}`).join('; ')}. Informe o código ou CNPJ completo.` })
      client = matches[0] || null
    }
    if (!client) return res.status(404).json({ error: 'Não encontrei essa empresa na sua conta.' })
    const resolvedClientId = asText(client.id)
    const rows = await many(`SELECT DISTINCT competence_year AS year, department, competence_month AS month
      FROM organiza_file_index WHERE user_id = ? AND client_id = ? AND competence_year IS NOT NULL
      ORDER BY competence_year DESC, department ASC, competence_month ASC`, [asText(req.user.id), resolvedClientId])
    res.json({
      client: { id: asText(client.id), code: asText(client.code), legalName: asText(client.legalName), cnpj: asText(client.cnpj) },
      options: rows.map((row) => ({ year: asNumber(row.year), department: asText(row.department), month: asNumber(row.month) })).filter((item) => item.year && item.department && item.month),
    })
  } catch (error) { next(error) }
})

app.post('/api/organizza/izza/learning/start', requireAuth, async (req, res, next) => {
  try {
    const query = asText(req.body?.query).trim().slice(0, 500)
    if (query.length < 2) return res.status(400).json({ error: 'Não há uma busca válida para ensinar à Izza.' })
    const learningId = id()
    await db.execute({ sql: 'INSERT INTO organiza_izza_learning_sessions (id, user_id, query) VALUES (?, ?, ?)', args: [learningId, asText(req.user.id), query] })
    res.status(201).json({ learningId })
  } catch (error) { next(error) }
})

app.post('/api/organizza/izza/open', requireAuth, async (req, res, next) => {
  try {
    const indexId = typeof req.body?.indexId === 'string' ? req.body.indexId : ''
    const file = await one('SELECT id, device_id AS deviceId, file_name AS fileName, relative_path AS relativePath, document_type AS documentType, department FROM organiza_file_index WHERE id = ? AND user_id = ?', [indexId, asText(req.user.id)])
    if (!file) return res.status(404).json({ error: 'Documento não encontrado no índice da sua conta.' })
    const targetDevice = await requestingUserDevice(req, asText(file.relativePath))
    if (!targetDevice) return res.status(409).json({ error: 'O documento foi localizado, mas o Organizza Desktop deste usuário está desconectado.' })
    const targetDeviceId = asText(targetDevice.id)
    const commandId = id()
    await db.batch([
      { sql: 'INSERT INTO organiza_commands (id, user_id, device_id, command_type, payload) VALUES (?, ?, ?, ?, ?)', args: [commandId, asText(req.user.id), targetDeviceId, 'file.open', JSON.stringify({ indexId: asText(file.id), relativePath: asText(file.relativePath), fileName: asText(file.fileName) })] },
      { sql: 'INSERT INTO organiza_events (id, user_id, device_id, event_type, status, message, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)', args: [id(), asText(req.user.id), targetDeviceId, 'izza.open_requested', 'info', `A Izza solicitou a abertura de ${asText(file.fileName)} no computador de ${asText(req.user.name)}.`, JSON.stringify({ commandId, indexId: asText(file.id), actorUserId: asText(req.user.actor_id) })] },
    ], 'write')
    await auditOrganizza(req, { action: 'izza.document.open', status: 'requested', message: `Abertura de documento solicitada pela Izza: ${asText(file.fileName)}.`, metadata: { indexId: asText(file.id), deviceId: targetDeviceId, actorUserId: asText(req.user.actor_id) } })
    const learningId = asText(req.body?.learningId)
    if (learningId && asText(file.documentType)) {
      const session = await one("SELECT id, query FROM organiza_izza_learning_sessions WHERE id = ? AND user_id = ? AND status = 'pending'", [learningId, asText(req.user.id)])
      if (session) {
        const phrase = learningSignature(session.query)
        if (!phrase) return res.status(201).json({ command: { id: commandId, deviceId: targetDeviceId }, learned: false })
        await db.batch([
          { sql: `INSERT INTO organiza_izza_learnings (id, user_id, phrase, document_type, department) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(user_id, phrase, document_type, department) DO UPDATE SET confirmations = confirmations + 1, updated_at = CURRENT_TIMESTAMP`, args: [id(), asText(req.user.id), phrase, asText(file.documentType), asText(file.department)] },
          { sql: "UPDATE organiza_izza_learning_sessions SET status = 'confirmed', confirmed_at = CURRENT_TIMESTAMP WHERE id = ?", args: [learningId] },
        ], 'write')
      }
    }
    res.status(201).json({ command: { id: commandId, deviceId: targetDeviceId } })
  } catch (error) { next(error) }
})

app.post('/api/organizza/izza/open-folder', requireAuth, async (req, res, next) => {
  try {
    const relativePath = safeRelativePath(req.body?.relativePath)
    if (!relativePath) return res.status(400).json({ error: 'A pasta solicitada não possui um caminho mapeado válido.' })
    const mapped = await one(`SELECT id FROM organiza_file_index WHERE user_id = ?
      AND (relative_path LIKE ? OR relative_path LIKE ?) LIMIT 1`, [asText(req.user.id), `${relativePath}/%`, `${relativePath}\\%`])
    if (!mapped) return res.status(404).json({ error: 'Essa pasta não pertence ao mapa de arquivos da sua conta.' })
    const targetDevice = await requestingUserDevice(req, relativePath)
    if (!targetDevice) return res.status(409).json({ error: 'A pasta foi localizada, mas o Organizza Desktop deste usuário está desconectado.' })
    const deviceId = asText(targetDevice.id)
    const commandId = id()
    await db.batch([
      { sql: 'INSERT INTO organiza_commands (id, user_id, device_id, command_type, payload) VALUES (?, ?, ?, ?, ?)', args: [commandId, asText(req.user.id), deviceId, 'folder.open', JSON.stringify({ relativePath })] },
      { sql: 'INSERT INTO organiza_events (id, user_id, device_id, event_type, status, message, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)', args: [id(), asText(req.user.id), deviceId, 'izza.folder_open_requested', 'info', `A Izza solicitou a abertura da pasta ${relativePath}.`, JSON.stringify({ commandId, relativePath })] },
    ], 'write')
    res.status(201).json({ command: { id: commandId } })
  } catch (error) { next(error) }
})

app.delete('/api/organizza/data', requireAuth, requireOrganizzaOwner, async (req, res, next) => {
  try {
    const userId = asText(req.user.id)
    const password = typeof req.body?.password === 'string' ? req.body.password : ''
    if (!password || !(await bcrypt.compare(password, asText(req.user.password_hash)))) {
      await auditOrganizza(req, { action: 'organizza.data.clear', status: 'denied', message: 'Tentativa de limpar dados negada: senha atual inválida.' })
      return res.status(401).json({ error: 'Informe a senha atual correta para limpar os dados.' })
    }
    const [clients, rules, files, pending, devices] = await Promise.all([
      one('SELECT COUNT(*) AS total FROM organiza_clients WHERE user_id = ?', [userId]),
      one('SELECT COUNT(*) AS total FROM organiza_rules WHERE user_id = ?', [userId]),
      one('SELECT COUNT(*) AS total FROM organiza_file_index WHERE user_id = ?', [userId]),
      one('SELECT COUNT(*) AS total FROM organiza_pending_files WHERE user_id = ?', [userId]),
      one('SELECT COUNT(*) AS total FROM organiza_devices WHERE user_id = ?', [userId]),
    ])
    const summary = { clients: asNumber(clients.total), rules: asNumber(rules.total), files: asNumber(files.total), pendingFiles: asNumber(pending.total), devices: asNumber(devices.total) }
    await auditOrganizza(req, { action: 'organizza.data.clear', status: 'approved', message: 'Limpeza de dados do Organizza confirmada pelo usuário.', metadata: summary })
    await db.batch([
      { sql: 'DELETE FROM organiza_folder_nodes WHERE structure_id IN (SELECT id FROM organiza_folder_structures WHERE user_id = ?)', args: [userId] },
      { sql: 'DELETE FROM organiza_folder_structures WHERE user_id = ?', args: [userId] },
      { sql: 'DELETE FROM organiza_file_index WHERE user_id = ?', args: [userId] },
      { sql: 'DELETE FROM organiza_pending_files WHERE user_id = ?', args: [userId] },
      { sql: 'DELETE FROM organiza_commands WHERE user_id = ?', args: [userId] },
      { sql: 'DELETE FROM organiza_events WHERE user_id = ?', args: [userId] },
      { sql: 'DELETE FROM organiza_rules WHERE user_id = ?', args: [userId] },
      { sql: 'DELETE FROM organiza_devices WHERE user_id = ?', args: [userId] },
      { sql: 'DELETE FROM organiza_clients WHERE user_id = ?', args: [userId] },
    ], 'write')
    res.json({ ok: true, cleared: summary })
  } catch (error) { next(error) }
})

app.post('/api/organizza/commands/select-root', requireAuth, async (req, res, next) => {
  try {
    const userId = asText(req.user.id)
    const deviceId = typeof req.body?.deviceId === 'string' ? req.body.deviceId : ''
    const device = await one("SELECT * FROM organiza_devices WHERE id = ? AND user_id = ? AND status = 'connected'", [deviceId, userId])
    if (!device) return res.status(400).json({ error: 'Selecione um computador conectado para escolher a pasta.' })
    const commandId = id()
    await db.execute({ sql: 'INSERT INTO organiza_commands (id, user_id, device_id, command_type, payload) VALUES (?, ?, ?, ?, ?)', args: [commandId, userId, asText(device.id), 'structure.select_root', '{}'] })
    await db.execute({ sql: 'INSERT INTO organiza_events (id, user_id, device_id, event_type, status, message, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)', args: [id(), userId, asText(device.id), 'structure.selector_requested', 'info', 'Seleção de pasta solicitada ao desktop.', JSON.stringify({ commandId })] })
    res.status(201).json({ command: { id: commandId } })
  } catch (error) { next(error) }
})

app.post('/api/organizza/commands/create-structure', requireAuth, async (req, res, next) => {
  try {
    const userId = asText(req.user.id)
    const { deviceId, clientIds } = req.body || {}
    const mode = req.body?.mode === 'custom' ? 'custom' : 'standard'
    const onlyMissingClients = Boolean(req.body?.onlyMissingClients)
    const rawPaths = Array.isArray(req.body?.paths) ? req.body.paths : []
    const paths = [...new Set(rawPaths.filter((value) => typeof value === 'string').map((value) => value.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')).filter((value) => value && !value.split('/').includes('..')).slice(0, 80))]
    if (mode === 'custom' && !paths.length) return res.status(400).json({ error: 'Informe ao menos uma pasta ou subpasta para o modelo personalizado.' })
    const device = typeof deviceId === 'string' ? await one("SELECT * FROM organiza_devices WHERE id = ? AND user_id = ? AND status != 'revoked'", [deviceId, userId]) : null
    if (!device) return res.status(400).json({ error: 'Selecione um computador conectado para criar as pastas.' })
    const selectedIds = Array.isArray(clientIds) ? clientIds.filter((clientId) => typeof clientId === 'string' && clientId).slice(0, 2_000) : []
    const query = selectedIds.length ? `SELECT id, code, legal_name AS legalName, cnpj FROM organiza_clients WHERE user_id = ? AND id IN (${selectedIds.map(() => '?').join(', ')}) ORDER BY code ASC` : 'SELECT id, code, legal_name AS legalName, cnpj FROM organiza_clients WHERE user_id = ? ORDER BY code ASC'
    const clients = await many(query, [userId, ...selectedIds])
    if (!clients.length) return res.status(400).json({ error: 'Importe ao menos um cliente antes de criar a estrutura.' })
    if (selectedIds.length && clients.length !== selectedIds.length) return res.status(400).json({ error: 'Um ou mais clientes selecionados não pertencem à sua conta.' })
    const command = { id: id(), year: new Date().getFullYear(), clients: clients.map((client) => ({ id: asText(client.id), code: asText(client.code), legalName: asText(client.legalName), cnpj: asText(client.cnpj) })) }
    await db.execute({ sql: 'INSERT INTO organiza_commands (id, user_id, device_id, command_type, payload) VALUES (?, ?, ?, ?, ?)', args: [command.id, userId, asText(device.id), 'structure.create', JSON.stringify({ year: command.year, clients: command.clients, mode, paths, onlyMissingClients })] })
    await db.execute({ sql: 'INSERT INTO organiza_events (id, user_id, device_id, event_type, status, message, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)', args: [id(), userId, asText(device.id), 'structure.requested', 'info', `Criação de estrutura ${onlyMissingClients ? 'somente para clientes novos' : mode === 'custom' ? 'personalizada' : 'padrão'} solicitada para ${clients.length} cliente(s).`, JSON.stringify({ commandId: command.id, count: clients.length, mode, onlyMissingClients })] })
    res.status(201).json({ command: { id: command.id, clients: clients.length, year: command.year } })
  } catch (error) { next(error) }
})

app.post('/api/organizza/devices/pair', requireAuth, async (req, res, next) => {
  try {
    const { deviceId, name, platform = 'windows', appVersion = '' } = req.body || {}
    const userId = asText(req.user.id)
    const actorUserId = asText(req.user.actor_id || userId)
    if (typeof name !== 'string' || !name.trim() || !['windows'].includes(platform)) return res.status(400).json({ error: 'Informe um computador Windows com nome válido.' })
    let device = typeof deviceId === 'string' && deviceId ? await one('SELECT * FROM organiza_devices WHERE id = ? AND user_id = ?', [deviceId, userId]) : null
    const isNewDevice = !device
    if (device && asText(device.status) === 'revoked') return res.status(403).json({ error: 'Este computador foi revogado.' })
    if (device) {
      await db.execute({ sql: "UPDATE organiza_devices SET name = ?, platform = ?, app_version = ?, actor_user_id = ?, status = 'connected', last_seen_at = ?, updated_at = ? WHERE id = ?", args: [name.trim(), platform, String(appVersion).slice(0, 40), actorUserId, now(), now(), asText(device.id)] })
    } else {
      const newId = id()
      await db.execute({ sql: "INSERT INTO organiza_devices (id, user_id, actor_user_id, name, platform, app_version, status, last_seen_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'connected', ?, ?)", args: [newId, userId, actorUserId, name.trim(), platform, String(appVersion).slice(0, 40), now(), now()] })
      device = await one('SELECT * FROM organiza_devices WHERE id = ?', [newId])
    }
    const current = await one('SELECT * FROM organiza_devices WHERE id = ?', [asText(device.id)])
    const token = jwt.sign({ scope: 'organizza:device', deviceId: asText(current.id) }, jwtSecret, { subject: userId, expiresIn: '180d' })
    await db.execute({ sql: 'INSERT INTO organiza_events (id, user_id, device_id, event_type, status, message, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)', args: [id(), userId, asText(current.id), isNewDevice ? 'device.paired' : 'device.reconnected', 'success', isNewDevice ? `${asText(current.name)} foi conectado ao Organizza.` : `${asText(current.name)} foi reconectado ao Organizza.`, JSON.stringify({ platform, appVersion: asText(current.app_version) })] })
    res.status(201).json({ device: publicDevice(current), token })
  } catch (error) { next(error) }
})

app.patch('/api/organizza/devices/heartbeat', requireDeviceAuth, async (req, res, next) => {
  try {
    const rootPath = typeof req.body?.clientsRootPath === 'string' ? req.body.clientsRootPath.trim().slice(0, 1000) : null
    const structureMode = ['standard', 'custom', 'existing'].includes(req.body?.structureMode) ? req.body.structureMode : null
    const actorEmail = asText(req.body?.actorEmail).trim().toLowerCase().slice(0, 200)
    const actor = actorEmail ? await one(`SELECT id FROM users WHERE email = ? AND account_status = 'active' AND (id = ? OR workspace_owner_id = ?)`, [actorEmail, asText(req.user.id), asText(req.user.id)]) : null
    await db.execute({ sql: "UPDATE organiza_devices SET status = 'connected', clients_root_path = COALESCE(?, clients_root_path), structure_mode = COALESCE(?, structure_mode), actor_user_id = COALESCE(?, actor_user_id), last_seen_at = ?, updated_at = ? WHERE id = ?", args: [rootPath || null, structureMode, actor ? asText(actor.id) : null, now(), now(), asText(req.device.id)] })
    res.json({ device: publicDevice(await one('SELECT * FROM organiza_devices WHERE id = ?', [asText(req.device.id)])) })
  } catch (error) { next(error) }
})

app.patch('/api/organizza/devices/disconnect', requireDeviceAuth, async (req, res, next) => {
  try {
    await db.batch([
      { sql: "UPDATE organiza_devices SET status = 'offline', updated_at = ? WHERE id = ?", args: [now(), asText(req.device.id)] },
      { sql: 'INSERT INTO organiza_events (id, user_id, device_id, event_type, status, message, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)', args: [id(), asText(req.user.id), asText(req.device.id), 'device.disconnected', 'info', `${asText(req.device.name)} foi desconectado manualmente.`, '{}'] },
    ], 'write')
    res.json({ ok: true })
  } catch (error) { next(error) }
})

app.get('/api/organizza/processing-config', requireDeviceAuth, async (req, res, next) => {
  try {
    const userId = asText(req.user.id)
    await ensureNotificationSchedule(userId)
    const [clients, rules, structures, notifications] = await Promise.all([
      many('SELECT id, code, legal_name AS legalName, cnpj FROM organiza_clients WHERE user_id = ? ORDER BY code ASC', [userId]),
      many('SELECT * FROM organiza_rules WHERE user_id = ? AND active = 1 ORDER BY created_at ASC', [userId]),
      many('SELECT * FROM organiza_folder_structures WHERE user_id = ? AND device_id = ? ORDER BY updated_at DESC LIMIT 1', [userId, asText(req.device.id)]),
      many('SELECT * FROM organiza_notification_schedule WHERE user_id = ? AND active = 1 ORDER BY day_of_month, created_at', [userId]),
    ])
    const structure = structures[0]
    const clientFolders = structure ? await many('SELECT client_id AS clientId, relative_path AS relativePath FROM organiza_folder_nodes WHERE structure_id = ? AND client_id IS NOT NULL ORDER BY depth, relative_path', [asText(structure.id)]) : []
    res.json({
      clients: clients.map((client) => ({ id: asText(client.id), code: asText(client.code), legalName: asText(client.legalName), cnpj: asText(client.cnpj) })),
      rules: rules.map(publicRule),
      notifications: notifications.map(publicNotification),
      structure: structure ? { mode: asText(structure.mode), rootPath: asText(structure.root_path), clientFolders: clientFolders.map((folder) => ({ clientId: asText(folder.clientId), relativePath: asText(folder.relativePath) })) } : null,
    })
  } catch (error) { next(error) }
})

app.get('/api/organizza/commands/next', requireDeviceAuth, async (req, res, next) => {
  try {
    const commands = await many("SELECT * FROM organiza_commands WHERE device_id = ? AND user_id = ? AND status = 'pending' ORDER BY created_at ASC LIMIT 10", [asText(req.device.id), asText(req.user.id)])
    if (commands.length) await db.batch(commands.map((command) => ({ sql: "UPDATE organiza_commands SET status = 'processing' WHERE id = ? AND status = 'pending'", args: [asText(command.id)] })), 'write')
    res.json({ commands: commands.map((command) => ({ id: asText(command.id), type: asText(command.command_type), payload: JSON.parse(asText(command.payload) || '{}'), createdAt: asText(command.created_at) })) })
  } catch (error) { next(error) }
})

app.patch('/api/organizza/commands/:id', requireDeviceAuth, async (req, res, next) => {
  try {
    const status = req.body?.status
    const message = typeof req.body?.message === 'string' ? req.body.message.trim().slice(0, 1000) : ''
    if (!['completed', 'failed'].includes(status) || !message) return res.status(400).json({ error: 'Informe o resultado do comando.' })
    const command = await one("SELECT * FROM organiza_commands WHERE id = ? AND device_id = ? AND user_id = ? AND status = 'processing'", [req.params.id, asText(req.device.id), asText(req.user.id)])
    if (!command) return res.status(404).json({ error: 'Comando não encontrado ou já concluído.' })
    await db.execute({ sql: 'UPDATE organiza_commands SET status = ?, result_message = ?, completed_at = ? WHERE id = ?', args: [status, message, now(), asText(command.id)] })
    await db.execute({ sql: 'INSERT INTO organiza_events (id, user_id, device_id, event_type, status, message, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)', args: [id(), asText(req.user.id), asText(req.device.id), 'structure.completed', status === 'completed' ? 'success' : 'error', message, JSON.stringify({ commandId: asText(command.id), commandType: asText(command.command_type) })] })
    res.json({ ok: true })
  } catch (error) { next(error) }
})

app.patch('/api/organizza/pending-files/:id', requireDeviceAuth, async (req, res, next) => {
  try {
    const status = req.body?.status
    const destinationPath = typeof req.body?.destinationPath === 'string' ? req.body.destinationPath.slice(0, 1000) : ''
    if (!['resolved', 'pending'].includes(status)) return res.status(400).json({ error: 'Status de arquivo pendente inválido.' })
    const pending = await one('SELECT * FROM organiza_pending_files WHERE id = ? AND user_id = ? AND device_id = ?', [req.params.id, asText(req.user.id), asText(req.device.id)])
    if (!pending) return res.status(404).json({ error: 'Arquivo pendente não encontrado neste computador.' })
    await db.execute({ sql: 'UPDATE organiza_pending_files SET status = ?, destination_path = ?, resolved_at = ?, updated_at = ? WHERE id = ?', args: [status, destinationPath, status === 'resolved' ? now() : null, now(), asText(pending.id)] })
    res.json({ pendingFile: publicPendingFile(await one('SELECT * FROM organiza_pending_files WHERE id = ?', [asText(pending.id)])) })
  } catch (error) { next(error) }
})

app.post('/api/organizza/events', requireDeviceAuth, async (req, res, next) => {
  try {
    const { eventType, status = 'info', message, metadata = {} } = req.body || {}
    if (typeof eventType !== 'string' || !eventType.trim() || typeof message !== 'string' || !message.trim() || !['info', 'success', 'warning', 'error'].includes(status)) return res.status(400).json({ error: 'Evento inválido.' })
    const serializedMetadata = JSON.stringify(metadata)
    if (serializedMetadata.length > 10_000) return res.status(400).json({ error: 'Metadados do evento excedem o limite permitido.' })
    await db.execute({ sql: 'INSERT INTO organiza_events (id, user_id, device_id, event_type, status, message, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)', args: [id(), asText(req.user.id), asText(req.device.id), eventType.trim().slice(0, 100), status, message.trim().slice(0, 1000), serializedMetadata] })
    res.status(201).json({ ok: true })
  } catch (error) { next(error) }
})

app.get('/api/organizza/events', requireAuth, async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200)
    const events = await many('SELECT id, device_id AS deviceId, event_type AS eventType, status, message, metadata, created_at AS createdAt FROM organiza_events WHERE user_id = ? ORDER BY created_at DESC LIMIT ?', [asText(req.user.id), limit])
    res.json({ events: events.map((event) => ({ id: asText(event.id), deviceId: event.deviceId ? asText(event.deviceId) : null, eventType: asText(event.eventType), status: asText(event.status), message: asText(event.message), metadata: JSON.parse(asText(event.metadata) || '{}'), createdAt: asText(event.createdAt) })) })
  } catch (error) { next(error) }
})

app.get('/api/admin/dashboard', requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    const [users, tokens, agents, executions] = await Promise.all([
      one("SELECT COUNT(*) AS total FROM users WHERE account_status = 'active'"), one('SELECT COALESCE(SUM(input_tokens + output_tokens), 0) AS total FROM token_usage'),
      one("SELECT COUNT(*) AS total FROM agents WHERE status = 'active'"), one("SELECT COUNT(*) AS total FROM execution_logs WHERE event_type = 'agent.execution' AND status = 'success' AND date(created_at) = date('now')"),
    ])
    res.json({ activeUsers: asNumber(users.total), totalTokens: asNumber(tokens.total), activeAgents: asNumber(agents.total), executionsToday: asNumber(executions.total) })
  } catch (error) { next(error) }
})

app.get('/api/admin/users', requireAuth, requireAdmin, async (_req, res, next) => { try { res.json({ users: (await many('SELECT * FROM users ORDER BY created_at ASC')).map(publicUser) }) } catch (error) { next(error) } })

app.get('/api/admin/token-usage', requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    const usage = await many(`SELECT
      users.id AS userId, users.name AS name, users.email AS email, users.role AS role,
      COALESCE(SUM(token_usage.input_tokens), 0) AS inputTokens,
      COALESCE(SUM(token_usage.output_tokens), 0) AS outputTokens,
      COALESCE(SUM(token_usage.input_tokens + token_usage.output_tokens), 0) AS totalTokens,
      MAX(token_usage.created_at) AS lastUsedAt
      FROM users
      LEFT JOIN token_usage ON token_usage.user_id = users.id
      GROUP BY users.id, users.name, users.email, users.role
      ORDER BY totalTokens DESC, users.created_at ASC`)
    res.json({ usage: usage.map((row) => ({
      userId: asText(row.userId), name: asText(row.name), email: asText(row.email), role: asText(row.role),
      inputTokens: asNumber(row.inputTokens), outputTokens: asNumber(row.outputTokens), totalTokens: asNumber(row.totalTokens),
      lastUsedAt: row.lastUsedAt ? asText(row.lastUsedAt) : null,
    })) })
  } catch (error) { next(error) }
})

app.patch('/api/admin/users/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const target = await one('SELECT * FROM users WHERE id = ?', [req.params.id])
    if (!target) return res.status(404).json({ error: 'Usuário não encontrado.' })
    const role = req.body.role ?? asText(target.role), accountStatus = req.body.accountStatus ?? asText(target.account_status), paymentStatus = req.body.paymentStatus ?? asText(target.payment_status)
    if (asText(target.id) === asText(req.user.id) && role !== 'admin') return res.status(400).json({ error: 'A administradora atual não pode remover o próprio acesso.' })
    if (!['admin', 'user'].includes(role) || !['active', 'pending_payment', 'pending_approval', 'suspended'].includes(accountStatus) || !['not_required', 'pending', 'paid', 'failed'].includes(paymentStatus)) return res.status(400).json({ error: 'Dados de atualização inválidos.' })
    await db.execute({ sql: 'UPDATE users SET role = ?, account_status = ?, payment_status = ?, approved_by = ?, approved_at = ?, updated_at = ? WHERE id = ?', args: [role, accountStatus, paymentStatus, accountStatus === 'active' ? asText(req.user.id) : null, accountStatus === 'active' ? now() : null, now(), asText(target.id)] })
    await logEvent({ userId: asText(req.user.id), eventType: 'user.updated', message: `${asText(req.user.name)} atualizou o acesso de ${asText(target.name)}.`, metadata: { targetId: asText(target.id), role, accountStatus } })
    res.json({ user: publicUser(await one('SELECT * FROM users WHERE id = ?', [asText(target.id)])) })
  } catch (error) { next(error) }
})

app.get('/api/admin/agents', requireAuth, requireAdmin, async (_req, res, next) => { try { res.json({ agents: (await many('SELECT id, name, description, status, created_at AS createdAt FROM agents ORDER BY created_at DESC')).map((agent) => ({ id: asText(agent.id), name: asText(agent.name), description: asText(agent.description), status: asText(agent.status), createdAt: asText(agent.createdAt) })) }) } catch (error) { next(error) } })

app.post('/api/admin/agents', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { name, description = '', status = 'draft' } = req.body || {}
    if (typeof name !== 'string' || !name.trim() || !['draft', 'active', 'paused'].includes(status)) return res.status(400).json({ error: 'Informe um nome e status válidos para o agente.' })
    const agent = { id: id(), name: name.trim(), description: String(description).trim(), status, createdBy: asText(req.user.id) }
    await db.execute({ sql: 'INSERT INTO agents (id, name, description, status, created_by) VALUES (?, ?, ?, ?, ?)', args: [agent.id, agent.name, agent.description, agent.status, agent.createdBy] })
    await logEvent({ userId: agent.createdBy, agentId: agent.id, eventType: 'agent.created', status: 'success', message: `${asText(req.user.name)} criou o agente ${agent.name}.` })
    res.status(201).json({ agent })
  } catch (error) { next(error) }
})

app.get('/api/admin/logs', requireAuth, requireAdmin, async (req, res, next) => { try { const limit = Math.min(Number(req.query.limit) || 100, 500); res.json({ logs: (await many('SELECT id, event_type AS eventType, status, message, created_at AS createdAt FROM execution_logs ORDER BY created_at DESC LIMIT ?', [limit])).map((log) => ({ id: asText(log.id), eventType: asText(log.eventType), status: asText(log.status), message: asText(log.message), createdAt: asText(log.createdAt) })) }) } catch (error) { next(error) } })

app.get('/api/admin/logs/download', requireAuth, requireAdmin, async (_req, res, next) => { try { const logs = await many('SELECT * FROM execution_logs ORDER BY created_at DESC'); res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Content-Disposition', `attachment; filename="solutte-logs-${new Date().toISOString().slice(0, 10)}.json"`); res.send(JSON.stringify(logs, null, 2)) } catch (error) { next(error) } })

app.use((error, req, res, _next) => {
  const status = Number(error?.status || error?.statusCode || 0) || (error?.type === 'entity.too.large' ? 413 : 500)
  const message = error instanceof Error ? error.message : String(error || 'Erro interno da aplicação.')
  const supportCode = `ORG-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`
  console.error(JSON.stringify({ level: 'error', event: 'api.request_failed', method: req.method, route: req.originalUrl, requestId: asText(req.get('x-vercel-id')), supportCode, status, error: message }))
  if (status === 413) return res.status(413).json({ error: 'A estrutura possui pastas demais para um único envio. Atualize o Desktop e tente novamente; ele sincroniza a árvore em lotes seguros.', code: 'STRUCTURE_PAYLOAD_TOO_LARGE' })
  res.status(status >= 400 && status < 500 ? status : 500).json({ error: status >= 500 ? `Não foi possível concluir a operação. Tente novamente; se continuar, informe ${supportCode} ao suporte.` : message, code: status >= 500 ? supportCode : 'REQUEST_ERROR' })
})

export default app
