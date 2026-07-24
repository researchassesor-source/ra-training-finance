import { createHash, createSign, createVerify } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import forge from 'node-forge'

export interface XmlSignerResult {
  xml: string
  kind: 'MOCK_NON_CRYPTOGRAPHIC' | 'EPHEMERAL_TEST_XADES_BES' | 'PKCS12_XADES_BES'
  digest: string
  warning: string
  verified?: boolean
}

export interface XmlSigner { sign(xml: string): Promise<XmlSignerResult> }

const sha256Base64 = (value: string): string => createHash('sha256').update(value).digest('base64')
const canonicalize = (value: string): string => value.replace(/>\s+</g, '><').trim()
const withoutSignature = (xml: string): string => xml.replace(/<ds:Signature\b[\s\S]*?<\/ds:Signature>/, '')
const pemCertificateBody = (pem: string): string => pem.replace(/-----[^-]+-----|\s/g, '')
const safeXml = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

interface SigningMaterial { privateKeyPem: string; certificatePem: string; issuer: string; serial: string; validFrom: Date; validUntil: Date }

function buildXades(xml: string, material: SigningMaterial): XmlSignerResult {
  const documentDigest = sha256Base64(canonicalize(xml))
  const certificateDigest = sha256Base64(Buffer.from(pemCertificateBody(material.certificatePem), 'base64').toString('binary'))
  const signatureId = `Signature-${createHash('sha256').update(xml).digest('hex').slice(0, 16)}`
  const propertiesId = `${signatureId}-SignedProperties`
  const signedProperties = `<xades:SignedProperties Id="${propertiesId}"><xades:SignedSignatureProperties><xades:SigningTime>${new Date().toISOString()}</xades:SigningTime><xades:SigningCertificate><xades:Cert><xades:CertDigest><ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/><ds:DigestValue>${certificateDigest}</ds:DigestValue></xades:CertDigest><xades:IssuerSerial><ds:X509IssuerName>${safeXml(material.issuer)}</ds:X509IssuerName><ds:X509SerialNumber>${safeXml(material.serial)}</ds:X509SerialNumber></xades:IssuerSerial></xades:Cert></xades:SigningCertificate></xades:SignedSignatureProperties></xades:SignedProperties>`
  const propertiesDigest = sha256Base64(canonicalize(signedProperties))
  const signedInfo = `<ds:SignedInfo><ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/><ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/><ds:Reference URI=""><ds:Transforms><ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/><ds:Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/></ds:Transforms><ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/><ds:DigestValue>${documentDigest}</ds:DigestValue></ds:Reference><ds:Reference Type="http://uri.etsi.org/01903#SignedProperties" URI="#${propertiesId}"><ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/><ds:DigestValue>${propertiesDigest}</ds:DigestValue></ds:Reference></ds:SignedInfo>`
  const signer = createSign('RSA-SHA256')
  signer.update(canonicalize(signedInfo))
  signer.end()
  const signatureValue = signer.sign(material.privateKeyPem, 'base64')
  const signature = `<ds:Signature Id="${signatureId}" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:xades="http://uri.etsi.org/01903/v1.3.2#">${signedInfo}<ds:SignatureValue>${signatureValue}</ds:SignatureValue><ds:KeyInfo><ds:X509Data><ds:X509Certificate>${pemCertificateBody(material.certificatePem)}</ds:X509Certificate></ds:X509Data></ds:KeyInfo><ds:Object><xades:QualifyingProperties Target="#${signatureId}">${signedProperties}</xades:QualifyingProperties></ds:Object></ds:Signature>`
  const closeTag = xml.includes('</factura>') ? '</factura>' : '</notaCredito>'
  const signedXml = xml.replace(closeTag, `${signature}${closeTag}`)
  return { xml: signedXml, kind: 'EPHEMERAL_TEST_XADES_BES', digest: createHash('sha256').update(signedXml).digest('hex'), warning: 'Firma XAdES-BES criptográfica de prueba; requiere certificado institucional y certificación SRI.', verified: verifyXadesBes(signedXml) }
}

export function verifyXadesBes(xml: string): boolean {
  try {
    const signedInfo = xml.match(/<ds:SignedInfo>[\s\S]*?<\/ds:SignedInfo>/)?.[0]
    const signatureValue = xml.match(/<ds:SignatureValue>([^<]+)<\/ds:SignatureValue>/)?.[1]
    const certificateBody = xml.match(/<ds:X509Certificate>([^<]+)<\/ds:X509Certificate>/)?.[1]
    const digestValues = [...xml.matchAll(/<ds:DigestValue>([^<]+)<\/ds:DigestValue>/g)].map((match) => match[1])
    const signedProperties = xml.match(/<xades:SignedProperties\b[\s\S]*?<\/xades:SignedProperties>/)?.[0]
    if (!signedInfo || !signatureValue || !certificateBody || !signedProperties || digestValues.length < 3) return false
    const unsignedXml = withoutSignature(xml)
    if (sha256Base64(canonicalize(unsignedXml)) !== digestValues[0]) return false
    if (sha256Base64(canonicalize(signedProperties)) !== digestValues[1]) return false
    const certPem = `-----BEGIN CERTIFICATE-----\n${certificateBody.match(/.{1,64}/g)?.join('\n')}\n-----END CERTIFICATE-----\n`
    const verifier = createVerify('RSA-SHA256')
    verifier.update(canonicalize(signedInfo))
    verifier.end()
    return verifier.verify(certPem, signatureValue, 'base64')
  } catch { return false }
}

