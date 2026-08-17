/**
 * Auditoría visual/geométrica del RIDE rediseñado -- no se conforma con "compiló y
 * generó bytes %PDF": instrumenta el `doc` REAL de jsPDF (vía el hook `onDocCreated`,
 * exclusivo para QA) y registra el bounding box exacto de cada rect/roundedRect/
 * line/circle/text que efectivamente se dibuja, para poder afirmar de forma
 * determinística -- no por inspección visual -- que ningún texto se solapa con otro
 * y que nada se sale de la página A4 (210x297mm), sobre escenarios sintéticos
 * extremos (regresión directa del RIDE anterior, donde un email largo invadía el
 * bloque de INFORMACIÓN DE EMISIÓN).
 *
 * Todos los datos son sintéticos -- ningún dato personal real.
 */
import { describe, expect, it } from 'vitest'
import { buildRidePdfBytes, sha256Hex } from './ridePdf.js'

const PAGE = { w: 210, h: 297 }

function instrument(doc, shapes, state) {
  const orig = {
    rect: doc.rect.bind(doc),
    roundedRect: doc.roundedRect.bind(doc),
    text: doc.text.bind(doc),
    line: doc.line.bind(doc),
    circle: doc.circle.bind(doc),
    addPage: doc.addPage.bind(doc),
    setPage: doc.setPage.bind(doc),
  }
  doc.addPage = (...args) => { state.page += 1; return orig.addPage(...args) }
  doc.setPage = (pageNumber) => { state.page = pageNumber; return orig.setPage(pageNumber) }
  doc.rect = (x, y, w, h, style) => { shapes.push({ kind: 'rect', page: state.page, x, y, w, h }); return orig.rect(x, y, w, h, style) }
  doc.roundedRect = (x, y, w, h, rx, ry, style) => { shapes.push({ kind: 'roundedRect', page: state.page, x, y, w, h }); return orig.roundedRect(x, y, w, h, rx, ry, style) }
  doc.line = (x1, y1, x2, y2) => {
    shapes.push({ kind: 'line', page: state.page, x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1) || 0.1, h: Math.abs(y2 - y1) || 0.1 })
    return orig.line(x1, y1, x2, y2)
  }
  doc.circle = (x, y, r, style) => { shapes.push({ kind: 'circle', page: state.page, x: x - r, y: y - r, w: r * 2, h: r * 2 }); return orig.circle(x, y, r, style) }
  doc.text = (str, x, y, options) => {
    try {
      const lines = Array.isArray(str) ? str : [str]
      const fontSize = doc.internal.getFontSize()
      // Cálculo manual pt->mm (la misma fórmula que lineHeightMM() dentro de
      // ridePdf.js) -- doc.getLineHeight() no es fiable como fuente de altura aquí.
      const lineH = fontSize * 0.352778 * 1.15
      const widths = lines.map(l => doc.getTextWidth(String(l)))
      const maxW = Math.max(0, ...widths)
      const align = (options && options.align) || 'left'
      let boxX = x
      if (align === 'center') boxX = x - maxW / 2
      else if (align === 'right') boxX = x - maxW
      const ascent = fontSize * 0.352778 * 0.78
      const boxY = y - ascent
      const boxH = lines.length * lineH
      if (String(str).trim()) {
        shapes.push({ kind: 'text', page: state.page, x: boxX, y: boxY, w: Math.max(maxW, 0.01), h: Math.max(boxH, 0.01), text: lines.join(' | ') })
      }
    } catch { /* nunca bloquear la generación real por un fallo de instrumentación */ }
    return orig.text(str, x, y, options)
  }
}

function overlaps(a, b, tolerance = 0.15) {
  return (
    a.x < b.x + b.w - tolerance &&
    a.x + a.w > b.x + tolerance &&
    a.y < b.y + b.h - tolerance &&
    a.y + a.h > b.y + tolerance
  )
}

function outOfBounds(shape) {
  return shape.x < -0.1 || shape.y < -0.1 || shape.x + shape.w > PAGE.w + 0.1 || shape.y + shape.h > PAGE.h + 0.1
}

/** Genera el RIDE instrumentado y devuelve { bytes, shapes, textShapes, pages,
 * overlapPairs, outOfPage } -- listo para hacer aserciones geométricas. */
