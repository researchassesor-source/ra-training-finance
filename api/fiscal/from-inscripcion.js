import { continuarFlujoFactura } from '../../lib/fiscal/orchestration/facturaOrchestrator.js'
import { getActiveEnvironment, getEmisorConfig } from '../../lib/fiscal/emisorConfig.js'
import { callGasActionAsUser, fiscalGasErrorResponse } from '../../lib/fiscal/orchestration/gasClient.js'
import { loadSigningKeysFromEnv, SigningKeysNotConfiguredError } from '../../lib/fiscal/orchestration/loadSigningKeys.js'
import { getFiscalUserToken } from '../../lib/fiscal/httpAuth.js'
import { IDENTIFICATION_TYPE, identificationError } from '../../src/utils/identification.js'

const DEFAULT_ESTABLISHMENT = '001'
const DEFAULT_EMISSION_POINT = '002'
const DEFAULT_DOCUMENT_TYPE = '01'

function text(value) {
  return value === null || value === undefined ? '' : String(value).trim()
}

function cents(value) {
  return Math.round((Number(value) || 0) * 100)
}

function idType(identification) {
  return text(identification).length === 13 ? 'ruc' : 'cedula'
}

function resolveInvoiceIdentity(inscripcion) {
  const hasParticipantIdentity = inscripcion.ClienteID !== null
    && inscripcion.ClienteID !== undefined
    && String(inscripcion.ClienteID).trim() !== ''
  const hasBillingIdentity = inscripcion.RUC !== null
    && inscripcion.RUC !== undefined
    && String(inscripcion.RUC).trim() !== ''
  const billingDiffers = hasBillingIdentity
    && String(inscripcion.RUC).trim() !== String(inscripcion.ClienteID ?? '').trim()
  const rawBillingType = text(inscripcion.TipoIdentificacionFactura).toUpperCase()
  const billingIsConsumerFinal = ['07', 'CONSUMIDOR_FINAL', 'CONSUMIDOR FINAL'].includes(rawBillingType)
  const useBillingIdentity = hasBillingIdentity && (!hasParticipantIdentity || billingDiffers || billingIsConsumerFinal)
  const rawIdentity = useBillingIdentity
    ? inscripcion.RUC
    : (hasParticipantIdentity ? inscripcion.ClienteID : inscripcion.RUC)
  if (rawIdentity === null || rawIdentity === undefined || rawIdentity === '') {
    throw validationError('Falta la identificación del cliente para facturar.')
  }
  if (typeof rawIdentity !== 'string') {
    throw validationError('La identificación llegó como número. Revise el dato de origen y guárdelo como texto; Finance no reconstruye ceros automáticamente.')
  }

  const identification = text(rawIdentity)
  // Las inscripciones nuevas guardan el tipo. Los registros anteriores de CRM
  // pueden no tenerlo; en ese caso se conserva temporalmente la regla histórica
  // por longitud para no romper su facturación existente.
  const rawType = text(useBillingIdentity
    ? inscripcion.TipoIdentificacionFactura
    : (inscripcion.ClienteTipoIdentificacion || inscripcion.TipoIdentificacionFactura)).toUpperCase()
  const aliases = {
    CEDULA: IDENTIFICATION_TYPE.ECUADORIAN_ID,
    CEDULA_EC: IDENTIFICATION_TYPE.ECUADORIAN_ID,
    ECUADORIAN_ID: IDENTIFICATION_TYPE.ECUADORIAN_ID,
    RUC: IDENTIFICATION_TYPE.ECUADORIAN_RUC,
    RUC_EC: IDENTIFICATION_TYPE.ECUADORIAN_RUC,
    ECUADORIAN_RUC: IDENTIFICATION_TYPE.ECUADORIAN_RUC,
    PASAPORTE: IDENTIFICATION_TYPE.PASSPORT,
    PASSPORT: IDENTIFICATION_TYPE.PASSPORT,
    OTRO: IDENTIFICATION_TYPE.OTHER,
    OTHER: IDENTIFICATION_TYPE.OTHER,
    EXTERIOR: IDENTIFICATION_TYPE.OTHER,
    '04': IDENTIFICATION_TYPE.ECUADORIAN_RUC,
    '05': IDENTIFICATION_TYPE.ECUADORIAN_ID,
    '06': IDENTIFICATION_TYPE.PASSPORT,
    '07': IDENTIFICATION_TYPE.CONSUMER_FINAL,
    '08': IDENTIFICATION_TYPE.OTHER,
    CONSUMIDOR_FINAL: IDENTIFICATION_TYPE.CONSUMER_FINAL,
    'CONSUMIDOR FINAL': IDENTIFICATION_TYPE.CONSUMER_FINAL,
    NO_ESPECIFICADO: IDENTIFICATION_TYPE.UNSPECIFIED,
  }
  const declaredType = aliases[rawType] || ''
  let buyerIdentificationType

  if (useBillingIdentity && hasParticipantIdentity
      && (!declaredType || declaredType === IDENTIFICATION_TYPE.UNSPECIFIED)) {
    throw validationError('Los datos de facturación tienen una identificación distinta al participante. Seleccione y guarde su tipo antes de facturar.')
  }
  if (declaredType === IDENTIFICATION_TYPE.CONSUMER_FINAL) {
    if (!useBillingIdentity) {
      throw validationError('Consumidor final solo puede configurarse como identificación fiscal de facturación, no como documento del participante.')
    }
    const error = identificationError(identification, IDENTIFICATION_TYPE.CONSUMER_FINAL, { allowConsumerFinal: true })
    if (error) throw validationError(error)
    buyerIdentificationType = 'consumidorFinal'
  } else if (declaredType === IDENTIFICATION_TYPE.OTHER) {
    throw validationError('El tipo “Otro documento” no tiene una equivalencia fiscal configurada. Seleccione el tipo correcto antes de facturar.')
  } else if (declaredType === IDENTIFICATION_TYPE.PASSPORT) {
    const error = identificationError(identification, IDENTIFICATION_TYPE.PASSPORT)
    if (error || identification.length > 20 || /[\r\n]/.test(identification)) {
      throw validationError('El pasaporte debe tener hasta 20 caracteres, usar un formato de documento válido y no contener saltos de línea para facturación.')
    }
    buyerIdentificationType = 'pasaporte'
  } else if (declaredType === IDENTIFICATION_TYPE.ECUADORIAN_ID) {
    const error = identificationError(identification, IDENTIFICATION_TYPE.ECUADORIAN_ID)
    if (error) throw validationError(error)
    buyerIdentificationType = 'cedula'
  } else if (declaredType === IDENTIFICATION_TYPE.ECUADORIAN_RUC) {
    const error = identificationError(identification, IDENTIFICATION_TYPE.ECUADORIAN_RUC)
    if (error) throw validationError(error)
    buyerIdentificationType = 'ruc'
  } else if (rawType && declaredType !== IDENTIFICATION_TYPE.UNSPECIFIED) {
    throw validationError('El tipo de identificación no es compatible con la facturación SRI.')
  } else {
    if (!/^\d{10}$|^\d{13}$/.test(identification)) {
      throw validationError('La identificación fiscal debe contener 10 dígitos para cédula o 13 para RUC; registre explícitamente el tipo si es pasaporte.')
    }
    buyerIdentificationType = idType(identification)
  }

  return { identification, buyerIdentificationType }
}

