import type { FiscalStatus } from './types.js'

const transitions: Record<FiscalStatus, readonly FiscalStatus[]> = {
  DRAFT: ['READY_TO_SIGN', 'VALIDATION_FAILED'],
  VALIDATION_FAILED: ['DRAFT', 'READY_TO_SIGN'],
  READY_TO_SIGN: ['SIGNED', 'VALIDATION_FAILED'],
  SIGNED: ['PENDING_SUBMISSION'],
  PENDING_SUBMISSION: ['SUBMITTED', 'ERROR'],
  SUBMITTED: ['RECEIVED', 'RETURNED', 'PROCESSING', 'ERROR'],
  RECEIVED: ['PROCESSING', 'AUTHORIZED', 'NOT_AUTHORIZED', 'RETRY_PENDING'],
  PROCESSING: ['AUTHORIZED', 'NOT_AUTHORIZED', 'RETRY_PENDING', 'ERROR'],
  AUTHORIZED: ['CREDIT_NOTE_PENDING', 'CANCELLATION_REQUESTED'],
  RETURNED: ['DRAFT', 'RETRY_PENDING'],
  NOT_AUTHORIZED: ['DRAFT', 'RETRY_PENDING'],
  RETRY_PENDING: ['PENDING_SUBMISSION', 'SUBMITTED', 'RECEIVED', 'PROCESSING', 'ERROR'],
  ERROR: ['RETRY_PENDING'],
  CREDIT_NOTE_PENDING: ['AUTHORIZED'],
  CANCELLATION_REQUESTED: ['CANCELLED_INTERNAL', 'AUTHORIZED'],
  CANCELLED_INTERNAL: [],
}

export function canTransition(from: FiscalStatus, to: FiscalStatus): boolean {
  return transitions[from].includes(to)
}

export function assertTransition(from: FiscalStatus, to: FiscalStatus): void {
  if (!canTransition(from, to)) throw new Error(`Transición fiscal inválida: ${from} → ${to}`)
}

export const fiscalTransitions = transitions
