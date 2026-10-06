const VALID_DEPARTMENTS = new Set(['contabil', 'fiscal', 'pessoal', 'juridico'])

function cleanText(value, max = 120) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function cleanTerm(value) {
  return cleanText(value, 80).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()
}

export function normalizeFileIndexLookup(body = {}) {
  const clientId = cleanText(body.clientId, 120)
  if (!clientId) throw new Error('clientId é obrigatório para lookup documental.')
  const department = VALID_DEPARTMENTS.has(body.department) ? body.department : ''
  const competences = [...new Set((Array.isArray(body.competences) ? body.competences : []).slice(0, 12)
    .map((item) => String(item || '').replace(/\D/g, '')).filter((item) => /^(0[1-9]|1[0-2])20\d{2}$/.test(item)))]
  const documentType = cleanText(body.documentType, 120)
  const termGroups = (Array.isArray(body.termGroups) ? body.termGroups : []).slice(0, 8)
    .map((group) => [...new Set((Array.isArray(group) ? group : []).slice(0, 8).map(cleanTerm).filter((term) => term.length >= 2))])
    .filter((group) => group.length)
  const limit = Math.max(1, Math.min(101, Number(body.limit) || 101))
  if (!documentType && !termGroups.length) throw new Error('Informe tipo documental ou termos discriminativos.')
  return { clientId, department, competences, documentType, termGroups, limit }
}

export function buildFileIndexLookupQuery(userId, input) {
  const filters = normalizeFileIndexLookup(input)
  const where = ['f.user_id = ?', 'f.client_id = ?']
  const args = [String(userId), filters.clientId]
  if (filters.department) { where.push('f.department = ?'); args.push(filters.department) }
  if (filters.competences.length) {
    where.push(`(f.competence_year, f.competence_month) IN (VALUES ${filters.competences.map(() => '(?, ?)').join(', ')})`)
    for (const competence of filters.competences) args.push(Number(competence.slice(2)), Number(competence.slice(0, 2)))
  }
  const textual = []
  if (filters.documentType) {
    textual.push('UPPER(f.document_type) = UPPER(?)')
    args.push(filters.documentType)
  }
  const searchable = `UPPER(f.file_name || ' ' || f.document_type || ' ' || f.relative_path)`
  for (const group of filters.termGroups) {
    textual.push(`(${group.map(() => `instr(${searchable}, ?) > 0`).join(' AND ')})`)
    args.push(...group)
  }
  where.push(`(${textual.join(' OR ')})`)
  args.push(filters.limit)
  return {
    filters,
    sql: `SELECT f.relative_path AS relativePath, f.file_name AS fileName, f.client_id AS clientId,
      f.file_hash AS fileHash, f.document_type AS documentType, f.department,
      f.competence_year AS competenceYear, f.competence_month AS competenceMonth, f.indexed_at AS indexedAt,
      c.code, c.legal_name AS legalName, c.cnpj
      FROM organiza_shared_file_index f LEFT JOIN organiza_clients c ON c.user_id = f.user_id AND c.id = f.client_id
      WHERE ${where.join(' AND ')}
      ORDER BY f.competence_year DESC, f.competence_month DESC, f.relative_path LIMIT ?`,
    args,
  }
}
