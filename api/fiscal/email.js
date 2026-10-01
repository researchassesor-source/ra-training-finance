import { callGasActionAsUser, fiscalGasErrorResponse } from '../../lib/fiscal/orchestration/gasClient.js'
import { getFiscalUserToken } from '../../lib/fiscal/httpAuth.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Método no permitido' })
    return
  }

  const body = req.body || {}
  const { facturaId, email = '' } = body
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
    const data = await callGasActionAsUser('enviarFacturaFiscalEmail', { facturaId, email }, token, { timeoutMs: 45_000 })
    res.status(200).json({ success: true, data })
  } catch (err) {
    const failure = fiscalGasErrorResponse(err, 'No se pudo enviar la factura por email.')
    res.status(failure.status).json({ success: false, error: failure.error })
  }
}