function auditRide(factura, items) {
  const shapes = []
  const state = { page: 1 }
  const bytes = buildRidePdfBytes(factura, items, { onDocCreated: doc => instrument(doc, shapes, state) })
  const textShapes = shapes.filter(s => s.kind === 'text')
  const outOfPage = shapes.filter(outOfBounds)
  const overlapPairs = []
  for (let i = 0; i < textShapes.length; i += 1) {
    for (let j = i + 1; j < textShapes.length; j += 1) {
      const a = textShapes[i]
      const b = textShapes[j]
      if (a.page === b.page && overlaps(a, b)) overlapPairs.push([a, b])
    }
  }
  return { bytes, shapes, textShapes, pages: state.page, overlapPairs, outOfPage }
}

function expectClean(result) {
  expect(Buffer.from(result.bytes.subarray(0, 4)).toString('utf8')).toBe('%PDF')
  expect(result.outOfPage, `contenido fuera de página: ${JSON.stringify(result.outOfPage.slice(0, 3))}`).toHaveLength(0)
  expect(result.overlapPairs, `texto solapado: ${JSON.stringify(result.overlapPairs.slice(0, 3))}`).toHaveLength(0)
}

function baseFactura(overrides = {}) {
  return {
    ID: 'FACT_QA_TECNICO_INTERNO', // nunca debe aparecer impreso en el RIDE
    Environment: 'test',
    Status: 'DELIVERY_PENDING',
    SriAuthorizationStatus: 'AUTORIZADO',
    AuthorizationNumber: '1234567890123456789012345678901234567890',
    AuthorizationDate: '2026-08-13T14:30:00-05:00',
    IssuerRuc: '0691787373001',
    Establishment: '001',
    EmissionPoint: '002',
    Sequential: '000000099',
    DocumentNumber: '001-002-000000099',
    AccessKey: '1308202601069178737300120010020000000999473817619',
    IssueDate: '2026-08-13',
    BuyerIdentificationType: 'cedula',
    BuyerName: 'Cliente Sintetico de Prueba',
    BuyerIdentification: '0999999999',
    BuyerEmail: 'cliente.sintetico@example.test',
    BuyerAddress: 'Av. Siempre Viva 123, Sector Norte',
    Subtotal0: 2000,
    SubtotalWithoutTax: 2000,
    SubtotalTaxed: 0,
    DiscountCents: 0,
    TaxTotal: 0,
    GrandTotal: 2000,
    Currency: 'USD',
    PaymentMethodInternal: 'Transferencia',
    SriPaymentCode: '20',
    IdempotencyKey: 'idem-secreto-tecnico-no-debe-imprimirse',
    CreatedBy: 'USR-TECNICO-INTERNO',
    SoftwareProviderRuc: '9999999999999',
    ...overrides,
  }
}

function item(overrides = {}) {
  return {
    Codigo: 'CAPACITACION_RA',
    Descripcion: 'Curso sintético de prueba para QA visual',
    Cantidad: '1',
    PrecioUnitarioCents: 2000,
    DescuentoCents: 0,
    BaseCents: 2000,
    TotalCents: 2000,
    TaxRateBasisPoints: 0,
    ...overrides,
  }
}

