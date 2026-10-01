import 'dotenv/config'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import bcrypt from 'bcryptjs'
import Database from 'better-sqlite3'
import cors from 'cors'
import express from 'express'
import jwt from 'jsonwebtoken'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const port = Number(process.env.PORT || 8787)
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'data', 'solutte.db')
const jwtSecret = process.env.JWT_SECRET

if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error('Defina JWT_SECRET com pelo menos 32 caracteres antes de iniciar a API.')
}

fs.mkdirSync(path.dirname(dbPath), { recursive: true })
const db = new Database(dbPath)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    company TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'user')) DEFAULT 'user',
    account_status TEXT NOT NULL CHECK (account_status IN ('active', 'pending_payment', 'pending_approval', 'suspended')) DEFAULT 'pending_payment',
    payment_status TEXT NOT NULL CHECK (payment_status IN ('not_required', 'pending', 'paid', 'failed')) DEFAULT 'pending',
    approved_by TEXT REFERENCES users(id),
    approved_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'paused', 'archived')) DEFAULT 'draft',
    created_by TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS token_usage (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    agent_id TEXT REFERENCES agents(id),
    input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
    output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS execution_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id),
    agent_id TEXT REFERENCES agents(id),
    event_type TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('info', 'success', 'warning', 'error')) DEFAULT 'info',
    message TEXT NOT NULL,
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_users_status ON users(account_status);
  CREATE INDEX IF NOT EXISTS idx_token_usage_user ON token_usage(user_id);
  CREATE INDEX IF NOT EXISTS idx_execution_logs_created_at ON execution_logs(created_at DESC);
