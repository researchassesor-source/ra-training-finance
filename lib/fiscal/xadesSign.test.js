import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import forge from 'node-forge'
import { buildFacturaXml } from './facturaXml.js'
import { parseP12, privateKeyToPem, certificateToPemAndBase64 } from './p12.js'
import { buildTestP12Buffer, buildTestCertificate } from './testFixtures.p12.js'
import { signFacturaXml, verifyFacturaXmlSignature, canonicalizeC14n } from './xadesSign.js'

const TEST_PASSWORD = 'contraseña-super-secreta-de-prueba-9x7'
const XSD_PATH = join(process.cwd(), 'docs/fiscal/sri-official/schemas/factura_V2.1.0.xsd')

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
function opensslAvailable() {
  try { execFileSync('openssl', ['version'], { stdio: 'ignore' }); return true } catch { return false }
}

describe('signFacturaXml — estructura XAdES-BES', () => {
  it('inserta ds:Signature dentro del elemento factura (enveloped) antes del cierre', () => {
    const unsignedXml = buildFacturaXml(facturaPruebaSri())
    const signedXml = signFacturaXml(unsignedXml, testSigningKeys({ password: TEST_PASSWORD }))
    expect(signedXml).toContain('<ds:Signature')
    expect(signedXml.indexOf('<ds:Signature')).toBeLessThan(signedXml.indexOf('</factura>'))
    expect(signedXml.endsWith('</factura>')).toBe(true)
  })

  it('usa los algoritmos exactos confirmados en la ficha 2.34 (Anexo 14): C14N no exclusiva, RSA-SHA1, SHA1', () => {
    const unsignedXml = buildFacturaXml(facturaPruebaSri())
    const signedXml = signFacturaXml(unsignedXml, testSigningKeys({ password: TEST_PASSWORD }))
    expect(signedXml).toContain('http://www.w3.org/TR/2001/REC-xml-c14n-20010315')
    expect(signedXml).toContain('http://www.w3.org/2000/09/xmldsig#rsa-sha1')
    expect(signedXml).not.toContain('exc-c14n')
    expect((signedXml.match(/Algorithm="http:\/\/www\.w3\.org\/2000\/09\/xmldsig#sha1"/g) || []).length).toBeGreaterThanOrEqual(3)
  })

  it('contiene las 3 referencias esperadas: SignedProperties, KeyInfo/certificado y el comprobante completo', () => {
    const unsignedXml = buildFacturaXml(facturaPruebaSri())
    const signedXml = signFacturaXml(unsignedXml, testSigningKeys({ password: TEST_PASSWORD }))
    expect(signedXml).toContain('Type="http://uri.etsi.org/01903#SignedProperties"')
    expect(signedXml).toContain('URI="#comprobante"')
    expect(signedXml).toContain('Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"')
    expect(signedXml).toContain('<etsi:SigningTime>')
    expect(signedXml).toContain('<ds:X509Certificate>')
    expect(signedXml).toContain('<ds:RSAKeyValue>')
    expect(signedXml).toContain('<etsi:IssuerSerial>')
  })

  it('el XML firmado sigue siendo XML bien formado y parseable', () => {
    const unsignedXml = buildFacturaXml(facturaPruebaSri())
    const signedXml = signFacturaXml(unsignedXml, testSigningKeys({ password: TEST_PASSWORD }))
    const doc = new DOMParser().parseFromString(signedXml, 'text/xml')
    expect(doc.documentElement.tagName).toBe('factura')
  })

  const runIfXmllint = xmllintAvailable() ? it : it.skip
  runIfXmllint('el XML firmado sigue validando contra el XSD oficial de factura 2.1.0 (ds:Signature es minOccurs=0 pero válido)', () => {
    const unsignedXml = buildFacturaXml(facturaPruebaSri())
    const signedXml = signFacturaXml(unsignedXml, testSigningKeys({ password: TEST_PASSWORD }))
    const dir = mkdtempSync(join(tmpdir(), 'signed-xsd-'))
    const xmlPath = join(dir, 'factura-firmada.xml')
    writeFileSync(xmlPath, signedXml, 'utf8')
    expect(() => execFileSync('xmllint', ['--noout', '--schema', XSD_PATH, xmlPath], { stdio: 'pipe' })).not.toThrow()
  })
})

