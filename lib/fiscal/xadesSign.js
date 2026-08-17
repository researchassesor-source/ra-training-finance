/**
 * Firma XAdES-BES para comprobantes electrónicos del SRI (Ecuador).
 *
 * Estructura, algoritmos y namespaces verificados directamente contra el Anexo 14 de
 * la Ficha Técnica de Comprobantes Electrónicos Offline, versión 2.34 (julio 2026) —
 * ver docs/fiscal/sri-official/ficha_tecnica_offline_2.34.pdf, sección 6 y Anexo 14.
 * No se copiaron valores de documentos antiguos: la 2.34 es la fuente usada aquí.
 *
 * Algoritmos confirmados en la ficha (sección 6.2 Tabla 7 y 6.8):
 * - Estándar: XAdES_BES, esquema 1.3.2, tipo ENVELOPED.
 * - Canonicalización: http://www.w3.org/TR/2001/REC-xml-c14n-20010315 (C14N 1.0, NO
 *   exclusiva — la ficha no menciona xml-exc-c14n en ningún punto).
 * - Firma: RSA-SHA1 (http://www.w3.org/2000/09/xmldsig#rsa-sha1).
 * - Digest: SHA1 (http://www.w3.org/2000/09/xmldsig#sha1) en las tres referencias.
 * - Longitud de clave: 2048 bits.
 *
 * Building blocks deliberadamente NO reimplementados a mano:
 * - Canonicalización C14N: se delega a la clase `C14nCanonicalization` de la
 *   librería `xml-crypto` (implementación pura Node del algoritmo W3C C14N 1.0,
 *   NO exclusiva — `getAlgorithmName()` de esa clase devuelve exactamente
 *   http://www.w3.org/TR/2001/REC-xml-c14n-20010315). Antes se delegaba a
 *   `xmllint --c14n` (libxml2) vía `execFileSync`, pero eso convertía un binario del
 *   sistema (no instalado en el runtime de Vercel) en dependencia implícita de
 *   producción — causa real de un HTTP 502 ("No se pudo procesar la factura.") al
 *   procesar la factura 001-002-000000002. La equivalencia byte-for-byte entre ambas
 *   implementaciones, sobre los mismos fragmentos reales que produce esta función
 *   (comprobante, KeyInfo, SignedProperties, SignedInfo), está probada en
 *   xadesC14nGolden.test.js usando xmllint como referencia — nunca en producción.
 * - RSA-SHA1: Node `crypto.createSign('RSA-SHA1')` (binding nativo sobre OpenSSL).
 * - Parseo de PKCS#12/X.509: `node-forge` (ver p12.js).
 * - Parseo/serialización DOM para verificación: `@xmldom/xmldom`.
 *
 * Referencia de las 3 <ds:Reference> del SignedInfo (mismo orden que el Anexo 14):
 * 1. SignedProperties (Type=".../01903#SignedProperties") — protege SigningTime,
 *    huella del certificado firmante y el vínculo con la referencia del comprobante.
 * 2. KeyInfo (URI="#<CertificateId>") — protege el certificado incluido para que no
 *    pueda sustituirse sin invalidar la firma.
 * 3. El comprobante completo (URI="#comprobante"), con Transform
 *    enveloped-signature — protege todo el XML de negocio.
 *
 * LIMITACIÓN CONOCIDA para reportar antes de Fase 5: no hay en este entorno una
 * herramienta XAdES/XMLDSig de referencia independiente (xmlsec1 no está disponible).
 * La verificación independiente aquí se apoya en xmllint (C14N/XSD) + openssl (verificación
 * criptográfica cruda de la firma RSA sobre los bytes canonicalizados) — ver
 * xadesSign.test.js. La compatibilidad end-to-end real con el validador del SRI solo
 * se confirma en Fase 5, contra el ambiente de Pruebas.
 */

import { randomBytes, createHash, createSign, createVerify, createPublicKey } from 'node:crypto'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import { C14nCanonicalization } from 'xml-crypto'
import forge from 'node-forge'

export class XadesSignError extends Error {}
export class XadesVerifyError extends Error {}

const NS_DS = 'http://www.w3.org/2000/09/xmldsig#'
const NS_ETSI = 'http://uri.etsi.org/01903/v1.3.2#'
const ALG_C14N = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'
const ALG_RSA_SHA1 = 'http://www.w3.org/2000/09/xmldsig#rsa-sha1'
const ALG_SHA1 = 'http://www.w3.org/2000/09/xmldsig#sha1'
const ALG_ENVELOPED = 'http://www.w3.org/2000/09/xmldsig#enveloped-signature'
const TYPE_SIGNED_PROPERTIES = 'http://uri.etsi.org/01903#SignedProperties'

