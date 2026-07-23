import { z } from 'zod'

const decimalString = z.string().regex(/^\d{1,12}(\.\d{1,6})?$/, 'Debe ser un decimal positivo válido')
const email = z.email()

export const draftItemSchema = z.object({
  mainCode: z.string().trim().min(1).max(25),
  auxiliaryCode: z.string().trim().min(1).max(25).optional(),
  description: z.string().trim().min(1).max(300),
  quantity: decimalString,
  unitPrice: decimalString,
  discount: decimalString.default('0.00'),
  taxCode: z.enum(['2', '3', '5']),
  percentageCode: z.string().regex(/^\d{1,4}$/),
  rate: decimalString,
})

export const customerSchema = z.object({
  identificationType: z.enum(['04', '05', '06', '07', '08']),
  identification: z.string().trim().min(1).max(20).regex(/^[^\n\r]+$/),
  legalName: z.string().trim().min(1).max(300).regex(/^[^\n\r]+$/),
  address: z.string().trim().min(1).max(300).regex(/^[^\n\r]+$/),
  email,
  phone: z.string().trim().min(5).max(30).optional(),
  sourceParticipantId: z.string().trim().max(80).optional(),
})

export const createInvoiceSchema = z.object({
  sourceEnrollmentId: z.string().regex(/^ENR-FAKE-\d{3}$/),
  customer: customerSchema,
  issueDate: z.iso.date(),
  items: z.array(draftItemSchema).min(1).max(100),
  paymentMethodCode: z.enum(['01', '15', '16', '17', '18', '19', '20', '21']),
})

export const patchInvoiceSchema = z.object({
  customer: customerSchema.optional(),
  issueDate: z.iso.date().optional(),
  items: z.array(draftItemSchema).min(1).max(100).optional(),
  paymentMethodCode: z.enum(['01', '15', '16', '17', '18', '19', '20', '21']).optional(),
}).refine((value) => Object.keys(value).length > 0, 'No existen cambios')

export const createCreditNoteSchema = z.object({
  reason: z.string().trim().min(3).max(300),
  modifiedValue: decimalString,
  issueDate: z.iso.date(),
})

export const documentIdSchema = z.string().regex(/^FD-[a-f0-9-]{36}$/)

export const taxCatalog = [
  { taxCode: '2', percentageCode: '0', rate: '0.00', label: 'IVA 0% (catálogo SRI, confirmar aplicabilidad)' },
  { taxCode: '2', percentageCode: '2', rate: '12.00', label: 'IVA 12% (catálogo SRI)' },
  { taxCode: '2', percentageCode: '3', rate: '14.00', label: 'IVA 14% (catálogo SRI)' },
  { taxCode: '2', percentageCode: '4', rate: '15.00', label: 'IVA 15% (fixture de demostración)' },
  { taxCode: '2', percentageCode: '5', rate: '5.00', label: 'IVA 5% (catálogo SRI)' },
  { taxCode: '2', percentageCode: '6', rate: '0.00', label: 'No objeto de impuesto' },
  { taxCode: '2', percentageCode: '7', rate: '0.00', label: 'Exento de IVA' },
  { taxCode: '2', percentageCode: '10', rate: '13.00', label: 'IVA 13% (catálogo SRI)' },
] as const

export const paymentCatalog = [
  { code: '01', label: 'Sin utilización del sistema financiero' },
  { code: '15', label: 'Compensación de deudas' },
  { code: '16', label: 'Tarjeta de débito' },
  { code: '17', label: 'Dinero electrónico' },
  { code: '18', label: 'Tarjeta prepago' },
  { code: '19', label: 'Tarjeta de crédito' },
  { code: '20', label: 'Otros con utilización del sistema financiero' },
  { code: '21', label: 'Endoso de títulos' },
] as const
