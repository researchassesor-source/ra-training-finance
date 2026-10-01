import { describe, expect, it } from 'vitest'
import { createAppsScriptHarness } from './appsScriptHarness'

function harness() {
  const app = createAppsScriptHarness()
  app.seed('Sesiones', [
    { Token: 'admin-token', Username: 'admin', UserID: 'USR-A', Rol: 'admin', Nombre: 'Admin', Expira: '2099-01-01T00:00:00.000Z' },
    { Token: 'aval-one-token', Username: 'aval-one', UserID: 'USR-O', Rol: 'aval', Nombre: 'Aval Uno', Expira: '2099-01-01T00:00:00.000Z' },
    { Token: 'seller-token', Username: 'seller', UserID: 'USR-S', Rol: 'vendedor', Nombre: 'Seller', Expira: '2099-01-01T00:00:00.000Z' },
  ])
  app.seed('Usuarios', [
    { ID: 'USR-A', Nombre: 'Admin', Username: 'admin', Rol: 'admin', Activo: true },
    { ID: 'USR-O', Nombre: 'Aval Uno', Username: 'aval-one', Rol: 'aval', Roles: '["aval"]', Activo: true, InstitucionAval: 'Instituto Uno' },
    { ID: 'USR-S', Nombre: 'Seller', Username: 'seller', Rol: 'vendedor', Activo: true },
  ])
  app.seed('Servicios', [
    { ID: 'SRV-1', Nombre: 'Curso demo', Precio: 20, Duracion: '20', Modalidad: 'Virtual', Activo: true },
  ])
  return app
}

const institution = (overrides = {}) => ({
  nombre: 'Instituto Uno', siglas: 'IU', tipo: 'Instituto', identificacion: '0691783737001',
  tipoIdentificacion: 'RUC_EC', ciudad: 'Riobamba', estado: 'activo', ...overrides,
})

function png100x30() {
  const bytes = new Uint8Array(24)
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0)
  bytes.set([0, 0, 0, 13, 73, 72, 68, 82], 8)
  bytes.set([0, 0, 0, 100, 0, 0, 0, 30], 16)
  return Buffer.from(bytes).toString('base64')
}

function addInstitution(app, input = institution(), token = 'admin-token', extra = {}) {
  return app.context.processRequest({ action: 'addInstitucionMaestra', token, institucion: input, ...extra })
}

function addAvalAgreement(app, institutionId, name = 'Convenio de aval') {
  return app.context.processRequest({ action: 'addConvenio', token: 'admin-token', convenio: {
    institucionId: institutionId, objeto: name, estado: 'activo', porcentajeAval: '15', baseCalculoAval: 'precio_servicio',
  } })
}

