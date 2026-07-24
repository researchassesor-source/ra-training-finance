import { buildPreviewXml } from './previewFiscalDocuments'

export const PREVIEW_STORE_VERSION = 1
export const PREVIEW_STORE_KEY = 'ra-training:fiscal-preview:v1'

const ISSUED_AT = '2026-07-24T14:00:00.000Z'

export const previewConfig = {
  previewDemo: true,
  providerLabel: 'Demostración de Preview en navegador',
  banner: 'ENTORNO DE PREVISUALIZACIÓN | SIN VALIDEZ TRIBUTARIA | NO CONECTADO AL SRI',
  storage: 'browser-preview', persistent: true, realSriConnectionEnabled: false,
  signer: 'Firma de demostración', signerTechnical: 'BROWSER_DEMO_NON_CRYPTOGRAPHIC',
  xsd: 'Estructura de demostración basada en el flujo local validado',
  issuer: {
    id: 'ISSUER-PREVIEW-DEMO', rucPlaceholder: '0000000000000',
    businessName: 'EMPRESA FICTICIA DE CAPACITACIÓN S.A.S.', tradeName: 'AULA DEMO PREVIEW',
    headOfficeAddress: 'AV. DEMOSTRACIÓN 123, CIUDAD DEMO', establishmentAddress: 'AV. DEMOSTRACIÓN 123, CIUDAD DEMO',
    city: 'Ciudad Demo', phone: '0000000000', email: 'fiscal-preview@example.invalid',
    accountingObligation: 'NO', accountingObligationConfirmed: false, retentionAgent: 'NO',
    regimeInformation: 'DEMOSTRACIÓN SIN OBLIGACIÓN TRIBUTARIA REAL', establishmentCode: '001', emissionPointCode: '001',
    environment: 'PREVIEW', currency: 'DOLAR', timezone: 'America/Guayaquil', createdAt: ISSUED_AT, updatedAt: ISSUED_AT,
  },
  establishment: { code: '001', address: 'AV. DEMOSTRACIÓN 123, CIUDAD DEMO', status: 'READY' },
  emissionPoint: { code: '001', sequenceStart: 'SECUENCIA FICTICIA', status: 'REQUIRES_CONFIRMATION' },
  certificate: { configured: false, alias: 'SIN FIRMA INSTITUCIONAL', passwordConfigured: false },
  sri: { environment: 'PREVIEW', realConnectionEnabled: false, confirmed: false },
}

export const previewSources = [
  { id: 'ENR-FAKE-001', participantName: 'Valeria Prueba Andina', participantIdentification: '0999999999', participantEmail: 'valeria.prueba@example.test', participantAddress: 'Calle Ficticia 100, Ciudad Demo', participantPhone: '0990000001', serviceName: 'Curso demostrativo de análisis de datos', serviceCode: 'CUR-DEMO-01', amount: '115.00', paymentStatus: 'VERIFIED', fiscalStatus: 'ELIGIBLE', issueNote: 'Caso completo de demostración con pago verificado.' },
  { id: 'ENR-FAKE-002', participantName: 'Mateo Ensayo Sierra', participantIdentification: '0999999998', participantEmail: 'mateo.ensayo@example.test', participantAddress: 'Pasaje Simulado 22, Ciudad Demo', participantPhone: '0990000002', serviceName: 'Taller ficticio de herramientas digitales', serviceCode: 'TAL-DEMO-02', amount: '80.00', paymentStatus: 'PENDING', fiscalStatus: 'INCOMPLETE', issueNote: 'No elegible: pago pendiente de demostración.' },
  { id: 'ENR-FAKE-003', participantName: 'Camila Escenario Costa', participantIdentification: '0999999997', participantEmail: 'correo-invalido', participantAddress: 'Avenida Ejemplo 3, Ciudad Demo', participantPhone: '0990000003', serviceName: 'Seminario local de prueba', serviceCode: 'SEM-DEMO-03', amount: '50.00', paymentStatus: 'VERIFIED', fiscalStatus: 'INCOMPLETE', issueNote: 'No elegible: correo ficticio inválido.' },
  { id: 'ENR-FAKE-004', participantName: 'Bruno Caso Oriente', participantIdentification: '', participantEmail: 'bruno.caso@example.test', participantAddress: 'Ruta Imaginaria 45, Ciudad Demo', participantPhone: '0990000004', serviceName: 'Servicio pendiente de revisión tributaria', serviceCode: 'SRV-DEMO-04', amount: '95.00', paymentStatus: 'VERIFIED', fiscalStatus: 'INCOMPLETE', issueNote: 'No elegible: identificación incompleta.' },
  { id: 'ENR-FAKE-005', participantName: 'Lucía Muestra Austral', participantIdentification: '0999999996', participantEmail: 'lucia.muestra@example.test', participantAddress: 'Calle Laboratorio 5, Ciudad Demo', participantPhone: '0990000005', serviceName: 'Programa ficticio ya facturado', serviceCode: 'PRO-DEMO-05', amount: '120.00', paymentStatus: 'VERIFIED', fiscalStatus: 'ALREADY_INVOICED', issueNote: 'Factura autorizada simuladamente en la semilla.' },
  { id: 'ENR-FAKE-006', participantName: 'Nicolás Ejemplo Central', participantIdentification: '0999999995', participantEmail: 'nicolas.ejemplo@example.test', participantAddress: 'Boulevard Prueba 6, Ciudad Demo', participantPhone: '0990000006', serviceName: 'Curso candidato a nota de crédito', serviceCode: 'CUR-DEMO-06', amount: '230.00', paymentStatus: 'VERIFIED', fiscalStatus: 'ELIGIBLE', issueNote: 'Caso elegible para factura y nota de crédito de demostración.' },
]

