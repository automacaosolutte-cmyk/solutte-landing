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
      'CREATE INDEX IF NOT EXISTS idx_users_status ON users(account_status)',
      'CREATE INDEX IF NOT EXISTS idx_logs_created_at ON execution_logs(created_at DESC)',
    ], 'write')
  }
  return schemaReady
}

const app = express()
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
