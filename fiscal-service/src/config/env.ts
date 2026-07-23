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
    'AUTHORIZED',
    'RETURNED',
    'PROCESSING',
    'NOT_AUTHORIZED',
    'TEMPORARY_ERROR',
    'TIMEOUT',
    'INVALID_RESPONSE',
    'DUPLICATE_RESPONSE',
  ]).default('AUTHORIZED'),
  FISCAL_MAX_RETRIES: z.coerce.number().int().min(0).max(10).default(3),
  FISCAL_RETRY_BACKOFF_MS: z.coerce.number().int().min(0).max(30_000).default(250),
  FISCAL_SRI_REAL_CONNECTION_ENABLED: booleanString.default(false),
  DATABASE_URL: z.string().url().optional(),
})

export type FiscalConfig = z.infer<typeof envSchema>

export function loadConfig(source: NodeJS.ProcessEnv = process.env): FiscalConfig {
  const config = envSchema.parse(source)
  if (config.FISCAL_LOCAL_DEV_MODE && config.NODE_ENV === 'production') {
    throw new Error('FISCAL_LOCAL_DEV_MODE no puede activarse en producción')
  }
  if (config.FISCAL_SRI_REAL_CONNECTION_ENABLED) {
    throw new Error('La conexión real al SRI está deshabilitada en esta prueba de concepto')
  }
  if (config.FISCAL_STORAGE === 'postgres' && !config.DATABASE_URL) {
    throw new Error('DATABASE_URL es obligatorio para FISCAL_STORAGE=postgres')
  }
  return config
}

export const isLoopback = (address: string | undefined): boolean =>
  address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
