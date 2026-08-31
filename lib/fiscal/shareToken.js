import crypto from 'node:crypto'

const DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60
const ALLOWED_TYPES = new Set(['RIDE', 'XML_AUTORIZADO'])

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function unbase64url(input) {
  const padded = `${input}${'='.repeat((4 - input.length % 4) % 4)}`
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
}

function signingSecret(secret = process.env.FISCAL_DOCUMENT_SHARE_SECRET || process.env.FISCAL_SERVICE_TOKEN) {
  if (!secret || typeof secret !== 'string' || !secret.trim()) {
    throw new Error('No está configurada la clave para enlaces seguros de documentos fiscales.')
  }
  return secret
}

function sign(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url')
}

export function createFiscalDocumentToken({ facturaId, tipo, expiresInSeconds = DEFAULT_TTL_SECONDS }, secret) {
  const normalizedType = String(tipo || '').trim().toUpperCase()
  const id = String(facturaId || '').trim()
  if (!id) throw new Error('facturaId es obligatorio.')
  if (!ALLOWED_TYPES.has(normalizedType)) throw new Error('tipo debe ser RIDE o XML_AUTORIZADO.')

  const payload = base64url(JSON.stringify({
    facturaId: id,
    tipo: normalizedType,
    exp: Math.floor(Date.now() / 1000) + Number(expiresInSeconds || DEFAULT_TTL_SECONDS),
    v: 1,
  }))
  const signature = sign(payload, signingSecret(secret))
  return `${payload}.${signature}`
}

export function verifyFiscalDocumentToken(token, secret) {
  const [payload, signature] = String(token || '').split('.')
  if (!payload || !signature) throw new Error('El enlace de descarga no es válido.')
  const expected = sign(payload, signingSecret(secret))
  const received = Buffer.from(signature)
  const wanted = Buffer.from(expected)
  if (received.length !== wanted.length || !crypto.timingSafeEqual(received, wanted)) {
    throw new Error('El enlace de descarga no es válido o fue alterado.')
  }
  let data
  try {
    data = JSON.parse(unbase64url(payload))
  } catch {
    throw new Error('El enlace de descarga no es válido.')
  }
  if (!data || !data.facturaId || !ALLOWED_TYPES.has(String(data.tipo || '').toUpperCase())) {
    throw new Error('El enlace de descarga no es válido.')
  }
  if (Number(data.exp || 0) < Math.floor(Date.now() / 1000)) {
    throw new Error('El enlace de descarga expiró.')
  }
  return { facturaId: String(data.facturaId), tipo: String(data.tipo).toUpperCase() }
}
