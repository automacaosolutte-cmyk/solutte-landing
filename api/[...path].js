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
      'CREATE INDEX IF NOT EXISTS idx_users_status ON users(account_status)',
      'CREATE INDEX IF NOT EXISTS idx_logs_created_at ON execution_logs(created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_organiza_devices_user ON organiza_devices(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_organiza_clients_user ON organiza_clients(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_organiza_files_user ON organiza_file_index(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_organiza_events_user_created ON organiza_events(user_id, created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_organiza_commands_device_status ON organiza_commands(device_id, status, created_at)',
    ], 'write')
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
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS')
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

function publicUser(row) {
  return { id: asText(row.id), name: asText(row.name), email: asText(row.email), company: asText(row.company), role: asText(row.role), accountStatus: asText(row.account_status), paymentStatus: asText(row.payment_status), createdAt: asText(row.created_at) }
}

async function logEvent({ userId = null, agentId = null, eventType, status = 'info', message, metadata = {} }) {
  await db.execute({ sql: 'INSERT INTO execution_logs (id, user_id, agent_id, event_type, status, message, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)', args: [id(), userId, agentId, eventType, status, message, JSON.stringify(metadata)] })
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
    status: asText(row.status), clientsRootPath: row.clients_root_path ? asText(row.clients_root_path) : null,
    createdAt: asText(row.created_at), lastSeenAt: row.last_seen_at ? asText(row.last_seen_at) : null,
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
    res.json({ clients: clients.map((client) => ({ id: asText(client.id), code: asText(client.code), legalName: asText(client.legalName), cnpj: asText(client.cnpj), createdAt: asText(client.createdAt) })) })
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
      const legalName = typeof raw?.legalName === 'string' ? raw.legalName.trim().slice(0, 300) : ''
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

app.post('/api/organizza/commands/create-structure', requireAuth, async (req, res, next) => {
  try {
    const userId = asText(req.user.id)
    const { deviceId, clientIds } = req.body || {}
    const device = typeof deviceId === 'string' ? await one("SELECT * FROM organiza_devices WHERE id = ? AND user_id = ? AND status != 'revoked'", [deviceId, userId]) : null
    if (!device) return res.status(400).json({ error: 'Selecione um computador conectado para criar as pastas.' })
    const selectedIds = Array.isArray(clientIds) ? clientIds.filter((clientId) => typeof clientId === 'string' && clientId).slice(0, 2_000) : []
    const query = selectedIds.length ? `SELECT id, code, legal_name AS legalName, cnpj FROM organiza_clients WHERE user_id = ? AND id IN (${selectedIds.map(() => '?').join(', ')}) ORDER BY code ASC` : 'SELECT id, code, legal_name AS legalName, cnpj FROM organiza_clients WHERE user_id = ? ORDER BY code ASC'
    const clients = await many(query, [userId, ...selectedIds])
    if (!clients.length) return res.status(400).json({ error: 'Importe ao menos um cliente antes de criar a estrutura.' })
    if (selectedIds.length && clients.length !== selectedIds.length) return res.status(400).json({ error: 'Um ou mais clientes selecionados não pertencem à sua conta.' })
    const command = { id: id(), year: new Date().getFullYear(), clients: clients.map((client) => ({ id: asText(client.id), code: asText(client.code), legalName: asText(client.legalName), cnpj: asText(client.cnpj) })) }
    await db.execute({ sql: 'INSERT INTO organiza_commands (id, user_id, device_id, command_type, payload) VALUES (?, ?, ?, ?, ?)', args: [command.id, userId, asText(device.id), 'structure.create_standard', JSON.stringify({ year: command.year, clients: command.clients })] })
    await db.execute({ sql: 'INSERT INTO organiza_events (id, user_id, device_id, event_type, status, message, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)', args: [id(), userId, asText(device.id), 'structure.requested', 'info', `Criação da estrutura padrão solicitada para ${clients.length} cliente(s).`, JSON.stringify({ commandId: command.id, count: clients.length })] })
    res.status(201).json({ command: { id: command.id, clients: clients.length, year: command.year } })
  } catch (error) { next(error) }
})

app.post('/api/organizza/devices/pair', requireAuth, async (req, res, next) => {
  try {
    const { deviceId, name, platform = 'windows', appVersion = '' } = req.body || {}
    const userId = asText(req.user.id)
    if (typeof name !== 'string' || !name.trim() || !['windows'].includes(platform)) return res.status(400).json({ error: 'Informe um computador Windows com nome válido.' })
    let device = typeof deviceId === 'string' && deviceId ? await one('SELECT * FROM organiza_devices WHERE id = ? AND user_id = ?', [deviceId, userId]) : null
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
    await db.execute({ sql: 'INSERT INTO organiza_events (id, user_id, device_id, event_type, status, message, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)', args: [id(), userId, asText(current.id), 'device.paired', 'success', `${asText(current.name)} foi conectado ao Organizza.`, JSON.stringify({ platform, appVersion: asText(current.app_version) })] })
    res.status(201).json({ device: publicDevice(current), token })
  } catch (error) { next(error) }
})

app.patch('/api/organizza/devices/heartbeat', requireDeviceAuth, async (req, res, next) => {
  try {
    const rootPath = typeof req.body?.clientsRootPath === 'string' ? req.body.clientsRootPath.trim().slice(0, 1000) : null
    await db.execute({ sql: "UPDATE organiza_devices SET status = 'connected', clients_root_path = COALESCE(?, clients_root_path), last_seen_at = ?, updated_at = ? WHERE id = ?", args: [rootPath || null, now(), now(), asText(req.device.id)] })
    res.json({ device: publicDevice(await one('SELECT * FROM organiza_devices WHERE id = ?', [asText(req.device.id)])) })
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
