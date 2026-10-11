const confirmationFlag = '--confirm-schema-setup'

if (!process.argv.includes(confirmationFlag)) {
  console.error(`Schema setup não executado. Para autorizar explicitamente, use: npm run schema:init -- ${confirmationFlag}`)
  process.exitCode = 2
} else {
  try {
    const app = (await import('../api/[...path].js')).default
    await app.initializeSchema()
    console.log('Inicialização de schema concluída.')
  } catch (error) {
    console.error('Falha ao inicializar schema:', error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
