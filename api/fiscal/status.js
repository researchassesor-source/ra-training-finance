/**
 * Handler delgado de solo lectura: consulta el estado persistido de una factura.
 * Misma autenticación que process.js (sesión de usuario, no secreto de servicio).
 */

import { callGasActionAsUser } from '../../lib/fiscal/orchestration/gasClient.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ success: false, error: 'Método no permitido' })
    return
  }

  const { token, facturaId } = req.query || {}
  if (!token || !facturaId) {
    res.status(400).json({ success: false, error: 'token y facturaId son obligatorios.' })
    return
  }

  try {
    const data = await callGasActionAsUser('getFacturaFiscalCompleta', { facturaId }, token)
    res.status(200).json({ success: true, data })
  } catch {
    res.status(403).json({ success: false, error: 'No autorizado o factura no encontrada.' })
  }
}
