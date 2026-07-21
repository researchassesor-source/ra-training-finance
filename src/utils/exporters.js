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
    ? 'CONTRATO DE PRESTACIÓN DE SERVICIOS DE CAPACITACIÓN'
    : 'CONTRATO DE PROVISIÓN DE SERVICIOS'

  const fechaDoc = fmt.date(contrato.FechaCreacion || new Date())

  // Header
  doc.setFillColor(...BRAND_COLOR)
  doc.rect(0, 0, 210, 30, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(15)
  doc.setFont('helvetica', 'bold')
  doc.text('R.A. TRAINING', 105, 12, { align: 'center' })
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text('Empresa de Capacitación y Formación Profesional', 105, 19, { align: 'center' })
  doc.text('contacto@ratraining.com', 105, 25, { align: 'center' })

  doc.setTextColor(30, 30, 30)
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text(titulo, 105, 44, { align: 'center' })

  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(80, 80, 80)
  doc.text(`Número de Contrato: ${contrato.ID}`, 14, 52)
  doc.text(`Ciudad y Fecha: ${fechaDoc}`, 196, 52, { align: 'right' })

  doc.setDrawColor(...BRAND_COLOR)
  doc.setLineWidth(0.8)
  doc.line(14, 55, 196, 55)
  doc.setLineWidth(0.3)
  doc.line(14, 56.5, 196, 56.5)

  let y = 64
  doc.setTextColor(20, 20, 20)

  const W = 182

  function paragraph(text, indent = 14) {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(30, 30, 30)
    const lines = doc.splitTextToSize(text, W - (indent - 14))
    if (y + lines.length * 5 > 272) { doc.addPage(); y = 20 }
    doc.text(lines, indent, y)
    y += lines.length * 5 + 2
  }

  function clausulaTitle(text) {
    y += 3
    if (y > 268) { doc.addPage(); y = 20 }
    doc.setFontSize(9.5)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...BRAND_COLOR)
    doc.text(text, 14, y)
    doc.setTextColor(30, 30, 30)
    y += 6
  }

  // COMPARECIENTES
  clausulaTitle('COMPARECIENTES')
  paragraph(
    `En la ciudad de Quito, República del Ecuador, a ${fechaDoc}, comparecen a la celebración del presente contrato, por una parte, R.A. TRAINING, empresa dedicada a la capacitación y formación profesional, debidamente constituida y en pleno ejercicio de sus actividades, a quien en adelante se denominará "LA EMPRESA"; y, por otra parte, ${contrato.Nombre}, a quien en adelante se denominará "${esCliente ? 'EL CLIENTE' : 'EL PROVEEDOR'}". Las partes comparecientes declaran ser mayores de edad, hábiles para contratar y obligarse, y libre y voluntariamente convienen en celebrar el presente contrato, al tenor de las siguientes cláusulas:`
  )

  // CLÁUSULA PRIMERA
  clausulaTitle('CLÁUSULA PRIMERA — OBJETO DEL CONTRATO')
  paragraph(
    `LA EMPRESA se obliga a prestar a ${esCliente ? 'EL CLIENTE' : 'EL PROVEEDOR'} los siguientes servicios: ${contrato.Concepto || 'Servicios de capacitación y formación profesional conforme a lo acordado entre las partes.'}. La prestación de los servicios se llevará a cabo de conformidad con los términos y condiciones establecidos en el presente instrumento y sus anexos.`
  )

  // CLÁUSULA SEGUNDA
  clausulaTitle('CLÁUSULA SEGUNDA — VIGENCIA')
  paragraph(
    `El presente contrato tendrá una vigencia comprendida entre el ${fmt.date(contrato.FechaInicio) || 'la fecha de suscripción'} y el ${fmt.date(contrato.FechaFin) || 'término acordado entre las partes'}. Concluido dicho plazo, el contrato podrá renovarse mediante acuerdo expreso y escrito entre las partes, suscrito con no menos de quince (15) días de anticipación a la fecha de vencimiento.`
  )

  // CLÁUSULA TERCERA
  clausulaTitle('CLÁUSULA TERCERA — VALOR Y FORMA DE PAGO')
  paragraph(
    `Las partes acuerdan que el valor total del presente contrato asciende a la suma de ${fmt.usd(contrato.ValorTotal)} (${contrato.ValorTotal ? 'dólares de los Estados Unidos de América' : 'monto a convenir'}). La forma de pago, periodicidad y condiciones específicas serán las acordadas por las partes en el respectivo anexo financiero que forma parte integrante de este instrumento. El incumplimiento en los pagos facultará a LA EMPRESA para suspender la prestación de los servicios hasta que la obligación sea regularizada.`
  )

  // CLÁUSULA CUARTA
  clausulaTitle('CLÁUSULA CUARTA — OBLIGACIONES DE LA EMPRESA')
  paragraph('LA EMPRESA se compromete a:')
  paragraph('a) Prestar los servicios contratados con la calidad, oportunidad y profesionalismo que la naturaleza de los mismos requiere.', 19)
  paragraph('b) Mantener informada a la contraparte sobre el avance y desarrollo de los servicios acordados.', 19)
  paragraph('c) Resguardar la confidencialidad de la información que le sea proporcionada con motivo de la ejecución del presente contrato.', 19)
  paragraph('d) Designar el personal idóneo para la ejecución de los servicios contratados.', 19)

  // CLÁUSULA QUINTA
  clausulaTitle(`CLÁUSULA QUINTA — OBLIGACIONES DE ${esCliente ? 'EL CLIENTE' : 'EL PROVEEDOR'}`)
  paragraph(`${esCliente ? 'EL CLIENTE' : 'EL PROVEEDOR'} se compromete a:`)
  paragraph('a) Cancelar oportunamente los valores acordados en la Cláusula Tercera del presente instrumento.', 19)
  paragraph('b) Proporcionar a LA EMPRESA la información y documentación necesaria para el cabal cumplimiento de los servicios contratados.', 19)
  paragraph('c) Comunicar a LA EMPRESA con la debida antelación cualquier inconveniente que pudiera afectar el normal desarrollo de las actividades contratadas.', 19)

  // CLÁUSULA SEXTA
  clausulaTitle('CLÁUSULA SEXTA — CONFIDENCIALIDAD')
  paragraph(
    'Las partes se obligan mutuamente a guardar absoluta reserva y confidencialidad respecto de la información que, con motivo de la ejecución del presente contrato, llegue a su conocimiento. Esta obligación de confidencialidad subsistirá incluso después de la terminación del presente contrato por el plazo de dos (2) años.'
  )

  // CLÁUSULA SÉPTIMA
  clausulaTitle('CLÁUSULA SÉPTIMA — MODIFICACIONES Y TERMINACIÓN')
  paragraph(
    'Toda modificación al presente contrato deberá constar por escrito y ser suscrita por ambas partes. Cualquiera de ellas podrá darlo por terminado anticipadamente mediante notificación escrita con un mínimo de quince (15) días de anticipación. En caso de incumplimiento grave de las obligaciones por cualquiera de las partes, la parte afectada podrá resolver el contrato de manera inmediata, reservándose el derecho de reclamar los daños y perjuicios a que hubiere lugar.'
  )

  // CLÁUSULA OCTAVA
  clausulaTitle('CLÁUSULA OCTAVA — RESOLUCIÓN DE CONTROVERSIAS')
  paragraph(
    'Las partes acuerdan que cualquier divergencia, controversia o reclamación que surja de la interpretación, ejecución o terminación del presente contrato será resuelta, en primera instancia, mediante negociación directa y de buena fe entre las partes. De no alcanzarse acuerdo en el plazo de quince (15) días desde la comunicación del conflicto, las partes se someterán a los mecanismos de mediación disponibles en los centros de mediación autorizados por el Consejo de la Judicatura, conforme a la legislación ecuatoriana vigente.'
  )

  if (contrato.Notas) {
    clausulaTitle('CLÁUSULA ADICIONAL — DISPOSICIONES ESPECIALES')
    paragraph(contrato.Notas)
  }

  // CLÁUSULA FINAL
  clausulaTitle('CLÁUSULA FINAL — ACEPTACIÓN')
  paragraph(
    'Las partes declaran haber leído íntegramente el presente contrato, estar de acuerdo con su contenido y suscribirlo libre y voluntariamente, en señal de aceptación y conformidad con todos y cada uno de sus términos y condiciones. En fe de lo cual, firman el presente instrumento en la ciudad y fecha indicadas en el encabezamiento.'
  )

  // Firma
  y = Math.max(y + 12, 240)
  if (y > 255) { doc.addPage(); y = 30 }

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(30, 30, 30)
  doc.setDrawColor(80, 80, 80)
  doc.setLineWidth(0.3)

  doc.line(14, y, 92, y)
  doc.line(118, y, 196, y)
  y += 5
  doc.setFont('helvetica', 'bold')
  doc.text('R.A. TRAINING', 53, y, { align: 'center' })
  doc.text(contrato.Nombre.toUpperCase(), 157, y, { align: 'center' })
  y += 4
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100, 100, 100)
  doc.setFontSize(8)
  doc.text('Representante Legal / Firma y Sello', 53, y, { align: 'center' })
  doc.text(esCliente ? 'Firma del Cliente / Representante' : 'Firma del Proveedor', 157, y, { align: 'center' })
  y += 5
  doc.text('C.I. / RUC: _______________________', 53, y, { align: 'center' })
  doc.text('C.I. / RUC: _______________________', 157, y, { align: 'center' })
  y += 5
  doc.text('Fecha: _______ / _______ / _______', 53, y, { align: 'center' })
  doc.text('Fecha: _______ / _______ / _______', 157, y, { align: 'center' })

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

