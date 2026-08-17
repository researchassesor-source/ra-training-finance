/**
 * Prueba de equivalencia criptográfica GOLDEN entre la implementación anterior de
 * canonicalizeC14n (xmllint --c14n, binario del sistema) y la nueva (xml-crypto, pura
 * Node) — ver el JSDoc de cabecera en xadesSign.js para el porqué del cambio: xmllint
 * no está instalado en el runtime de Vercel, y esa dependencia implícita era la causa
 * real del HTTP 502 al procesar la factura 001-002-000000002.
 *
 * Esta prueba NO usa certificado real, NO usa datos reales, y NO guarda XML fiscal
 * real: reutiliza exactamente los mismos fixtures sintéticos que xadesSign.test.js
 * (facturaPruebaSri + testFixtures.p12.js) para producir, mediante una llamada real a
 * signFacturaXml, los 4 fragmentos que xadesSign.js canonicaliza de verdad en
 * producción: (1) el comprobante completo sin firma, (2) KeyInfo, (3) SignedProperties,
 * (4) SignedInfo. Sobre esos 4 fragmentos reales compara, byte a byte y por digest
 * SHA1, la salida de `xmllint --c14n` (referencia, solo en este archivo de test) contra
 * `canonicalizeC14n` (producción, importado de xadesSign.js).
 *
 * Se salta por completo si xmllint no está disponible en la máquina/CI que ejecuta la
 * prueba — no es requisito para que la suite normal pase (ver xadesSign.js), pero SÍ
 * se ejecuta en esta máquina de desarrollo, donde xmllint está confirmado disponible.
 */
import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import { buildFacturaXml } from './facturaXml.js'
import { parseP12, privateKeyToPem, certificateToPemAndBase64 } from './p12.js'
import { buildTestP12Buffer } from './testFixtures.p12.js'
import { signFacturaXml, canonicalizeC14n } from './xadesSign.js'

const TEST_PASSWORD = 'contraseña-super-secreta-de-prueba-9x7'
const NS_DS = 'http://www.w3.org/2000/09/xmldsig#'
const NS_ETSI = 'http://uri.etsi.org/01903/v1.3.2#'

function facturaPruebaSri(overrides) {
  return {
    environment: 'test',
    razonSocial: 'RESEARCH ASSESSOR TRAINING S.A.S.',
    nombreComercial: 'RA-TRAINING',
    ruc: '0691787373001',
    claveAcceso: '1'.repeat(48) + '9',
    establishment: '001',
    emissionPoint: '002',
    sequential: '000000001',
    dirMatriz: 'Barrio de los Maestros, calle Bielorusia, Riobamba',
    fechaEmision: new Date(2026, 7, 10),
    obligadoContabilidad: true,
    buyer: { tipoIdentificacion: 'cedula', identificacion: '0804655462', razonSocial: 'Angel David Espinoza Ureta' },
    totalSinImpuestosCents: 100,
    totalDescuentoCents: 0,
    importeTotalCents: 100,
    impuestosTotales: [{ codigo: '2', codigoPorcentaje: '0', tarifa: '0.00', baseImponibleCents: 100, valorCents: 0 }],
    pagos: [{ formaPago: '20', totalCents: 100 }],
    detalles: [{
      descripcion: 'Prueba técnica de capacitación - Ambiente de pruebas',
      cantidad: 1, precioUnitario: 1, precioTotalSinImpuestoCents: 100,
      impuestos: [{ codigo: '2', codigoPorcentaje: '0', tarifa: '0.00', baseImponibleCents: 100, valorCents: 0 }],
    }],
    ...overrides,
  }
}

function testSigningKeys(p12Overrides) {
  const { buffer, password } = buildTestP12Buffer(p12Overrides)
  const { certificate, privateKey } = parseP12(buffer, password)
  const { pem: certificatePem, base64: certificateBase64 } = certificateToPemAndBase64(certificate)
  return { privateKeyPem: privateKeyToPem(privateKey), certificatePem, certificateBase64, certificate }
}

function xmllintAvailable() {
  try { execFileSync('xmllint', ['--version'], { stdio: 'ignore' }); return true } catch { return false }
}

/**
 * Referencia SOLO de test: reproduce la implementación ANTERIOR de canonicalizeC14n
 * (xmllint --c14n vía un binario externo), usada únicamente como comparador de
 * equivalencia — nunca en código de producción. No debe reintroducirse en xadesSign.js.
 */
function canonicalizeWithXmllintReference(xmlFragment) {
  const dir = mkdtempSync(join(tmpdir(), 'c14n-golden-'))
  try {
    const filePath = join(dir, 'fragment.xml')
    writeFileSync(filePath, xmlFragment, 'utf8')
    return execFileSync('xmllint', ['--c14n', filePath])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function serialize(node) {
  return new XMLSerializer().serializeToString(node)
}

function sha1Hex(buffer) {
  return createHash('sha1').update(buffer).digest('hex')
}

/** Extrae, de una factura ya firmada de verdad por signFacturaXml, los 3 fragmentos
 * XAdES reales (KeyInfo, SignedProperties, SignedInfo) tal como quedaron insertados en
 * el documento — no una reconstrucción aproximada. */
function extraerFragmentosReales(signedXml) {
  const doc = new DOMParser().parseFromString(signedXml, 'text/xml')
  const keyInfoNode = doc.getElementsByTagNameNS(NS_DS, 'KeyInfo')[0]
  const signedPropertiesNode = doc.getElementsByTagNameNS(NS_ETSI, 'SignedProperties')[0]
  const signedInfoNode = doc.getElementsByTagNameNS(NS_DS, 'SignedInfo')[0]
  if (!keyInfoNode || !signedPropertiesNode || !signedInfoNode) {
    throw new Error('No se pudieron extraer los fragmentos XAdES esperados del XML firmado de prueba.')
  }
  return {
    keyInfoXml: serialize(keyInfoNode),
    signedPropertiesXml: serialize(signedPropertiesNode),
    signedInfoXml: serialize(signedInfoNode),
  }
}

const runIfXmllint = xmllintAvailable() ? describe : describe.skip

runIfXmllint('canonicalizeC14n — equivalencia GOLDEN xmllint (anterior) vs xml-crypto (nueva)', () => {
  const unsignedXml = buildFacturaXml(facturaPruebaSri())
  const signedXml = signFacturaXml(unsignedXml, testSigningKeys({ password: TEST_PASSWORD }))
  const { keyInfoXml, signedPropertiesXml, signedInfoXml } = extraerFragmentosReales(signedXml)

  const casos = {
    'comprobante completo sin firma (fragmento real pasado a canonicalizeC14n en signFacturaXml)': unsignedXml,
    'KeyInfo (fragmento real extraído del XML firmado)': keyInfoXml,
    'SignedProperties (fragmento real extraído del XML firmado)': signedPropertiesXml,
    'SignedInfo (fragmento real extraído del XML firmado)': signedInfoXml,
  }

  it.each(Object.entries(casos))('%s: xmllint --c14n y canonicalizeC14n producen bytes idénticos y el mismo SHA1', (_nombre, fragment) => {
    const old = canonicalizeWithXmllintReference(fragment)
    const nuevo = canonicalizeC14n(fragment)

    expect(Buffer.isBuffer(nuevo)).toBe(true)
    expect(Buffer.compare(old, nuevo)).toBe(0)
    expect(sha1Hex(nuevo)).toBe(sha1Hex(old))
  })
})