export const previewCatalog = [
  { operationalId: 'SVC-PREVIEW-001', operationalName: 'Curso demostrativo de análisis de datos', operationalDescription: 'Curso ficticio exclusivo de Preview', referencePrice: '115.00', mainCode: 'CUR-DEMO-01', invoiceDescription: 'Curso demostrativo de análisis de datos', priceIncludesTax: false, exempt: false, notSubject: false, activeForBilling: false, status: 'REQUIRES_TAX_REVIEW' },
  { operationalId: 'SVC-PREVIEW-002', operationalName: 'Taller ficticio de herramientas digitales', operationalDescription: 'Taller ficticio exclusivo de Preview', referencePrice: '80.00', mainCode: 'TAL-DEMO-02', invoiceDescription: 'Taller ficticio de herramientas digitales', priceIncludesTax: false, exempt: false, notSubject: false, activeForBilling: false, status: 'REQUIRES_TAX_REVIEW' },
  { operationalId: 'SVC-PREVIEW-003', operationalName: 'Seminario local de prueba', operationalDescription: 'Seminario ficticio sin conexión externa', referencePrice: '50.00', mainCode: 'SEM-DEMO-03', invoiceDescription: 'Seminario local de prueba', priceIncludesTax: false, exempt: false, notSubject: false, activeForBilling: false, status: 'REQUIRES_TAX_REVIEW' },
  { operationalId: 'SVC-PREVIEW-004', operationalName: 'Servicio pendiente de revisión tributaria', operationalDescription: 'Clasificación fiscal deliberadamente pendiente', referencePrice: '95.00', mainCode: 'SRV-DEMO-04', invoiceDescription: 'Servicio pendiente de revisión tributaria', priceIncludesTax: false, exempt: false, notSubject: false, activeForBilling: false, status: 'REQUIRES_TAX_REVIEW' },
]

export const previewPaymentMethods = [
  { code: '01', label: 'Sin utilización del sistema financiero', shortLabel: 'Efectivo / sin sistema financiero' },
  { code: '15', label: 'Compensación de deudas', shortLabel: 'Compensación' },
  { code: '16', label: 'Tarjeta de débito', shortLabel: 'Tarjeta de débito' },
  { code: '17', label: 'Dinero electrónico', shortLabel: 'Dinero electrónico' },
  { code: '18', label: 'Tarjeta prepago', shortLabel: 'Tarjeta prepago' },
  { code: '19', label: 'Tarjeta de crédito', shortLabel: 'Tarjeta de crédito' },
  { code: '20', label: 'Otros con utilización del sistema financiero', shortLabel: 'Transferencia / sistema financiero' },
  { code: '21', label: 'Endoso de títulos', shortLabel: 'Endoso de títulos' },
]

