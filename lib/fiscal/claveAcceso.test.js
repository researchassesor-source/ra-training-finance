import { describe, it, expect } from 'vitest'
import {
  ClaveAccesoError,
  modulo11CheckDigit,
  generateSecureNumericCode,
  generateClaveAcceso,
  validateClaveAcceso,
  DOCUMENT_TYPE_FACTURA,
} from './claveAcceso.js'

const RUC = '0691787373001'

describe('modulo11CheckDigit', () => {
  // Casos calculados a mano con el algoritmo oficial (pesos cíclicos 2..7 de derecha a
  // izquierda), para blindar la implementación con valores esperados fijos e independientes
  // de generateClaveAcceso.
  it('caso simple: un solo dígito no-cero en la posición más a la derecha (peso 2)', () => {
    const digits48 = '0'.repeat(47) + '1' // 1 * peso2 = 2 -> 11-2 = 9
    expect(modulo11CheckDigit(digits48)).toBe(9)
  })

  it('caso borde: suma 0 -> resultado 11 -> dígito verificador 0', () => {
    expect(modulo11CheckDigit('0'.repeat(48))).toBe(0)
  })

  it('caso borde: resultado 10 -> dígito verificador 1', () => {
    const digits48 = '0'.repeat(47) + '6' // 6 * peso2 = 12 -> resto 1 -> 11-1 = 10 -> 1
    expect(modulo11CheckDigit(digits48)).toBe(1)
  })

  it('rechaza entradas que no sean exactamente 48 dígitos', () => {
    expect(() => modulo11CheckDigit('123')).toThrow(ClaveAccesoError)
    expect(() => modulo11CheckDigit('a'.repeat(48))).toThrow(ClaveAccesoError)
  })
})

describe('generateSecureNumericCode', () => {
  it('genera 8 dígitos numéricos', () => {
    const code = generateSecureNumericCode()
    expect(code).toMatch(/^\d{8}$/)
  })

  it('no repite el mismo valor en 200 generaciones consecutivas (RNG seguro, no fijo)', () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateSecureNumericCode()))
    expect(codes.size).toBeGreaterThan(190)
  })
})

describe('generateClaveAcceso', () => {
  const baseInput = {
    issueDate: new Date(2026, 7, 10), // 10/08/2026
    ruc: RUC,
    environment: 'test',
    establishment: '001',
    emissionPoint: '002',
    sequential: '000000001',
    numericCode: '12345678',
  }

  it('produce exactamente 49 dígitos numéricos', () => {
    const { claveAcceso } = generateClaveAcceso(baseInput)
    expect(claveAcceso).toMatch(/^\d{49}$/)
  })

  it('respeta la composición exacta por segmentos (fecha+tipo+ruc+ambiente+serie+secuencial+código+emisión+verificador)', () => {
    const { claveAcceso } = generateClaveAcceso(baseInput)
    expect(claveAcceso.slice(0, 8)).toBe('10082026') // ddMMyyyy
    expect(claveAcceso.slice(8, 10)).toBe(DOCUMENT_TYPE_FACTURA)
    expect(claveAcceso.slice(10, 23)).toBe(RUC)
    expect(claveAcceso.slice(23, 24)).toBe('1') // ambiente pruebas
    expect(claveAcceso.slice(24, 27)).toBe('001') // establecimiento
    expect(claveAcceso.slice(27, 30)).toBe('002') // punto de emisión
    expect(claveAcceso.slice(30, 39)).toBe('000000001') // secuencial
    expect(claveAcceso.slice(39, 47)).toBe('12345678') // código numérico
    expect(claveAcceso.slice(47, 48)).toBe('1') // tipo emisión normal
  })

  it('ambiente producción usa el código 2', () => {
    const { claveAcceso } = generateClaveAcceso({ ...baseInput, environment: 'production' })
    expect(claveAcceso.slice(23, 24)).toBe('2')
  })

  it('rechaza un ambiente desconocido', () => {
    expect(() => generateClaveAcceso({ ...baseInput, environment: 'staging' })).toThrow(ClaveAccesoError)
  })

  it('rechaza un RUC que no tenga 13 dígitos', () => {
    expect(() => generateClaveAcceso({ ...baseInput, ruc: '123' })).toThrow(ClaveAccesoError)
  })

  it('rechaza un secuencial que exceda 9 dígitos', () => {
    expect(() => generateClaveAcceso({ ...baseInput, sequential: '1234567890' })).toThrow(ClaveAccesoError)
  })

  it('rellena secuencial y punto de emisión con ceros a la izquierda', () => {
    const { claveAcceso } = generateClaveAcceso({ ...baseInput, sequential: '1', emissionPoint: '2' })
    expect(claveAcceso.slice(27, 30)).toBe('002')
    expect(claveAcceso.slice(30, 39)).toBe('000000001')
  })

  it('el dígito verificador final coincide con modulo11CheckDigit de los primeros 48 dígitos', () => {
    const { claveAcceso, checkDigit } = generateClaveAcceso(baseInput)
    expect(Number(claveAcceso[48])).toBe(checkDigit)
    expect(modulo11CheckDigit(claveAcceso.slice(0, 48))).toBe(checkDigit)
  })

  it('dos secuenciales distintos producen claves distintas (unicidad depende de la reserva atómica del secuencial, no de esta función)', () => {
    const a = generateClaveAcceso({ ...baseInput, sequential: '1' }).claveAcceso
    const b = generateClaveAcceso({ ...baseInput, sequential: '2' }).claveAcceso
    expect(a).not.toBe(b)
  })

  it('sin numericCode explícito, genera uno seguro automáticamente', () => {
    const { claveAcceso } = generateClaveAcceso({ ...baseInput, numericCode: undefined })
    expect(claveAcceso.slice(39, 47)).toMatch(/^\d{8}$/)
  })
})

describe('validateClaveAcceso', () => {
  it('acepta una clave generada por generateClaveAcceso (round-trip)', () => {
    const { claveAcceso } = generateClaveAcceso({
      issueDate: new Date(),
      ruc: RUC,
      environment: 'test',
      establishment: '001',
      emissionPoint: '002',
      sequential: '5',
    })
    expect(validateClaveAcceso(claveAcceso)).toEqual({ valid: true })
  })

  it('rechaza una clave con el dígito verificador alterado', () => {
    const { claveAcceso } = generateClaveAcceso({
      issueDate: new Date(),
      ruc: RUC,
      environment: 'test',
      establishment: '001',
      emissionPoint: '002',
      sequential: '5',
    })
    const lastDigit = Number(claveAcceso[48])
    const tampered = claveAcceso.slice(0, 48) + String((lastDigit + 1) % 10)
    const result = validateClaveAcceso(tampered)
    expect(result.valid).toBe(false)
  })

  it('rechaza longitudes distintas de 49', () => {
    expect(validateClaveAcceso('123').valid).toBe(false)
    expect(validateClaveAcceso('1'.repeat(50)).valid).toBe(false)
  })

  it('rechaza caracteres no numéricos', () => {
    expect(validateClaveAcceso('a'.repeat(49)).valid).toBe(false)
  })
})
