/**
 * Cliente del servicio de Recepción del SRI (validarComprobante). Envía el XML ya
 * firmado y clasifica la respuesta. NUNCA marca un comprobante como autorizado aquí —
 * RECIBIDA solo significa que el SRI aceptó el documento para procesarlo; la
 * autorización real se consulta por separado (autorizacion.js).
 *
 * Diseño deliberado: esta función NO lanza para los casos "recuperables" (timeout,
 * error de red, SOAP Fault, respuesta malformada) — los devuelve como
 * `outcome` explícito para que quien orqueste (Fase 6) decida la política de
 * reintento sin encadenar try/catch. Solo lanza por errores de uso (argumentos
 * inválidos) o SriConfigError (p. ej. intentar Producción sin autorización).
 */

import { resolveSriEndpoint } from './config.js'
import { buildValidarComprobanteEnvelope, parseSoapEnvelope, textOf, directChildren } from './soapEnvelope.js'
import { postSoap, DEFAULT_TIMEOUT_MS } from './httpClient.js'
import { normalizeReceptionState } from './estados.js'
import { SriTimeoutError, SriTransportError, SriMalformedResponseError } from './errors.js'

function parseMensajes(comprobanteEl) {
  const mensajesWrapper = directChildren(comprobanteEl, 'mensajes')[0]
  if (!mensajesWrapper) return []
  return directChildren(mensajesWrapper, 'mensaje').map(mensajeEl => ({
    identificador: textOf(mensajeEl, 'identificador'),
    mensaje: textOf(mensajeEl, 'mensaje'),
    informacionAdicional: textOf(mensajeEl, 'informacionAdicional'),
    tipo: textOf(mensajeEl, 'tipo'),
  }))
}

/**
 * @param {string} signedXml - XML de factura ya firmado (XAdES-BES).
 * @param {{ environment: 'test'|'production', timeoutMs?: number, fetchImpl?: Function }} options
 */
export async function enviarRecepcion(signedXml, options = {}) {
  if (typeof signedXml !== 'string' || signedXml.length === 0) {
    throw new Error('signedXml es obligatorio.')
  }
  const url = resolveSriEndpoint(options.environment, 'recepcion', options)
  const base64Xml = Buffer.from(signedXml, 'utf8').toString('base64')
  const envelope = buildValidarComprobanteEnvelope(base64Xml)

  let bodyText
  try {
    bodyText = await postSoap({ url, envelopeXml: envelope, timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS, fetchImpl: options.fetchImpl })
  } catch (err) {
    if (err instanceof SriTimeoutError) return { outcome: 'TIMEOUT', message: err.message }
    if (err instanceof SriTransportError) return { outcome: 'NETWORK_ERROR', message: err.message }
    throw err
  }

  let parsed
  try {
    parsed = parseSoapEnvelope(bodyText)
  } catch (err) {
    if (err instanceof SriMalformedResponseError) return { outcome: 'MALFORMED_RESPONSE', message: err.message }
    throw err
  }

  if (parsed.fault) {
    return { outcome: 'SOAP_FAULT', fault: { code: parsed.fault.faultCode, message: parsed.fault.faultString } }
  }

  const respuesta = directChildren(parsed.bodyElement, 'RespuestaRecepcionComprobante')[0]
  if (!respuesta) {
    return { outcome: 'MALFORMED_RESPONSE', message: 'No se encontró RespuestaRecepcionComprobante en la respuesta.' }
  }

  let estado
  try {
    estado = normalizeReceptionState(textOf(respuesta, 'estado'))
  } catch (err) {
    return { outcome: 'MALFORMED_RESPONSE', message: err.message }
  }

  const comprobantesWrapper = directChildren(respuesta, 'comprobantes')[0]
  const comprobantes = comprobantesWrapper
    ? directChildren(comprobantesWrapper, 'comprobante').map(comprobanteEl => ({
        claveAcceso: textOf(comprobanteEl, 'claveAcceso'),
        mensajes: parseMensajes(comprobanteEl),
      }))
    : []

  return { outcome: estado, comprobantes }
}