export const previewReadiness = {
  status: 'BLOCKED', ready: false,
  officialBlockers: ['Datos tributarios institucionales', 'Secuencial real', 'Catálogo fiscal', 'Firma electrónica', 'Certificación SRI', 'Persistencia productiva'],
  checks: [
    { key: 'address', label: 'Domicilio tributario', status: 'REQUIRES_CONFIRMATION', detail: 'Solo existe una dirección ficticia de demostración.', group: 'CERTIFICATION_REQUIRED' },
    { key: 'accounting', label: 'Contabilidad y régimen', status: 'REQUIRES_CONFIRMATION', detail: 'No existe obligación tributaria real configurada.', group: 'CERTIFICATION_REQUIRED' },
    { key: 'establishment', label: 'Establecimiento', status: 'PARTIAL', detail: 'Código ficticio disponible únicamente para Preview.', group: 'CERTIFICATION_REQUIRED' },
    { key: 'emissionPoint', label: 'Punto de emisión', status: 'PARTIAL', detail: 'Punto ficticio sin numeración oficial.', group: 'CERTIFICATION_REQUIRED' },
    { key: 'sequence', label: 'Secuencial real', status: 'REQUIRES_CONFIRMATION', detail: 'Solo se utilizan contadores ficticios del navegador.', group: 'CERTIFICATION_REQUIRED' },
    { key: 'catalog', label: 'Catálogo fiscal', status: 'REQUIRES_CONFIRMATION', detail: 'Todos los servicios requieren revisión tributaria.', group: 'CERTIFICATION_REQUIRED' },
    { key: 'certificate', label: 'Firma electrónica', status: 'REQUIRES_CERTIFICATE', detail: 'No existe firma institucional en Preview.', group: 'CERTIFICATION_REQUIRED' },
    { key: 'sri', label: 'Adaptador SRI', status: 'REQUIRES_CERTIFICATION', detail: 'No existe conexión al SRI.', group: 'CERTIFICATION_REQUIRED' },
    { key: 'certificationTests', label: 'Pruebas de certificación', status: 'REQUIRES_CERTIFICATION', detail: 'Preview no sustituye la certificación.', group: 'CERTIFICATION_REQUIRED' },
    { key: 'authentication', label: 'Autenticación y permisos', status: 'PARTIAL', detail: 'Se utiliza la sesión normal de la aplicación.', group: 'PRODUCTION_REQUIRED' },
    { key: 'persistence', label: 'Persistencia fiscal segura', status: 'REQUIRES_CONFIRMATION', detail: 'Almacenamiento temporal del navegador; no apto para producción.', group: 'PRODUCTION_REQUIRED' },
    { key: 'storage', label: 'Almacenamiento privado XML/RIDE', status: 'BLOCKED', detail: 'Los archivos se generan temporalmente en el navegador.', group: 'PRODUCTION_REQUIRED' },
    { key: 'backups', label: 'Respaldos', status: 'BLOCKED', detail: 'La demostración no crea respaldos.', group: 'PRODUCTION_REQUIRED' },
    { key: 'audit', label: 'Auditoría', status: 'PARTIAL', detail: 'Auditoría ficticia conservada en este navegador.', group: 'PRODUCTION_REQUIRED' },
    { key: 'mail', label: 'Correo de producción', status: 'BLOCKED', detail: 'El envío es completamente simulado.', group: 'PRODUCTION_REQUIRED' },
    { key: 'recovery', label: 'Monitoreo y recuperación', status: 'BLOCKED', detail: 'No corresponde al alcance de Preview.', group: 'PRODUCTION_REQUIRED' },
    { key: 'postgres', label: 'PostgreSQL', status: 'REQUIRES_CONFIRMATION', detail: 'Recomendado para producción; no utilizado en Preview.', group: 'RECOMMENDED_INFRASTRUCTURE' },
    { key: 'secretManager', label: 'Gestor de secretos', status: 'REQUIRES_CONFIRMATION', detail: 'Preview no contiene secretos.', group: 'RECOMMENDED_INFRASTRUCTURE' },
    { key: 'retryQueue', label: 'Cola de reintentos', status: 'PARTIAL', detail: 'Los reintentos de demostración se guardan en el navegador.', group: 'RECOMMENDED_INFRASTRUCTURE' },
    { key: 'metrics', label: 'Métricas y alertas', status: 'REQUIRES_CONFIRMATION', detail: 'Pendientes para una infraestructura real.', group: 'RECOMMENDED_INFRASTRUCTURE' },
  ],
}

