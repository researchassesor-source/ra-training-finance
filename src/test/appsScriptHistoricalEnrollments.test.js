import { describe, expect, it } from 'vitest'
import { createAppsScriptHarness } from './appsScriptHarness'

function baseHarness(inscripciones = []) {
  const harness = createAppsScriptHarness()
  const future = '2099-01-01T00:00:00.000Z'
  harness.seed('Sesiones', [
    { Token: 'admin-token', Username: 'admin', UserID: 'USR-A', Rol: 'admin', Nombre: 'Admin', Expira: future },
    { Token: 'seller-token', Username: 'seller', UserID: 'USR-V', Rol: 'vendedor', Nombre: 'Vendedor', Expira: future },
    { Token: 'aval-token', Username: 'aval', UserID: 'USR-I', Rol: 'aval', Nombre: 'Aval', Expira: future },
  ])
  harness.seed('Usuarios', [
    { ID: 'USR-A', Nombre: 'Admin', Username: 'admin', Rol: 'admin', Activo: true },
    { ID: 'USR-V', Nombre: 'Vendedor', Username: 'seller', Rol: 'vendedor', Activo: true },
    { ID: 'USR-I', Nombre: 'Aval', Username: 'aval', Rol: 'aval', Activo: true },
  ])
  harness.seed('Servicios', [{ ID: 'SRV-1', Nombre: 'Curso Histórico', Duracion: '40', Modalidad: 'Virtual', Activo: true }])
  harness.seed('Inscripciones', inscripciones)
  harness.seed('Ingresos', [])
  harness.seed('Pagos', [])
  harness.seed('Certificados', [])
  harness.seed('AuditoriaCertificados', [])
  return harness
}

function historicalEnrollment(overrides = {}) {
  return {
    ID: 'INS-HIST-1', ClienteNombre: 'Participante Original', ClienteID: '0102030405',
    ClienteEmail: 'persona@example.test', ClienteTelefono: '0999999999',
    ServicioID: 'SRV-1', ServicioNombre: 'Curso Histórico', Modalidad: 'Virtual',
    FechaInicio: '01/02/2024', FechaFin: '', Monto: 20, MetodoPago: 'Efectivo',
    EstadoPago: 'verificado', EstadoCertificado: 'emitido', CreadoPor: 'seller',
    FechaCreacion: '2024-01-20T10:00:00.000Z', CodigoCertificado: 'RA-2024-HIST001',
    FechaEmisionCertificado: '2024-02-05T10:00:00.000Z', CertificateVersion: '',
    TemplateVersion: 'legacy-v1', PdfHash: 'a'.repeat(64), PdfStorageReference: '',
    ...overrides,
  }
}

