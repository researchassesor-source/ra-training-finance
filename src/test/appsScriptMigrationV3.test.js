import { describe, expect, it } from 'vitest'
import { createAppsScriptHarness } from './appsScriptHarness'

const v3Columns = [
  'AvalTextoConfirmado', 'CertificateVersion', 'TemplateVersion', 'PdfHash', 'PdfStorageReference',
  'OriginalCertificateId', 'ReissuedCertificateId', 'CertificateStatus', 'IssuedAt', 'IssuedBy',
  'VoidedAt', 'VoidedBy', 'VoidReason', 'ReissueReason',
]

function legacyFixture() {
  const harness = createAppsScriptHarness()
  const sheet = harness.seed('Inscripciones', [
    { ID: 'INS-A', ClienteNombre: 'Persona A', ServicioNombre: 'Curso', EstadoCertificado: 'emitido', CodigoCertificado: 'RA-DUP', FechaEmisionCertificado: '2026-01-01' },
    { ID: 'INS-B', ClienteNombre: 'Persona B', ServicioNombre: 'Curso', EstadoCertificado: 'emitido', CodigoCertificado: 'RA-DUP' },
    { ID: 'INS-C', ClienteNombre: 'Persona C', ServicioNombre: 'Curso', EstadoCertificado: 'estado_desconocido' },
    { ID: 'INS-D', ClienteNombre: 'Persona D', ServicioNombre: 'Curso', EstadoCertificado: 'emitido', FechaEmisionCertificado: '2026-01-02' },
  ])
  const originalHeaders = [...sheet.rows[0]]
  const keepIndexes = originalHeaders.map((header, index) => ({ header, index }))
    .filter(item => !v3Columns.includes(item.header))
  sheet.rows = sheet.rows.map(row => keepIndexes.map(item => row[item.index] ?? ''))
  sheet.formulas = sheet.formulas.map(row => keepIndexes.map(item => row[item.index] ?? ''))
  const montoIndex = sheet.rows[0].indexOf('Monto')
  sheet.formulas[1][montoIndex] = '=10+10'
  return harness
}

describe('migración segura de certificados V3', () => {
  it('diagnostica sin escribir y detecta columnas, fórmulas, duplicados e inconsistencias', () => {
    const harness = legacyFixture()
    const before = JSON.stringify(harness.sheets)
    const result = harness.context.migrarCertificadosV3Diagnostico()

    expect(result.soloLectura).toBe(true)
    expect(result.hojasFaltantes).toEqual(expect.arrayContaining(['Certificados', 'AuditoriaCertificados', 'DescargasCertificados']))
    expect(result.columnasFaltantes.Inscripciones).toEqual(expect.arrayContaining(['CertificateVersion', 'PdfHash']))
    expect(result.formulas.Inscripciones).toBe(1)
    expect(result.codigosDuplicados[0]).toMatchObject({ codigo: 'RA-DUP' })
    expect(result.emitidosSinCodigo).toContain('INS-D')
    expect(result.emitidosSinFecha).toContain('INS-B')
    expect(result.estadosInconsistentes).toContainEqual({ id: 'INS-C', estado: 'estado_desconocido' })
    expect(JSON.stringify(harness.sheets)).toBe(before)
  })

  it('exige confirmación, agrega solo columnas faltantes y es idempotente', () => {
    const harness = legacyFixture()
    expect(() => harness.context.migrarCertificadosV3Aplicar()).toThrow('Migración bloqueada')
    const formulaBefore = harness.sheets.Inscripciones.formulas[1].filter(Boolean)

    const first = harness.context.migrarCertificadosV3Aplicar('APLICAR_CERTIFICADOS_V3')
    const second = harness.context.migrarCertificadosV3Aplicar('APLICAR_CERTIFICADOS_V3')

    expect(first.aplicada).toBe(true)
    expect(first.columnasAgregadas.Inscripciones).toEqual(expect.arrayContaining(['CertificateVersion', 'PdfHash']))
    expect(first.diagnosticoPosterior.columnasFaltantes.Inscripciones).toEqual([])
    expect(second.columnasAgregadas.Inscripciones).toEqual([])
    expect(harness.sheets.Inscripciones.formulas[1].filter(Boolean)).toEqual(formulaBefore)
    expect(harness.logs.length).toBe(2)
  })
})
