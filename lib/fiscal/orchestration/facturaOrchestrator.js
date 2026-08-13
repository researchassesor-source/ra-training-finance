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
 * - Un SUBMITTING envejecido (la conexión falló pero el SRI pudo haber recibido el
 *   envío) se reconcilia consultando Autorización con la misma clave de acceso
 *   ANTES de considerar reenviar — ver reconciliarSubmittingEnvejecido.
 * - El polling de autorización tiene límite (intentos Y antigüedad): pasado el
 *   límite se suspende con ReviewFlag='REQUIRES_REVIEW' en vez de seguir para
 *   siempre — solo un administrador la reactiva (reanudarPollingFactura en
 *   Fiscal.gs, requiere sesión real, nunca serviceToken).
 *
 * Nada de lo que hay aquí lee el .p12 del disco ni una variable de entorno de
 * secretos directamente — `signingKeys` se recibe por parámetro (inyección de
 * dependencias), para que los tests firmen con el fixture sintético de
 * testFixtures.p12.js y nunca con el certificado real.
 */

import { createHash } from 'node:crypto'
import { callGasAction, GasClientError } from './gasClient.js'
import {
  computeNextPollAt,
  hasExceededPollingLimit,
  SUBMITTING_TOO_RECENT_MS,
  SUBMITTING_SAFE_RESEND_MS,
  submittingAgeMs,
} from './backoff.js'
import { generateClaveAcceso } from '../claveAcceso.js'
import { buildFacturaXml } from '../facturaXml.js'
import { normalizeEstablishment, normalizeEmissionPoint, normalizeSequential } from '../normalizeFiscalCodes.js'
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

