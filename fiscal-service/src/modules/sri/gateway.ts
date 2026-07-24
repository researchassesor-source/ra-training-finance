import type { FiscalDocument } from '../../domain/types.js'
import { randomUUID } from 'node:crypto'
import { XMLParser } from 'fast-xml-parser'

export type MockSriScenario =
  | 'AUTHORIZED'
  | 'RETURNED'
  | 'PROCESSING'
  | 'NOT_AUTHORIZED'
  | 'TEMPORARY_ERROR'
  | 'TIMEOUT'
  | 'INVALID_RESPONSE'
  | 'DUPLICATE_RESPONSE'

export interface ReceptionResult {
  code: string
  status: 'RECIBIDA' | 'DEVUELTA' | 'EN PROCESO' | 'ERROR TEMPORAL' | 'TIMEOUT' | 'RESPUESTA INVALIDA'
  message: string
  raw: string
  retryable: boolean
}

export interface AuthorizationResult {
  code: string
  status: 'AUTORIZADO' | 'NO AUTORIZADO' | 'EN PROCESAMIENTO' | 'ERROR TEMPORAL' | 'RESPUESTA INVALIDA'
  message: string
  authorizationNumber?: string
  authorizationDate?: string
  raw: string
  retryable: boolean
}

export interface SriGateway {
  submitDocument(document: FiscalDocument, signedXml: string): Promise<ReceptionResult>
  checkAuthorization(document: FiscalDocument): Promise<AuthorizationResult>
  normalizeReceptionResponse(response: ReceptionResult): ReceptionResult
  normalizeAuthorizationResponse(response: AuthorizationResult): AuthorizationResult
}

const receptionXml = (status: string, key: string, message: string): string =>
  `<?xml version="1.0" encoding="UTF-8"?><mockSriReception><ambiente>LOCAL</ambiente><estado>${status}</estado><claveAcceso>${key}</claveAcceso><mensaje>${message}</mensaje><advertencia>SIN CONEXION AL SRI</advertencia></mockSriReception>`

const authorizationXml = (status: string, key: string, message: string, authorization?: string): string =>
  `<?xml version="1.0" encoding="UTF-8"?><mockSriAuthorization><ambiente>LOCAL</ambiente><estado>${status}</estado><claveAcceso>${key}</claveAcceso>${authorization ? `<numeroAutorizacion>${authorization}</numeroAutorizacion>` : ''}<mensaje>${message}</mensaje><advertencia>SIN CONEXION AL SRI</advertencia></mockSriAuthorization>`

export class MockSriGateway implements SriGateway {
  constructor(private scenario: MockSriScenario = 'AUTHORIZED') {}

  setScenario(scenario: MockSriScenario): void { this.scenario = scenario }

  async submitDocument(document: FiscalDocument, _signedXml: string): Promise<ReceptionResult> {
    const key = document.accessKey ?? 'SIN-CLAVE'
    if (this.scenario === 'RETURNED') return this.normalizeReceptionResponse({
      code: 'MOCK-DEV-001', status: 'DEVUELTA', message: 'Documento devuelto por escenario local controlado.',
      raw: receptionXml('DEVUELTA', key, 'ESCENARIO LOCAL DEVUELTO'), retryable: false,
    })
    if (this.scenario === 'TEMPORARY_ERROR') return this.normalizeReceptionResponse({
      code: 'MOCK-TEMP-001', status: 'ERROR TEMPORAL', message: 'Falla temporal simulada.',
      raw: receptionXml('ERROR TEMPORAL', key, 'REINTENTO PERMITIDO'), retryable: true,
    })
    if (this.scenario === 'TIMEOUT') return this.normalizeReceptionResponse({
      code: 'MOCK-TIMEOUT', status: 'TIMEOUT', message: 'Tiempo de espera simulado agotado.',
      raw: receptionXml('TIMEOUT', key, 'RESULTADO DESCONOCIDO'), retryable: true,
    })
    if (this.scenario === 'INVALID_RESPONSE') return this.normalizeReceptionResponse({
      code: 'MOCK-INVALID', status: 'RESPUESTA INVALIDA', message: 'Respuesta local deliberadamente inválida.',
      raw: '<respuesta-invalida>', retryable: false,
    })
    if (this.scenario === 'PROCESSING') return this.normalizeReceptionResponse({
      code: 'MOCK-PPR', status: 'EN PROCESO', message: 'Documento en procesamiento simulado.',
      raw: receptionXml('RECIBIDA', key, 'EN PROCESAMIENTO'), retryable: true,
    })
    return this.normalizeReceptionResponse({
      code: this.scenario === 'DUPLICATE_RESPONSE' ? 'MOCK-DUPLICATE' : 'MOCK-REC-001',
      status: 'RECIBIDA', message: this.scenario === 'DUPLICATE_RESPONSE' ? 'Respuesta duplicada normalizada sin crear documento.' : 'Recepción simulada exitosa.',
      raw: receptionXml('RECIBIDA', key, 'RECEPCION LOCAL'), retryable: false,
    })
  }

