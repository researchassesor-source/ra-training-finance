/**
 * Endpoints SOAP oficiales del SRI. Verificados en vivo el 12/08/2026 contra los WSDL
 * reales (no solo copiados de la ficha técnica interna) — ver
 * docs/fiscal/sri-sources.md. Ambos WSDL (Recepción y Autorización, ambiente Pruebas)
 * coinciden exactamente con lo documentado en la ficha 2.34: namespace, operación,
 * tipo de parámetro y binding document/literal.
 *
 * Separación dura test/production: `resolveSriEndpoint` NUNCA devuelve una URL de
 * producción salvo que la variable de entorno SRI_ALLOW_PRODUCTION valga exactamente
 * "true". Esto es intencional durante Fase 5 — solo se trabaja contra Pruebas — y
 * sigue siendo una protección real después: nadie llama por accidente a Producción
 * desde una prueba o un entorno mal configurado.
 */

import { SriConfigError } from './errors.js'

export const SRI_ENDPOINTS = Object.freeze({
  test: Object.freeze({
    recepcion: 'https://celcer.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline',
    autorizacion: 'https://celcer.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline',
  }),
  production: Object.freeze({
    recepcion: 'https://cel.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline',
    autorizacion: 'https://cel.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline',
  }),
})

export const SRI_NAMESPACES = Object.freeze({
  recepcion: 'http://ec.gob.sri.ws.recepcion',
  autorizacion: 'http://ec.gob.sri.ws.autorizacion',
  soapEnvelope: 'http://schemas.xmlsoap.org/soap/envelope/',
})

/**
 * @param {'test'|'production'} environment
 * @param {'recepcion'|'autorizacion'} service
 * @param {{ allowProductionOverride?: boolean }} [options] - Solo para pruebas
 *   controladas de esta protección; en código real nunca se pasa `true`.
 */
export function resolveSriEndpoint(environment, service, options = {}) {
  if (environment !== 'test' && environment !== 'production') {
    throw new SriConfigError(`environment inválido: "${environment}" (use "test" o "production").`)
  }
  if (!SRI_ENDPOINTS.test[service]) {
    throw new SriConfigError(`service inválido: "${service}" (use "recepcion" o "autorizacion").`)
  }
  if (environment === 'production') {
    const allowed = options.allowProductionOverride || process.env.SRI_ALLOW_PRODUCTION === 'true'
    if (!allowed) {
      throw new SriConfigError(
        'Uso de SRI Producción bloqueado: falta SRI_ALLOW_PRODUCTION=true. ' +
        'Esto es intencional — Fase 5 trabaja únicamente contra el ambiente de Pruebas.'
      )
    }
  }
  return SRI_ENDPOINTS[environment][service]
}
