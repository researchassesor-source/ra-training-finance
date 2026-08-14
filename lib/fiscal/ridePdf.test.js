import { describe, expect, it } from 'vitest'
import {
  buildRidePdfBytes,
  formatMoney,
  formatRideDate,
  issuerRucLabel,
  paymentCodeLabel,
  paymentLabel,
  qrPayloadForFactura,
  sha256Hex,
  RidePdfError,
} from './ridePdf.js'

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
  BuyerIdentification: '0999999999',
  BuyerEmail: 'demo@example.com',
  BuyerAddress: 'Riobamba',
  Subtotal0: 100,
  SubtotalWithoutTax: 100,
  TaxTotal: 0,
  GrandTotal: 100,
  PaymentMethodInternal: 'Transferencia',
  SriPaymentCode: '20',
}

const ITEMS = [{
  Codigo: 'TEST',
  Descripcion: 'Prueba tecnica SRI',
  Cantidad: '1',
  PrecioUnitarioCents: 100,
  DescuentoCents: 0,
  BaseCents: 100,
  TotalCents: 100,
  TaxRateBasisPoints: 0,
}]

describe('RIDE PDF fiscal', () => {
  it('genera un PDF RIDE para una factura autorizada y calcula su SHA-256', () => {
    const pdf = buildRidePdfBytes(FACTURA_AUTORIZADA, ITEMS)
    expect(Buffer.from(pdf.subarray(0, 4)).toString('utf8')).toBe('%PDF')
    expect(pdf.byteLength).toBeGreaterThan(1000)
    expect(sha256Hex(pdf)).toMatch(/^[a-f0-9]{64}$/)
  })

  it('bloquea RIDE si la factura no esta autorizada', () => {
    expect(() => buildRidePdfBytes({ ...FACTURA_AUTORIZADA, SriAuthorizationStatus: 'NO_AUTORIZADO', Status: 'NOT_AUTHORIZED' }, ITEMS))
      .toThrow(RidePdfError)
  })

  it('bloquea RIDE si falta numero de autorizacion', () => {
    expect(() => buildRidePdfBytes({ ...FACTURA_AUTORIZADA, AuthorizationNumber: '' }, ITEMS))
      .toThrow(RidePdfError)
  })

  it('conserva RUC con cero inicial y usa la AccessKey real como QR', () => {
    expect(FACTURA_AUTORIZADA.IssuerRuc).toBe('0691787373001')
    expect(issuerRucLabel({ IssuerRuc: '691787373001' })).toBe('0691787373001')
    expect(qrPayloadForFactura(FACTURA_AUTORIZADA)).toBe(FACTURA_AUTORIZADA.AccessKey)
  })

  it('formatea dinero desde centavos y nunca muestra 800 como dolares', () => {
    expect(formatMoney(800)).toBe('$8.00')
    expect(formatMoney(0)).toBe('$0.00')
    expect(formatMoney(10050)).toBe('$100.50')
  })

  it('humaniza fechas sin ISO tecnico', () => {
    expect(formatRideDate('2026-08-13')).toBe('13/08/2026')
    expect(formatRideDate('2026-08-13T15:12:00-05:00', true)).toContain('13/08/2026')
  })

  it('no inventa codigo SRI 20 si SriPaymentCode esta vacio', () => {
    const historica = { PaymentMethodInternal: '', SriPaymentCode: '' }
    expect(paymentLabel(historica)).toBe('No registrado')
    expect(paymentCodeLabel(historica)).toBe('-')
  })

  it('soporta multiples items en un PDF valido', () => {
    const items = Array.from({ length: 18 }, (_, index) => ({
      Codigo: `CURSO-${index + 1}`,
      Descripcion: `Item largo de capacitacion avalada por ITSAL numero ${index + 1} con descripcion suficientemente extensa para probar wrap`,
      Cantidad: '1',
      PrecioUnitarioCents: 800,
      DescuentoCents: 0,
      BaseCents: 800,
      TotalCents: 800,
      TaxRateBasisPoints: 0,
    }))
    const pdf = buildRidePdfBytes({ ...FACTURA_AUTORIZADA, Subtotal0: 14400, SubtotalWithoutTax: 14400, GrandTotal: 14400 }, items)
    expect(Buffer.from(pdf.subarray(0, 4)).toString('utf8')).toBe('%PDF')
    expect(pdf.byteLength).toBeGreaterThan(5000)
  })
})