describe('ficha maestra institucional de Finance', () => {
  it('reserva la gestión para admin incluso llamando directamente a la API', () => {
    const app = harness()
    const create = addInstitution(app, institution(), 'seller-token')
    const list = app.context.processRequest({ action: 'getInstitucionesMaestras', token: 'seller-token' })
    const upload = app.context.processRequest({ action: 'addActivoInstitucion', token: 'seller-token', institucionId: 'INS-x', tipo: 'logo', archivo: {} })
    expect(create.success).toBe(false)
    expect(create.error).toMatch(/administrador/i)
    expect(list.success).toBe(false)
    expect(upload.success).toBe(false)
  })

  it('crea una institución, conserva la identificación textual y bloquea duplicados por RUC', () => {
    const app = harness()
    const created = addInstitution(app, institution({ identificacion: '0691783737001' }))
    expect(created.success).toBe(true)
    const saved = app.objects('Instituciones')[0]
    expect(saved.Identificacion).toBe('0691783737001')
    expect(app.context.processRequest({ action: 'getInstitucionesMaestras', token: 'admin-token' }).data[0].Nombre).toBe('Instituto Uno')

    const duplicate = addInstitution(app, institution({ nombre: 'Instituto Alternativo', identificacion: '0691783737001' }))
    expect(duplicate.success).toBe(false)
    expect(duplicate.error).toMatch(/ya existe una institución/i)
  })

  it('pide confirmación para un nombre ambiguo, no fusiona registros y permite desactivar sin borrar', () => {
    const app = harness()
    const first = addInstitution(app)
    const ambiguous = addInstitution(app, institution({ identificacion: '' }))
    expect(first.success).toBe(true)
    expect(ambiguous.success).toBe(false)
    expect(ambiguous.error).toMatch(/confirme explícitamente/i)

    const distinct = addInstitution(app, institution({ identificacion: '', tipoIdentificacion: '' }), 'admin-token', { confirmarDuplicadoNombre: true })
    expect(distinct.success).toBe(true)
    const archived = app.context.processRequest({ action: 'archivarInstitucionMaestra', token: 'admin-token', id: first.id, confirmacion: 'ARCHIVAR_INSTITUCION' })
    expect(archived.success).toBe(true)
    expect(app.objects('Instituciones')).toHaveLength(2)
    expect(app.objects('Instituciones').find(item => item.ID === first.id).Estado).toBe('inactivo')
  })

  it('revierte altas y ediciones si falla la auditoría en lugar de confirmar un guardado parcial', () => {
    const app = harness()
    const auditSheet = app.ensureSheet('AuditoriaInstituciones')
    auditSheet.appendRow = () => { throw new Error('simulated audit write failure') }
    const failedCreate = addInstitution(app)
    expect(failedCreate.success).toBe(false)
    expect(failedCreate.error).toMatch(/auditoría institucional/i)
    expect(app.objects('Instituciones')).toHaveLength(0)

    const restored = harness()
    const created = addInstitution(restored)
    const audit = restored.ensureSheet('AuditoriaInstituciones')
    audit.appendRow = () => { throw new Error('simulated audit write failure') }
    const failedUpdate = restored.context.processRequest({ action: 'updateInstitucionMaestra', token: 'admin-token',
      id: created.id, institucion: institution({ nombre: 'Nombre no guardado' }) })
    expect(failedUpdate.success).toBe(false)
    expect(restored.objects('Instituciones')[0].Nombre).toBe('Instituto Uno')
  })

  it('mantiene autoridades separadas del cargo y archiva la anterior sin borrado físico', () => {
    const app = harness()
    const created = addInstitution(app)
    const add = app.context.processRequest({ action: 'addAutoridadInstitucion', token: 'admin-token', institucionId: created.id,
      autoridad: { nombre: 'María Pérez', cargo: 'Rectora', funcion: 'Autoridad principal', firmaCertificados: true, estado: 'activo' } })
    expect(add.success).toBe(true)
    const update = app.context.processRequest({ action: 'updateAutoridadInstitucion', token: 'admin-token', id: add.id,
      autoridad: { nombre: 'María Pérez', cargo: 'Rectora', funcion: 'Autoridad saliente', firmaCertificados: true, estado: 'inactivo' } })
    expect(update.success).toBe(true)
    expect(app.objects('AutoridadesInstitucion')).toHaveLength(1)
    expect(app.objects('AutoridadesInstitucion')[0].Estado).toBe('inactivo')
    expect(app.objects('AuditoriaInstituciones').length).toBeGreaterThanOrEqual(2)
  })

  it('no marca como firmante vigente a una autoridad fuera de sus fechas de vigencia', () => {
    const app = harness()
    const created = addInstitution(app)
    const invalidDate = app.context.processRequest({ action: 'addAutoridadInstitucion', token: 'admin-token', institucionId: created.id,
      autoridad: { nombre: 'María Pérez', cargo: 'Directora', fechaInicio: '2026-99-44', firmaCertificados: true } })
    expect(invalidDate.success).toBe(false)
    const past = app.context.processRequest({ action: 'addAutoridadInstitucion', token: 'admin-token', institucionId: created.id,
      autoridad: { nombre: 'María Pérez', cargo: 'Directora', fechaFin: '2000-01-01', firmaCertificados: true } })
    expect(past.success).toBe(true)
    const detail = app.context.processRequest({ action: 'getInstitucionMaestra', token: 'admin-token', id: created.id })
    expect(detail.data.autoridades[0].VigenteAhora).toBe(false)
    expect(detail.data.completitudCertificacionFutura.listoParaCertificacionFutura).toBe(false)
  })

  it('valida formatos, MIME y contenido real de assets/documentos institucionales', () => {
    const app = harness()
    const created = addInstitution(app)
    const wrongMime = app.context.processRequest({ action: 'addActivoInstitucion', token: 'admin-token', institucionId: created.id,
      tipo: 'logo', archivo: { nombreArchivo: 'payload.svg', mimeType: 'image/svg+xml', base64: png100x30() } })
    expect(wrongMime.success).toBe(false)

    const notPdf = app.context.processRequest({ action: 'addDocumentoInstitucion', token: 'admin-token', institucionId: created.id,
      tipo: 'convenio', archivo: { nombreArchivo: 'acuerdo.pdf', mimeType: 'application/pdf', base64: png100x30() } })
    expect(notPdf.success).toBe(false)
    expect(notPdf.error).toMatch(/no corresponde a un PDF/i)
  })

  it('guarda assets en Drive privado, verifica integridad, y reemplaza por versión sin destruir el archivo anterior', () => {
    const app = harness()
    const created = addInstitution(app)
    const person = app.context.processRequest({ action: 'addAutoridadInstitucion', token: 'admin-token', institucionId: created.id,
      autoridad: { nombre: 'María Pérez', cargo: 'Rectora', firmaCertificados: true } })
    const assetInput = { nombreArchivo: 'rubrica.png', mimeType: 'image/png', base64: png100x30() }
    const first = app.context.processRequest({ action: 'addActivoInstitucion', token: 'admin-token', institucionId: created.id,
      autoridadId: person.id, tipo: 'firma', archivo: assetInput })
    expect(first.success).toBe(true)
    expect(app.driveFiles.size).toBe(1)
    expect(app.driveFolders.has('R.A. Training Finance - Archivos institucionales privados')).toBe(true)
    const second = app.context.processRequest({ action: 'addActivoInstitucion', token: 'admin-token', institucionId: created.id,
      autoridadId: person.id, tipo: 'firma', archivo: assetInput })
    expect(second.success).toBe(true)
    expect(second.version).toBe(2)
    expect(app.objects('ActivosInstitucionales').map(item => item.Estado)).toEqual(['reemplazado', 'activo'])
    expect(app.driveFiles.size).toBe(2)

    const privateList = app.context.processRequest({ action: 'getInstitucionMaestra', token: 'admin-token', id: created.id })
    expect(privateList.success).toBe(true)
    expect(privateList.data.completitudCertificacionFutura.listoParaCertificacionFutura).toBe(true)
    const read = app.context.processRequest({ action: 'getArchivoInstitucionPrivado', token: 'admin-token', id: second.id })
    const forbidden = app.context.processRequest({ action: 'getArchivoInstitucionPrivado', token: 'aval-one-token', id: second.id })
    expect(read.success).toBe(true)
    expect(read.data.sha256).toBe(second.sha256)
    expect(forbidden.success).toBe(false)
  })

  it('limita las opciones del rol institucional a la entidad asignada', () => {
    const app = harness()
    addInstitution(app)
    addInstitution(app, institution({ nombre: 'Otra Institución', siglas: 'OTRA', identificacion: '1790012345001' }))
    const options = app.context.processRequest({ action: 'getOpcionesInstitucionesMaestras', token: 'aval-one-token' })
    expect(options.success).toBe(true)
    expect(options.data.map(item => item.Nombre)).toEqual(['Instituto Uno'])
    expect(app.context.processRequest({ action: 'getInstitucionesMaestras', token: 'aval-one-token' }).success).toBe(false)
    const sellerOptions = app.context.processRequest({ action: 'getOpcionesInstitucionesMaestras', token: 'seller-token' })
    expect(sellerOptions.success).toBe(true)
    expect(sellerOptions.data.map(item => item.Nombre)).toEqual(['Instituto Uno', 'Otra Institución'])
    expect(sellerOptions.data[0]).not.toHaveProperty('Rector')
  })

  it('las nuevas inscripciones con aval guardan ID y snapshot y rechazan una institución escrita a mano', () => {
    const app = harness()
    const created = addInstitution(app)
    const agreement = addAvalAgreement(app, created.id)
    const base = { servicioId: 'SRV-1', servicioNombre: 'Curso demo', clienteNombre: 'Persona Demo',
      clienteID: '0601234560', clienteTipoIdentificacion: 'CEDULA_EC', monto: 20, metodoPago: 'Efectivo',
      requiereAvalExterno: true, institucionAval: 'Nombre no confiable' }
    const textOnly = app.context.processRequest({ action: 'addInscripcion', token: 'seller-token', inscripcion: base })
    expect(textOnly.success).toBe(false)
    expect(textOnly.error).toMatch(/ficha maestra/i)
    expect(app.objects('Inscripciones')).toHaveLength(0)

    const saved = app.context.processRequest({ action: 'addInscripcion', token: 'seller-token',
      inscripcion: { ...base, institucionAvalId: created.id, convenioId: agreement.id } })
    expect(saved.success).toBe(true)
    expect(app.objects('Inscripciones')[0]).toMatchObject({ InstitucionID: created.id, InstitucionAval: 'Instituto Uno', ConvenioID: agreement.id })
  })

  it('al cambiar una inscripción vinculada consulta la ficha y conserva el nombre maestro, no texto arbitrario', () => {
    const app = harness()
    const first = addInstitution(app)
    const second = addInstitution(app, institution({ nombre: 'Instituto Dos', siglas: 'I2', identificacion: '1790012345001' }))
    const firstAgreement = addAvalAgreement(app, first.id, 'Convenio Instituto Uno')
    const secondAgreement = addAvalAgreement(app, second.id, 'Convenio Instituto Dos')
    const created = app.context.processRequest({ action: 'addInscripcion', token: 'seller-token', inscripcion: {
      servicioId: 'SRV-1', servicioNombre: 'Curso demo', clienteNombre: 'Persona Demo', clienteID: '0601234560',
      clienteTipoIdentificacion: 'CEDULA_EC', monto: 20, metodoPago: 'Efectivo', requiereAvalExterno: true,
      institucionAvalId: first.id, convenioId: firstAgreement.id,
    } })
    const renamedDirectly = app.context.processRequest({ action: 'updateInscripcion', token: 'seller-token', id: created.id,
      inscripcion: { institucionAval: 'Institución Inventada' } })
    expect(renamedDirectly.success).toBe(false)
    expect(renamedDirectly.error).toMatch(/seleccione una institución de la ficha maestra/i)

    const relinked = app.context.processRequest({ action: 'updateInscripcion', token: 'seller-token', id: created.id,
      inscripcion: { institucionAvalId: second.id, convenioId: secondAgreement.id } })
    expect(relinked.success).toBe(true)
    expect(app.objects('Inscripciones')[0]).toMatchObject({ InstitucionID: second.id, InstitucionAval: 'Instituto Dos' })
  })

  it('vincula convenios nuevos a una institución activa y archiva el convenio conservando su fila', () => {
    const app = harness()
    const created = addInstitution(app)
    const legacy = app.context.processRequest({ action: 'addConvenio', token: 'admin-token', convenio: { objeto: 'No debe pasar sin ID' } })
    expect(legacy.success).toBe(false)
    const added = app.context.processRequest({ action: 'addConvenio', token: 'admin-token', convenio: {
      institucionId: created.id, objeto: 'Cooperación académica', estado: 'activo', fechaInicio: '2026-01-01', fechaFin: '2027-01-01',
    } })
    expect(added.success).toBe(true)
    const list = app.context.processRequest({ action: 'getConvenios', token: 'admin-token' })
    expect(list.data[0].InstitucionNombre).toBe('Instituto Uno')
    const archived = app.context.processRequest({ action: 'deleteConvenio', token: 'admin-token', id: added.id, confirmacion: 'ARCHIVAR_CONVENIO' })
    expect(archived.success).toBe(true)
    expect(app.objects('Convenios')).toHaveLength(1)
    expect(app.objects('Convenios')[0].Estado).toBe('archivado')
  })

  it('no autoenlaza datos históricos guardados solo como texto', () => {
    const app = harness()
    const created = addInstitution(app)
    app.seed('Convenios', [{ ID: 'CVN-OLD', Organizacion: 'Instituto Uno', Objeto: 'Histórico', Estado: 'activo' }])
    app.seed('Inscripciones', [{ ID: 'INS-OLD', RequiereAvalExterno: true, InstitucionAval: 'Instituto Uno' }])
    const detail = app.context.processRequest({ action: 'getInstitucionMaestra', token: 'admin-token', id: created.id })
    expect(detail.data.convenios).toEqual([])
    expect(app.objects('Convenios')[0].InstitucionID).toBe('')
    expect(app.objects('Inscripciones')[0].InstitucionAval).toBe('Instituto Uno')
  })

  it('migra InstitucionID sin mover ni invalidar las cuatro columnas finales del handoff CRM', () => {
    const app = harness()
    app.seed('Inscripciones', [{ ID: 'INS-OLD', InstitucionAval: 'Instituto legado',
      CRMEnrollmentID: 'ENR-OLD', CRMContactID: 'CTC-OLD', CRMCourseID: 'CRS-OLD', Origen: 'CRM' }])
    const sheet = app.sheets.Inscripciones
    const institutionColumn = sheet.rows[0].indexOf('InstitucionID')
    sheet.rows.forEach(row => row.splice(institutionColumn, 1))
    sheet.formulas.forEach(row => row.splice(institutionColumn, 1))
    sheet.formats.forEach(row => row.splice(institutionColumn, 1))

    app.context.getSheet('Inscripciones')
    const headers = sheet.rows[0]
    expect(headers.indexOf('InstitucionID')).toBeLessThan(headers.indexOf('CRMEnrollmentID'))
    expect(headers.slice(-4)).toEqual(['CRMEnrollmentID', 'CRMContactID', 'CRMCourseID', 'Origen'])
    expect(app.objects('Inscripciones')[0]).toMatchObject({
      InstitucionID: '', InstitucionAval: 'Instituto legado', CRMEnrollmentID: 'ENR-OLD',
      CRMContactID: 'CTC-OLD', CRMCourseID: 'CRS-OLD', Origen: 'CRM',
    })
  })
})
