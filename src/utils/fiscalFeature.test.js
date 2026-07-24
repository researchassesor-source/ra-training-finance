import { describe, expect, it } from 'vitest'
import { canAccessFiscalModule, getFiscalFeatureState, getLocalFiscalDemoUser, isFiscalPreviewDemoEnabled, nextFiscalAction, normalSessionIsAdmin } from './fiscalFeature'

describe('bandera y permisos de facturación local', () => {
  it('queda oculta cuando la bandera es false', () => expect(canAccessFiscalModule({ enabled: false, isAdmin: true })).toBe(false))
  it('es visible para admin con bandera true', () => expect(canAccessFiscalModule({ enabled: true, isAdmin: true })).toBe(true))
  it('no es visible para vendedor', () => expect(canAccessFiscalModule({ enabled: true, isAdmin: false })).toBe(false))
  it('no es visible para aval', () => expect(canAccessFiscalModule({ enabled: true, isAdmin: false })).toBe(false))
  it('habilita acciones según estado', () => {
    expect(nextFiscalAction({ status: 'DRAFT' }).key).toBe('validate')
    expect(nextFiscalAction({ status: 'AUTHORIZED' })).toBeNull()
  })
  it('el usuario de demostración no puede activarse fuera de desarrollo', () => {
    expect(getLocalFiscalDemoUser({ isDev: false, enabled: true, demoAuth: true })).toBeNull()
    expect(getLocalFiscalDemoUser({ isDev: true, enabled: true, demoAuth: true, hostname: 'localhost' })?.rol).toBe('admin')
    expect(getLocalFiscalDemoUser({ isDev: true, enabled: true, demoAuth: true, hostname: 'example.com' })).toBeNull()
  })
  it('habilita Preview únicamente con las cuatro variables y fuera del dominio oficial', () => {
    const env = { VITE_ENABLE_SRI_BILLING: 'true', VITE_FISCAL_RUNTIME_CONTEXT: 'preview', VITE_FISCAL_PREVIEW_DEMO: 'true', VITE_FISCAL_USE_EXISTING_APP_DATA: 'false' }
    expect(getFiscalFeatureState({ env, hostname: 'rama-demo.vercel.app' }).previewEnvironmentAllowed).toBe(true)
    expect(getFiscalFeatureState({ env, hostname: 'ra-training.com' }).previewEnvironmentAllowed).toBe(false)
    expect(getFiscalFeatureState({ env: { ...env, VITE_PUBLIC_APP_URL: 'https://finanzas.empresa.example' }, hostname: 'finanzas.empresa.example' }).previewEnvironmentAllowed).toBe(false)
    expect(getFiscalFeatureState({ env: { ...env, VITE_FISCAL_RUNTIME_CONTEXT: 'production' }, hostname: 'rama-demo.vercel.app' }).previewEnvironmentAllowed).toBe(false)
    expect(getFiscalFeatureState({ env: { ...env, VITE_ENABLE_SRI_BILLING: 'false' }, hostname: 'rama-demo.vercel.app' }).moduleAvailable).toBe(false)
  })
  it('usa exclusivamente la sesión normal de administrador', () => {
    const storage = { getItem: () => JSON.stringify({ username: 'admin', rol: 'admin' }) }
    expect(normalSessionIsAdmin({ storage })).toBe(true)
    expect(normalSessionIsAdmin({ storage: { getItem: () => JSON.stringify({ rol: 'vendedor' }) } })).toBe(false)
    expect(isFiscalPreviewDemoEnabled({ isAdmin: true, env: { VITE_ENABLE_SRI_BILLING: 'true', VITE_FISCAL_RUNTIME_CONTEXT: 'preview', VITE_FISCAL_PREVIEW_DEMO: 'true', VITE_FISCAL_USE_EXISTING_APP_DATA: 'false' }, hostname: 'demo.vercel.app' })).toBe(true)
  })
})