describe('verifyFacturaXmlSignature — detección de manipulación', () => {
  it('una factura firmada correctamente verifica como válida', () => {
    const unsignedXml = buildFacturaXml(facturaPruebaSri())
    const signedXml = signFacturaXml(unsignedXml, testSigningKeys({ password: TEST_PASSWORD }))
    expect(verifyFacturaXmlSignature(signedXml)).toEqual({ valid: true })
  })

  it('modificar un valor de negocio después de firmar invalida la firma', () => {
    const unsignedXml = buildFacturaXml(facturaPruebaSri())
    const signedXml = signFacturaXml(unsignedXml, testSigningKeys({ password: TEST_PASSWORD }))
    const tampered = signedXml.replace('<importeTotal>1.00</importeTotal>', '<importeTotal>999.00</importeTotal>')
    expect(tampered).not.toBe(signedXml) // confirma que el replace sí encontró y cambió algo
    const result = verifyFacturaXmlSignature(tampered)
    expect(result.valid).toBe(false)
  })

  it('modificar un solo carácter de SignatureValue invalida la firma', () => {
    const unsignedXml = buildFacturaXml(facturaPruebaSri())
    const signedXml = signFacturaXml(unsignedXml, testSigningKeys({ password: TEST_PASSWORD }))
    const tampered = signedXml.replace(/(<ds:SignatureValue[^>]*>)([A-Za-z0-9+/=]{10})/, (m, tag, start) => tag + (start[0] === 'A' ? 'B' : 'A') + start.slice(1))
    expect(verifyFacturaXmlSignature(tampered).valid).toBe(false)
  })

  it('modificar un solo carácter de un DigestValue (sin tocar SignatureValue) también invalida la firma', () => {
    const unsignedXml = buildFacturaXml(facturaPruebaSri())
    const signedXml = signFacturaXml(unsignedXml, testSigningKeys({ password: TEST_PASSWORD }))
    const tampered = signedXml.replace(/(<ds:DigestValue>)([A-Za-z0-9+/=]{5})/, (m, tag, start) => tag + (start[0] === 'A' ? 'B' : 'A') + start.slice(1))
    expect(tampered).not.toBe(signedXml)
    expect(verifyFacturaXmlSignature(tampered).valid).toBe(false)
  })

  it('sustituir el certificado embebido por uno de otra clave invalida la firma (certificado incorrecto)', () => {
    const unsignedXml = buildFacturaXml(facturaPruebaSri())
    const signedXml = signFacturaXml(unsignedXml, testSigningKeys({ password: TEST_PASSWORD }))

    // Certificado de otra identidad/clave, ajeno a la firma real.
    const { certificate: otroCertificado } = buildTestCertificate({ commonName: 'OTRA IDENTIDAD - CERTIFICADO AJENO' })
    const otroCertBase64 = forge.asn1.toDer(forge.pki.certificateToAsn1(otroCertificado)).getBytes()
    const otroCertB64Std = Buffer.from(otroCertBase64, 'binary').toString('base64')

    const originalCertMatch = signedXml.match(/<ds:X509Certificate>([\s\S]*?)<\/ds:X509Certificate>/)
    expect(originalCertMatch).toBeTruthy()
    const tampered = signedXml.replace(originalCertMatch[0], `<ds:X509Certificate>${otroCertB64Std}</ds:X509Certificate>`)

    const result = verifyFacturaXmlSignature(tampered)
    expect(result.valid).toBe(false)
  })

  it('rechaza un XML sin ninguna firma', () => {
    const unsignedXml = buildFacturaXml(facturaPruebaSri())
    expect(verifyFacturaXmlSignature(unsignedXml).valid).toBe(false)
  })

  it('rechaza XML mal formado sin lanzar una excepción no controlada', () => {
    expect(verifyFacturaXmlSignature('<factura><no-cierra>').valid).toBe(false)
  })
})