function randomNCName(prefix) {
  return `${prefix}${randomBytes(6).toString('hex')}`
}

function sha1Base64(bufferOrString) {
  return createHash('sha1').update(bufferOrString).digest('base64')
}

/**
 * Canonicaliza un fragmento XML bien formado con W3C C14N 1.0 (no exclusiva, sin
 * comentarios) usando xml-crypto — implementación pura Node, sin binario externo ni
 * child_process. `C14nCanonicalization.getAlgorithmName()` de esa librería devuelve
 * exactamente el identificador exigido por el Anexo 14: ALG_C14N. Devuelve un Buffer
 * (no un string) para conservar el mismo contrato de entrada/salida que tenía la
 * implementación anterior basada en `xmllint --c14n`.
 */
export function canonicalizeC14n(xmlFragment) {
  let doc
  try {
    doc = new DOMParser().parseFromString(xmlFragment, 'text/xml')
  } catch (err) {
    throw new XadesSignError(`No se pudo canonicalizar el fragmento XML: XML mal formado (${err.message}).`)
  }
  if (!doc || !doc.documentElement) {
    throw new XadesSignError('No se pudo canonicalizar el fragmento XML: XML mal formado.')
  }
  try {
    const canonical = new C14nCanonicalization().process(doc.documentElement)
    return Buffer.from(canonical, 'utf8')
  } catch (err) {
    throw new XadesSignError(`No se pudo canonicalizar el fragmento XML (C14N): ${err.message}`)
  }
}

function formatSigningTimeEcuador(date) {
  // America/Guayaquil es UTC-5 fijo (sin horario de verano) — se calcula explícitamente
  // en vez de confiar en la zona horaria del proceso que ejecuta esto (Vercel, CI, o
  // una laptop en otro huso horario darían resultados distintos con Date local).
  const shifted = new Date(date.getTime() - 5 * 60 * 60 * 1000)
  const pad = n => String(n).padStart(2, '0')
  const y = shifted.getUTCFullYear()
  const mo = pad(shifted.getUTCMonth() + 1)
  const d = pad(shifted.getUTCDate())
  const h = pad(shifted.getUTCHours())
  const mi = pad(shifted.getUTCMinutes())
  const s = pad(shifted.getUTCSeconds())
  return `${y}-${mo}-${d}T${h}:${mi}:${s}-05:00`
}

function rsaPublicKeyToXmlDsigParts(certificate) {
  // Se apoya en el export JWK nativo de Node (RFC 7518, Base64urlUInt: base64url del
  // entero sin signo en big-endian mínimo) en vez de manipular a mano los BigInteger
  // internos de forge — RSAKeyValue de XMLDSig usa la misma representación en base64
  // estándar, así que solo hace falta convertir el alfabeto y el padding.
  const pem = forge.pki.publicKeyToPem(certificate.publicKey)
  const jwk = createPublicKey(pem).export({ format: 'jwk' })
  const toStdBase64 = b64url => {
    const withPadding = b64url.replace(/-/g, '+').replace(/_/g, '/')
    const padLength = (4 - (withPadding.length % 4)) % 4
    return withPadding + '='.repeat(padLength)
  }
  return { modulus: toStdBase64(jwk.n), exponent: toStdBase64(jwk.e) }
}

/** Escapa un valor de atributo de DN según RFC 2253 §2.4 (',', '+', '"', '\\', '<',
 * '>', ';' en cualquier posición; '#' o espacio inicial; espacio final). */
