import type { FiscalDocument } from '../../domain/types.js'

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

export class FutureOfficialSriGateway implements SriGateway {
  private disabled(): never { throw new Error('FutureOfficialSriGateway está deshabilitado y no realiza conexiones') }
  async submitDocument(_document: FiscalDocument, _signedXml: string): Promise<ReceptionResult> { return this.disabled() }
  async checkAuthorization(_document: FiscalDocument): Promise<AuthorizationResult> { return this.disabled() }
  normalizeReceptionResponse(_response: ReceptionResult): ReceptionResult { return this.disabled() }
  normalizeAuthorizationResponse(_response: AuthorizationResult): AuthorizationResult { return this.disabled() }
}
