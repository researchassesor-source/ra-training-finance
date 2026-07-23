import { spawn } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { XMLValidator } from 'fast-xml-parser'
import type { DocumentType } from '../../domain/types.js'

export interface XmlValidationResult {
  wellFormed: boolean
  officialXsdAttempted: boolean
  officialXsdValid: boolean
  validator: string
  messages: string[]
}

const run = (command: string, args: string[], cwd: string): Promise<{ code: number; output: string }> => new Promise((resolvePromise) => {
  const child = spawn(command, args, { cwd, windowsHide: true, timeout: 15_000 })
  let output = ''
  child.stdout.on('data', (chunk) => { output += String(chunk) })
  child.stderr.on('data', (chunk) => { output += String(chunk) })
  child.on('error', (error) => resolvePromise({ code: -1, output: error.message }))
  child.on('close', (code) => resolvePromise({ code: code ?? -1, output }))
})

export class OfficialXsdValidator {
  constructor(
    private readonly resourceRoot = fileURLToPath(new URL('../../../resources/sri/xsd/', import.meta.url)),
    private readonly temporaryRoot = fileURLToPath(new URL('../../../var/tmp/', import.meta.url)),
  ) {}

  async validate(type: DocumentType, xml: string): Promise<XmlValidationResult> {
    const structural = XMLValidator.validate(xml)
    if (structural !== true) {
      return {
        wellFormed: false,
        officialXsdAttempted: false,
        officialXsdValid: false,
        validator: 'fast-xml-parser',
        messages: [structural.err.msg],
      }
    }
    await mkdir(this.temporaryRoot, { recursive: true })
    const filename = `validation-${process.pid}-${Date.now()}.xml`
    const absolute = resolve(this.temporaryRoot, filename)
    await writeFile(absolute, xml, 'utf8')
    const schema = type === 'INVOICE' ? 'factura_V1.1.0.xsd' : 'NotaCredito_V1.1.0.xsd'
    const result = await run('xmllint', ['--nonet', '--noout', '--schema', resolve(this.resourceRoot, schema), absolute], this.resourceRoot)
    await rm(absolute, { force: true })
    if (result.code === -1) {
      return {
        wellFormed: true,
        officialXsdAttempted: false,
        officialXsdValid: false,
        validator: 'xmllint no disponible',
        messages: ['Validación oficial XSD bloqueada: xmllint no está disponible. Use el contenedor documentado.'],
      }
    }
    return {
      wellFormed: true,
      officialXsdAttempted: true,
      officialXsdValid: result.code === 0,
      validator: 'xmllint + XSD oficial SRI 1.1.0',
      messages: result.output.trim() ? [result.output.trim()] : [],
    }
  }
}