export function exportConvenioPDF(convenio) {
  const doc = new jsPDF()
  const fecha = fmt.date(convenio.FechaCreacion || new Date())

  // Header
  doc.setFillColor(...BRAND_COLOR)
  doc.rect(0, 0, 210, 30, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(15)
  doc.setFont('helvetica', 'bold')
  doc.text('R.A. TRAINING', 105, 12, { align: 'center' })
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text('Empresa de Capacitación y Formación Profesional', 105, 19, { align: 'center' })
  doc.text('contacto@ratraining.com', 105, 25, { align: 'center' })

  doc.setTextColor(30, 30, 30)
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.text('CONVENIO DE COOPERACIÓN Y ALIANZA ESTRATÉGICA', 105, 44, { align: 'center' })

  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(80, 80, 80)
  doc.text(`Número: ${convenio.ID}`, 14, 52)
  doc.text(`Fecha de suscripción: ${fecha}`, 196, 52, { align: 'right' })

  doc.setDrawColor(...BRAND_COLOR)
  doc.setLineWidth(0.8)
  doc.line(14, 55, 196, 55)
  doc.setLineWidth(0.3)
  doc.line(14, 56.5, 196, 56.5)

  let y = 64
  const W = 182

  function clausulaTitle(text) {
    y += 3
    if (y > 265) { doc.addPage(); y = 20 }
    doc.setFontSize(9.5)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...BRAND_COLOR)
    doc.text(text, 14, y)
    doc.setTextColor(30, 30, 30)
    y += 6
  }

  function paragraph(text, indent = 14) {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(30, 30, 30)
    const lines = doc.splitTextToSize(text, W - (indent - 14))
    if (y + lines.length * 5 > 272) { doc.addPage(); y = 20 }
    doc.text(lines, indent, y)
    y += lines.length * 5 + 2
  }

  // COMPARECIENTES
  clausulaTitle('COMPARECIENTES')
  paragraph(
    `En la ciudad de Quito, República del Ecuador, a ${fecha}, comparecen a la celebración del presente Convenio de Cooperación y Alianza Estratégica, por una parte, R.A. TRAINING, empresa de capacitación y formación profesional, debidamente constituida, representada para este acto por su representante legal, a quien en adelante se denominará "R.A. TRAINING"; y, por otra parte, ${convenio.Organizacion || '—'}, representada por ${convenio.Representante || '—'}${convenio.Cargo ? `, en calidad de ${convenio.Cargo}` : ''}, a quien en adelante se denominará "EL ALIADO ESTRATÉGICO". Las partes, de común acuerdo, convienen en celebrar el presente instrumento al tenor de las siguientes cláusulas:`
  )

  // CLÁUSULA PRIMERA
  clausulaTitle('CLÁUSULA PRIMERA — OBJETO DEL CONVENIO')
  paragraph(
    convenio.Objeto ||
    'El presente Convenio tiene por objeto establecer un marco de cooperación y colaboración mutua entre R.A. TRAINING y EL ALIADO ESTRATÉGICO, orientado al desarrollo conjunto de actividades de capacitación, formación profesional, intercambio de conocimientos y fortalecimiento institucional de ambas organizaciones.'
  )

  // CLÁUSULA SEGUNDA
  clausulaTitle('CLÁUSULA SEGUNDA — COMPROMISOS DE R.A. TRAINING')
  if (convenio.ObligacionesRA) {
    const items = convenio.ObligacionesRA.split('\n').filter(Boolean)
    if (items.length > 1) {
      items.forEach((item, idx) => paragraph(`${String.fromCharCode(97 + idx)}) ${item.trim()}`, 19))
    } else {
      paragraph(convenio.ObligacionesRA)
    }
  } else {
    paragraph('a) Poner a disposición su infraestructura académica y recursos pedagógicos para el desarrollo de las actividades conjuntas acordadas.', 19)
    paragraph('b) Otorgar condiciones preferenciales en la prestación de sus servicios de capacitación a los miembros o colaboradores de EL ALIADO ESTRATÉGICO.', 19)
    paragraph('c) Emitir los certificados, constancias y documentos habilitantes derivados de las actividades realizadas en el marco del presente Convenio.', 19)
    paragraph('d) Mantener comunicación permanente con EL ALIADO ESTRATÉGICO para asegurar el cumplimiento de los compromisos asumidos.', 19)
  }

  // CLÁUSULA TERCERA
  clausulaTitle('CLÁUSULA TERCERA — COMPROMISOS DE EL ALIADO ESTRATÉGICO')
  if (convenio.ObligacionesAliado) {
    const items = convenio.ObligacionesAliado.split('\n').filter(Boolean)
    if (items.length > 1) {
      items.forEach((item, idx) => paragraph(`${String.fromCharCode(97 + idx)}) ${item.trim()}`, 19))
    } else {
      paragraph(convenio.ObligacionesAliado)
    }
  } else {
    paragraph('a) Difundir y promover los servicios y programas de R.A. TRAINING entre su comunidad, colaboradores y redes de contacto.', 19)
    paragraph('b) Designar un enlace institucional responsable de la coordinación y seguimiento de las actividades contempladas en el presente Convenio.', 19)
    paragraph('c) Facilitar los espacios, recursos o información que sean requeridos para el adecuado cumplimiento de los compromisos mutuamente acordados.', 19)
    paragraph('d) Informar oportunamente a R.A. TRAINING sobre cualquier circunstancia que pudiera afectar el desarrollo de las actividades conjuntas.', 19)
  }

  // CLÁUSULA CUARTA — VIGENCIA
  clausulaTitle('CLÁUSULA CUARTA — VIGENCIA')
  const inicio = convenio.FechaInicio ? fmt.date(convenio.FechaInicio) : 'la fecha de suscripción'
  const fin    = convenio.FechaFin    ? fmt.date(convenio.FechaFin)    : 'el término acordado'
  const vigencia = convenio.Vigencia  ? ` (${convenio.Vigencia})` : ''
  paragraph(
    `El presente Convenio entrará en vigor a partir de ${inicio} y tendrá una vigencia hasta ${fin}${vigencia}. Concluido dicho plazo, podrá renovarse mediante acuerdo expreso y escrito entre las partes, suscrito con no menos de treinta (30) días de anticipación a su vencimiento. Cualquiera de las partes podrá dar por terminado el presente instrumento en forma anticipada, mediante comunicación escrita dirigida a la otra parte con al menos treinta (30) días de antelación.`
  )

  // CLÁUSULA QUINTA — CONFIDENCIALIDAD
  clausulaTitle('CLÁUSULA QUINTA — CONFIDENCIALIDAD Y PROPIEDAD INTELECTUAL')
  paragraph(
    'Las partes acuerdan guardar absoluta reserva sobre la información confidencial, datos estratégicos, metodologías y materiales pedagógicos que lleguen a su conocimiento con motivo de la ejecución del presente Convenio. Esta obligación se extenderá por un período de dos (2) años contados desde la terminación del presente instrumento, por cualquier causa que fuere. Los materiales, contenidos y herramientas desarrollados conjuntamente en el marco de este Convenio serán de propiedad compartida, salvo acuerdo expreso en contrario suscrito por las partes.'
  )

  // CLÁUSULA SEXTA — NATURALEZA NO COMERCIAL
  clausulaTitle('CLÁUSULA SEXTA — NATURALEZA DEL CONVENIO')
  paragraph(
    'El presente Convenio es de naturaleza institucional y de cooperación mutua. No genera relación de dependencia, sociedad, ni obligación económica directa entre las partes, salvo que expresamente se establezca en un acuerdo complementario debidamente suscrito. Las actividades o proyectos específicos que impliquen compromisos económicos deberán formalizarse mediante acuerdos adicionales que constituirán anexos al presente instrumento.'
  )

  // CLÁUSULA SÉPTIMA — RESOLUCIÓN DE CONFLICTOS
  clausulaTitle('CLÁUSULA SÉPTIMA — RESOLUCIÓN DE CONFLICTOS')
  paragraph(
    'Las partes se comprometen a resolver cualquier desacuerdo o controversia derivada de la interpretación o cumplimiento del presente Convenio, en primera instancia, mediante diálogo y negociación directa de buena fe. De no alcanzarse acuerdo en el plazo de quince (15) días desde la notificación del conflicto, las partes acuerdan someterse a los mecanismos de mediación disponibles en los centros de mediación legalmente autorizados, conforme a la legislación ecuatoriana vigente.'
  )

  if (convenio.Notas) {
    clausulaTitle('DISPOSICIÓN ESPECIAL')
    paragraph(convenio.Notas)
  }

  // CLÁUSULA FINAL
  clausulaTitle('EN FE DE LO CUAL')
  paragraph(
    'Las partes declaran haber leído y comprendido íntegramente el contenido del presente Convenio de Cooperación y Alianza Estratégica, manifestando su plena conformidad y aceptación con todos sus términos, y lo suscriben en señal de acuerdo, en dos ejemplares de igual valor y tenor, en la ciudad y fecha antes indicadas.'
  )

  // Firmas
  y = Math.max(y + 12, 238)
  if (y > 255) { doc.addPage(); y = 30 }

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(30, 30, 30)
  doc.setDrawColor(80, 80, 80)
  doc.setLineWidth(0.3)

  doc.line(14, y, 92, y)
  doc.line(118, y, 196, y)
  y += 5
  doc.setFont('helvetica', 'bold')
  doc.text('R.A. TRAINING', 53, y, { align: 'center' })
  doc.text((convenio.Organizacion || 'EL ALIADO').toUpperCase(), 157, y, { align: 'center' })
  y += 4
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100, 100, 100)
  doc.setFontSize(8)
  doc.text('Representante Legal', 53, y, { align: 'center' })
  doc.text(`${convenio.Representante || 'Representante'}${convenio.Cargo ? ` / ${convenio.Cargo}` : ''}`, 157, y, { align: 'center' })
  y += 5
  doc.text('C.I. / RUC: _______________________', 53, y, { align: 'center' })
  doc.text('C.I. / RUC: _______________________', 157, y, { align: 'center' })
  y += 5
  doc.text('Fecha: _______ / _______ / _______', 53, y, { align: 'center' })
  doc.text('Fecha: _______ / _______ / _______', 157, y, { align: 'center' })

  addFooter(doc)
  doc.save(`convenio_${convenio.ID}_ra_training.pdf`)
}

