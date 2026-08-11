/**
 * Orquestación del flujo fiscal completo:
 *   SEQUENCE_RESERVED -> GENERATED -> SIGNED -> SUBMITTING -> RECEIVED -> PROCESSING
 *   -> AUTHORIZED -> DELIVERY_PENDING
 *
 * Reglas de idempotencia (ver apps-script/Fiscal.gs para el porqué de SUBMITTING):
 * - Generar/firmar es puro cómputo: si dos llamadas concurrentes lo intentan, ambas
 *   pueden calcular, pero solo una gana la persistencia (transicionEstadoFactura
 *   revalida el estado bajo LockService) — la otra queda descartada sin efecto.
 * - Enviar a Recepción SÍ tiene un efecto externo no repetible: por eso se reclama
 *   SUBMITTING como mutex ANTES de llamar al SRI, nunca después.
 * - Consultar autorización es puramente de lectura: repetirla no tiene efecto, así
 *   que es naturalmente idempotente; solo se cuida no retroceder ni duplicar el
 *   AuditEvent semánticamente (un solo transicionEstadoFactura por resultado).
 *
 * Nada de lo que hay aquí lee el .p12 del disco ni una variable de entorno de
 * secretos directamente — `signingKeys` se recibe por parámetro (inyección de
 * dependencias), para que los tests firmen con el fixture sintético de
 * testFixtures.p12.js y nunca con el certificado real.
 */

import { createHash } from 'node:crypto'
import { callGasAction, GasClientError } from './gasClient.js'
import { computeNextPollAt, hasExceededMaxAttempts } from './backoff.js'
import { generateClaveAcceso } from '../claveAcceso.js'
import { buildFacturaXml } from '../facturaXml.js'
import { signFacturaXml } from '../xadesSign.js'
import { enviarRecepcion } from '../sri/recepcion.js'
import { consultarAutorizacion } from '../sri/autorizacion.js'

export class OrchestratorError extends Error {}

const RESOLVED_AUTHORIZATION_STATES = new Set(['AUTHORIZED', 'NOT_AUTHORIZED', 'DELIVERY_PENDING', 'DELIVERED'])

// Tope de caracteres persistidos en Sheets para no crear celdas gigantes ni filtrar
// nada más allá de lo que el propio SRI ya entrega como texto de mensaje/error.
const MAX_SRI_MESSAGE_LENGTH = 1500
const MAX_XML_AUTHORIZED_LENGTH = 45_000 // límite práctico de celda de Sheets es ~50000