function customer(id, legalName, identification, email, address) {
  return { id: `CUSTOMER-${id}`, identificationType: '05', identification, legalName, address, email, phone: '0990000000', sourceParticipantId: `PART-${id}`, createdAt: ISSUED_AT, updatedAt: ISSUED_AT }
}

function item(id, documentId, code, description, total) {
  return { id, documentId, mainCode: code, description, quantity: '1', unitPrice: total, discount: '0.00', subtotal: total, taxCode: '2', percentageCode: '0', rate: '0.00', taxValue: '0.00', taxCategory: 'IVA_0', fiscalClassificationValidated: false, createdAt: ISSUED_AT }
}

const invoiceId = 'FD-00000000-0000-4000-8000-000000000001'
const creditId = 'FD-00000000-0000-4000-8000-000000000002'

const seedInvoice = {
  id: invoiceId, documentType: 'INVOICE', sourceType: 'ENROLLMENT', sourceId: 'ENR-FAKE-005', issuerId: previewConfig.issuer.id,
  customer: customer('005', 'Lucía Muestra Austral', '0999999996', 'lucia.muestra@example.test', 'Calle Laboratorio 5, Ciudad Demo'),
  environment: 'PREVIEW', issueDate: '2026-07-22', establishmentCode: '001', emissionPointCode: '001', sequential: '000000001',
  accessKey: '2207202601000000000000110010010000000011234567811', currency: 'DOLAR', status: 'AUTHORIZED',
  items: [item('ITEM-SEED-001', invoiceId, 'PRO-DEMO-05', 'Programa ficticio ya facturado', '120.00')], taxes: [],
  payments: [{ id: 'PAY-SEED-001', documentId: invoiceId, methodCode: '20', methodDescription: 'Transferencia / sistema financiero', amount: '120.00' }],
  additionalFields: [{ name: 'Entorno', value: 'DEMOSTRACIÓN DE PREVIEW SIN VALIDEZ TRIBUTARIA' }], participantName: 'Lucía Muestra Austral',
  subtotal: '120.00', totalDiscount: '0.00', totalWithoutTaxes: '120.00', totalTaxes: '0.00', tip: '0.00', grandTotal: '120.00', paymentStatus: 'VERIFIED',
  xmlUnsignedPath: `preview://${invoiceId}/unsigned.xml`, xmlSignedPath: `preview://${invoiceId}/signed.xml`, authorizedXmlPath: `preview://${invoiceId}/authorized.xml`, ridePath: `preview://${invoiceId}/ride.pdf`,
  authorizationNumber: 'DEMO-AUTH-INVOICE-000000001', authorizationDate: ISSUED_AT, sriStatus: 'AUTORIZADO-SIMULADO', sriMessage: 'Autorización ficticia sin validez tributaria',
  creditBalance: { originalTotal: '120.00', previousCredits: '20.00', modifiedValue: '0.00', remainingBalance: '100.00' },
  createdBy: 'preview-admin', createdAt: ISSUED_AT, updatedAt: ISSUED_AT,
}

