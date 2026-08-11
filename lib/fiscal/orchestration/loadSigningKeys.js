/**
 * Carga las llaves de firma desde variables de entorno server-only
 * (SRI_CERT_P12_BASE64, SRI_CERT_PASSWORD) — nunca desde el repositorio, nunca
 * desde un valor por defecto. Si faltan, lanza un error claro en vez de intentar
 * adivinar o usar un certificado de prueba en producción por accidente.
 *
 * Deliberadamente NO configurado todavía en ningún entorno (ver rule 9/10 de Fase 6
 * del usuario) — esta función existe y está lista, pero hasta que alguien cargue
 * esas variables en Vercel, cualquier llamada real falla aquí con un mensaje claro,
 * no con un comportamiento ambiguo.
 */

import { parseP12, privateKeyToPem, certificateToPemAndBase64 } from '../p12.js'

export class SigningKeysNotConfiguredError extends Error {}

export function loadSigningKeysFromEnv(env = process.env) {
  const p12Base64 = env.SRI_CERT_P12_BASE64
  const password = env.SRI_CERT_PASSWORD
  if (!p12Base64 || !password) {
    throw new SigningKeysNotConfiguredError(
      'SRI_CERT_P12_BASE64 y/o SRI_CERT_PASSWORD no están configurados en este entorno. ' +
      'Ver scripts/configure-sri-certificate.ps1 para prepararlos de forma segura.'
    )
  }
  const buffer = Buffer.from(p12Base64, 'base64')
  const { certificate, privateKey } = parseP12(buffer, password)
  const { pem: certificatePem, base64: certificateBase64 } = certificateToPemAndBase64(certificate)
  return { privateKeyPem: privateKeyToPem(privateKey), certificatePem, certificateBase64, certificate }
}