export function exportInscripcionesCSV(data) {
  const headers = ['Nombre','Identificación','Email','Teléfono','Servicio','Modalidad','Fecha Inicio','Monto','Estado Pago','Estado Certificado']
  const rows = data.map(i => [
    i.ClienteNombre, i.ClienteID || '', i.ClienteEmail || '', i.ClienteTelefono || '',
    i.ServicioNombre, i.Modalidad, fmt.date(i.FechaInicio), Number(i.Monto).toFixed(2),
    i.EstadoPago, i.EstadoCertificado,
  ])
  const csv = [headers, ...rows]
    .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = 'inscripciones_certificados_ra_training.csv'; a.click()
  URL.revokeObjectURL(url)
}

export function exportInscripcionesPDF(data, filtroLabel = '') {
  const doc = new jsPDF('landscape')
  const y = addHeader(doc, 'Listado de Participantes', filtroLabel || 'Para emisión de certificados')

  const total = data.reduce((s, i) => s + (Number(i.Monto) || 0), 0)

  autoTable(doc, {
    startY: y,
    head: [['Nombre','ID / Cédula','Email','Teléfono','Servicio','Modalidad','Inicio','Monto','Pago','Certificado']],
    body: data.map(i => [
      i.ClienteNombre, i.ClienteID || '—', i.ClienteEmail || '—', i.ClienteTelefono || '—',
      i.ServicioNombre, i.Modalidad, fmt.date(i.FechaInicio),
      fmt.usd(i.Monto), i.EstadoPago, i.EstadoCertificado,
    ]),
    foot: [['', '', '', '', '', '', 'TOTAL', fmt.usd(total), '', '']],
    headStyles: { fillColor: BRAND_COLOR, fontSize: 7 },
    footStyles: { fillColor: [240, 240, 255], fontStyle: 'bold', fontSize: 8 },
    bodyStyles: { fontSize: 7 },
    alternateRowStyles: { fillColor: [248, 249, 255] },
    columnStyles: { 7: { halign: 'right' } },
  })

  addFooter(doc)
  doc.save('inscripciones_certificados_ra_training.pdf')
}

