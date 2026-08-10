/**
 * Generador de XML de Factura, esquema oficial del SRI (Ecuador) versión 2.1.0.
 *
 * Versión elegida y por qué (ver docs/fiscal/sri-sources.md para el detalle completo
 * con hashes y fuente oficial verificada el 10/08/2026): el ZIP oficial de XSD/XML de
 * Factura en sri.gob.ec publica cuatro versiones (1.0.0, 1.1.0, 2.0.0, 2.1.0). 2.1.0 es
 * la única que soporta 6 decimales en <cantidad>/<precioUnitario>/<precioSinSubsidio>
 * (2.0.0 solo permite 2), que es justo lo que exige la regla de negocio de "cantidad y
 * precio con decimales permitidos" — y es además la versión más reciente/superset.
 *
 * Esta función SOLO construye y ordena el XML según el esquema (el orden de elementos
 * importa: xsd:sequence es estricto). No firma (Fase 4), no calcula impuestos (eso ya
 * está en money.js) y no decide el código de tarifa IVA del SRI (codigoPorcentaje) —
 * ese valor llega ya resuelto desde la configuración fiscal (ConfiguracionFiscal /
 * FacturaItems.SriTaxCode), precisamente porque el tratamiento de IVA 0% para esta
 * empresa todavía está pendiente de confirmación tributaria (ver Fiscal.gs,
 * FISCAL_VALIDACION_PENDIENTE).
 */

import { centsToDecimalString, formatQuantity6 } from './money.js'

export class FacturaXmlError extends Error {}

export const FACTURA_XML_VERSION = '2.1.0'

const AMBIENTE_CODE = Object.freeze({ test: '1', production: '2' })
const TIPO_EMISION_NORMAL = '1'
const COD_DOC_FACTURA = '01'

const TIPO_IDENTIFICACION_COMPRADOR = Object.freeze({
  ruc: '04',
  cedula: '05',
  pasaporte: '06',
  consumidorFinal: '07',
  exterior: '08',
})

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function el(name, content) {
  if (content === undefined || content === null || content === '') return ''
  return `<${name}>${escapeXml(content)}</${name}>`
}

function requireField(value, label) {
  if (value === undefined || value === null || value === '') {
    throw new FacturaXmlError(`Campo obligatorio faltante para el XML de factura: "${label}".`)
  }
  return value
}

function formatFechaEmision(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new FacturaXmlError('fechaEmision debe ser un Date válido.')
  }
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const yyyy = String(date.getFullYear())
  return `${dd}/${mm}/${yyyy}`
}

function assertImpuestoBase(impuesto, contexto) {
  requireField(impuesto.codigo, `${contexto}.codigo`)
  requireField(impuesto.codigoPorcentaje, `${contexto}.codigoPorcentaje`)
  if (!Number.isInteger(impuesto.baseImponibleCents) || impuesto.baseImponibleCents < 0) {
    throw new FacturaXmlError(`${contexto}.baseImponibleCents debe ser un entero no negativo.`)
  }
  if (!Number.isInteger(impuesto.valorCents) || impuesto.valorCents < 0) {
    throw new FacturaXmlError(`${contexto}.valorCents debe ser un entero no negativo.`)
  }
}

/**
 * <detalles><detalle><impuestos><impuesto>: el XSD (complexType "impuesto", línea ~646)
 * exige el orden codigo, codigoPorcentaje, tarifa, baseImponible, valor — con tarifa
 * ANTES de baseImponible y obligatoria (minOccurs=1).
 */
function buildImpuestoDetalleXml(impuesto, contexto) {
  assertImpuestoBase(impuesto, contexto)
  requireField(impuesto.tarifa, `${contexto}.tarifa`)
  return (
    el('codigo', impuesto.codigo) +
    el('codigoPorcentaje', impuesto.codigoPorcentaje) +
    el('tarifa', impuesto.tarifa) +
    el('baseImponible', centsToDecimalString(impuesto.baseImponibleCents)) +
    el('valor', centsToDecimalString(impuesto.valorCents))
  )
}

