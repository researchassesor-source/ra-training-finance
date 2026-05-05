import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, HeadingLevel, AlignmentType, WidthType, BorderStyle } from 'docx'
import { saveAs } from 'file-saver'
import { fmt, MESES } from './formatters'

const BRAND_COLOR = [55, 48, 163] // brand-800

function addHeader(doc, title, subtitle) {
  doc.setFillColor(...BRAND_COLOR)
  doc.rect(0, 0, 210, 22, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('R.A. Training', 14, 10)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text('Sistema de Gestión Financiera', 14, 16)
  doc.setTextColor(30, 30, 30)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text(title, 14, 34)
  if (subtitle) {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100, 100, 100)
    doc.text(subtitle, 14, 41)
  }
  doc.setTextColor(30, 30, 30)
  return subtitle ? 48 : 42
}

function addFooter(doc) {
  const pages = doc.internal.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(150, 150, 150)
    doc.text(`Generado el ${fmt.datetime(new Date())}`, 14, 290)
    doc.text(`Página ${i} de ${pages}`, 196, 290, { align: 'right' })
  }
}

export function exportIngresosPDF(data, filtros = {}) {
  const doc = new jsPDF()
  const y = addHeader(doc, 'Reporte de Ingresos', `Período: ${filtros.label || 'General'}`)

  const total = data.reduce((s, i) => s + (Number(i.Monto) || 0), 0)

  autoTable(doc, {
    startY: y,
    head: [['Fecha', 'Tipo', 'Concepto', 'Cliente', 'Modalidad', 'Método', 'Estado', 'Monto']],
    body: data.map(i => [
      fmt.date(i.Fecha), i.Tipo, i.Concepto, i.Cliente || '—',
      i.Modalidad || '—', i.MetodoPago || '—', i.Estado,
      fmt.usd(i.Monto),
    ]),
    foot: [['', '', '', '', '', '', 'TOTAL', fmt.usd(total)]],
    headStyles: { fillColor: BRAND_COLOR, fontSize: 8 },
    footStyles: { fillColor: [240, 240, 255], fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 8 },
    alternateRowStyles: { fillColor: [248, 249, 255] },
    columnStyles: { 7: { halign: 'right' } },
  })

  addFooter(doc)
  doc.save('ingresos_ra_training.pdf')
}

export function exportEgresosPDF(data, filtros = {}) {
  const doc = new jsPDF()
  const y = addHeader(doc, 'Reporte de Egresos', `Período: ${filtros.label || 'General'}`)

  const total = data.reduce((s, e) => s + (Number(e.Monto) || 0), 0)

  autoTable(doc, {
    startY: y,
    head: [['Fecha', 'Categoría', 'Concepto', 'Proveedor', 'Estado', 'Aprobado por', 'Monto']],
    body: data.map(e => [
      fmt.date(e.Fecha), e.Categoria, e.Concepto, e.Proveedor || '—',
      e.Estado, e.AprobadoPor || '—', fmt.usd(e.Monto),
    ]),
    foot: [['', '', '', '', '', 'TOTAL', fmt.usd(total)]],
    headStyles: { fillColor: BRAND_COLOR, fontSize: 8 },
    footStyles: { fillColor: [255, 248, 240], fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 8 },
    alternateRowStyles: { fillColor: [255, 252, 248] },
    columnStyles: { 6: { halign: 'right' } },
  })

  addFooter(doc)
  doc.save('egresos_ra_training.pdf')
}

export function exportPagosPDF(data) {
  const doc = new jsPDF()
  const y = addHeader(doc, 'Reporte de Pagos')
  const total = data.reduce((s, p) => s + (Number(p.Monto) || 0), 0)

  autoTable(doc, {
    startY: y,
    head: [['Fecha', 'Tipo', 'Beneficiario', 'Concepto', 'Referencia', 'Método', 'Estado', 'Monto']],
    body: data.map(p => [
      fmt.date(p.Fecha), p.Tipo, p.Beneficiario, p.Concepto,
      p.Referencia || '—', p.MetodoPago, p.Estado, fmt.usd(p.Monto),
    ]),
    foot: [['', '', '', '', '', '', 'TOTAL', fmt.usd(total)]],
    headStyles: { fillColor: BRAND_COLOR, fontSize: 8 },
    footStyles: { fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 8 },
    columnStyles: { 7: { halign: 'right' } },
  })

  addFooter(doc)
  doc.save('pagos_ra_training.pdf')
}

