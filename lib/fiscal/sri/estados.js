/**
 * Clasificación de estados devueltos por el SRI. Los literales de Recepción
 * (RECIBIDA/DEVUELTA) y de Autorización (AUTORIZADO/RECHAZADO) están verificados
 * contra ejemplos XML reales dentro de la ficha técnica 2.34 (Anexo, sección 7).
 *
 * ADVERTENCIA DOCUMENTADA: el literal exacto que el SRI usa en <estado> para "en
 * procesamiento" (PPR) NO aparece como ejemplo XML en la ficha — solo se menciona la
 * sigla PPR en prosa (sección 7.4/Tabla 6). Se acepta un conjunto de alias razonables
 * (EN PROCESO, PROCESAMIENTO, EN PROCESAMIENTO, PPR) pero esto debe confirmarse contra
 * una respuesta real del ambiente de Pruebas la primera vez que un comprobante quede
 * pendiente — no se declara "validado" hasta entonces (ver Fase 5, regla 6 del
 * usuario).
 */

import { SriMalformedResponseError } from './errors.js'

export const RECEPTION_OUTCOME = Object.freeze({ RECIBIDA: 'RECIBIDA', DEVUELTA: 'DEVUELTA' })
export const AUTHORIZATION_OUTCOME = Object.freeze({
  AUTORIZADO: 'AUTORIZADO',
  NO_AUTORIZADO: 'NO_AUTORIZADO',
  EN_PROCESO: 'EN_PROCESO',
})

const RECEPTION_ALIASES = { RECIBIDA: 'RECIBIDA', DEVUELTA: 'DEVUELTA' }

const AUTHORIZATION_ALIASES = {
  AUTORIZADO: 'AUTORIZADO',
  AUT: 'AUTORIZADO',
  'NO AUTORIZADO': 'NO_AUTORIZADO',
  NO_AUTORIZADO: 'NO_AUTORIZADO',
  RECHAZADO: 'NO_AUTORIZADO',
  NAT: 'NO_AUTORIZADO',
  'EN PROCESO': 'EN_PROCESO',
  EN_PROCESO: 'EN_PROCESO',
  PROCESAMIENTO: 'EN_PROCESO',
  'EN PROCESAMIENTO': 'EN_PROCESO',
  PPR: 'EN_PROCESO',
}

function normalize(raw, aliasMap, label) {
  const key = String(raw || '').trim().toUpperCase()
  const normalized = aliasMap[key]
  if (!normalized) {
    // No se inventa un estado desconocido: se falla explícitamente para que quede
    // auditado y un humano decida, en vez de tratarlo en silencio como "pendiente".
    throw new SriMalformedResponseError(`Estado de ${label} desconocido/no reconocido: "${raw}".`)
  }
  return normalized
}

export function normalizeReceptionState(raw) {
  return normalize(raw, RECEPTION_ALIASES, 'recepción')
}

export function normalizeAuthorizationState(raw) {
  return normalize(raw, AUTHORIZATION_ALIASES, 'autorización')
}
