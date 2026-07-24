import { createHash, randomUUID } from 'node:crypto'
import { Decimal } from 'decimal.js'
import type { FiscalRepository } from './repository.js'
import { buildAccessKey } from '../domain/access-key.js'
import { calculateDocument, formatMoney } from '../domain/money.js'
import { createCreditNoteSchema, createInvoiceSchema, patchInvoiceSchema, paymentCatalog } from '../domain/schemas.js'
import { assertTransition } from '../domain/state-machine.js'
import type {
  CreateCreditNoteInput,
  CreateInvoiceInput,
  FiscalDocument,
  FiscalEvent,
  FiscalPaymentMethod,
  FiscalStatus,
  IssuerConfig,
  SriTransmission,
} from '../domain/types.js'
import type { BillingSourceProvider } from '../infrastructure/fixtures.js'
import type { FiscalFileStorage } from '../infrastructure/file-storage.js'
import { InvoiceXmlBuilder, CreditNoteXmlBuilder, escapeXml } from '../modules/xml/builders.js'
import type { OfficialXsdValidator, XmlValidationResult } from '../modules/xml/validator.js'
import type { XmlSigner } from '../modules/signing/signer.js'
import type { SriGateway } from '../modules/sri/gateway.js'
import type { LocalRideGenerator } from '../modules/ride/ride-generator.js'
import type { FiscalDocumentMailer } from '../modules/delivery/mailer.js'

export class FiscalNotFoundError extends Error {}
export class FiscalConflictError extends Error {}
export class FiscalValidationError extends Error {}

export interface DocumentServiceDependencies {
  repository: FiscalRepository
  billingSource: BillingSourceProvider
  storage: FiscalFileStorage
  signer: XmlSigner
  sri: SriGateway
  ride: LocalRideGenerator
  mailer: FiscalDocumentMailer
  xsdValidator: OfficialXsdValidator
  issuer: IssuerConfig
}

const now = (): string => new Date().toISOString()
const documentNumber = (document: FiscalDocument): string =>
  `${document.establishmentCode}-${document.emissionPointCode}-${document.sequential ?? '000000000'}`
const numericCode = (id: string): string => {
  const hash = createHash('sha256').update(id).digest('hex').slice(0, 12)
  return (BigInt(`0x${hash}`) % 100_000_000n).toString().padStart(8, '0')
}

const buildPayments = (
  documentId: string,
  total: string,
  requested?: Array<{ methodCode: string; amount: string; term?: number; timeUnit?: string }>,
  fallbackCode = '20',
): FiscalPaymentMethod[] => {
  const source = requested?.length ? requested : [{ methodCode: fallbackCode, amount: total }]
  const sum = source.reduce((value, item) => value.plus(new Decimal(item.amount)), new Decimal(0))
  if (!sum.toDecimalPlaces(2).eq(new Decimal(total).toDecimalPlaces(2))) {
    throw new FiscalValidationError(`La suma de formas de pago (${sum.toFixed(2)}) debe coincidir con el total (${total})`)
  }
  return source.map((item) => ({
    id: `PAY-${randomUUID()}`,
    documentId,
    methodCode: item.methodCode,
    methodDescription: paymentCatalog.find((method) => method.code === item.methodCode)?.label ?? item.methodCode,
    amount: formatMoney(item.amount),
    ...(item.term !== undefined ? { term: item.term } : {}),
    ...(item.timeUnit ? { timeUnit: item.timeUnit } : {}),
  }))
}

export class FiscalDocumentService {
  constructor(private readonly deps: DocumentServiceDependencies) {}

  async list(): Promise<FiscalDocument[]> { return this.deps.repository.listDocuments() }

  async get(id: string): Promise<FiscalDocument> {
    const document = await this.deps.repository.getDocument(id)
    if (!document) throw new FiscalNotFoundError('Documento fiscal no encontrado')
    return document
  }

