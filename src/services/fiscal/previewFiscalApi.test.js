import { describe, expect, it, vi } from 'vitest'
import { createFiscalApi } from './createFiscalApi'
import { createPreviewFiscalApi } from './previewFiscalApi'
import { createPreviewFiscalStore } from './previewFiscalStore'
import { PREVIEW_STORE_KEY } from './previewFiscalSeed'

function memoryStorage() {
  const data = new Map()
  return { data, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: (key) => data.delete(key) }
}

const invoiceInput = {
  sourceEnrollmentId: 'ENR-FAKE-001', issueDate: '2026-07-24', participantName: 'Valeria Prueba Andina',
  customer: { identificationType: '05', identification: '0999999999', legalName: 'Comprador & Empresa <Demo>', address: 'Calle Ficticia', email: 'comprador@example.test', phone: '0990000001' },
  tip: '1.00', items: [
    { mainCode: 'A-1', description: 'Curso <A>', quantity: '2', unitPrice: '40.00', discount: '5.00', taxCode: '2', percentageCode: '4', rate: '15.00', taxCategory: 'GENERAL' },
    { mainCode: 'B-2', description: 'Material & práctica', quantity: '1', unitPrice: '20.00', discount: '0.00', taxCode: '2', percentageCode: '0', rate: '0.00', taxCategory: 'IVA_0' },
  ], payments: [{ methodCode: '01', amount: '50.00' }, { methodCode: '20', amount: '57.25', term: 15, timeUnit: 'dias' }], additionalFields: [{ name: 'Curso', value: 'Demo segura' }],
}

