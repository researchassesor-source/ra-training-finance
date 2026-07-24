import { describe, expect, it } from 'vitest'
import { FiscalCatalogService } from '../../src/application/operational-services.js'
import { FiscalReadinessService } from '../../src/application/readiness-service.js'
import { loadConfig } from '../../src/config/env.js'
import { loadIssuerConfig, publicIssuerConfig } from '../../src/config/issuer.js'

describe('preparación fiscal institucional', () => {
  it('carga configuración privada, la enmascara y conserva bloqueadores reales', async () => {
    const config = loadConfig({
      NODE_ENV: 'test', FISCAL_ISSUER_RUC: '9999999999001', FISCAL_ISSUER_BUSINESS_NAME: 'EMPRESA FICTICIA',
      FISCAL_ISSUER_TRADE_NAME: 'AULA DEMO', FISCAL_ISSUER_PHONE: '0990000000', FISCAL_ISSUER_EMAIL: 'fiscal@example.test',
      FISCAL_HEAD_OFFICE_ADDRESS: 'PENDING_CONFIRMATION', FISCAL_ACCOUNTING_OBLIGATION: 'PENDING_CONFIRMATION',
      FISCAL_SEQUENCE_START: 'PENDING_CONFIRMATION', FISCAL_SRI_REAL_CONNECTION_ENABLED: 'false',
    })
    const issuer = loadIssuerConfig(config)
    const masked = publicIssuerConfig(issuer, true)
    expect(masked.rucPlaceholder).not.toBe(issuer.rucPlaceholder)
    expect(masked.phone).not.toBe(issuer.phone); expect(masked.email).toContain('***')
    const result = new FiscalReadinessService(config, issuer).evaluate(await new FiscalCatalogService().list())
    expect(result.ready).toBe(false)
    expect(result.officialBlockers).toEqual(expect.arrayContaining(['Domicilio tributario', 'Firma electrónica', 'Catálogo fiscal', 'Persistencia fiscal segura']))
    expect(result.checks.filter((item) => item.group === 'RECOMMENDED_INFRASTRUCTURE').map((item) => item.label)).toEqual(expect.arrayContaining(['PostgreSQL', 'Gestor de secretos', 'Cola de reintentos', 'Métricas y alertas']))
    expect(result.officialBlockers).not.toContain('PostgreSQL')
  })
})