  private async event(
    documentId: string,
    eventType: string,
    actor: string,
    detailsJson: Record<string, unknown>,
    previousStatus?: FiscalStatus,
    newStatus?: FiscalStatus,
  ): Promise<void> {
    const event: FiscalEvent = {
      id: `EV-${randomUUID()}`,
      documentId,
      eventType,
      ...(previousStatus ? { previousStatus } : {}),
      ...(newStatus ? { newStatus } : {}),
      actor,
      detailsJson,
      occurredAt: now(),
    }
    await this.deps.repository.addEvent(event)
  }

  private async transition(
    document: FiscalDocument,
    status: FiscalStatus,
    eventType: string,
    actor: string,
    details: Record<string, unknown> = {},
  ): Promise<FiscalDocument> {
    const previous = document.status
    assertTransition(previous, status)
    const updated = { ...document, status, updatedAt: now() }
    await this.deps.repository.saveDocument(updated)
    await this.event(document.id, eventType, actor, details, previous, status)
    return updated
  }

  async createInvoice(raw: CreateInvoiceInput, idempotencyKey: string, actor = 'local-admin'): Promise<FiscalDocument> {
    const existingId = await this.deps.repository.resolveIdempotency(idempotencyKey)
    if (existingId) return this.get(existingId)
    const input = createInvoiceSchema.parse(raw)
    const source = await this.deps.billingSource.get(input.sourceEnrollmentId)
    if (!source) throw new FiscalNotFoundError('Inscripción ficticia no encontrada')
    if (source.paymentStatus !== 'VERIFIED') throw new FiscalValidationError('Solo un pago verificado puede originar el borrador')
    if (source.fiscalStatus !== 'ELIGIBLE') throw new FiscalValidationError(source.issueNote)
    const duplicate = await this.deps.repository.findBySource('INVOICE', source.id)
    if (duplicate) throw new FiscalConflictError('La inscripción ya tiene una factura')

    const id = `FD-${randomUUID()}`
    const timestamp = now()
    const calculation = calculateDocument(id, input.items, timestamp)
    const tip = formatMoney(input.tip)
    const grandTotal = formatMoney(new Decimal(calculation.grandTotal).plus(tip))
    const customer = { ...input.customer, id: `CUS-${randomUUID()}`, createdAt: timestamp, updatedAt: timestamp }
    const document: FiscalDocument = {
      id,
      documentType: 'INVOICE',
      sourceType: 'MOCK_ENROLLMENT',
      sourceId: source.id,
      issuerId: this.deps.issuer.id,
      customer,
      environment: '1',
      issueDate: input.issueDate,
      establishmentCode: this.deps.issuer.establishmentCode ?? '001',
      emissionPointCode: this.deps.issuer.emissionPointCode ?? '001',
      currency: 'DOLAR',
      status: 'DRAFT',
      ...calculation,
      grandTotal,
      tip,
      paymentStatus: 'VERIFIED',
      payments: buildPayments(id, grandTotal, input.payments, input.paymentMethodCode),
      additionalFields: input.additionalFields ?? [],
      participantName: input.participantName ?? source.participantName,
      ...(input.remissionGuide ? { remissionGuide: input.remissionGuide } : {}),
      negotiableInvoice: input.negotiableInvoice,
      createdBy: actor,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    await this.deps.repository.saveDocument(document)
    await this.deps.repository.rememberIdempotency(idempotencyKey, document.id)
    await this.event(document.id, 'DRAFT_CREATED', actor, { sourceEnrollmentId: source.id, localOnly: true }, undefined, 'DRAFT')
    return document
  }

  async patchInvoice(id: string, raw: unknown, actor = 'local-admin'): Promise<FiscalDocument> {
    const document = await this.get(id)
    if (document.documentType !== 'INVOICE' || !['DRAFT', 'VALIDATION_FAILED'].includes(document.status)) {
      throw new FiscalConflictError('Solo puede editarse una factura en borrador o con validación fallida')
    }
    const patch = patchInvoiceSchema.parse(raw)
    const itemsInput = patch.items ?? document.items.map((item) => {
      const tax = document.taxes.find((line) => line.itemId === item.id)
      if (!tax) throw new FiscalValidationError('Detalle sin impuesto')
      return {
        mainCode: item.mainCode,
        ...(item.auxiliaryCode ? { auxiliaryCode: item.auxiliaryCode } : {}),
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discount: item.discount,
        taxCode: tax.taxCode,
        percentageCode: tax.percentageCode,
        rate: tax.rate,
        fiscalClassificationValidated: item.fiscalClassificationValidated ?? false,
        ...(item.taxCategory ? { taxCategory: item.taxCategory } : {}),
      }
    })
    const calculation = calculateDocument(document.id, itemsInput)
    const paymentMethodCode = patch.paymentMethodCode ?? document.payments[0]?.methodCode ?? '20'
    const tip = formatMoney(patch.tip ?? document.tip ?? '0.00')
    const grandTotal = formatMoney(new Decimal(calculation.grandTotal).plus(tip))
    const requestedPayments = patch.payments ?? (document.payments.length > 1 ? document.payments : undefined)
    const updated: FiscalDocument = {
      ...document,
      ...(patch.customer ? { customer: { ...document.customer, ...patch.customer, updatedAt: now() } } : {}),
      ...(patch.issueDate ? { issueDate: patch.issueDate } : {}),
      ...calculation,
      grandTotal,
      tip,
      payments: buildPayments(id, grandTotal, requestedPayments, paymentMethodCode),
      ...(patch.additionalFields ? { additionalFields: patch.additionalFields } : {}),
      ...(patch.participantName !== undefined ? { participantName: patch.participantName } : {}),
      ...(patch.remissionGuide !== undefined ? { remissionGuide: patch.remissionGuide } : {}),
      ...(patch.negotiableInvoice !== undefined ? { negotiableInvoice: patch.negotiableInvoice } : {}),
      status: 'DRAFT',
      updatedAt: now(),
    }
    await this.deps.repository.saveDocument(updated)
    await this.event(id, 'DRAFT_UPDATED', actor, { fields: Object.keys(patch) }, document.status, 'DRAFT')
    return updated
  }

  async validate(id: string, actor = 'local-admin'): Promise<{ document: FiscalDocument; validation: { valid: true } }> {
    let document = await this.get(id)
    if (document.status === 'READY_TO_SIGN') return { document, validation: { valid: true } }
    if (!['DRAFT', 'VALIDATION_FAILED'].includes(document.status)) throw new FiscalConflictError('El estado actual no permite validar')
    if (!document.sequential) {
      const sequential = await this.deps.repository.reserveSequential(document.documentType, document.establishmentCode, document.emissionPointCode)
      const accessKey = buildAccessKey({
        issueDate: document.issueDate,
        documentType: document.documentType,
        ruc: this.deps.issuer.rucPlaceholder,
        environment: document.environment,
        establishmentCode: document.establishmentCode,
        emissionPointCode: document.emissionPointCode,
        sequential,
        numericCode: numericCode(document.id),
      })
      document = { ...document, sequential, accessKey }
      await this.deps.repository.saveDocument(document)
      await this.event(id, 'SEQUENCE_RESERVED', actor, { sequential, accessKeyHash: createHash('sha256').update(accessKey).digest('hex') })
    }
    document = await this.transition(document, 'READY_TO_SIGN', 'DOMAIN_VALIDATION_PASSED', actor, { exactDecimalCalculation: true })
    return { document, validation: { valid: true } }
  }

  async generateXml(id: string, actor = 'local-admin'): Promise<{ document: FiscalDocument; validation: XmlValidationResult }> {
    let document = await this.get(id)
    if (document.status === 'DRAFT' || document.status === 'VALIDATION_FAILED') document = (await this.validate(id, actor)).document
    if (document.status !== 'READY_TO_SIGN') throw new FiscalConflictError('El XML solo se genera después de validar el borrador')
    const xml = document.documentType === 'INVOICE'
      ? new InvoiceXmlBuilder().build(document, this.deps.issuer)
      : new CreditNoteXmlBuilder().build(document, this.deps.issuer)
    const validation = await this.deps.xsdValidator.validate(document.documentType, xml)
    const validationFile = await this.deps.storage.write(id, document.documentType, document.issueDate, 'validation.json', JSON.stringify(validation, null, 2))
    if (!validation.officialXsdValid) {
      document = await this.transition(document, 'VALIDATION_FAILED', 'XSD_VALIDATION_FAILED', actor, { validation, validationFile: validationFile.relativePath })
      return { document, validation }
    }
    const stored = await this.deps.storage.write(id, document.documentType, document.issueDate, 'unsigned.xml', xml)
    document = { ...document, xmlUnsignedPath: stored.relativePath, updatedAt: now() }
    await this.deps.repository.saveDocument(document)
    await this.event(id, 'XML_GENERATED_AND_XSD_VALIDATED', actor, { sha256: stored.sha256, validator: validation.validator })
    return { document, validation }
  }

  async sign(id: string, actor = 'local-admin'): Promise<FiscalDocument> {
    let document = await this.get(id)
    if (!document.xmlUnsignedPath) document = (await this.generateXml(id, actor)).document
    if (document.status !== 'READY_TO_SIGN' || !document.xmlUnsignedPath) throw new FiscalConflictError('El documento no está listo para firma mock')
    const unsigned = (await this.deps.storage.read(document.xmlUnsignedPath)).toString('utf8')
    const result = await this.deps.signer.sign(unsigned)
    const stored = await this.deps.storage.write(id, document.documentType, document.issueDate, 'signed-test.xml', result.xml)
    document = { ...document, xmlSignedPath: stored.relativePath, updatedAt: now() }
    await this.deps.repository.saveDocument(document)
    return this.transition(document, 'SIGNED', 'MOCK_SIGNATURE_APPLIED', actor, {
      sha256: stored.sha256, kind: result.kind, warning: result.warning,
    })
  }

  private async transmission(document: FiscalDocument, phase: 'RECEPTION' | 'AUTHORIZATION', response: {
    code: string; status: string; message: string; raw: string
  }, request: string, attempt: number): Promise<void> {
    const startedAt = now()
    const requestStored = await this.deps.storage.write(document.id, document.documentType, document.issueDate, `sri/${phase.toLowerCase()}-request-${attempt}.xml`, request)
    const responseStored = await this.deps.storage.write(document.id, document.documentType, document.issueDate, `sri/${phase.toLowerCase()}-response-${attempt}.xml`, response.raw)
    const item: SriTransmission = {
      id: `TX-${randomUUID()}`,
      documentId: document.id,
      phase,
      attempt,
      requestHash: requestStored.sha256,
      responseCode: response.code,
      responseStatus: response.status,
      responseMessage: response.message,
      rawRequestPath: requestStored.relativePath,
      rawResponsePath: responseStored.relativePath,
      startedAt,
      completedAt: now(),
    }
    await this.deps.repository.addTransmission(item)
  }

  async submit(id: string, actor = 'local-admin'): Promise<FiscalDocument> {
    let document = await this.get(id)
    if (!document.xmlSignedPath) document = await this.sign(id, actor)
    if (document.status === 'SIGNED') document = await this.transition(document, 'PENDING_SUBMISSION', 'SUBMISSION_QUEUED', actor)
    if (document.status === 'RETRY_PENDING') document = await this.transition(document, 'PENDING_SUBMISSION', 'RETRY_QUEUED', actor)
    if (document.status !== 'PENDING_SUBMISSION' || !document.xmlSignedPath) throw new FiscalConflictError('El documento no está listo para envío simulado')
    document = await this.transition(document, 'SUBMITTED', 'MOCK_SUBMISSION_STARTED', actor)
    const signed = (await this.deps.storage.read(document.xmlSignedPath!)).toString('utf8')
    const attempts = (await this.deps.repository.listTransmissions(id)).filter((item) => item.phase === 'RECEPTION').length + 1
    const result = await this.deps.sri.submitDocument(document, signed)
    await this.transmission(document, 'RECEPTION', result, signed, attempts)
    if (result.status === 'RECIBIDA') return this.transition(document, 'RECEIVED', 'MOCK_RECEIVED', actor, { code: result.code })
    if (result.status === 'EN PROCESO') return this.transition(document, 'PROCESSING', 'MOCK_PROCESSING', actor, { code: result.code })
    if (result.status === 'DEVUELTA') return this.transition(document, 'RETURNED', 'MOCK_RETURNED', actor, { code: result.code, message: result.message })
    if (result.retryable) {
      document = await this.transition(document, 'ERROR', 'MOCK_TEMPORARY_ERROR', actor, { code: result.code })
      return this.transition(document, 'RETRY_PENDING', 'RETRY_SCHEDULED', actor, { retryable: true })
    }
    return this.transition(document, 'ERROR', 'MOCK_RESPONSE_REJECTED', actor, { code: result.code })
  }

  async checkAuthorization(id: string, actor = 'local-admin'): Promise<FiscalDocument> {
    let document = await this.get(id)
    if (!['RECEIVED', 'PROCESSING'].includes(document.status)) throw new FiscalConflictError('El documento no está listo para consultar autorización')
    const attempts = (await this.deps.repository.listTransmissions(id)).filter((item) => item.phase === 'AUTHORIZATION').length + 1
    const request = `<mockAuthorizationRequest><claveAcceso>${document.accessKey}</claveAcceso></mockAuthorizationRequest>`
    const result = await this.deps.sri.checkAuthorization(document)
    await this.transmission(document, 'AUTHORIZATION', result, request, attempts)
    if (result.status === 'EN PROCESAMIENTO') {
      if (document.status === 'RECEIVED') document = await this.transition(document, 'PROCESSING', 'MOCK_AUTHORIZATION_PROCESSING', actor)
      return document
    }
    if (result.status === 'NO AUTORIZADO') return this.transition(document, 'NOT_AUTHORIZED', 'MOCK_NOT_AUTHORIZED', actor, { message: result.message })
    if (result.status === 'ERROR TEMPORAL') return this.transition(document, 'RETRY_PENDING', 'MOCK_AUTHORIZATION_RETRY', actor, { message: result.message })
    if (result.status !== 'AUTORIZADO' || !result.authorizationNumber || !result.authorizationDate) {
      return this.transition(document, 'ERROR', 'MOCK_AUTHORIZATION_INVALID', actor, { message: result.message })
    }
    document = {
      ...document,
      authorizationNumber: result.authorizationNumber,
      authorizationDate: result.authorizationDate,
      sriStatus: 'AUTORIZADO-SIMULADO',
      sriMessage: result.message,
      updatedAt: now(),
    }
    await this.deps.repository.saveDocument(document)
    document = await this.transition(document, 'AUTHORIZED', 'MOCK_AUTHORIZED', actor, { noTaxValidity: true })
    const signed = document.xmlSignedPath ? (await this.deps.storage.read(document.xmlSignedPath)).toString('utf8') : ''
    const authorized = `<?xml version="1.0" encoding="UTF-8"?><autorizacionSimulada><estado>AUTORIZADO-SIMULADO</estado><numeroAutorizacion>${escapeXml(result.authorizationNumber)}</numeroAutorizacion><fechaAutorizacion>${escapeXml(result.authorizationDate)}</fechaAutorizacion><ambiente>LOCAL SIN VALIDEZ TRIBUTARIA</ambiente><comprobante><![CDATA[${signed}]]></comprobante></autorizacionSimulada>`
    const xmlStored = await this.deps.storage.write(id, document.documentType, document.issueDate, 'authorized-simulated.xml', authorized)
    const ride = await this.deps.ride.generate(document, this.deps.issuer)
    const rideStored = await this.deps.storage.write(id, document.documentType, document.issueDate, 'ride-local.pdf', ride)
    document = { ...document, authorizedXmlPath: xmlStored.relativePath, ridePath: rideStored.relativePath, updatedAt: now() }
    await this.deps.repository.saveDocument(document)
    await this.event(id, 'LOCAL_ARTIFACTS_GENERATED', actor, { xmlSha256: xmlStored.sha256, rideSha256: rideStored.sha256 })
    const previewPath = await this.deps.mailer.preview(document)
    await this.event(id, 'DELIVERY_PREVIEW_CREATED', actor, { previewPath, realEmailSent: false })
    return document
  }

  async process(id: string, actor = 'local-admin'): Promise<FiscalDocument> {
    let document = await this.get(id)
    if (['DRAFT', 'VALIDATION_FAILED'].includes(document.status)) document = (await this.validate(id, actor)).document
    if (!document.xmlUnsignedPath) document = (await this.generateXml(id, actor)).document
    if (!document.xmlSignedPath) document = await this.sign(id, actor)
    if (['SIGNED', 'PENDING_SUBMISSION', 'RETRY_PENDING'].includes(document.status)) document = await this.submit(id, actor)
    if (['RECEIVED', 'PROCESSING'].includes(document.status)) document = await this.checkAuthorization(id, actor)
    return document
  }

  async simulateDelivery(id: string, action: 'SEND' | 'RESEND', outcome: 'SUCCESS' | 'ERROR', actor = 'local-admin') {
    const document = await this.get(id)
    if (document.status !== 'AUTHORIZED' || !document.authorizedXmlPath || !document.ridePath) {
      throw new FiscalConflictError('La entrega simulada requiere XML autorizado simulado y RIDE local')
    }
    try {
      const evidencePath = await this.deps.mailer.simulate(document, action, outcome)
      const eventType = action === 'SEND' ? 'DELIVERY_SEND_SIMULATED' : 'DELIVERY_RESEND_SIMULATED'
      await this.event(id, eventType, actor, { evidencePath, realEmailSent: false })
      return { action, outcome: 'SUCCESS' as const, simulated: true, realEmailSent: false, evidencePath }
    } catch (error) {
      await this.event(id, 'DELIVERY_ERROR_SIMULATED', actor, {
        action,
        realEmailSent: false,
        message: error instanceof Error ? error.message : 'Error simulado',
      })
      return { action, outcome: 'ERROR' as const, simulated: true, realEmailSent: false }
    }
  }

  async retry(id: string, actor = 'local-admin'): Promise<FiscalDocument> {
    const before = await this.get(id)
    if (!['RETRY_PENDING', 'RETURNED', 'NOT_AUTHORIZED', 'ERROR'].includes(before.status)) {
      throw new FiscalConflictError('El estado actual no permite reintento')
    }
    let document = before
    if (['RETURNED', 'NOT_AUTHORIZED'].includes(document.status)) {
      document = await this.transition(document, 'DRAFT', 'CORRECTION_REQUIRED', actor)
      throw new FiscalValidationError('Corrija y valide el mismo documento; no se creó otro secuencial')
    }
    if (document.status === 'ERROR') document = await this.transition(document, 'RETRY_PENDING', 'RETRY_SCHEDULED', actor)
    const key = document.accessKey
    const sequential = document.sequential
    document = await this.submit(id, actor)
    if (document.accessKey !== key || document.sequential !== sequential) throw new Error('Invariante rota: el reintento cambió la numeración')
    return document
  }

  async createCreditNote(
    invoiceId: string,
    raw: CreateCreditNoteInput,
    idempotencyKey: string,
    actor = 'local-admin',
  ): Promise<FiscalDocument> {
    const existingId = await this.deps.repository.resolveIdempotency(idempotencyKey)
    if (existingId) return this.get(existingId)
    const input = createCreditNoteSchema.parse(raw)
    const invoice = await this.get(invoiceId)
    if (invoice.documentType !== 'INVOICE' || invoice.status !== 'AUTHORIZED') {
      throw new FiscalConflictError('La nota de crédito requiere una factura autorizada simulada')
    }
    if (new Decimal(input.modifiedValue).lte(0)) throw new FiscalValidationError('El valor modificado debe ser mayor que cero')
    const priorCredits = (await this.deps.repository.listDocuments()).filter((item) =>
      item.documentType === 'CREDIT_NOTE' && item.sourceId === invoice.id && !['CANCELLED_INTERNAL', 'RETURNED', 'NOT_AUTHORIZED'].includes(item.status))
    const previousCredits = priorCredits.reduce((sum, item) => sum.plus(item.creditNoteReference?.modifiedValue ?? item.grandTotal), new Decimal(0))
    const remainingBefore = new Decimal(invoice.grandTotal).minus(previousCredits)
    if (new Decimal(input.modifiedValue).gt(remainingBefore)) {
      throw new FiscalValidationError(`La nota de crédito no puede superar el saldo modificable de ${remainingBefore.toFixed(2)}`)
    }
    const id = `FD-${randomUUID()}`
    const timestamp = now()
    const itemInput = [{
      mainCode: 'NC-LOCAL',
      description: `Modificación local: ${input.reason}`,
      quantity: '1',
      unitPrice: formatMoney(input.modifiedValue),
      discount: '0.00',
      taxCode: '2',
      percentageCode: '0',
      rate: '0.00',
    }]
    const calculation = calculateDocument(id, itemInput, timestamp)
    const document: FiscalDocument = {
      id,
      documentType: 'CREDIT_NOTE',
      sourceType: 'AUTHORIZED_INVOICE',
      sourceId: invoice.id,
      issuerId: invoice.issuerId,
      customer: { ...invoice.customer, id: `CUS-${randomUUID()}`, createdAt: timestamp, updatedAt: timestamp },
      environment: '1',
      issueDate: input.issueDate,
      establishmentCode: invoice.establishmentCode,
      emissionPointCode: invoice.emissionPointCode,
      currency: 'DOLAR',
      status: 'DRAFT',
      ...calculation,
      grandTotal: formatMoney(input.modifiedValue),
      paymentStatus: 'NOT_APPLICABLE',
      payments: [],
      creditNoteReference: {
        id: `CNR-${randomUUID()}`,
        creditNoteDocumentId: id,
        originalInvoiceId: invoice.id,
        originalDocumentNumber: documentNumber(invoice),
        originalIssueDate: invoice.issueDate,
        reason: input.reason,
        modifiedValue: formatMoney(input.modifiedValue),
      },
      creditBalance: {
        originalTotal: invoice.grandTotal,
        previousCredits: formatMoney(previousCredits),
        modifiedValue: formatMoney(input.modifiedValue),
        remainingBalance: formatMoney(remainingBefore.minus(input.modifiedValue)),
      },
      createdBy: actor,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    await this.deps.repository.saveDocument(document)
    await this.deps.repository.rememberIdempotency(idempotencyKey, document.id)
    await this.event(document.id, 'CREDIT_NOTE_DRAFT_CREATED', actor, { originalInvoiceId: invoice.id }, undefined, 'DRAFT')
    await this.event(invoice.id, 'CREDIT_NOTE_RELATED', actor, { creditNoteId: document.id, invoiceStatusUnchanged: true })
    return document
  }

  async events(id: string): Promise<FiscalEvent[]> { await this.get(id); return this.deps.repository.listEvents(id) }
  async transmissions(id: string): Promise<SriTransmission[]> { await this.get(id); return this.deps.repository.listTransmissions(id) }

  async file(id: string, kind: 'xml' | 'ride' | 'unsigned' | 'signed'): Promise<{ content: Buffer; filename: string; mime: string }> {
    const document = await this.get(id)
    const path = kind === 'ride' ? document.ridePath
      : kind === 'unsigned' ? document.xmlUnsignedPath
        : kind === 'signed' ? document.xmlSignedPath
          : document.authorizedXmlPath
    if (!path) throw new FiscalNotFoundError(`Archivo ${kind} todavía no disponible`)
    const extension = kind === 'ride' ? 'pdf' : 'xml'
    const prefix = document.documentType === 'INVOICE' ? 'factura' : 'nota-credito'
    return {
      content: await this.deps.storage.read(path),
      filename: `${prefix}-${documentNumber(document)}-LOCAL.${extension}`,
      mime: kind === 'ride' ? 'application/pdf' : 'application/xml; charset=utf-8',
    }
  }
}
