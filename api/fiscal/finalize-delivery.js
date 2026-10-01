/**
 * Cierra una factura autorizada: genera RIDE, lo almacena en Drive privado vía
 * Apps Script y deja la factura en DELIVERED. No firma ni llama al SRI.
 */

import { finalizarEntregaFiscal } from '../../lib/fiscal/orchestration/facturaOrchestrator.js'
import { callGasActionAsUser, GasClientError, fiscalGasErrorResponse } from '../../lib/fiscal/orchestration/gasClient.js'
import { getFiscalUserToken } from '../../lib/fiscal/httpAuth.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Método no permitido' })
    return
  }

  let body = req.body
  if (typeof body === 'string') {
    try { body = JSON.parse(body) } catch { return res.status(400).json({ success: false, error: 'JSON inválido' }) }
  }
  const { facturaId } = body || {}
  const token = getFiscalUserToken(req, body)
  if (!token) {
    res.status(401).json({ success: false, error: 'Sesión inválida o expirada. Por favor inicia sesión de nuevo.' })
    return
  }
  if (!facturaId) {
    res.status(400).json({ success: false, error: 'facturaId es obligatorio.' })
    return
  }

  try {
    await callGasActionAsUser('getFacturaFiscalCompleta', { facturaId }, token)
  } catch (err) {
    const failure = fiscalGasErrorResponse(err, 'No se pudo validar el acceso a la factura.')
    res.status(failure.status).json({ success: false, error: failure.error })
    return
  }

  try {
    const resultado = await finalizarEntregaFiscal(facturaId, { gasOptions: {} })
    res.status(200).json({ success: true, data: resultado })
  } catch (err) {
    const message = err instanceof GasClientError ? err.message : 'No se pudo cerrar la entrega fiscal.'
    res.status(502).json({ success: false, error: message })
  }
}
