export const IDENTIFICATION_TYPE = Object.freeze({
  ECUADORIAN_ID: 'CEDULA_EC',
  ECUADORIAN_RUC: 'RUC_EC',
  PASSPORT: 'PASAPORTE',
  OTHER: 'OTRO',
  CONSUMER_FINAL: 'CONSUMIDOR_FINAL',
  UNSPECIFIED: 'NO_ESPECIFICADO',
})

const IDENTIFICATION_TYPE_ALIASES = Object.freeze({
  '04': IDENTIFICATION_TYPE.ECUADORIAN_RUC,
  '05': IDENTIFICATION_TYPE.ECUADORIAN_ID,
  '06': IDENTIFICATION_TYPE.PASSPORT,
  '07': IDENTIFICATION_TYPE.CONSUMER_FINAL,
  '08': IDENTIFICATION_TYPE.OTHER,
  CEDULA: IDENTIFICATION_TYPE.ECUADORIAN_ID,
  CEDULA_EC: IDENTIFICATION_TYPE.ECUADORIAN_ID,
  ECUADORIAN_ID: IDENTIFICATION_TYPE.ECUADORIAN_ID,
  RUC: IDENTIFICATION_TYPE.ECUADORIAN_RUC,
  RUC_EC: IDENTIFICATION_TYPE.ECUADORIAN_RUC,
  ECUADORIAN_RUC: IDENTIFICATION_TYPE.ECUADORIAN_RUC,
  PASAPORTE: IDENTIFICATION_TYPE.PASSPORT,
  PASSPORT: IDENTIFICATION_TYPE.PASSPORT,
  OTRO: IDENTIFICATION_TYPE.OTHER,
  OTHER: IDENTIFICATION_TYPE.OTHER,
  EXTERIOR: IDENTIFICATION_TYPE.OTHER,
  CONSUMIDOR_FINAL: IDENTIFICATION_TYPE.CONSUMER_FINAL,
  'CONSUMIDOR FINAL': IDENTIFICATION_TYPE.CONSUMER_FINAL,
  NO_ESPECIFICADO: IDENTIFICATION_TYPE.UNSPECIFIED,
  UNSPECIFIED: IDENTIFICATION_TYPE.UNSPECIFIED,
})

/** Canonicalize known historical/SRI labels without changing document values. */
export function normalizeIdentificationType(type) {
  if (type === null || type === undefined) return IDENTIFICATION_TYPE.UNSPECIFIED
  const source = String(type).trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
  return IDENTIFICATION_TYPE_ALIASES[source] || IDENTIFICATION_TYPE.UNSPECIFIED
}

const GENERIC_DOCUMENT_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} .\/-]{0,63}$/u

/**
 * Ecuadorian personal identity-card check digit (módulo 10).
 * This checks structure only; it does not establish the holder's identity.
 */
export function isValidEcuadorianCedula(value) {
  if (typeof value !== 'string' || !/^\d{10}$/.test(value)) return false

  const province = Number(value.slice(0, 2))
  const thirdDigit = Number(value[2])
  const ordinaryProvince = province >= 1 && province <= 24
  const consularDocument = province === 30 && (thirdDigit === 4 || thirdDigit === 5)
  if ((!ordinaryProvince && !consularDocument) || thirdDigit > 5) return false

  let sum = 0
  for (let index = 0; index < 9; index += 1) {
    const product = Number(value[index]) * (index % 2 === 0 ? 2 : 1)
    sum += product > 9 ? product - 9 : product
  }
  const checkDigit = (10 - (sum % 10)) % 10
  return checkDigit === Number(value[9])
}

export function normalizeIdentification(value) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

/** Returns an actionable validation message, or an empty string when valid. */
export function identificationError(value, type, options = {}) {
  if (value === null || value === undefined) {
    return options.required ? 'Ingrese la identificación.' : ''
  }
  if (typeof value !== 'string') {
    return 'La identificación debe enviarse como texto para preservar ceros iniciales.'
  }

  const identification = normalizeIdentification(value)
  if (!identification) return options.required ? 'Ingrese la identificación.' : ''

  if (type === IDENTIFICATION_TYPE.ECUADORIAN_ID) {
    if (!/^\d{10}$/.test(identification)) {
      return 'La cédula ecuatoriana debe contener exactamente 10 dígitos.'
    }
    if (!isValidEcuadorianCedula(identification)) {
      return 'La cédula no supera la validación de estructura y dígito verificador. Esto no confirma la identidad de la persona.'
    }
    return ''
  }

  if (type === IDENTIFICATION_TYPE.ECUADORIAN_RUC) {
    return /^\d{13}$/.test(identification)
      ? ''
      : 'El RUC ecuatoriano debe contener exactamente 13 dígitos. El formato no confirma su vigencia ni existencia.'
  }

  if (type === IDENTIFICATION_TYPE.CONSUMER_FINAL) {
    if (!options.allowConsumerFinal) {
      return 'Consumidor final solo es válido como tipo de identificación fiscal de facturación.'
    }
    return identification === '9999999999999'
      ? ''
      : 'Para consumidor final, la identificación SRI debe ser exactamente 9999999999999.'
  }

  if ([IDENTIFICATION_TYPE.PASSPORT, IDENTIFICATION_TYPE.OTHER].includes(type)
      || (type === IDENTIFICATION_TYPE.UNSPECIFIED && options.allowUnspecified)) {
    return GENERIC_DOCUMENT_PATTERN.test(identification)
      ? ''
      : 'Use un documento de hasta 64 caracteres con letras, números, espacios, punto, guion o barra.'
  }

  if (type === IDENTIFICATION_TYPE.UNSPECIFIED) {
    return 'Seleccione si es cédula ecuatoriana, pasaporte u otro documento.'
  }
  return 'Seleccione un tipo de documento válido.'
}