describe('validación independiente con OpenSSL (motor criptográfico distinto al usado para firmar)', () => {
  const runIfOpenssl = opensslAvailable() ? it : it.skip

  runIfOpenssl('openssl verifica la firma RSA-SHA1 sobre el SignedInfo canonicalizado, de forma independiente de nuestro propio verifyFacturaXmlSignature', () => {
    const unsignedXml = buildFacturaXml(facturaPruebaSri())
    const keys = testSigningKeys({ password: TEST_PASSWORD })
    const signedXml = signFacturaXml(unsignedXml, keys)

    const doc = new DOMParser().parseFromString(signedXml, 'text/xml')
    const NS_DS = 'http://www.w3.org/2000/09/xmldsig#'
    const signedInfoNode = doc.getElementsByTagNameNS(NS_DS, 'SignedInfo')[0]
    const signatureValueNode = doc.getElementsByTagNameNS(NS_DS, 'SignatureValue')[0]
    const signedInfoXml = new XMLSerializer().serializeToString(signedInfoNode)
    const canonical = canonicalizeC14n(signedInfoXml)
    const signatureBytes = Buffer.from(signatureValueNode.textContent.trim(), 'base64')

    const dir = mkdtempSync(join(tmpdir(), 'openssl-verify-'))
    try {
      const pubkeyPath = join(dir, 'pubkey.pem')
      const sigPath = join(dir, 'sig.bin')
      const dataPath = join(dir, 'signedinfo.c14n')
      writeFileSync(pubkeyPath, forge.pki.publicKeyToPem(keys.certificate.publicKey))
      writeFileSync(sigPath, signatureBytes)
      writeFileSync(dataPath, canonical)

      expect(() => execFileSync('openssl', [
        'dgst', '-sha1', '-verify', pubkeyPath, '-signature', sigPath, dataPath,
      ], { stdio: 'pipe' })).not.toThrow()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  runIfOpenssl('openssl detecta que la firma NO valida contra un SignedInfo alterado (segunda comprobación de la detección de manipulación)', () => {
    const unsignedXml = buildFacturaXml(facturaPruebaSri())
    const keys = testSigningKeys({ password: TEST_PASSWORD })
    const signedXml = signFacturaXml(unsignedXml, keys)

    const doc = new DOMParser().parseFromString(signedXml, 'text/xml')
    const NS_DS = 'http://www.w3.org/2000/09/xmldsig#'
    const signatureValueNode = doc.getElementsByTagNameNS(NS_DS, 'SignatureValue')[0]
    const signatureBytes = Buffer.from(signatureValueNode.textContent.trim(), 'base64')
    const alteredSignedInfo = '<ds:SignedInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">contenido alterado, no es el SignedInfo real</ds:SignedInfo>'
    const canonical = canonicalizeC14n(alteredSignedInfo)

    const dir = mkdtempSync(join(tmpdir(), 'openssl-verify-tampered-'))
    try {
      const pubkeyPath = join(dir, 'pubkey.pem')
      const sigPath = join(dir, 'sig.bin')
      const dataPath = join(dir, 'signedinfo.c14n')
      writeFileSync(pubkeyPath, forge.pki.publicKeyToPem(keys.certificate.publicKey))
      writeFileSync(sigPath, signatureBytes)
      writeFileSync(dataPath, canonical)

      expect(() => execFileSync('openssl', [
        'dgst', '-sha1', '-verify', pubkeyPath, '-signature', sigPath, dataPath,
      ], { stdio: 'pipe' })).toThrow()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
