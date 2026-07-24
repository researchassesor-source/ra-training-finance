import { describe, expect, it } from 'vitest'
import { buildAccessKey, modulo11, validateAccessKey } from '../../src/domain/access-key.js'

describe('clave de acceso SRI', () => {
  it('reproduce el ejemplo oficial de módulo 11 de la ficha 2.33', () => {
    expect(modulo11('41261533')).toBe(6)
  })

  it('valida la clave publicada en el XML oficial de nota de crédito', () => {
    expect(validateAccessKey('2110201104179214673900110020010000000011234567812')).toBe(true)
  })

  it('construye 49 dígitos y detecta una alteración', () => {
    const key = buildAccessKey({
      issueDate: '2026-07-23', documentType: 'INVOICE', ruc: '9999999999001', environment: '1',
      establishmentCode: '001', emissionPointCode: '001', sequential: '000000001', numericCode: '12345678',
    })
    expect(key).toMatch(/^\d{49}$/)
    expect(validateAccessKey(key)).toBe(true)
    const changed = `${key.slice(0, 10)}${key[10] === '9' ? '8' : '9'}${key.slice(11)}`
    expect(validateAccessKey(changed)).toBe(false)
    expect(validateAccessKey(key.slice(1))).toBe(false)
  })
})
