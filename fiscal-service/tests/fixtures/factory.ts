import type { CreateInvoiceInput } from '../../src/domain/types.js'

export const invoiceInput = (sourceEnrollmentId = 'ENR-FAKE-001'): CreateInvoiceInput => ({
  sourceEnrollmentId,
  customer: {
    identificationType: '05',
    identification: '0999999999',
    legalName: 'Valeria Prueba Andina',
    address: 'Calle Ficticia 100, Ciudad Demo',
    email: 'valeria.prueba@example.test',
    phone: '0990000001',
    sourceParticipantId: 'PART-FAKE-001',
  },
  issueDate: '2026-07-23',
  items: [{
    mainCode: 'CUR-DEMO-01',
    description: 'Curso demostrativo de análisis de datos',
    quantity: '1',
    unitPrice: '100.00',
    discount: '0.00',
    taxCode: '2',
    percentageCode: '4',
    rate: '15.00',
  }],
  paymentMethodCode: '20',
})
