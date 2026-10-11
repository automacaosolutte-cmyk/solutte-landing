const normalize = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^A-Za-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .toUpperCase()

const parsedTerms = (value) => {
  let terms = value
  if (typeof value === 'string') {
    try { terms = JSON.parse(value || '[]') } catch { terms = [] }
  }
  return Array.isArray(terms) ? [...new Set(terms.map(normalize).filter(Boolean))].slice(0, 12) : []
}

export function findCompatibleDocumentRule(rules, learned) {
  const incomingName = normalize(learned?.name)
  const incomingTerms = new Set(parsedTerms(learned?.terms))
  return (Array.isArray(rules) ? rules : []).find((candidate) => {
    if (normalize(candidate?.name) === incomingName) return true
    const existingTerms = parsedTerms(candidate?.terms)
    return existingTerms.length > 0 && existingTerms.every((term) => incomingTerms.has(term))
  }) || null
}

export function conservativeDocumentRuleUpdate(existing, learned) {
  const existingTerms = parsedTerms(existing?.terms)
  return {
    terms: existingTerms.length ? existingTerms : parsedTerms(learned?.terms),
    destinationPath: String(existing?.destination_path || existing?.destinationPath || learned?.destinationPath || ''),
  }
}
