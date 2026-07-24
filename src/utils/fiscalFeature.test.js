import { describe, expect, it } from 'vitest'
import { canAccessFiscalModule, getLocalFiscalDemoUser, nextFiscalAction } from './fiscalFeature'

describe('bandera y permisos de facturación local', () => {
  it('queda oculta cuando la bandera es false', () => expect(canAccessFiscalModule({ enabled: false, isAdmin: true })).toBe(false))
  it('es visible para admin con bandera true', () => expect(canAccessFiscalModule({ enabled: true, isAdmin: true })).toBe(true))
  it('no es visible para vendedor', () => expect(canAccessFiscalModule({ enabled: true, isAdmin: false })).toBe(false))
  it('habilita acciones según estado', () => {
    expect(nextFiscalAction({ status: 'DRAFT' }).key).toBe('validate')
    expect(nextFiscalAction({ status: 'AUTHORIZED' })).toBeNull()
  })
  it('el usuario de demostración no puede activarse fuera de desarrollo', () => {
    expect(getLocalFiscalDemoUser({ isDev: false, enabled: true, demoAuth: true })).toBeNull()
    expect(getLocalFiscalDemoUser({ isDev: true, enabled: true, demoAuth: true, hostname: 'localhost' })?.rol).toBe('admin')
    expect(getLocalFiscalDemoUser({ isDev: true, enabled: true, demoAuth: true, hostname: 'example.com' })).toBeNull()
  })
})
