import { isFiscalPreviewDemoEnabled } from '../../utils/fiscalFeature'
import { buildPreviewXml, createPreviewArtifact } from './previewFiscalDocuments'
import { createPreviewFiscalStore } from './previewFiscalStore'

const TERMINAL_STATUSES = new Set(['AUTHORIZED', 'RETURNED', 'NOT_AUTHORIZED', 'ERROR'])
const OUTCOMES = {
  SUCCESS: { status: 'AUTHORIZED', sriStatus: 'AUTORIZADO-SIMULADO', message: 'Autorización ficticia sin validez tributaria' },
  RETURNED: { status: 'RETURNED', sriStatus: 'DEVUELTO-SIMULADO', message: 'Documento devuelto por el simulador de Preview' },
  NOT_AUTHORIZED: { status: 'NOT_AUTHORIZED', sriStatus: 'NO-AUTORIZADO-SIMULADO', message: 'Documento no autorizado por el simulador de Preview' },
  TEMPORARY_ERROR: { status: 'RETRY_PENDING', sriStatus: 'ERROR-TEMPORAL-SIMULADO', message: 'Error temporal ficticio; el reintento quedó pendiente' },
  PROCESSING: { status: 'PROCESSING', sriStatus: 'PROCESANDO-SIMULADO', message: 'El simulador mantiene el documento en procesamiento' },
}

const clone = (value) => structuredClone(value)
const amount = (cents) => (cents / 100).toFixed(2)
const toCents = (value) => {
  const text = String(value ?? 0).trim()
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(text)) throw new Error(`Valor monetario inválido: ${text || 'vacío'}`)
  const negative = text.startsWith('-')
  const [whole, decimal = ''] = text.replace('-', '').split('.')
  const cents = Number(whole) * 100 + Number(decimal.padEnd(2, '0'))
  return negative ? -cents : cents
}
const quantityUnits = (value) => {
  const text = String(value ?? '').trim()
  if (!/^\d+(?:\.\d{1,4})?$/.test(text) || Number(text) <= 0) throw new Error('La cantidad debe ser mayor que cero y tener máximo cuatro decimales')
  const [whole, decimal = ''] = text.split('.')
  return Number(whole) * 10000 + Number(decimal.padEnd(4, '0'))
}
const rateUnits = (value) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) throw new Error('La tarifa tributaria de demostración no es válida')
  return Math.round(numeric * 100)
}
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil' }).format(new Date())
const now = () => new Date().toISOString()
const delay = (milliseconds) => milliseconds > 0 ? new Promise((resolve) => setTimeout(resolve, milliseconds)) : Promise.resolve()
const withSequenceLock = (operation) => globalThis.navigator?.locks?.request
  ? globalThis.navigator.locks.request('ra-training:fiscal-preview:sequence', operation)
  : operation()

function requirePreviewAccess(authorize) {
  if (!authorize()) throw new Error('La demostración fiscal de Preview requiere una sesión normal de administrador')
}

function nextId(state, counter, prefix) {
  state.counters[counter] += 1
  return `${prefix}-${String(state.counters[counter]).padStart(6, '0')}`
}

function addEvent(state, document, eventType, previousStatus, detailsJson = {}) {
  const entry = {
    id: nextId(state, 'event', 'EVENT-PREVIEW'), documentId: document.id, eventType,
    previousStatus: previousStatus || null, newStatus: document.status, actor: 'preview-admin',
    detailsJson: { simulated: true, ...detailsJson }, occurredAt: now(),
  }
  state.events[document.id] ||= []
  state.events[document.id].push(entry)
  return entry
}

function addTransmission(state, document, phase, responseStatus, responseMessage) {
  const attempt = (state.transmissions[document.id]?.length || 0) + 1
  const sequence = nextId(state, 'transmission', 'TX-PREVIEW')
  const entry = {
    id: sequence, documentId: document.id, phase, attempt,
    requestHash: String(state.counters.transmission).padStart(64, '0'), responseCode: 'DEMO', responseStatus, responseMessage,
    startedAt: now(), completedAt: now(),
  }
  state.transmissions[document.id] ||= []
  state.transmissions[document.id].push(entry)
  return entry
}