export class MockXmlSigner implements XmlSigner {
  async sign(xml: string): Promise<XmlSignerResult> {
    const digest = createHash('sha256').update(xml).digest('hex')
    const closeTag = xml.includes('</factura>') ? '</factura>' : '</notaCredito>'
    const marker = `<!-- FIRMA MOCK NO CRIPTOGRAFICA | SIN VALIDEZ TRIBUTARIA | SHA256 ${digest} -->`
    return { xml: xml.replace(closeTag, `${marker}${closeTag}`), kind: 'MOCK_NON_CRYPTOGRAPHIC', digest, warning: 'No es XAdES-BES, no usa certificado y no tiene validez tributaria.', verified: false }
  }
}

export function createEphemeralMaterial(validFrom = new Date(Date.now() - 60_000), validUntil = new Date(Date.now() + 86_400_000)): SigningMaterial {
  const keys = forge.pki.rsa.generateKeyPair(2048)
  const cert = forge.pki.createCertificate()
  cert.publicKey = keys.publicKey
  cert.serialNumber = '01'
  cert.validity.notBefore = validFrom
  cert.validity.notAfter = validUntil
  const attrs = [{ name: 'commonName', value: 'R.A. Training XAdES Test' }, { name: 'countryName', value: 'EC' }]
  cert.setSubject(attrs); cert.setIssuer(attrs)
  cert.setExtensions([{ name: 'basicConstraints', cA: false }, { name: 'keyUsage', digitalSignature: true }])
  cert.sign(keys.privateKey, forge.md.sha256.create())
  return { privateKeyPem: forge.pki.privateKeyToPem(keys.privateKey), certificatePem: forge.pki.certificateToPem(cert), issuer: 'CN=R.A. Training XAdES Test,C=EC', serial: cert.serialNumber, validFrom, validUntil }
}

export class EphemeralTestXadesBesSigner implements XmlSigner {
  async sign(xml: string): Promise<XmlSignerResult> {
    const result = buildXades(xml, createEphemeralMaterial())
    if (!result.verified) throw new Error('La firma XAdES-BES de prueba no superó la verificación interna')
    return result
  }
}

export class Pkcs12XadesBesSigner implements XmlSigner {
  constructor(private readonly path: string, private readonly password: string) {}
  private async material(): Promise<SigningMaterial> {
    if (!['.p12', '.pfx'].includes(extname(this.path).toLowerCase())) throw new Error('El certificado debe utilizar extensión .p12 o .pfx')
    let bytes: Buffer
    try { bytes = await readFile(this.path) } catch { throw new Error('No se pudo abrir el contenedor PKCS#12 configurado') }
    let container: forge.pkcs12.Pkcs12Pfx
    try { container = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(bytes.toString('binary')), false, this.password) }
    catch { throw new Error('El contenedor PKCS#12 está corrupto o la contraseña es incorrecta') }
    const shroudedOid = forge.pki.oids.pkcs8ShroudedKeyBag as string
    const keyOid = forge.pki.oids.keyBag as string
    const certOid = forge.pki.oids.certBag as string
    const keyBag = container.getBags({ bagType: shroudedOid })[shroudedOid]?.[0]
      ?? container.getBags({ bagType: keyOid })[keyOid]?.[0]
    const certBag = container.getBags({ bagType: certOid })[certOid]?.[0]
    if (!keyBag?.key || !certBag?.cert) throw new Error('El contenedor PKCS#12 no incluye certificado y llave privada compatibles')
    const cert = certBag.cert
    const now = new Date()
    if (now < cert.validity.notBefore || now > cert.validity.notAfter) throw new Error('El certificado electrónico no está vigente')
    const publicKey = cert.publicKey as forge.pki.rsa.PublicKey
    const privateKey = keyBag.key as forge.pki.rsa.PrivateKey
    if (publicKey.n.compareTo(privateKey.n) !== 0 || publicKey.e.compareTo(privateKey.e) !== 0) throw new Error('La llave privada no corresponde al certificado')
    return { privateKeyPem: forge.pki.privateKeyToPem(privateKey), certificatePem: forge.pki.certificateToPem(cert), issuer: cert.issuer.attributes.map((item: { shortName?: string; name?: string; value?: unknown }) => `${item.shortName ?? item.name}=${String(item.value ?? '')}`).join(','), serial: cert.serialNumber, validFrom: cert.validity.notBefore, validUntil: cert.validity.notAfter }
  }
  async sign(xml: string): Promise<XmlSignerResult> {
    const result = buildXades(xml, await this.material())
    return { ...result, kind: 'PKCS12_XADES_BES', warning: 'Firmador institucional preparado técnicamente; requiere validación en certificación SRI.' }
  }
}

export interface ManagedSecretProvider { getSigningMaterial(reference: string): Promise<never> }
export class FutureManagedSecretXadesSigner implements XmlSigner {
  async sign(_xml: string): Promise<XmlSignerResult> { throw new Error('Gestor de secretos futuro no configurado') }
}

export interface SriCompatibleSigner extends XmlSigner { readonly requiresXadesBes132: true; readonly requiresSecretReference: true }
