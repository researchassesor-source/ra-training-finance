import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import type pg from 'pg'
import { newDb } from 'pg-mem'
import { afterAll, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { loadConfig } from '../src/config/env.js'
import { fakeIssuer } from '../src/infrastructure/fixtures.js'
import { PostgresFiscalRepository } from '../src/infrastructure/postgres-repository.js'
import { invoiceInput } from './fixtures/factory.js'

const roots: string[] = []
afterAll(async () => Promise.all(roots.map((root) => rm(root, { recursive: true, force: true }))))

describe('PostgreSQL emulado con pg-mem', () => {
  it('aplica migraciones y prueba transacciones, idempotencia y 100 secuenciales', async () => {
    const db = newDb({ autoCreateForeignKeyIndices: true })
    const adapter = db.adapters.createPg()
    const pool = new adapter.Pool() as unknown as pg.Pool
    const migration1 = await readFile(resolve(process.cwd(), 'migrations/001_initial.sql'), 'utf8')
    const migration2 = await readFile(resolve(process.cwd(), 'migrations/002_catalog_and_credit_notes.sql'), 'utf8')
    await pool.query(migration1)
    await pool.query(migration2)
    await pool.query(`INSERT INTO issuer_configs (id,ruc_placeholder,business_name,trade_name,head_office_address,accounting_obligation,environment,currency,timezone,created_at,updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [fakeIssuer.id, fakeIssuer.rucPlaceholder, fakeIssuer.businessName, fakeIssuer.tradeName, fakeIssuer.headOfficeAddress, fakeIssuer.accountingObligation, fakeIssuer.environment, fakeIssuer.currency, fakeIssuer.timezone, fakeIssuer.createdAt, fakeIssuer.updatedAt])
    const repository = new PostgresFiscalRepository('postgresql://local.invalid/test', pool)
    const sequences = await Promise.all(Array.from({ length: 100 }, () => repository.reserveSequential('CREDIT_NOTE', '001', '001')))
    expect(new Set(sequences).size).toBe(100)
    expect(sequences[0]).toBe('000000001'); expect(sequences[99]).toBe('000000100')

    const root = await mkdtemp(join(tmpdir(), 'fiscal-pgmem-')); roots.push(root)
    const config = loadConfig({ NODE_ENV: 'test', TZ: 'America/Guayaquil', FISCAL_LOCAL_DEV_MODE: 'true', FISCAL_STORAGE: 'inmemory', FISCAL_SRI_REAL_CONNECTION_ENABLED: 'false' })
    const app = await buildApp({ config, repository, storageRoot: root, issuer: fakeIssuer })
    const headers = { 'x-fiscal-local-role': 'admin', 'idempotency-key': 'pgmem-invoice-001' }
    const first = await app.inject({ method: 'POST', url: '/api/v1/invoices', headers, payload: invoiceInput() })
    expect(first.statusCode).toBe(201)
    const second = await app.inject({ method: 'POST', url: '/api/v1/invoices', headers, payload: invoiceInput() })
    expect(second.json().id).toBe(first.json().id)
    const processed = await app.inject({ method: 'POST', url: `/api/v1/invoices/${first.json().id}/process`, headers: { 'x-fiscal-local-role': 'admin' } })
    expect(processed.json().status).toBe('AUTHORIZED')
    expect((await pool.query('SELECT count(*)::int AS count FROM fiscal_events')).rows[0].count).toBeGreaterThan(5)
    await app.close(); await repository.close()
  })
})
