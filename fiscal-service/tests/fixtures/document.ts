import type { FiscalDocument } from '../../src/domain/types.js'

export const fakeDocument = (): FiscalDocument => ({
  id: `FD-${crypto.randomUUID()}`, documentType: 'INVOICE', sourceType: 'MOCK_ENROLLMENT', sourceId: 'ENR-FAKE-001', issuerId: 'ISSUER-LOCAL-FAKE',
  customer: { id: 'CUS-FAKE', identificationType: '05', identification: '0999999999', legalName: 'Cliente Ficticio', address: 'Calle Demo', email: 'demo@example.test', createdAt: '2026-07-24T00:00:00Z', updatedAt: '2026-07-24T00:00:00Z' },
  environment: '1', issueDate: '2026-07-24', establishmentCode: '001', emissionPointCode: '001', sequential: '000000001', accessKey: '0'.repeat(49), currency: 'DOLAR', status: 'DRAFT',
  subtotal: '100.00', totalDiscount: '0.00', totalWithoutTaxes: '100.00', totalTaxes: '0.00', grandTotal: '100.00', paymentStatus: 'VERIFIED',
  items: [], taxes: [], payments: [], createdBy: 'local-admin', createdAt: '2026-07-24T00:00:00Z', updatedAt: '2026-07-24T00:00:00Z',
})
