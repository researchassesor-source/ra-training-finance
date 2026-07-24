import { Decimal } from 'decimal.js'
import { documentCode } from '../../domain/access-key.js'
import type { FiscalDocument, FiscalTaxLine, IssuerConfig } from '../../domain/types.js'

export const escapeXml = (value: string): string => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;')

const dateXml = (iso: string): string => {
  const [year, month, day] = iso.split('-')
  if (!year || !month || !day) throw new Error('Fecha ISO inválida')
  return `${day}/${month}/${year}`
}

const groupTaxes = (lines: FiscalTaxLine[]): FiscalTaxLine[] => {
  const grouped = new Map<string, FiscalTaxLine>()
  for (const line of lines) {
    const key = `${line.taxCode}:${line.percentageCode}:${line.rate}`
    const current = grouped.get(key)
    if (!current) {
      grouped.set(key, {
        id: line.id,
        documentId: line.documentId,
        taxCode: line.taxCode,
        percentageCode: line.percentageCode,
        rate: line.rate,
        taxableBase: line.taxableBase,
        taxValue: line.taxValue,
      })
    }
    else grouped.set(key, {
      ...current,
      taxableBase: new Decimal(current.taxableBase).plus(line.taxableBase).toFixed(2),
      taxValue: new Decimal(current.taxValue).plus(line.taxValue).toFixed(2),
    })
  }
  return [...grouped.values()]
}

const infoTributaria = (document: FiscalDocument, issuer: IssuerConfig): string => {
  if (!document.accessKey || !document.sequential) throw new Error('El documento aún no tiene numeración fiscal')
  return [
    '<infoTributaria>',
    `<ambiente>${document.environment}</ambiente>`,
    '<tipoEmision>1</tipoEmision>',
    `<razonSocial>${escapeXml(issuer.businessName)}</razonSocial>`,
    `<nombreComercial>${escapeXml(issuer.tradeName)}</nombreComercial>`,
    `<ruc>${issuer.rucPlaceholder}</ruc>`,
    `<claveAcceso>${document.accessKey}</claveAcceso>`,
    `<codDoc>${documentCode(document.documentType)}</codDoc>`,
    `<estab>${document.establishmentCode}</estab>`,
    `<ptoEmi>${document.emissionPointCode}</ptoEmi>`,
    `<secuencial>${document.sequential}</secuencial>`,
    `<dirMatriz>${escapeXml(issuer.headOfficeAddress)}</dirMatriz>`,
    '</infoTributaria>',
  ].join('')
}

const totalsXml = (taxes: FiscalTaxLine[], includeRate: boolean): string => groupTaxes(taxes).map((tax) => [
  '<totalImpuesto>',
  `<codigo>${tax.taxCode}</codigo>`,
  `<codigoPorcentaje>${tax.percentageCode}</codigoPorcentaje>`,
  `<baseImponible>${tax.taxableBase}</baseImponible>`,
  includeRate ? `<tarifa>${tax.rate}</tarifa>` : '',
  `<valor>${tax.taxValue}</valor>`,
  '</totalImpuesto>',
].join('')).join('')

const detailsXml = (document: FiscalDocument, creditNote: boolean): string => document.items.map((item) => {
  const tax = document.taxes.find((line) => line.itemId === item.id)
  if (!tax) throw new Error('Detalle sin impuesto relacionado')
  return [
    '<detalle>',
    `<${creditNote ? 'codigoInterno' : 'codigoPrincipal'}>${escapeXml(item.mainCode)}</${creditNote ? 'codigoInterno' : 'codigoPrincipal'}>`,
    item.auxiliaryCode ? `<${creditNote ? 'codigoAdicional' : 'codigoAuxiliar'}>${escapeXml(item.auxiliaryCode)}</${creditNote ? 'codigoAdicional' : 'codigoAuxiliar'}>` : '',
    `<descripcion>${escapeXml(item.description)}</descripcion>`,
    `<cantidad>${item.quantity}</cantidad>`,
    `<precioUnitario>${item.unitPrice}</precioUnitario>`,
    `<descuento>${item.discount}</descuento>`,
    `<precioTotalSinImpuesto>${item.subtotal}</precioTotalSinImpuesto>`,
    '<impuestos><impuesto>',
    `<codigo>${tax.taxCode}</codigo>`,
    `<codigoPorcentaje>${tax.percentageCode}</codigoPorcentaje>`,
    `<tarifa>${tax.rate}</tarifa>`,
    `<baseImponible>${tax.taxableBase}</baseImponible>`,
    `<valor>${tax.taxValue}</valor>`,
    '</impuesto></impuestos>',
    '</detalle>',
  ].join('')
}).join('')

const paymentsXml = (document: FiscalDocument): string => document.payments.map((payment) => [
  '<pago>',
  `<formaPago>${payment.methodCode}</formaPago>`,
  `<total>${payment.amount}</total>`,
  payment.term !== undefined ? `<plazo>${payment.term}</plazo>` : '',
  payment.timeUnit ? `<unidadTiempo>${escapeXml(payment.timeUnit)}</unidadTiempo>` : '',
  '</pago>',
].join('')).join('')

