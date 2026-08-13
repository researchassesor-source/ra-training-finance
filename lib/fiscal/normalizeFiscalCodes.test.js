import { describe, expect, it } from 'vitest'
import { normalizeEstablishment, normalizeEmissionPoint, normalizeSequential, FiscalCodeNormalizationError } from './normalizeFiscalCodes.js'

describe('normalizeEstablishment / normalizeEmissionPoint — reconstrucción de ceros a la izquierda', () => {
  it('número 1 (lo que Sheets devuelve si la celda no es Texto) -> "001"', () => {
    expect(normalizeEstablishment(1)).toBe('001')
  })

  it('número 2 -> "002"', () => {
    expect(normalizeEmissionPoint(2)).toBe('002')
  })

  it('string ya canónica "001" -> "001" (idempotente)', () => {
    expect(normalizeEstablishment('001')).toBe('001')
  })

  it('string corta "1" -> "001"', () => {
    expect(normalizeEstablishment('1')).toBe('001')
  })

  it('rechaza un valor no numérico en vez de ocultarlo', () => {
    expect(() => normalizeEstablishment('00A')).toThrow(FiscalCodeNormalizationError)
  })

  it('rechaza un valor que excede el ancho esperado', () => {
    expect(() => normalizeEstablishment('1234')).toThrow(FiscalCodeNormalizationError)
  })

  it('rechaza vacío/ausente', () => {
    expect(() => normalizeEstablishment('')).toThrow(FiscalCodeNormalizationError)
    expect(() => normalizeEstablishment(undefined)).toThrow(FiscalCodeNormalizationError)
    expect(() => normalizeEstablishment(null)).toThrow(FiscalCodeNormalizationError)
  })
})

describe('normalizeSequential — 9 dígitos', () => {
  it('número 1 (lo que Sheets devuelve) -> "000000001"', () => {
    expect(normalizeSequential(1)).toBe('000000001')
  })

  it('string ya canónica -> idempotente', () => {
    expect(normalizeSequential('000000001')).toBe('000000001')
  })

  it('número grande dentro de 9 dígitos', () => {
    expect(normalizeSequential(123456789)).toBe('123456789')
  })

  it('rechaza más de 9 dígitos', () => {
    expect(() => normalizeSequential('1234567890')).toThrow(FiscalCodeNormalizationError)
  })

  it('rechaza un valor no numérico', () => {
    expect(() => normalizeSequential('abc')).toThrow(FiscalCodeNormalizationError)
  })
})

describe('caso exacto reportado: Sheets devuelve 1, 2, 1 -> el sistema produce 001, 002, 000000001', () => {
  it('reconstruye los tres códigos canónicos a partir de los números crudos de Sheets', () => {
    const filaCrudaDeSheets = { Establishment: 1, EmissionPoint: 2, Sequential: 1 }
    expect(normalizeEstablishment(filaCrudaDeSheets.Establishment)).toBe('001')
    expect(normalizeEmissionPoint(filaCrudaDeSheets.EmissionPoint)).toBe('002')
    expect(normalizeSequential(filaCrudaDeSheets.Sequential)).toBe('000000001')
  })
})
