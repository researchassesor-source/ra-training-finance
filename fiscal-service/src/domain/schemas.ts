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
  fiscalClassificationValidated: z.boolean().default(false),
  taxCategory: z.enum(['GENERAL', 'IVA_5', 'IVA_0', 'EXEMPT', 'NOT_SUBJECT', 'SPECIAL']).optional(),
})

export const customerSchema = z.object({
  identificationType: z.enum(['04', '05', '06', '07', '08']),
  identification: z.string().trim().min(1).max(20).regex(/^[^\n\r]+$/),
  legalName: z.string().trim().min(1).max(300).regex(/^[^\n\r]+$/),
  address: z.string().trim().min(1).max(300).regex(/^[^\n\r]+$/),
  email,
  phone: z.string().trim().min(5).max(30).optional(),
  sourceParticipantId: z.string().trim().max(80).optional(),
}).superRefine((value, context) => {
  if (value.identificationType === '04' && !/^\d{13}$/.test(value.identification)) {
    context.addIssue({ code: 'custom', path: ['identification'], message: 'El RUC debe tener 13 dígitos' })
  }
  if (value.identificationType === '05' && !/^\d{10}$/.test(value.identification)) {
    context.addIssue({ code: 'custom', path: ['identification'], message: 'La cédula debe tener 10 dígitos' })
  }
  if (value.identificationType === '07' && value.identification !== '9999999999999') {
    context.addIssue({ code: 'custom', path: ['identification'], message: 'Consumidor final exige la identificación oficial correspondiente' })
  }
})

export const paymentInputSchema = z.object({
  methodCode: z.enum(['01', '15', '16', '17', '18', '19', '20', '21']),
  amount: decimalString,
  term: z.number().int().min(0).max(9999).optional(),
  timeUnit: z.enum(['dias', 'meses', 'anios']).optional(),
}).refine((value) => value.term === undefined || value.timeUnit !== undefined, {
  message: 'La unidad de tiempo es obligatoria cuando existe plazo',
})

export const additionalFieldSchema = z.object({
  name: z.string().trim().min(1).max(60).regex(/^[\p{L}\p{N} ._/-]+$/u),
  value: z.string().trim().min(1).max(300).regex(/^[^\r\n<>]+$/),
}).refine((value) => !/(password|contrase(?:ñ|n)a|secret|token|private key)/i.test(`${value.name} ${value.value}`), {
  message: 'Los campos adicionales no pueden contener secretos',
})

export const createInvoiceSchema = z.object({
  sourceEnrollmentId: z.string().regex(/^ENR-FAKE-\d{3}$/),
  customer: customerSchema,
  issueDate: z.iso.date(),
  items: z.array(draftItemSchema).min(1).max(100),
  payments: z.array(paymentInputSchema).min(1).max(10).optional(),
  paymentMethodCode: z.enum(['01', '15', '16', '17', '18', '19', '20', '21']).optional(),
  additionalFields: z.array(additionalFieldSchema).max(15).optional(),
  participantName: z.string().trim().max(300).optional(),
  remissionGuide: z.string().trim().max(20).regex(/^\d{3}-\d{3}-\d{9}$/).optional(),
  negotiableInvoice: z.boolean().default(false),
  tip: decimalString.default('0.00'),
}).refine((value) => Boolean(value.payments?.length || value.paymentMethodCode), {
  message: 'Debe registrar al menos una forma de pago', path: ['payments'],
})

export const patchInvoiceSchema = z.object({
  customer: customerSchema.optional(),
  issueDate: z.iso.date().optional(),
  items: z.array(draftItemSchema).min(1).max(100).optional(),
  paymentMethodCode: z.enum(['01', '15', '16', '17', '18', '19', '20', '21']).optional(),
  payments: z.array(paymentInputSchema).min(1).max(10).optional(),
  additionalFields: z.array(additionalFieldSchema).max(15).optional(),
  participantName: z.string().trim().max(300).optional(),
  remissionGuide: z.string().trim().max(20).regex(/^\d{3}-\d{3}-\d{9}$/).optional(),
  negotiableInvoice: z.boolean().optional(),
  tip: decimalString.optional(),
}).refine((value) => Object.keys(value).length > 0, 'No existen cambios')

export const createCreditNoteSchema = z.object({
  reason: z.string().trim().min(3).max(300),
  modifiedValue: decimalString,
  issueDate: z.iso.date(),
})

export const documentIdSchema = z.string().regex(/^FD-[a-f0-9-]{36}$/)

export const taxCatalog = [
  { taxCode: '2', percentageCode: '0', rate: '0.00', label: 'IVA 0% (confirmar aplicabilidad)' },
  { taxCode: '2', percentageCode: '2', rate: '12.00', label: 'IVA 12%' },
  { taxCode: '2', percentageCode: '3', rate: '14.00', label: 'IVA 14%' },
  { taxCode: '2', percentageCode: '4', rate: '15.00', label: 'IVA 15%' },
  { taxCode: '2', percentageCode: '5', rate: '5.00', label: 'IVA 5%' },
  { taxCode: '2', percentageCode: '6', rate: '0.00', label: 'No objeto de impuesto' },
  { taxCode: '2', percentageCode: '7', rate: '0.00', label: 'Exento de IVA' },
  { taxCode: '2', percentageCode: '10', rate: '13.00', label: 'IVA 13%' },
] as const

export const paymentCatalog = [
  { code: '01', label: 'Sin utilización del sistema financiero', shortLabel: 'Efectivo / sin sistema financiero', validFrom: '2013-01-01' },
  { code: '15', label: 'Compensación de deudas', shortLabel: 'Compensación', validFrom: '2013-01-01' },
  { code: '16', label: 'Tarjeta de débito', shortLabel: 'Tarjeta de débito', validFrom: '2016-06-01' },
  { code: '17', label: 'Dinero electrónico', shortLabel: 'Dinero electrónico', validFrom: '2016-06-01' },
  { code: '18', label: 'Tarjeta prepago', shortLabel: 'Tarjeta prepago', validFrom: '2016-06-01' },
  { code: '19', label: 'Tarjeta de crédito', shortLabel: 'Tarjeta de crédito', validFrom: '2016-06-01' },
  { code: '20', label: 'Otros con utilización del sistema financiero', shortLabel: 'Transferencia / sistema financiero', validFrom: '2016-06-01' },
  { code: '21', label: 'Endoso de títulos', shortLabel: 'Endoso de títulos', validFrom: '2016-06-01' },
] as const