const additionalInfoXml = (document: FiscalDocument): string => {
  const fields = [
    { name: 'Correo', value: document.customer.email },
    ...(document.participantName ? [{ name: 'Participante', value: document.participantName }] : []),
    ...(document.additionalFields ?? []).filter((field) => field.name.toLowerCase() !== 'correo'),
    { name: 'Entorno', value: 'DEMOSTRACION LOCAL SIN VALIDEZ TRIBUTARIA' },
  ]
  return fields.map((field) => `<campoAdicional nombre="${escapeXml(field.name)}">${escapeXml(field.value)}</campoAdicional>`).join('')
}

export class InvoiceXmlBuilder {
  build(document: FiscalDocument, issuer: IssuerConfig): string {
    if (document.documentType !== 'INVOICE') throw new Error('InvoiceXmlBuilder solo admite facturas')
    if (!document.payments.length) throw new Error('La factura requiere forma de pago')
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<factura id="comprobante" version="1.1.0">',
      infoTributaria(document, issuer),
      '<infoFactura>',
      `<fechaEmision>${dateXml(document.issueDate)}</fechaEmision>`,
      `<dirEstablecimiento>${escapeXml(issuer.establishmentAddress ?? issuer.headOfficeAddress)}</dirEstablecimiento>`,
      document.remissionGuide ? `<guiaRemision>${escapeXml(document.remissionGuide)}</guiaRemision>` : '',
      `<obligadoContabilidad>${issuer.accountingObligation}</obligadoContabilidad>`,
      `<tipoIdentificacionComprador>${document.customer.identificationType}</tipoIdentificacionComprador>`,
      `<razonSocialComprador>${escapeXml(document.customer.legalName)}</razonSocialComprador>`,
      `<identificacionComprador>${escapeXml(document.customer.identification)}</identificacionComprador>`,
      `<direccionComprador>${escapeXml(document.customer.address)}</direccionComprador>`,
      `<totalSinImpuestos>${document.totalWithoutTaxes}</totalSinImpuestos>`,
      `<totalDescuento>${document.totalDiscount}</totalDescuento>`,
      `<totalConImpuestos>${totalsXml(document.taxes, true)}</totalConImpuestos>`,
      `<propina>${document.tip ?? '0.00'}</propina>`,
      `<importeTotal>${document.grandTotal}</importeTotal>`,
      '<moneda>DOLAR</moneda>',
      `<pagos>${paymentsXml(document)}</pagos>`,
      '</infoFactura>',
      `<detalles>${detailsXml(document, false)}</detalles>`,
      `<infoAdicional>${additionalInfoXml(document)}</infoAdicional>`,
      '</factura>',
    ].join('')
  }
}

export class CreditNoteXmlBuilder {
  build(document: FiscalDocument, issuer: IssuerConfig): string {
    if (document.documentType !== 'CREDIT_NOTE' || !document.creditNoteReference) {
      throw new Error('CreditNoteXmlBuilder requiere una nota de crédito relacionada')
    }
    const ref = document.creditNoteReference
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<notaCredito id="comprobante" version="1.1.0">',
      infoTributaria(document, issuer),
      '<infoNotaCredito>',
      `<fechaEmision>${dateXml(document.issueDate)}</fechaEmision>`,
      `<dirEstablecimiento>${escapeXml(issuer.establishmentAddress ?? issuer.headOfficeAddress)}</dirEstablecimiento>`,
      `<tipoIdentificacionComprador>${document.customer.identificationType}</tipoIdentificacionComprador>`,
      `<razonSocialComprador>${escapeXml(document.customer.legalName)}</razonSocialComprador>`,
      `<identificacionComprador>${escapeXml(document.customer.identification)}</identificacionComprador>`,
      `<obligadoContabilidad>${issuer.accountingObligation}</obligadoContabilidad>`,
      '<codDocModificado>01</codDocModificado>',
      `<numDocModificado>${ref.originalDocumentNumber}</numDocModificado>`,
      `<fechaEmisionDocSustento>${dateXml(ref.originalIssueDate)}</fechaEmisionDocSustento>`,
      `<totalSinImpuestos>${document.totalWithoutTaxes}</totalSinImpuestos>`,
      `<valorModificacion>${ref.modifiedValue}</valorModificacion>`,
      '<moneda>DOLAR</moneda>',
      `<totalConImpuestos>${totalsXml(document.taxes, false)}</totalConImpuestos>`,
      `<motivo>${escapeXml(ref.reason)}</motivo>`,
      '</infoNotaCredito>',
      `<detalles>${detailsXml(document, true)}</detalles>`,
      `<infoAdicional>${additionalInfoXml(document)}</infoAdicional>`,
      '</notaCredito>',
    ].join('')
  }
}
