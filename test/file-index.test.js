import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeFileIndexDepartment } from '../lib/file-index.js'

test('normaliza departamento vazio para string vazia', () => {
  assert.equal(normalizeFileIndexDepartment(''), '')
})

test('normaliza departamento ausente para string vazia', () => {
  assert.equal(normalizeFileIndexDepartment(undefined), '')
  assert.equal(normalizeFileIndexDepartment(null), '')
})

test('preserva os quatro departamentos válidos', () => {
  for (const department of ['contabil', 'fiscal', 'pessoal', 'juridico']) {
    assert.equal(normalizeFileIndexDepartment(department), department)
  }
})

test('normaliza departamento inválido para string vazia', () => {
  assert.equal(normalizeFileIndexDepartment('financeiro'), '')
})
