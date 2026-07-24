import { z } from 'zod'

const booleanString = z.enum(['true', 'false']).transform((value) => value === 'true')

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  TZ: z.literal('America/Guayaquil').default('America/Guayaquil'),
  FISCAL_HOST: z.literal('127.0.0.1').default('127.0.0.1'),
  FISCAL_PORT: z.coerce.number().int().min(1024).max(65535).default(4010),
  FISCAL_LOCAL_DEV_MODE: booleanString.default(true),
  FISCAL_STORAGE: z.enum(['inmemory', 'postgres']).default('inmemory'),
  FISCAL_MOCK_SRI_SCENARIO: z.enum([
    'AUTHORIZED', 'RETURNED', 'PROCESSING', 'NOT_AUTHORIZED', 'TEMPORARY_ERROR',
    'TIMEOUT', 'INVALID_RESPONSE', 'DUPLICATE_RESPONSE',
  ]).default('AUTHORIZED'),
  FISCAL_MAX_RETRIES: z.coerce.number().int().min(0).max(10).default(3),
  FISCAL_RETRY_BACKOFF_MS: z.coerce.number().int().min(0).max(30_000).default(250),
  FISCAL_SRI_REAL_CONNECTION_ENABLED: booleanString.default(false),
  FISCAL_SRI_CONFIRM_REAL_CALL: booleanString.default(false),
  FISCAL_MASK_PRIVATE_DATA_IN_EVIDENCE: booleanString.default(true),
  FISCAL_XADES_SIGNER: z.enum(['mock', 'ephemeral-test', 'pkcs12']).default('mock'),
  FISCAL_CERT_PATH: z.string().optional(),
  FISCAL_CERT_PASSWORD: z.string().optional(),
  FISCAL_CERT_ALIAS: z.string().optional(),
  FISCAL_ISSUER_RUC: z.string().regex(/^\d{13}$/).optional(),
  FISCAL_ISSUER_BUSINESS_NAME: z.string().min(1).optional(),
  FISCAL_ISSUER_TRADE_NAME: z.string().optional(),
  FISCAL_ISSUER_CITY: z.string().optional(),
  FISCAL_ISSUER_PHONE: z.string().optional(),
  FISCAL_ISSUER_EMAIL: z.string().email().optional(),
  FISCAL_ESTABLISHMENT_CODE: z.string().regex(/^\d{3}$/).default('001'),
  FISCAL_EMISSION_POINT_CODE: z.string().regex(/^\d{3}$/).default('001'),
  FISCAL_HEAD_OFFICE_ADDRESS: z.string().default('PENDING_CONFIRMATION'),
  FISCAL_ESTABLISHMENT_ADDRESS: z.string().default('PENDING_CONFIRMATION'),
  FISCAL_ACCOUNTING_OBLIGATION: z.enum(['SI', 'NO', 'PENDING_CONFIRMATION']).default('PENDING_CONFIRMATION'),
  FISCAL_SPECIAL_TAXPAYER_CODE: z.string().optional(),
  FISCAL_RETENTION_AGENT: z.string().default('PENDING_CONFIRMATION'),
  FISCAL_REGIME_INFORMATION: z.string().default('PENDING_CONFIRMATION'),
  FISCAL_SEQUENCE_START: z.string().default('PENDING_CONFIRMATION'),
  FISCAL_SENDER_EMAIL: z.string().email().optional(),
  FISCAL_SRI_ENVIRONMENT: z.enum(['LOCAL', 'CERTIFICATION', 'PRODUCTION']).default('CERTIFICATION'),
  DATABASE_URL: z.string().url().optional(),
})

export type FiscalConfig = z.infer<typeof envSchema>

export function loadConfig(source: NodeJS.ProcessEnv = process.env): FiscalConfig {
  const config = envSchema.parse(source)
  if (config.FISCAL_LOCAL_DEV_MODE && config.NODE_ENV === 'production') {
    throw new Error('FISCAL_LOCAL_DEV_MODE no puede activarse en producción')
  }
  if (config.FISCAL_SRI_REAL_CONNECTION_ENABLED || config.FISCAL_SRI_CONFIRM_REAL_CALL) {
    throw new Error('La conexión real al SRI está bloqueada en esta etapa local')
  }
  if (config.FISCAL_STORAGE === 'postgres' && !config.DATABASE_URL) {
    throw new Error('DATABASE_URL es obligatorio para FISCAL_STORAGE=postgres')
  }
  if (config.FISCAL_XADES_SIGNER === 'pkcs12' && (!config.FISCAL_CERT_PATH || !config.FISCAL_CERT_PASSWORD)) {
    throw new Error('El firmador PKCS#12 exige ruta y contraseña mediante secretos de entorno')
  }
  return config
}

export const isLoopback = (address: string | undefined): boolean =>
  address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
