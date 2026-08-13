#!/usr/bin/env node
/**
 * Lectura de solo lectura: qué sabe Finance sobre la serie 001-002 en Producción
 * (SecuenciaFiscal + FacturasFiscales), separado estrictamente de test. No reserva,
 * no firma, no llama al SRI. Requiere sesión humana real (FISCAL_USER_TOKEN) --
 * verificarConflictoSerieFiscal no acepta serviceToken.
 *
 * Uso:
 *   $env:GAS_URL="..."; $env:FISCAL_USER_TOKEN="<rat_token>"; node scripts/verificar-serie-produccion.mjs
 */
import { callGasActionAsUser, GasClientError } from '../lib/fiscal/orchestration/gasClient.js'

async function main() {
  const gasUrl = process.env.GAS_URL
  const userToken = process.env.FISCAL_USER_TOKEN
  if (!gasUrl) { console.error('Falta GAS_URL.'); process.exitCode = 1; return }
  if (!userToken) { console.error('Falta FISCAL_USER_TOKEN (sesión humana real).'); process.exitCode = 1; return }

  try {
    const resultado = await callGasActionAsUser(
      'verificarConflictoSerieFiscal',
      { establishment: '001', emissionPoint: '002', environment: 'production' },
      userToken,
      { gasUrl },
    )
    console.log('=== Lo que Finance conoce sobre 001-002 en PRODUCTION (solo lectura) ===\n')
    console.log(JSON.stringify(resultado, null, 2))
    console.log('\nEsto es SOLO lo que este módulo Finance conoce. No prueba que la serie')
    console.log('001-002 no se haya usado antes por otro medio (sistema previo, RUC en')
    console.log('SRI en Línea). Verificar eso requiere la consulta de comprobantes emitidos')
    console.log('en SRI en Línea con las credenciales reales de la empresa.')
  } catch (err) {
    console.error(err instanceof GasClientError ? err.message : String(err))
    process.exitCode = 1
  }
}

main()
