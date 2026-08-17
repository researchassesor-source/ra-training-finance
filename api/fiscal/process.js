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
import { XadesSignError, XadesVerifyError } from '../../lib/fiscal/xadesSign.js'
import { getFiscalUserToken } from '../../lib/fiscal/httpAuth.js'

/**
 * Registra SOLO error.name y error.code (si existe) -- nunca error.message ni ningún
 * otro dato del error. Un XadesSignError puede envolver, por ejemplo, un fragmento del
 * mensaje de un parser XML sobre el propio comprobante (datos del comprador, montos),
 * así que su `.message` no se trata como seguro para logs aunque el error lo genere
 * nuestro propio código -- ver la lista explícita de NUNCA-loguear de este endpoint:
 * P12, P12 Base64, password, privateKeyPem, certificateBase64, XML completo,
 * FISCAL_SERVICE_TOKEN, token de sesión, body completo.
 */
function logSanitizedError(context, err) {
  const safe = { name: err?.name || 'Error' }
  if (err?.code) safe.code = err.code
  console.error(`[api/fiscal/process] ${context}`, safe)
}

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
    if (err instanceof XadesSignError || err instanceof XadesVerifyError) {
      logSanitizedError('Fallo al generar/verificar la firma XAdES de la factura', err)
      res.status(500).json({
        success: false,
        code: 'FISCAL_SIGNING_FAILED',
        error: 'No se pudo generar la firma electrónica del comprobante.',
      })
      return
    }
    if (err instanceof GasClientError) {
      logSanitizedError('Fallo del cliente de Apps Script al continuar el flujo de la factura', err)
      res.status(502).json({ success: false, error: err.message })
      return
    }
    logSanitizedError('Fallo no clasificado al continuar el flujo de la factura', err)
    res.status(502).json({ success: false, error: 'No se pudo procesar la factura.' })
  }
}
