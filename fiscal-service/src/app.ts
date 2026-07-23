import { randomUUID } from 'node:crypto'
import cors from '@fastify/cors'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify'
import { ZodError } from 'zod'
import { FiscalDocumentService, FiscalConflictError, FiscalNotFoundError, FiscalValidationError } from './application/document-service.js'
import type { FiscalRepository } from './application/repository.js'
import { isLoopback, loadConfig, type FiscalConfig } from './config/env.js'
import { paymentCatalog, taxCatalog } from './domain/schemas.js'
import { MockBillingSourceProvider, fakeIssuer } from './infrastructure/fixtures.js'
import { LocalFileStorage } from './infrastructure/file-storage.js'
import { InMemoryFiscalRepository } from './infrastructure/in-memory-repository.js'
import { PostgresFiscalRepository } from './infrastructure/postgres-repository.js'
import { FileFiscalMailer } from './modules/delivery/mailer.js'
import { LocalRideGenerator } from './modules/ride/ride-generator.js'
import { MockXmlSigner } from './modules/signing/signer.js'
import { MockSriGateway } from './modules/sri/gateway.js'
import { OfficialXsdValidator } from './modules/xml/validator.js'

declare module 'fastify' {
  interface FastifyRequest { correlationId: string }
}

export interface BuildAppOptions {
  config?: FiscalConfig
  repository?: FiscalRepository
  storageRoot?: string
}

export interface FiscalApp extends FastifyInstance {
  fiscalService: FiscalDocumentService
}

