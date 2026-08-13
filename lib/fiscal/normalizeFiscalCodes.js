/**
 * Normalización estricta de códigos fiscales de ancho fijo (Establishment,
 * EmissionPoint, Sequential) en la frontera Sheets -> lógica fiscal.
 *
 * Por qué existe: Google Sheets, en una celda con formato "Automático", convierte un
 * valor numérico-parecido escrito como texto ("001") al NÚMERO 1 — se pierden los
 * ceros a la izquierda, tanto al escribir como (sobre todo) al leer de vuelta, ya que
 * la celda queda literalmente almacenando el número. La reconstrucción aquí es
 * exacta y sin ambigüedad porque Sheets preserva el valor numérico real, solo pierde
 * el padding — nunca se oculta un dato corrupto: si el valor no es puramente
 * numérico o excede el ancho esperado, se lanza en vez de adivinar.
 */

export class FiscalCodeNormalizationError extends Error {}

function normalizeFixedWidthDigits(value, width, label) {
  if (value === null || value === undefined || value === '') {
    throw new FiscalCodeNormalizationError(`${label} está vacío o ausente.`)
  }
  const str = String(value).trim()
  if (!/^\d+$/.test(str)) {
    throw new FiscalCodeNormalizationError(`${label} debe ser exclusivamente numérico, recibido: "${value}".`)
  }
  if (str.length > width) {
    throw new FiscalCodeNormalizationError(`${label} excede ${width} dígitos: "${value}".`)
  }
  return str.padStart(width, '0')
}

export function normalizeEstablishment(value) {
  return normalizeFixedWidthDigits(value, 3, 'establishment')
}

export function normalizeEmissionPoint(value) {
  return normalizeFixedWidthDigits(value, 3, 'emissionPoint')
}

export function normalizeSequential(value) {
  return normalizeFixedWidthDigits(value, 9, 'sequential')
}
