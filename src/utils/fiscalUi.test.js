import { describe, expect, it } from 'vitest'
import { centsToUsd, fiscalHumanStatus, fiscalPaymentLabel } from './fiscalUi'

describe('fiscalUi', () => {
  it('traduce estados fiscales a lenguaje administrativo', () => {
    expect(fiscalHumanStatus('DRAFT').label).toBe('Borrador')
    expect(fiscalHumanStatus('SEQUENCE_RESERVED').label).toBe('Preparando')
    expect(fiscalHumanStatus('PROCESSING').label).toBe('Procesando en SRI')
    expect(fiscalHumanStatus('DELIVERY_PENDING').label).toBe('Autorizada · preparando documentos')
    expect(fiscalHumanStatus('DELIVERED').label).toBe('Entregada')
    expect(fiscalHumanStatus('NOT_AUTHORIZED').label).toBe('No autorizada')
  })

  it('no inventa forma de pago SRI en facturas históricas sin código registrado', () => {
    expect(fiscalPaymentLabel({ PaymentMethodInternal: '', SriPaymentCode: '' })).toBe('No registrado en comprobante histórico')
    expect(fiscalPaymentLabel({ paymentMethodInternal: 'Transferencia', sriPaymentCode: '20' })).toBe('Transferencia · SRI 20')
  })

  it('formatea centavos en dólares', () => {
    expect(centsToUsd(800)).toContain('8.00')
  })
})