  async checkAuthorization(document: FiscalDocument): Promise<AuthorizationResult> {
    const key = document.accessKey ?? 'SIN-CLAVE'
    if (this.scenario === 'PROCESSING') return this.normalizeAuthorizationResponse({
      code: 'MOCK-PPR', status: 'EN PROCESAMIENTO', message: 'Autorización pendiente en escenario local.',
      raw: authorizationXml('EN PROCESAMIENTO', key, 'CONSULTAR NUEVAMENTE'), retryable: true,
    })
    if (this.scenario === 'NOT_AUTHORIZED' || this.scenario === 'RETURNED') return this.normalizeAuthorizationResponse({
      code: 'MOCK-NAT-001', status: 'NO AUTORIZADO', message: 'No autorizado por escenario local controlado.',
      raw: authorizationXml('NO AUTORIZADO', key, 'ESCENARIO LOCAL'), retryable: false,
    })
    if (this.scenario === 'TEMPORARY_ERROR' || this.scenario === 'TIMEOUT') return this.normalizeAuthorizationResponse({
      code: 'MOCK-TEMP-AUTH', status: 'ERROR TEMPORAL', message: 'Consulta temporalmente no disponible en el simulador.',
      raw: authorizationXml('ERROR TEMPORAL', key, 'REINTENTO PERMITIDO'), retryable: true,
    })
    if (this.scenario === 'INVALID_RESPONSE') return this.normalizeAuthorizationResponse({
      code: 'MOCK-INVALID-AUTH', status: 'RESPUESTA INVALIDA', message: 'Respuesta de autorización inválida simulada.',
      raw: '<autorizacion-invalida>', retryable: false,
    })
    const authorizationNumber = `SIM-${key}`
    const authorizationDate = '2026-07-23T10:30:00.000-05:00'
    return this.normalizeAuthorizationResponse({
      code: this.scenario === 'DUPLICATE_RESPONSE' ? 'MOCK-AUT-DUPLICATE' : 'MOCK-AUT-001',
      status: 'AUTORIZADO', message: 'Autorización exclusivamente simulada.', authorizationNumber, authorizationDate,
      raw: authorizationXml('AUTORIZADO', key, 'SIN VALIDEZ TRIBUTARIA', authorizationNumber), retryable: false,
    })
  }

  normalizeReceptionResponse(response: ReceptionResult): ReceptionResult { return structuredClone(response) }
  normalizeAuthorizationResponse(response: AuthorizationResult): AuthorizationResult { return structuredClone(response) }
}

export const officialSriEndpoints = {
  CERTIFICATION: {
    reception: 'https://celcer.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline',
    authorization: 'https://celcer.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline',
  },
  PRODUCTION: {
    reception: 'https://cel.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline',
    authorization: 'https://cel.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline',
  },
} as const

const xmlEscape = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export const buildReceptionSoapRequest = (signedXml: string): string =>
  `<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:rec="http://ec.gob.sri.ws.recepcion"><soapenv:Header/><soapenv:Body><rec:validarComprobante><xml>${Buffer.from(signedXml, 'utf8').toString('base64')}</xml></rec:validarComprobante></soapenv:Body></soapenv:Envelope>`

