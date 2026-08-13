#!/usr/bin/env node
/**
 * Paso final: firmar y transmitir a SRI Pruebas la factura técnica TEST_ONLY que ya
 * fue reservada de verdad (001-002-000000001, FacturaID fijo abajo). Ejecuta esto
 * TÚ, localmente — nunca este asistente. Firma con el .p12 real ÚNICAMENTE en
 * memoria de este proceso.
 *
 * Nunca llama crearBorradorFactura ni reservarSecuencialFiscal — esta factura y su
 * secuencial ya existen y son definitivos; este script solo continúa su flujo.
 *
 * Usa exclusivamente lib/fiscal/orchestration/facturaOrchestrator.js (Fases 1-6):
 * generarYFirmarFactura, enviarFacturaARecepcion, consultarYActualizarAutorizacion,
 * reconciliarSubmittingEnvejecido — la máquina de estados, el mutex SUBMITTING y la
 * política de reconciliación ya implementados, sin reintentar nada por su cuenta.
 *
 * Antes de cualquier llamada a Recepción, pide escribir exactamente "ENVIAR UNA" en
 * la terminal. Cualquier otra respuesta termina el script sin enviar nada.
 *
 * Requiere, como variables de entorno (nunca impresas):
 *   GAS_URL               - URL /exec real de Apps Script (RATraining-Finanzas).
 *   FISCAL_SERVICE_TOKEN   - el secreto de la Script Property del mismo nombre.
 * Opcional para la reapertura NOT_AUTHORIZED, si no se desea escribirlos
 * interactivamente:
 *   FISCAL_ADMIN_USERNAME
 *   FISCAL_ADMIN_PASSWORD
 *
 * Uso:
 *   $env:GAS_URL="https://script.google.com/macros/s/AKfycb.../exec"
 *   $env:FISCAL_SERVICE_TOKEN="..."
 *   $env:FISCAL_ADMIN_USERNAME="admin"
 *   $env:FISCAL_ADMIN_PASSWORD="..."
 *   node scripts/enviar-primera-factura-sri-pruebas.mjs
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import { createInterface } from 'node:readline'

import { parseP12, checkCertificateValidity, privateKeyToPem, certificateToPemAndBase64, P12FormatError, P12PasswordError, P12ValidityError } from '../lib/fiscal/p12.js'
import { verifyFacturaXmlSignature } from '../lib/fiscal/xadesSign.js'
import { resolveSriEndpoint } from '../lib/fiscal/sri/config.js'
import { getEmisorConfig } from '../lib/fiscal/emisorConfig.js'
import { callGasAction, callGasActionAsUser, callGasLogin, GasClientError } from '../lib/fiscal/orchestration/gasClient.js'
import {
  buildXmlParaFactura,
  generarYFirmarFactura,
  enviarFacturaARecepcion,
  consultarYActualizarAutorizacion,
  reconciliarSubmittingEnvejecido,
} from '../lib/fiscal/orchestration/facturaOrchestrator.js'
import { generateClaveAcceso } from '../lib/fiscal/claveAcceso.js'
import { normalizeEstablishment, normalizeEmissionPoint, normalizeSequential, FiscalCodeNormalizationError } from '../lib/fiscal/normalizeFiscalCodes.js'

// ── Esta factura, y ninguna otra ────────────────────────────────────────────
const FACTURA_ID = 'FACT_1786427014475_WZ5MR'
const ESTABLISHMENT_ESPERADO = '001'
const EMISSION_POINT_ESPERADO = '002'
const SEQUENTIAL_ESPERADO = '000000001'
const ENVIRONMENT = 'test'
const CONFIRMACION_ESPERADA = 'ENVIAR UNA'

const XSD_PATH = join(process.cwd(), 'docs/fiscal/sri-official/schemas/factura_V2.1.0.xsd')
const runId = randomUUID()
const tmpPreviewPath = join(tmpdir(), `envio-sri-preview-${runId}.xml`)
const tmpSignedPath = join(tmpdir(), `envio-sri-signed-${runId}.xml`)

const checks = []
function check(nombre, pasa, detalle) {
  checks.push({ nombre, pasa: !!pasa, detalle })
  if (!pasa) throw new Error(`DETENIDO en "${nombre}": ${detalle || 'comprobación falló'}`)
}

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(resolve => rl.question(question, answer => { rl.close(); resolve(answer) }))
}

function askHidden(question) {
  if (!process.stdin.isTTY) {
    process.stdout.write(`${question} (entrada no interactiva, se leerá sin ocultar) `)
    return ask('')
  }
  return new Promise(resolve => {
    process.stdout.write(question)
    const stdin = process.stdin
    stdin.resume()
    stdin.setRawMode(true)
    stdin.setEncoding('utf8')
    let value = ''
    const ENTER = new Set([13, 10])
    const BACKSPACE = new Set([8, 127])
    const onData = chunk => {
      const code = chunk.charCodeAt(0)
      if (ENTER.has(code)) {
        stdin.setRawMode(false); stdin.pause(); stdin.removeListener('data', onData)
        process.stdout.write('\n'); resolve(value); return
      }
      if (code === 3) { process.stdout.write('\n'); process.exit(130) }
      if (BACKSPACE.has(code)) { value = value.slice(0, -1); return }
      value += chunk
    }
    stdin.on('data', onData)
  })
}

function validarXsd(xml, tmpPath) {
  writeFileSync(tmpPath, xml, 'utf8')
  try {
    execFileSync('xmllint', ['--noout', '--schema', XSD_PATH, tmpPath], { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

function limpiarTemporales() {
  for (const path of [tmpPreviewPath, tmpSignedPath]) {
    try { rmSync(path, { force: true }) } catch { /* no bloquea el resultado */ }
  }
}