`)

const app = express()
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173').split(',').map((origin) => origin.trim())
app.use(cors({ origin: allowedOrigins, methods: ['GET', 'POST', 'PATCH'], allowedHeaders: ['Content-Type', 'Authorization'] }))
app.use(express.json({ limit: '100kb' }))

function id() {
  return crypto.randomUUID()
}

function now() {
  return new Date().toISOString()
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    company: user.company,
    role: user.role,
    accountStatus: user.account_status,
    paymentStatus: user.payment_status,
    createdAt: user.created_at,
  }
}

function logEvent({ userId = null, agentId = null, eventType, status = 'info', message, metadata = {} }) {
  db.prepare('INSERT INTO execution_logs (id, user_id, agent_id, event_type, status, message, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id(), userId, agentId, eventType, status, message, JSON.stringify(metadata))
}

function requireAuth(req, res, next) {
  const token = req.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ error: 'Autenticação necessária.' })
  try {
    const payload = jwt.verify(token, jwtSecret)
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.sub)
    if (!user || user.account_status !== 'active') return res.status(401).json({ error: 'Sua conta não possui acesso ativo.' })
    req.user = user
    next()
  } catch {
    return res.status(401).json({ error: 'Sessão inválida ou expirada.' })
  }
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acesso restrito à administração.' })
  next()
}

app.get('/health', (_req, res) => res.json({ ok: true }))

app.post('/api/auth/register', async (req, res) => {
  const { name, email, company, password } = req.body || {}
  if (![name, email, company, password].every((value) => typeof value === 'string' && value.trim())) {
    return res.status(400).json({ error: 'Preencha nome, e-mail, empresa e senha.' })
  }
  if (password.length < 8) return res.status(400).json({ error: 'A senha deve ter pelo menos 8 caracteres.' })
  const normalizedEmail = email.trim().toLowerCase()
  const hasUsers = db.prepare('SELECT COUNT(*) AS total FROM users').get().total > 0
  const firstUser = !hasUsers
  const passwordHash = await bcrypt.hash(password, 12)
  const user = {
    id: id(), name: name.trim(), email: normalizedEmail, company: company.trim(), passwordHash,
    role: firstUser ? 'admin' : 'user',
    accountStatus: firstUser ? 'active' : 'pending_payment',
    paymentStatus: firstUser ? 'not_required' : 'pending',
  }
  try {
    db.prepare(`INSERT INTO users (id, name, email, company, password_hash, role, account_status, payment_status, approved_at)
      VALUES (@id, @name, @email, @company, @passwordHash, @role, @accountStatus, @paymentStatus, @approvedAt)`)
      .run({ ...user, approvedAt: firstUser ? now() : null })
  } catch (error) {
    if (String(error).includes('UNIQUE')) return res.status(409).json({ error: 'Já existe uma conta para este e-mail.' })
    throw error
  }
  logEvent({ userId: user.id, eventType: 'user.registered', status: 'success', message: `${user.name} realizou o cadastro.`, metadata: { firstUser } })
  const createdUser = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id)
  return res.status(201).json({ user: publicUser(createdUser), firstUser })
})

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {}
  const user = typeof email === 'string' ? db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase()) : null
  if (!user || typeof password !== 'string' || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: 'E-mail ou senha inválidos.' })
  }
  if (user.account_status !== 'active') return res.status(403).json({ error: 'Seu cadastro ainda aguarda pagamento ou aprovação administrativa.', status: user.account_status })
  const token = jwt.sign({ role: user.role }, jwtSecret, { subject: user.id, expiresIn: '8h' })
  logEvent({ userId: user.id, eventType: 'user.login', status: 'success', message: `${user.name} entrou na plataforma.` })
  return res.json({ token, user: publicUser(user) })
})

app.get('/api/auth/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }))

app.get('/api/admin/dashboard', requireAuth, requireAdmin, (_req, res) => {
  const users = db.prepare("SELECT COUNT(*) AS total FROM users WHERE account_status = 'active'").get().total
  const tokens = db.prepare('SELECT COALESCE(SUM(input_tokens + output_tokens), 0) AS total FROM token_usage').get().total
  const agents = db.prepare("SELECT COUNT(*) AS total FROM agents WHERE status = 'active'").get().total
  const executions = db.prepare("SELECT COUNT(*) AS total FROM execution_logs WHERE event_type = 'agent.execution' AND status = 'success' AND date(created_at) = date('now')").get().total
  return res.json({ activeUsers: users, totalTokens: tokens, activeAgents: agents, executionsToday: executions })
})

app.get('/api/admin/users', requireAuth, requireAdmin, (_req, res) => {
  const users = db.prepare('SELECT * FROM users ORDER BY created_at ASC').all().map(publicUser)
  res.json({ users })
})

app.patch('/api/admin/users/:id', requireAuth, requireAdmin, (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id)
  if (!target) return res.status(404).json({ error: 'Usuário não encontrado.' })
  const { role, accountStatus, paymentStatus } = req.body || {}
  if (target.id === req.user.id && role && role !== 'admin') return res.status(400).json({ error: 'O administrador atual não pode remover o próprio acesso administrativo.' })
  const values = {
    role: role ?? target.role,
    accountStatus: accountStatus ?? target.account_status,
    paymentStatus: paymentStatus ?? target.payment_status,
    updatedAt: now(),
  }
  if (!['admin', 'user'].includes(values.role) || !['active', 'pending_payment', 'pending_approval', 'suspended'].includes(values.accountStatus) || !['not_required', 'pending', 'paid', 'failed'].includes(values.paymentStatus)) {
    return res.status(400).json({ error: 'Dados de atualização inválidos.' })
  }
  db.prepare(`UPDATE users SET role = @role, account_status = @accountStatus, payment_status = @paymentStatus,
    approved_by = CASE WHEN @accountStatus = 'active' THEN @approvedBy ELSE approved_by END,
    approved_at = CASE WHEN @accountStatus = 'active' THEN @approvedAt ELSE approved_at END, updated_at = @updatedAt WHERE id = @id`)
    .run({ ...values, id: target.id, approvedBy: req.user.id, approvedAt: now() })
  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(target.id)
  logEvent({ userId: req.user.id, eventType: 'user.updated', message: `${req.user.name} atualizou o acesso de ${target.name}.`, metadata: { targetId: target.id, role: values.role, accountStatus: values.accountStatus } })
  res.json({ user: publicUser(updated) })
})

app.get('/api/admin/agents', requireAuth, requireAdmin, (_req, res) => {
  const agents = db.prepare('SELECT id, name, description, status, created_at AS createdAt FROM agents ORDER BY created_at DESC').all()
  res.json({ agents })
})

app.post('/api/admin/agents', requireAuth, requireAdmin, (req, res) => {
  const { name, description = '', status = 'draft' } = req.body || {}
  if (typeof name !== 'string' || !name.trim() || !['draft', 'active', 'paused'].includes(status)) return res.status(400).json({ error: 'Informe um nome e status válidos para o agente.' })
  const agent = { id: id(), name: name.trim(), description: String(description).trim(), status, createdBy: req.user.id }
  db.prepare('INSERT INTO agents (id, name, description, status, created_by) VALUES (@id, @name, @description, @status, @createdBy)').run(agent)
  logEvent({ userId: req.user.id, agentId: agent.id, eventType: 'agent.created', status: 'success', message: `${req.user.name} criou o agente ${agent.name}.` })
  res.status(201).json({ agent })
})

app.get('/api/admin/logs', requireAuth, requireAdmin, (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500)
  const logs = db.prepare(`SELECT l.id, l.event_type AS eventType, l.status, l.message, l.metadata, l.created_at AS createdAt,
    u.name AS userName, a.name AS agentName FROM execution_logs l LEFT JOIN users u ON u.id = l.user_id LEFT JOIN agents a ON a.id = l.agent_id ORDER BY l.created_at DESC LIMIT ?`).all(limit)
  res.json({ logs })
})

app.get('/api/admin/logs/download', requireAuth, requireAdmin, (_req, res) => {
  const logs = db.prepare('SELECT * FROM execution_logs ORDER BY created_at DESC').all()
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="solutte-logs-${new Date().toISOString().slice(0, 10)}.json"`)
  res.send(JSON.stringify(logs, null, 2))
})

app.use((error, _req, res, _next) => {
  console.error(error)
  res.status(500).json({ error: 'Erro interno da aplicação.' })
})

app.listen(port, () => console.log(`Solutte API disponível em http://localhost:${port}`))
