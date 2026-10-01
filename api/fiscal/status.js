/**
 * Handler delgado de solo lectura: consulta el estado persistido de una factura.
 * Misma autenticación que process.js (sesión de usuario, no secreto de servicio).
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
  const { facturaId } = req.query || {}
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
    const data = await callGasActionAsUser('getFacturaFiscalCompleta', { facturaId }, token)
    res.status(200).json({ success: true, data })
  } catch (err) {
    const failure = fiscalGasErrorResponse(err, 'No se pudo consultar la factura.')
    res.status(failure.status).json({ success: false, error: failure.error })
  }
}
