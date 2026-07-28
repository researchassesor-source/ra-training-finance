import { describe, expect, it } from 'vitest'
import { createAppsScriptHarness } from './appsScriptHarness'

describe('secreto de autenticación de Apps Script', () => {
  it('falla de forma segura cuando AUTH_SECRET no existe', () => {
    const harness = createAppsScriptHarness({ authSecret: '' })
    expect(() => harness.context.hashPassword('fixture-password')).toThrow('no está configurada de forma segura')
  })

  it('conserva compatibilidad con un AUTH_SECRET histórico no vacío aunque tenga menos de 32 caracteres', () => {
    const harness = createAppsScriptHarness({ authSecret: 'legacy-short-secret' })
    expect(harness.context.hashPassword('fixture-password')).toMatch(/^[a-f0-9]{64}$/)
  })

  it('no conserva secretos literales ni fallback en el código versionado', () => {
    const harness = createAppsScriptHarness()
    expect(harness.code).not.toMatch(/CONFIG\s*=\s*\{[^}]*SECRET\s*:/s)
    expect(harness.code).not.toMatch(/AUTH_SECRET\s*\|\|/)
    expect(harness.code).not.toMatch(/hashPassword\(['"][^'"]+['"]\)/)
    expect(harness.code).not.toMatch(/Credenciales admin:/)
    expect(harness.code).toContain("getProperty('AUTH_SECRET')")
  })
})