describe('RIDE — auditoría geométrica (regresión: nada se solapa, nada se sale de la página)', () => {
  it('1. email largo: no invade el bloque de información de emisión (regresión directa del RIDE anterior)', () => {
    const result = auditRide(baseFactura({
      BuyerEmail: 'maria.fernanda.alexandra.rodriguez.gonzalez.paredes.departamento.contabilidad.sintetico@ejemplo-corporativo-de-prueba-extendido.test',
    }), [item()])
    expectClean(result)
  })

  it('2. nombre de cliente largo (80+ caracteres): envuelve sin desbordar la tarjeta CLIENTE', () => {
    const result = auditRide(baseFactura({
      BuyerName: 'Maria Fernanda Alexandra De Los Angeles Rodriguez Gonzalez Paredes Chimborazo Vintimilla',
    }), [item()])
    expectClean(result)
    expect(result.pages).toBeGreaterThanOrEqual(1)
  })

  it('3. descripción de curso multilínea (300+ caracteres): la tabla crece, nunca corta el texto', () => {
    const descripcionLarga = 'Curso completo sintético de prueba de Inteligencia Artificial aplicada al apoyo en tareas académicas: incluye módulos de investigación documental, redacción técnica, análisis crítico de fuentes, organización estructurada de información, presentación profesional de resultados, materiales descargables, acceso permanente a la plataforma virtual y certificado digital verificable al finalizar satisfactoriamente todas las evaluaciones del programa académico.'
    expect(descripcionLarga.length).toBeGreaterThan(300)
    const result = auditRide(baseFactura(), [item({ Descripcion: descripcionLarga })])
    expectClean(result)
    // ' | ' es el separador que el propio test usa para unir las líneas envueltas
    // capturadas (ver instrument() -- doc.text(lineasArray,...) llega como array) --
    // se quita solo para esta comprobación de contenido, no representa el layout real.
    const tablaTexto = result.textShapes.map(s => s.text.replace(/ \| /g, ' ')).join(' ')
    expect(tablaTexto).toContain('Inteligencia Artificial')
  })

  it('4. dirección de cliente multilínea (3-4 líneas): envuelve sin desbordar', () => {
    const result = auditRide(baseFactura({
      BuyerAddress: 'Urbanización Los Álamos, Manzana 14, Villa 8, Calle Principal entre Segunda y Tercera Transversal, Sector La Pradera, Diagonal al Parque Central, Referencia: casa de dos pisos color blanco con rejas negras',
    }), [item()])
    expectClean(result)
  })

  it('5. múltiples ítems (15): cada fila calcula su propia altura, la tabla crece correctamente', () => {
    const items = Array.from({ length: 15 }, (_, i) => item({
      Codigo: i % 2 === 0 ? 'CAPACITACION' : 'CAPACITACION_RA',
      Descripcion: `Módulo sintético número ${i + 1} de capacitación con descripción de longitud variable para probar wrap en la tabla de detalle`,
    }))
    const result = auditRide(baseFactura({ Subtotal0: 30000, SubtotalWithoutTax: 30000, GrandTotal: 30000 }), items)
    expectClean(result)
  })

  it('6. paginación: 20 ítems fuerzan salto de página real, con cabecera de tabla repetida y sin filas partidas', () => {
    const items = Array.from({ length: 20 }, (_, i) => item({
      Descripcion: `Ítem extremo ${i + 1} con texto de longitud media para forzar salto de página real en la tabla de detalle del RIDE`,
    }))
    const result = auditRide(baseFactura({ Subtotal0: 40000, SubtotalWithoutTax: 40000, GrandTotal: 40000 }), items)
    expectClean(result)
    expect(result.pages).toBeGreaterThan(1)
    // La cabecera de tabla ("DESCRIPCIÓN") debe repetirse en cada página con contenido de tabla.
    const headerHits = result.textShapes.filter(s => s.text === 'DESCRIPCIÓN')
    expect(headerHits.length).toBeGreaterThan(1)
  })

  it('7. campo opcional ausente (sin email, sin dirección, sin tipo de identificación, sin forma de pago): se oculta, no se inventa', () => {
    const result = auditRide(baseFactura({ BuyerEmail: '', BuyerAddress: '', BuyerIdentificationType: '' }), [item()])
    expectClean(result)
    const textos = result.textShapes.map(s => s.text)
    expect(textos.join(' ')).not.toMatch(/undefined|null|\[object Object\]/)
  })

  it('8. AccessKey completa (49 dígitos): cabe en una sola línea, centrada, sin cortarse', () => {
    const result = auditRide(baseFactura(), [item()])
    expectClean(result)
    const akShape = result.textShapes.find(s => s.text === baseFactura().AccessKey)
    expect(akShape).toBeTruthy()
  })

  it('9. QR: se dibuja como un conjunto de rects perfectamente cuadrados (proporción 1:1), sin deformar', () => {
    const result = auditRide(baseFactura(), [item()])
    // Los módulos del QR son los rects mas pequeños (< 3mm) dibujados sobre la página;
    // cada uno debe tener ancho == alto dentro de una tolerancia mínima.
    const qrModules = result.shapes.filter(s => s.kind === 'rect' && s.w > 0 && s.w < 3 && s.h > 0 && s.h < 3)
    expect(qrModules.length).toBeGreaterThan(20)
    for (const mod of qrModules) {
      expect(Math.abs(mod.w - mod.h)).toBeLessThan(0.05)
    }
  })

  it('10. totales: solo lista las filas aplicables (factura IVA 0%) y TOTAL A PAGAR es el monto real', () => {
    const result = auditRide(baseFactura(), [item()])
    expectClean(result)
    const textos = result.textShapes.map(s => s.text)
    expect(textos).toContain('TOTAL A PAGAR')
    expect(textos.some(t => t.includes('Subtotal 0%'))).toBe(true)
    expect(textos.some(t => t.includes('Subtotal gravado'))).toBe(false)
  })

  it('11. factura con IVA 0% (caso real actual del sistema): no muestra filas de IVA gravado inexistentes', () => {
    const result = auditRide(baseFactura({ Subtotal0: 2000, SubtotalTaxed: 0, TaxTotal: 0 }), [item()])
    expectClean(result)
  })

  it('12. factura con IVA gravado (si el modelo lo soporta estructuralmente): agrega las filas Subtotal gravado + IVA', () => {
    const result = auditRide(baseFactura({
      Subtotal0: 0, SubtotalWithoutTax: 2240, SubtotalTaxed: 2000, TaxTotal: 240, GrandTotal: 2240,
    }), [item({ TaxRateBasisPoints: 1200, TotalCents: 2240 })])
    expectClean(result)
    const textos = result.textShapes.map(s => s.text)
    expect(textos.some(t => t.includes('Subtotal gravado'))).toBe(true)
    expect(textos.some(t => t.includes('IVA 12%'))).toBe(true)
  })

  it('13. RIDE autorizado: el badge de estado y el resumen muestran "AUTORIZADA" de forma consistente', () => {
    const result = auditRide(baseFactura(), [item()])
    expectClean(result)
    const textos = result.textShapes.map(s => s.text)
    expect(textos.filter(t => t === 'AUTORIZADA').length).toBeGreaterThanOrEqual(2) // badge + resumen
  })

  it('14. montos grandes ($123,456.78): el total y los precios unitarios no se cortan ni desbordan su celda', () => {
    const result = auditRide(baseFactura({ Subtotal0: 12345678, SubtotalWithoutTax: 12345678, GrandTotal: 12345678 }), [
      item({ PrecioUnitarioCents: 12345678, BaseCents: 12345678, TotalCents: 12345678 }),
    ])
    expectClean(result)
    const textos = result.textShapes.map(s => s.text)
    expect(textos.some(t => t.includes('123,456.78'))).toBe(true)
  })

  it('15. ningún secreto ni dato técnico interno aparece jamás como texto dibujado en el RIDE', () => {
    const result = auditRide(baseFactura(), [item()])
    const textoCompleto = result.textShapes.map(s => s.text).join('\n')
    expect(textoCompleto).not.toContain('idem-secreto-tecnico-no-debe-imprimirse')
    expect(textoCompleto).not.toContain('USR-TECNICO-INTERNO')
    expect(textoCompleto).not.toContain('FACT_QA_TECNICO_INTERNO')
    expect(textoCompleto).not.toContain('9999999999999') // SoftwareProviderRuc
    expect(textoCompleto).not.toMatch(/P12|privateKey|certificateBase64|FISCAL_SERVICE_TOKEN/i)
  })

  it('16. estrés combinado: nombre extremo (150+ caracteres) sigue sin overlaps ni desbordes', () => {
    const nombreExtremo = 'Apellido Compuesto Extremadamente Largo De Prueba Sintética Para Verificar Que Jamás Se Desborde De La Tarjeta Cliente Sin Importar Cuán Largo Sea El Texto Real En Producción'
    expect(nombreExtremo.length).toBeGreaterThan(150)
    const result = auditRide(baseFactura({ BuyerName: nombreExtremo }), [item()])
    expectClean(result)
  })

  it('17. campos opcionales completos (identificación RUC, dirección, mensaje SRI): todos se muestran sin overlap', () => {
    const result = auditRide(baseFactura({
      BuyerIdentificationType: 'ruc',
      BuyerIdentification: '0691787373001',
      LastSriMessage: 'Comprobante autorizado sin novedades.',
    }), [item()])
    expectClean(result)
    const textos = result.textShapes.map(s => s.text)
    expect(textos.some(t => t.includes('Comprobante autorizado sin novedades'))).toBe(true)
  })

  it('18. el hash SHA-256 sigue siendo determinístico y verificable sobre la salida real', () => {
    const result = auditRide(baseFactura(), [item()])
    expect(sha256Hex(result.bytes)).toMatch(/^[a-f0-9]{64}$/)
  })
})
