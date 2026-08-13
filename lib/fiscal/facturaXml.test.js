import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FacturaXmlError, buildFacturaXml } from './facturaXml.js'

const XSD_PATH = join(process.cwd(), 'docs/fiscal/sri-official/schemas/factura_V2.1.0.xsd')

// Caso de la prueba controlada SRI (Ficha Maestra v2.0 §8): cliente, monto e IVA son
// datos de prueba explícitamente identificados como tales, sin efecto tributario real.
function facturaPruebaSri(overrides) {
  return {
    environment: 'test',
    razonSocial: 'RESEARCH ASSESSOR TRAINING S.A.S.',
    nombreComercial: 'RA-TRAINING',
    ruc: '0691787373001',
    claveAcceso: '1'.repeat(48) + '9', // clave sintética válida en forma (49 dígitos), no una real emitida
    establishment: '001',
    emissionPoint: '002',
    sequential: '000000001',
    dirMatriz: 'Barrio de los Maestros, calle Bielorusia, Riobamba',
    fechaEmision: new Date(2026, 7, 10),
    obligadoContabilidad: true,
    buyer: {
      tipoIdentificacion: 'cedula',
      identificacion: '0804655462',
      razonSocial: 'Angel David Espinoza Ureta',
      direccion: 'Riobamba, Ecuador',
    },
    totalSinImpuestosCents: 100,
    totalDescuentoCents: 0,
    importeTotalCents: 100,
    // codigo/codigoPorcentaje/tarifa son ilustrativos de prueba: el tratamiento IVA 0%
    // real todavía está pendiente de confirmación tributaria (ver Fiscal.gs).
    impuestosTotales: [
      { codigo: '2', codigoPorcentaje: '0', tarifa: '0.00', baseImponibleCents: 100, valorCents: 0 },
    ],
    pagos: [{ formaPago: '20', totalCents: 100 }],
    detalles: [
      {
        descripcion: 'Prueba técnica de capacitación - Ambiente de pruebas',
        cantidad: 1,
        precioUnitario: 1,
        descuentoCents: 0,
        precioTotalSinImpuestoCents: 100,
        impuestos: [{ codigo: '2', codigoPorcentaje: '0', tarifa: '0.00', baseImponibleCents: 100, valorCents: 0 }],
      },
    ],
    ...overrides,
  }
}

