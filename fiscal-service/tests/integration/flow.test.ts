import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { loadConfig } from '../../src/config/env.js'
import { invoiceInput } from '../fixtures/factory.js'

const roots: string[] = []
const config = loadConfig({
  NODE_ENV: 'test', TZ: 'America/Guayaquil', FISCAL_LOCAL_DEV_MODE: 'true', FISCAL_STORAGE: 'inmemory',
  FISCAL_SRI_REAL_CONNECTION_ENABLED: 'false', FISCAL_MOCK_SRI_SCENARIO: 'AUTHORIZED',
})

const appWithStorage = async () => {
  const root = await mkdtemp(join(tmpdir(), 'fiscal-flow-'))
  roots.push(root)
  return buildApp({ config, storageRoot: root })
}

afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))))

describe('flujo local extremo a extremo', () => {
  it('crea, valida XSD, firma mock, autoriza, descarga y audita una factura', async () => {
    const app = await appWithStorage()
    const headers = { 'x-fiscal-local-role': 'admin', 'idempotency-key': 'invoice-flow-001' }
    const created = await app.inject({ method: 'POST', url: '/api/v1/invoices', headers, payload: invoiceInput() })
    expect(created.statusCode).toBe(201)
    const invoice = created.json()
    expect(invoice.grandTotal).toBe('115.00')

    const processed = await app.inject({ method: 'POST', url: `/api/v1/invoices/${invoice.id}/process`, headers: { 'x-fiscal-local-role': 'admin' } })
    expect(processed.statusCode).toBe(200)
    const authorized = processed.json()
    expect(authorized.status).toBe('AUTHORIZED')
    expect(authorized.sriStatus).toBe('AUTORIZADO-SIMULADO')
    expect(authorized.accessKey).toMatch(/^\d{49}$/)

    const xml = await app.inject({ method: 'GET', url: `/api/v1/invoices/${invoice.id}/xml`, headers: { 'x-fiscal-local-role': 'admin' } })
    expect(xml.statusCode).toBe(200)
    expect(xml.body).toContain('autorizacionSimulada')
    const ride = await app.inject({ method: 'GET', url: `/api/v1/invoices/${invoice.id}/ride`, headers: { 'x-fiscal-local-role': 'admin' } })
    expect(ride.statusCode).toBe(200)
    expect(ride.rawPayload.subarray(0, 4).toString()).toBe('%PDF')
    expect((ride.body.match(/\/Type \/Page\b/g) ?? [])).toHaveLength(1)
    const events = await app.inject({ method: 'GET', url: `/api/v1/invoices/${invoice.id}/events`, headers: { 'x-fiscal-local-role': 'admin' } })
    expect(events.json().map((event: { eventType: string }) => event.eventType)).toContain('MOCK_AUTHORIZED')
    const simulatedSend = await app.inject({ method: 'POST', url: `/api/v1/invoices/${invoice.id}/delivery/simulate`, headers: { 'x-fiscal-local-role': 'admin' }, payload: { outcome: 'SUCCESS' } })
    const simulatedResend = await app.inject({ method: 'POST', url: `/api/v1/invoices/${invoice.id}/delivery/resend`, headers: { 'x-fiscal-local-role': 'admin' }, payload: { outcome: 'SUCCESS' } })
    const simulatedError = await app.inject({ method: 'POST', url: `/api/v1/invoices/${invoice.id}/delivery/simulate`, headers: { 'x-fiscal-local-role': 'admin' }, payload: { outcome: 'ERROR' } })
    expect(simulatedSend.json()).toMatchObject({ simulated: true, realEmailSent: false, outcome: 'SUCCESS' })
    expect(simulatedResend.json()).toMatchObject({ simulated: true, realEmailSent: false, outcome: 'SUCCESS' })
    expect(simulatedError.json()).toMatchObject({ simulated: true, realEmailSent: false, outcome: 'ERROR' })
    const deliveryEvents = await app.inject({ method: 'GET', url: `/api/v1/invoices/${invoice.id}/events`, headers: { 'x-fiscal-local-role': 'admin' } })
    expect(deliveryEvents.json().map((event: { eventType: string }) => event.eventType)).toEqual(expect.arrayContaining(['DELIVERY_PREVIEW_CREATED', 'DELIVERY_SEND_SIMULATED', 'DELIVERY_RESEND_SIMULATED', 'DELIVERY_ERROR_SIMULATED']))
    await app.close()
  })

  it('respeta idempotencia y evita duplicado por inscripción', async () => {
    const app = await appWithStorage()
    const request = { method: 'POST' as const, url: '/api/v1/invoices', headers: { 'x-fiscal-local-role': 'admin', 'idempotency-key': 'same-key-001' }, payload: invoiceInput() }
    const first = await app.inject(request)
    const second = await app.inject(request)
    expect(second.json().id).toBe(first.json().id)
    const duplicate = await app.inject({ ...request, headers: { ...request.headers, 'idempotency-key': 'different-key-002' } })
    expect(duplicate.statusCode).toBe(409)
    await app.close()
  })

  it('acepta varias líneas, tarifas, descuentos, pagos y comprador distinto del participante', async () => {
    const app = await appWithStorage()
    const payload = invoiceInput('ENR-FAKE-006')
    payload.customer.legalName = 'Comprador Corporativo Ficticio'
    payload.participantName = 'Nicolás Ejemplo Central'
    payload.tip = '1.00'
    payload.items = [
      { mainCode: 'LINEA-01', description: 'Servicio ficticio tarifa cero', quantity: '2', unitPrice: '20.00', discount: '5.00', taxCode: '2', percentageCode: '0', rate: '0.00', taxCategory: 'IVA_0', fiscalClassificationValidated: false },
      { mainCode: 'LINEA-02', description: 'Servicio ficticio tarifa general', quantity: '1', unitPrice: '100.00', discount: '0.00', taxCode: '2', percentageCode: '4', rate: '15.00', taxCategory: 'GENERAL', fiscalClassificationValidated: false },
    ]
    payload.payments = [{ methodCode: '01', amount: '50.00' }, { methodCode: '20', amount: '101.00', term: 1, timeUnit: 'dias' }]
    delete payload.paymentMethodCode
    payload.additionalFields = [{ name: 'Participante', value: 'Nicolás Ejemplo Central' }]
    const response = await app.inject({ method: 'POST', url: '/api/v1/invoices', headers: { 'x-fiscal-local-role': 'admin', 'idempotency-key': 'multi-lines-payments' }, payload })
    expect(response.statusCode).toBe(201)
    const invoice = response.json()
    expect(invoice.grandTotal).toBe('151.00'); expect(invoice.items).toHaveLength(2); expect(invoice.payments).toHaveLength(2)
    expect(invoice.customer.legalName).not.toBe(invoice.participantName)
    await app.close()
  })

  it('crea y procesa una nota de crédito sin alterar la factura autorizada', async () => {
    const app = await appWithStorage()
    const admin = { 'x-fiscal-local-role': 'admin' }
    const created = await app.inject({ method: 'POST', url: '/api/v1/invoices', headers: { ...admin, 'idempotency-key': 'credit-base-001' }, payload: invoiceInput('ENR-FAKE-006') })
    const invoiceId = created.json().id
    await app.inject({ method: 'POST', url: `/api/v1/invoices/${invoiceId}/process`, headers: admin })
    const excessive = await app.inject({
      method: 'POST', url: `/api/v1/invoices/${invoiceId}/credit-notes`, headers: { ...admin, 'idempotency-key': 'credit-too-high' },
      payload: { reason: 'Ajuste ficticio', modifiedValue: '999.00', issueDate: '2026-07-23' },
    })
    expect(excessive.statusCode).toBe(422)
    const credit = await app.inject({
      method: 'POST', url: `/api/v1/invoices/${invoiceId}/credit-notes`, headers: { ...admin, 'idempotency-key': 'credit-valid-001' },
      payload: { reason: 'Devolución ficticia parcial', modifiedValue: '25.00', issueDate: '2026-07-23' },
    })
    expect(credit.statusCode).toBe(201)
    const creditId = credit.json().id
    const processed = await app.inject({ method: 'POST', url: `/api/v1/credit-notes/${creditId}/process`, headers: admin })
    expect(processed.json().status).toBe('AUTHORIZED')
    expect((await app.fiscalService.get(invoiceId)).status).toBe('AUTHORIZED')
    const invoiceXml = await app.inject({ method: 'GET', url: `/api/v1/invoices/${invoiceId}/xml`, headers: admin })
    const creditXml = await app.inject({ method: 'GET', url: `/api/v1/credit-notes/${creditId}/xml`, headers: admin })
    const invoiceRide = await app.inject({ method: 'GET', url: `/api/v1/invoices/${invoiceId}/ride`, headers: admin })
    const creditRide = await app.inject({ method: 'GET', url: `/api/v1/credit-notes/${creditId}/ride`, headers: admin })
    expect(invoiceXml.body).toContain('<factura')
    expect(creditXml.body).toContain('<notaCredito')
    expect(creditRide.rawPayload.subarray(0, 4).toString()).toBe('%PDF')
    expect(creditRide.rawPayload.equals(invoiceRide.rawPayload)).toBe(false)
    const secondCredit = await app.inject({
      method: 'POST', url: `/api/v1/invoices/${invoiceId}/credit-notes`, headers: { ...admin, 'idempotency-key': 'credit-valid-002' },
      payload: { reason: 'Segundo ajuste ficticio parcial', modifiedValue: '30.00', issueDate: '2026-07-24' },
    })
    expect(secondCredit.statusCode).toBe(201)
    expect(secondCredit.json().creditBalance.previousCredits).toBe('25.00')
    const overRemaining = await app.inject({
      method: 'POST', url: `/api/v1/invoices/${invoiceId}/credit-notes`, headers: { ...admin, 'idempotency-key': 'credit-over-remaining' },
      payload: { reason: 'Supera saldo ficticio', modifiedValue: '200.00', issueDate: '2026-07-24' },
    })
    expect(overRemaining.statusCode).toBe(422)
    await app.close()
  })

  it('niega acceso al vendedor y valida payload e Idempotency-Key', async () => {
    const app = await appWithStorage()
    const seller = await app.inject({ method: 'GET', url: '/api/v1/invoices', headers: { 'x-fiscal-local-role': 'seller' } })
    expect(seller.statusCode).toBe(403)
    const missingKey = await app.inject({ method: 'POST', url: '/api/v1/invoices', headers: { 'x-fiscal-local-role': 'admin' }, payload: invoiceInput() })
    expect(missingKey.statusCode).toBe(422)
    const malformed = await app.inject({ method: 'POST', url: '/api/v1/invoices', headers: { 'x-fiscal-local-role': 'admin', 'idempotency-key': 'malformed-001' }, payload: { broken: true } })
    expect(malformed.statusCode).toBe(422)
    await app.close()
  })
})