export function buildXmlParaFactura(factura, items, claveAcceso, emisor) {
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
    // Normalizados en la frontera Sheets -> XML: Google Sheets puede devolver estos
    // campos como número (p. ej. 1 en vez de "001") si la celda no quedó en formato
    // Texto — ver lib/fiscal/normalizeFiscalCodes.js. Estricto: lanza en vez de
    // aceptar un dato no numérico o de ancho incorrecto.
    establishment: normalizeEstablishment(factura.Establishment),
    emissionPoint: normalizeEmissionPoint(factura.EmissionPoint),
    sequential: normalizeSequential(factura.Sequential),
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
 * Aplica el resultado de una consulta de Autorización ya obtenida (AUTORIZADO,
 * NO_AUTORIZADO, EN_PROCESO o un fallo transitorio), asumiendo que la factura ya
 * está en PROCESSING. Compartida entre consultarYActualizarAutorizacion (camino
 * normal) y reconciliarSubmittingEnvejecido (camino de recuperación) para no
 * duplicar la lógica de "qué hacer con cada resultado posible".
 */
async function aplicarResultadoAutorizacion(facturaId, resultado, { gasOptions, retryCount, createdAt, now }) {
  if (resultado.outcome === 'AUTORIZADO') {
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
    await callGasAction('transicionEstadoFactura', {
      facturaId, nuevoEstado: 'NOT_AUTHORIZED',
      camposAdicionales: { SriAuthorizationStatus: 'NO_AUTORIZADO', LastSriMessage: summarizeMensajes(resultado.mensajes) },
    }, gasOptions)
    return { outcome: 'NOT_AUTHORIZED' }
  }

  // EN_PROCESO, o un fallo transitorio (timeout/red/fault/malformado): nada
  // definitivo. Si ya se excedió el límite de intentos O de antigüedad, se
  // SUSPENDE (no se sigue reintentando para siempre) — el estado fiscal sigue
  // siendo PROCESSING (es lo que el SRI dice, no se inventa un estado nuevo);
  // ReviewFlag es una bandera puramente operativa/interna nuestra.
  // Se evalúa sobre el intento QUE ESTÁ OCURRIENDO (retryCount + 1), no sobre los
  // intentos ya registrados — si no, con retryCount=POLL_MAX_ATTEMPTS-1 (ya
  // atravesado el límite en el intento anterior) haría falta un intento de más
  // antes de suspender.
  const excedido = hasExceededPollingLimit(retryCount + 1, createdAt, now)
  if (excedido) {
    const motivo = `Excede el límite automático de polling (intento #${retryCount + 1}, factura creada ${createdAt}). Requiere revisión manual antes de continuar sondeando.`
    await callGasAction('transicionEstadoFactura', {
      facturaId, nuevoEstado: 'PROCESSING',
      camposAdicionales: {
        RetryCount: retryCount + 1,
        LastPolledAt: now.toISOString(),
        NextPollAt: '',
        ReviewFlag: 'REQUIRES_REVIEW',
        ReviewReason: motivo,
        LastSriMessage: String(resultado.message || resultado.outcome || '').slice(0, MAX_SRI_MESSAGE_LENGTH),
      },
    }, gasOptions)
    return { outcome: 'REQUIRES_REVIEW', reason: motivo }
  }

  const nextPollAt = computeNextPollAt(retryCount, now)
  const mensaje = resultado.outcome === 'EN_PROCESO' ? '' : String(resultado.message || resultado.outcome || '')
  await callGasAction('transicionEstadoFactura', {
    facturaId, nuevoEstado: 'PROCESSING',
    camposAdicionales: {
      RetryCount: retryCount + 1,
      LastPolledAt: now.toISOString(),
      NextPollAt: nextPollAt,
      LastSriMessage: mensaje.slice(0, MAX_SRI_MESSAGE_LENGTH),
    },
  }, gasOptions)
  return { outcome: resultado.outcome, nextPollAt }
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
      establishment: normalizeEstablishment(factura.Establishment),
      emissionPoint: normalizeEmissionPoint(factura.EmissionPoint),
      sequential: normalizeSequential(factura.Sequential),
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
 * SIGNED -> SUBMITTING (claim atómico) -> RECEIVED/RETURNED, o SIGUE en SUBMITTING
 * si el envío falla de forma ambigua (timeout/red/fault/malformado). NUNCA llama al
 * SRI sin haber ganado el claim primero, y NUNCA retrocede a SIGNED automáticamente
 * ante una respuesta ambigua — eso reabriría exactamente el reenvío ciego que el
 * claim SUBMITTING existe para impedir (el SRI pudo haber recibido el XML aunque
 * nuestra conexión se cayera antes de leer la respuesta). Solo
 * reconciliarSubmittingEnvejecido, consultando Autorización con la MISMA clave de
 * acceso, decide más tarde si corresponde liberar el claim para un reenvío
 * controlado — igual que ya hace para un SUBMITTING encontrado en un reinicio.
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

  // TIMEOUT / NETWORK_ERROR / SOAP_FAULT / MALFORMED_RESPONSE: NO se sabe si el SRI
  // recibió el comprobante antes de que fallara la conexión. Se MANTIENE el claim en
  // SUBMITTING — deliberadamente no se escribe nada en Sheets aquí (SUBMITTING no
  // tiene auto-bucle, ver FISCAL_TRANSICIONES_VALIDAS en Fiscal.gs: escribir ahora
  // exigiría una transición SUBMITTING->SUBMITTING, que es precisamente lo que
  // rompería la exclusión mutua del claim). No tocar Sheets también preserva
  // UpdatedAt, el timestamp con el que reconciliarSubmittingEnvejecido mide la
  // antigüedad del claim para decidir cuándo es seguro liberar. El mensaje sanitizado
  // y el momento del claim se devuelven al llamador para que los reporte, pero no se
  // persisten aquí — la reconciliación es quien decide, más tarde, qué escribir.
  const mensajeError = resultado.message || (resultado.fault && resultado.fault.message) || resultado.outcome
  return {
    outcome: resultado.outcome,
    message: String(mensajeError).slice(0, MAX_SRI_MESSAGE_LENGTH),
    claimedAt: claim.UpdatedAt,
  }
}

/**
 * RECEIVED/PROCESSING -> (AUTHORIZED -> DELIVERY_PENDING) | NOT_AUTHORIZED | sigue en
 * PROCESSING con backoff | REQUIRES_REVIEW si excede el límite. Idempotente: si ya
 * está resuelta o suspendida, no hace nada — así "doble polling" nunca duplica el
 * AuditEvent de autorización, ni retrocede el estado, ni vuelve a llamar al SRI
 * sobre una factura ya marcada para revisión.
 */
export async function consultarYActualizarAutorizacion(facturaId, options) {
  const { environment, gasOptions, sriOptions, now = new Date() } = options
  const { factura } = await callGasAction('getFacturaFiscalCompleta', { facturaId }, gasOptions)

  if (RESOLVED_AUTHORIZATION_STATES.has(factura.Status)) {
    return { outcome: 'ALREADY_RESOLVED', status: factura.Status }
  }
  if (factura.ReviewFlag === 'REQUIRES_REVIEW') {
    return { outcome: 'SUSPENDED_FOR_REVIEW', reason: factura.ReviewReason }
  }
  if (!['RECEIVED', 'PROCESSING'].includes(factura.Status)) {
    return { outcome: 'NOT_READY', status: factura.Status }
  }
  if (!factura.AccessKey) {
    return { outcome: 'MISSING_ACCESS_KEY' }
  }

  if (factura.Status === 'RECEIVED') {
    await callGasAction('transicionEstadoFactura', { facturaId, nuevoEstado: 'PROCESSING' }, gasOptions)
  }

  const resultado = await consultarAutorizacion(factura.AccessKey, { environment, ...sriOptions })
  const retryCount = Number(factura.RetryCount) || 0
  return aplicarResultadoAutorizacion(facturaId, resultado, { gasOptions, retryCount, createdAt: factura.CreatedAt, now })
}

/**
 * Reconciliación segura de un claim SUBMITTING envejecido: "XML enviado -> el SRI
 * puede haberlo recibido -> nuestra conexión falló antes de la respuesta". NUNCA
 * reenvía a ciegas. Primero consulta Autorización con la MISMA clave de acceso —
 * si el SRI la conoce (con cualquier decisión, incluso "en proceso"), se reconcilia
 * el estado local sin volver a llamar a Recepción. Solo libera el claim para un
 * reenvío controlado (misma clave/secuencial, nunca una factura nueva) si, pasada
 * una ventana de tiempo prudente, el SRI sigue sin mostrar nada para esa clave.
 *
 * Límite honesto y documentado: el WSDL de Autorización no distingue de forma
 * confiable "el SRI lo recibió y lo sigue procesando" de "el SRI nunca lo recibió"
 * — ambos casos devuelven `autorizaciones` vacío (ver docs/fiscal/sri-sources.md,
 * hallazgo de Fase 5). Por eso la decisión de liberar el claim es por TIEMPO
 * (ventana seguraSUBMITTING_SAFE_RESEND_MS), no por un campo del SRI que distinga
 * ambos casos — no existe tal campo verificado. Es una política operativa
 * documentada, no un hecho confirmado por el SRI.
 */
export async function reconciliarSubmittingEnvejecido(facturaId, options) {
  const { environment, gasOptions, sriOptions, now = new Date() } = options
  const { factura } = await callGasAction('getFacturaFiscalCompleta', { facturaId }, gasOptions)

  if (factura.Status !== 'SUBMITTING') {
    return { outcome: 'NOT_APPLICABLE', status: factura.Status }
  }

  const ageMs = submittingAgeMs(factura.UpdatedAt, now)
  if (ageMs < SUBMITTING_TOO_RECENT_MS) {
    return { outcome: 'TOO_RECENT_TO_RECONCILE', ageMs }
  }
  if (!factura.AccessKey) {
    return { outcome: 'MISSING_ACCESS_KEY' }
  }

  const resultado = await consultarAutorizacion(factura.AccessKey, { environment, ...sriOptions })

  if (resultado.outcome === 'AUTORIZADO' || resultado.outcome === 'NO_AUTORIZADO') {
    // El SRI SÍ conoce el comprobante y ya tomó una decisión: lo recibió. Se
    // reconcilia el estado local (RECEIVED -> PROCESSING) sin volver a llamar a
    // Recepción en ningún momento.
    await callGasAction('transicionEstadoFactura', {
      facturaId, nuevoEstado: 'RECEIVED',
      camposAdicionales: { SriReceptionStatus: 'RECIBIDA (reconciliado tras reconexión)' },
    }, gasOptions)
    await callGasAction('transicionEstadoFactura', { facturaId, nuevoEstado: 'PROCESSING' }, gasOptions)
    const retryCount = Number(factura.RetryCount) || 0
    const aplicado = await aplicarResultadoAutorizacion(facturaId, resultado, { gasOptions, retryCount, createdAt: factura.CreatedAt, now })
    return { ...aplicado, reconciled: true }
  }

  // EN_PROCESO: ambiguo (ver límite documentado arriba). Se resuelve por tiempo.
  // Deliberadamente NO se escribe nada aquí: SUBMITTING no tiene auto-bucle (ver
  // Fiscal.gs) porque permitirlo rompería la exclusión mutua del claim, y además
  // escribir resetearía UpdatedAt, con el que se mide la antigüedad del claim para
  // esta misma decisión.
  if (ageMs < SUBMITTING_SAFE_RESEND_MS) {
    return { outcome: 'STILL_AMBIGUOUS_KEEP_WAITING', ageMs }
  }

  // Pasada la ventana segura sin encontrar nada: se libera el claim para un
  // reenvío CONTROLADO. Misma AccessKey/Establishment/EmissionPoint/Sequential
  // (ya persistidas desde GENERATED) — generarYFirmarFactura las reutiliza, nunca
  // genera una factura nueva ni una clave nueva.
  const retryCount = (Number(factura.RetryCount) || 0) + 1
  const minutos = Math.round(ageMs / 60_000)
  await callGasAction('transicionEstadoFactura', {
    facturaId, nuevoEstado: 'SIGNED',
    camposAdicionales: {
      RetryCount: retryCount,
      LastSriMessage: `No se encontró el comprobante en Autorización tras ${minutos} min desde el envío. Liberado para reenvío controlado con la misma clave de acceso.`.slice(0, MAX_SRI_MESSAGE_LENGTH),
    },
  }, gasOptions)
  return { outcome: 'RELEASED_FOR_CONTROLLED_RESEND', ageMs }
}

/**
 * Punto de entrada único para "seguir desde donde quedó" una factura, sin que el
 * llamador tenga que saber en qué paso exacto se cayó el proceso anterior — cubre
 * "recuperación tras reinicio" reintentando solo lo que falta según el Status
 * persistido. SUBMITTING ya no es una excepción ciega: se reconcilia primero
 * contra Autorización (reconciliarSubmittingEnvejecido) antes de decidir si hay
 * algo que reenviar.
 */
export async function continuarFlujoFactura(facturaId, options) {
  const { gasOptions } = options
  const { factura } = await callGasAction('getFacturaFiscalCompleta', { facturaId }, gasOptions)

  if (factura.Status === 'SUBMITTING') {
    return reconciliarSubmittingEnvejecido(facturaId, options)
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
