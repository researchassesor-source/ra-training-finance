import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import pg from 'pg'
import { loadConfig } from '../src/config/env.js'

const config = loadConfig()
if (!config.DATABASE_URL) throw new Error('DATABASE_URL es obligatorio para migrar')
const directory = resolve(process.cwd(), 'migrations')
const files = (await readdir(directory)).filter((file) => /^\d+.*\.sql$/.test(file)).sort()
const client = new pg.Client({ connectionString: config.DATABASE_URL, application_name: 'ra-training-fiscal-migrate' })
await client.connect()
try {
  for (const file of files) {
    await client.query(await readFile(resolve(directory, file), 'utf8'))
    process.stdout.write(`Migración aplicada: ${file}\n`)
  }
} finally { await client.end() }
