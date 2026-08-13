#!/usr/bin/env node
/**
 * PRE-FLIGHT FINAL antes de la primera transmisión real a SRI Pruebas.
 * Ejecuta esto TÚ, localmente — nunca este asistente. Firma con el .p12 real
 * ÚNICAMENTE en memoria de este proceso. Este script NO escribe ningún estado
 * persistente: no reserva, no consume ni incrementa ningún secuencial. El
 * secuencial usado aquí es solo una PROPUESTA para poder construir y validar la
 * factura — la reserva real y definitiva ocurre recién, de forma atómica, en el
 * backend real (reservarSecuencialFiscal + LockService) inmediatamente antes del
 * envío, no aquí.
 *
 * Qué hace: genera clave de acceso (con el secuencial propuesto), arma el XML, lo
 * valida contra el XSD 2.1.0 oficial conservado en el repo, firma XAdES-BES,
 * verifica la firma de forma independiente, verifica vigencia del certificado, y
 * corre las comprobaciones de seguridad (ambiente=1, endpoint celcer,
 * SRI_ALLOW_PRODUCTION apagado, producto TEST_ONLY, receptor sin PII).
 *
 * Qué NO hace: no envía nada por SOAP, no reserva ni consume secuenciales, no
 * escribe ningún archivo de estado. Imprime el resumen y se detiene ahí, siempre —
 * no hay ninguna ruta de código en este archivo que llame a enviarRecepcion ni a
 * ningún endpoint del SRI.
 *
 * Uso (ruta del .p12 y contraseña se piden de forma interactiva):
 *   node scripts/preflight-sri-pruebas.mjs
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createInterface } from 'node:readline'

import { parseP12, checkCertificateValidity, privateKeyToPem, certificateToPemAndBase64, P12FormatError, P12PasswordError, P12ValidityError } from '../lib/fiscal/p12.js'
import { generateClaveAcceso, validateClaveAcceso } from '../lib/fiscal/claveAcceso.js'
import { buildFacturaXml, FacturaXmlError } from '../lib/fiscal/facturaXml.js'
import { signFacturaXml, verifyFacturaXmlSignature } from '../lib/fiscal/xadesSign.js'
import { resolveSriEndpoint } from '../lib/fiscal/sri/config.js'

// ── Datos fijos, verificados, NO secretos ──────────────────────────────────
const EMISOR = {
  ruc: '0691787373001',
  razonSocial: 'RESEARCH ASSESSOR TRAINING S.A.S.',
  nombreComercial: 'RA-TRAINING',
  dirMatriz: 'Barrio de los Maestros, calle Bielorusia, Riobamba, Chimborazo',
  obligadoContabilidad: true,
}
const ESTABLISHMENT = '001'
const EMISSION_POINT = '002'
const SECUENCIAL_PROPUESTO_DEFECTO = '000000001'
const ITEM_CODIGO = 'PRUEBA_TECNICA_SRI'
const ITEM_DESCRIPCION = 'Prueba técnica de certificación — Ambiente de Pruebas SRI'
const PRECIO_UNITARIO_CENTS = 100 // USD 1.00
const RECEPTOR = { tipoIdentificacion: 'consumidorFinal', identificacion: '9999999999999', razonSocial: 'CONSUMIDOR FINAL' }

const XSD_PATH = join(process.cwd(), 'docs/fiscal/sri-official/schemas/factura_V2.1.0.xsd')
const FISCAL_GS_PATH = join(process.cwd(), 'apps-script/Fiscal.gs')

// Archivos temporales solo para que xmllint pueda leer el XML (no son secretos: es
// el propio XML que se va a mostrar en el resumen). Se borran siempre al terminar.
const runId = randomUUID()
const tmpUnsignedPath = join(tmpdir(), `preflight-sri-unsigned-${runId}.xml`)
const tmpSignedPath = join(tmpdir(), `preflight-sri-signed-${runId}.xml`)

const checks = []
function check(nombre, pasa, detalle) {
  checks.push({ nombre, pasa: !!pasa, detalle })
  if (!pasa) throw new Error(`PRE-FLIGHT DETENIDO en "${nombre}": ${detalle || 'comprobación falló'}`)
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

function verificarTestOnlyEnCatalogoFuente() {
  const fuente = readFileSync(FISCAL_GS_PATH, 'utf8')
  const idx = fuente.indexOf(`CodigoInterno: '${ITEM_CODIGO}'`)
  const bloque = fuente.slice(Math.max(0, idx - 20), idx + 200)
  return /TestOnly:\s*true/.test(bloque)
}

function limpiarTemporales() {
  for (const path of [tmpUnsignedPath, tmpSignedPath]) {
    try { rmSync(path, { force: true }) } catch { /* no bloquea el resultado del preflight */ }
  }
}

