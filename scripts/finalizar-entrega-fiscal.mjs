#!/usr/bin/env node
import { callGasAction } from '../lib/fiscal/orchestration/gasClient.js'
import { finalizarEntregaFiscal } from '../lib/fiscal/orchestration/facturaOrchestrator.js'

const facturaId = process.argv[2] || 'FACT_1786427014475_WZ5MR'

function assertConfigured(name) {
  if (!process.env[name] || String(process.env[name]).trim() === '') {
    throw new Error(`${name} no está configurado.`)
  }
}

assertConfigured('GAS_URL')
assertConfigured('FISCAL_SERVICE_TOKEN')

console.log('=== Cierre de entrega fiscal autorizada ===')
console.log(`FacturaID: ${facturaId}`)
console.log('No se llama al SRI. No se crea otra factura. No se reserva otro secuencial.')

const gasOptions = {
  gasUrl: process.env.GAS_URL,
  serviceToken: process.env.FISCAL_SERVICE_TOKEN,
  timeoutMs: 45_000,
}

const result = await finalizarEntregaFiscal(facturaId, { gasOptions })

const ride = await callGasAction('getDocumentoFiscalParaDescarga', { facturaId, tipo: 'RIDE' }, gasOptions)
const xml = await callGasAction('getDocumentoFiscalParaDescarga', { facturaId, tipo: 'XML_AUTORIZADO' }, gasOptions)
const { factura } = await callGasAction('getFacturaFiscalCompleta', { facturaId }, gasOptions)

console.log(JSON.stringify({
  outcome: result.outcome,
  facturaId: factura.ID,
  status: factura.Status,
  sriAuthorizationStatus: factura.SriAuthorizationStatus,
  authorizationNumberSet: Boolean(factura.AuthorizationNumber),
  authorizationDateSet: Boolean(factura.AuthorizationDate),
  rideReferenceSet: Boolean(factura.RideReference),
  sha256RideSet: Boolean(factura.Sha256Ride),
  rideRecoverable: Boolean(ride.contentBase64 && ride.sha256 === factura.Sha256Ride),
  xmlRecoverable: Boolean(xml.contentBase64 && xml.sha256 === factura.Sha256Authorized),
  rideIdempotent: result.rideIdempotent,
  closeIdempotent: result.closeIdempotent,
}, null, 2))
