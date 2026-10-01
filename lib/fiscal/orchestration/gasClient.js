/**
 * Cliente servidor-a-servidor hacia Apps Script (Vercel -> GAS), usado exclusivamente
 * por el orquestador fiscal. Distinto de api/proxy.js (que reenvía llamadas del
 * NAVEGADOR con el token de sesión del usuario) — este cliente nunca lo usa un
 * navegador, siempre lleva `serviceToken` en vez de `token`, y solo funciona con las
 * acciones en el allowlist FISCAL_SERVICE_ACTIONS_ del lado de Apps Script.
 *
 * Nunca loguea el serviceToken ni el cuerpo completo de la respuesta.
 */

export class GasClientError extends Error {
  constructor(message, { code = 'UPSTREAM_ERROR', backendMessage = '' } = {}) {
    super(message)
    this.name = 'GasClientError'
    this.code = code
    this.backendMessage = backendMessage
  }
}

const SESSION_INVALID_MESSAGE = 'Sesión inválida o expirada. Por favor inicia sesión de nuevo.'

function classifyUserError(message) {
  if (message === SESSION_INVALID_MESSAGE) return 'SESSION_INVALID'
  if (/^(Acceso denegado\b|No autorizado\b)/i.test(message)) return 'FORBIDDEN'
  if (/^Factura no encontrada:/i.test(message)) return 'NOT_FOUND'
  return 'UPSTREAM_ERROR'
}

/** Traduce solo errores de Apps Script reconocidos; el resto sigue siendo 502. */
export function fiscalGasErrorResponse(err, fallback = 'No se pudo completar la operación fiscal.') {
  if (err instanceof GasClientError) {
    if (err.code === 'SESSION_INVALID') return { status: 401, error: SESSION_INVALID_MESSAGE }
    if (err.code === 'FORBIDDEN') return { status: 403, error: 'No tienes permisos para realizar esta acción.' }
    if (err.code === 'NOT_FOUND') return { status: 404, error: 'Factura no encontrada.' }
  }
  return { status: 502, error: fallback }
}

function rejectedUserAction(action, backendMessage) {
  const message = backendMessage || 'error desconocido'
  return new GasClientError(
    `Apps Script rechazó la acción "${action}": ${message}`,
    { code: classifyUserError(message), backendMessage: message },
  )
}

/**
 * @param {string} action
 * @param {object} params
 * @param {{ gasUrl?: string, serviceToken?: string, fetchImpl?: Function, timeoutMs?: number }} [options]
 */
export async function callGasAction(action, params = {}, options = {}) {
  const gasUrl = options.gasUrl ?? process.env.GAS_URL
  const serviceToken = options.serviceToken ?? process.env.FISCAL_SERVICE_TOKEN
  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? 30_000

  // Falla ANTES de cualquier fetch — nunca se llega a la red sin gasUrl/serviceToken
  // válidos. typeof + trim (no solo truthy) para no dejar pasar un valor no-string o
  // en blanco que igual llegaría vacío a Apps Script.
  if (!gasUrl || typeof gasUrl !== 'string') throw new GasClientError('GAS_URL no está configurado.')
  if (!serviceToken || typeof serviceToken !== 'string' || serviceToken.trim() === '') {
    throw new GasClientError('FISCAL_SERVICE_TOKEN no está configurado.')
  }

  // Cada llamada fiscal servidor-a-servidor manda exactamente esta forma: `action` +
  // `serviceToken` + los params propios de la acción. NUNCA `token` (eso es
  // exclusivo de callGasActionAsUser, la sesión humana) — construir el body en una
  // variable aparte, en vez de inline, para que quede explícito y sea lo que
  // gasClient.test.js verifica capturando el body real enviado a fetch.
  const body = { action, serviceToken, ...params }

  let response
  try {
    response = await fetchImpl(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (err) {
    throw new GasClientError(`Error de red al llamar a Apps Script (acción "${action}"): ${err.message}`)
  }

  let data
  try {
    data = await response.json()
  } catch (err) {
    throw new GasClientError(`Respuesta no-JSON de Apps Script (acción "${action}").`)
  }

  if (!data || data.success !== true) {
    throw new GasClientError(`Apps Script rechazó la acción "${action}": ${(data && data.error) || 'error desconocido'}`)
  }
  return data.data
}

/**
 * Igual que callGasAction, pero autenticando con la sesión del usuario (`token`) en
 * vez del secreto de servicio — para los endpoints `/api/fiscal/*` que un
 * administrador dispara a mano desde el navegador. GAS aplica el mismo
 * requireFiscalAdmin de siempre sobre ese usuario; esta función no otorga ningún
 * privilegio adicional, solo cambia qué credencial viaja en el body.
 */
export async function callGasLogin(username, password, options = {}) {
  const gasUrl = options.gasUrl ?? process.env.GAS_URL
  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? 30_000
  if (!gasUrl) throw new GasClientError('GAS_URL no está configurado.')
  if (!username || typeof username !== 'string') throw new GasClientError('Se requiere usuario administrador fiscal.')
  if (!password || typeof password !== 'string') throw new GasClientError('Se requiere contraseña de usuario administrador fiscal.')

  let response
  try {
    response = await fetchImpl(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'login', username, password }),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (err) {
    throw new GasClientError(`Error de red al iniciar sesión en Apps Script: ${err.message}`)
  }
  let data
  try {
    data = await response.json()
  } catch {
    throw new GasClientError('Respuesta no-JSON de Apps Script al iniciar sesión.')
  }
  if (!data || data.success !== true || !data.token) {
    throw new GasClientError(`Apps Script rechazó el inicio de sesión: ${(data && data.error) || 'credenciales inválidas o sesión no emitida'}`)
  }
  return { token: data.token, user: data.user || null }
}

export async function callGasActionAsUser(action, params, token, options = {}) {
  const gasUrl = options.gasUrl ?? process.env.GAS_URL
  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? 30_000
  if (!gasUrl) throw new GasClientError('GAS_URL no está configurado.')
  if (!token) throw new GasClientError('Se requiere una sesión de usuario autenticada.')

  let response
  try {
    response = await fetchImpl(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, token, ...params }),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (err) {
    throw new GasClientError(`Error de red al llamar a Apps Script (acción "${action}"): ${err.message}`)
  }
  let data
  try {
    data = await response.json()
  } catch {
    throw new GasClientError(`Respuesta no-JSON de Apps Script (acción "${action}").`)
  }
  if (!data || data.success !== true) {
    throw rejectedUserAction(action, (data && data.error) || 'error desconocido')
  }
  return data.data
}