async function main() {
  console.log('=== PRE-FLIGHT FINAL — primera transmisión real a SRI Pruebas ===\n')
  console.log('Este script NO envía nada por SOAP y NO reserva ni consume ningún secuencial.')
  console.log('Solo prepara y valida una factura de prueba con un secuencial PROPUESTO.\n')

  const p12Path = (process.argv[2] || (await ask('Ruta completa del archivo .p12 real: '))).trim()
  if (!existsSync(p12Path)) { console.error(`No se encontró: ${p12Path}`); process.exitCode = 1; return }
  let password = await askHidden('Contraseña del .p12 (no se mostrará): ')

  const secuencialInput = (await ask(
    `Secuencial PROPUESTO de prueba para construir/validar la factura (no se reserva). Enter para usar el valor por defecto ${SECUENCIAL_PROPUESTO_DEFECTO}: `
  )).trim()
  const secuencial = secuencialInput === '' ? SECUENCIAL_PROPUESTO_DEFECTO : secuencialInput.padStart(9, '0')
  if (!/^\d{9}$/.test(secuencial)) {
    console.error(`Secuencial inválido: "${secuencialInput}" (debe ser numérico, hasta 9 dígitos).`)
    process.exitCode = 1
    return
  }

  try {
    // ── Certificado ──────────────────────────────────────────────────────
    const buffer = readFileSync(p12Path)
    const { certificate, privateKey } = parseP12(buffer, password)
    let vigenciaOk = true
    try {
      checkCertificateValidity(certificate)
    } catch (err) {
      if (err instanceof P12ValidityError) vigenciaOk = false
      else throw err
    }
    check('Certificado vigente', vigenciaOk, 'el certificado está vencido o aún no es válido')

    const { pem: certificatePem, base64: certificateBase64 } = certificateToPemAndBase64(certificate)
    const privateKeyPem = privateKeyToPem(privateKey)
    const signingKeys = { privateKeyPem, certificatePem, certificateBase64, certificate }

    // ── 1-2. Clave de acceso + validación 49 dígitos/módulo 11 ────────────
    // El secuencial usado aquí es PROPUESTO, no reservado: esta función es pura y
    // no toca ningún backend (ver generateClaveAcceso en claveAcceso.js).
    const issueDate = new Date()
    const generado = generateClaveAcceso({
      issueDate, ruc: EMISOR.ruc, environment: 'test',
      establishment: ESTABLISHMENT, emissionPoint: EMISSION_POINT, sequential: secuencial,
    })
    const claveAcceso = generado.claveAcceso
    const validacionClave = validateClaveAcceso(claveAcceso)
    check('Clave de acceso: 49 dígitos y módulo 11', validacionClave.valid, validacionClave.reason)
    check('Ambiente = 1 (PRUEBAS) en la clave de acceso', claveAcceso.slice(23, 24) === '1', 'la clave de acceso no codifica ambiente PRUEBAS')

    // ── 3. Generación de XML ───────────────────────────────────────────────
    const baseCents = PRECIO_UNITARIO_CENTS // cantidad=1, sin descuento
    const xml = buildFacturaXml({
      environment: 'test',
      razonSocial: EMISOR.razonSocial,
      nombreComercial: EMISOR.nombreComercial,
      ruc: EMISOR.ruc,
      claveAcceso,
      establishment: ESTABLISHMENT,
      emissionPoint: EMISSION_POINT,
      sequential: secuencial,
      dirMatriz: EMISOR.dirMatriz,
      fechaEmision: issueDate,
      obligadoContabilidad: EMISOR.obligadoContabilidad,
      buyer: RECEPTOR,
      totalSinImpuestosCents: baseCents,
      totalDescuentoCents: 0,
      importeTotalCents: baseCents,
      impuestosTotales: [{ codigo: '2', codigoPorcentaje: '0', tarifa: '0.00', baseImponibleCents: baseCents, valorCents: 0 }],
      pagos: [{ formaPago: '20', totalCents: baseCents }],
      detalles: [{
        codigoPrincipal: ITEM_CODIGO,
        descripcion: ITEM_DESCRIPCION,
        cantidad: 1,
        precioUnitario: 1,
        descuentoCents: 0,
        precioTotalSinImpuestoCents: baseCents,
        impuestos: [{ codigo: '2', codigoPorcentaje: '0', tarifa: '0.00', baseImponibleCents: baseCents, valorCents: 0 }],
      }],
    })
    check('XML generado', true)
    check('<ambiente>1</ambiente> presente en el XML', xml.includes('<ambiente>1</ambiente>'), 'el XML no marca ambiente PRUEBAS')

    // ── 4. Validación contra el XSD oficial 2.1.0 ──────────────────────────
    let xsdOk = false
    writeFileSync(tmpUnsignedPath, xml, 'utf8')
    try {
      execFileSync('xmllint', ['--noout', '--schema', XSD_PATH, tmpUnsignedPath], { stdio: 'pipe' })
      xsdOk = true
    } catch {
      xsdOk = false
    }
    check('Validación XSD (factura_V2.1.0.xsd oficial)', xsdOk, 'el XML no valida contra el XSD oficial conservado en el repo')

    // ── 5. Firma con el P12 real, únicamente en memoria ────────────────────
    const signedXml = signFacturaXml(xml, signingKeys)
    check('XML firmado (XAdES-BES)', signedXml.includes('<ds:Signature'))

    // ── 4b. El XML FIRMADO también debe seguir validando contra el XSD ─────
    writeFileSync(tmpSignedPath, signedXml, 'utf8')
    let xsdFirmadoOk = false
    try {
      execFileSync('xmllint', ['--noout', '--schema', XSD_PATH, tmpSignedPath], { stdio: 'pipe' })
      xsdFirmadoOk = true
    } catch { xsdFirmadoOk = false }
    check('XML firmado sigue validando contra el XSD', xsdFirmadoOk)

    // ── 6. Verificación criptográfica independiente de la firma ───────────
    const verificacion = verifyFacturaXmlSignature(signedXml)
    check('Verificación criptográfica independiente de la firma', verificacion.valid, verificacion.reason)

    // ── 9. Endpoint celcer ──────────────────────────────────────────────────
    const hostRecepcion = resolveSriEndpoint('test', 'recepcion')
    const hostAutorizacion = resolveSriEndpoint('test', 'autorizacion')
    check('Endpoint de Recepción contiene celcer.sri.gob.ec', hostRecepcion.includes('celcer.sri.gob.ec'), hostRecepcion)
    check('Endpoint de Autorización contiene celcer.sri.gob.ec', hostAutorizacion.includes('celcer.sri.gob.ec'), hostAutorizacion)
    check('Ningún endpoint apunta a cel.sri.gob.ec (Producción)', !hostRecepcion.includes('cel.sri.gob.ec/') && !hostAutorizacion.includes('cel.sri.gob.ec/'))

    // ── 10. SRI_ALLOW_PRODUCTION apagado ───────────────────────────────────
    check('SRI_ALLOW_PRODUCTION NO habilitado', process.env.SRI_ALLOW_PRODUCTION !== 'true', `valor actual: ${process.env.SRI_ALLOW_PRODUCTION || '(no configurado)'}`)

    // ── 11. Producto TEST_ONLY (verificado contra la fuente real de Fiscal.gs) ─
    check('Producto marcado TestOnly=true en apps-script/Fiscal.gs', verificarTestOnlyEnCatalogoFuente(), `código esperado: ${ITEM_CODIGO}`)

    // ── 12. Sin PII real del receptor ──────────────────────────────────────
    check('Receptor sin PII real (CONSUMIDOR FINAL / 9999999999999)', RECEPTOR.razonSocial === 'CONSUMIDOR FINAL' && RECEPTOR.identificacion === '9999999999999' && RECEPTOR.tipoIdentificacion === 'consumidorFinal')

    // ── Resumen sanitizado (exactamente lo pedido, nada más) ───────────────
    console.log('\n=== RESUMEN PRE-FLIGHT (nada enviado todavía, nada reservado) ===\n')
    console.log(`Ambiente: PRUEBAS (1)`)
    console.log(`Host de Recepción: ${hostRecepcion}`)
    console.log(`Host de Autorización: ${hostAutorizacion}`)
    console.log(`Razón social emisor: ${EMISOR.razonSocial}`)
    console.log(`RUC emisor: ${EMISOR.ruc}`)
    console.log(`Establecimiento: ${ESTABLISHMENT}`)
    console.log(`Punto de emisión: ${EMISSION_POINT}`)
    console.log(`Secuencial: ${secuencial}  ←  SECUENCIAL PROPUESTO — NO RESERVADO`)
    console.log(`Clave de acceso: ${claveAcceso}`)
    console.log(`Fecha de emisión: ${issueDate.toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })}`)
    console.log(`Receptor de pruebas: ${RECEPTOR.razonSocial} (tipo 07, ID ${RECEPTOR.identificacion})`)
    console.log(`Descripción: ${ITEM_DESCRIPCION}`)
    console.log(`Subtotal: USD 1.00`)
    console.log(`IVA (fixture TEST_ONLY, no confirma catálogo productivo): USD 0.00 (0%)`)
    console.log(`Total: USD 1.00`)
    console.log('')
    checks.forEach(c => console.log(`${c.nombre}: ${c.pasa ? 'PASS' : 'FAIL'}`))
    console.log('\nNingún dato del .p12 (contraseña, base64, clave privada) fue impreso.')
    console.log('NO se envió nada por SOAP. Este script no escribió ningún estado persistente')
    console.log('ni reservó ni consumió el secuencial de arriba — es solo una propuesta para')
    console.log('construir y validar la factura. La reserva atómica real ocurrirá recién,')
    console.log('mediante reservarSecuencialFiscal + LockService en el backend real,')
    console.log('inmediatamente antes del envío. Este script termina aquí.')
  } catch (err) {
    if (err instanceof P12PasswordError || err instanceof P12FormatError) {
      console.error(`\nDETENIDO: ${err.message}`)
    } else if (err instanceof FacturaXmlError) {
      console.error(`\nDETENIDO al construir el XML: ${err.message}`)
    } else {
      console.error(`\nDETENIDO: ${err.message}`)
    }
    console.log('\nEstado de las comprobaciones hasta el momento de detenerse:')
    checks.forEach(c => console.log(`${c.nombre}: ${c.pasa ? 'PASS' : 'FAIL'}`))
    process.exitCode = 1
  } finally {
    password = null
    limpiarTemporales()
  }
}

main()
