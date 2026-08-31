import { callGasAction, GasClientError } from '../../lib/fiscal/orchestration/gasClient.js'
import { verifyFiscalDocumentToken } from '../../lib/fiscal/shareToken.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ success: false, error: 'Método no permitido' })
    return
  }

  try {
    const { facturaId, tipo } = verifyFiscalDocumentToken(req.query?.token)
    const doc = await callGasAction('getDocumentoFiscalParaDescarga', { facturaId, tipo }, { timeoutMs: 45_000 })
    const bytes = Buffer.from(doc.contentBase64, 'base64')
    res.setHeader('Content-Type', doc.mimeType || 'application/octet-stream')
    res.setHeader('Content-Disposition', `attachment; filename="${String(doc.filename || 'documento-fiscal').replace(/"/g, '')}"`)
    res.setHeader('X-Document-Sha256', doc.sha256 || '')
    res.setHeader('Cache-Control', 'private, no-store')
    res.status(200).send(bytes)
  } catch (err) {
    const message = err instanceof GasClientError ? err.message : (err.message || 'El enlace de descarga no está disponible.')
    res.status(403).json({ success: false, error: message })
  }
}
