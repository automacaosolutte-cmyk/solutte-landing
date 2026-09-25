/**
 * URL externa futura do sistema. Enquanto for `null`, o acesso abre a área
 * interna demonstrativa desta aplicação, em `#acesso`.
 */
export const SYSTEM_ACCESS_URL: string | null = null

/** URL pública da API. Configure VITE_API_URL no deploy da landing. */
export const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

/** URL do sistema Solutte Organizza. Pode ser sobrescrita por variável de ambiente. */
export const ORGANIZZA_URL = (import.meta.env.VITE_ORGANIZZA_URL || 'https://solutte-automations.vercel.app/organizza').replace(/\/$/, '')
