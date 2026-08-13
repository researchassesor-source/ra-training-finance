/**
 * Cliente del servicio de Autorización del SRI (autorizacionComprobante), consultado
 * por clave de acceso después de RECIBIDA. Puramente de lectura — consultar dos veces
 * la misma clave de acceso no muta nada en el SRI ni aquí, así que este cliente es
 * idempotente por construcción (ver sri.autorizacion.test.js).
 *
 * Si el comprobante sigue en procesamiento, esta función NO falla: devuelve
 * `outcome: 'EN_PROCESO'` para que la orquestación (Fase 6) reintente más tarde con
 * backoff. Ver estados.js para la advertencia documentada sobre el literal exacto de
 * "en procesamiento".
 */

import { resolveSriEndpoint } from './config.js'
import { buildAutorizacionComprobanteEnvelope, parseSoapEnvelope, textOf, directChildren } from './soapEnvelope.js'
import { postSoap, DEFAULT_TIMEOUT_MS } from './httpClient.js'
import { normalizeAuthorizationState } from './estados.js'
import { SriTimeoutError, SriTransportError, SriMalformedResponseError } from './errors.js'

function parseMensajes(el) {
  const mensajesWrapper = directChildren(el, 'mensajes')[0]
  if (!mensajesWrapper) return []
  return directChildren(mensajesWrapper, 'mensaje').map(mensajeEl => ({
    identificador: textOf(mensajeEl, 'identificador'),
    mensaje: textOf(mensajeEl, 'mensaje'),
    tipo: textOf(mensajeEl, 'tipo'),
  }))
}

/**
 * @param {string} claveAcceso - 49 dígitos.
 * @param {{ environment: 'test'|'production', timeoutMs?: number, fetchImpl?: Function }} options
 */
export async function consultarAutorizacion(claveAcceso, options = {}) {
  if (typeof claveAcceso !== 'string' || !/^\d{49}$/.test(claveAcceso)) {
    throw new Error('claveAcceso debe ser una cadena de 49 dígitos.')
  }
  const url = resolveSriEndpoint(options.environment, 'autorizacion', options)
  const envelope = buildAutorizacionComprobanteEnvelope(claveAcceso)

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

  const respuesta = directChildren(parsed.bodyElement, 'RespuestaAutorizacionComprobante')[0]
  if (!respuesta) {
    return { outcome: 'MALFORMED_RESPONSE', message: 'No se encontró RespuestaAutorizacionComprobante en la respuesta.' }
  }

  const autorizacionesWrapper = directChildren(respuesta, 'autorizaciones')[0]
  const autorizaciones = autorizacionesWrapper ? directChildren(autorizacionesWrapper, 'autorizacion') : []
  if (autorizaciones.length === 0) {
    // Sin ninguna decisión todavía: se interpreta como "sigue en procesamiento".
    return { outcome: 'EN_PROCESO', claveAccesoConsultada: textOf(respuesta, 'claveAccesoConsultada') || claveAcceso }
  }

  // Regla 5.11 de la ficha: si hubo varios intentos no autorizados, el WS solo
  // devuelve el último estado — nos quedamos con la última entrada, no la primera.
  const ultima = autorizaciones[autorizaciones.length - 1]

  let estado
  try {
    estado = normalizeAuthorizationState(textOf(ultima, 'estado'))
  } catch (err) {
    return { outcome: 'MALFORMED_RESPONSE', message: err.message }
  }

  const base = {
    claveAccesoConsultada: textOf(respuesta, 'claveAccesoConsultada') || claveAcceso,
    ambiente: textOf(ultima, 'ambiente'),
    fechaAutorizacion: textOf(ultima, 'fechaAutorizacion'),
    mensajes: parseMensajes(ultima),
  }

  if (estado === 'AUTORIZADO') {
    const comprobanteEl = directChildren(ultima, 'comprobante')[0]
    return {
      outcome: 'AUTORIZADO',
      ...base,
      numeroAutorizacion: textOf(ultima, 'numeroAutorizacion'),
      xmlAutorizado: comprobanteEl ? comprobanteEl.textContent.trim() : '',
    }
  }
  if (estado === 'NO_AUTORIZADO') {
    return { outcome: 'NO_AUTORIZADO', ...base }
  }
  return { outcome: 'EN_PROCESO', ...base }
}
