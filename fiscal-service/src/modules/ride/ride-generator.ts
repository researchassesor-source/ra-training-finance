import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import PDFDocument from 'pdfkit'
import { paymentCatalog } from '../../domain/schemas.js'
import type { FiscalDocument, IssuerConfig } from '../../domain/types.js'

const amount = (value: string): string => `$${Number(value).toFixed(2)}`
const number = (document: FiscalDocument): string => `${document.establishmentCode}-${document.emissionPointCode}-${document.sequential ?? 'PENDIENTE'}`
const paymentLabel = (code: string): string => paymentCatalog.find((item) => item.code === code)?.label ?? code

export class LocalRideGenerator {
  constructor(private readonly logoPath?: string) {}

  async generate(document: FiscalDocument, issuer: IssuerConfig): Promise<Buffer> {
    return new Promise<Buffer>((resolveBuffer, reject) => {
      const pdf = new PDFDocument({ size: 'A4', margin: 36, bufferPages: true, info: {
        Title: `RIDE local ${number(document)}`,
        Author: 'R.A. Training - módulo fiscal local',
        Subject: 'Documento simulado sin validez tributaria',
        Keywords: 'RIDE local simulación SRI',
        CreationDate: new Date('2026-07-24T12:00:00.000Z'),
      } })
      const chunks: Buffer[] = []
      pdf.on('data', (chunk: Buffer) => chunks.push(chunk))
      pdf.on('end', () => resolveBuffer(Buffer.concat(chunks)))
      pdf.on('error', reject)

      const configuredLogo = this.logoPath ?? resolve(process.cwd(), '../src/assets/certificate/ra-training-logo.png')
      const pageHeader = () => {
        pdf.save().rotate(-31, { origin: [297, 420] }).fillColor('#dc2626').opacity(0.075).font('Helvetica-Bold').fontSize(42)
          .text('AMBIENTE LOCAL\nSIN VALIDEZ TRIBUTARIA', 38, 350, { width: 660, align: 'center' }).restore().opacity(1)
        pdf.roundedRect(36, 30, 523, 112, 8).lineWidth(1.2).strokeColor('#123a69').stroke()
        if (existsSync(configuredLogo)) pdf.image(configuredLogo, 48, 42, { fit: [76, 52] })
        const issuerX = existsSync(configuredLogo) ? 132 : 48
        pdf.fillColor('#123a69').font('Helvetica-Bold').fontSize(13).text(issuer.tradeName || issuer.businessName, issuerX, 44, { width: 240 })
        pdf.font('Helvetica').fontSize(7.5).fillColor('#334155')
        pdf.text(issuer.businessName, issuerX, 62, { width: 240 })
        pdf.text(`RUC: ${issuer.rucPlaceholder}`, issuerX, 76, { width: 240 })
        pdf.text(`Matriz: ${issuer.headOfficeAddress}`, issuerX, 89, { width: 240, height: 28 })
        if (issuer.phone || issuer.email) pdf.text([issuer.phone, issuer.email].filter(Boolean).join(' · '), issuerX, 119, { width: 240 })
        pdf.roundedRect(380, 40, 164, 90, 6).fillAndStroke('#fff7ed', '#f97316')
        pdf.fillColor('#9a3412').font('Helvetica-Bold').fontSize(11).text(document.documentType === 'INVOICE' ? 'FACTURA' : 'NOTA DE CRÉDITO', 390, 49, { width: 144, align: 'center' })
        pdf.fontSize(9).text(number(document), 390, 68, { width: 144, align: 'center' })
        pdf.font('Helvetica').fontSize(7).fillColor('#7c2d12').text('AMBIENTE LOCAL', 390, 87, { width: 144, align: 'center' })
        pdf.font('Helvetica-Bold').text('NO CONECTADO AL SRI', 390, 101, { width: 144, align: 'center' })
        pdf.font('Courier').fontSize(5.8).fillColor('#334155').text(document.accessKey ?? 'CLAVE PENDIENTE', 389, 115, { width: 146, align: 'center' })
        pdf.x = 36; pdf.y = 154
      }
      const ensureSpace = (height = 44, continued?: string) => {
        if (pdf.y + height > 790) { pdf.addPage(); pageHeader(); if (continued) section(`${continued} (continuación)`) }
      }
      const section = (title: string) => {
        ensureSpace(28)
        const y = pdf.y
        pdf.roundedRect(36, y, 523, 20, 3).fill('#e8eef7')
        pdf.fillColor('#123a69').font('Helvetica-Bold').fontSize(8.5).text(title, 44, y + 6, { width: 505 })
        pdf.y = y + 27
      }
      const row = (label: string, value: string) => {
        ensureSpace(20)
        const y = pdf.y
        const labelHeight = pdf.heightOfString(label, { width: 135 })
        const valueHeight = pdf.heightOfString(value || 'PENDIENTE', { width: 365 })
        pdf.fillColor('#475569').font('Helvetica-Bold').fontSize(7.6).text(label, 44, y, { width: 135 })
        pdf.fillColor('#0f172a').font('Helvetica').text(value || 'PENDIENTE', 180, y, { width: 365 })
        pdf.y = y + Math.max(14, labelHeight + 3, valueHeight + 3)
      }

      pageHeader()
      section('INFORMACIÓN DEL COMPROBANTE')
      row('Estado', `${document.sriStatus ?? document.status} - SIMULADO`)
      row('Fecha de emisión', document.issueDate)
      row('Clave de acceso', document.accessKey ?? 'PENDIENTE')
      row('Autorización', document.authorizationNumber ?? 'PENDIENTE - SIMULADOR LOCAL')
      row('Fecha autorización', document.authorizationDate ?? 'PENDIENTE')
      row('Establecimiento / punto', `${document.establishmentCode} / ${document.emissionPointCode}`)

      section('ADQUIRENTE')
      row('Razón social / nombres', document.customer.legalName)
      row('Identificación', `${document.customer.identificationType} - ${document.customer.identification}`)
      row('Dirección', document.customer.address)
      row('Teléfono / correo', [document.customer.phone, document.customer.email].filter(Boolean).join(' · '))
      if (document.participantName && document.participantName !== document.customer.legalName) row('Participante', document.participantName)

      if (document.creditNoteReference) {
        section('DOCUMENTO MODIFICADO')
        row('Factura original', document.creditNoteReference.originalDocumentNumber)
        row('Fecha original', document.creditNoteReference.originalIssueDate)
        row('Motivo', document.creditNoteReference.reason)
        row('Valor de modificación', amount(document.creditNoteReference.modifiedValue))
      }

      section('DETALLES')
      const drawTableHeader = () => {
        const y = pdf.y
        pdf.rect(36, y, 523, 20).fill('#123a69')
        pdf.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7)
        pdf.text('Código', 42, y + 6, { width: 60 }); pdf.text('Descripción', 104, y + 6, { width: 212 })
        pdf.text('Cant.', 319, y + 6, { width: 42, align: 'right' }); pdf.text('P. unit.', 365, y + 6, { width: 60, align: 'right' })
        pdf.text('Desc.', 429, y + 6, { width: 52, align: 'right' }); pdf.text('Total', 485, y + 6, { width: 68, align: 'right' })
        pdf.y = y + 24
      }
      drawTableHeader()
      for (const item of document.items) {
        const descriptionHeight = pdf.heightOfString(item.description, { width: 212 })
        const height = Math.max(24, descriptionHeight + 9)
        if (pdf.y + height > 785) { pdf.addPage(); pageHeader(); section('DETALLES (continuación)'); drawTableHeader() }
        const y = pdf.y
        pdf.fillColor('#334155').font('Helvetica').fontSize(7.2)
        pdf.text(item.mainCode, 42, y + 3, { width: 60 }); pdf.text(item.description, 104, y + 3, { width: 212 })
        pdf.text(item.quantity, 319, y + 3, { width: 42, align: 'right' }); pdf.text(amount(item.unitPrice), 365, y + 3, { width: 60, align: 'right' })
        pdf.text(amount(item.discount), 429, y + 3, { width: 52, align: 'right' }); pdf.text(amount(item.subtotal), 485, y + 3, { width: 68, align: 'right' })
        pdf.moveTo(36, y + height).lineTo(559, y + height).strokeColor('#e2e8f0').stroke(); pdf.y = y + height + 2
      }

      section('IMPUESTOS Y TOTALES')
      for (const tax of document.taxes.filter((item) => Number(item.taxableBase) || Number(item.taxValue))) {
        row(`IVA ${Number(tax.rate).toFixed(2)} %`, `Base ${amount(tax.taxableBase)} · Impuesto ${amount(tax.taxValue)}`)
      }
      const totals: Array<[string, string]> = [
        ['Subtotal sin impuestos', document.subtotal], ['Total descuento', document.totalDiscount],
        ['Total sin impuestos', document.totalWithoutTaxes], ['Total impuestos', document.totalTaxes],
      ]
      if (Number(document.tip ?? 0)) totals.push(['Propina', document.tip as string])
      let totalsY = pdf.y
      for (const [label, value] of totals) {
        ensureSpace(18); totalsY = pdf.y
        pdf.fillColor('#475569').font('Helvetica').fontSize(8.2).text(label, 330, totalsY, { width: 140, align: 'right' })
        pdf.text(amount(value), 474, totalsY, { width: 80, align: 'right' }); pdf.y = totalsY + 14
      }
      ensureSpace(26); totalsY = pdf.y
      pdf.roundedRect(326, totalsY, 233, 24, 3).fill('#123a69')
      pdf.fillColor('#ffffff').font('Helvetica-Bold').fontSize(10).text('VALOR TOTAL', 336, totalsY + 7, { width: 132, align: 'right' })
      pdf.text(amount(document.grandTotal), 476, totalsY + 7, { width: 73, align: 'right' }); pdf.y = totalsY + 31

      if (document.payments.length) {
        section('FORMAS DE PAGO')
        for (const payment of document.payments) {
          const term = payment.term !== undefined ? ` · plazo ${payment.term} ${payment.timeUnit ?? ''}` : ''
          row(`${payment.methodCode} - ${paymentLabel(payment.methodCode)}`, `${amount(payment.amount)}${term}`)
        }
      }
      if (document.additionalFields?.length) {
        section('INFORMACIÓN ADICIONAL')
        for (const field of document.additionalFields) row(field.name, field.value)
      }
      section('ADVERTENCIA')
      pdf.fillColor('#991b1b').font('Helvetica-Bold').fontSize(8.5).text('DOCUMENTO FICTICIO. SIN VALIDEZ TRIBUTARIA. NO CONECTADO AL SRI.', 44, pdf.y, { width: 505, align: 'center' })
      pdf.moveDown(0.5).fillColor('#475569').font('Helvetica').fontSize(7.3).text('Generado únicamente para validación local de software. La firma, recepción y autorización mostradas no representan una operación oficial.', 44, pdf.y, { width: 505, align: 'center' })

      const range = pdf.bufferedPageRange()
      for (let index = 0; index < range.count; index += 1) {
        pdf.switchToPage(index)
        const previousBottomMargin = pdf.page.margins.bottom
        pdf.page.margins.bottom = 0
        const footerY = pdf.page.height - 22
        pdf.fillColor('#64748b').font('Helvetica').fontSize(6.5).text(
          `Página ${index + 1} de ${range.count} · RIDE LOCAL`,
          36,
          footerY,
          { width: 523, align: 'center', lineBreak: false },
        )
        pdf.page.margins.bottom = previousBottomMargin
      }
      pdf.end()
    })
  }
}
