import { describe, expect, it } from 'vitest'
import {
  IDENTIFICATION_TYPE,
  identificationError,
  isValidEcuadorianCedula,
  normalizeIdentification,
  normalizeIdentificationType,
} from './identification'

describe('identificación documental', () => {
  it('preserva como texto una cédula válida iniciada en cero', () => {
    const value = '0601234560'
    expect(normalizeIdentification(` ${value} `)).toBe(value)
    expect(isValidEcuadorianCedula(value)).toBe(true)
    expect(identificationError(value, IDENTIFICATION_TYPE.ECUADORIAN_ID)).toBe('')
  })

  it('rechaza una cédula ecuatoriana con dígito verificador incorrecto', () => {
    expect(isValidEcuadorianCedula('0601234567')).toBe(false)
    expect(identificationError('0601234567', IDENTIFICATION_TYPE.ECUADORIAN_ID)).toMatch(/dígito verificador/)
  })

  it('acepta cédula consular permitida con código 30 y tercer dígito 4 o 5', () => {
    expect(isValidEcuadorianCedula('3050178882')).toBe(true)
  })

  it('rechaza longitud, provincia y tercer dígito inválidos para cédula', () => {
    expect(isValidEcuadorianCedula('601234568')).toBe(false)
    expect(isValidEcuadorianCedula('2501234568')).toBe(false)
    expect(isValidEcuadorianCedula('3061234567')).toBe(false)
  })

  it('no aplica el algoritmo de cédula a pasaportes u otros documentos', () => {
    const numericPassport = '1234567890'
    expect(identificationError(numericPassport, IDENTIFICATION_TYPE.PASSPORT)).toBe('')
    expect(identificationError('AB12345X', IDENTIFICATION_TYPE.OTHER)).toBe('')
  })

  it('distingue el formato de RUC de la validación de cédula', () => {
    expect(identificationError('0691787373001', IDENTIFICATION_TYPE.ECUADORIAN_RUC)).toBe('')
    expect(identificationError('691787373001', IDENTIFICATION_TYPE.ECUADORIAN_RUC)).toMatch(/13 dígitos/)
  })

  it('normaliza el código SRI 07 y valida consumidor final solo en contexto de facturación', () => {
    expect(normalizeIdentificationType('07')).toBe(IDENTIFICATION_TYPE.CONSUMER_FINAL)
    expect(normalizeIdentificationType('Consumidor final')).toBe(IDENTIFICATION_TYPE.CONSUMER_FINAL)
    expect(identificationError('9999999999999', IDENTIFICATION_TYPE.CONSUMER_FINAL)).toMatch(/solo es válido como tipo de identificación fiscal/)
    expect(identificationError('9999999999999', IDENTIFICATION_TYPE.CONSUMER_FINAL, { allowConsumerFinal: true })).toBe('')
    expect(identificationError('9999999999998', IDENTIFICATION_TYPE.CONSUMER_FINAL, { allowConsumerFinal: true })).toMatch(/exactamente 9999999999999/)
  })

  it('rechaza tipos sin especificar al crear un documento nuevo', () => {
    expect(identificationError('0601234560', IDENTIFICATION_TYPE.UNSPECIFIED)).toMatch(/Seleccione/)
    expect(identificationError('CRM-12345', IDENTIFICATION_TYPE.UNSPECIFIED, { allowUnspecified: true })).toBe('')
  })

  it('rechaza identificaciones recibidas como número para evitar pérdida de ceros', () => {
    expect(identificationError(601234568, IDENTIFICATION_TYPE.ECUADORIAN_ID)).toMatch(/como texto/)
  })
})
