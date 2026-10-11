import jwt from 'jsonwebtoken'

export const IZZA_WORK_SESSION_SCOPE = 'organizza:izza:interpret'
export const IZZA_WORK_SESSION_AUDIENCE = 'organizza:izza:interpret'
export const IZZA_WORK_SESSION_ISSUER = 'solutte-automations'
export const IZZA_WORK_SESSION_TTL_SECONDS = 12 * 60 * 60

export function issueIzzaWorkSession({ workspaceId, deviceId, secret }) {
  if (!workspaceId || !deviceId || !secret) throw new Error('Workspace, dispositivo e chave de assinatura são obrigatórios.')
  return jwt.sign({ scope: IZZA_WORK_SESSION_SCOPE, deviceId }, secret, {
    algorithm: 'HS256',
    subject: String(workspaceId),
    audience: IZZA_WORK_SESSION_AUDIENCE,
    issuer: IZZA_WORK_SESSION_ISSUER,
    expiresIn: IZZA_WORK_SESSION_TTL_SECONDS,
  })
}

export function verifyIzzaWorkSession(token, secret) {
  const payload = jwt.verify(token, secret, {
    algorithms: ['HS256'],
    audience: IZZA_WORK_SESSION_AUDIENCE,
    issuer: IZZA_WORK_SESSION_ISSUER,
  })
  if (payload.scope !== IZZA_WORK_SESSION_SCOPE || typeof payload.sub !== 'string' || !payload.sub
    || typeof payload.deviceId !== 'string' || !payload.deviceId) {
    throw new Error('Credencial de sessão da Izza inválida.')
  }
  return payload
}

export function createIzzaWorkSessionMiddleware(secret) {
  return (req, res, next) => {
    const token = req.get('authorization')?.replace(/^Bearer\s+/i, '')
    if (!token) return res.status(401).json({ error: 'Sessão de trabalho da Izza necessária.' })
    try {
      const payload = verifyIzzaWorkSession(token, secret)
      req.user = { id: payload.sub }
      req.device = { id: payload.deviceId }
      return next()
    } catch {
      return res.status(401).json({ error: 'Sessão de trabalho da Izza inválida ou expirada.' })
    }
  }
}