function publicFactura(row = {}) {
  return {
    id: row.ID || '',
    status: row.Status || '',
    environment: row.Environment || '',
    documentNumber: row.DocumentNumber || [row.Establishment, row.EmissionPoint, row.Sequential].filter(Boolean).join('-'),
    sequential: row.Sequential || '',
  }
}

function validationError(message) {
  const error = new Error(message)
  error.statusCode = 422
  return error
}

/**
 * Fail-closed: en un deployment Vercel Production, getActiveEnvironment() jamás
 * puede resolver silenciosamente a "test" (su fallback seguro para preview/dev) sin
 * que esto bloquee la creación de la factura. Sin este guard, un Production con
 * SRI_ENVIRONMENT mal configurado o ausente crea DRAFTs en test creyendo facturar en
 * production (bug real de QA: caso Alexander Mosquera Puente). Preview/desarrollo
 * (VERCEL_ENV !== 'production') no están sujetos a este guard y siguen usando el
 * fallback seguro existente de getActiveEnvironment().
 */
function assertProductionInvoicingEnvironmentIsExplicit(environment) {
  if (process.env.VERCEL_ENV === 'production' && environment !== 'production') {
    const error = new Error(
      'La facturación productiva está bloqueada porque SRI_ENVIRONMENT no está configurado explícitamente como production.'
    )
    error.statusCode = 500
    throw error
  }
}

/**
 * Sequential real, normalizado estrictamente: solo dígitos, y > 0. Una fila sin
 * secuencial (DRAFT recién creado, o valor vacío/no numérico) devuelve null y NUNCA
 * cuenta como secuencial consumido -- ni el 0 ni un valor no numérico son un
 * secuencial real.
 */