/**
 * <infoFactura><totalConImpuestos><totalImpuesto>: el XSD (elemento inline dentro de
 * "factura", línea ~899) exige un orden DISTINTO al de detalle: codigo,
 * codigoPorcentaje, [descuentoAdicional], baseImponible, [tarifa], valor,
 * [valorDevolucionIva] — aquí baseImponible va ANTES de tarifa, y tarifa es opcional
 * (minOccurs=0). Mezclar este orden con el de detalle produce un XML que un XSD real
 * rechaza aunque "se vea" correcto (así se detectó este caso con xmllint).
 */
function buildTotalImpuestoXml(impuesto, contexto) {
  assertImpuestoBase(impuesto, contexto)
  return (
    el('codigo', impuesto.codigo) +
    el('codigoPorcentaje', impuesto.codigoPorcentaje) +
    el('baseImponible', centsToDecimalString(impuesto.baseImponibleCents)) +
    el('tarifa', impuesto.tarifa) +
    el('valor', centsToDecimalString(impuesto.valorCents))
  )
}

function buildDetalleXml(detalle, index) {
  const contexto = `detalles[${index}]`
  requireField(detalle.descripcion, `${contexto}.descripcion`)
  if (!Array.isArray(detalle.impuestos) || detalle.impuestos.length === 0) {
    throw new FacturaXmlError(`${contexto} requiere al menos un impuesto.`)
  }
  if (!Number.isInteger(detalle.precioTotalSinImpuestoCents) || detalle.precioTotalSinImpuestoCents < 0) {
    throw new FacturaXmlError(`${contexto}.precioTotalSinImpuestoCents debe ser un entero no negativo.`)
  }

  const descuentoCents = Number.isInteger(detalle.descuentoCents) ? detalle.descuentoCents : 0

  return (
    '<detalle>' +
    el('codigoPrincipal', detalle.codigoPrincipal) +
    el('codigoAuxiliar', detalle.codigoAuxiliar) +
    el('descripcion', detalle.descripcion) +
    el('unidadMedida', detalle.unidadMedida) +
    el('cantidad', formatQuantity6(detalle.cantidad)) +
    el('precioUnitario', formatQuantity6(detalle.precioUnitario)) +
    el('descuento', centsToDecimalString(descuentoCents)) +
    el('precioTotalSinImpuesto', centsToDecimalString(detalle.precioTotalSinImpuestoCents)) +
    '<impuestos>' +
    detalle.impuestos.map((imp, i) => `<impuesto>${buildImpuestoDetalleXml(imp, `${contexto}.impuestos[${i}]`)}</impuesto>`).join('') +
    '</impuestos>' +
    '</detalle>'
  )
}

function buildPagoXml(pago, index) {
  const contexto = `pagos[${index}]`
  requireField(pago.formaPago, `${contexto}.formaPago`)
  if (!Number.isInteger(pago.totalCents) || pago.totalCents < 0) {
    throw new FacturaXmlError(`${contexto}.totalCents debe ser un entero no negativo.`)
  }
  return (
    '<pago>' +
    el('formaPago', pago.formaPago) +
    el('total', centsToDecimalString(pago.totalCents)) +
    el('plazo', pago.plazo) +
    el('unidadTiempo', pago.unidadTiempo) +
    '</pago>'
  )
}

/**
 * Construye el XML de factura 2.1.0 (sin firmar). Ver el shape de `input` en
 * facturaXml.test.js — deliberadamente no se documenta aquí dos veces la misma forma.
 */
