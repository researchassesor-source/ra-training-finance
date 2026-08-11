/**
 * Handler autenticado por secreto (no por sesión de usuario) — lo llama el
 * time-driven trigger de Apps Script, no un navegador. Procesa por lotes las
 * facturas RECIBIDA/PROCESSING que ya les toca sondear en Autorización.
 *
 * Dos secretos distintos, dos saltos de confianza distintos:
 * - FISCAL_POLL_SECRET: Apps Script -> este endpoint (se valida aquí).
 * - FISCAL_SERVICE_TOKEN: este endpoint -> Apps Script, vía gasClient (Fase 6,
 *   no aquí).
 * Ninguno de los dos se imprime jamás, ni siquiera en un mensaje de error.
 */

import { callGasAction, GasClientError } from '../../lib/fiscal/orchestration/gasClient.js'
import { consultarYActualizarAutorizacion } from '../../lib/fiscal/orchestration/facturaOrchestrator.js'
import { getActiveEnvironment } from '../../lib/fiscal/emisorConfig.js'

const DEFAULT_BATCH_SIZE = 20
const MAX_BATCH_SIZE = 50

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Método no permitido' })
    return
  }

  const expectedSecret = process.env.FISCAL_POLL_SECRET
  const providedSecret = req.headers['x-fiscal-poll-secret']
  if (!expectedSecret || !providedSecret || providedSecret !== expectedSecret) {
    // Mensaje deliberadamente genérico: no distingue "falta secreto" de "secreto
    // incorrecto" ni de "no configurado", para no dar pistas a quien no lo tiene.
    res.status(401).json({ success: false, error: 'No autorizado.' })
    return
  }

  let body = req.body
  if (typeof body === 'string') {
    try { body = JSON.parse(body) } catch { body = {} }
  }
  const limit = Math.min(Number(body?.limit) || DEFAULT_BATCH_SIZE, MAX_BATCH_SIZE)
  const environment = getActiveEnvironment()

  let pendientes
  try {
    pendientes = await callGasAction('listarFacturasPendientesDePolling', { environment, limit })
  } catch (err) {
    const message = err instanceof GasClientError ? err.message : 'Error al listar facturas pendientes.'
    res.status(502).json({ success: false, error: message })
    return
  }

  const resultados = []
  for (const factura of pendientes) {
    try {
      // eslint-disable-next-line no-await-in-loop -- procesamiento secuencial deliberado: evita saturar al SRI con ráfagas paralelas.
      const resultado = await consultarYActualizarAutorizacion(factura.ID, { environment })
      resultados.push({ facturaId: factura.ID, outcome: resultado.outcome })
    } catch (err) {
      // Un fallo en una factura no debe tumbar el lote completo.
      resultados.push({ facturaId: factura.ID, outcome: 'ERROR', error: err instanceof GasClientError ? err.message : 'Error inesperado.' })
    }
  }

  res.status(200).json({
    success: true,
    data: { environment, procesadas: resultados.length, resultados },
  })
}
