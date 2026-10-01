/**
 * Descarga controlada de documentos fiscales autorizados (RIDE/XML).
 * La sesión humana se valida en Apps Script; no se exponen secretos ni referencias
 * internas de Drive al navegador.
 */

import { callGasActionAsUser, fiscalGasErrorResponse } from '../../lib/fiscal/orchestration/gasClient.js'
import { getFiscalUserToken } from '../../lib/fiscal/httpAuth.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ success: false, error: 'Método no permitido' })
    return
  }

  res.setHeader('Cache-Control', 'private, no-store')
  res.setHeader('Vary', 'Authorization')
  const { facturaId, tipo = 'RIDE' } = req.query || {}
  const token = getFiscalUserToken(req)
  if (!token) {
    res.status(401).json({ success: false, error: 'Sesión inválida o expirada. Por favor inicia sesión de nuevo.' })
    return
  }
  if (!facturaId) {
    res.status(400).json({ success: false, error: 'facturaId es obligatorio.' })
    return
  }

  try {
    const doc = await callGasActionAsUser('getDocumentoFiscalParaDescarga', { facturaId, tipo }, token)
    const bytes = Buffer.from(doc.contentBase64, 'base64')
    res.setHeader('Content-Type', doc.mimeType || 'application/octet-stream')
    res.setHeader('Content-Disposition', `attachment; filename="${String(doc.filename || 'documento-fiscal').replace(/"/g, '')}"`)
    res.setHeader('X-Document-Sha256', doc.sha256 || '')
    res.status(200).send(bytes)
  } catch (err) {
    const failure = fiscalGasErrorResponse(err, 'No se pudo descargar el documento fiscal.')
    res.status(failure.status).json({ success: false, error: failure.error })
  }
}