export function buildFacturaXml(input) {
  if (!input || typeof input !== 'object') throw new FacturaXmlError('input inválido.')

  const ambiente = AMBIENTE_CODE[input.environment]
  if (!ambiente) throw new FacturaXmlError(`environment inválido: "${input.environment}" (use "test" o "production").`)

  requireField(input.razonSocial, 'razonSocial')
  requireField(input.ruc, 'ruc')
  requireField(input.claveAcceso, 'claveAcceso')
  if (!/^\d{49}$/.test(input.claveAcceso)) throw new FacturaXmlError('claveAcceso debe tener 49 dígitos.')
  requireField(input.establishment, 'establishment')
  requireField(input.emissionPoint, 'emissionPoint')
  requireField(input.sequential, 'sequential')
  requireField(input.dirMatriz, 'dirMatriz')

  const buyer = input.buyer || {}
  const tipoIdentificacionComprador = TIPO_IDENTIFICACION_COMPRADOR[buyer.tipoIdentificacion]
  if (!tipoIdentificacionComprador) {
    throw new FacturaXmlError(`buyer.tipoIdentificacion inválido: "${buyer.tipoIdentificacion}".`);
  }
  requireField(buyer.identificacion, 'buyer.identificacion')
  requireField(buyer.razonSocial, 'buyer.razonSocial')

  if (!Array.isArray(input.detalles) || input.detalles.length === 0) {
    throw new FacturaXmlError('Se requiere al menos un detalle.')
  }
  if (!Array.isArray(input.impuestosTotales) || input.impuestosTotales.length === 0) {
    throw new FacturaXmlError('Se requiere al menos un totalImpuesto.')
  }
  if (!Number.isInteger(input.totalSinImpuestosCents) || input.totalSinImpuestosCents < 0) {
    throw new FacturaXmlError('totalSinImpuestosCents debe ser un entero no negativo.')
  }
  if (!Number.isInteger(input.totalDescuentoCents) || input.totalDescuentoCents < 0) {
    throw new FacturaXmlError('totalDescuentoCents debe ser un entero no negativo.')
  }
  if (!Number.isInteger(input.importeTotalCents) || input.importeTotalCents < 0) {
    throw new FacturaXmlError('importeTotalCents debe ser un entero no negativo.')
  }

  const infoTributaria =
    '<infoTributaria>' +
    el('ambiente', ambiente) +
    el('tipoEmision', TIPO_EMISION_NORMAL) +
    el('razonSocial', input.razonSocial) +
    el('nombreComercial', input.nombreComercial) +
    el('ruc', input.ruc) +
    el('claveAcceso', input.claveAcceso) +
    el('codDoc', COD_DOC_FACTURA) +
    el('estab', input.establishment) +
    el('ptoEmi', input.emissionPoint) +
    el('secuencial', input.sequential) +
    el('dirMatriz', input.dirMatriz) +
    '</infoTributaria>'

  const totalConImpuestos =
    '<totalConImpuestos>' +
    input.impuestosTotales.map((imp, i) => `<totalImpuesto>${buildTotalImpuestoXml(imp, `impuestosTotales[${i}]`)}</totalImpuesto>`).join('') +
    '</totalConImpuestos>'

  const pagos = Array.isArray(input.pagos) && input.pagos.length > 0
    ? `<pagos>${input.pagos.map(buildPagoXml).join('')}</pagos>`
    : ''

  const infoFactura =
    '<infoFactura>' +
    el('fechaEmision', formatFechaEmision(input.fechaEmision)) +
    el('dirEstablecimiento', input.dirEstablecimiento) +
    el('obligadoContabilidad', input.obligadoContabilidad ? 'SI' : (input.obligadoContabilidad === false ? 'NO' : '')) +
    el('tipoIdentificacionComprador', tipoIdentificacionComprador) +
    el('razonSocialComprador', buyer.razonSocial) +
    el('identificacionComprador', buyer.identificacion) +
    el('direccionComprador', buyer.direccion) +
    el('totalSinImpuestos', centsToDecimalString(input.totalSinImpuestosCents)) +
    el('totalDescuento', centsToDecimalString(input.totalDescuentoCents)) +
    totalConImpuestos +
    el('importeTotal', centsToDecimalString(input.importeTotalCents)) +
    el('moneda', input.moneda || 'DOLAR') +
    pagos +
    '</infoFactura>'

  const detalles = `<detalles>${input.detalles.map(buildDetalleXml).join('')}</detalles>`

  const infoAdicional = Array.isArray(input.infoAdicional) && input.infoAdicional.length > 0
    ? '<infoAdicional>' + input.infoAdicional.map(campo => {
        requireField(campo.nombre, 'infoAdicional[].nombre')
        requireField(campo.valor, 'infoAdicional[].valor')
        return `<campoAdicional nombre="${escapeXml(campo.nombre)}">${escapeXml(campo.valor)}</campoAdicional>`
      }).join('') + '</infoAdicional>'
    : ''

  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    `<factura id="comprobante" version="${FACTURA_XML_VERSION}">` +
    infoTributaria +
    infoFactura +
    detalles +
    infoAdicional +
    '</factura>'
  )
}
