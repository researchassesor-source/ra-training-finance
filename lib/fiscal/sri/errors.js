/**
 * Errores del cliente SOAP del SRI. Separados por tipo para que quien orqueste (Fase 6)
 * pueda decidir la política de reintento correcta para cada caso — un timeout se
 * reconsulta, un DEVUELTA se corrige y reenvía, un SriConfigError nunca se reintenta.
 */

export class SriConfigError extends Error {}
export class SriTransportError extends Error {}
export class SriTimeoutError extends SriTransportError {}
export class SriMalformedResponseError extends Error {}
