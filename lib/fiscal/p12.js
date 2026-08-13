/**
 * Manejo de certificados PKCS#12 (.p12) para firma electrónica.
 *
 * Reglas duras (no negociables, ver docs/fiscal/architecture.md y las instrucciones
 * explícitas del usuario para Fase 4):
 * - Nunca registrar, loguear ni incluir la contraseña del P12 en ningún mensaje de
 *   error, excepción o valor de retorno. Los catch de este archivo SIEMPRE producen
 *   mensajes estáticos, nunca interpolan el valor recibido en `password`.
 * - Nunca devolver la clave privada como PEM más allá de lo estrictamente necesario
 *   para firmar en el mismo proceso; `getCertificateMetadata` solo expone datos
 *   públicos del certificado (igual que exige la Ficha Maestra §3 "Controles
 *   obligatorios de custodia").
 * - Esta librería NO decide si un certificado "sirve" para producción (eso requiere
 *   confirmar la asociación legítima con el RUC emisor, que el prompt maestro exige
 *   NO asumir automáticamente) — solo valida lo mecánicamente verificable: que el P12
 *   abre con la contraseña dada, que el certificado no esté vencido, y expone los
 *   metadatos públicos para que un humano confirme el resto.
 */

import forge from 'node-forge'
import { createHash } from 'node:crypto'

export class P12FormatError extends Error {}
export class P12PasswordError extends Error {}
export class P12ValidityError extends Error {}

/**
 * Parsea un buffer .p12. Distingue dos fallos con mensajes fijos (nunca incluyen la
 * contraseña ni bytes del archivo):
 * - P12FormatError: el archivo no es un contenedor PKCS#12/DER válido (corrupto, o no
 *   es un .p12 en absoluto).
 * - P12PasswordError: la estructura es válida pero la contraseña no descifra el
 *   contenido.
 */
export function parseP12(buffer, password) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new P12FormatError('El archivo .p12 está vacío o no es un buffer válido.')
  }
  if (typeof password !== 'string' || password.length === 0) {
    throw new P12PasswordError('Se requiere una contraseña para abrir el archivo .p12.')
  }

  let asn1
  try {
    asn1 = forge.asn1.fromDer(forge.util.createBuffer(buffer.toString('binary')))
  } catch {
    throw new P12FormatError('El archivo .p12 está corrupto o no tiene un formato DER/PKCS#12 reconocible.')
  }

  let p12
  try {
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, password)
  } catch {
    // node-forge no distingue de forma fiable "contraseña incorrecta" de otras fallas
    // de integridad en este punto (ambas lanzan durante el descifrado del contenido
    // cifrado) — se reporta como contraseña incorrecta, que es la causa más común y la
    // que un operador puede corregir. Nunca se incluye `password` en el mensaje.
    throw new P12PasswordError('No se pudo abrir el .p12: la contraseña es incorrecta o el contenido cifrado está dañado.')
  }

  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || []
  const keyBags = (
    p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ||
    p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ||
    []
  )

  if (certBags.length === 0) throw new P12FormatError('El .p12 no contiene ningún certificado.')
  if (keyBags.length === 0 || !keyBags[0].key) throw new P12FormatError('El .p12 no contiene una clave privada utilizable.')

  const certificate = certBags[0].cert
  const privateKey = keyBags[0].key

  return { certificate, privateKey, allCertificates: certBags.map(bag => bag.cert) }
}

/** Solo metadatos públicos — nunca la clave privada ni nada derivado de la contraseña. */
export function getCertificateMetadata(certificate) {
  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(certificate)).getBytes()
  const sha256 = createHash('sha256').update(Buffer.from(der, 'binary')).digest('hex')
  return {
    subjectCN: certificate.subject.getField('CN')?.value || null,
    subjectSerialNumber: certificate.subject.getField('SERIALNUMBER')?.value || null,
    issuerCN: certificate.issuer.getField('CN')?.value || null,
    issuerOrganization: certificate.issuer.getField('O')?.value || null,
    serialNumber: certificate.serialNumber,
    notBefore: certificate.validity.notBefore,
    notAfter: certificate.validity.notAfter,
    keyLengthBits: certificate.publicKey?.n ? certificate.publicKey.n.bitLength() : null,
    sha256Fingerprint: sha256,
  }
}

/**
 * Verifica solo lo mecánicamente comprobable: vigencia. NO confirma asociación con un
 * RUC (ver comentario de cabecera) — eso se deja como campo informativo para revisión
 * humana/administrativa.
 */
export function checkCertificateValidity(certificate, { now = new Date() } = {}) {
  const { notBefore, notAfter } = certificate.validity
  if (now < notBefore) {
    throw new P12ValidityError(`El certificado todavía no es válido (vigente desde ${notBefore.toISOString()}).`)
  }
  if (now > notAfter) {
    throw new P12ValidityError(`El certificado está vencido (venció ${notAfter.toISOString()}).`)
  }
  const daysRemaining = Math.floor((notAfter.getTime() - now.getTime()) / 86_400_000)
  return { valid: true, daysRemaining }
}

/** Clave privada en PEM, para uso inmediato en el mismo proceso de firma — no persistir. */
export function privateKeyToPem(privateKey) {
  return forge.pki.privateKeyToPem(privateKey)
}

/** Certificado X.509 en PEM y en base64 "crudo" (sin cabeceras), tal como lo pide <X509Certificate>. */
export function certificateToPemAndBase64(certificate) {
  const pem = forge.pki.certificateToPem(certificate)
  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(certificate)).getBytes()
  const base64 = Buffer.from(der, 'binary').toString('base64')
  return { pem, base64 }
}
