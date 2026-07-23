import PDFDocument from 'pdfkit'
import type { FiscalDocument, IssuerConfig } from '../../domain/types.js'

const amount = (value: string): string => `$${Number(value).toFixed(2)}`
const number = (document: FiscalDocument): string =>
  `${document.establishmentCode}-${document.emissionPointCode}-${document.sequential ?? 'PENDIENTE'}`

export class LocalRideGenerator {
  async generate(document: FiscalDocument, issuer: IssuerConfig): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const pdf = new PDFDocument({ size: 'A4', margin: 40, info: {
        Title: `RIDE local ${number(document)}`,
        Author: 'R.A. Training - módulo fiscal local',
        Subject: 'Documento simulado sin validez tributaria',
        Keywords: 'RIDE local simulación SRI',
        CreationDate: new Date('2026-07-23T15:30:00.000Z'),
      } })
      const chunks: Buffer[] = []
      pdf.on('data', (chunk: Buffer) => chunks.push(chunk))
      pdf.on('end', () => resolve(Buffer.concat(chunks)))
      pdf.on('error', reject)

      const watermark = () => {
        pdf.save()
        pdf.rotate(-32, { origin: [297, 420] })
        pdf.fillColor('#dc2626').opacity(0.08).fontSize(46).font('Helvetica-Bold')
          .text('AMBIENTE LOCAL\nSIN VALIDEZ TRIBUTARIA', 60, 350, { width: 620, align: 'center' })
        pdf.restore().opacity(1)
      }
      const header = () => {
        watermark()
        pdf.roundedRect(40, 35, 515, 88, 8).lineWidth(1.5).strokeColor('#0b2f5b').stroke()
        pdf.roundedRect(380, 45, 160, 66, 6).fillAndStroke('#fff7ed', '#f97316')
        pdf.fillColor('#9a3412').font('Helvetica-Bold').fontSize(11)
          .text(document.documentType === 'INVOICE' ? 'FACTURA' : 'NOTA DE CRÉDITO', 390, 56, { width: 140, align: 'center' })
        pdf.fontSize(9).text(number(document), 390, 76, { width: 140, align: 'center' })
        pdf.fontSize(7.5).text('NO CONECTADO AL SRI', 390, 94, { width: 140, align: 'center' })
        pdf.fillColor('#0b2f5b').font('Helvetica-Bold').fontSize(15).text(issuer.businessName, 52, 48, { width: 315, height: 36 })
        pdf.font('Helvetica').fontSize(8.5).fillColor('#334155')
        pdf.text(`RUC FICTICIO: ${issuer.rucPlaceholder}`, 52, 87, { width: 310 })
        pdf.text(issuer.headOfficeAddress, 52, 101, { width: 310 })
        pdf.x = 40
        pdf.y = 138
      }
      const section = (title: string) => {
        if (pdf.y > 730) { pdf.addPage(); header() }
        pdf.x = 40
        pdf.moveDown(0.4).fillColor('#0b2f5b').font('Helvetica-Bold').fontSize(10).text(title, 40, pdf.y, { width: 515 })
        pdf.moveTo(40, pdf.y + 2).lineTo(555, pdf.y + 2).strokeColor('#cbd5e1').stroke()
        pdf.moveDown(0.6)
      }
      const row = (label: string, value: string) => {
        if (pdf.y > 760) { pdf.addPage(); header() }
        const y = pdf.y
        pdf.fillColor('#475569').font('Helvetica-Bold').fontSize(8.5).text(label, 45, y, { width: 135 })
        pdf.fillColor('#0f172a').font('Helvetica').text(value, 180, y, { width: 365 })
        pdf.y = Math.max(pdf.y, y + 14)
      }

      header()
      section('INFORMACIÓN DEL COMPROBANTE SIMULADO')
      row('Estado', `${document.sriStatus ?? document.status} - SIMULADO`)
      row('Fecha de emisión', document.issueDate)
      row('Clave de acceso', document.accessKey ?? 'Pendiente')
      row('Autorización', document.authorizationNumber ?? 'Pendiente - simulador local')
      row('Fecha autorización', document.authorizationDate ?? 'Pendiente')

      section('CLIENTE FICTICIO')
      row('Razón social', document.customer.legalName)
      row('Identificación', document.customer.identification)
      row('Dirección', document.customer.address)
      row('Correo', document.customer.email)

      section('DETALLES')
      const tableTop = pdf.y
      pdf.fillColor('#e2e8f0').rect(40, tableTop, 515, 20).fill()
      pdf.fillColor('#0f172a').font('Helvetica-Bold').fontSize(7.5)
      pdf.text('Código', 45, tableTop + 6, { width: 58 })
      pdf.text('Descripción', 105, tableTop + 6, { width: 230 })
      pdf.text('Cant.', 340, tableTop + 6, { width: 42, align: 'right' })
      pdf.text('P. unit.', 386, tableTop + 6, { width: 70, align: 'right' })
      pdf.text('Total', 461, tableTop + 6, { width: 88, align: 'right' })
      pdf.y = tableTop + 26
      for (const item of document.items) {
        if (pdf.y > 735) { pdf.addPage(); header(); section('DETALLES (continuación)') }
        const y = pdf.y
        const descriptionHeight = pdf.heightOfString(item.description, { width: 230 })
        const height = Math.max(20, descriptionHeight + 7)
        pdf.fillColor('#334155').font('Helvetica').fontSize(7.5)
        pdf.text(item.mainCode, 45, y + 3, { width: 58 })
        pdf.text(item.description, 105, y + 3, { width: 230 })
        pdf.text(item.quantity, 340, y + 3, { width: 42, align: 'right' })
        pdf.text(amount(item.unitPrice), 386, y + 3, { width: 70, align: 'right' })
        pdf.text(amount(item.subtotal), 461, y + 3, { width: 88, align: 'right' })
        pdf.moveTo(40, y + height).lineTo(555, y + height).strokeColor('#e2e8f0').stroke()
        pdf.y = y + height + 3
      }

      section('TOTALES')
      const totals: Array<[string, string]> = [
        ['Subtotal bruto', document.subtotal],
        ['Descuentos', document.totalDiscount],
        ['Total sin impuestos', document.totalWithoutTaxes],
        ['Impuestos', document.totalTaxes],
        ['TOTAL', document.grandTotal],
      ]
      let totalsY = pdf.y
      for (const [label, value] of totals) {
        const isGrandTotal = label === 'TOTAL'
        pdf.fillColor(isGrandTotal ? '#0b2f5b' : '#475569').font(isGrandTotal ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(isGrandTotal ? 11 : 9).text(label, 330, totalsY, { width: 130, align: 'right' })
        pdf.text(amount(value), 465, totalsY, { width: 85, align: 'right' })
        totalsY += isGrandTotal ? 18 : 14
      }
      pdf.x = 40
      pdf.y = totalsY

      section('PAGO Y ADVERTENCIAS')
      row('Forma de pago', document.payments[0]?.methodCode ?? 'No aplica')
      row('Validez', 'DOCUMENTO FICTICIO. SIN VALIDEZ TRIBUTARIA. NO CONECTADO AL SRI.')
      if (document.creditNoteReference) row('Documento modificado', document.creditNoteReference.originalDocumentNumber)
      pdf.moveDown(0.8).fillColor('#991b1b').font('Helvetica-Bold').fontSize(9)
        .text('Generado únicamente para una prueba de concepto local. No constituye un comprobante electrónico autorizado.', { align: 'center' })
      pdf.end()
    })
  }
}
