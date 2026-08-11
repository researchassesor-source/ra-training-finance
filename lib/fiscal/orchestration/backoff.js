/**
 * Backoff exponencial con tope para el sondeo de autorización, límites de
 * reintentos/antigüedad para evitar polling infinito, y ventanas de tiempo para la
 * reconciliación de un claim SUBMITTING envejecido (ver facturaOrchestrator.js).
 */

export const POLL_INITIAL_DELAY_MS = 60_000 // 1 min, coincide con el orden de magnitud sugerido por el prompt maestro (SRI_AUTH_INITIAL_DELAY_MS)
export const POLL_MAX_DELAY_MS = 30 * 60_000 // 30 min
export const POLL_MAX_ATTEMPTS = 50
export const POLL_MAX_AGE_MS = 48 * 60 * 60_000 // 48h desde la creación de la factura

export function computeNextPollDelayMs(retryCount) {
  const attempt = Math.max(0, retryCount)
  const delay = POLL_INITIAL_DELAY_MS * 2 ** attempt
  return Math.min(delay, POLL_MAX_DELAY_MS)
}

export function computeNextPollAt(retryCount, now = new Date()) {
  return new Date(now.getTime() + computeNextPollDelayMs(retryCount)).toISOString()
}

/** Límite por intentos O por antigüedad — lo que se cumpla primero. */
export function hasExceededPollingLimit(retryCount, createdAtIso, now = new Date()) {
  if (retryCount >= POLL_MAX_ATTEMPTS) return true
  if (!createdAtIso) return false
  const ageMs = now.getTime() - new Date(createdAtIso).getTime()
  return ageMs >= POLL_MAX_AGE_MS
}

// Ventanas de reconciliación de un claim SUBMITTING que no recibió respuesta (la
// conexión falló, pero el SRI pudo haber recibido el envío igual). Ver
// reconciliarSubmittingEnvejecido en facturaOrchestrator.js.
export const SUBMITTING_TOO_RECENT_MS = 2 * 60_000 // no reconciliar antes de esto: la llamada original pudo seguir en vuelo
export const SUBMITTING_SAFE_RESEND_MS = 15 * 60_000 // pasado esto sin encontrar nada en Autorización, se asume no recibido

export function submittingAgeMs(updatedAtIso, now = new Date()) {
  return now.getTime() - new Date(updatedAtIso).getTime()
}