export const buildAuthorizationSoapRequest = (accessKey: string): string =>
  `<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:aut="http://ec.gob.sri.ws.autorizacion"><soapenv:Header/><soapenv:Body><aut:autorizacionComprobante><claveAccesoComprobante>${xmlEscape(accessKey)}</claveAccesoComprobante></aut:autorizacionComprobante></soapenv:Body></soapenv:Envelope>`

const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, trimValues: true, parseTagValue: false })
const deepValues = (value: unknown, key: string): unknown[] => {
  if (!value || typeof value !== 'object') return []
  const entries = Object.entries(value as Record<string, unknown>)
  return entries.flatMap(([name, child]) => [...(name === key ? [child] : []), ...deepValues(child, key)])
}
const scalar = (value: unknown): string | undefined => typeof value === 'string' || typeof value === 'number' ? String(value) : undefined
const messages = (body: unknown): string[] => deepValues(body, 'mensaje').flatMap((item) => {
  if (Array.isArray(item)) return item.map((entry) => scalar(entry) ?? scalar((entry as Record<string, unknown>)?.mensaje)).filter(Boolean) as string[]
  if (typeof item === 'object' && item) return [scalar((item as Record<string, unknown>).mensaje), scalar((item as Record<string, unknown>).informacionAdicional)].filter(Boolean) as string[]
  return scalar(item) ? [scalar(item) as string] : []
})

export function parseReceptionSoap(raw: string): ReceptionResult {
  try {
    const body = parser.parse(raw) as unknown
    const state = scalar(deepValues(body, 'estado')[0])?.toUpperCase()
    const detail = messages(body).join(' | ') || 'Sin mensajes adicionales'
    if (state === 'RECIBIDA') return { code: 'SRI-RECIBIDA', status: 'RECIBIDA', message: detail, raw, retryable: false }
    if (state === 'DEVUELTA') return { code: 'SRI-DEVUELTA', status: 'DEVUELTA', message: detail, raw, retryable: false }
    if (state?.includes('PROCES')) return { code: 'SRI-PROCESANDO', status: 'EN PROCESO', message: detail, raw, retryable: true }
    return { code: 'SRI-RESPUESTA-INVALIDA', status: 'RESPUESTA INVALIDA', message: `Estado de recepción no reconocido: ${state ?? 'vacío'}`, raw, retryable: false }
  } catch { return { code: 'SRI-XML-MALFORMADO', status: 'RESPUESTA INVALIDA', message: 'Respuesta SOAP de recepción mal formada', raw, retryable: false } }
}

export function parseAuthorizationSoap(raw: string): AuthorizationResult {
  try {
    const body = parser.parse(raw) as unknown
    const detail = messages(body).join(' | ') || 'Sin mensajes adicionales'
    const authorizationNodes = deepValues(body, 'autorizacion').flatMap((item) => Array.isArray(item) ? item : [item])
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    const entries = authorizationNodes.map((item) => ({
      state: scalar(item.estado)?.toUpperCase(),
      authorizationNumber: scalar(item.numeroAutorizacion),
      authorizationDate: scalar(item.fechaAutorizacion),
    }))
    const selected = entries.find((entry) => entry.state === 'AUTORIZADO')
      ?? entries.find((entry) => entry.state?.includes('PROCES'))
      ?? entries.at(-1)
    const states = deepValues(body, 'estado').map(scalar).filter(Boolean) as string[]
    const state = selected?.state ?? states.at(-1)?.toUpperCase()
    const authorizationNumber = selected?.authorizationNumber ?? scalar(deepValues(body, 'numeroAutorizacion')[0])
    const authorizationDate = selected?.authorizationDate ?? scalar(deepValues(body, 'fechaAutorizacion')[0])
    if (state === 'AUTORIZADO') return { code: 'SRI-AUTORIZADO', status: 'AUTORIZADO', message: detail, authorizationNumber, authorizationDate, raw, retryable: false }
    if (state === 'NO AUTORIZADO') return { code: 'SRI-NO-AUTORIZADO', status: 'NO AUTORIZADO', message: detail, raw, retryable: false }
    if (state?.includes('PROCES')) return { code: 'SRI-PROCESANDO', status: 'EN PROCESAMIENTO', message: detail, raw, retryable: true }
    return { code: 'SRI-RESPUESTA-INVALIDA', status: 'RESPUESTA INVALIDA', message: `Estado de autorización no reconocido: ${state ?? 'vacío'}`, raw, retryable: false }
  } catch { return { code: 'SRI-XML-MALFORMADO', status: 'RESPUESTA INVALIDA', message: 'Respuesta SOAP de autorización mal formada', raw, retryable: false } }
}