describe('normalización segura de inscripciones históricas en Apps Script', () => {
  it('normaliza fechas calendario sin invertir día y mes ni aplicar UTC', () => {
    const harness = baseHarness()
    expect(harness.context.fechaSolo('29/02/2024')).toBe('2024-02-29')
    expect(harness.context.fechaSolo('2024-07-21T23:59:59.000Z')).toBe('2024-07-21')
    expect(harness.context.fechaSolo(new Date(2024, 6, 21))).toBe('2024-07-21')
    expect(harness.context.fechaSolo('31/02/2024')).toBe('')
  })

  it('el diagnóstico incluye filas sin ID, informa columnas faltantes y no escribe', () => {
    const harness = baseHarness()
    const sheet = harness.ensureSheet('Inscripciones')
    const headers = ['ID', 'ClienteNombre', 'ClienteID', 'ServicioNombre', 'Modalidad', 'FechaInicio', 'Fecha Fin', 'FechaCreacion']
    sheet.rows = [
      headers,
      ['', 'Persona Legacy', '0100000001', 'Curso Histórico', 'Virtual', '10/01/2024', new Date(2024, 0, 12), '2024-01-01T10:00:00.000Z'],
    ]
    sheet.formulas = sheet.rows.map(row => row.map(() => ''))
    const before = JSON.stringify(sheet.rows)

    const report = harness.context.diagnosticarInscripcionesHistoricas()

    expect(report.soloLectura).toBe(true)
    expect(report.filas).toHaveLength(1)
    expect(report.filas[0]).toMatchObject({ idFalta: true, esHistorico: true, necesitaClaveHistoricaAlternativa: true })
    expect(report.filas[0].FechaInicio).toBe('2024-01-10')
    expect(report.filas[0].FechaFin).toBe('2024-01-12')
    expect(report.columnasFaltantes).toContain('PdfHash')
    expect(JSON.stringify(sheet.rows)).toBe(before)
  })

  it('actualiza por ID único, persiste fechas y modalidad y no altera datos no enviados', () => {
    const harness = baseHarness([historicalEnrollment()])
    const { processRequest } = harness.context

    const result = processRequest({
      action: 'updateInscripcion', token: 'admin-token', id: 'INS-HIST-1',
      inscripcion: { fechaInicio: '2024-02-01', fechaFin: '03/02/2024', modalidad: 'Presencial' },
    })
    const updated = harness.objects('Inscripciones')[0]

    expect(result).toMatchObject({ success: true, persistenceVerified: true })
    expect(updated).toMatchObject({
      FechaInicio: '2024-02-01', FechaFin: '2024-02-03', Modalidad: 'Presencial',
      ClienteNombre: 'Participante Original', ClienteID: '0102030405', Monto: 20,
      EstadoPago: 'verificado', CreadoPor: 'seller', CodigoCertificado: 'RA-2024-HIST001',
      PdfHash: 'a'.repeat(64),
    })
    expect(harness.objects('AuditoriaCertificados').map(item => item.Accion)).toContain('ENROLLMENT_UPDATED')
    expect(harness.locks).toEqual({ waits: 1, releases: 1 })
  })

  it('añade encabezados históricos faltantes únicamente al final y verifica la fila física', () => {
    const harness = baseHarness()
    const sheet = harness.sheets.Inscripciones
    const legacyHeaders = [
      'ID', 'ClienteNombre', 'ClienteID', 'ClienteEmail', 'ClienteTelefono', 'ServicioID',
      'ServicioNombre', 'FechaInicio', 'Monto', 'MetodoPago', 'EstadoPago', 'EstadoCertificado',
      'CreadoPor', 'FechaCreacion', 'CodigoCertificado', 'TemplateVersion', 'PdfHash',
    ]
    const legacyColumnCount = legacyHeaders.length
    const legacy = historicalEnrollment({ FechaInicio: '01/02/2024' })
    sheet.rows = [legacyHeaders, legacyHeaders.map(header => legacy[header] ?? '')]
    sheet.formulas = sheet.rows.map(row => row.map(() => ''))

    const result = harness.context.processRequest({
      action: 'updateInscripcion', token: 'admin-token', id: 'INS-HIST-1',
      inscripcion: { fechaFin: '03/02/2024', modalidad: 'Virtual' },
    })

    expect(result).toMatchObject({ success: true, persistenceVerified: true })
    expect(sheet.rows[0].slice(0, legacyColumnCount)).toEqual(legacyHeaders.slice(0, legacyColumnCount))
    expect(sheet.rows[0].indexOf('FechaFin')).toBeGreaterThanOrEqual(legacyColumnCount)
    expect(sheet.rows[0].indexOf('Modalidad')).toBeGreaterThanOrEqual(legacyColumnCount)
    expect(harness.objects('Inscripciones')[0]).toMatchObject({ FechaFin: '2024-02-03', Modalidad: 'Virtual' })
  })

  it('distingue campos omitidos de limpieza explícita y protege fechas de certificados emitidos', () => {
    const harness = baseHarness([historicalEnrollment({ FechaFin: '2024-02-03' })])
    const omitted = harness.context.processRequest({
      action: 'updateInscripcion', token: 'admin-token', id: 'INS-HIST-1', inscripcion: { modalidad: 'Presencial' },
    })
    expect(omitted).toMatchObject({ success: true, persistenceVerified: true })
    expect(harness.objects('Inscripciones')[0].FechaFin).toBe('2024-02-03')

    const explicitClear = harness.context.processRequest({
      action: 'updateInscripcion', token: 'admin-token', id: 'INS-HIST-1', inscripcion: { fechaFin: '' },
    })
    expect(explicitClear.success).toBe(false)
    expect(explicitClear.error).toContain('No se pueden limpiar las fechas')
    expect(harness.objects('Inscripciones')[0].FechaFin).toBe('2024-02-03')
  })

  it('rechaza ID duplicado sin modificar la primera coincidencia', () => {
    const harness = baseHarness([
      historicalEnrollment(),
      historicalEnrollment({ ClienteID: '9999999999', ClienteNombre: 'Otra Persona' }),
    ])
    const before = harness.objects('Inscripciones').map(row => row.FechaFin)
    const response = harness.context.processRequest({
      action: 'updateInscripcion', token: 'admin-token', id: 'INS-HIST-1', inscripcion: { fechaFin: '2024-02-04' },
    })

    expect(response.success).toBe(false)
    expect(response.error).toContain('duplicado')
    expect(harness.objects('Inscripciones').map(row => row.FechaFin)).toEqual(before)
    expect(harness.objects('AuditoriaCertificados').map(item => item.Accion)).toContain('HISTORICAL_ENROLLMENT_UPDATE_REJECTED')
  })

  it('rechaza una fila con valores contradictorios entre encabezados equivalentes', () => {
    const harness = baseHarness([historicalEnrollment({ FechaFin: '2024-02-03' })])
    const sheet = harness.sheets.Inscripciones
    sheet.rows[0].push('Fecha Fin')
    sheet.rows[1].push('2024-02-04')
    sheet.formulas[0].push('')
    sheet.formulas[1].push('')

    const response = harness.context.processRequest({
      action: 'updateInscripcion', token: 'admin-token', id: 'INS-HIST-1', inscripcion: { fechaFin: '2024-02-05' },
    })

    expect(response.success).toBe(false)
    expect(response.error).toContain('contradictorios')
    expect(sheet.rows[1][sheet.rows[0].indexOf('FechaFin')]).toBe('2024-02-03')
  })

  it('mantiene sincronizados encabezados equivalentes cuando sus valores previos coinciden', () => {
    const harness = baseHarness([historicalEnrollment({ FechaFin: '2024-02-03' })])
    const sheet = harness.sheets.Inscripciones
    sheet.rows[0].push('Fecha Fin')
    sheet.rows[1].push('2024-02-03')
    sheet.formulas[0].push('')
    sheet.formulas[1].push('')

    const response = harness.context.processRequest({
      action: 'updateInscripcion', token: 'admin-token', id: 'INS-HIST-1', inscripcion: { fechaFin: '2024-02-05' },
    })

    expect(response).toMatchObject({ success: true, persistenceVerified: true })
    expect(sheet.rows[1][sheet.rows[0].indexOf('FechaFin')]).toBe('2024-02-05')
    expect(sheet.rows[1][sheet.rows[0].indexOf('Fecha Fin')]).toBe('2024-02-05')
  })

  it('permite al admin actualizar por clave histórica inequívoca y bloquea al vendedor', () => {
    const harness = baseHarness([historicalEnrollment({ ID: '', CodigoCertificado: '' })])
    const listed = harness.context.processRequest({ action: 'getInscripciones', token: 'admin-token' })
    const key = listed.data[0].HistoricalKey
    expect(key).toMatch(/^HIST-/)

    const seller = harness.context.processRequest({
      action: 'updateInscripcion', token: 'seller-token', id: '', historicalKey: key, inscripcion: { fechaFin: '2024-02-03' },
    })
    expect(seller.success).toBe(false)

    const admin = harness.context.processRequest({
      action: 'updateInscripcion', token: 'admin-token', id: '', historicalKey: key, inscripcion: { fechaFin: '2024-02-03' },
    })
    expect(admin).toMatchObject({ success: true, persistenceVerified: true })
    expect(harness.objects('Inscripciones')[0].FechaFin).toBe('2024-02-03')
  })

  it('la migración exige confirmación, es idempotente y no duplica filas ni relaciones', () => {
    const harness = baseHarness([historicalEnrollment({
      ID: '', CodigoCertificado: '', EstadoCertificado: 'pendiente', CertificateVersion: '', TemplateVersion: '',
      PdfHash: '', FechaInicio: '01/02/2024', FechaFin: new Date(2024, 1, 3),
    })])
    const before = harness.context.verificarIntegridadInscripcionesHistoricas()
    expect(() => harness.context.migrarInscripcionesHistoricasAplicar()).toThrow('confirmación explícita')

    const first = harness.context.migrarInscripcionesHistoricasAplicar('MIGRATE_HISTORICAL_INSCRIPTIONS_ONCE', 'admin')
    const second = harness.context.migrarInscripcionesHistoricasAplicar('MIGRATE_HISTORICAL_INSCRIPTIONS_ONCE', 'admin')
    const after = harness.context.verificarIntegridadInscripcionesHistoricas()

    expect(first.filasModificadas).toHaveLength(1)
    expect(first.filasModificadas[0].valoresNuevos).toMatchObject({ FechaInicio: '2024-02-01', FechaFin: '2024-02-03' })
    expect(first.filasModificadas[0].valoresNuevos.ID).toMatch(/^INS_HIST_/)
    expect(second.filasModificadas).toHaveLength(0)
    expect(after.filas).toEqual(before.filas)
    expect(after.totalMontosInscripciones).toBe(before.totalMontosInscripciones)
    expect(after.estadosPago).toEqual(before.estadosPago)
    expect(harness.objects('AuditoriaCertificados')
      .filter(item => item.Accion === 'HISTORICAL_ENROLLMENT_NORMALIZED')).toHaveLength(1)
  })

  it('rechaza la migración si el ejecutor no corresponde a un administrador activo', () => {
    const harness = baseHarness([historicalEnrollment({ ID: '', CodigoCertificado: '' })])

    expect(() => harness.context.migrarInscripcionesHistoricasAplicar(
      'MIGRATE_HISTORICAL_INSCRIPTIONS_ONCE',
      'seller',
    )).toThrow('administrador ejecutor')
    expect(harness.objects('Inscripciones')[0].ID).toBe('')
    expect(harness.objects('AuditoriaCertificados')).toHaveLength(0)
  })

  it('omite una fila sin ID cuando ya tiene una relación contable o certificado asociado', () => {
    const harness = baseHarness([historicalEnrollment({
      ID: '', IngresoID: 'ING-EXISTENTE', CodigoCertificado: '', EstadoCertificado: 'pendiente',
      CertificateVersion: '', TemplateVersion: '', PdfHash: '', PdfStorageReference: '',
    })])

    const result = harness.context.migrarInscripcionesHistoricasAplicar(
      'MIGRATE_HISTORICAL_INSCRIPTIONS_ONCE',
      'admin',
    )

    expect(result.filasModificadas).toHaveLength(0)
    expect(result.filasOmitidas).toContainEqual(expect.objectContaining({
      fila: 2,
      motivo: 'id_ausente_con_relacion_existente',
    }))
    expect(harness.objects('Inscripciones')[0]).toMatchObject({ ID: '', IngresoID: 'ING-EXISTENTE' })
  })

  it('omite claves históricas ambiguas sin escribir ni auditar normalizaciones', () => {
    const duplicate = historicalEnrollment({
      ID: '', CodigoCertificado: '', EstadoCertificado: 'pendiente', CertificateVersion: '',
      TemplateVersion: '', PdfHash: '', PdfStorageReference: '',
    })
    const harness = baseHarness([duplicate, { ...duplicate }])
    const before = JSON.stringify(harness.sheets.Inscripciones.rows)

    const result = harness.context.migrarInscripcionesHistoricasAplicar(
      'MIGRATE_HISTORICAL_INSCRIPTIONS_ONCE',
      'admin',
    )

    expect(result.filasModificadas).toHaveLength(0)
    expect(result.filasOmitidas.filter(item => item.motivo === 'revision_manual_requerida')).toHaveLength(2)
    expect(JSON.stringify(harness.sheets.Inscripciones.rows)).toBe(before)
    expect(harness.objects('AuditoriaCertificados')).toHaveLength(0)
  })

  it('detecta fechas calculadas por fórmula y las omite para no destruir la fórmula', () => {
    const harness = baseHarness([historicalEnrollment({ FechaInicio: new Date(2024, 1, 1), FechaFin: '2024-02-03' })])
    const sheet = harness.sheets.Inscripciones
    const fechaInicioColumn = sheet.rows[0].indexOf('FechaInicio')
    sheet.formulas[1][fechaInicioColumn] = '=DATE(2024,2,1)'
    const before = sheet.rows[1][fechaInicioColumn]

    const diagnosis = harness.context.diagnosticarInscripcionesHistoricas()
    const migration = harness.context.migrarInscripcionesHistoricasAplicar(
      'MIGRATE_HISTORICAL_INSCRIPTIONS_ONCE',
      'admin',
    )

    expect(diagnosis.filas[0].camposConFormula).toContain('FechaInicio')
    expect(diagnosis.filas[0].motivosRiesgo).toContain('fecha_con_formula')
    expect(migration.filasModificadas).toHaveLength(0)
    expect(sheet.rows[1][fechaInicioColumn]).toBe(before)
    expect(sheet.formulas[1][fechaInicioColumn]).toBe('=DATE(2024,2,1)')
  })

  it('revierte la fila cuando falla la auditoría de la migración', () => {
    const harness = baseHarness([historicalEnrollment({
      ID: '', CodigoCertificado: '', EstadoCertificado: 'pendiente', CertificateVersion: '', TemplateVersion: '', PdfHash: '',
    })])
    const before = harness.objects('Inscripciones')[0]
    harness.sheets.AuditoriaCertificados.appendRow = () => { throw new Error('audit unavailable') }

    const result = harness.context.migrarInscripcionesHistoricasAplicar('MIGRATE_HISTORICAL_INSCRIPTIONS_ONCE', 'admin')
    const after = harness.objects('Inscripciones')[0]

    expect(result.errores).toHaveLength(1)
    expect(after.ID).toBe(before.ID)
    expect(after.FechaInicio).toBe(before.FechaInicio)
    expect(after.FechaFin).toBe(before.FechaFin)
  })

  it('bloquea descarga con FechaFin faltante y la permite después de persistir la corrección', () => {
    const harness = baseHarness([historicalEnrollment()])
    const { processRequest } = harness.context

    const blocked = processRequest({ action: 'getCertificadoParaDescarga', token: 'admin-token', id: 'INS-HIST-1' })
    expect(blocked.success).toBe(false)
    expect(blocked.error).toContain('falta FechaFin')

    expect(processRequest({
      action: 'updateInscripcion', token: 'admin-token', id: 'INS-HIST-1', inscripcion: { fechaFin: '2024-02-03' },
    }).success).toBe(true)
    const allowed = processRequest({ action: 'getCertificadoParaDescarga', token: 'admin-token', id: 'INS-HIST-1' })
    expect(allowed).toMatchObject({
      success: true,
      data: { CodigoCertificado: 'RA-2024-HIST001', FechaFin: '2024-02-03', IsHistoricalRecord: true },
    })
  })

  it('no clasifica ni migra un registro moderno completo', () => {
    const modern = historicalEnrollment({
      ID: 'INS-MODERN', FechaInicio: '2026-07-01', FechaFin: '2026-07-02',
      CodigoCertificado: 'RA-2026-MODERN', CertificateVersion: 1, TemplateVersion: 'ra-canva-2026-v1',
      PdfHash: 'b'.repeat(64), PdfStorageReference: 'browser-indexeddb:INS-MODERN:v1',
    })
    const harness = baseHarness([modern])
    const diagnosis = harness.context.diagnosticarInscripcionesHistoricas()
    const migration = harness.context.migrarInscripcionesHistoricasAplicar('MIGRATE_HISTORICAL_INSCRIPTIONS_ONCE', 'admin')

    expect(diagnosis.filas[0].esHistorico).toBe(false)
    expect(migration.filasModificadas).toHaveLength(0)
    expect(harness.objects('Inscripciones')[0]).toMatchObject({
      PdfHash: 'b'.repeat(64), PdfStorageReference: 'browser-indexeddb:INS-MODERN:v1', CertificateVersion: 1,
    })
  })

  it('mantiene la edición moderna y conserva hash, referencia, versión y datos no enviados', () => {
    const modern = historicalEnrollment({
      ID: 'INS-MODERN', FechaInicio: '2026-07-01', FechaFin: '2026-07-02',
      CodigoCertificado: 'RA-2026-MODERN', CertificateVersion: 1, TemplateVersion: 'ra-canva-2026-v1',
      PdfHash: 'b'.repeat(64), PdfStorageReference: 'browser-indexeddb:INS-MODERN:v1',
    })
    const harness = baseHarness([modern])

    const result = harness.context.processRequest({
      action: 'updateInscripcion', token: 'admin-token', id: 'INS-MODERN',
      inscripcion: { modalidad: 'Presencial' },
    })

    expect(result).toMatchObject({ success: true, persistenceVerified: true, data: { Modalidad: 'Presencial' } })
    expect(harness.objects('Inscripciones')[0]).toMatchObject({
      ClienteNombre: modern.ClienteNombre,
      ClienteID: modern.ClienteID,
      CreadoPor: modern.CreadoPor,
      Monto: modern.Monto,
      EstadoPago: modern.EstadoPago,
      PdfHash: modern.PdfHash,
      PdfStorageReference: modern.PdfStorageReference,
      CertificateVersion: modern.CertificateVersion,
    })
  })
})