function strictSequentialNumber_(value) {
  const raw = String(value === null || value === undefined ? '' : value).trim()
  if (!/^\d+$/.test(raw)) return null
  const n = Number(raw)
  return n > 0 ? n : null
}

/** Mismo padStart(length,'0') que usa verificarConflictoSerieFiscal en Fiscal.gs
 * para comparar códigos fiscales -- para que una fila con Establishment=1 (número)
 * siga comparando igual que '001'. */
function normalizarCodigoFiscalJs_(value, length) {
  return String(value === null || value === undefined ? '' : value).trim().padStart(length, '0')
}

/**
 * Mayor Sequential ya persistido en FacturasFiscales para esta serie exacta
 * (Environment + Establishment 001 + EmissionPoint 002 + DocumentType 01). Ignora
 * filas de otra serie, otro ambiente, otro tipo de documento, y filas sin secuencial
 * real (un DRAFT sin secuencial no "reserva" ningún número).
 */
function maxSequentialPersistidoParaSerie_(facturas, environment) {
  return facturas.reduce((max, row) => {
    if (String(row?.Environment || '') !== environment) return max
    if (normalizarCodigoFiscalJs_(row?.Establishment, 3) !== DEFAULT_ESTABLISHMENT) return max
    if (normalizarCodigoFiscalJs_(row?.EmissionPoint, 3) !== DEFAULT_EMISSION_POINT) return max
    if (normalizarCodigoFiscalJs_(row?.DocumentType, 2) !== DEFAULT_DOCUMENT_TYPE) return max
    const sequential = strictSequentialNumber_(row?.Sequential)
    if (sequential === null) return max
    return Math.max(max, sequential)
  }, 0)
}

/**
 * Preflight de serie ANTES de crear un DRAFT nuevo (nunca para el camino
 * idempotente, que no crea nada). Reutiliza acciones read-only ya existentes --
 * verificarConflictoSerieFiscal y getFacturasFiscales -- sin tocar su lógica.
 *
 * Dos inconsistencias distintas se bloquean aquí:
 * A) facturas existentes en la serie sin ningún contador de secuencia en Finance:
 *    indica una reconciliación pendiente, no un simple "primer uso".
 * B) SÍ existe contador, pero su LastSequential (ultimoSecuencialEnFinance) quedó
 *    por DEBAJO del mayor Sequential ya persistido en FacturasFiscales para esta
 *    serie: reservarSecuencialFiscal usaría LastSequential+1, repitiendo un número
 *    ya emitido -- exactamente el bug reportado (factura 001-002-000000005 con
 *    contador en 3).
 *
 * Un contador POR ENCIMA del máximo persistido (caso D del prompt) NO se bloquea ni
 * se corrige: es una situación segura ya contemplada -- el contador puede haber
 * reservado números para facturas que todavía no llegaron a un estado terminal con
 * Sequential visible aquí (p.ej. otra factura en SUBMITTING/PROCESSING de este mismo
 * ciclo). Este preflight solo DETECTA y bloquea; nunca escribe SecuenciaFiscal, nunca
 * reserva, nunca corrige.
 */
async function assertSeriesConsistentBeforeDraft(token, environment) {
  const conflicto = await callGasActionAsUser('verificarConflictoSerieFiscal', {
    establishment: DEFAULT_ESTABLISHMENT,
    emissionPoint: DEFAULT_EMISSION_POINT,
    documentType: DEFAULT_DOCUMENT_TYPE,
    environment,
  }, token, { timeoutMs: 45_000 })
  const facturasEncontradas = Number(conflicto?.facturasEncontradas) || 0
  const contadoresEncontrados = Number(conflicto?.contadoresEncontrados) || 0
  if (facturasEncontradas > 0 && contadoresEncontrados === 0) {
    throw validationError(
      'La serie 001-002 tiene facturas existentes pero no existe un contador de secuencia en Finance. ' +
      'Requiere reconciliación administrativa antes de emitir.'
    )
  }

  if (contadoresEncontrados > 0) {
    const facturas = await callGasActionAsUser('getFacturasFiscales', { environment }, token, { timeoutMs: 45_000 })
    const maxSequentialPersistido = maxSequentialPersistidoParaSerie_(Array.isArray(facturas) ? facturas : [], environment)
    const ultimoSecuencialEnFinance = Number(conflicto?.ultimoSecuencialEnFinance) || 0
    if (ultimoSecuencialEnFinance < maxSequentialPersistido) {
      throw validationError(
        'La secuencia fiscal de Finance está desactualizada respecto a las facturas existentes. ' +
        'Requiere reconciliación administrativa antes de emitir.'
      )
    }
  }
}

