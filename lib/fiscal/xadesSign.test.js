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

  it('X509IssuerName respeta el orden RFC 2253 (atributo más específico primero, ej. CN antes que C) y escapa valores con coma — regresión del bug real que causaba "FIRMA INVALIDA" del SRI', () => {
    // El certificado de prueba codifica su Issuer DER en orden C,O,CN (como un
    // certificado real de una CA acreditada) — si buildIssuerSerial no invirtiera ese
    // orden, X509IssuerName saldría "C=EC,O=...,CN=..." en vez de "CN=...,O=...,C=EC",
    // que es exactamente lo que exige XMLDSig/XAdES y lo que muestra el ejemplo oficial
    // de la ficha técnica (Anexo 14) para un certificado real de la BCE.
    const unsignedXml = buildFacturaXml(facturaPruebaSri())
    const keys = testSigningKeys({ password: TEST_PASSWORD })
    const signedXml = signFacturaXml(unsignedXml, keys)

    const doc = new DOMParser().parseFromString(signedXml, 'text/xml')
    const issuerNameNode = doc.getElementsByTagName('ds:X509IssuerName')[0]
    expect(issuerNameNode).toBeTruthy()
    const issuerName = issuerNameNode.textContent

    // Orden: CN primero, C al final (RFC 2253) -- no al revés.
    expect(issuerName.indexOf('CN=')).toBe(0)
    expect(issuerName.indexOf('C=EC')).toBeGreaterThan(issuerName.indexOf('O='))
    // La coma dentro del valor de CN queda escapada con backslash, no como separador
    // de atributo -- si no se escapara, "O=FIXTURE DE PRUEBA" no sería el segundo
    // componente sino un fragmento roto del propio CN.
    expect(issuerName).toContain('AC DE PRUEBA - FIXTURE\\, NO ES UNA ENTIDAD REAL')
    const componentes = issuerName.split(/(?<!\\),/)
    expect(componentes).toHaveLength(3)
    expect(componentes[0].startsWith('CN=')).toBe(true)
    expect(componentes[1].startsWith('O=')).toBe(true)
    expect(componentes[2]).toBe('C=EC')

    // El serial en X509SerialNumber debe ser el mismo del certificado, en decimal.
    const serialNode = doc.getElementsByTagName('ds:X509SerialNumber')[0]
    expect(serialNode.textContent).toBe(BigInt('0x' + keys.certificate.serialNumber).toString(10))
  })

  it('estructura crítica de XAdES: orden y referencias cruzadas exactas exigidas por el SRI', () => {
    const unsignedXml = buildFacturaXml(facturaPruebaSri())
    const signedXml = signFacturaXml(unsignedXml, testSigningKeys({ password: TEST_PASSWORD }))
    const doc = new DOMParser().parseFromString(signedXml, 'text/xml')

    // SignedSignatureProperties antes que SignedDataObjectProperties dentro de SignedProperties.
    const signedProps = doc.getElementsByTagName('etsi:SignedProperties')[0]
    const hijosDirectos = Array.from(signedProps.childNodes).filter(n => n.nodeType === 1)
    expect(hijosDirectos.map(n => n.tagName)).toEqual(['etsi:SignedSignatureProperties', 'etsi:SignedDataObjectProperties'])

    // CertDigest antes que IssuerSerial dentro de SigningCertificate>Cert.
    const cert = doc.getElementsByTagName('etsi:Cert')[0]
    const hijosCert = Array.from(cert.childNodes).filter(n => n.nodeType === 1)
    expect(hijosCert.map(n => n.tagName)).toEqual(['etsi:CertDigest', 'etsi:IssuerSerial'])

    // DataObjectFormat/ObjectReference debe apuntar exactamente al Id de la Reference
    // del comprobante (URI="#comprobante") -- un desajuste aquí es indetectable por
    // verifyFacturaXmlSignature (no cruza ese dato) pero el validador del SRI sí lo exige.
    const comprobanteRef = Array.from(doc.getElementsByTagName('ds:Reference')).find(r => r.getAttribute('URI') === '#comprobante')
    const dataObjectFormat = doc.getElementsByTagName('etsi:DataObjectFormat')[0]
    expect(dataObjectFormat.getAttribute('ObjectReference')).toBe('#' + comprobanteRef.getAttribute('Id'))

    // QualifyingProperties Target apunta exactamente al Id de ds:Signature.
    const signatureNode = doc.getElementsByTagName('ds:Signature')[0]
    const qualifyingProps = doc.getElementsByTagName('etsi:QualifyingProperties')[0]
    expect(qualifyingProps.getAttribute('Target')).toBe('#' + signatureNode.getAttribute('Id'))

    // La Reference a SignedProperties apunta exactamente al Id de etsi:SignedProperties.
    const signedPropsRef = Array.from(doc.getElementsByTagName('ds:Reference')).find(r => r.getAttribute('Type') === 'http://uri.etsi.org/01903#SignedProperties')
    expect(signedPropsRef.getAttribute('URI')).toBe('#' + signedProps.getAttribute('Id'))
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
