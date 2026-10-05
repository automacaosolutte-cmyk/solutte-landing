import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import jwt from 'jsonwebtoken'
import {
  createIzzaWorkSessionMiddleware,
  issueIzzaWorkSession,
  IZZA_WORK_SESSION_AUDIENCE,
  IZZA_WORK_SESSION_ISSUER,
  IZZA_WORK_SESSION_SCOPE,
  IZZA_WORK_SESSION_TTL_SECONDS,
} from '../lib/izza-work-session.js'

const secret = 'test-only-session-secret-not-used-by-the-application'
const validToken = () => issueIzzaWorkSession({ workspaceId: 'workspace-123', deviceId: 'device-456', secret })

function invokeMiddleware(token, body = {}) {
  const req = {
    body,
    get: (name) => name.toLowerCase() === 'authorization' && token ? `Bearer ${token}` : undefined,
  }
  const response = { code: 200, data: null, status(code) { this.code = code; return this }, json(data) { this.data = data; return this } }
  let nextCalls = 0
  createIzzaWorkSessionMiddleware(secret)(req, response, () => { nextCalls += 1 })
  return { req, response, nextCalls }
}

test('sessão válida autoriza apenas identidade assinada e expira em 12 horas', () => {
  const token = validToken()
  const payload = jwt.verify(token, secret, { audience: IZZA_WORK_SESSION_AUDIENCE, issuer: IZZA_WORK_SESSION_ISSUER })
  assert.equal(payload.scope, IZZA_WORK_SESSION_SCOPE)
  assert.equal(payload.sub, 'workspace-123')
  assert.equal(payload.deviceId, 'device-456')
  assert.equal(payload.exp - payload.iat, IZZA_WORK_SESSION_TTL_SECONDS)
  const result = invokeMiddleware(token)
  assert.equal(result.nextCalls, 1)
  assert.equal(result.req.user.id, 'workspace-123')
  assert.equal(result.req.device.id, 'device-456')
})

test('token adulterado é negado', () => {
  const token = validToken()
  const [header, encodedPayload, signature] = token.split('.')
  const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'))
  const tamperedPayload = Buffer.from(JSON.stringify({ ...payload, sub: 'attacker-workspace' })).toString('base64url')
  const tampered = `${header}.${tamperedPayload}.${signature}`
  const result = invokeMiddleware(tampered)
  assert.equal(result.nextCalls, 0)
  assert.equal(result.response.code, 401)
})

test('token expirado é negado', () => {
  const expired = jwt.sign({ scope: IZZA_WORK_SESSION_SCOPE, deviceId: 'device-456' }, secret, {
    algorithm: 'HS256', subject: 'workspace-123', audience: IZZA_WORK_SESSION_AUDIENCE,
    issuer: IZZA_WORK_SESSION_ISSUER, expiresIn: -1,
  })
  const result = invokeMiddleware(expired)
  assert.equal(result.nextCalls, 0)
  assert.equal(result.response.code, 401)
})

test('audience ou scope incorretos são negados', () => {
  const wrongAudience = jwt.sign({ scope: IZZA_WORK_SESSION_SCOPE, deviceId: 'device-456' }, secret, {
    algorithm: 'HS256', subject: 'workspace-123', audience: 'other-endpoint', issuer: IZZA_WORK_SESSION_ISSUER, expiresIn: '12h',
  })
  const wrongScope = jwt.sign({ scope: 'organizza:device', deviceId: 'device-456' }, secret, {
    algorithm: 'HS256', subject: 'workspace-123', audience: IZZA_WORK_SESSION_AUDIENCE, issuer: IZZA_WORK_SESSION_ISSUER, expiresIn: '12h',
  })
  assert.equal(invokeMiddleware(wrongAudience).response.code, 401)
  assert.equal(invokeMiddleware(wrongScope).response.code, 401)
})

test('body não substitui workspace, dispositivo ou role assinados', () => {
  const result = invokeMiddleware(validToken(), { workspace_id: 'attacker-workspace', device_id: 'attacker-device', role: 'admin' })
  assert.equal(result.nextCalls, 1)
  assert.equal(result.req.user.id, 'workspace-123')
  assert.equal(result.req.device.id, 'device-456')
  assert.equal(result.req.user.role, undefined)
})

test('chamada sem autenticação é negada', () => {
  const result = invokeMiddleware('')
  assert.equal(result.nextCalls, 0)
  assert.equal(result.response.code, 401)
})