/**
 * Booleano estricto de un campo de Sheets: acepta el JS boolean nativo, y las
 * representaciones de texto/número que Sheets produce (TRUE/FALSE, 1/0, "1"/"0").
 * Cualquier otra cosa (vacío, undefined, null, un texto no reconocido) es ambigua y
 * devuelve null -- NUNCA se asume false ni true por defecto. Distingue
 * explícitamente "false real" de "no sé".
 */
function parseBooleanoFiscalEstricto(value) {
  if (value === true || value === false) return value
  const normalized = String(value === null || value === undefined ? '' : value).trim().toUpperCase()
  if (normalized === 'TRUE' || normalized === '1') return true
  if (normalized === 'FALSE' || normalized === '0') return false
  return null
}

/**
 * Clasificación fiscal del curso: decide el código interno del catálogo y el sufijo
 * de la descripción. El aval NUNCA decide si se factura (ambos casos se facturan) --
 * solo decide el código/descripción, y ambos son IVA 0% (SriTaxCode 2:0).
 *
 * Fuente de verdad, en orden estricto de prioridad:
 *   1) RequiereAvalExterno explícito (true/false real, nunca inferido del monto ni
 *      del EstadoAval: RequiereAvalExterno=true + EstadoAval='pendiente' sigue
 *      siendo "compró con aval", el documento de aval solo está en trámite).
 *   2) CRMOfferType, SOLO si es inequívoco: FULL=con aval, INSTITUTIONAL=sin aval.
 *      AVAL_UPGRADE NUNCA se usa aquí -- representa una compra adicional sobre una
 *      inscripción que ya tiene su propia clasificación base, no la clasificación de
 *      esta factura.
 *   3) Fail closed: si ninguna de las dos anteriores es inequívoca, no se inventa
 *      una clasificación -- se rechaza antes de crear cualquier borrador.
 */
function resolverClasificacionFiscalCurso(inscripcion) {
  const requiereAval = parseBooleanoFiscalEstricto(inscripcion && inscripcion.RequiereAvalExterno)
  let conAval
  if (requiereAval !== null) {
    conAval = requiereAval
  } else if (inscripcion && inscripcion.CRMOfferType === 'FULL') {
    conAval = true
  } else if (inscripcion && inscripcion.CRMOfferType === 'INSTITUTIONAL') {
    conAval = false
  } else {
    throw validationError(
      'No se puede determinar si esta inscripción incluye aval externo. Clasifique la inscripción antes de facturar.'
    )
  }
  return conAval
    ? { codigo: 'CAPACITACION', descripcionSufijo: 'Curso de formación avalado por ITSAL' }
    : { codigo: 'CAPACITACION_RA', descripcionSufijo: 'Curso R.A. Training' }
}

function invoicePayloadFromInscripcion(inscripcion, environment) {
  const buyer = resolveInvoiceIdentity(inscripcion)
  const name = text(inscripcion.RazonSocial || inscripcion.ClienteNombre)
  const amount = cents(inscripcion.Monto)
  if (text(inscripcion.EstadoPago).toLowerCase() !== 'verificado') {
    throw validationError('La inscripción debe tener el pago verificado antes de facturar.')
  }
  if (!name) throw validationError('Falta razón social o nombre del cliente para facturar.')
  if (amount <= 0) throw validationError('El monto de la inscripción no es válido para facturar.')

  const clasificacion = resolverClasificacionFiscalCurso(inscripcion)
  const serviceName = text(inscripcion.ServicioNombre || 'Curso R.A. Training avalado por ITSAL')
  const description = `${serviceName} - ${clasificacion.descripcionSufijo}`
  return {
    environment,
    idempotencyKey: `inscripcion:${text(inscripcion.ID)}:pago-verificado:v1`,
    inscripcionId: text(inscripcion.ID),
    documentType: '01',
    issuerRuc: process.env.SRI_ISSUER_RUC || '0691787373001',
    buyerIdentificationType: buyer.buyerIdentificationType,
    buyerIdentification: buyer.identification,
    buyerName: name,
    buyerEmail: text(inscripcion.ClienteEmail),
    buyerAddress: text(inscripcion.DireccionFactura),
    paymentMethodInternal: text(inscripcion.MetodoPago || 'Transferencia'),
    taxTotal: 0,
    grandTotal: amount,
    discountCents: 0,
    items: [{
      codigo: clasificacion.codigo,
      descripcion: description,
      cantidad: 1,
      precioUnitarioCents: amount,
      descuentoCents: 0,
      taxRateBasisPoints: 0,
      baseCents: amount,
      totalCents: amount,
    }],
  }
}

