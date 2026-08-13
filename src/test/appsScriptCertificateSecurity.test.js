import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const code = fs.readFileSync(path.join(root, 'apps-script/Code.gs'), 'utf8')

function functionSource(name) {
  const start = code.indexOf(`function ${name}(`)
  if (start < 0) throw new Error(`No existe ${name}`)
  const next = code.indexOf('\nfunction ', start + 10)
  const source = code.slice(start, next < 0 ? code.length : next)
  const companion = `${name}BajoBloqueo`
  if (code.includes(`function ${companion}(`)) return source + '\n' + functionSource(companion)
  return source
}

describe('seguridad de certificados en Apps Script', () => {
  it.each([
    'emitirCertificado',
    'anularCertificado',
    'reemitirCertificado',
    'registrarGeneracionCertificado',
    'actualizarEntregaCertificado',
    'enviarCertificadoEmail',
    'getAuditoriaCertificados',
  ])('valida el rol administrativo en %s', name => {
    expect(functionSource(name)).toContain('requireCertificateAdmin(user')
  })

  it('deriva el rol desde la sesión y no desde el payload', () => {
    // Fase 6 añadió un segundo camino de autenticación (serviceToken, para el
    // orquestador fiscal servidor-a-servidor) — `user` pasó de declararse con
    // `const` en una sola línea a `var user` asignado en cada rama, pero la
    // invariante de seguridad sigue intacta en ambos casos: ninguna rama toma el
    // rol de `data`/`params` (payload del cliente).
    expect(functionSource('processRequest')).toContain('user = validateToken(token)')
    expect(functionSource('processRequest')).not.toMatch(/Rol\s*:\s*(data|params)\./)
    expect(functionSource('requireCertificateAdmin')).toContain('isAdmin(user)')
  })

  it('registra intentos rechazados y eventos de emisión/entrega', () => {
    expect(functionSource('requireCertificateAdmin')).toContain("resultado: 'rechazado'")
    expect(functionSource('emitirCertificado')).toContain("accion: 'CERTIFICATE_ISSUED'")
    expect(functionSource('emitirCertificado')).toContain("accion: 'CERTIFICATE_METADATA_BACKFILLED'")
    expect(functionSource('registrarGeneracionCertificado')).toContain("accion: 'CERTIFICATE_GENERATED'")
    expect(functionSource('enviarCertificadoEmail')).toContain("'CERTIFICATE_RESENT' : 'CERTIFICATE_SENT'")
  })

  it('bloquea la eliminación física de certificados y audita el rechazo', () => {
    const deletion = functionSource('deleteInscripcion')
    expect(deletion).toContain('certificadoProtegidoContraEliminacion(row)')
    expect(deletion).toContain("accion: 'CERTIFICATE_DELETE_REJECTED'")
    expect(deletion).toContain('No puede eliminarse una inscripción con certificado emitido')
  })

  it('implementa anulación y reemisión sin reutilizar el identificador anterior', () => {
    const voidSource = functionSource('anularCertificado')
    expect(voidSource).toContain("confirmacion !== 'ANULAR'")
    expect(voidSource).toContain("accion: 'CERTIFICATE_VOIDED'")
    expect(voidSource).toContain("CertificateStatus: 'anulado'")

    const reissueSource = functionSource('reemitirCertificado')
    expect(reissueSource).toContain("confirmacion !== 'REEMITIR'")
    expect(reissueSource).toContain("generateId('CRT')")
    expect(reissueSource).toContain("CertificateStatus: 'reemitido'")
    expect(reissueSource).toContain("accion: 'CERTIFICATE_REISSUED'")
  })

  it('mantiene visibles en verificación pública los estados anulado y reemitido', () => {
    const publicVerification = functionSource('handleVerificarCertificado')
    expect(publicVerification).toContain("['vigente', 'anulado', 'reemitido']")
    expect(publicVerification).toContain('certificadoVigenteId')
  })

  it('limita el resumen de vendedor y la verificación pública', () => {
    expect(functionSource('resumenCertificadoParaVendedor')).toContain("resumen.CodigoCertificado = ''")
    const publicVerification = functionSource('handleVerificarCertificado')
    expect(publicVerification).not.toMatch(/Monto|RUC|ClienteTelefono|VerificadoPor|EmitidoPor/)
    expect(publicVerification).toContain('estado:          estado')
    expect(functionSource('estadoPublicoCertificado')).toContain("return 'anulado'")
  })
})
