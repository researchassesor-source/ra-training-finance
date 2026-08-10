/**
 * Fixtures de certificados SOLO PARA PRUEBAS. Generados en memoria en cada ejecución
 * del suite — nunca se persisten a disco, no representan ninguna entidad real, y no
 * deben usarse jamás contra el SRI (ni Pruebas ni Producción). Ver instrucción
 * explícita del usuario para Fase 4: "implementa la firma con fixtures/certificados
 * exclusivamente de prueba" antes de tocar el .p12 productivo.
 */
import { generateKeyPairSync } from 'node:crypto'
import forge from 'node-forge'

// La generación de clave RSA 2048 es costosa en JS puro; se usa el keygen nativo de
// Node (rápido) y se reutiliza el mismo par en todos los fixtures del suite.
let cachedKeyPair = null
function testKeyPair() {
  if (!cachedKeyPair) {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    cachedKeyPair = {
      privateKey: forge.pki.privateKeyFromPem(privateKey.export({ type: 'pkcs1', format: 'pem' })),
      publicKey: forge.pki.publicKeyFromPem(publicKey.export({ type: 'pkcs1', format: 'pem' })),
    }
  }
  return cachedKeyPair
}

/**
 * Construye un certificado X.509 autofirmado de prueba (no encadenado a ninguna CA
 * real) con la ventana de vigencia que se indique.
 */
export function buildTestCertificate({
  commonName = 'CERTIFICADO DE PRUEBA - NO USAR EN PRODUCCION',
  serialNumber = '01',
  notBefore = new Date(Date.now() - 24 * 60 * 60 * 1000),
  notAfter = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
} = {}) {
  const { privateKey, publicKey } = testKeyPair()
  const cert = forge.pki.createCertificate()
  cert.publicKey = publicKey
  cert.serialNumber = serialNumber
  cert.validity.notBefore = notBefore
  cert.validity.notAfter = notAfter
  const attrs = [
    { name: 'commonName', value: commonName },
    { name: 'organizationName', value: 'FIXTURE DE PRUEBA - NO ES UNA EMPRESA REAL' },
    { name: 'countryName', value: 'EC' },
  ]
  cert.setSubject(attrs)
  cert.setIssuer([
    { name: 'commonName', value: 'AC DE PRUEBA - FIXTURE, NO ES UNA ENTIDAD REAL' },
    { name: 'organizationName', value: 'FIXTURE DE PRUEBA' },
    { name: 'countryName', value: 'EC' },
  ])
  cert.sign(privateKey, forge.md.sha256.create())
  return { certificate: cert, privateKey, publicKey }
}

/** Empaqueta el certificado + clave de prueba en un Buffer PKCS#12 (.p12) real, cifrado con `password`. */
export function buildTestP12Buffer({ password = 'contraseña-de-prueba-no-real', ...certOptions } = {}) {
  const { certificate, privateKey } = buildTestCertificate(certOptions)
  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(privateKey, [certificate], password, { algorithm: '3des' })
  const der = forge.asn1.toDer(p12Asn1).getBytes()
  return { buffer: Buffer.from(der, 'binary'), password, certificate, privateKey }
}