export interface OfficialSriGatewayOptions {
  environment: 'CERTIFICATION' | 'PRODUCTION'
  realConnectionEnabled: boolean
  confirmRealCall: boolean
  timeoutMs?: number
  maxRetries?: number
  fetchImpl?: typeof fetch
}

export class OfficialSriGateway implements SriGateway {
  private readonly fetchImpl: typeof fetch
  constructor(private readonly options: OfficialSriGatewayOptions) { this.fetchImpl = options.fetchImpl ?? fetch }
  private assertNetworkEnabled(): void {
    if (!this.options.realConnectionEnabled || !this.options.confirmRealCall) {
      throw new Error('CONEXIÓN SRI BLOQUEADA: se requieren FISCAL_SRI_REAL_CONNECTION_ENABLED=true y FISCAL_SRI_CONFIRM_REAL_CALL=true')
    }
  }
  private async soap(url: string, body: string): Promise<string> {
    this.assertNetworkEnabled()
    const correlationId = randomUUID()
    const attempts = Math.max(1, (this.options.maxRetries ?? 0) + 1)
    let lastError: Error = new Error('No fue posible ejecutar la solicitud SOAP')
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 10_000)
      try {
        const response = await this.fetchImpl(url, { method: 'POST', headers: { 'content-type': 'text/xml; charset=utf-8', 'x-correlation-id': correlationId }, body, signal: controller.signal })
        if (response.ok) return await response.text()
        lastError = new Error(`Servicio SRI respondió HTTP ${response.status}`)
        if (response.status < 500 && response.status !== 429) throw lastError
      } catch (error) {
        lastError = error instanceof Error ? error : lastError
        if (attempt === attempts || (lastError.message.includes('HTTP') && !/HTTP (429|5\d\d)/.test(lastError.message))) throw lastError
      } finally { clearTimeout(timer) }
    }
    throw lastError
  }
  async submitDocument(_document: FiscalDocument, signedXml: string): Promise<ReceptionResult> {
    const endpoints = officialSriEndpoints[this.options.environment]
    try { return parseReceptionSoap(await this.soap(endpoints.reception, buildReceptionSoapRequest(signedXml))) }
    catch (error) {
      if ((error as Error).message.startsWith('CONEXIÓN SRI BLOQUEADA')) throw error
      return { code: (error as Error).name === 'AbortError' ? 'SRI-TIMEOUT' : 'SRI-ERROR-TEMPORAL', status: (error as Error).name === 'AbortError' ? 'TIMEOUT' : 'ERROR TEMPORAL', message: 'No fue posible completar la recepción oficial', raw: '', retryable: true }
    }
  }
  async checkAuthorization(document: FiscalDocument): Promise<AuthorizationResult> {
    if (!document.accessKey) throw new Error('La consulta de autorización requiere clave de acceso')
    const endpoints = officialSriEndpoints[this.options.environment]
    try { return parseAuthorizationSoap(await this.soap(endpoints.authorization, buildAuthorizationSoapRequest(document.accessKey))) }
    catch (error) {
      if ((error as Error).message.startsWith('CONEXIÓN SRI BLOQUEADA')) throw error
      return { code: 'SRI-ERROR-TEMPORAL', status: 'ERROR TEMPORAL', message: 'No fue posible completar la autorización oficial', raw: '', retryable: true }
    }
  }
  normalizeReceptionResponse(response: ReceptionResult): ReceptionResult { return structuredClone(response) }
  normalizeAuthorizationResponse(response: AuthorizationResult): AuthorizationResult { return structuredClone(response) }
}

export class FutureOfficialSriGateway extends OfficialSriGateway {
  constructor() { super({ environment: 'CERTIFICATION', realConnectionEnabled: false, confirmRealCall: false }) }
}