async function findExistingByInscripcion(token, environment, inscripcionId) {
  const rows = await callGasActionAsUser('getFacturasFiscales', { environment }, token, { timeoutMs: 45_000 })
  return (Array.isArray(rows) ? rows : []).find(row => text(row.InscripcionID) === text(inscripcionId))
}

export { resolverClasificacionFiscalCurso }

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Método no permitido' })
    return
  }
  let body = req.body
  if (typeof body === 'string') {
    try { body = JSON.parse(body) } catch { return res.status(400).json({ success: false, error: 'JSON inválido' }) }
  }
  const { inscripcionId } = body || {}
  const token = getFiscalUserToken(req, body)
  if (!token) {
    res.status(401).json({ success: false, error: 'Sesión inválida o expirada. Por favor inicia sesión de nuevo.' })
    return
  }
  if (!inscripcionId) {
    res.status(400).json({ success: false, error: 'inscripcionId es obligatorio.' })
    return
  }

  const environment = getActiveEnvironment()
  let createdFactura = null

  try {
    assertProductionInvoicingEnvironmentIsExplicit(environment)

    const existing = await findExistingByInscripcion(token, environment, inscripcionId)
    if (existing) {
      res.status(200).json({ success: true, data: { factura: publicFactura(existing), idempotent: true } })
      return
    }

    const inscripciones = await callGasActionAsUser('getInscripciones', { filtros: {} }, token, { timeoutMs: 45_000 })
    const inscripcion = (Array.isArray(inscripciones) ? inscripciones : []).find(item => text(item.ID) === text(inscripcionId))
    if (!inscripcion) throw validationError('No se encontró la inscripción para facturar.')

    const draftPayload = invoicePayloadFromInscripcion(inscripcion, environment)
    await assertSeriesConsistentBeforeDraft(token, environment)
    const draft = await callGasActionAsUser('crearBorradorFactura', draftPayload, token, { timeoutMs: 45_000 })
    createdFactura = draft
    if (draft?.Status === 'DRAFT') {
      await callGasActionAsUser('reservarSecuencialFiscal', {
        facturaId: draft.ID,
        establishment: DEFAULT_ESTABLISHMENT,
        emissionPoint: DEFAULT_EMISSION_POINT,
      }, token, { timeoutMs: 45_000 })
      const detail = await callGasActionAsUser('getFacturaFiscalCompleta', { facturaId: draft.ID }, token, { timeoutMs: 45_000 })
      createdFactura = detail.factura || draft
    }

    let signingKeys
    try {
      signingKeys = loadSigningKeysFromEnv()
    } catch (err) {
      if (err instanceof SigningKeysNotConfiguredError) {
        res.status(200).json({
          success: true,
          data: { factura: publicFactura(createdFactura || draft), attention: 'Factura creada; certificado de firma pendiente de configurar.' },
        })
        return
      }
      throw err
    }

    const processed = await continuarFlujoFactura((createdFactura || draft).ID, {
      environment,
      emisor: getEmisorConfig(),
      signingKeys,
      gasOptions: {},
    })
    res.status(200).json({ success: true, data: { factura: publicFactura(processed?.factura || createdFactura || draft), processed } })
  } catch (err) {
    const failure = fiscalGasErrorResponse(err, 'No se pudo crear la factura fiscal.')
    // Si una sesión/permisos falla a mitad del proceso, devuelve el código correcto
    // aunque ya exista un borrador. La clave por inscripción hace seguro reintentar
    // tras volver a iniciar sesión: el borrador existente se reutiliza, no se duplica.
    const authFailure = failure.status === 401 || failure.status === 403
    const status = err.statusCode || (createdFactura && !authFailure ? 200 : failure.status)
    const partialSuccess = Boolean(createdFactura && !authFailure)
    res.status(status).json({
      success: partialSuccess,
      error: partialSuccess ? undefined : (err.statusCode ? err.message : failure.error),
      data: createdFactura ? {
        factura: publicFactura(createdFactura),
        attention: 'Pago verificado; la factura fiscal requiere atención administrativa.',
        reason: err.message || 'Error fiscal no crítico para el pago.',
      } : undefined,
    })
  }
}
