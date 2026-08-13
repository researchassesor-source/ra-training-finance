import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { resolveSriEndpoint, SRI_ENDPOINTS } from './config.js'
import { SriConfigError } from './errors.js'

describe('resolveSriEndpoint — separación de ambientes', () => {
  const originalEnv = process.env.SRI_ALLOW_PRODUCTION

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.SRI_ALLOW_PRODUCTION
    else process.env.SRI_ALLOW_PRODUCTION = originalEnv
  })

  it('devuelve la URL de Pruebas (celcer) para environment=test', () => {
    expect(resolveSriEndpoint('test', 'recepcion')).toBe(SRI_ENDPOINTS.test.recepcion)
    expect(resolveSriEndpoint('test', 'autorizacion')).toBe(SRI_ENDPOINTS.test.autorizacion)
    expect(resolveSriEndpoint('test', 'recepcion')).toContain('celcer.sri.gob.ec')
  })

  it('test y production nunca apuntan a la misma URL', () => {
    expect(resolveSriEndpoint('test', 'recepcion')).not.toBe(SRI_ENDPOINTS.production.recepcion)
  })

  it('BLOQUEA producción por defecto, incluso si se pide explícitamente (protección contra uso accidental)', () => {
    delete process.env.SRI_ALLOW_PRODUCTION
    expect(() => resolveSriEndpoint('production', 'recepcion')).toThrow(SriConfigError)
  })

  it('sigue bloqueando producción aunque la variable tenga un valor "casi correcto"', () => {
    process.env.SRI_ALLOW_PRODUCTION = 'TRUE' // mayúsculas: no cuenta, debe ser exactamente "true"
    expect(() => resolveSriEndpoint('production', 'recepcion')).toThrow(SriConfigError)
  })

  it('solo permite producción con SRI_ALLOW_PRODUCTION="true" exacto', () => {
    process.env.SRI_ALLOW_PRODUCTION = 'true'
    expect(resolveSriEndpoint('production', 'recepcion')).toContain('cel.sri.gob.ec')
    expect(resolveSriEndpoint('production', 'recepcion')).not.toContain('celcer')
  })

  it('rechaza un environment desconocido', () => {
    expect(() => resolveSriEndpoint('staging', 'recepcion')).toThrow(SriConfigError)
  })

  it('rechaza un service desconocido', () => {
    expect(() => resolveSriEndpoint('test', 'consulta-inventada')).toThrow(SriConfigError)
  })
})