const requiredIdempotency = (headers: Record<string, unknown>): string => {
  const value = headers['idempotency-key']
  if (typeof value !== 'string' || !/^[a-zA-Z0-9._:-]{8,128}$/.test(value)) {
    throw new FiscalValidationError('Idempotency-Key es obligatorio (8-128 caracteres seguros)')
  }
  return value
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FiscalApp> {
  const config = options.config ?? loadConfig()
  const app = Fastify({
    logger: { level: config.NODE_ENV === 'test' ? 'silent' : 'info', redact: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.secret', '*.token'] },
    bodyLimit: 512 * 1024,
    genReqId: () => randomUUID(),
    trustProxy: false,
  }) as unknown as FiscalApp

  await app.register(cors, {
    origin: (origin, callback) => {
      if (!origin || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) callback(null, true)
      else callback(new Error('Origen CORS no permitido'), false)
    },
    methods: ['GET', 'POST', 'PATCH'],
    allowedHeaders: ['content-type', 'idempotency-key', 'x-fiscal-local-role', 'x-correlation-id'],
  })
  await app.register(swagger, {
    openapi: {
      info: { title: 'R.A. Training Fiscal API - LOCAL', version: '0.1.0', description: 'Sin validez tributaria. No conectado al SRI.' },
      servers: [{ url: 'http://127.0.0.1:4010', description: 'Solo localhost' }],
    },
  })
  await app.register(swaggerUi, { routePrefix: '/docs' })

  app.addHook('onRequest', async (request, reply) => {
    request.correlationId = String(request.headers['x-correlation-id'] ?? request.id)
    reply.header('x-correlation-id', request.correlationId)
    reply.header('x-content-type-options', 'nosniff')
    reply.header('x-frame-options', 'DENY')
    reply.header('referrer-policy', 'no-referrer')
    reply.header('cache-control', 'no-store')
    reply.header('content-security-policy', "default-src 'none'; frame-ancestors 'none'")
  })

  const postgresRepository = !options.repository && config.FISCAL_STORAGE === 'postgres'
    ? new PostgresFiscalRepository(config.DATABASE_URL as string)
    : undefined
  if (postgresRepository) {
    await postgresRepository.check()
    app.addHook('onClose', async () => postgresRepository.close())
  }
  const repository = options.repository ?? postgresRepository ?? new InMemoryFiscalRepository()
  const storage = new LocalFileStorage(options.storageRoot)
  const sri = new MockSriGateway(config.FISCAL_MOCK_SRI_SCENARIO)
  const fiscalService = new FiscalDocumentService({
    repository,
    billingSource: new MockBillingSourceProvider(),
    storage,
    signer: new MockXmlSigner(),
    sri,
    ride: new LocalRideGenerator(),
    mailer: new FileFiscalMailer(storage),
    xsdValidator: new OfficialXsdValidator(),
    issuer: fakeIssuer,
  })
  app.fiscalService = fiscalService

  const localAdmin = async (request: FastifyRequest): Promise<void> => {
    if (!config.FISCAL_LOCAL_DEV_MODE || config.NODE_ENV === 'production' || !isLoopback(request.ip)) {
      throw new FiscalConflictError('El adaptador administrativo local está deshabilitado')
    }
    if (request.headers['x-fiscal-local-role'] !== 'admin') {
      const error = new Error('Solo el rol administrador local puede acceder') as Error & { statusCode?: number }
      error.statusCode = 403
      throw error
    }
  }

  app.get('/api/v1/health', async () => ({ status: 'ok', service: 'fiscal-local', sriConnection: false }))
  app.get('/api/v1/readiness', async () => ({
    status: 'ready', storage: config.FISCAL_STORAGE, persistent: config.FISCAL_STORAGE === 'postgres', sriConnection: false,
  }))

  app.register(async (api) => {
    api.addHook('preHandler', localAdmin)

    api.get('/config/status', async () => ({
      banner: 'AMBIENTE LOCAL DE DESARROLLO | SIN VALIDEZ TRIBUTARIA | NO CONECTADO AL SRI',
      storage: config.FISCAL_STORAGE,
      persistent: config.FISCAL_STORAGE === 'postgres',
      realSriConnectionEnabled: false,
      signer: 'MOCK_NON_CRYPTOGRAPHIC',
      xsd: 'SRI factura y nota de crédito 1.1.0',
      issuer: fakeIssuer,
    }))
    api.get('/billing-sources', async () => new MockBillingSourceProvider().list())
    api.get('/tax-catalog', async () => ({ source: 'Ficha técnica SRI 2.33, tabla 17; aplicabilidad tributaria pendiente', items: taxCatalog }))
    api.get('/payment-methods', async () => ({ source: 'Ficha técnica SRI 2.33, tabla 24', items: paymentCatalog }))
    api.get('/document-types', async () => ([{ code: '01', type: 'INVOICE' }, { code: '04', type: 'CREDIT_NOTE' }]))

    api.get('/invoices', async () => (await fiscalService.list()).filter((item) => item.documentType === 'INVOICE'))
    api.post('/invoices', async (request, reply) => {
      const item = await fiscalService.createInvoice(request.body as never, requiredIdempotency(request.headers), 'local-admin')
      return reply.code(201).send(item)
    })
    api.get('/invoices/:id', async (request) => fiscalService.get((request.params as { id: string }).id))
    api.patch('/invoices/:id', async (request) => fiscalService.patchInvoice((request.params as { id: string }).id, request.body))
    api.post('/invoices/:id/validate', async (request) => fiscalService.validate((request.params as { id: string }).id))
    api.post('/invoices/:id/generate-xml', async (request) => fiscalService.generateXml((request.params as { id: string }).id))
    api.post('/invoices/:id/sign', async (request) => fiscalService.sign((request.params as { id: string }).id))
    api.post('/invoices/:id/submit', async (request) => fiscalService.submit((request.params as { id: string }).id))
    api.post('/invoices/:id/check-authorization', async (request) => fiscalService.checkAuthorization((request.params as { id: string }).id))
    api.post('/invoices/:id/process', async (request) => fiscalService.process((request.params as { id: string }).id))
    api.post('/invoices/:id/retry', async (request) => fiscalService.retry((request.params as { id: string }).id))
    api.get('/invoices/:id/events', async (request) => fiscalService.events((request.params as { id: string }).id))
    api.get('/invoices/:id/transmissions', async (request) => fiscalService.transmissions((request.params as { id: string }).id))
    api.get('/invoices/:id/xml', async (request, reply) => {
      const file = await fiscalService.file((request.params as { id: string }).id, 'xml')
      return reply.type(file.mime).header('content-disposition', `attachment; filename="${file.filename}"`).send(file.content)
    })
    api.get('/invoices/:id/xml/unsigned', async (request, reply) => {
      const file = await fiscalService.file((request.params as { id: string }).id, 'unsigned')
      return reply.type(file.mime).send(file.content)
    })
    api.get('/invoices/:id/ride', async (request, reply) => {
      const file = await fiscalService.file((request.params as { id: string }).id, 'ride')
      return reply.type(file.mime).header('content-disposition', `attachment; filename="${file.filename}"`).send(file.content)
    })
    api.post('/invoices/:id/credit-notes', async (request, reply) => {
      const item = await fiscalService.createCreditNote(
        (request.params as { id: string }).id,
        request.body as never,
        requiredIdempotency(request.headers),
      )
      return reply.code(201).send(item)
    })

    api.get('/credit-notes', async () => (await fiscalService.list()).filter((item) => item.documentType === 'CREDIT_NOTE'))
    api.get('/credit-notes/:id', async (request) => fiscalService.get((request.params as { id: string }).id))
    api.post('/credit-notes/:id/validate', async (request) => fiscalService.validate((request.params as { id: string }).id))
    api.post('/credit-notes/:id/generate-xml', async (request) => fiscalService.generateXml((request.params as { id: string }).id))
    api.post('/credit-notes/:id/sign', async (request) => fiscalService.sign((request.params as { id: string }).id))
    api.post('/credit-notes/:id/submit', async (request) => fiscalService.submit((request.params as { id: string }).id))
    api.post('/credit-notes/:id/check-authorization', async (request) => fiscalService.checkAuthorization((request.params as { id: string }).id))
    api.post('/credit-notes/:id/process', async (request) => fiscalService.process((request.params as { id: string }).id))
    api.get('/credit-notes/:id/events', async (request) => fiscalService.events((request.params as { id: string }).id))
    api.get('/credit-notes/:id/transmissions', async (request) => fiscalService.transmissions((request.params as { id: string }).id))
    api.get('/credit-notes/:id/xml', async (request, reply) => {
      const file = await fiscalService.file((request.params as { id: string }).id, 'xml')
      return reply.type(file.mime).header('content-disposition', `attachment; filename="${file.filename}"`).send(file.content)
    })
    api.get('/credit-notes/:id/xml/unsigned', async (request, reply) => {
      const file = await fiscalService.file((request.params as { id: string }).id, 'unsigned')
      return reply.type(file.mime).send(file.content)
    })
    api.get('/credit-notes/:id/ride', async (request, reply) => {
      const file = await fiscalService.file((request.params as { id: string }).id, 'ride')
      return reply.type(file.mime).header('content-disposition', `attachment; filename="${file.filename}"`).send(file.content)
    })
  }, { prefix: '/api/v1' })

  app.setErrorHandler((error, request, reply) => {
    const normalizedError = error instanceof Error ? error : new Error('Error desconocido')
    const status = error instanceof FiscalNotFoundError ? 404
      : error instanceof FiscalConflictError ? 409
        : error instanceof FiscalValidationError || error instanceof ZodError ? 422
          : (error as Error & { statusCode?: number }).statusCode ?? 500
    request.log.warn({ err: { name: normalizedError.name, message: normalizedError.message }, correlationId: request.correlationId }, 'fiscal request failed')
    return reply.code(status).send({
      error: status >= 500 ? 'INTERNAL_ERROR' : normalizedError.name,
      message: status >= 500 ? 'Error interno del servicio fiscal local' : normalizedError.message,
      correlationId: request.correlationId,
      ...(error instanceof ZodError ? { issues: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })) } : {}),
    })
  })

  return app
}
