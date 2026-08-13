/**
 * Handler delgado: dispara continuarFlujoFactura para UNA factura. Toda la lógica
 * vive en lib/fiscal/ — este archivo solo valida la sesión del usuario, carga las
 * llaves de firma desde el entorno (si están configuradas) y llama al orquestador.
 *
 * Autenticación: la sesión del usuario (`token`, la misma que usa el resto de la
 * app) se reenvía a Apps Script para que requireFiscalAdmin la valide igual que
 * cualquier otra acción administrativa — no se usa el secreto de servicio aquí,
 * ese es exclusivo de las llamadas internas del propio orquestador.
 */

import { continuarFlujoFactura } from '../../lib/fiscal/orchestration/facturaOrchestrator.js'
import { callGasActionAsUser, GasClientError } from '../../lib/fiscal/orchestration/gasClient.js'
import { loadSigningKeysFromEnv, SigningKeysNotConfiguredError } from '../../lib/fiscal/orchestration/loadSigningKeys.js'
import { getActiveEnvironment, getEmisorConfig } from '../../lib/fiscal/emisorConfig.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Método no permitido' })
    return
  }

  let body = req.body
  if (typeof body === 'string') {
    try { body = JSON.parse(body) } catch { return res.status(400).json({ success: false, error: 'JSON inválido' }) }
  }
  const { token, facturaId } = body || {}
  if (!token || !facturaId) {
    res.status(400).json({ success: false, error: 'token y facturaId son obligatorios.' })
    return
  }

  try {
    // Gate de autenticación + primera lectura en una sola llamada: si el usuario no
    // es admin, requireFiscalAdmin del lado de Apps Script rechaza aquí mismo.
    await callGasActionAsUser('getFacturaFiscalCompleta', { facturaId }, token)
  } catch (err) {
    res.status(403).json({ success: false, error: 'No autorizado.' })
    return
  }

  let signingKeys
  try {
    signingKeys = loadSigningKeysFromEnv()
  } catch (err) {
    if (err instanceof SigningKeysNotConfiguredError) {
      res.status(503).json({ success: false, error: 'El certificado de firma no está configurado en este entorno todavía.' })
      return
    }
    res.status(500).json({ success: false, error: 'No se pudo cargar el certificado de firma.' })
    return
  }

  const environment = getActiveEnvironment()
  try {
    const resultado = await continuarFlujoFactura(facturaId, {
      environment,
      emisor: getEmisorConfig(),
      signingKeys,
      gasOptions: {},
    })
    res.status(200).json({ success: true, data: resultado })
  } catch (err) {
    const message = err instanceof GasClientError ? err.message : 'No se pudo procesar la factura.'
    res.status(502).json({ success: false, error: message })
  }
}