export function exportCertificadosAvalExcel(data) {
  const headers = ['Participante','Curso','Modalidad','Horas','Fecha Inicio','Fecha Fin','Estado de Aval','Código / Enlace de Aval','Valor del Aval']
  const rows = data.map(i => [
    i.ClienteNombre, i.ServicioNombre, i.Modalidad, i.Duracion || '',
    fmt.date(i.FechaInicio), i.FechaFin ? fmt.date(i.FechaFin) : '',
    i.EstadoAval === 'avalado' ? 'Avalado' : 'Pendiente',
    i.AvalReferencia || '', Number(i.ValorAval || 0).toFixed(2),
  ])
  const csv = [headers, ...rows]
    .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n')
  // BOM al inicio para que Excel detecte UTF-8 y no rompa tildes/ñ
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = 'certificados_aval_externo_ra_training.csv'; a.click()
  URL.revokeObjectURL(url)
}

export function exportCertificadosAvalPDF(data, filtroLabel = '') {
  const doc = new jsPDF('landscape')
  const y = addHeader(doc, 'Certificados con Aval Externo', filtroLabel || 'Para pago de factura de aval')

  const total = data.reduce((s, i) => s + (Number(i.ValorAval) || 0), 0)

  autoTable(doc, {
    startY: y,
    head: [['Participante','Curso','Modalidad','Horas','Fecha Inicio','Fecha Fin','Estado','Código / Enlace','Valor Aval']],
    body: data.map(i => [
      i.ClienteNombre, i.ServicioNombre, i.Modalidad, i.Duracion || '—',
      fmt.date(i.FechaInicio), i.FechaFin ? fmt.date(i.FechaFin) : '—',
      i.EstadoAval === 'avalado' ? 'Avalado' : 'Pendiente',
      i.AvalReferencia || '—', fmt.usd(i.ValorAval),
    ]),
    foot: [['', '', '', '', '', '', '', 'TOTAL', fmt.usd(total)]],
    headStyles: { fillColor: BRAND_COLOR, fontSize: 8 },
    footStyles: { fillColor: [240, 240, 255], fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 8 },
    alternateRowStyles: { fillColor: [248, 249, 255] },
    columnStyles: { 8: { halign: 'right' } },
  })

  addFooter(doc)
  doc.save('certificados_aval_externo_ra_training.pdf')
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