test('rota de interpretação usa somente a Work Session e não consulta device/user na autenticação', () => {
  const source = readFileSync(new URL('../api/[...path].js', import.meta.url), 'utf8')
  const routeStart = source.indexOf("app.post('/api/organizza/izza/interpret'")
  const routeEnd = source.indexOf("app.post('/api/organizza/izza/search'", routeStart)
  assert.notEqual(routeStart, -1)
  assert.notEqual(routeEnd, -1)
  const route = source.slice(routeStart, routeEnd)
  assert.match(route, /requireIzzaWorkSession/)
  assert.doesNotMatch(route, /requireDeviceAuth|\bone\(|\bmany\(/)
  const authSource = readFileSync(new URL('../lib/izza-work-session.js', import.meta.url), 'utf8')
  assert.doesNotMatch(authSource, /SELECT|db\.execute|organiza_devices|FROM users/)
})

test('contrato de interpretação preserva modos temporais e suporta lista explícita', () => {
  const source = readFileSync(new URL('../api/[...path].js', import.meta.url), 'utf8')
  const start = source.indexOf('async function interpretIzzaRequestWithAI')
  const end = source.indexOf('async function loadOpenAIOrganizationUsage', start)
  const contract = source.slice(start, end)
  assert.match(contract, /competences: \{ type: 'array', maxItems: 36/)
  assert.match(contract, /temporalMode: \{ type: 'string'/)
  assert.match(contract, /temporalCount: \{ type: 'integer'/)
  assert.match(contract, /all_available/)
  assert.match(contract, /month_across_years/)
  assert.match(contract, /year_all/)
  assert.match(contract, /month_year_range/)
  assert.match(contract, /yearStart/)
  assert.match(contract, /yearEnd/)
  assert.match(contract, /competenceStart/)
  assert.match(contract, /competenceEnd/)
  assert.match(contract, /recentMonths/)
  assert.match(contract, /recentMonths e deixe o calendário para o código local/)
  assert.match(contract, /Array\.isArray\(output\.competences\)/)
  assert.match(contract, /\.slice\(0, 36\)/)
})

test('telemetria registra uma única escrita por inferência sem conteúdo da pergunta', () => {
  const source = readFileSync(new URL('../api/[...path].js', import.meta.url), 'utf8')
  const schemaStart = source.indexOf('CREATE TABLE IF NOT EXISTS token_usage')
  const schemaEnd = source.indexOf('CREATE TABLE IF NOT EXISTS execution_logs', schemaStart)
  const schema = source.slice(schemaStart, schemaEnd)
  const start = source.indexOf('async function interpretIzzaRequestWithAI')
  const end = source.indexOf('async function loadOpenAIOrganizationUsage', start)
  const contract = source.slice(start, end)
  assert.match(schema, /device_id TEXT, model TEXT, origin TEXT, reason_for_ai TEXT/)
  assert.match(schema, /cached_input_tokens INTEGER/)
  assert.match(schema, /duration_ms INTEGER, status TEXT, openai_request_id TEXT/)
  assert.equal((contract.match(/INSERT INTO token_usage/g) || []).length, 1)
  assert.match(contract, /device_id, model, origin, reason_for_ai/)
  assert.match(contract, /cached_input_tokens, duration_ms, status, openai_request_id/)
  const insert = contract.match(/INSERT INTO token_usage[\s\S]*?VALUES \([^)]+\)/)?.[0] || ''
  assert.doesNotMatch(insert, /\bintent\b|\bmode\b/)
  assert.doesNotMatch(contract, /query_text|prompt_text/)
})

test('rotas de busca legadas falham sem alcançar searchWithIzza', () => {
  const source = readFileSync(new URL('../api/[...path].js', import.meta.url), 'utf8')
  assert.match(source, /const legacyIzzaSearchUnavailable = \(_req, res\) => res\.status\(410\)\.json\(/)
  assert.match(source, /app\.post\('\/api\/organizza\/izza\/search', legacyIzzaSearchUnavailable\)/)
  assert.match(source, /app\.post\('\/api\/integrations\/one\/izza\/search', legacyIzzaSearchUnavailable\)/)
  assert.equal((source.match(/\bsearchWithIzza\b/g) || []).length, 1, 'searchWithIzza deve permanecer apenas como definição legada sem consumidores')
  assert.match(source, /code: 'LEGACY_IZZA_SEARCH_DISABLED'/)
})
