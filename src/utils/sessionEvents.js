export const SESSION_EXPIRED_EVENT = 'rat:session-expired'
export const SESSION_EXPIRED_MESSAGE = 'Sesión inválida o expirada. Por favor inicia sesión de nuevo.'

export function notifySessionExpired(token) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT, { detail: { token: token || '' } }))
  }
}
