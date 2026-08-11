/**
 * Transporte HTTP para las llamadas SOAP al SRI. `fetchImpl` es inyectable a propósito
 * — los tests nunca tocan la red real, usan un fetch simulado que devuelve fixtures
 * explícitamente marcados como tales (ver sri.fixtures.js). Nada de lo que hay aquí
 * decide si una respuesta "es válida fiscalmente"; eso lo hacen recepcion.js/
 * autorizacion.js a partir del cuerpo ya obtenido.
 */

import { SriTimeoutError, SriTransportError } from './errors.js'

export const DEFAULT_TIMEOUT_MS = 30_000

export async function postSoap({ url, envelopeXml, timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = fetch }) {
  let response
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: '""',
      },
      body: envelopeXml,
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      throw new SriTimeoutError(`Tiempo de espera agotado (${timeoutMs} ms) al conectar con ${url}.`)
    }
    throw new SriTransportError(`Error de red/transporte al conectar con ${url}: ${err.message}`)
  }

  let bodyText
  try {
    bodyText = await response.text()
  } catch (err) {
    throw new SriTransportError(`No se pudo leer el cuerpo de la respuesta del SRI: ${err.message}`)
  }

  // Un SOAP Fault a menudo viaja con HTTP 500 pero con un cuerpo SOAP válido — no se
  // descarta solo por el código HTTP, se deja que el parseo de arriba decida.
  if (!response.ok && !/<[^>]*Fault[^>]*>/i.test(bodyText)) {
    throw new SriTransportError(`El SRI respondió HTTP ${response.status} ${response.statusText} sin cuerpo SOAP reconocible.`)
  }

  return bodyText
}
