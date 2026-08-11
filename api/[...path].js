import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import { createClient } from '@libsql/client'
import express from 'express'
import jwt from 'jsonwebtoken'

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
        competence_year INTEGER, competence_month INTEGER, indexed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
    ], 'write').then(async () => {
      for (const sql of [
        "ALTER TABLE organiza_rules ADD COLUMN destination_path TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE organiza_devices ADD COLUMN structure_mode TEXT NOT NULL DEFAULT 'standard'",
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
app.use(express.json({ limit: '100kb' }))
app.use(async (_req, _res, next) => { try { await initializeSchema(); next() } catch (error) { next(error) } })

const id = () => crypto.randomUUID()
const now = () => new Date().toISOString()
const one = async (sql, args = []) => (await db.execute({ sql, args })).rows[0]
const many = async (sql, args = []) => (await db.execute({ sql, args })).rows
const asText = (value) => value == null ? '' : String(value)
const asNumber = (value) => Number(value || 0)
const normalizeClientName = (value) => asText(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^A-Za-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
const normalizeRuleTerm = (value) => normalizeClientName(value).toUpperCase()
const normalizeSearchText = (value) => normalizeClientName(value).toUpperCase()
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
    const user = await one('SELECT * FROM users WHERE id = ?', [payload.sub])
    if (!user || asText(user.account_status) !== 'active') return res.status(401).json({ error: 'Sua conta não possui acesso ativo.' })
    req.user = user
    next()
  } catch { return res.status(401).json({ error: 'Sessão inválida ou expirada.' }) }
}

function requireAdmin(req, res, next) {
  if (asText(req.user.role) !== 'admin') return res.status(403).json({ error: 'Acesso restrito à administração.' })
  next()
}

function publicDevice(row) {
  return {
    id: asText(row.id), name: asText(row.name), platform: asText(row.platform), appVersion: asText(row.app_version),
    status: asText(row.status), clientsRootPath: row.clients_root_path ? asText(row.clients_root_path) : null, structureMode: asText(row.structure_mode || 'standard'),
    createdAt: asText(row.created_at), lastSeenAt: row.last_seen_at ? asText(row.last_seen_at) : null,
  }
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

app.get('/api/auth/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }))

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

app.get('/api/organizza/structures', requireAuth, async (req, res, next) => {
  try {
    const structures = await many('SELECT * FROM organiza_folder_structures WHERE user_id = ? ORDER BY updated_at DESC LIMIT 20', [asText(req.user.id)])
    const selected = structures[0]
    const nodes = selected ? await many('SELECT client_id AS clientId, relative_path AS relativePath, parent_path AS parentPath, folder_name AS folderName, depth FROM organiza_folder_nodes WHERE structure_id = ? ORDER BY depth, relative_path LIMIT 5000', [asText(selected.id)]) : []
    res.json({ structures: structures.map(publicStructure), activeStructure: selected ? { ...publicStructure(selected), nodes: nodes.map((node) => ({ clientId: node.clientId ? asText(node.clientId) : null, relativePath: asText(node.relativePath), parentPath: asText(node.parentPath), folderName: asText(node.folderName), depth: asNumber(node.depth) })) } : null })
  } catch (error) { next(error) }
})

app.post('/api/organizza/structures/sync', requireDeviceAuth, async (req, res, next) => {
  try {
    const mode = req.body?.mode
    const rootPath = typeof req.body?.rootPath === 'string' ? req.body.rootPath.trim().slice(0, 1000) : ''
    const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 120) : 'Estrutura de pastas'
    const rawNodes = Array.isArray(req.body?.nodes) ? req.body.nodes.slice(0, 5000) : []
    if (!['existing', 'standard', 'custom'].includes(mode) || !rootPath) return res.status(400).json({ error: 'Informe o modo e a pasta raiz da estrutura.' })
    const clientIds = new Set((await many('SELECT id FROM organiza_clients WHERE user_id = ?', [asText(req.user.id)])).map((client) => asText(client.id)))
    const nodes = rawNodes.map((raw) => {
      const relativePath = typeof raw?.relativePath === 'string' ? raw.relativePath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').slice(0, 1000) : ''
      const parentPath = typeof raw?.parentPath === 'string' ? raw.parentPath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').slice(0, 1000) : ''
      const folderName = typeof raw?.folderName === 'string' ? raw.folderName.trim().slice(0, 240) : ''
      const depth = Number(raw?.depth)
      const clientId = typeof raw?.clientId === 'string' && clientIds.has(raw.clientId) ? raw.clientId : null
      if (!relativePath || !folderName || !Number.isInteger(depth) || depth < 1 || relativePath.split('/').some((part) => !part || part === '.' || part === '..')) throw new Error('A árvore de pastas recebida é inválida.')
      return { relativePath, parentPath, folderName, depth, clientId }
    })
    const userId = asText(req.user.id); const deviceId = asText(req.device.id)
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
    if (nodes.length) await db.batch(nodes.map((node) => ({ sql: 'INSERT INTO organiza_folder_nodes (id, structure_id, client_id, relative_path, parent_path, folder_name, depth) VALUES (?, ?, ?, ?, ?, ?, ?)', args: [id(), asText(structure.id), node.clientId, node.relativePath, node.parentPath, node.folderName, node.depth] })), 'write')
    await db.execute({ sql: "UPDATE organiza_devices SET structure_mode = ?, clients_root_path = ?, updated_at = ? WHERE id = ?", args: [mode, rootPath, now(), deviceId] })
    await db.execute({ sql: 'INSERT INTO organiza_events (id, user_id, device_id, event_type, status, message, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)', args: [id(), userId, deviceId, 'structure.scanned', 'success', `${nodes.length} pasta(s) da estrutura foram registradas sem leitura de arquivos.`, JSON.stringify({ structureId: asText(structure.id), mode, folderCount: nodes.length })] })
    res.status(201).json({ structure: publicStructure(structure) })
  } catch (error) { next(error) }
})

app.get('/api/organizza/rules', requireAuth, async (req, res, next) => {
  try {
    const rules = await many('SELECT * FROM organiza_rules WHERE user_id = ? ORDER BY created_at DESC', [asText(req.user.id)])
    res.json({ rules: rules.map(publicRule) })
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
    const rows = await many("SELECT * FROM organiza_pending_files WHERE user_id = ? AND status IN ('pending', 'resolution_requested') ORDER BY created_at DESC LIMIT 100", [asText(req.user.id)])
    res.json({ pendingFiles: rows.map(publicPendingFile) })
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
    const pendingId = id()
    await db.execute({ sql: 'INSERT INTO organiza_pending_files (id, user_id, device_id, file_name, relative_path, reason, detected_client_id, detected_cnpj, detected_competence, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', args: [pendingId, asText(req.user.id), asText(req.device.id), fileName, relativePath, reason, client ? asText(client.id) : null, detectedCnpj, detectedCompetence, now()] })
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
    const resolution = { clientId: asText(client.id), department, competence, destinationPath, createRule: Boolean(createdRule), ruleId: createdRule?.id || null }
    await db.batch([
      { sql: 'UPDATE organiza_pending_files SET status = ?, resolution = ?, updated_at = ? WHERE id = ?', args: ['resolution_requested', JSON.stringify(resolution), now(), asText(pending.id)] },
      { sql: 'INSERT INTO organiza_commands (id, user_id, device_id, command_type, payload) VALUES (?, ?, ?, ?, ?)', args: [commandId, asText(req.user.id), asText(pending.device_id), 'file.resolve', JSON.stringify({ pendingFileId: asText(pending.id), fileName: asText(pending.file_name), client: { id: asText(client.id), code: asText(client.code), legalName: asText(client.legalName), cnpj: asText(client.cnpj) }, department, competence, destinationPath })] },
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
      if (!fileName || !relativePath) throw new Error('Um item do índice não possui nome ou caminho relativo válido.')
      return { fileName, relativePath, clientId, department, competenceMonth, competenceYear, documentType }
    })
    await db.batch(files.map((file) => ({
      sql: `INSERT INTO organiza_file_index (id, user_id, device_id, client_id, file_name, relative_path, document_type, department, competence_year, competence_month, indexed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(device_id, relative_path) DO UPDATE SET client_id = excluded.client_id, file_name = excluded.file_name, document_type = excluded.document_type, department = excluded.department, competence_year = excluded.competence_year, competence_month = excluded.competence_month, indexed_at = excluded.indexed_at`,
      args: [id(), userId, asText(req.device.id), file.clientId, file.fileName, file.relativePath, file.documentType, file.department, file.competenceYear, file.competenceMonth, now()],
    })), 'write')
    res.status(201).json({ indexed: files.length })
  } catch (error) {
    if (error instanceof Error && /índice/i.test(error.message)) return res.status(400).json({ error: error.message })
    next(error)
  }
})

app.post('/api/organizza/izza/search', requireAuth, async (req, res, next) => {
  try {
    const query = typeof req.body?.query === 'string' ? req.body.query.trim().slice(0, 500) : ''
    if (query.length < 2) return res.status(400).json({ error: 'Escreva ao menos dois caracteres para a Izza pesquisar.' })
    const userId = asText(req.user.id)
    const text = normalizeSearchText(query)
    const digits = query.replace(/\D/g, '')
    const competenceMatch = digits.match(/(?:^|\D)(0[1-9]|1[0-2])(20\d{2})(?:\D|$)/)
    const competence = competenceMatch ? { month: Number(competenceMatch[1]), year: Number(competenceMatch[2]) } : null
    const namedMonths = { JANEIRO: 1, FEVEREIRO: 2, MARCO: 3, ABRIL: 4, MAIO: 5, JUNHO: 6, JULHO: 7, AGOSTO: 8, SETEMBRO: 9, OUTUBRO: 10, NOVEMBRO: 11, DEZEMBRO: 12 }
    const namedMonth = Object.entries(namedMonths).find(([name]) => new RegExp(`\\b${name}\\b`).test(text))?.[1] || 0
    const requestedYear = Number(text.match(/20\d{2}/)?.[0] || 0)
    const requestedDepartment = /\b(FISCAL|DAS|ICMS|ISS)\b/.test(text) ? 'fiscal'
      : /\b(CONTABIL|BALANCETE|EXTRATO|FINANCEIRO)\b/.test(text) ? 'contabil'
        : /\b(PESSOAL|FOLHA|HOLERITE|FUNCIONARIO)\b/.test(text) ? 'pessoal'
          : /\b(JURIDIC|CONTRATO)\b/.test(text) ? 'juridico' : ''
    const terms = text.split(/\s+/).filter((term) => term.length >= 2 && !['ME', 'DO', 'DA', 'DE', 'EM', 'PARA', 'COM', 'QUE', 'UM', 'UMA', 'O', 'A'].includes(term)).slice(0, 12)
    const rows = await many(`SELECT f.id, f.device_id AS deviceId, f.file_name AS fileName, f.relative_path AS relativePath, f.document_type AS documentType, f.department,
      f.competence_year AS competenceYear, f.competence_month AS competenceMonth, f.indexed_at AS indexedAt,
      c.code, c.legal_name AS legalName, c.cnpj
      FROM organiza_file_index f LEFT JOIN organiza_clients c ON c.id = f.client_id
      WHERE f.user_id = ? ORDER BY f.indexed_at DESC LIMIT 3000`, [userId])
    const ranked = rows.map((row) => {
      const haystack = normalizeSearchText(`${asText(row.fileName)} ${asText(row.documentType)} ${asText(row.code)} ${asText(row.legalName)} ${asText(row.cnpj)}`)
      let score = terms.reduce((total, term) => total + (haystack.includes(term) ? 3 : 0), 0)
      if (digits.length >= 3 && asText(row.cnpj).includes(digits)) score += 10
      if (digits.length >= 1 && asText(row.code) === digits) score += 8
      if (competence && asNumber(row.competenceMonth) === competence.month && asNumber(row.competenceYear) === competence.year) score += 8
      if (namedMonth && asNumber(row.competenceMonth) === namedMonth) score += 6
      if (requestedYear && asNumber(row.competenceYear) === requestedYear) score += 4
      if (requestedDepartment && asText(row.department) === requestedDepartment) score += 5
      return { row, score }
    }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || asText(b.row.indexedAt).localeCompare(asText(a.row.indexedAt))).slice(0, 20)
    const results = ranked.map(({ row }) => ({
      id: asText(row.id), deviceId: asText(row.deviceId), fileName: asText(row.fileName), relativePath: asText(row.relativePath), documentType: asText(row.documentType), department: asText(row.department),
      competence: row.competenceMonth && row.competenceYear ? `${String(asNumber(row.competenceMonth)).padStart(2, '0')}${asNumber(row.competenceYear)}` : '',
      client: row.legalName ? { code: asText(row.code).startsWith('SEM-CODIGO-') ? '' : asText(row.code), legalName: asText(row.legalName), cnpj: asText(row.cnpj) } : null,
      indexedAt: asText(row.indexedAt),
    }))
    const summary = results.length ? `${results.length} documento(s) localizado(s) no índice local.` : 'Nenhum documento correspondente foi localizado no índice.'
    res.json({ query, deterministic: true, summary, results })
  } catch (error) { next(error) }
})

app.post('/api/organizza/izza/open', requireAuth, async (req, res, next) => {
  try {
    const indexId = typeof req.body?.indexId === 'string' ? req.body.indexId : ''
    const file = await one('SELECT id, device_id AS deviceId, file_name AS fileName, relative_path AS relativePath FROM organiza_file_index WHERE id = ? AND user_id = ?', [indexId, asText(req.user.id)])
    if (!file) return res.status(404).json({ error: 'Documento não encontrado no índice da sua conta.' })
    const commandId = id()
    await db.batch([
      { sql: 'INSERT INTO organiza_commands (id, user_id, device_id, command_type, payload) VALUES (?, ?, ?, ?, ?)', args: [commandId, asText(req.user.id), asText(file.deviceId), 'file.open', JSON.stringify({ indexId: asText(file.id), relativePath: asText(file.relativePath), fileName: asText(file.fileName) })] },
      { sql: 'INSERT INTO organiza_events (id, user_id, device_id, event_type, status, message, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)', args: [id(), asText(req.user.id), asText(file.deviceId), 'izza.open_requested', 'info', `A Izza solicitou a abertura de ${asText(file.fileName)}.`, JSON.stringify({ commandId, indexId: asText(file.id) })] },
    ], 'write')
    await auditOrganizza(req, { action: 'izza.document.open', status: 'requested', message: `Abertura de documento solicitada pela Izza: ${asText(file.fileName)}.`, metadata: { indexId: asText(file.id), deviceId: asText(file.deviceId) } })
    res.status(201).json({ command: { id: commandId } })
  } catch (error) { next(error) }
})

app.delete('/api/organizza/data', requireAuth, async (req, res, next) => {
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
    if (typeof name !== 'string' || !name.trim() || !['windows'].includes(platform)) return res.status(400).json({ error: 'Informe um computador Windows com nome válido.' })
    let device = typeof deviceId === 'string' && deviceId ? await one('SELECT * FROM organiza_devices WHERE id = ? AND user_id = ?', [deviceId, userId]) : null
    const isNewDevice = !device
    if (device && asText(device.status) === 'revoked') return res.status(403).json({ error: 'Este computador foi revogado.' })
    if (device) {
      await db.execute({ sql: "UPDATE organiza_devices SET name = ?, platform = ?, app_version = ?, status = 'connected', last_seen_at = ?, updated_at = ? WHERE id = ?", args: [name.trim(), platform, String(appVersion).slice(0, 40), now(), now(), asText(device.id)] })
    } else {
      const newId = id()
      await db.execute({ sql: "INSERT INTO organiza_devices (id, user_id, name, platform, app_version, status, last_seen_at, updated_at) VALUES (?, ?, ?, ?, ?, 'connected', ?, ?)", args: [newId, userId, name.trim(), platform, String(appVersion).slice(0, 40), now(), now()] })
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
    await db.execute({ sql: "UPDATE organiza_devices SET status = 'connected', clients_root_path = COALESCE(?, clients_root_path), structure_mode = COALESCE(?, structure_mode), last_seen_at = ?, updated_at = ? WHERE id = ?", args: [rootPath || null, structureMode, now(), now(), asText(req.device.id)] })
    res.json({ device: publicDevice(await one('SELECT * FROM organiza_devices WHERE id = ?', [asText(req.device.id)])) })
  } catch (error) { next(error) }
})

app.get('/api/organizza/processing-config', requireDeviceAuth, async (req, res, next) => {
  try {
    const userId = asText(req.user.id)
    const [clients, rules, structures] = await Promise.all([
      many('SELECT id, code, legal_name AS legalName, cnpj FROM organiza_clients WHERE user_id = ? ORDER BY code ASC', [userId]),
      many('SELECT * FROM organiza_rules WHERE user_id = ? AND active = 1 ORDER BY created_at ASC', [userId]),
      many('SELECT * FROM organiza_folder_structures WHERE user_id = ? AND device_id = ? ORDER BY updated_at DESC LIMIT 1', [userId, asText(req.device.id)]),
    ])
    const structure = structures[0]
    const clientFolders = structure ? await many('SELECT client_id AS clientId, relative_path AS relativePath FROM organiza_folder_nodes WHERE structure_id = ? AND client_id IS NOT NULL ORDER BY depth, relative_path', [asText(structure.id)]) : []
    res.json({
      clients: clients.map((client) => ({ id: asText(client.id), code: asText(client.code), legalName: asText(client.legalName), cnpj: asText(client.cnpj) })),
      rules: rules.map(publicRule),
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

app.use((error, _req, res, _next) => { console.error(error); res.status(500).json({ error: 'Erro interno da aplicação.' }) })

export default app