function sha256Hex(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

async function obtenerSesionFiscalHumana(gasUrl) {
  const username = (process.env.FISCAL_ADMIN_USERNAME || (await ask('Usuario administrador fiscal: '))).trim()
  const password = process.env.FISCAL_ADMIN_PASSWORD || await askHidden('Contraseña del administrador fiscal (no se mostrará): ')
  const sesion = await callGasLogin(username, password, { gasUrl })
  if (!sesion.user || sesion.user.rol !== 'admin') {
    throw new Error('La sesión emitida no corresponde a un administrador fiscal.')
  }
  return sesion.token
}

async function main() {
  console.log('=== Envío de la primera factura real a SRI Pruebas ===\n')
  console.log(`FacturaID fija: ${FACTURA_ID} — no se crea ninguna otra, no se reserva otro secuencial.\n`)

  const gasUrl = process.env.GAS_URL
  const serviceToken = process.env.FISCAL_SERVICE_TOKEN
  if (!gasUrl) { console.error('Falta la variable de entorno GAS_URL.'); process.exitCode = 1; return }
  if (!serviceToken) { console.error('Falta la variable de entorno FISCAL_SERVICE_TOKEN.'); process.exitCode = 1; return }
  const gasOptions = { gasUrl, serviceToken }
  const sriOptions = {}

  try {
    // ── 1-4. Cargar ESTA factura y validar que es la que creemos que es ────
    const { factura, items } = await callGasAction('getFacturaFiscalCompleta', { facturaId: FACTURA_ID }, gasOptions)
    check('Factura encontrada', !!factura, `no existe FacturaID ${FACTURA_ID}`)
    check('FacturaID coincide', factura.ID === FACTURA_ID)

    // Normalizar ANTES de comparar — no relajar el check aceptando "1" como si fuera
    // "001": Sheets puede devolver estos campos sin ceros a la izquierda (celda no
    // formateada como Texto); se reconstruye el valor canónico y se compara ese,
    // estrictamente, contra lo esperado. Si el dato no es reconstruible (no numérico
    // o de ancho incorrecto), normalizeEstablishment/etc. lanzan — no se oculta.
    let establishmentReal, emissionPointReal, sequentialReal
    try {
      establishmentReal = normalizeEstablishment(factura.Establishment)
      emissionPointReal = normalizeEmissionPoint(factura.EmissionPoint)
      sequentialReal = normalizeSequential(factura.Sequential)
    } catch (err) {
      if (err instanceof FiscalCodeNormalizationError) {
        check('Códigos fiscales (Establishment/EmissionPoint/Sequential) reconstruibles', false, err.message)
      }
      throw err
    }
    check('Establecimiento = 001', establishmentReal === ESTABLISHMENT_ESPERADO, `valor crudo de Sheets: ${JSON.stringify(factura.Establishment)}, normalizado: ${establishmentReal}`)
    check('Punto de emisión = 002', emissionPointReal === EMISSION_POINT_ESPERADO, `valor crudo de Sheets: ${JSON.stringify(factura.EmissionPoint)}, normalizado: ${emissionPointReal}`)
    check('Secuencial = 000000001', sequentialReal === SEQUENTIAL_ESPERADO, `valor crudo de Sheets: ${JSON.stringify(factura.Sequential)}, normalizado: ${sequentialReal}`)
    check('environment = test', factura.Environment === ENVIRONMENT, `actual: ${factura.Environment}`)
    console.log(`Status actual de la factura: ${factura.Status}\n`)

    // ── Reanudación segura: nunca reenvía a ciegas, nunca crea otra factura ─
    if (factura.Status === 'SUBMITTING') {
      console.log('La factura está en SUBMITTING (un intento anterior quedó a mitad de camino).')
      console.log('Aplicando exclusivamente la reconciliación ya implementada — sin reenviar automáticamente.\n')
      const reconciliado = await reconciliarSubmittingEnvejecido(FACTURA_ID, { environment: ENVIRONMENT, gasOptions, sriOptions })
      console.log('Resultado de la reconciliación (sanitizado):', JSON.stringify(reconciliado, null, 2))
      console.log('\nEste script termina aquí. Si el resultado liberó la factura de vuelta a SIGNED,')
      console.log('una nueva ejecución de este mismo script puede continuar el flujo — no antes.')
      return
    }
    if (['RECEIVED', 'PROCESSING'].includes(factura.Status)) {
      console.log('La factura ya fue recibida por el SRI en una ejecución anterior — no se reenvía.')
      console.log('Realizando únicamente la consulta de Autorización que corresponde (una sola vez).\n')
      const autorizacion = await consultarYActualizarAutorizacion(FACTURA_ID, { environment: ENVIRONMENT, gasOptions, sriOptions })
      console.log('Resultado de Autorización (sanitizado):', JSON.stringify(autorizacion, null, 2))
      console.log('\nNo se hace polling continuo desde este script. Termina aquí.')
      return
    }
    // ── Reapertura tras corrección técnica (ej. bug de firma ya corregido) ──
    // NUNCA automática: solo aplica a ESTA factura TEST_ONLY, en test, con rechazo
    // previo confirmado, y requiere una sesión humana real emitida por login.
    // -- reabrirFacturaRechazadaParaCorreccion en Fiscal.gs no acepta serviceToken.
    if (factura.Status === 'NOT_AUTHORIZED') {
      const esCandidataEstrechaParaReapertura =
        ENVIRONMENT === 'test' &&
        FACTURA_ID === 'FACT_1786427014475_WZ5MR' &&
        establishmentReal === ESTABLISHMENT_ESPERADO &&
        emissionPointReal === EMISSION_POINT_ESPERADO &&
        sequentialReal === SEQUENTIAL_ESPERADO &&
        !!factura.LastSriMessage // existe rechazo previo registrado
      if (!esCandidataEstrechaParaReapertura) {
        console.log('NOT_AUTHORIZED, pero no cumple el guard estrecho de este script TEST_ONLY. No se hace nada.')
        return
      }
      console.log('La factura está NOT_AUTHORIZED (rechazo previo: ' + factura.LastSriMessage + ').')
      console.log('Para reabrirla se requiere login real de administrador fiscal; no se usa serviceToken ni tokens copiados del navegador.')
      const userToken = await obtenerSesionFiscalHumana(gasUrl)
      console.log(`Reabriendo ${FACTURA_ID} para corrección técnica (rechazo previo: ${factura.LastSriMessage})...`)
      const reabierta = await callGasActionAsUser(
        'reabrirFacturaRechazadaParaCorreccion',
        { facturaId: FACTURA_ID, motivo: 'Reintento tras corregir orden RFC2253 de X509IssuerName en XAdES-BES.' },
        userToken,
        { gasUrl },
      )
      console.log('Reabierta. Nuevo Status:', reabierta.Status)
      console.log('AccessKey/Sequential sin cambios:', reabierta.AccessKey === factura.AccessKey && reabierta.Sequential === factura.Sequential)
      console.log('\nVuelve a ejecutar este mismo script ahora para generar/firmar/enviar de nuevo.')
      return
    }

    if (!['SEQUENCE_RESERVED', 'GENERATED', 'SIGNED'].includes(factura.Status)) {
      console.log(`La factura está en estado terminal o no accionable (${factura.Status}). No se hace nada más.`)
      return
    }

    const emisor = getEmisorConfig()

    // ── 5-6. Vista previa del XML (sin persistir nada) + validación XSD ────
    // Solo para fallar rápido, antes de pedir la contraseña del .p12, si hubiera un
    // problema estructural. El XML real y definitivo lo genera generarYFirmarFactura
    // más abajo, con su propia clave de acceso persistida.
    const claveAccesoPreview = factura.AccessKey || generateClaveAcceso({
      issueDate: new Date(),
      ruc: emisor.ruc,
      environment: ENVIRONMENT,
      establishment: establishmentReal,
      emissionPoint: emissionPointReal,
      sequential: sequentialReal,
    }).claveAcceso
    const xmlPreview = buildXmlParaFactura(factura, items, claveAccesoPreview, emisor)
    check('XML generado (vista previa)', !!xmlPreview)
    check('Validación XSD (factura_V2.1.0.xsd oficial)', validarXsd(xmlPreview, tmpPreviewPath), 'la factura no valida contra el XSD oficial')

    // ── 7. P12 interactivo (ruta y contraseña ocultas) ─────────────────────
    const p12Path = (process.argv[2] || (await ask('Ruta completa del archivo .p12 real: '))).trim()
    if (!existsSync(p12Path)) { console.error(`No se encontró: ${p12Path}`); process.exitCode = 1; return }
    let password = process.env.FISCAL_P12_PASSWORD || await askHidden('Contraseña del .p12 (no se mostrará): ')

    let signedXml, claveAcceso, facturaFirmada
    try {
      const buffer = readFileSync(p12Path)
      const { certificate, privateKey } = parseP12(buffer, password)
      let vigenciaOk = true
      try { checkCertificateValidity(certificate) } catch (err) {
        if (err instanceof P12ValidityError) vigenciaOk = false
        else throw err
      }
      check('Certificado vigente', vigenciaOk)

      const { pem: certificatePem, base64: certificateBase64 } = certificateToPemAndBase64(certificate)
      const privateKeyPem = privateKeyToPem(privateKey)
      const signingKeys = { privateKeyPem, certificatePem, certificateBase64, certificate }

      // ── 8. Firma real: generarYFirmarFactura persiste GENERATED->SIGNED ──
      const resultado = await generarYFirmarFactura(FACTURA_ID, { environment: ENVIRONMENT, emisor, signingKeys, gasOptions })
      if (resultado.skipped) {
        console.log(`\n${resultado.reason}`)
        console.log('No se genera ni firma de nuevo. Este script termina aquí.')
        return
      }
      signedXml = resultado.signedXml
      claveAcceso = resultado.claveAcceso
      facturaFirmada = resultado.factura
      check('XML firmado (XAdES-BES)', signedXml.includes('<ds:Signature'))
    } finally {
      password = null
    }

    // ── Re-validar XSD sobre el XML firmado real (no solo la vista previa) ─
    check('XML firmado sigue validando contra el XSD', validarXsd(signedXml, tmpSignedPath))

    // ── 9. Verificación criptográfica independiente de la firma ────────────
    const verificacion = verifyFacturaXmlSignature(signedXml)
    check('Verificación criptográfica independiente de la firma', verificacion.valid, verificacion.reason)

    // ── 10-11. Endpoints: solo celcer, nunca cel (Producción) ──────────────
    const hostRecepcion = resolveSriEndpoint(ENVIRONMENT, 'recepcion')
    const hostAutorizacion = resolveSriEndpoint(ENVIRONMENT, 'autorizacion')
    check('Endpoint de Recepción contiene celcer.sri.gob.ec', hostRecepcion.includes('celcer.sri.gob.ec'), hostRecepcion)
    check('Endpoint de Autorización contiene celcer.sri.gob.ec', hostAutorizacion.includes('celcer.sri.gob.ec'), hostAutorizacion)
    check('Ningún endpoint apunta a cel.sri.gob.ec (Producción)', !hostRecepcion.includes('cel.sri.gob.ec/') && !hostAutorizacion.includes('cel.sri.gob.ec/'))

    // ── 12. SRI_ALLOW_PRODUCTION apagado ────────────────────────────────────
    check('SRI_ALLOW_PRODUCTION NO habilitado', process.env.SRI_ALLOW_PRODUCTION !== 'true', `valor actual: ${process.env.SRI_ALLOW_PRODUCTION || '(no configurado)'}`)

    // ── 13. Resumen sanitizado ───────────────────────────────────────────────
    console.log('\n=== RESUMEN — todavía nada enviado por SOAP ===\n')
    console.log(`FacturaID: ${FACTURA_ID}`)
    console.log(`Status previo al envío: ${facturaFirmada.Status}`)
    console.log(`Ambiente: PRUEBAS (test)`)
    console.log(`Host de Recepción: ${hostRecepcion}`)
    console.log(`Host de Autorización: ${hostAutorizacion}`)
    console.log(`Establecimiento/Punto/Secuencial: ${factura.Establishment}-${factura.EmissionPoint}-${factura.Sequential}`)
    console.log(`Clave de acceso: ${claveAcceso}`)
    console.log(`SHA-256 del XML firmado: ${sha256Hex(signedXml)}`)
    console.log('')
    checks.forEach(c => console.log(`${c.nombre}: ${c.pasa ? 'PASS' : 'FAIL'}`))
    console.log('\nNingún dato del .p12 (contraseña, base64, clave privada) ni el FISCAL_SERVICE_TOKEN fueron impresos.')

    // ── 14. Confirmación explícita ──────────────────────────────────────────
    const confirmacion = await ask(`\nEscriba ${CONFIRMACION_ESPERADA} para realizar exactamente una transmisión a SRI Pruebas: `)
    if (confirmacion.trim() !== CONFIRMACION_ESPERADA) {
      console.log('\nConfirmación no recibida tal cual. No se envió nada. Este script termina aquí.')
      return
    }

    // ── Recepción: exactamente una llamada, persistida vía la máquina de estados ─
    console.log('\nEnviando a Recepción (celcer.sri.gob.ec)...')
    const recepcion = await enviarFacturaARecepcion(FACTURA_ID, signedXml, { environment: ENVIRONMENT, gasOptions, sriOptions })
    console.log('\n=== Resultado de Recepción (sanitizado) ===')
    console.log(JSON.stringify(recepcion, null, 2))

    if (recepcion.outcome === 'RECEIVED') {
      console.log('\nRECIBIDA. Realizando una única consulta inmediata de Autorización...')
      const autorizacion = await consultarYActualizarAutorizacion(FACTURA_ID, { environment: ENVIRONMENT, gasOptions, sriOptions })
      console.log('\n=== Resultado de Autorización (sanitizado) ===')
      console.log(JSON.stringify(autorizacion, null, 2))
      console.log('\nNo se hace polling continuo desde este script. Termina aquí.')
      return
    }

    if (recepcion.outcome === 'RETURNED') {
      console.log('\nDEVUELTA por el SRI. Mensajes sanitizados arriba. Deteniéndome — no se reintenta ni se crea otra factura.')
      return
    }

    if (recepcion.outcome === 'ALREADY_IN_PROGRESS_OR_ADVANCED') {
      console.log('\nOtra ejecución ya hizo avanzar esta factura antes de esta llamada. No se reenvía. Termina aquí.')
      return
    }

    // TIMEOUT / NETWORK_ERROR / SOAP_FAULT / MALFORMED_RESPONSE
    console.log('\nResultado ambiguo de Recepción — no se sabe si el SRI recibió el comprobante')
    console.log('antes de que fallara la conexión. El claim se MANTIENE en SUBMITTING (no vuelve')
    console.log(`a SIGNED automáticamente). Mensaje sanitizado: ${recepcion.message || '(sin detalle)'}`)
    console.log('NO se reenvía en esta misma ejecución. Para continuar, ejecutar este mismo')
    console.log('script de nuevo más tarde: al leer la factura la verá en SUBMITTING y aplicará')
    console.log('reconciliarSubmittingEnvejecido, que consulta Autorización con la misma clave')
    console.log('antes de considerar liberar el claim para un reenvío controlado.')
  } catch (err) {
    if (err instanceof P12PasswordError || err instanceof P12FormatError) {
      console.error(`\nDETENIDO: ${err.message}`)
    } else if (err instanceof GasClientError) {
      console.error(`\nDETENIDO (Apps Script): ${err.message}`)
    } else {
      console.error(`\nDETENIDO: ${err.message}`)
    }
    console.log('\nEstado de las comprobaciones hasta el momento de detenerse:')
    checks.forEach(c => console.log(`${c.nombre}: ${c.pasa ? 'PASS' : 'FAIL'}`))
    process.exitCode = 1
  } finally {
    limpiarTemporales()
  }
}

main()
