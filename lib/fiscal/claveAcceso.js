/**
 * Clave de acceso del SRI (Ecuador): 49 dígitos, estructura fija + dígito verificador
 * módulo 11. Ver docs/fiscal/architecture.md — la versión exacta de la ficha técnica
 * (2.33 vs 2.34) todavía debe verificarse contra la fuente oficial antes de la Fase 3
 * (generación de XML); esta estructura de 49 dígitos es estable entre ambas versiones.
 */

import { randomInt } from 'node:crypto'

export class ClaveAccesoError extends Error {}

export const DOCUMENT_TYPE_FACTURA = '01'

export const ENVIRONMENT_CODE = Object.freeze({
  test: '1',
  production: '2',
})

export const EMISSION_TYPE_NORMAL = '1'
export const SRI_ISSUE_TIME_ZONE = 'America/Guayaquil'

const ECUADOR_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: SRI_ISSUE_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

function padDigits(value, length, label) {
  const str = String(value)
  if (!/^\d+$/.test(str)) {
    throw new ClaveAccesoError(`${label} debe ser solo dígitos, recibido: "${value}"`)
  }
  if (str.length > length) {
    throw new ClaveAccesoError(`${label} excede ${length} dígitos: "${value}"`)
  }
  return str.padStart(length, '0')
}

function formatIssueDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new ClaveAccesoError('issueDate debe ser un Date válido.')
  }
  const parts = Object.fromEntries(ECUADOR_DATE_FORMATTER.formatToParts(date).map(part => [part.type, part.value]))
  const dd = parts.day
  const mm = parts.month
  const yyyy = parts.year
  return `${dd}${mm}${yyyy}`
}

/** Código numérico de 8 dígitos generado con un RNG criptográficamente seguro. */
export function generateSecureNumericCode() {
  return String(randomInt(0, 100_000_000)).padStart(8, '0')
}

/**
 * Dígito verificador módulo 11 sobre los primeros 48 dígitos, pesos cíclicos 2..7
 * de derecha a izquierda. Resultado 11 -> 0, resultado 10 -> 1 (regla oficial SRI).
 */
export function modulo11CheckDigit(digits48) {
  if (!/^\d{48}$/.test(digits48)) {
    throw new ClaveAccesoError(`modulo11CheckDigit espera exactamente 48 dígitos, recibido: ${digits48?.length}`)
  }
  let sum = 0
  let weight = 2
  for (let i = digits48.length - 1; i >= 0; i -= 1) {
    sum += Number(digits48[i]) * weight
    weight = weight === 7 ? 2 : weight + 1
  }
  const remainder = sum % 11
  const result = 11 - remainder
  if (result === 11) return 0
  if (result === 10) return 1
  return result
}

/**
 * Construye la clave de acceso completa (49 dígitos). El secuencial, establecimiento
 * y punto de emisión deben venir ya reservados de forma atómica (LockService en Apps
 * Script) — esta función es pura, no reserva nada ni decide unicidad.
 */
export function generateClaveAcceso({
  issueDate,
  documentType = DOCUMENT_TYPE_FACTURA,
  ruc,
  environment,
  establishment,
  emissionPoint,
  sequential,
  numericCode = generateSecureNumericCode(),
  emissionType = EMISSION_TYPE_NORMAL,
}) {
  const environmentCode = ENVIRONMENT_CODE[environment]
  if (!environmentCode) {
    throw new ClaveAccesoError(`environment inválido: "${environment}" (use "test" o "production").`)
  }
  if (!/^\d{13}$/.test(String(ruc))) {
    throw new ClaveAccesoError(`ruc debe tener 13 dígitos, recibido: "${ruc}"`)
  }

  const parts = {
    fecha: formatIssueDate(issueDate),
    tipoComprobante: padDigits(documentType, 2, 'documentType'),
    ruc: padDigits(ruc, 13, 'ruc'),
    ambiente: environmentCode,
    establecimiento: padDigits(establishment, 3, 'establishment'),
    puntoEmision: padDigits(emissionPoint, 3, 'emissionPoint'),
    secuencial: padDigits(sequential, 9, 'sequential'),
    codigoNumerico: padDigits(numericCode, 8, 'numericCode'),
    tipoEmision: padDigits(emissionType, 1, 'emissionType'),
  }

  const first48 =
    parts.fecha +
    parts.tipoComprobante +
    parts.ruc +
    parts.ambiente +
    parts.establecimiento +
    parts.puntoEmision +
    parts.secuencial +
    parts.codigoNumerico +
    parts.tipoEmision

  const checkDigit = modulo11CheckDigit(first48)
  return { claveAcceso: first48 + String(checkDigit), parts, checkDigit }
}

/** Revalida una clave de acceso ya generada (ej. antes de reenviar o para pruebas). */
export function validateClaveAcceso(claveAcceso) {
  if (typeof claveAcceso !== 'string' || !/^\d{49}$/.test(claveAcceso)) {
    return { valid: false, reason: 'La clave de acceso debe tener exactamente 49 dígitos numéricos.' }
  }
  const first48 = claveAcceso.slice(0, 48)
  const providedCheckDigit = Number(claveAcceso[48])
  const expectedCheckDigit = modulo11CheckDigit(first48)
  if (providedCheckDigit !== expectedCheckDigit) {
    return {
      valid: false,
      reason: `Dígito verificador incorrecto: esperado ${expectedCheckDigit}, recibido ${providedCheckDigit}.`,
    }
  }
  return { valid: true }
}