export function exportContratosPDF(data) {
  const doc = new jsPDF()
  const y = addHeader(doc, 'Reporte de Contratos')

  autoTable(doc, {
    startY: y,
    head: [['Tipo', 'Nombre', 'Concepto', 'Valor Total', 'Inicio', 'Fin', 'Estado']],
    body: data.map(c => [
      c.Tipo, c.Nombre, c.Concepto, fmt.usd(c.ValorTotal),
      fmt.date(c.FechaInicio), fmt.date(c.FechaFin), c.Estado,
    ]),
    headStyles: { fillColor: BRAND_COLOR, fontSize: 8 },
    bodyStyles: { fontSize: 8 },
    columnStyles: { 3: { halign: 'right' } },
  })

  addFooter(doc)
  doc.save('contratos_ra_training.pdf')
}

export function exportResumenPDF({ kpis, ingresosXMes, egresosXMes, year }) {
  const doc = new jsPDF()
  const y = addHeader(doc, `Informe Financiero ${year}`, `Generado por R.A. Training Finance`)

  // KPIs summary box
  let cy = y + 5
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('Resumen Ejecutivo', 14, cy)
  cy += 7

  const kpiRows = [
    ['Total Ingresos', fmt.usd(kpis.totalIngresos)],
    ['Total Egresos', fmt.usd(kpis.totalEgresos)],
    ['Balance Neto', fmt.usd(kpis.balance)],
    ['Contratos Activos', String(kpis.contratosActivos)],
    ['Egresos Pendientes', String(kpis.egresosPendientes)],
    ['Ingreso Proyectado', fmt.usd(kpis.totalProyectado)],
  ]

  autoTable(doc, {
    startY: cy,
    body: kpiRows,
    theme: 'plain',
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 60 }, 1: { halign: 'right' } },
    bodyStyles: { fontSize: 10 },
  })

  cy = doc.lastAutoTable.finalY + 10

  // Monthly table
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('Detalle Mensual', 14, cy)
  cy += 5

  autoTable(doc, {
    startY: cy,
    head: [['Mes', 'Ingresos', 'Egresos', 'Balance']],
    body: MESES.map((m, i) => {
      const ing = ingresosXMes[i]?.total || 0
      const egr = egresosXMes[i]?.total || 0
      return [m, fmt.usd(ing), fmt.usd(egr), fmt.usd(ing - egr)]
    }),
    headStyles: { fillColor: BRAND_COLOR, fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
  })

  addFooter(doc)
  doc.save(`informe_financiero_${year}_ra_training.pdf`)
}

export async function exportResumenWord({ kpis, year, ingresos, egresos }) {
  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        new Paragraph({
          text: 'R.A. Training — Informe Financiero',
          heading: HeadingLevel.TITLE,
          alignment: AlignmentType.CENTER,
        }),
        new Paragraph({
          text: `Año ${year}`,
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 },
        }),
        new Paragraph({ text: 'Resumen Ejecutivo', heading: HeadingLevel.HEADING_1 }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            makeWordRow(['Indicador', 'Valor'], true),
            makeWordRow(['Total Ingresos', fmt.usd(kpis.totalIngresos)]),
            makeWordRow(['Total Egresos', fmt.usd(kpis.totalEgresos)]),
            makeWordRow(['Balance Neto', fmt.usd(kpis.balance)]),
            makeWordRow(['Contratos Activos', String(kpis.contratosActivos)]),
            makeWordRow(['Egresos Pendientes de Aprobación', String(kpis.egresosPendientes)]),
            makeWordRow(['Ingreso Proyectado (eventos futuros)', fmt.usd(kpis.totalProyectado)]),
          ],
        }),
        new Paragraph({ text: 'Detalle de Ingresos', heading: HeadingLevel.HEADING_1, spacing: { before: 400 } }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            makeWordRow(['Fecha', 'Tipo', 'Concepto', 'Cliente', 'Monto'], true),
            ...ingresos.map(i => makeWordRow([
              fmt.date(i.Fecha), i.Tipo, i.Concepto, i.Cliente || '—', fmt.usd(i.Monto),
            ])),
          ],
        }),
        new Paragraph({ text: 'Detalle de Egresos', heading: HeadingLevel.HEADING_1, spacing: { before: 400 } }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            makeWordRow(['Fecha', 'Categoría', 'Concepto', 'Estado', 'Monto'], true),
            ...egresos.map(e => makeWordRow([
              fmt.date(e.Fecha), e.Categoria, e.Concepto, e.Estado, fmt.usd(e.Monto),
            ])),
          ],
        }),
        new Paragraph({
          text: `Generado: ${fmt.datetime(new Date())}`,
          spacing: { before: 600 },
          alignment: AlignmentType.RIGHT,
        }),
      ],
    }],
  })

  const blob = await Packer.toBlob(doc)
  saveAs(blob, `informe_financiero_${year}_ra_training.docx`)
}

