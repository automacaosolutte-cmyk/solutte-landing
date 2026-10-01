export async function executeInferenceWithTelemetry({ infer, writeTelemetry, logTelemetryFailure }) {
  let result
  let inferenceError = null
  try {
    result = await infer()
  } catch (error) {
    inferenceError = error
  }

  try {
    await writeTelemetry({ inferenceError })
  } catch {
    try {
      logTelemetryFailure({ inferenceStatus: inferenceError ? 'error' : 'success' })
    } catch {
      // Observabilidade nunca deve substituir o resultado ou erro original da inferência.
    }
  }

  if (inferenceError) throw inferenceError
  return result
}
