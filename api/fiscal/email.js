import { callGasActionAsUser, GasClientError } from '../../lib/fiscal/orchestration/gasClient.js'
import { getFiscalUserToken } from '../../lib/fiscal/httpAuth.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Método no permitido' })
    return
  }

  const body = req.body || {}
  const { facturaId, email = '' } = body
  const token = getFiscalUserToken(req, body)
  if (!token || !facturaId) {
    res.status(400).json({ success: false, error: 'token y facturaId son obligatorios.' })
    return
  }

  try {
    const data = await callGasActionAsUser('enviarFacturaFiscalEmail', { facturaId, email }, token, { timeoutMs: 45_000 })
    res.status(200).json({ success: true, data })
  } catch (err) {
    const message = err instanceof GasClientError ? err.message : 'No se pudo enviar la factura por email.'
    res.status(502).json({ success: false, error: message })
  }
}
