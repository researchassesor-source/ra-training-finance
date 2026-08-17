/**
 * Único punto de extracción de la sesión de usuario (`token`) para los endpoints HTTP
 * `/api/fiscal/*` que autentican con la sesión humana (no con FISCAL_SERVICE_TOKEN).
 *
 * Antes, `fiscalFetch` (src/services/api.js) metía el token en la query string incluso
 * en POST, filtrándolo a los Vercel Logs y al historial del navegador
 * (`/api/fiscal/process?token=...`). El frontend corregido ya no genera `?token=`
 * nunca — pero este helper igual acepta `query.token` como último recurso, por si
 * algún llamador antiguo (una pestaña con el bundle previo cacheado, por ejemplo)
 * todavía lo envía así durante el despliegue; NUNCA es la vía preferida.
 *
 * Orden de prioridad, de más a menos preferido:
 *   1) Authorization: Bearer <token>
 *   2) body.token (solo en endpoints POST)
 *   3) query.token (fallback de compatibilidad, estrictamente temporal)
 */
export function getFiscalUserToken(req, parsedBody) {
  const authHeader = req?.headers?.authorization ?? req?.headers?.Authorization
  if (typeof authHeader === 'string') {
    const match = authHeader.match(/^Bearer\s+(.+)$/i)
    if (match && match[1].trim()) return match[1].trim()
  }

  const body = parsedBody !== undefined ? parsedBody : req?.body
  if (body && typeof body === 'object' && body.token) return String(body.token)

  const queryToken = req?.query?.token
  if (queryToken) return String(queryToken)

  return null
}