function escapeRfc2253Value(value) {
  let escaped = String(value).replace(/[,+"\\<>;]/g, m => `\\${m}`)
  if (/^[ #]/.test(escaped)) escaped = `\\${escaped}`
  if (/ $/.test(escaped)) escaped = `${escaped.slice(0, -1)}\\ `
  return escaped
}

/**
 * X509IssuerName de XMLDSig/XAdES exige la representación RFC 2253 del Issuer DN: el
 * atributo MÁS específico (normalmente CN) primero, el MENOS específico (C) al final
 * — el orden INVERSO al de la codificación DER del certificado, que es como
 * node-forge expone certificate.issuer.attributes (típicamente C..O..CN, orden
 * "raíz a hoja"). Sin este `.reverse()`, el DN queda en el orden equivocado y el
 * validador XAdES del SRI no reconoce el certificado firmante como el que aparece en
 * KeyInfo — reportando la firma completa como inválida, aunque cada digest/valor de
 * firma sea criptográficamente correcto. Verificado contra el ejemplo oficial de la
 * propia ficha técnica (Anexo 14, sección 6.8): el X509IssuerName de un certificado
 * real (BCE) aparece exactamente como "CN=...,L=...,OU=...,O=...,C=EC".
 */
function buildIssuerSerial(certificate) {
  const issuerName = certificate.issuer.attributes
    .slice()
    .reverse()
    .map(a => `${a.shortName}=${escapeRfc2253Value(a.value)}`)
    .join(',')
  const serialDecimal = BigInt('0x' + certificate.serialNumber).toString(10)
  return { issuerName, serialDecimal }
}

/**
 * Firma un XML de factura (ya generado por facturaXml.js, sin firmar) bajo XAdES-BES.
 *
 * @param {string} unsignedXml - XML con id="comprobante" en el elemento raíz, tal como
 *   lo produce buildFacturaXml. No debe contener ya un ds:Signature.
 * @param {object} keys - { privateKeyPem, certificatePem, certificateBase64 } — ver
 *   p12.js (privateKeyToPem/certificateToPemAndBase64). El objeto `certificate` de
 *   forge también se requiere para IssuerSerial/Modulus/Exponent.
 * @param {object} [options] - { signingTime?: Date }
 * @returns {string} XML firmado (comprobante + ds:Signature insertado antes del cierre).
 */
export function signFacturaXml(unsignedXml, { privateKeyPem, certificatePem, certificateBase64, certificate }, options = {}) {
  if (typeof unsignedXml !== 'string' || !unsignedXml.includes('id="comprobante"')) {
    throw new XadesSignError('unsignedXml debe ser el XML de factura con id="comprobante" en la raíz.')
  }
  if (!privateKeyPem || !certificatePem || !certificateBase64 || !certificate) {
    throw new XadesSignError('Faltan materiales de firma (privateKeyPem, certificatePem, certificateBase64, certificate).')
  }

  const signingTime = formatSigningTimeEcuador(options.signingTime || new Date())
  const sigId = randomNCName('Signature')
  const signedInfoId = `${sigId}-SignedInfo`
  const signedPropsId = `${sigId}-SignedProperties`
  const certInfoId = randomNCName('Certificate')
  const signatureValueId = randomNCName('SignatureValue')
  const objectId = `${sigId}-Object`
  const comprobanteRefId = randomNCName('Reference-ID-')

  // --- Digest 3: el comprobante completo (transform enveloped-signature). Antes de
  // insertar la firma, "quitarla" ya es un no-op: es literalmente el XML original. ---
  const comprobanteCanonical = canonicalizeC14n(unsignedXml)
  const comprobanteDigest = sha1Base64(comprobanteCanonical)

  // --- Digest 2: el KeyInfo (certificado + su llave pública), para impedir sustituirlo. ---
  const { modulus, exponent } = rsaPublicKeyToXmlDsigParts(certificate)
  const keyInfoXml =
    `<ds:KeyInfo xmlns:ds="${NS_DS}" Id="${certInfoId}">` +
    `<ds:X509Data><ds:X509Certificate>${certificateBase64}</ds:X509Certificate></ds:X509Data>` +
    `<ds:KeyValue><ds:RSAKeyValue><ds:Modulus>${modulus}</ds:Modulus><ds:Exponent>${exponent}</ds:Exponent></ds:RSAKeyValue></ds:KeyValue>` +
    `</ds:KeyInfo>`
  const keyInfoDigest = sha1Base64(canonicalizeC14n(keyInfoXml))

  // --- Digest 1: SignedProperties (SigningTime + huella del certificado + vínculo con
  // la referencia del comprobante). Construido una sola vez y reutilizado tal cual al
  // insertarlo en el documento final, para no depender de invariancia de C14N. ---
  const certDigestForSigningCert = sha1Base64(Buffer.from(forgeCertificateDer(certificate), 'binary'))
  const { issuerName, serialDecimal } = buildIssuerSerial(certificate)
  const signedPropertiesXml =
    `<etsi:SignedProperties xmlns:etsi="${NS_ETSI}" xmlns:ds="${NS_DS}" Id="${signedPropsId}">` +
    `<etsi:SignedSignatureProperties>` +
    `<etsi:SigningTime>${signingTime}</etsi:SigningTime>` +
    `<etsi:SigningCertificate><etsi:Cert>` +
    `<etsi:CertDigest><ds:DigestMethod Algorithm="${ALG_SHA1}"></ds:DigestMethod><ds:DigestValue>${certDigestForSigningCert}</ds:DigestValue></etsi:CertDigest>` +
    `<etsi:IssuerSerial><ds:X509IssuerName>${escapeXmlText(issuerName)}</ds:X509IssuerName><ds:X509SerialNumber>${serialDecimal}</ds:X509SerialNumber></etsi:IssuerSerial>` +
    `</etsi:Cert></etsi:SigningCertificate>` +
    `</etsi:SignedSignatureProperties>` +
    `<etsi:SignedDataObjectProperties>` +
    `<etsi:DataObjectFormat ObjectReference="#${comprobanteRefId}"><etsi:Description>contenido comprobante</etsi:Description><etsi:MimeType>text/xml</etsi:MimeType></etsi:DataObjectFormat>` +
    `</etsi:SignedDataObjectProperties>` +
    `</etsi:SignedProperties>`
  const signedPropertiesDigest = sha1Base64(canonicalizeC14n(signedPropertiesXml))

  // --- SignedInfo con las 3 referencias, en el mismo orden que el Anexo 14. ---
  const signedInfoXml =
    `<ds:SignedInfo xmlns:ds="${NS_DS}" Id="${signedInfoId}">` +
    `<ds:CanonicalizationMethod Algorithm="${ALG_C14N}"></ds:CanonicalizationMethod>` +
    `<ds:SignatureMethod Algorithm="${ALG_RSA_SHA1}"></ds:SignatureMethod>` +
    `<ds:Reference Id="SignedPropertiesID${randomBytes(4).toString('hex')}" Type="${TYPE_SIGNED_PROPERTIES}" URI="#${signedPropsId}">` +
    `<ds:DigestMethod Algorithm="${ALG_SHA1}"></ds:DigestMethod><ds:DigestValue>${signedPropertiesDigest}</ds:DigestValue>` +
    `</ds:Reference>` +
    `<ds:Reference URI="#${certInfoId}">` +
    `<ds:DigestMethod Algorithm="${ALG_SHA1}"></ds:DigestMethod><ds:DigestValue>${keyInfoDigest}</ds:DigestValue>` +
    `</ds:Reference>` +
    `<ds:Reference Id="${comprobanteRefId}" URI="#comprobante">` +
    `<ds:Transforms><ds:Transform Algorithm="${ALG_ENVELOPED}"></ds:Transform></ds:Transforms>` +
    `<ds:DigestMethod Algorithm="${ALG_SHA1}"></ds:DigestMethod><ds:DigestValue>${comprobanteDigest}</ds:DigestValue>` +
    `</ds:Reference>` +
    `</ds:SignedInfo>`

  const signedInfoCanonical = canonicalizeC14n(signedInfoXml)
  const signatureValue = createSign('RSA-SHA1').update(signedInfoCanonical).sign(privateKeyPem, 'base64')

  const signatureXml =
    `<ds:Signature xmlns:ds="${NS_DS}" Id="${sigId}">` +
    signedInfoXml +
    `<ds:SignatureValue Id="${signatureValueId}">${signatureValue}</ds:SignatureValue>` +
    keyInfoXml +
    `<ds:Object Id="${objectId}">` +
    `<etsi:QualifyingProperties xmlns:etsi="${NS_ETSI}" Target="#${sigId}">` +
    signedPropertiesXml +
    `</etsi:QualifyingProperties>` +
    `</ds:Object>` +
    `</ds:Signature>`

  const closingTagMatch = unsignedXml.match(/<\/[A-Za-z][\w.-]*>\s*$/)
  if (!closingTagMatch) throw new XadesSignError('No se encontró la etiqueta de cierre del comprobante para insertar la firma.')
  const insertAt = unsignedXml.lastIndexOf(closingTagMatch[0])
  return unsignedXml.slice(0, insertAt) + signatureXml + unsignedXml.slice(insertAt)
}

function forgeCertificateDer(certificate) {
  return forge.asn1.toDer(forge.pki.certificateToAsn1(certificate)).getBytes()
}

function escapeXmlText(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ─────────────────────────────────────────────
// VERIFICACIÓN INDEPENDIENTE (no solo "la librería no lanzó error" al firmar)
// ─────────────────────────────────────────────

function findByIdAttr(doc, id) {
  const all = doc.getElementsByTagName('*')
  for (let i = 0; i < all.length; i += 1) {
    if (all[i].getAttribute('Id') === id) return all[i]
  }
  return null
}

function serialize(node) {
  return new XMLSerializer().serializeToString(node)
}

/**
 * Reverifica una factura firmada de forma independiente de signFacturaXml: recalcula
 * las 3 referencias desde el documento actual (detecta manipulación posterior) y
 * verifica criptográficamente SignatureValue contra el certificado embebido en el
 * propio documento (KeyInfo) — no contra la clave usada al firmar, para que un
 * certificado sustituido también se detecte.
 */
export function verifyFacturaXmlSignature(signedXml) {
  let doc
  try {
    doc = new DOMParser().parseFromString(signedXml, 'text/xml')
  } catch {
    return { valid: false, reason: 'XML mal formado: no se pudo parsear.' }
  }
  if (!doc || !doc.documentElement) return { valid: false, reason: 'XML mal formado: no se pudo parsear.' }

  const signatureNodes = doc.getElementsByTagNameNS(NS_DS, 'Signature')
  if (signatureNodes.length === 0) return { valid: false, reason: 'No se encontró ds:Signature en el documento.' }
  const signatureNode = signatureNodes[0]

  const signedInfoNode = signatureNode.getElementsByTagNameNS(NS_DS, 'SignedInfo')[0]
  const signatureValueNode = signatureNode.getElementsByTagNameNS(NS_DS, 'SignatureValue')[0]
  const keyInfoNode = signatureNode.getElementsByTagNameNS(NS_DS, 'KeyInfo')[0]
  if (!signedInfoNode || !signatureValueNode || !keyInfoNode) {
    return { valid: false, reason: 'Estructura de firma incompleta (falta SignedInfo, SignatureValue o KeyInfo).' }
  }

  const certNode = keyInfoNode.getElementsByTagNameNS(NS_DS, 'X509Certificate')[0]
  if (!certNode || !certNode.textContent.trim()) return { valid: false, reason: 'No se encontró X509Certificate en KeyInfo.' }
  const certificateBase64 = certNode.textContent.trim()
  const certificatePem = `-----BEGIN CERTIFICATE-----\n${certificateBase64.match(/.{1,64}/g).join('\n')}\n-----END CERTIFICATE-----\n`

  // 1) Verificar criptográficamente SignatureValue contra SignedInfo canonicalizado,
  //    usando la clave pública del certificado EMBEBIDO en el documento (no la que se
  //    usó para firmar) — así un certificado sustituido también se detecta.
  const signedInfoCanonical = canonicalizeC14n(serialize(signedInfoNode))
  const signatureValueB64 = signatureValueNode.textContent.trim()
  let signatureCryptoValid = false
  try {
    signatureCryptoValid = createVerify('RSA-SHA1')
      .update(signedInfoCanonical)
      .verify(certificatePem, Buffer.from(signatureValueB64, 'base64'))
  } catch {
    signatureCryptoValid = false
  }
  if (!signatureCryptoValid) return { valid: false, reason: 'SignatureValue no coincide con SignedInfo (firma inválida o certificado sustituido).' }

  // 2) Recalcular cada Reference desde el documento actual y comparar con su DigestValue.
  const references = signedInfoNode.getElementsByTagNameNS(NS_DS, 'Reference')
  for (let i = 0; i < references.length; i += 1) {
    const ref = references[i]
    const uri = ref.getAttribute('URI') || ''
    const digestValue = ref.getElementsByTagNameNS(NS_DS, 'DigestValue')[0]?.textContent.trim()
    if (!digestValue) return { valid: false, reason: `Reference ${i} sin DigestValue.` }

    let canonicalBytes
    if (uri === '#comprobante') {
      const clone = doc.cloneNode(true)
      const sigInClone = clone.getElementsByTagNameNS(NS_DS, 'Signature')[0]
      sigInClone.parentNode.removeChild(sigInClone)
      canonicalBytes = canonicalizeC14n(serialize(clone.documentElement))
    } else {
      const targetId = uri.replace(/^#/, '')
      const target = findByIdAttr(doc, targetId)
      if (!target) return { valid: false, reason: `No se encontró el elemento referenciado por URI="${uri}".` }
      canonicalBytes = canonicalizeC14n(serialize(target))
    }

    const recomputed = sha1Base64(canonicalBytes)
    if (recomputed !== digestValue) {
      return { valid: false, reason: `Reference ${i} (URI="${uri}") no coincide: el contenido referenciado fue modificado después de firmar.` }
    }
  }

  return { valid: true }
}
