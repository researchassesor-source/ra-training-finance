/**
 * Construcción y parseo de sobres SOAP 1.1 para los servicios del SRI. Estructura
 * verificada en vivo contra los WSDL reales de Recepción y Autorización (ver
 * config.js) — document/literal, namespaces exactos.
 */

import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import { SriMalformedResponseError } from './errors.js'
import { SRI_NAMESPACES } from './config.js'

const NS_SOAP = SRI_NAMESPACES.soapEnvelope

export function buildValidarComprobanteEnvelope(base64Xml) {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    `<soapenv:Envelope xmlns:soapenv="${NS_SOAP}" xmlns:rec="${SRI_NAMESPACES.recepcion}">` +
    '<soapenv:Header/>' +
    '<soapenv:Body>' +
    `<rec:validarComprobante><xml>${base64Xml}</xml></rec:validarComprobante>` +
    '</soapenv:Body>' +
    '</soapenv:Envelope>'
  )
}

export function buildAutorizacionComprobanteEnvelope(claveAccesoComprobante) {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    `<soapenv:Envelope xmlns:soapenv="${NS_SOAP}" xmlns:aut="${SRI_NAMESPACES.autorizacion}">` +
    '<soapenv:Header/>' +
    '<soapenv:Body>' +
    `<aut:autorizacionComprobante><claveAccesoComprobante>${claveAccesoComprobante}</claveAccesoComprobante></aut:autorizacionComprobante>` +
    '</soapenv:Body>' +
    '</soapenv:Envelope>'
  )
}

function firstElementByLocalName(parent, localName, ns) {
  const collection = ns ? parent.getElementsByTagNameNS(ns, localName) : parent.getElementsByTagName(localName)
  return collection && collection.length > 0 ? collection[0] : null
}

/**
 * Parsea un sobre SOAP de respuesta. Devuelve { fault } si es un SOAP Fault, o
 * { bodyElement } con el primer elemento hijo de soapenv:Body en caso normal.
 * Lanza SriMalformedResponseError si el texto no es XML válido o no tiene la forma
 * mínima de un sobre SOAP — nunca intenta "adivinar" contenido.
 */
export function parseSoapEnvelope(xmlText) {
  if (typeof xmlText !== 'string' || xmlText.trim().length === 0) {
    throw new SriMalformedResponseError('Respuesta vacía del SRI.')
  }
  let doc
  const parseErrors = []
  try {
    doc = new DOMParser({
      onError: (level, message) => {
        if (level === 'error' || level === 'fatalError') parseErrors.push(message)
      },
    }).parseFromString(xmlText, 'text/xml')
  } catch (err) {
    throw new SriMalformedResponseError(`No se pudo parsear la respuesta del SRI como XML: ${err.message}`)
  }
  if (!doc || !doc.documentElement || parseErrors.length > 0) {
    throw new SriMalformedResponseError('La respuesta del SRI no es XML bien formado.')
  }

  const body = firstElementByLocalName(doc, 'Body', NS_SOAP)
  if (!body) {
    throw new SriMalformedResponseError('La respuesta no contiene un sobre SOAP reconocible (falta soapenv:Body).')
  }

  const fault = firstElementByLocalName(body, 'Fault', NS_SOAP) || firstElementByLocalName(body, 'Fault', null)
  if (fault) {
    const faultCode = firstElementByLocalName(fault, 'faultcode')?.textContent?.trim() || ''
    const faultString = firstElementByLocalName(fault, 'faultstring')?.textContent?.trim() || ''
    return { fault: { faultCode, faultString } }
  }

  const bodyChildren = Array.from(body.childNodes || []).filter(node => node.nodeType === 1)
  if (bodyChildren.length === 0) {
    throw new SriMalformedResponseError('soapenv:Body está vacío en la respuesta del SRI.')
  }
  return { bodyElement: bodyChildren[0] }
}

export function serializeElement(node) {
  return new XMLSerializer().serializeToString(node)
}

export function textOf(parent, localName) {
  return firstElementByLocalName(parent, localName)?.textContent?.trim() || ''
}

export function elementsOf(parent, localName) {
  return Array.from(parent.getElementsByTagName(localName) || [])
}

/**
 * Hijos DIRECTOS de `parent` cuyo nombre local sea `localName` — a propósito, NO usa
 * getElementsByTagName (que es recursivo). El propio esquema del SRI reutiliza el
 * mismo nombre de etiqueta para el contenedor y para un campo interno (p. ej. el
 * elemento contenedor `<mensaje>` tiene un campo hijo también llamado `<mensaje>` con
 * el texto del mensaje) — una búsqueda recursiva confundiría ambos. Ver
 * recepcion.test.js / autorizacion.test.js, caso "múltiples mensajes".
 */
export function directChildren(parent, localName) {
  const result = []
  const children = (parent && parent.childNodes) || []
  for (let i = 0; i < children.length; i += 1) {
    const node = children[i]
    if (node.nodeType !== 1) continue
    const name = node.localName || node.tagName
    if (name === localName) result.push(node)
  }
  return result
}