function sha256Hex(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

function summarizeMensajes(mensajes) {
  if (!Array.isArray(mensajes) || mensajes.length === 0) return ''
  const flat = mensajes.flatMap(entry => (Array.isArray(entry.mensajes) ? entry.mensajes : [entry]))
  const text = flat.map(m => `[${m.tipo || '?'}] ${m.identificador || ''}: ${m.mensaje || ''}`).join(' | ')
  return text.slice(0, MAX_SRI_MESSAGE_LENGTH)
}

function isRejectedTransitionError(err) {
  return err instanceof GasClientError && /Transición no permitida/i.test(err.message)
}

function detalleXmlDesdeItem(item) {
  const baseCents = Number(item.BaseCents)
  const totalCents = Number(item.TotalCents)
  const taxRateBasisPoints = Number(item.TaxRateBasisPoints)
  return {
    descripcion: item.Descripcion,
    cantidad: Number(item.Cantidad),
    precioUnitario: Number(item.PrecioUnitarioCents) / 100,
    descuentoCents: Number(item.DescuentoCents) || 0,
    precioTotalSinImpuestoCents: baseCents,
    impuestos: [{
      codigo: item.SriTaxCode ? String(item.SriTaxCode).split(':')[0] : '2',
      codigoPorcentaje: item.SriTaxCode ? String(item.SriTaxCode).split(':')[1] || '0' : '0',
      tarifa: (taxRateBasisPoints / 100).toFixed(2),
      baseImponibleCents: baseCents,
      valorCents: totalCents - baseCents,
    }],
  }
}

function buildXmlParaFactura(factura, items, claveAcceso, emisor) {
  const impuestosPorTarifa = new Map()
  items.forEach(item => {
    const key = `${item.SriTaxCode || '2:0'}|${item.TaxRateBasisPoints}`
    const baseCents = Number(item.BaseCents)
    const totalCents = Number(item.TotalCents)
    const prev = impuestosPorTarifa.get(key) || { baseImponibleCents: 0, valorCents: 0 }
    impuestosPorTarifa.set(key, {
      baseImponibleCents: prev.baseImponibleCents + baseCents,
      valorCents: prev.valorCents + (totalCents - baseCents),
    })
  })
  const impuestosTotales = Array.from(impuestosPorTarifa.entries()).map(([key, totales]) => {
    const [sriTaxCode, taxRateBasisPoints] = key.split('|')
    const [codigo, codigoPorcentaje] = sriTaxCode.split(':')
    return {
      codigo: codigo || '2',
      codigoPorcentaje: codigoPorcentaje || '0',
      tarifa: (Number(taxRateBasisPoints) / 100).toFixed(2),
      baseImponibleCents: totales.baseImponibleCents,
      valorCents: totales.valorCents,
    }
  })

  return buildFacturaXml({
    environment: factura.Environment,
    razonSocial: emisor.razonSocial,
    nombreComercial: emisor.nombreComercial,
    ruc: emisor.ruc,
    claveAcceso,
    establishment: factura.Establishment,
    emissionPoint: factura.EmissionPoint,
    sequential: factura.Sequential,
    dirMatriz: emisor.dirMatriz,
    fechaEmision: new Date(factura.IssueDate || factura.CreatedAt),
    obligadoContabilidad: emisor.obligadoContabilidad !== false,
    buyer: {
      tipoIdentificacion: factura.BuyerIdentificationType,
      identificacion: factura.BuyerIdentification,
      razonSocial: factura.BuyerName,
      direccion: factura.BuyerAddress,
    },
    totalSinImpuestosCents: Number(factura.SubtotalWithoutTax),
    totalDescuentoCents: Number(factura.DiscountCents) || 0,
    importeTotalCents: Number(factura.GrandTotal),
    impuestosTotales,
    pagos: factura.SriPaymentCode ? [{ formaPago: factura.SriPaymentCode, totalCents: Number(factura.GrandTotal) }] : [],
    detalles: items.map(detalleXmlDesdeItem),
  })
}

/**
 * SEQUENCE_RESERVED -> GENERATED -> SIGNED. Idempotente: si la factura ya pasó de
 * SIGNED, no regenera nada (evita "regenerar innecesariamente una factura ya
 * autorizada" y no vuelve a tocar la clave privada de más). Si ya está en
 * GENERATED (p. ej. el proceso murió después de generar pero antes de firmar),
 * reutiliza la MISMA clave de acceso e IssueDate ya persistidas en vez de generar
 * una nueva, para que la clave de acceso nunca cambie a mitad de camino.
 */
export async function generarYFirmarFactura(facturaId, options) {
  const { environment, emisor, signingKeys, gasOptions } = options
  const { factura, items } = await callGasAction('getFacturaFiscalCompleta', { facturaId }, gasOptions)

  if (!['SEQUENCE_RESERVED', 'GENERATED', 'SIGNED'].includes(factura.Status)) {
    return { skipped: true, reason: `La factura ya está en estado ${factura.Status}, no se regenera.`, factura }
  }
  if (!items || items.length === 0) {
    throw new OrchestratorError(`La factura ${facturaId} no tiene ítems persistidos.`)
  }

  let facturaActual = factura
  let claveAcceso = factura.AccessKey

  if (factura.Status === 'SEQUENCE_RESERVED') {
    const issueDate = new Date()
    const generado = generateClaveAcceso({
      issueDate,
      ruc: emisor.ruc,
      environment,
      establishment: factura.Establishment,
      emissionPoint: factura.EmissionPoint,
      sequential: factura.Sequential,
    })
    claveAcceso = generado.claveAcceso
    const xmlGenerado = buildXmlParaFactura({ ...factura, IssueDate: issueDate.toISOString() }, items, claveAcceso, emisor)
    facturaActual = await callGasAction('transicionEstadoFactura', {
      facturaId,
      nuevoEstado: 'GENERATED',
      camposAdicionales: {
        AccessKey: claveAcceso,
        NumericCode: generado.parts.codigoNumerico,
        IssueDate: issueDate.toISOString(),
        Sha256Generated: sha256Hex(xmlGenerado),
      },
    }, gasOptions)
  }

  const xmlParaFirmar = buildXmlParaFactura(facturaActual, items, claveAcceso, emisor)
  const signedXml = signFacturaXml(xmlParaFirmar, signingKeys)

  facturaActual = await callGasAction('transicionEstadoFactura', {
    facturaId,
    nuevoEstado: 'SIGNED',
    camposAdicionales: { Sha256Signed: sha256Hex(signedXml) },
  }, gasOptions)

  return { skipped: false, signedXml, claveAcceso, factura: facturaActual }
}

/**
 * SIGNED -> SUBMITTING (claim atómico) -> RECEIVED/RETURNED, o de vuelta a SIGNED
 * si el envío falla de forma transitoria. NUNCA llama al SRI sin haber ganado el
 * claim primero.
 */
export async function enviarFacturaARecepcion(facturaId, signedXml, options) {
  const { environment, gasOptions, sriOptions } = options

  let claim
  try {
    claim = await callGasAction('transicionEstadoFactura', { facturaId, nuevoEstado: 'SUBMITTING' }, gasOptions)
  } catch (err) {
    if (isRejectedTransitionError(err)) {
      return { outcome: 'ALREADY_IN_PROGRESS_OR_ADVANCED' }
    }
    throw err
  }

  const resultado = await enviarRecepcion(signedXml, { environment, ...sriOptions })

  if (resultado.outcome === 'RECIBIDA') {
    await callGasAction('transicionEstadoFactura', {
      facturaId, nuevoEstado: 'RECEIVED',
      camposAdicionales: { SriReceptionStatus: 'RECIBIDA', LastSriMessage: '' },
    }, gasOptions)
    await callGasAction('transicionEstadoFactura', {
      facturaId, nuevoEstado: 'PROCESSING',
      camposAdicionales: { NextPollAt: computeNextPollAt(0) },
    }, gasOptions)
    return { outcome: 'RECEIVED' }
  }

  if (resultado.outcome === 'DEVUELTA') {
    const mensaje = summarizeMensajes(resultado.comprobantes)
    await callGasAction('transicionEstadoFactura', {
      facturaId, nuevoEstado: 'RETURNED',
      camposAdicionales: { SriReceptionStatus: 'DEVUELTA', LastSriMessage: mensaje },
    }, gasOptions)
    return { outcome: 'RETURNED', mensajes: resultado.comprobantes }
  }

  // TIMEOUT / NETWORK_ERROR / SOAP_FAULT / MALFORMED_RESPONSE: libera el claim para
  // que un reintento posterior (continuarFlujoFactura) pueda volver a intentarlo.
  const retryCount = (Number(claim.RetryCount) || 0) + 1
  const mensajeError = resultado.message || (resultado.fault && resultado.fault.message) || resultado.outcome
  await callGasAction('transicionEstadoFactura', {
    facturaId, nuevoEstado: 'SIGNED',
    camposAdicionales: { RetryCount: retryCount, LastSriMessage: String(mensajeError).slice(0, MAX_SRI_MESSAGE_LENGTH) },
  }, gasOptions)
  return { outcome: resultado.outcome, retryCount }
}

/**
 * RECEIVED/PROCESSING -> (AUTHORIZED -> DELIVERY_PENDING) | NOT_AUTHORIZED | sigue en
 * PROCESSING con backoff. Idempotente: si ya está resuelta (AUTHORIZED,
 * NOT_AUTHORIZED o más allá), no hace nada — así "doble polling" sobre la misma
 * factura nunca duplica el AuditEvent de autorización ni retrocede el estado.
 */
export async function consultarYActualizarAutorizacion(facturaId, options) {
  const { environment, gasOptions, sriOptions, now = new Date() } = options
  const { factura } = await callGasAction('getFacturaFiscalCompleta', { facturaId }, gasOptions)

  if (RESOLVED_AUTHORIZATION_STATES.has(factura.Status)) {
    return { outcome: 'ALREADY_RESOLVED', status: factura.Status }
  }
  if (!['RECEIVED', 'PROCESSING'].includes(factura.Status)) {
    return { outcome: 'NOT_READY', status: factura.Status }
  }
  if (!factura.AccessKey) {
    return { outcome: 'MISSING_ACCESS_KEY' }
  }

  async function asegurarProcessing() {
    if (factura.Status === 'RECEIVED') {
      await callGasAction('transicionEstadoFactura', { facturaId, nuevoEstado: 'PROCESSING' }, gasOptions)
    }
  }

  const resultado = await consultarAutorizacion(factura.AccessKey, { environment, ...sriOptions })
  const retryCount = Number(factura.RetryCount) || 0

  if (resultado.outcome === 'AUTORIZADO') {
    await asegurarProcessing()
    const xmlAutorizado = String(resultado.xmlAutorizado || '').slice(0, MAX_XML_AUTHORIZED_LENGTH)
    await callGasAction('transicionEstadoFactura', {
      facturaId, nuevoEstado: 'AUTHORIZED',
      camposAdicionales: {
        AuthorizationNumber: resultado.numeroAutorizacion,
        AuthorizationDate: resultado.fechaAutorizacion,
        SriAuthorizationStatus: 'AUTORIZADO',
        XmlAuthorizedContent: xmlAutorizado,
        Sha256Authorized: resultado.xmlAutorizado ? sha256Hex(resultado.xmlAutorizado) : '',
        LastSriMessage: '',
      },
    }, gasOptions)
    await callGasAction('transicionEstadoFactura', { facturaId, nuevoEstado: 'DELIVERY_PENDING' }, gasOptions)
    return { outcome: 'AUTHORIZED', numeroAutorizacion: resultado.numeroAutorizacion }
  }

  if (resultado.outcome === 'NO_AUTORIZADO') {
    await asegurarProcessing()
    await callGasAction('transicionEstadoFactura', {
      facturaId, nuevoEstado: 'NOT_AUTHORIZED',
      camposAdicionales: { SriAuthorizationStatus: 'NO_AUTORIZADO', LastSriMessage: summarizeMensajes(resultado.mensajes) },
    }, gasOptions)
    return { outcome: 'NOT_AUTHORIZED' }
  }

  // EN_PROCESO, o un fallo transitorio (timeout/red/fault/malformado) mientras se
  // sondeaba: en ambos casos, no hay nada definitivo — se agenda otro intento con
  // backoff en vez de fallar o quedarse reintentando sin límite.
  await asegurarProcessing()
  const excedido = hasExceededMaxAttempts(retryCount)
  const nextPollAt = excedido
    ? new Date(now.getTime() + 24 * 60 * 60_000).toISOString() // se espacía a 24h, no se detiene solo
    : computeNextPollAt(retryCount, now)
  const mensaje = resultado.outcome === 'EN_PROCESO'
    ? ''
    : (excedido ? 'Excede reintentos automáticos, requiere revisión manual. ' : '') + (resultado.message || resultado.outcome)

  await callGasAction('transicionEstadoFactura', {
    facturaId, nuevoEstado: 'PROCESSING',
    camposAdicionales: {
      RetryCount: retryCount + 1,
      LastPolledAt: now.toISOString(),
      NextPollAt: nextPollAt,
      LastSriMessage: mensaje.slice(0, MAX_SRI_MESSAGE_LENGTH),
    },
  }, gasOptions)
  return { outcome: resultado.outcome, nextPollAt, retryCountExceeded: excedido }
}

/**
 * Punto de entrada único para "seguir desde donde quedó" una factura, sin que el
 * llamador tenga que saber en qué paso exacto se cayó el proceso anterior — cubre
 * "recuperación tras reinicio" reintentando solo lo que falta según el Status
 * persistido. SUBMITTING es la única excepción: no se reintenta automáticamente
 * (no se puede saber con certeza si el SRI ya recibió ese envío o no), se marca
 * para revisión manual.
 */
export async function continuarFlujoFactura(facturaId, options) {
  const { gasOptions } = options
  const { factura } = await callGasAction('getFacturaFiscalCompleta', { facturaId }, gasOptions)

  if (factura.Status === 'SUBMITTING') {
    return { outcome: 'REQUIRES_MANUAL_REVIEW', reason: 'La factura quedó reclamada para envío (SUBMITTING) sin resultado registrado. No se reintenta automáticamente para no arriesgar un envío duplicado al SRI.' }
  }

  if (['SEQUENCE_RESERVED', 'GENERATED'].includes(factura.Status)) {
    const generado = await generarYFirmarFactura(facturaId, options)
    if (generado.skipped) return { outcome: 'NO_ACTION', status: generado.factura.Status }
    return enviarFacturaARecepcion(facturaId, generado.signedXml, options)
  }

  if (factura.Status === 'SIGNED') {
    // Re-firma (nueva SigningTime) porque no se persiste el XML firmado, solo su
    // hash — seguro porque SIGNED todavía no se envió nunca al SRI.
    const regenerado = await generarYFirmarFactura(facturaId, options)
    if (regenerado.skipped) return { outcome: 'NO_ACTION', status: regenerado.factura.Status }
    return enviarFacturaARecepcion(facturaId, regenerado.signedXml, options)
  }

  if (['RECEIVED', 'PROCESSING'].includes(factura.Status)) {
    return consultarYActualizarAutorizacion(facturaId, options)
  }

  return { outcome: 'NO_ACTION', status: factura.Status }
}
