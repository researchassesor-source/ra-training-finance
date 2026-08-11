/**
 * Backoff exponencial con tope para el sondeo de autorización, y límite de
 * reintentos para evitar polling infinito (regla explícita de Fase 6).
 */

export const POLL_INITIAL_DELAY_MS = 60_000 // 1 min, coincide con el orden de magnitud sugerido por el prompt maestro (SRI_AUTH_INITIAL_DELAY_MS)
export const POLL_MAX_DELAY_MS = 30 * 60_000 // 30 min
export const POLL_MAX_ATTEMPTS = 50 // ~pasado esto, se espacía al máximo y se deja para revisión manual, no se detiene solo

export function computeNextPollDelayMs(retryCount) {
  const attempt = Math.max(0, retryCount)
  const delay = POLL_INITIAL_DELAY_MS * 2 ** attempt
  return Math.min(delay, POLL_MAX_DELAY_MS)
}

export function computeNextPollAt(retryCount, now = new Date()) {
  return new Date(now.getTime() + computeNextPollDelayMs(retryCount)).toISOString()
}

export function hasExceededMaxAttempts(retryCount) {
  return retryCount >= POLL_MAX_ATTEMPTS
}
