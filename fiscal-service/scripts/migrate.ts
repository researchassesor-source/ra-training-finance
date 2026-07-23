import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import pg from 'pg'
import { loadConfig } from '../src/config/env.js'

const config = loadConfig()
if (!config.DATABASE_URL) throw new Error('DATABASE_URL es obligatorio para migrar')
const sql = await readFile(resolve(process.cwd(), 'migrations', '001_initial.sql'), 'utf8')
const client = new pg.Client({ connectionString: config.DATABASE_URL, application_name: 'ra-training-fiscal-migrate' })
await client.connect()
try {
  await client.query(sql)
  process.stdout.write('Migración fiscal local aplicada.\n')
} finally { await client.end() }
