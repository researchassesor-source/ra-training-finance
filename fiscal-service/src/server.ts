import { config as loadDotEnv } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { buildApp } from './app.js'
import { loadConfig } from './config/env.js'

if (process.env.NODE_ENV !== 'test') {
  loadDotEnv({ path: fileURLToPath(new URL('../.env.local', import.meta.url)), quiet: true })
}
const config = loadConfig()
const app = await buildApp({ config })

try {
  await app.listen({ host: config.FISCAL_HOST, port: config.FISCAL_PORT })
  app.log.warn('AMBIENTE LOCAL DE DESARROLLO | SIN VALIDEZ TRIBUTARIA | NO CONECTADO AL SRI')
} catch (error) {
  app.log.error(error)
  process.exitCode = 1
}
