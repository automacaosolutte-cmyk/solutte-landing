import test from 'node:test'
import assert from 'node:assert/strict'
import { executeInferenceWithTelemetry } from '../lib/izza-inference.js'

function scenario({ inferenceError = null, telemetryError = null } = {}) {
  const calls = { openAi: 0, inserts: 0, logs: [] }
  const value = { intent: 'find_document' }
  const run = () => executeInferenceWithTelemetry({
    infer: async () => {
      calls.openAi += 1
      if (inferenceError) throw inferenceError
      return value
    },
    writeTelemetry: async ({ inferenceError: observedError }) => {
      calls.inserts += 1
      assert.equal(observedError, inferenceError)
      if (telemetryError) throw telemetryError
    },
    logTelemetryFailure: (metadata) => calls.logs.push(metadata),
  })
  return { calls, run, value }
}

function assertSingleAttempt(calls) {
  assert.ok(calls.openAi <= 1, `esperada no máximo 1 chamada OpenAI; recebidas ${calls.openAi}`)
  assert.ok(calls.inserts <= 1, `esperada no máximo 1 tentativa de INSERT; recebidas ${calls.inserts}`)
  assert.equal(calls.openAi, 1)
  assert.equal(calls.inserts, 1)
}

test('OpenAI sucesso e telemetria sucesso retornam a interpretação', async () => {
  const current = scenario()
  assert.equal(await current.run(), current.value)
  assert.deepEqual(current.calls.logs, [])
  assertSingleAttempt(current.calls)
})

test('OpenAI sucesso e telemetria falha preservam a interpretação', async () => {
  const current = scenario({ telemetryError: new Error('driver failure with unsafe details') })
  assert.equal(await current.run(), current.value)
  assert.deepEqual(current.calls.logs, [{ inferenceStatus: 'success' }])
  assertSingleAttempt(current.calls)
})

test('OpenAI falha e telemetria sucesso preservam o erro original', async () => {
  const inferenceError = new Error('original inference failure')
  const current = scenario({ inferenceError })
  await assert.rejects(current.run(), (error) => error === inferenceError)
  assert.deepEqual(current.calls.logs, [])
  assertSingleAttempt(current.calls)
})

test('OpenAI e telemetria falham sem substituir o erro original', async () => {
  const inferenceError = new Error('original inference failure')
  const current = scenario({ inferenceError, telemetryError: new Error('driver failure with unsafe details') })
  await assert.rejects(current.run(), (error) => error === inferenceError)
  assert.deepEqual(current.calls.logs, [{ inferenceStatus: 'error' }])
  assertSingleAttempt(current.calls)
})
