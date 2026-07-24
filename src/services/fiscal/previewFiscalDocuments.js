const money = (value) => Number(value || 0).toFixed(2)

export function escapePreviewXml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

const tag = (name, value) => `<${name}>${escapePreviewXml(value)}</${name}>`

function documentDetails(document) {
  return document.items.map((item) => [
    '<detalle>', tag('codigoPrincipal', item.mainCode), item.auxiliaryCode ? tag('codigoAuxiliar', item.auxiliaryCode) : '',
    tag('descripcion', item.description), tag('cantidad', item.quantity), tag('precioUnitario', money(item.unitPrice)),
    tag('descuento', money(item.discount)), tag('precioTotalSinImpuesto', money(item.subtotal)),
    '<impuestos>', '<impuesto>', tag('codigo', item.taxCode || '2'), tag('codigoPorcentaje', item.percentageCode || '0'),
    tag('tarifa', money(item.rate)), tag('baseImponible', money(item.subtotal)), tag('valor', money(item.taxValue)),
    '</impuesto>', '</impuestos>', '</detalle>',
  ].join('')).join('')
}

function paymentDetails(document) {
  return (document.payments || []).map((payment) => [
    '<pago>', tag('formaPago', payment.methodCode), tag('total', money(payment.amount)),
    payment.term !== undefined ? tag('plazo', payment.term) : '', payment.timeUnit ? tag('unidadTiempo', payment.timeUnit) : '', '</pago>',
  ].join('')).join('')
}

