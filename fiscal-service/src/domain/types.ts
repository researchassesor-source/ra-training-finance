export type DocumentType = 'INVOICE' | 'CREDIT_NOTE'
export type EnvironmentCode = '1'
export type FiscalStatus =
  | 'DRAFT'
  | 'VALIDATION_FAILED'
  | 'READY_TO_SIGN'
  | 'SIGNED'
  | 'PENDING_SUBMISSION'
  | 'SUBMITTED'
  | 'RECEIVED'
  | 'PROCESSING'
  | 'AUTHORIZED'
  | 'RETURNED'
  | 'NOT_AUTHORIZED'
  | 'RETRY_PENDING'
  | 'ERROR'
  | 'CREDIT_NOTE_PENDING'
  | 'CANCELLATION_REQUESTED'
  | 'CANCELLED_INTERNAL'

export interface IssuerConfig {
  id: string
  rucPlaceholder: string
  businessName: string
  tradeName: string
  headOfficeAddress: string
  accountingObligation: 'SI' | 'NO'
  specialTaxpayerCode?: string
  regimeInformation?: string
  environment: EnvironmentCode
  currency: 'DOLAR'
  timezone: 'America/Guayaquil'
  createdAt: string
  updatedAt: string
}

export interface Establishment {
  id: string
  issuerId: string
  code: string
  address: string
  active: boolean
}

export interface EmissionPoint {
  id: string
  establishmentId: string
  code: string
  active: boolean
}

export interface Sequence {
  id: string
  documentType: DocumentType
  establishmentCode: string
  emissionPointCode: string
  currentValue: number
  version: number
  createdAt: string
  updatedAt: string
}

export interface FiscalCustomer {
  id: string
  identificationType: '04' | '05' | '06' | '07' | '08'
  identification: string
  legalName: string
  address: string
  email: string
  phone?: string
  sourceParticipantId?: string
  createdAt: string
  updatedAt: string
}

export interface FiscalDocumentItem {
  id: string
  documentId: string
  mainCode: string
  auxiliaryCode?: string
  description: string
  quantity: string
  unitPrice: string
  discount: string
  subtotal: string
  createdAt: string
}

export interface FiscalTaxLine {
  id: string
  documentId: string
  itemId?: string
  taxCode: string
  percentageCode: string
  rate: string
  taxableBase: string
  taxValue: string
}

export interface FiscalPaymentMethod {
  id: string
  documentId: string
  methodCode: string
  amount: string
  term?: number
  timeUnit?: string
}

export interface CreditNoteReference {
  id: string
  creditNoteDocumentId: string
  originalInvoiceId: string
  originalDocumentNumber: string
  originalIssueDate: string
  reason: string
  modifiedValue: string
}

export interface FiscalDocument {
  id: string
  documentType: DocumentType
  sourceType: 'MOCK_ENROLLMENT' | 'AUTHORIZED_INVOICE'
  sourceId: string
  issuerId: string
  customer: FiscalCustomer
  environment: EnvironmentCode
  issueDate: string
  establishmentCode: string
  emissionPointCode: string
  sequential?: string
  accessKey?: string
  currency: 'DOLAR'
  status: FiscalStatus
  subtotal: string
  totalDiscount: string
  totalWithoutTaxes: string
  totalTaxes: string
  grandTotal: string
  paymentStatus: 'VERIFIED' | 'NOT_APPLICABLE'
  items: FiscalDocumentItem[]
  taxes: FiscalTaxLine[]
  payments: FiscalPaymentMethod[]
  creditNoteReference?: CreditNoteReference
  xmlUnsignedPath?: string
  xmlSignedPath?: string
  authorizedXmlPath?: string
  ridePath?: string
  authorizationNumber?: string
  authorizationDate?: string
  sriStatus?: string
  sriMessage?: string
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface FiscalEvent {
  id: string
  documentId: string
  eventType: string
  previousStatus?: FiscalStatus
  newStatus?: FiscalStatus
  actor: string
  detailsJson: Record<string, unknown>
  occurredAt: string
}

export interface SriTransmission {
  id: string
  documentId: string
  phase: 'RECEPTION' | 'AUTHORIZATION'
  attempt: number
  requestHash: string
  responseCode: string
  responseStatus: string
  responseMessage: string
  rawRequestPath?: string
  rawResponsePath?: string
  startedAt: string
  completedAt: string
}

export interface MockEnrollment {
  id: string
  participantName: string
  participantIdentification: string
  participantEmail: string
  participantAddress: string
  participantPhone: string
  serviceName: string
  serviceCode: string
  amount: string
  paymentStatus: 'VERIFIED' | 'PENDING'
  fiscalStatus: 'ELIGIBLE' | 'INCOMPLETE' | 'ALREADY_INVOICED'
  issueNote: string
}

export interface DraftItemInput {
  mainCode: string
  auxiliaryCode?: string
  description: string
  quantity: string
  unitPrice: string
  discount: string
  taxCode: string
  percentageCode: string
  rate: string
}

export interface CreateInvoiceInput {
  sourceEnrollmentId: string
  customer: Omit<FiscalCustomer, 'id' | 'createdAt' | 'updatedAt'>
  issueDate: string
  items: DraftItemInput[]
  paymentMethodCode: string
}

export interface CreateCreditNoteInput {
  originalInvoiceId: string
  reason: string
  modifiedValue: string
  issueDate: string
}

export interface CertificateMetadata {
  id: string
  issuerId: string
  alias: string
  fingerprint: string
  subject: string
  issuer: string
  validFrom: string
  validUntil: string
  keyReference: string
  status: 'NOT_CONFIGURED' | 'ACTIVE' | 'EXPIRED'
}