export function exportContratoPDF(contrato) {
  const doc = new jsPDF()
  const esCliente = contrato.Tipo === 'cliente'
  const titulo = esCliente
    ? 'CONTRATO DE PRESTACIÓN DE SERVICIOS'
    : 'CONTRATO CON PROVEEDOR DE SERVICIOS'

  // Header
  doc.setFillColor(...BRAND_COLOR)
  doc.rect(0, 0, 210, 28, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(15)
  doc.setFont('helvetica', 'bold')
  doc.text('R.A. TRAINING', 105, 11, { align: 'center' })
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text('Empresa de Capacitación y Formación Profesional', 105, 17, { align: 'center' })
  doc.setFontSize(8)
  doc.text('contacto@ratraining.com', 105, 23, { align: 'center' })

  // Title
  doc.setTextColor(30, 30, 30)
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.text(titulo, 105, 40, { align: 'center' })

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100, 100, 100)
  doc.text(`Contrato No. ${contrato.ID}`, 14, 48)
  doc.text(`Fecha: ${fmt.date(contrato.FechaCreacion || new Date())}`, 196, 48, { align: 'right' })

  // Divider
  doc.setDrawColor(...BRAND_COLOR)
  doc.setLineWidth(0.5)
  doc.line(14, 51, 196, 51)

  let y = 58
  doc.setTextColor(30, 30, 30)

  function section(title) {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...BRAND_COLOR)
    doc.text(title, 14, y)
    doc.setTextColor(30, 30, 30)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    y += 6
  }

  function line(text, indent = 14) {
    const lines = doc.splitTextToSize(text, 196 - indent)
    doc.text(lines, indent, y)
    y += lines.length * 5 + 1
  }

  // PARTES
  section('PRIMERA PARTE (CONTRATANTE):')
  line('R.A. Training — Empresa de Capacitación y Formación Profesional')
  line('En adelante denominada "R.A. TRAINING"')
  y += 3

  section(`SEGUNDA PARTE (${esCliente ? 'CONTRATADO / CLIENTE' : 'PROVEEDOR'}):`)
  line(`Nombre / Razón Social: ${contrato.Nombre}`)
  line(`En adelante denominado "${esCliente ? 'EL CLIENTE' : 'EL PROVEEDOR'}"`)
  y += 3

  section('OBJETO DEL CONTRATO:')
  line(contrato.Concepto || '—')
  y += 3

  section('VALOR Y CONDICIONES ECONÓMICAS:')
  line(`Valor Total del Contrato: ${fmt.usd(contrato.ValorTotal)} (Dólares Americanos)`)
  line('Forma de pago: Según acuerdo entre las partes detallado en anexo.')
  y += 3

  section('VIGENCIA:')
  line(`Fecha de Inicio: ${fmt.date(contrato.FechaInicio) || 'Por definir'}`)
  line(`Fecha de Finalización: ${fmt.date(contrato.FechaFin) || 'Por definir'}`)
  y += 3

  section('CLÁUSULAS GENERALES:')
  const clausulas = [
    '1. Las partes se comprometen a cumplir con las obligaciones establecidas en el presente contrato de buena fe.',
    '2. Cualquier modificación al presente contrato deberá realizarse mediante acuerdo escrito firmado por ambas partes.',
    '3. En caso de incumplimiento, la parte afectada podrá solicitar la resolución del contrato con previo aviso de 15 días.',
    '4. Las controversias que surjan del presente contrato serán resueltas mediante acuerdo amigable o mediación.',
    '5. El presente contrato se rige por las leyes vigentes de la República.',
  ]
  clausulas.forEach(c => { line(c, 16); y += 1 })

  if (contrato.Notas) {
    y += 2
    section('NOTAS ADICIONALES:')
    line(contrato.Notas)
  }

  // Signature block
  y = Math.max(y + 15, 230)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setDrawColor(100, 100, 100)
  doc.setLineWidth(0.3)

  doc.line(14, y, 90, y)
  doc.line(120, y, 196, y)
  y += 5
  doc.text('R.A. TRAINING', 52, y, { align: 'center' })
  doc.text(contrato.Nombre.toUpperCase(), 158, y, { align: 'center' })
  y += 4
  doc.setTextColor(130, 130, 130)
  doc.text('Firma y Sello', 52, y, { align: 'center' })
  doc.text(esCliente ? 'Firma del Cliente' : 'Firma del Proveedor', 158, y, { align: 'center' })
  y += 10
  doc.text(`Fecha: _____ / _____ / _______`, 52, y, { align: 'center' })
  doc.text(`Fecha: _____ / _____ / _______`, 158, y, { align: 'center' })

  addFooter(doc)
  doc.save(`contrato_${contrato.ID}_ra_training.pdf`)
}

