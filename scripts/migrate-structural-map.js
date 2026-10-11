import { createClient } from '@libsql/client'

const confirm = process.argv.includes('--confirm-structural-map-migration')
if (!confirm) throw new Error('Use --confirm-structural-map-migration para executar a migration aditiva.')
const url = process.env.TURSO_DATABASE_URL
const authToken = process.env.TURSO_AUTH_TOKEN
if (!url || !authToken) throw new Error('TURSO_DATABASE_URL e TURSO_AUTH_TOKEN são obrigatórios.')
const db = createClient({ url, authToken })

async function columns(table) {
  return new Set((await db.execute(`PRAGMA table_info(${table})`)).rows.map((row) => String(row.name)))
}

const sharedColumns = await columns('organiza_shared_file_index')
const statements = []
if (!sharedColumns.has('parent_relative_path')) statements.push('ALTER TABLE organiza_shared_file_index ADD COLUMN parent_relative_path TEXT NOT NULL DEFAULT \'\'')
if (!sharedColumns.has('node_type')) statements.push("ALTER TABLE organiza_shared_file_index ADD COLUMN node_type TEXT NOT NULL DEFAULT 'file'")
for (const sql of statements) await db.execute(sql)
await db.execute('CREATE INDEX IF NOT EXISTS idx_organiza_shared_file_map_parent ON organiza_shared_file_index(user_id, parent_relative_path, node_type, relative_path)')
await db.execute(`CREATE TABLE IF NOT EXISTS organiza_map_reconciliations (
  user_id TEXT NOT NULL, migration_key TEXT NOT NULL, selected_device_id TEXT NOT NULL,
  requested_by_user_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', checkpoint TEXT NOT NULL DEFAULT '{}',
  last_batch_id TEXT NOT NULL DEFAULT '', scanned_count INTEGER NOT NULL DEFAULT 0,
  added_count INTEGER NOT NULL DEFAULT 0, updated_count INTEGER NOT NULL DEFAULT 0,
  published_count INTEGER NOT NULL DEFAULT 0, last_error TEXT NOT NULL DEFAULT '',
  started_at TEXT NOT NULL, updated_at TEXT NOT NULL, completed_at TEXT,
  PRIMARY KEY (user_id, migration_key), FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (selected_device_id) REFERENCES organiza_devices(id)
)`)
await db.execute('CREATE INDEX IF NOT EXISTS idx_organiza_map_reconciliation_device ON organiza_map_reconciliations(user_id, selected_device_id, status)')
console.log(JSON.stringify({ ok: true, alteredColumns: statements.length }, null, 2))