function calculateInvoice(data, paymentMethods) {
  if (!data.customer?.identification || !data.customer?.legalName || !data.customer?.email) throw new Error('Completa identificación, nombre y correo del adquirente')
  if (!Array.isArray(data.items) || !data.items.length) throw new Error('Agrega al menos una línea de detalle')
  let subtotalCents = 0; let discountCents = 0; let taxCents = 0
  const items = data.items.map((raw, index) => {
    if (!raw.mainCode || !raw.description) throw new Error(`Completa el código y la descripción de la línea ${index + 1}`)
    const gross = Math.round(toCents(raw.unitPrice) * quantityUnits(raw.quantity) / 10000)
    const discount = toCents(raw.discount || 0)
    if (gross < 0 || discount < 0 || discount > gross) throw new Error(`El descuento de la línea ${index + 1} no es válido`)
    const base = gross - discount
    const tax = Math.round(base * rateUnits(raw.rate || 0) / 10000)
    subtotalCents += gross; discountCents += discount; taxCents += tax
    return {
      ...raw, id: `ITEM-PREVIEW-${index + 1}`, quantity: String(raw.quantity), unitPrice: amount(toCents(raw.unitPrice)), discount: amount(discount),
      subtotal: amount(base), rate: amount(Math.round(Number(raw.rate || 0) * 100)), taxValue: amount(tax), fiscalClassificationValidated: false,
    }
  })
  const withoutTaxesCents = subtotalCents - discountCents
  const tipCents = toCents(data.tip || 0)
  const grandTotalCents = withoutTaxesCents + taxCents + tipCents
  if (grandTotalCents <= 0) throw new Error('El total debe ser mayor que cero')
  if (!Array.isArray(data.payments) || !data.payments.length) throw new Error('Agrega al menos una forma de pago')
  const payments = data.payments.map((raw, index) => {
    const method = paymentMethods.find((item) => item.code === raw.methodCode)
    if (!method) throw new Error(`La forma de pago de la línea ${index + 1} no existe`)
    return { ...raw, id: `PAY-PREVIEW-${index + 1}`, amount: amount(toCents(raw.amount)), methodDescription: method.shortLabel || method.label }
  })
  const paidCents = payments.reduce((sum, item) => sum + toCents(item.amount), 0)
  if (paidCents !== grandTotalCents) throw new Error(`Las formas de pago deben sumar exactamente ${amount(grandTotalCents)}`)
  return {
    items, payments, subtotal: amount(subtotalCents), totalDiscount: amount(discountCents), totalWithoutTaxes: amount(withoutTaxesCents),
    totalTaxes: amount(taxCents), tip: amount(tipCents), grandTotal: amount(grandTotalCents),
  }
}

function buildAccessKey(document) {
  const [year, month, day] = document.issueDate.split('-')
  const documentCode = document.documentType === 'CREDIT_NOTE' ? '04' : '01'
  return `${day}${month}${year}${documentCode}0000000000001${document.environment === 'PREVIEW' ? '1' : '2'}${document.establishmentCode}${document.emissionPointCode}${document.sequential}123456781`
}

function updateDocumentXml(document, config) {
  document.xmlUnsignedText = buildPreviewXml(document, config)
  document.xmlUnsignedPath = `preview://${document.id}/unsigned.xml`
}

function pathFor(type) {
  return type === 'credit-notes' ? 'CREDIT_NOTE' : 'INVOICE'
}