export function exportInscripcionPDF(ins) {
  const doc = new jsPDF()
  const y0  = addHeader(doc, 'Comprobante de Inscripción', `No. ${ins.ID}`)

  autoTable(doc, {
    startY: y0,
    body: [
      ['Servicio', ins.ServicioNombre],
      ['Modalidad', ins.Modalidad],
      ['Fecha de Inicio', fmt.date(ins.FechaInicio) || 'Por confirmar'],
      ['', ''],
      ['DATOS DEL PARTICIPANTE', ''],
      ['Nombre', ins.ClienteNombre],
      ['Identificación', ins.ClienteID || '—'],
      ['Email', ins.ClienteEmail || '—'],
      ['Teléfono', ins.ClienteTelefono || '—'],
      ['', ''],
      ['DATOS DE FACTURACIÓN', ''],
      ['Razón Social', ins.RazonSocial || ins.ClienteNombre],
      ['RUC / NIT', ins.RUC || ins.ClienteID || '—'],
      ['Dirección', ins.DireccionFactura || '—'],
      ['', ''],
      ['PAGO', ''],
      ['Monto', fmt.usd(ins.Monto)],
      ['Método de Pago', ins.MetodoPago || '—'],
      ['Estado de Pago', ins.EstadoPago],
      ['Estado del Certificado', ins.EstadoCertificado],
    ],
    theme: 'plain',
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 60 }, 1: {} },
    bodyStyles: { fontSize: 9 },
    didParseCell: (data) => {
      if (data.row.raw[0] && ['DATOS DEL PARTICIPANTE','DATOS DE FACTURACIÓN','PAGO'].includes(data.row.raw[0])) {
        data.cell.styles.fillColor = BRAND_COLOR
        data.cell.styles.textColor = [255,255,255]
        data.cell.styles.fontStyle = 'bold'
      }
    },
  })

  if (ins.Notas) {
    const finalY = doc.lastAutoTable.finalY + 8
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text('Notas:', 14, finalY)
    doc.setFont('helvetica', 'normal')
    doc.text(ins.Notas, 14, finalY + 5)
  }

  addFooter(doc)
  doc.save(`inscripcion_${ins.ID}_ra_training.pdf`)
}

function makeWordRow(cells, isHeader = false) {
  return new TableRow({
    tableHeader: isHeader,
    children: cells.map(text =>
      new TableCell({
        children: [new Paragraph({
          children: [new TextRun({ text: String(text), bold: isHeader, size: isHeader ? 20 : 18 })],
        })],
        shading: isHeader ? { fill: '3730A3', color: 'ffffff' } : undefined,
      })
    ),
  })
}
