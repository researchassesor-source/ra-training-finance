#!/usr/bin/env node
/**
 * Verifica LOCALMENTE si el runtime real de la app (node-forge, vía
 * lib/fiscal/p12.js — la misma función que usará la firma en producción) puede abrir
 * un .p12 dado. No firma nada, no envía nada, no convierte ni exporta el certificado,
 * no lo importa al almacén de Windows. Solo intenta abrirlo y, si lo logra, imprime
 * metadatos públicos (Subject, Issuer, vigencia, tamaño de clave).
 *
 * Nunca imprime la contraseña ni la clave privada ni ningún base64 del archivo.
 *
 * Uso (ruta y contraseña se piden de forma interactiva, nunca como argumentos):
 *   node scripts/verify-p12-local.mjs
 */
import { createInterface } from 'node:readline'
import { existsSync, readFileSync } from 'node:fs'
import { parseP12, getCertificateMetadata, checkCertificateValidity, P12FormatError, P12PasswordError, P12ValidityError } from '../lib/fiscal/p12.js'

const ENTER_CODES = new Set([13, 10]) // \r \n
const CTRL_C_CODE = 3
const BACKSPACE_CODES = new Set([8, 127]) // BS, DEL

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(resolve => rl.question(question, answer => { rl.close(); resolve(answer) }))
}

/**
 * Prompt oculto en una TTY real (sin eco, igual que Read-Host -AsSecureString).
 * Trabaja a nivel de bytes/código de carácter (no de string) para no depender de
 * comparar literales de control invisibles. Si no hay TTY (p. ej. al testear el
 * script en un pipe), cae a lectura de una línea normal — nunca ocurre así en un uso
 * interactivo real en la terminal del usuario.
 */
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
    const onData = chunk => {
      const code = chunk.charCodeAt(0)
      if (ENTER_CODES.has(code)) {
        stdin.setRawMode(false)
        stdin.pause()
        stdin.removeListener('data', onData)
        process.stdout.write('\n')
        resolve(value)
        return
      }
      if (code === CTRL_C_CODE) {
        process.stdout.write('\n')
        process.exit(130)
      }
      if (BACKSPACE_CODES.has(code)) {
        value = value.slice(0, -1)
        return
      }
      value += chunk
    }
    stdin.on('data', onData)
  })
}

async function main() {
  const p12Path = (process.argv[2] || (await ask('Ruta completa del archivo .p12: '))).trim()
  if (!existsSync(p12Path)) {
    console.error(`No se encontró el archivo: ${p12Path}`)
    process.exitCode = 1
    return
  }

  let password = await askHidden('Contraseña del .p12 (no se mostrará): ')

  try {
    const buffer = readFileSync(p12Path)
    const { certificate } = parseP12(buffer, password)

    console.log('\nnode-forge (runtime real de la app) abrió el .p12 correctamente.\n')

    const metadata = getCertificateMetadata(certificate)
    console.log('Metadatos públicos del certificado:')
    console.log(`  Subject CN:           ${metadata.subjectCN}`)
    console.log(`  Subject SERIALNUMBER: ${metadata.subjectSerialNumber}`)
    console.log(`  Issuer CN:            ${metadata.issuerCN}`)
    console.log(`  Issuer Organization:  ${metadata.issuerOrganization}`)
    console.log(`  Nº de serie:          ${metadata.serialNumber}`)
    console.log(`  Vigente desde:        ${metadata.notBefore.toISOString()}`)
    console.log(`  Vigente hasta:        ${metadata.notAfter.toISOString()}`)
    console.log(`  Tamaño de clave:      ${metadata.keyLengthBits} bits`)
    console.log(`  Huella SHA-256:       ${metadata.sha256Fingerprint}`)

    try {
      const { daysRemaining } = checkCertificateValidity(certificate)
      console.log(`  Vigencia:             OK (${daysRemaining} días restantes)`)
    } catch (err) {
      if (err instanceof P12ValidityError) {
        console.log(`  Vigencia:             INVALIDA - ${err.message}`)
      } else {
        throw err
      }
    }

    console.log('\nEsto NO confirma por sí solo que el certificado esté legítimamente')
    console.log('asociado al RUC 0691787373001 ni al representante legal — eso requiere')
    console.log('revisión humana de los datos de arriba contra los documentos oficiales.')
  } catch (err) {
    if (err instanceof P12PasswordError) {
      console.error(`\nERROR: ${err.message}`)
      console.error('(node-forge tampoco pudo abrirlo con esta contraseña — no sería un problema exclusivo de OpenSSL.)')
    } else if (err instanceof P12FormatError) {
      console.error(`\nERROR: ${err.message}`)
    } else {
      console.error(`\nError inesperado: ${err.message}`)
    }
    process.exitCode = 1
  } finally {
    password = null
  }
}

main()