export function createPreviewFiscalApi({
  store = createPreviewFiscalStore(),
  authorize = () => isFiscalPreviewDemoEnabled(),
  transitionDelay = 150,
  downloadArtifact,
} = {}) {
  const guard = () => requirePreviewAccess(authorize)
  const stateValue = (pick) => { guard(); return clone(pick(store.read())) }
  const find = (state, id, type) => {
    const document = state.documents.find((item) => item.id === id && (!type || item.documentType === pathFor(type)))
    if (!document) throw new Error('Documento fiscal de demostración no encontrado')
    return document
  }

  async function createInvoice(data) {
    guard()
    return store.mutate((state) => {
      const source = state.sources.find((item) => item.id === data.sourceEnrollmentId)
      if (!source || source.paymentStatus !== 'VERIFIED' || source.fiscalStatus !== 'ELIGIBLE') throw new Error('La inscripción ficticia no está habilitada para facturación')
      const totals = calculateInvoice(data, state.paymentMethods)
      const timestamp = now()
      const id = nextId(state, 'document', 'FD-PREVIEW')
      const document = {
        id, documentType: 'INVOICE', sourceType: 'ENROLLMENT', sourceId: source.id, issuerId: state.config.issuer.id,
        customer: { ...clone(data.customer), id: `CUSTOMER-${id}`, createdAt: timestamp, updatedAt: timestamp },
        environment: 'PREVIEW', issueDate: data.issueDate || today(), establishmentCode: state.config.establishment.code,
        emissionPointCode: state.config.emissionPoint.code, sequential: null, accessKey: null, currency: 'DOLAR', status: 'DRAFT',
        ...totals, taxes: totals.items.filter((item) => toCents(item.taxValue) > 0).map((item) => ({ code: item.taxCode, percentageCode: item.percentageCode, rate: item.rate, taxableBase: item.subtotal, value: item.taxValue })),
        additionalFields: clone(data.additionalFields || []), participantName: data.participantName || source.participantName,
        remissionGuide: data.remissionGuide || null, negotiableInvoice: Boolean(data.negotiableInvoice), paymentStatus: 'VERIFIED',
        xmlUnsignedPath: null, xmlSignedPath: null, authorizedXmlPath: null, ridePath: null,
        authorizationNumber: null, authorizationDate: null, sriStatus: null, sriMessage: null,
        creditBalance: { originalTotal: totals.grandTotal, previousCredits: '0.00', modifiedValue: '0.00', remainingBalance: totals.grandTotal },
        createdBy: 'preview-admin', createdAt: timestamp, updatedAt: timestamp,
      }
      document.items = document.items.map((item) => ({ ...item, documentId: id }))
      document.payments = document.payments.map((payment) => ({ ...payment, documentId: id }))
      state.documents.push(document); state.events[id] = []; state.transmissions[id] = []
      addEvent(state, document, 'PREVIEW_INVOICE_CREATED', null, { sourceId: source.id })
      return document
    })
  }

  function transition(id, type, status, eventType, details = {}) {
    return store.mutate((state) => {
      const document = find(state, id, type); const previous = document.status
      document.status = status; document.updatedAt = now()
      addEvent(state, document, eventType, previous, details)
      return document
    })
  }

  async function runAction(id, action, type = 'invoices', outcome = 'SUCCESS') {
    guard()
    let current = find(store.read(), id, type)
    if (action === 'process') {
      const actions = []
      if (['DRAFT', 'VALIDATION_FAILED'].includes(current.status)) actions.push('validate')
      if (!current.xmlUnsignedPath) actions.push('generate-xml')
      if (!current.xmlSignedPath) actions.push('sign')
      if (!['SUBMITTED', 'RECEIVED', 'PROCESSING'].includes(current.status)) actions.push('submit')
      actions.push('check-authorization')
      for (const item of actions) {
        const result = await runAction(id, item, type, item === 'check-authorization' ? outcome : 'SUCCESS')
        current = result.document || result
        if (TERMINAL_STATUSES.has(current.status) || current.status === 'RETRY_PENDING' || (current.status === 'PROCESSING' && outcome === 'PROCESSING')) break
      }
      return { document: current }
    }

    await delay(transitionDelay)
    if (action === 'validate') {
      const document = await withSequenceLock(() => store.mutate((state) => {
        const target = find(state, id, type); const previous = target.status
        if (!['DRAFT', 'VALIDATION_FAILED'].includes(target.status)) throw new Error('El documento no está disponible para validación')
        const counter = target.documentType === 'CREDIT_NOTE' ? 'creditSequence' : 'invoiceSequence'
        state.counters[counter] += 1
        target.sequential = String(state.counters[counter]).padStart(9, '0'); target.accessKey = buildAccessKey(target)
        target.status = 'READY_TO_SIGN'; target.updatedAt = now()
        addEvent(state, target, 'PREVIEW_VALIDATED', previous, { sequenceReservedInBrowser: true })
        return target
      }))
      return { document }
    }
    if (action === 'generate-xml') {
      const document = store.mutate((state) => {
        const target = find(state, id, type); const previous = target.status
        if (target.status !== 'READY_TO_SIGN') throw new Error('Valida el documento antes de generar el XML')
        updateDocumentXml(target, state.config); target.updatedAt = now()
        addEvent(state, target, 'PREVIEW_XML_GENERATED', previous, { xsdValidated: false })
        return target
      })
      return { document }
    }
    if (action === 'sign') {
      const document = store.mutate((state) => {
        const target = find(state, id, type); const previous = target.status
        if (target.status !== 'READY_TO_SIGN' || !target.xmlUnsignedPath) throw new Error('Genera el XML antes de aplicar la firma de demostración')
        target.xmlSignedText = `${target.xmlUnsignedText}\n<!-- FIRMA DE DEMOSTRACIÓN NO CRIPTOGRÁFICA -->`
        target.xmlSignedPath = `preview://${target.id}/signed.xml`; target.status = 'SIGNED'; target.updatedAt = now()
        addEvent(state, target, 'PREVIEW_NON_CRYPTOGRAPHIC_SIGNATURE', previous)
        return target
      })
      return { document }
    }
    if (action === 'submit') {
      const beforeSubmit = find(store.read(), id, type)
      if (!['SIGNED', 'PENDING_SUBMISSION', 'RETRY_PENDING'].includes(beforeSubmit.status)) throw new Error('El documento no está listo para el envío simulado')
      transition(id, type, 'PENDING_SUBMISSION', 'PREVIEW_SUBMISSION_QUEUED')
      await delay(transitionDelay)
      const document = store.mutate((state) => {
        const target = find(state, id, type); const previous = target.status
        if (!['PENDING_SUBMISSION', 'RETRY_PENDING'].includes(target.status)) throw new Error('El documento no está listo para el envío simulado')
        target.status = 'SUBMITTED'; target.updatedAt = now()
        addTransmission(state, target, 'RECEPTION_PREVIEW', 'RECEIVED_SIMULATED', 'Recepción simulada sin conexión externa')
        addEvent(state, target, 'PREVIEW_SUBMITTED', previous)
        return target
      })
      await delay(transitionDelay)
      return { document: transition(id, type, 'RECEIVED', 'PREVIEW_RECEIVED') }
    }
    if (action === 'check-authorization') {
      const result = OUTCOMES[outcome] || OUTCOMES.SUCCESS
      const document = store.mutate((state) => {
        const target = find(state, id, type); const previous = target.status
        if (!['RECEIVED', 'PROCESSING', 'SUBMITTED', 'RETRY_PENDING'].includes(target.status)) throw new Error('El documento no está disponible para consulta simulada')
        target.status = result.status; target.sriStatus = result.sriStatus; target.sriMessage = result.message; target.updatedAt = now()
        if (result.status === 'AUTHORIZED') {
          target.authorizationNumber = `DEMO-AUTH-${target.documentType === 'CREDIT_NOTE' ? 'CREDIT' : 'INVOICE'}-${target.sequential}`
          target.authorizationDate = now(); target.authorizedXmlPath = `preview://${target.id}/authorized.xml`; target.ridePath = `preview://${target.id}/ride.pdf`
          target.authorizedXmlText = `<?xml version="1.0" encoding="UTF-8"?><autorizacionPreview><estado>AUTORIZADO-SIMULADO</estado><advertencia>DEMOSTRACIÓN DE PREVIEW SIN VALIDEZ TRIBUTARIA</advertencia><comprobante><![CDATA[${target.xmlSignedText || target.xmlUnsignedText}]]></comprobante></autorizacionPreview>`
          if (target.documentType === 'INVOICE') {
            const source = state.sources.find((item) => item.id === target.sourceId)
            if (source) source.fiscalStatus = 'ALREADY_INVOICED'
          }
        }
        addTransmission(state, target, 'AUTHORIZATION_PREVIEW', result.sriStatus, result.message)
        addEvent(state, target, `PREVIEW_${result.status}`, previous, { outcome })
        return target
      })
      return { document }
    }
    throw new Error('Acción fiscal de demostración no permitida')
  }

  async function createCreditNote(invoiceId, data) {
    guard()
    return store.mutate((state) => {
      const invoice = find(state, invoiceId, 'invoices')
      if (invoice.status !== 'AUTHORIZED') throw new Error('La nota de crédito solo puede partir de una factura autorizada simuladamente')
      const issueDate = data.issueDate || today()
      if (issueDate < invoice.issueDate) throw new Error('La fecha de la nota de crédito no puede ser anterior a la factura de referencia')
      const modified = toCents(data.modifiedValue)
      const previousCredits = state.documents.filter((item) => item.documentType === 'CREDIT_NOTE' && item.sourceId === invoice.id && item.status !== 'RETURNED' && item.status !== 'NOT_AUTHORIZED').reduce((sum, item) => sum + toCents(item.grandTotal), 0)
      const remaining = toCents(invoice.grandTotal) - previousCredits
      if (modified <= 0 || modified > remaining) throw new Error(`El valor debe ser mayor que cero y no superar el saldo ${amount(remaining)}`)
      if (!String(data.reason || '').trim()) throw new Error('Ingresa el motivo de la nota de crédito')
      const timestamp = now(); const id = nextId(state, 'document', 'NC-PREVIEW')
      const document = {
        id, documentType: 'CREDIT_NOTE', sourceType: 'INVOICE', sourceId: invoice.id, issuerId: state.config.issuer.id,
        customer: clone(invoice.customer), environment: 'PREVIEW', issueDate, establishmentCode: state.config.establishment.code,
        emissionPointCode: state.config.emissionPoint.code, sequential: null, accessKey: null, currency: 'DOLAR', status: 'DRAFT',
        items: [{ id: `ITEM-${id}`, documentId: id, mainCode: 'NC-DEMO', description: String(data.reason).trim(), quantity: '1', unitPrice: amount(modified), discount: '0.00', subtotal: amount(modified), taxCode: '2', percentageCode: '0', rate: '0.00', taxValue: '0.00', taxCategory: 'IVA_0', fiscalClassificationValidated: false, createdAt: timestamp }],
        taxes: [], payments: [], additionalFields: [], subtotal: amount(modified), totalDiscount: '0.00', totalWithoutTaxes: amount(modified), totalTaxes: '0.00', tip: '0.00', grandTotal: amount(modified), paymentStatus: 'VERIFIED',
        creditNoteReference: { id: `REF-${id}`, creditNoteDocumentId: id, originalInvoiceId: invoice.id, originalDocumentNumber: `${invoice.establishmentCode}-${invoice.emissionPointCode}-${invoice.sequential}`, originalIssueDate: invoice.issueDate, reason: String(data.reason).trim(), modifiedValue: amount(modified) },
        xmlUnsignedPath: null, xmlSignedPath: null, authorizedXmlPath: null, ridePath: null,
        authorizationNumber: null, authorizationDate: null, sriStatus: null, sriMessage: null, createdBy: 'preview-admin', createdAt: timestamp, updatedAt: timestamp,
      }
      invoice.creditBalance = { originalTotal: invoice.grandTotal, previousCredits: amount(previousCredits), modifiedValue: amount(modified), remainingBalance: amount(remaining - modified) }
      state.documents.push(document); state.events[id] = []; state.transmissions[id] = []
      addEvent(state, document, 'PREVIEW_CREDIT_NOTE_CREATED', null, { originalInvoiceId: invoice.id })
      return document
    })
  }

  async function simulateDelivery(id, action = 'simulate', type = 'invoices', outcome = 'SUCCESS') {
    guard()
    const document = store.mutate((state) => {
      const target = find(state, id, type)
      if (target.status !== 'AUTHORIZED') throw new Error('Solo un documento autorizado simuladamente puede enviarse')
      const failure = outcome !== 'SUCCESS'
      addTransmission(state, target, action === 'resend' ? 'EMAIL_RESEND_PREVIEW' : 'EMAIL_DELIVERY_PREVIEW', failure ? 'DELIVERY_ERROR_SIMULATED' : 'DELIVERED_SIMULATED', failure ? 'Error ficticio de entrega' : 'Entrega ficticia; no se envió ningún correo')
      addEvent(state, target, failure ? 'PREVIEW_EMAIL_ERROR' : 'PREVIEW_EMAIL_DELIVERED', target.status, { action, outcome })
      return target
    })
    return { document, simulated: true, delivered: outcome === 'SUCCESS' }
  }

  async function download(id, kind, type = 'invoices') {
    guard()
    const state = store.read(); const document = find(state, id, type)
    if (kind === 'xml' && !document.authorizedXmlPath) throw new Error('El XML autorizado simulado aún no está disponible')
    if (kind === 'ride' && !document.ridePath) throw new Error('El RIDE de demostración aún no está disponible')
    const artifact = await createPreviewArtifact(document, kind, state.config)
    if (downloadArtifact) return downloadArtifact(artifact)
    const href = URL.createObjectURL(artifact.blob)
    try {
      const link = globalThis.document.createElement('a'); link.href = href; link.download = artifact.filename
      globalThis.document.body.appendChild(link); link.click(); link.remove()
    } finally { URL.revokeObjectURL(href) }
    return { filename: artifact.filename }
  }

  return {
    config: async () => stateValue((state) => state.config),
    readiness: async () => stateValue((state) => state.readiness),
    catalog: async () => stateValue((state) => ({ provider: 'Demostración de Preview en navegador', remoteDataUsed: false, items: state.catalog })),
    paymentMethods: async () => stateValue((state) => ({ items: state.paymentMethods })),
    sources: async () => stateValue((state) => state.sources),
    invoices: async () => stateValue((state) => state.documents.filter((item) => item.documentType === 'INVOICE')),
    creditNotes: async () => stateValue((state) => state.documents.filter((item) => item.documentType === 'CREDIT_NOTE')),
    createInvoice,
    getInvoice: async (id) => stateValue((state) => find(state, id, 'invoices')),
    getDocument: async (id, type = 'invoices') => stateValue((state) => find(state, id, type)),
    step: runAction,
    simulateDelivery,
    events: async (id, type = 'invoices') => stateValue((state) => { find(state, id, type); return state.events[id] || [] }),
    transmissions: async (id, type = 'invoices') => stateValue((state) => { find(state, id, type); return state.transmissions[id] || [] }),
    createCreditNote,
    xmlText: async (id, type = 'invoices') => stateValue((state) => { const document = find(state, id, type); return document.authorizedXmlText || document.xmlSignedText || document.xmlUnsignedText || '' }),
    download,
    resetDemo: async () => { guard(); return store.reset() },
  }
}