function xmllintDisponible() {
  try {
    execFileSync('xmllint', ['--version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

describe('buildFacturaXml — estructura', () => {
  it('genera un XML bien formado con declaración UTF-8 y elemento raíz factura 2.1.0', () => {
    const xml = buildFacturaXml(facturaPruebaSri())
    expect(xml).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>/)
    expect(xml).toContain('<factura id="comprobante" version="2.1.0">')
  })

  it('respeta el orden de elementos exigido por xsd:sequence (infoTributaria antes que infoFactura antes que detalles)', () => {
    const xml = buildFacturaXml(facturaPruebaSri())
    const posInfoTributaria = xml.indexOf('<infoTributaria>')
    const posInfoFactura = xml.indexOf('<infoFactura>')
    const posDetalles = xml.indexOf('<detalles>')
    expect(posInfoTributaria).toBeGreaterThan(-1)
    expect(posInfoFactura).toBeGreaterThan(posInfoTributaria)
    expect(posDetalles).toBeGreaterThan(posInfoFactura)
  })

  it('formatea cantidad y precioUnitario con 6 decimales (regla 2.1.0)', () => {
    const xml = buildFacturaXml(facturaPruebaSri({
      detalles: [{
        descripcion: 'Curso', cantidad: 1.5, precioUnitario: 33.333333,
        precioTotalSinImpuestoCents: 5000, impuestos: [{ codigo: '2', codigoPorcentaje: '0', tarifa: '0.00', baseImponibleCents: 5000, valorCents: 0 }],
      }],
    }))
    expect(xml).toContain('<cantidad>1.500000</cantidad>')
    expect(xml).toContain('<precioUnitario>33.333333</precioUnitario>')
  })

  it('formatea totales monetarios con 2 decimales', () => {
    const xml = buildFacturaXml(facturaPruebaSri())
    expect(xml).toContain('<totalSinImpuestos>1.00</totalSinImpuestos>')
    expect(xml).toContain('<importeTotal>1.00</importeTotal>')
  })

  it('escapa correctamente & y tildes (regla de prueba explícita del prompt maestro)', () => {
    const xml = buildFacturaXml(facturaPruebaSri({
      buyer: { tipoIdentificacion: 'cedula', identificacion: '0804655462', razonSocial: 'José & María Muñoz' },
    }))
    expect(xml).toContain('<razonSocialComprador>José &amp; María Muñoz</razonSocialComprador>')
    expect(xml).not.toContain('José & María') // sin escapar sería XML inválido
  })

  it('omite infoAdicional cuando no se provee (Anexo 26 todavía no resuelto)', () => {
    const xml = buildFacturaXml(facturaPruebaSri())
    expect(xml).not.toContain('infoAdicional')
  })

  it('incluye infoAdicional con el RUC del proveedor de software cuando se provee explícitamente', () => {
    const xml = buildFacturaXml(facturaPruebaSri({
      infoAdicional: [{ nombre: 'RUC Proveedor', valor: '0691787373001' }],
    }))
    expect(xml).toContain('<campoAdicional nombre="RUC Proveedor">0691787373001</campoAdicional>')
  })
})

describe('buildFacturaXml — validaciones', () => {
  it('rechaza un environment inválido', () => {
    expect(() => buildFacturaXml(facturaPruebaSri({ environment: 'staging' }))).toThrow(FacturaXmlError)
  })

  it('rechaza una claveAcceso que no tenga 49 dígitos', () => {
    expect(() => buildFacturaXml(facturaPruebaSri({ claveAcceso: '123' }))).toThrow(FacturaXmlError)
  })

  it('rechaza un tipoIdentificacion de comprador desconocido', () => {
    expect(() => buildFacturaXml(facturaPruebaSri({ buyer: { tipoIdentificacion: 'dni', identificacion: '1', razonSocial: 'X' } }))).toThrow(FacturaXmlError)
  })

  it('rechaza una factura sin detalles', () => {
    expect(() => buildFacturaXml(facturaPruebaSri({ detalles: [] }))).toThrow(FacturaXmlError)
  })

  it('rechaza un detalle sin impuestos', () => {
    expect(() => buildFacturaXml(facturaPruebaSri({
      detalles: [{ descripcion: 'X', cantidad: 1, precioUnitario: 1, precioTotalSinImpuestoCents: 100, impuestos: [] }],
    }))).toThrow(FacturaXmlError)
  })

  it('rechaza campos monetarios no enteros (protección contra floats colados)', () => {
    expect(() => buildFacturaXml(facturaPruebaSri({ totalSinImpuestosCents: 1.5 }))).toThrow(FacturaXmlError)
  })
})

describe('buildFacturaXml — validación real contra el XSD oficial del SRI', () => {
  const runOrSkip = xmllintDisponible() ? it : it.skip

  runOrSkip('el XML generado para el caso de prueba SRI valida contra factura_V2.1.0.xsd (xmllint/libxml2)', () => {
    const xml = buildFacturaXml(facturaPruebaSri())
    const dir = mkdtempSync(join(tmpdir(), 'factura-xsd-'))
    const xmlPath = join(dir, 'factura.xml')
    writeFileSync(xmlPath, xml, 'utf8')
    // Lanza si no valida; execFileSync arroja excepción con el detalle de xmllint en stderr.
    expect(() => execFileSync('xmllint', ['--noout', '--schema', XSD_PATH, xmlPath], { stdio: 'pipe' })).not.toThrow()
  })

  runOrSkip('un XML deliberadamente inválido (claveAcceso con letras) es rechazado por el XSD real', () => {
    // buildFacturaXml ya rechaza esto en JS; aquí se prueba el XSD directamente para
    // confirmar que la regla también está en el esquema oficial, no solo en nuestro código.
    const xmlValido = buildFacturaXml(facturaPruebaSri())
    const xmlInvalido = xmlValido.replace('1'.repeat(48) + '9', 'X'.repeat(49))
    const dir = mkdtempSync(join(tmpdir(), 'factura-xsd-invalid-'))
    const xmlPath = join(dir, 'factura-invalida.xml')
    writeFileSync(xmlPath, xmlInvalido, 'utf8')
    expect(() => execFileSync('xmllint', ['--noout', '--schema', XSD_PATH, xmlPath], { stdio: 'pipe' })).toThrow()
  })
})