const seedCredit = {
  id: creditId, documentType: 'CREDIT_NOTE', sourceType: 'INVOICE', sourceId: invoiceId, issuerId: previewConfig.issuer.id,
  customer: structuredClone(seedInvoice.customer), environment: 'PREVIEW', issueDate: '2026-07-23', establishmentCode: '001', emissionPointCode: '001', sequential: '000000001',
  accessKey: '2307202604000000000000110010010000000011234567814', currency: 'DOLAR', status: 'AUTHORIZED',
  items: [item('ITEM-SEED-002', creditId, 'NC-DEMO-01', 'Devolución ficticia parcial', '20.00')], taxes: [], payments: [], additionalFields: [],
  subtotal: '20.00', totalDiscount: '0.00', totalWithoutTaxes: '20.00', totalTaxes: '0.00', tip: '0.00', grandTotal: '20.00', paymentStatus: 'VERIFIED',
  creditNoteReference: { id: 'REF-SEED-001', creditNoteDocumentId: creditId, originalInvoiceId: invoiceId, originalDocumentNumber: '001-001-000000001', originalIssueDate: '2026-07-22', reason: 'Devolución ficticia parcial', modifiedValue: '20.00' },
  xmlUnsignedPath: `preview://${creditId}/unsigned.xml`, xmlSignedPath: `preview://${creditId}/signed.xml`, authorizedXmlPath: `preview://${creditId}/authorized.xml`, ridePath: `preview://${creditId}/ride.pdf`,
  authorizationNumber: 'DEMO-AUTH-CREDIT-000000001', authorizationDate: ISSUED_AT, sriStatus: 'AUTORIZADO-SIMULADO', sriMessage: 'Autorización ficticia sin validez tributaria',
  createdBy: 'preview-admin', createdAt: ISSUED_AT, updatedAt: ISSUED_AT,
}

function withXml(document) {
  const xml = buildPreviewXml(document, previewConfig)
  return { ...document, xmlUnsignedText: xml, xmlSignedText: `${xml}\n<!-- FIRMA DE DEMOSTRACIÓN NO CRIPTOGRÁFICA -->`, authorizedXmlText: `<?xml version="1.0" encoding="UTF-8"?><autorizacionPreview><estado>AUTORIZADO-SIMULADO</estado><advertencia>DEMOSTRACIÓN DE PREVIEW SIN VALIDEZ TRIBUTARIA</advertencia><comprobante><![CDATA[${xml}]]></comprobante></autorizacionPreview>` }
}

export function createPreviewSeed() {
  return {
    version: PREVIEW_STORE_VERSION, revision: 1,
    config: structuredClone(previewConfig), sources: structuredClone(previewSources), catalog: structuredClone(previewCatalog),
    paymentMethods: structuredClone(previewPaymentMethods), readiness: structuredClone(previewReadiness),
    documents: [withXml(seedInvoice), withXml(seedCredit)],
    events: {
      [invoiceId]: [{ id: 'EVENT-SEED-001', documentId: invoiceId, eventType: 'PREVIEW_FLOW_COMPLETED', previousStatus: 'DRAFT', newStatus: 'AUTHORIZED', actor: 'preview-admin', detailsJson: { simulated: true }, occurredAt: ISSUED_AT }],
      [creditId]: [{ id: 'EVENT-SEED-002', documentId: creditId, eventType: 'PREVIEW_CREDIT_AUTHORIZED', previousStatus: 'DRAFT', newStatus: 'AUTHORIZED', actor: 'preview-admin', detailsJson: { simulated: true }, occurredAt: ISSUED_AT }],
    },
    transmissions: {
      [invoiceId]: [{ id: 'TX-SEED-001', documentId: invoiceId, phase: 'AUTHORIZATION_PREVIEW', attempt: 1, requestHash: '1111111111111111111111111111111111111111111111111111111111111111', responseCode: 'DEMO', responseStatus: 'AUTHORIZED_SIMULATED', responseMessage: 'Autorización simulada sin conexión al SRI', startedAt: ISSUED_AT, completedAt: ISSUED_AT }],
      [creditId]: [{ id: 'TX-SEED-002', documentId: creditId, phase: 'AUTHORIZATION_PREVIEW', attempt: 1, requestHash: '2222222222222222222222222222222222222222222222222222222222222222', responseCode: 'DEMO', responseStatus: 'AUTHORIZED_SIMULATED', responseMessage: 'Autorización simulada sin conexión al SRI', startedAt: ISSUED_AT, completedAt: ISSUED_AT }],
    },
    counters: { document: 2, event: 2, transmission: 2, invoiceSequence: 1, creditSequence: 1 },
  }
}
