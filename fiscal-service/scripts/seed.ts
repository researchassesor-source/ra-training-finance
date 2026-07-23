import pg from 'pg'
import { loadConfig } from '../src/config/env.js'
import { fakeEmissionPoint, fakeEstablishment, fakeIssuer } from '../src/infrastructure/fixtures.js'

const config = loadConfig()
if (!config.DATABASE_URL) throw new Error('DATABASE_URL es obligatorio para seed')
const client = new pg.Client({ connectionString: config.DATABASE_URL, application_name: 'ra-training-fiscal-seed' })
await client.connect()
try {
  await client.query(`INSERT INTO issuer_configs (id,ruc_placeholder,business_name,trade_name,head_office_address,accounting_obligation,environment,currency,timezone,created_at,updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (id) DO NOTHING`,
  [fakeIssuer.id,fakeIssuer.rucPlaceholder,fakeIssuer.businessName,fakeIssuer.tradeName,fakeIssuer.headOfficeAddress,
    fakeIssuer.accountingObligation,fakeIssuer.environment,fakeIssuer.currency,fakeIssuer.timezone,fakeIssuer.createdAt,fakeIssuer.updatedAt])
  await client.query('INSERT INTO establishments (id,issuer_id,code,address,active) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING',
    [fakeEstablishment.id,fakeEstablishment.issuerId,fakeEstablishment.code,fakeEstablishment.address,fakeEstablishment.active])
  await client.query('INSERT INTO emission_points (id,establishment_id,code,active) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING',
    [fakeEmissionPoint.id,fakeEmissionPoint.establishmentId,fakeEmissionPoint.code,fakeEmissionPoint.active])
  process.stdout.write('Seed fiscal ficticio aplicado.\n')
} finally { await client.end() }
