#!/usr/bin/env node
/**
 * Paso 8 del despliegue del módulo fiscal: reservar, UNA SOLA VEZ, la factura
 * técnica TEST_ONLY (001-002) contra el backend real de Apps Script/Sheets.
 *
 * Qué hace: crearBorradorFactura (idempotente por idempotencyKey fija — reintentar
 * este script nunca crea una segunda factura) + reservarSecuencialFiscal sobre ese
 * mismo borrador.
 *
 * Qué NO hace: no firma, no genera XML, no toca el .p12, no llama al SRI. Termina
 * ahí siempre — no hay ninguna ruta de código en este archivo hacia
 * enviarRecepcion ni ningún endpoint SOAP.
 *
 * Requiere, como variables de entorno (nunca como argumento, nunca impresas):
 *   GAS_URL               - URL /exec del despliegue real de Apps Script.
 *   FISCAL_SERVICE_TOKEN   - el secreto de la Script Property del mismo nombre.
 *
 * Uso:
 *   GAS_URL="https://script.google.com/macros/s/AKfycb.../exec" \
 *   FISCAL_SERVICE_TOKEN="..." \
 *   node scripts/reservar-factura-test-only.mjs
 */
import { callGasAction, GasClientError } from '../lib/fiscal/orchestration/gasClient.js'

const EMISOR_RUC = '0691787373001'
const ESTABLISHMENT = '001'
const EMISSION_POINT = '002'
const ITEM_CODIGO = 'PRUEBA_TECNICA_SRI'
const ITEM_DESCRIPCION = 'Prueba técnica de certificación — Ambiente de Pruebas SRI'
const PRECIO_UNITARIO_CENTS = 100 // USD 1.00
const IDEMPOTENCY_KEY = 'PREFLIGHT-TEST-ONLY-001-002-v1'

async function main() {
  const gasUrl = process.env.GAS_URL
  const serviceToken = process.env.FISCAL_SERVICE_TOKEN
  if (!gasUrl) { console.error('Falta la variable de entorno GAS_URL.'); process.exitCode = 1; return }
  if (!serviceToken) { console.error('Falta la variable de entorno FISCAL_SERVICE_TOKEN.'); process.exitCode = 1; return }

  console.log('=== Reserva única de la factura técnica TEST_ONLY (001-002) ===\n')
  console.log('No se firma nada, no se genera XML, no se llama al SRI. Solo Sheets.\n')

  try {
    const borrador = await callGasAction('crearBorradorFactura', {
      idempotencyKey: IDEMPOTENCY_KEY,
      environment: 'test',
      issuerRuc: EMISOR_RUC,
      buyerIdentificationType: 'consumidorFinal',
      buyerIdentification: '9999999999999',
      buyerName: 'CONSUMIDOR FINAL',
      currency: 'USD',
      taxTotal: 0,
      items: [{
        codigo: ITEM_CODIGO,
        descripcion: ITEM_DESCRIPCION,
        cantidad: 1,
        precioUnitarioCents: PRECIO_UNITARIO_CENTS,
        descuentoCents: 0,
        taxRateBasisPoints: 0,
        sriTaxCode: '0',
        baseCents: PRECIO_UNITARIO_CENTS,
        totalCents: PRECIO_UNITARIO_CENTS,
      }],
    }, { gasUrl, serviceToken })

    console.log(`Borrador: ${borrador.idempotent ? 'ya existía (idempotente, no se creó otro)' : 'creado ahora'}`)
    console.log(`FacturaID: ${borrador.ID}`)
    console.log(`Status: ${borrador.Status}`)

    if (borrador.Status !== 'DRAFT') {
      console.log(`\nLa factura ya no está en DRAFT (Status=${borrador.Status}) — no se vuelve a intentar reservar.`)
      console.log('Si ya tiene Establishment/Sequential asignado, ese es el secuencial real. Deteniéndome aquí.')
      return
    }

    const reserva = await callGasAction('reservarSecuencialFiscal', {
      facturaId: borrador.ID,
      establishment: ESTABLISHMENT,
      emissionPoint: EMISSION_POINT,
      documentType: '01',
    }, { gasUrl, serviceToken })

    console.log('\n=== RESERVA CONFIRMADA (nada enviado al SRI) ===\n')
    console.log(`FacturaID: ${borrador.ID}`)
    console.log(`Environment: ${reserva.environment}`)
    console.log(`Establecimiento: ${reserva.establishment}`)
    console.log(`Punto de emisión: ${reserva.emissionPoint}`)
    console.log(`Secuencial: ${reserva.sequential}`)
    console.log(`DocumentType: ${reserva.documentType}`)
    console.log('\nEsta es la factura real que debe firmarse y enviarse — no crear otra ni')
    console.log('reservar otro secuencial si algo falla más adelante; corregir/reanudar esta')
    console.log('misma FacturaID según la máquina de estados.')
    console.log('\nNada se envió por SOAP. Este script termina aquí.')
  } catch (err) {
    if (err instanceof GasClientError) {
      console.error(`\nDETENIDO: ${err.message}`)
    } else {
      console.error(`\nDETENIDO: ${err.message}`)
    }
    process.exitCode = 1
  }
}

main()