describe('API fiscal íntegramente en navegador', () => {
  it('crea, calcula, procesa, audita y persiste una factura sin fetch', async () => {
    const storage = memoryStorage(); const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const api = createPreviewFiscalApi({ store: createPreviewFiscalStore({ storage }), authorize: () => true, transitionDelay: 0 })
    const draft = await api.createInvoice(invoiceInput)
    expect(draft.grandTotal).toBe('107.25'); expect(draft.items).toHaveLength(2); expect(draft.payments).toHaveLength(2); expect(draft.status).toBe('DRAFT')
    const { document } = await api.step(draft.id, 'process', 'invoices')
    expect(document.status).toBe('AUTHORIZED'); expect(document.xmlUnsignedPath).toContain('preview://'); expect(document.ridePath).toContain('preview://')
    expect(await api.xmlText(draft.id)).toContain('Comprador &amp; Empresa &lt;Demo&gt;')
    const eventStatuses = (await api.events(draft.id)).map((event) => event.newStatus)
    for (const status of ['READY_TO_SIGN', 'SIGNED', 'PENDING_SUBMISSION', 'SUBMITTED', 'RECEIVED', 'AUTHORIZED']) expect(eventStatuses).toContain(status)
    expect((await api.transmissions(draft.id)).length).toBe(2)
    const reloaded = createPreviewFiscalApi({ store: createPreviewFiscalStore({ storage }), authorize: () => true, transitionDelay: 0 })
    expect((await reloaded.getInvoice(draft.id)).status).toBe('AUTHORIZED'); expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
  it('crea y procesa una nota de crédito respetando el saldo', async () => {
    const storage = memoryStorage(); const api = createPreviewFiscalApi({ store: createPreviewFiscalStore({ storage }), authorize: () => true, transitionDelay: 0 })
    const invoice = (await api.invoices())[0]
    const note = await api.createCreditNote(invoice.id, { reason: 'Ajuste & devolución', modifiedValue: '25.00', issueDate: '2026-07-24' })
    expect(note.documentType).toBe('CREDIT_NOTE'); expect(note.creditNoteReference.originalDocumentNumber).toBe('001-001-000000001')
    const processed = (await api.step(note.id, 'process', 'credit-notes')).document
    expect(processed.status).toBe('AUTHORIZED'); expect(processed.sequential).toBe('000000002'); expect(await api.xmlText(note.id, 'credit-notes')).toContain('Ajuste &amp; devolución')
    await expect(api.createCreditNote(invoice.id, { reason: 'Exceso', modifiedValue: '1000.00' })).rejects.toThrow('no superar el saldo')
    await expect(api.createCreditNote(invoice.id, { reason: 'Fecha inválida', modifiedValue: '1.00', issueDate: '2026-07-21' })).rejects.toThrow('no puede ser anterior')
  })
  it('reserva secuenciales ficticios diferentes entre dos consumidores del mismo store', async () => {
    const storage = memoryStorage(); const storeA = createPreviewFiscalStore({ storage }); const storeB = createPreviewFiscalStore({ storage })
    const apiA = createPreviewFiscalApi({ store: storeA, authorize: () => true, transitionDelay: 0 }); const apiB = createPreviewFiscalApi({ store: storeB, authorize: () => true, transitionDelay: 0 })
    const first = await apiA.createInvoice(invoiceInput)
    const secondInput = { ...invoiceInput, sourceEnrollmentId: 'ENR-FAKE-006', customer: { ...invoiceInput.customer, identification: '0999999995', legalName: 'Nicolás Ejemplo Central' }, participantName: 'Nicolás Ejemplo Central', tip: '0.00', items: [{ ...invoiceInput.items[0], quantity: '1', unitPrice: '230.00', discount: '0.00', rate: '0.00', percentageCode: '0' }], payments: [{ methodCode: '20', amount: '230.00' }] }
    const second = await apiB.createInvoice(secondInput)
    const [validatedA, validatedB] = await Promise.all([apiA.step(first.id, 'validate'), apiB.step(second.id, 'validate')])
    expect(new Set([validatedA.document.sequential, validatedB.document.sequential]).size).toBe(2)
  })
  it.each([['RETURNED', 'RETURNED'], ['NOT_AUTHORIZED', 'NOT_AUTHORIZED'], ['TEMPORARY_ERROR', 'RETRY_PENDING'], ['PROCESSING', 'PROCESSING']])('simula el resultado %s', async (outcome, status) => {
    const api = createPreviewFiscalApi({ store: createPreviewFiscalStore({ storage: memoryStorage() }), authorize: () => true, transitionDelay: 0 })
    const draft = await api.createInvoice(invoiceInput)
    expect((await api.step(draft.id, 'process', 'invoices', outcome)).document.status).toBe(status)
  })
  it('genera XML y RIDE descargables como Blob sin rutas servidoras', async () => {
    const artifacts = []; const api = createPreviewFiscalApi({ store: createPreviewFiscalStore({ storage: memoryStorage() }), authorize: () => true, transitionDelay: 0, downloadArtifact: (artifact) => { artifacts.push(artifact); return artifact } })
    const invoice = (await api.invoices())[0]
    await api.download(invoice.id, 'xml'); await api.download(invoice.id, 'ride')
    expect(artifacts[0].blob.type).toContain('application/xml'); expect(artifacts[0].filename).toMatch(/\.xml$/)
    expect(artifacts[1].blob.type).toBe('application/pdf'); expect(artifacts[1].bytes.length).toBeGreaterThan(1000)
    expect(Buffer.from(artifacts[1].bytes).toString('latin1')).toContain('FACTURA')
    const note = (await api.creditNotes())[0]
    await api.download(note.id, 'xml', 'credit-notes'); await api.download(note.id, 'ride', 'credit-notes')
    expect(artifacts[2].filename).toMatch(/^nota-credito-preview.*\.xml$/); expect(artifacts[2].text).toContain('<notaCredito')
    expect(artifacts[3].filename).toMatch(/^nota-credito-preview.*\.pdf$/); expect(artifacts[3].bytes.length).toBeGreaterThan(1000)
    expect(Buffer.from(artifacts[3].bytes).toString('latin1')).toContain('NOTA DE CRÉDITO')
    expect(artifacts[0].filename).not.toBe(artifacts[2].filename)
  })
  it('selecciona Preview solo en el contexto permitido y bloquea el dominio oficial', () => {
    const env = { VITE_ENABLE_SRI_BILLING: 'true', VITE_FISCAL_RUNTIME_CONTEXT: 'preview', VITE_FISCAL_PREVIEW_DEMO: 'true', VITE_FISCAL_USE_EXISTING_APP_DATA: 'false' }
    const preview = createFiscalApi({ env, hostname: 'demo.vercel.app', previewOptions: { store: createPreviewFiscalStore({ storage: memoryStorage() }), authorize: () => true, transitionDelay: 0 } })
    expect(preview.runtime).toBe('browser-preview')
    expect(createFiscalApi({ env, hostname: 'ra-training.com' }).runtime).toBe('preview-blocked')
    expect(createFiscalApi({ env: { VITE_ENABLE_SRI_BILLING: 'true', VITE_FISCAL_PREVIEW_DEMO: 'false' }, hostname: 'localhost', httpOptions: { baseUrl: 'http://127.0.0.1:4010' } }).runtime).toBe('http-local')
  })
  it('responde con error seguro cuando Preview fue solicitado sin todas las banderas', async () => {
    const api = createFiscalApi({ env: { VITE_ENABLE_SRI_BILLING: 'false', VITE_FISCAL_RUNTIME_CONTEXT: 'preview', VITE_FISCAL_PREVIEW_DEMO: 'true' }, hostname: 'demo.vercel.app' })
    await expect(api.config()).rejects.toThrow('Preview autorizado')
  })
  it('el reinicio mantiene la sesión normal y restaura la semilla', async () => {
    const storage = memoryStorage(); storage.setItem('rat_user', '{"rol":"admin"}')
    const api = createPreviewFiscalApi({ store: createPreviewFiscalStore({ storage }), authorize: () => true, transitionDelay: 0 })
    await api.createInvoice(invoiceInput); expect((await api.invoices()).length).toBe(2)
    await api.resetDemo(); expect((await api.invoices()).length).toBe(1); expect(storage.getItem('rat_user')).toContain('admin'); expect(storage.getItem(PREVIEW_STORE_KEY)).toBeTruthy()
  })
})
