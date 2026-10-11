import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { conservativeDocumentRuleUpdate, findCompatibleDocumentRule } from '../lib/document-rule-learning.js'

const testDirectory = path.dirname(fileURLToPath(import.meta.url))

test('reutiliza regra DAS existente sem estreitar sua cobertura', () => {
  const existing = { id: 'das', name: 'DAS', terms: JSON.stringify(['DAS']), destination_path: '' }
  const compatible = findCompatibleDocumentRule([existing], { name: 'DAS', terms: ['DAS', 'MENSAL'] })
  assert.equal(compatible?.id, 'das')
  assert.deepEqual(conservativeDocumentRuleUpdate(compatible, { terms: ['DAS', 'MENSAL'] }).terms, ['DAS'])
})

test('reutiliza regra suficiente mesmo quando o novo nome varia', () => {
  const existing = { id: 'societario', name: 'Alteração contratual', terms: JSON.stringify(['ALTERACAO', 'CONTRATUAL']) }
  const compatible = findCompatibleDocumentRule([existing], { name: 'Documento societário', terms: ['ALTERACAO', 'CONTRATUAL', 'SOCIEDADE'] })
  assert.equal(compatible?.id, 'societario')
})

test('não considera compatível regra que exige termos ausentes no novo aprendizado', () => {
  const existing = { id: 'mensal', name: 'DAS mensal específico', terms: JSON.stringify(['DAS', 'MENSAL']) }
  assert.equal(findCompatibleDocumentRule([existing], { name: 'DAS', terms: ['DAS'] }), null)
})

test('preserva destino existente e só preenche destino vazio', () => {
  assert.equal(conservativeDocumentRuleUpdate({ terms: '["DAS"]', destination_path: 'Guias' }, { terms: ['DAS'], destinationPath: 'Outro' }).destinationPath, 'Guias')
  assert.equal(conservativeDocumentRuleUpdate({ terms: '["DAS"]', destination_path: '' }, { terms: ['DAS'], destinationPath: 'Guias' }).destinationPath, 'Guias')
})

test('POST idempotente e Web consultam a mesma tabela organiza_rules', () => {
  const api = fs.readFileSync(path.join(testDirectory, '../api/[...path].js'), 'utf8')
  const getStart = api.indexOf("app.get('/api/organizza/rules'")
  const postStart = api.indexOf("app.post('/api/organizza/rules'")
  const deleteStart = api.indexOf("app.delete('/api/organizza/rules/:id'", postStart)
  const getRoute = api.slice(getStart, postStart)
  const postRoute = api.slice(postStart, deleteStart)
  assert.match(getRoute, /SELECT \* FROM organiza_rules WHERE user_id = \?/)
  assert.match(postRoute, /SELECT \* FROM organiza_rules WHERE user_id = \? AND department = \?[\s\S]*LIMIT 501/)
  assert.match(postRoute, /compatibleRules\.length > 500/)
  assert.match(postRoute, /conservativeDocumentRuleUpdate/)
  assert.match(postRoute, /UPDATE organiza_rules SET terms = \?, destination_path = \?, active = 1/)
  assert.match(postRoute, /INSERT INTO organiza_rules/)
})
