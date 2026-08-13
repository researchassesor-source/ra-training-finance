import { describe, expect, it } from 'vitest'
import { buildRidePdfBytes, sha256Hex, RidePdfError } from './ridePdf.js'

const FACTURA_AUTORIZADA = {
  ID: 'FACT_TEST',
  Environment: 'test',
  Status: 'DELIVERY_PENDING',
  SriAuthorizationStatus: 'AUTORIZADO',
  AuthorizationNumber: '1234567890',
  AuthorizationDate: '2026-08-13T14:30:00-05:00',
  IssuerRuc: '0691787373001',
  Establishment: '001',
  EmissionPoint: '002',
  Sequential: '000000001',
  DocumentNumber: '001-002-000000001',
  AccessKey: '0101202601069178737300110010020000000011234567810',
  IssueDate: '2026-08-13',
  BuyerName: 'CONSUMIDOR FINAL',
  BuyerIdentification: '9999999999999',
  BuyerEmail: 'demo@example.com',
  BuyerAddress: 'Riobamba',
  Subtotal0: '1.00',
  SubtotalWithoutTax: '1.00',
  TaxTotal: '0.00',
  GrandTotal: '1.00',
}

const ITEMS = [{
  Codigo: 'TEST',
  Descripcion: 'Prueba técnica SRI',
  Cantidad: '1.000000',
  PrecioUnitarioCents: 100,
  TotalCents: 100,
}]

describe('RIDE PDF fiscal', () => {
  it('genera un PDF RIDE para una factura autorizada y calcula su SHA-256', () => {
    const pdf = buildRidePdfBytes(FACTURA_AUTORIZADA, ITEMS)
    expect(Buffer.from(pdf.subarray(0, 4)).toString('utf8')).toBe('%PDF')
    expect(pdf.byteLength).toBeGreaterThan(1000)
    expect(sha256Hex(pdf)).toMatch(/^[a-f0-9]{64}$/)
  })

  it('bloquea RIDE si la factura no está autorizada', () => {
    expect(() => buildRidePdfBytes({ ...FACTURA_AUTORIZADA, SriAuthorizationStatus: 'NO_AUTORIZADO', Status: 'NOT_AUTHORIZED' }, ITEMS))
      .toThrow(RidePdfError)
  })

  it('bloquea RIDE si falta número de autorización', () => {
    expect(() => buildRidePdfBytes({ ...FACTURA_AUTORIZADA, AuthorizationNumber: '' }, ITEMS))
      .toThrow(RidePdfError)
  })
})