export function buildPreviewXml(document, config) {
  const isCredit = document.documentType === 'CREDIT_NOTE'
  const root = isCredit ? 'notaCredito' : 'factura'
  const reference = isCredit && document.creditNoteReference ? [
    tag('codDocModificado', '01'),
    tag('numDocModificado', document.creditNoteReference.originalDocumentNumber),
    tag('fechaEmisionDocSustento', document.creditNoteReference.originalIssueDate),
    tag('motivo', document.creditNoteReference.reason),
    tag('valorModificacion', money(document.creditNoteReference.modifiedValue)),
  ].join('') : ''

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<${root} id="comprobante" version="preview-demo">`,
    tag('advertencia', 'DEMOSTRACIÓN DE PREVIEW SIN VALIDEZ TRIBUTARIA'),
    '<infoTributaria>', tag('ambiente', 'PREVIEW'), tag('tipoEmision', 'SIMULADA'),
    tag('razonSocial', config.issuer.businessName), tag('nombreComercial', config.issuer.tradeName),
    tag('ruc', config.issuer.rucPlaceholder), tag('claveAcceso', document.accessKey || 'PENDIENTE'),
    tag('codDoc', isCredit ? '04' : '01'), tag('estab', document.establishmentCode),
    tag('ptoEmi', document.emissionPointCode), tag('secuencial', document.sequential || 'PENDIENTE'),
    tag('dirMatriz', config.issuer.headOfficeAddress), '</infoTributaria>',
    `<${isCredit ? 'infoNotaCredito' : 'infoFactura'}>`, tag('fechaEmision', document.issueDate),
    tag('dirEstablecimiento', config.issuer.establishmentAddress), tag('tipoIdentificacionComprador', document.customer.identificationType),
    tag('razonSocialComprador', document.customer.legalName), tag('identificacionComprador', document.customer.identification),
    tag('totalSinImpuestos', money(document.totalWithoutTaxes)), tag('totalDescuento', money(document.totalDiscount)),
    tag(isCredit ? 'valorModificacion' : 'importeTotal', money(document.grandTotal)), reference,
    isCredit ? '' : `<pagos>${paymentDetails(document)}</pagos>`, `</${isCredit ? 'infoNotaCredito' : 'infoFactura'}>`,
    `<detalles>${documentDetails(document)}</detalles>`,
    '<infoAdicional>', tag('campoAdicional', 'Estructura de demostración basada en el flujo local validado.'),
    tag('conexionSRI', 'NO CONECTADO AL SRI'), '</infoAdicional>', `</${root}>`,
  ].join('')
}

function documentFilename(document, extension) {
  const prefix = document.documentType === 'CREDIT_NOTE' ? 'nota-credito-preview' : 'factura-preview'
  return `${prefix}-${document.establishmentCode}-${document.emissionPointCode}-${document.sequential || 'pendiente'}.${extension}`
}

export async function buildPreviewRide(document, config) {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const title = document.documentType === 'CREDIT_NOTE' ? 'NOTA DE CRÉDITO' : 'FACTURA'
  const number = `${document.establishmentCode}-${document.emissionPointCode}-${document.sequential || 'PENDIENTE'}`
  let y = 18

  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(17); pdf.setTextColor(49, 46, 129); pdf.text(title, 15, y)
  pdf.setFontSize(10); pdf.setTextColor(180, 83, 9); pdf.text('ENTORNO DE PREVISUALIZACIÓN · SIN VALIDEZ TRIBUTARIA', 15, y + 7)
  pdf.text('NO CONECTADO AL SRI', 15, y + 13)
  y += 25
  pdf.setTextColor(30, 41, 59); pdf.setFont('helvetica', 'bold'); pdf.text(config.issuer.businessName, 15, y)
  pdf.setFont('helvetica', 'normal'); pdf.text(config.issuer.tradeName, 15, y + 6); pdf.text(config.issuer.headOfficeAddress, 15, y + 12)
  pdf.setFont('helvetica', 'bold'); pdf.text(`N.º ${number}`, 140, y, { align: 'left' }); pdf.setFont('helvetica', 'normal'); pdf.text(`Emisión: ${document.issueDate}`, 140, y + 6)
  y += 25
  pdf.setFillColor(238, 242, 255); pdf.roundedRect(15, y, 180, 27, 2, 2, 'F')
  pdf.setFont('helvetica', 'bold'); pdf.text('Adquirente', 20, y + 7); pdf.setFont('helvetica', 'normal')
  pdf.text(document.customer.legalName, 20, y + 14); pdf.text(`Identificación: ${document.customer.identification}`, 20, y + 20)
  if (document.creditNoteReference) pdf.text(`Factura modificada: ${document.creditNoteReference.originalDocumentNumber}`, 110, y + 14)
  y += 36
  pdf.setFont('helvetica', 'bold'); pdf.text('Código', 15, y); pdf.text('Descripción', 45, y); pdf.text('Cant.', 135, y); pdf.text('Precio', 153, y); pdf.text('Subtotal', 176, y)
  y += 6; pdf.setFont('helvetica', 'normal')
  for (const item of document.items) {
    const lines = pdf.splitTextToSize(item.description, 82)
    pdf.text(item.mainCode, 15, y); pdf.text(lines, 45, y); pdf.text(String(item.quantity), 142, y, { align: 'right' })
    pdf.text(money(item.unitPrice), 170, y, { align: 'right' }); pdf.text(money(item.subtotal), 195, y, { align: 'right' })
    y += Math.max(7, lines.length * 5)
  }
  y += 4; pdf.line(120, y, 195, y); y += 7
  pdf.text(`Sin impuestos: $${money(document.totalWithoutTaxes)}`, 195, y, { align: 'right' }); y += 6
  pdf.text(`Impuestos: $${money(document.totalTaxes)}`, 195, y, { align: 'right' }); y += 7
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(12); pdf.text(`TOTAL: $${money(document.grandTotal)}`, 195, y, { align: 'right' })
  y += 12; pdf.setFontSize(9); pdf.setFont('helvetica', 'normal')
  if (document.payments?.length) pdf.text(`Formas de pago: ${document.payments.map((item) => `${item.methodDescription || item.methodCode} $${money(item.amount)}`).join(' · ')}`, 15, y, { maxWidth: 180 })
  if (document.creditNoteReference) pdf.text(`Motivo: ${document.creditNoteReference.reason}`, 15, y + 8, { maxWidth: 180 })
  pdf.setTextColor(153, 27, 27); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9)
  pdf.text('DOCUMENTO DE DEMOSTRACIÓN. SIN VALIDEZ TRIBUTARIA.', 105, 285, { align: 'center' })
  return new Uint8Array(pdf.output('arraybuffer'))
}

export async function createPreviewArtifact(document, kind, config) {
  if (kind === 'xml') {
    const text = document.authorizedXmlText || document.xmlSignedText || document.xmlUnsignedText || buildPreviewXml(document, config)
    return { blob: new Blob([text], { type: 'application/xml;charset=utf-8' }), filename: documentFilename(document, 'xml'), text }
  }
  if (kind === 'ride') {
    const bytes = await buildPreviewRide(document, config)
    return { blob: new Blob([bytes], { type: 'application/pdf' }), filename: documentFilename(document, 'pdf'), bytes }
  }
  throw new Error('Tipo de descarga de demostración no permitido')
}
