import type { DocumentType, EnvironmentCode } from './types.js'

export interface AccessKeyParts {
  issueDate: string
  documentType: DocumentType
  ruc: string
  environment: EnvironmentCode
  establishmentCode: string
  emissionPointCode: string
  sequential: string
  numericCode: string
  emissionType?: '1'
}

const documentCodes: Record<DocumentType, string> = { INVOICE: '01', CREDIT_NOTE: '04' }

export function modulo11(value: string): number {
  if (!/^\d+$/.test(value)) throw new Error('El valor para módulo 11 debe ser numérico')
  let factor = 2
  let sum = 0
  for (let index = value.length - 1; index >= 0; index -= 1) {
    sum += Number(value[index]) * factor
    factor = factor === 7 ? 2 : factor + 1
  }
  const result = 11 - (sum % 11)
  if (result === 11) return 0
  if (result === 10) return 1
  return result
}

const dateForKey = (isoDate: string): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate)
  if (!match) throw new Error('issueDate debe usar YYYY-MM-DD')
  return `${match[3]}${match[2]}${match[1]}`
}

export function buildAccessKey(parts: AccessKeyParts): string {
  const validations: Array<[string, RegExp, string]> = [
    [parts.ruc, /^\d{13}$/, 'RUC'],
    [parts.establishmentCode, /^\d{3}$/, 'establecimiento'],
    [parts.emissionPointCode, /^\d{3}$/, 'punto de emisión'],
    [parts.sequential, /^\d{9}$/, 'secuencial'],
    [parts.numericCode, /^\d{8}$/, 'código numérico'],
  ]
  for (const [value, pattern, label] of validations) {
    if (!pattern.test(value)) throw new Error(`${label} tiene una longitud o formato inválido`)
  }
  const base = [
    dateForKey(parts.issueDate),
    documentCodes[parts.documentType],
    parts.ruc,
    parts.environment,
    parts.establishmentCode,
    parts.emissionPointCode,
    parts.sequential,
    parts.numericCode,
    parts.emissionType ?? '1',
  ].join('')
  if (base.length !== 48) throw new Error('La base de la clave de acceso debe tener 48 dígitos')
  return `${base}${modulo11(base)}`
}

export function validateAccessKey(key: string): boolean {
  if (!/^\d{49}$/.test(key)) return false
  return modulo11(key.slice(0, 48)) === Number(key[48])
}

export function documentCode(type: DocumentType): string {
  return documentCodes[type]
}
