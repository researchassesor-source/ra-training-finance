import type { FiscalConfig } from './env.js'
import type { IssuerConfig } from '../domain/types.js'
import { fakeIssuer } from '../infrastructure/fixtures.js'

const pending = (value: string | undefined): boolean => !value || value === 'PENDING_CONFIRMATION'

export function loadIssuerConfig(config: FiscalConfig): IssuerConfig {
  const hasPrivateProfile = Boolean(config.FISCAL_ISSUER_RUC && config.FISCAL_ISSUER_BUSINESS_NAME)
  if (!hasPrivateProfile) return structuredClone(fakeIssuer)
  const timestamp = new Date().toISOString()
  return {
    id: 'ISSUER-LOCAL-PRIVATE',
    rucPlaceholder: config.FISCAL_ISSUER_RUC as string,
    businessName: config.FISCAL_ISSUER_BUSINESS_NAME as string,
    tradeName: config.FISCAL_ISSUER_TRADE_NAME || config.FISCAL_ISSUER_BUSINESS_NAME as string,
    headOfficeAddress: config.FISCAL_HEAD_OFFICE_ADDRESS,
    establishmentAddress: config.FISCAL_ESTABLISHMENT_ADDRESS,
    city: config.FISCAL_ISSUER_CITY,
    phone: config.FISCAL_ISSUER_PHONE,
    email: config.FISCAL_ISSUER_EMAIL,
    accountingObligation: config.FISCAL_ACCOUNTING_OBLIGATION === 'SI' ? 'SI' : 'NO',
    accountingObligationConfirmed: !pending(config.FISCAL_ACCOUNTING_OBLIGATION),
    specialTaxpayerCode: config.FISCAL_SPECIAL_TAXPAYER_CODE || undefined,
    retentionAgent: config.FISCAL_RETENTION_AGENT,
    regimeInformation: config.FISCAL_REGIME_INFORMATION,
    establishmentCode: config.FISCAL_ESTABLISHMENT_CODE,
    emissionPointCode: config.FISCAL_EMISSION_POINT_CODE,
    environment: '1',
    currency: 'DOLAR',
    timezone: 'America/Guayaquil',
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

const maskMiddle = (value: string, visibleStart = 3, visibleEnd = 2): string => {
  if (value.length <= visibleStart + visibleEnd) return '*'.repeat(value.length)
  return `${value.slice(0, visibleStart)}${'*'.repeat(value.length - visibleStart - visibleEnd)}${value.slice(-visibleEnd)}`
}

export function publicIssuerConfig(issuer: IssuerConfig, mask: boolean): IssuerConfig {
  if (!mask) return structuredClone(issuer)
  return {
    ...structuredClone(issuer),
    rucPlaceholder: maskMiddle(issuer.rucPlaceholder, 3, 3),
    phone: issuer.phone ? maskMiddle(issuer.phone, 2, 2) : issuer.phone,
    email: issuer.email ? issuer.email.replace(/^(.{2}).*(@.*)$/, '$1***$2') : issuer.email,
  }
}
