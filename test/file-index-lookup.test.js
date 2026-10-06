import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { buildFileIndexLookupQuery, normalizeFileIndexLookup } from '../lib/file-index-lookup.js'

function explain(input) {
  const db = new DatabaseSync(':memory:')
  db.exec(`CREATE TABLE organiza_shared_file_index (user_id TEXT, relative_path TEXT, file_name TEXT, client_id TEXT,
    file_hash TEXT, document_type TEXT, department TEXT, competence_year INTEGER, competence_month INTEGER, indexed_at TEXT,
    PRIMARY KEY(user_id, relative_path));
    CREATE TABLE organiza_clients (id TEXT PRIMARY KEY, user_id TEXT, code TEXT, legal_name TEXT, cnpj TEXT);
    CREATE INDEX idx_organiza_shared_file_map_lookup ON organiza_shared_file_index(user_id, client_id, competence_year, competence_month);`)
  const query = buildFileIndexLookupQuery('workspace-1', input)
  const plan = db.prepare(`EXPLAIN QUERY PLAN ${query.sql}`).all(...query.args).map((row) => row.detail).join(' | ')
  db.close()
  return plan
}

test('lookup exige cliente e aplica limites rígidos', () => {
  assert.throws(() => normalizeFileIndexLookup({ documentType: 'DAS' }), /clientId/)
  const normalized = normalizeFileIndexLookup({ clientId: 'c1', competences: Array(20).fill('092026'), termGroups: Array(12).fill(Array(12).fill('DAS')), limit: 999 })
  assert.equal(normalized.competences.length, 1)
  assert.equal(normalized.termGroups.length, 8)
  assert.equal(normalized.termGroups[0].length, 1)
  assert.equal(normalized.limit, 101)
})

test('SQL é parametrizado, restringe workspace/cliente e filtra antes do LIMIT', () => {
  const query = buildFileIndexLookupQuery('workspace-1', { clientId: 'c45', department: 'fiscal', competences: ['092028'], documentType: 'Livro', termGroups: [['LIVRO', 'SERVICOS']], limit: 50 })
  assert.match(query.sql, /f\.user_id = \? AND f\.client_id = \?/)
  assert.match(query.sql, /f\.department = \?/)
  assert.match(query.sql, /IN \(VALUES \(\?, \?\)\)/)
  assert.match(query.sql, /instr\(/)
  assert.match(query.sql, /WHERE[\s\S]+LIMIT \?$/)
  assert.doesNotMatch(query.sql, /workspace-1|c45|LIVRO/)
})

for (const [name, input] of [
  ['periódico de uma competência', { clientId: 'c45', department: 'fiscal', competences: ['092028'], documentType: 'DAS' }],
  ['multiperíodo', { clientId: 'c45', department: 'fiscal', competences: ['072028', '082028', '092028'], documentType: 'DAS' }],
  ['não periódico', { clientId: 'c45', department: 'juridico', documentType: 'Contrato Social' }],
  ['textual estruturado', { clientId: 'c45', department: 'fiscal', competences: ['092028'], termGroups: [['LIVRO', 'SERVICOS']] }],
]) test(`EXPLAIN usa SEARCH no lookup ${name}`, () => {
  const plan = explain(input)
  assert.match(plan, /SEARCH f USING INDEX idx_organiza_shared_file_map_lookup/)
  assert.doesNotMatch(plan, /SCAN organiza_shared_file_index|SCAN f/)
})
