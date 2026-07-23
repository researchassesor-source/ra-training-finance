import { buildApp } from './app.js'
import { loadConfig } from './config/env.js'

const config = loadConfig()
const app = await buildApp({ config })

try {
  await app.listen({ host: config.FISCAL_HOST, port: config.FISCAL_PORT })
  app.log.warn('AMBIENTE LOCAL DE DESARROLLO | SIN VALIDEZ TRIBUTARIA | NO CONECTADO AL SRI')
} catch (error) {
  app.log.error(error)
  process.exitCode = 1
}
