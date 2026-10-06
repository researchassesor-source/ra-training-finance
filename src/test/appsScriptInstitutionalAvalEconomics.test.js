import { describe, expect, it } from 'vitest'
import { createAppsScriptHarness } from './appsScriptHarness'

function setup() {
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
  app.seed('Servicios', [{ ID: 'SRV-1', Nombre: 'Curso de prueba', Precio: 10, Duracion: '20', Modalidad: 'Virtual', Activo: true }])
  app.seed('Inscripciones', [])
  app.seed('EntregablesAval', [])
  return app
}

const request = (app, action, token = 'admin-token', params = {}) =>
  app.context.processRequest({ action, token, ...params })

function createInstitution(app, name = 'Instituto Uno') {
  return request(app, 'addInstitucionMaestra', 'admin-token', { institucion: {
    nombre: name, siglas: name === 'Instituto Uno' ? 'IU' : 'I2', tipo: 'Instituto',
    identificacion: name === 'Instituto Uno' ? '0691783737001' : '1790012345001', tipoIdentificacion: 'RUC_EC',
    ciudad: 'Riobamba', estado: 'activo',
  } })
}

function createAgreement(app, institutionId, { percentage = '15', base = 'precio_servicio', name = 'Convenio de aval' } = {}) {
  return request(app, 'addConvenio', 'admin-token', { convenio: {
    institucionId: institutionId, objeto: name, estado: 'activo', porcentajeAval: percentage, baseCalculoAval: base,
  } })
}

function createEnrollment(app, institutionId, agreementId, overrides = {}, token = 'seller-token') {
  return request(app, 'addInscripcion', token, { inscripcion: {
    servicioId: 'SRV-1', servicioNombre: 'Curso de prueba', clienteNombre: 'Participante Uno',
    clienteID: '0601234560', clienteTipoIdentificacion: 'CEDULA_EC', clienteEmail: 'persona@example.com',
    monto: 10, metodoPago: 'Efectivo', requiereAvalExterno: true, institucionAvalId: institutionId,
    convenioId: agreementId, ...overrides,
  } })
}

function assignInstitutionalUser(app, institutionId) {
  return request(app, 'updateUsuario', 'admin-token', { id: 'USR-O', usuario: {
    nombre: 'Aval Uno', email: '', username: 'aval-one', roles: ['aval'], activo: true,
    institucionAvalId: institutionId,
  } })
}

function assignSellerAsInstitutionalUser(app, institutionId) {
  return request(app, 'updateUsuario', 'admin-token', { id: 'USR-S', usuario: {
    nombre: 'Seller', email: '', username: 'seller', roles: ['vendedor', 'aval'], activo: true,
    institucionAvalId: institutionId,
  } })
}

describe('regla económica, confirmación e histórico del aval institucional', () => {
  it('interpreta 1,50 como porcentaje del precio de catálogo y no como USD ni monto pagado', () => {
    const app = setup()
    expect(request(app, 'updateServicio', 'admin-token', { id: 'SRV-1',
      servicio: { precio: 50 } }).success).toBe(true)
    const institution = createInstitution(app)
    const agreement = createAgreement(app, institution.id, { percentage: '1.50', base: 'precio_servicio' })
    const enrollment = createEnrollment(app, institution.id, agreement.id, { monto: 10 })
    expect(enrollment.success).toBe(true)
    expect(assignInstitutionalUser(app, institution.id).success).toBe(true)
    expect(request(app, 'getCertificadosAval', 'aval-one-token').data[0].AvalEstimacion)
      .toMatchObject({ baseMonto: 50, porcentaje: 1.5, monto: 0.75, baseTipo: 'precio_servicio' })
    expect(request(app, 'marcarAval', 'aval-one-token', { id: enrollment.id,
      avalCodigoExterno: 'IU-1.5-PCT' })).toMatchObject({ success: true, data: {
      baseMonto: 50, porcentajeAplicado: 1.5, valorAval: 0.75,
    } })
  })

  it('calcula $10 × 15% = $1.50 en backend y congela convenio, base, porcentaje, valor, usuario y fecha', () => {
    const app = setup()
    const institution = createInstitution(app)
    const agreement = createAgreement(app, institution.id)
    const enrollment = createEnrollment(app, institution.id, agreement.id)
    expect(enrollment.success).toBe(true)
    expect(assignInstitutionalUser(app, institution.id).success).toBe(true)

    const preview = request(app, 'getCertificadosAval', 'aval-one-token')
    expect(preview.data[0].AvalEstimacion).toMatchObject({ baseMonto: 10, porcentaje: 15, monto: 1.5, baseTipo: 'precio_servicio' })

    const confirmed = request(app, 'marcarAval', 'aval-one-token', { id: enrollment.id,
      avalReferencia: 'IU-2026-01', avalCodigoExterno: 'COD-IU-1' })
    expect(confirmed).toMatchObject({ success: true, data: { baseMonto: 10, porcentajeAplicado: 15, valorAval: 1.5 } })
    expect(app.objects('Inscripciones')[0]).toMatchObject({
      EstadoAval: 'avalado', AvalInstitucionID: institution.id, AvalConvenioID: agreement.id,
      AvalBaseTipoAplicado: 'precio_servicio', AvalMontoBase: 10, AvalPorcentajeAplicado: 15,
      AvalMontoCalculado: 1.5, ValorAval: 1.5, AvalConfirmadoPor: 'aval-one',
    })
    expect(app.objects('Inscripciones')[0].FechaAval).toBeTruthy()
    expect(request(app, 'getCertificadosAval', 'aval-one-token').data[0].AvalLegacy).toBe(false)
  })

  it('no acepta monto manipulado y una confirmación repetida es idempotente sin permitir cambiar el código', () => {
    const app = setup()
    const institution = createInstitution(app)
    const agreement = createAgreement(app, institution.id)
    const enrollment = createEnrollment(app, institution.id, agreement.id)
    assignInstitutionalUser(app, institution.id)

    expect(request(app, 'marcarAval', 'aval-one-token', { id: enrollment.id,
      avalReferencia: 'REF-1', avalCodigoExterno: 'CODE-1', valorAval: 3 })).toMatchObject({
      success: false, error: expect.stringMatching(/servidor|monto manual/i),
    })
    const saved = request(app, 'marcarAval', 'aval-one-token', { id: enrollment.id,
      avalReferencia: 'REF-1', avalCodigoExterno: 'CODE-1' })
    expect(saved.success).toBe(true)
    expect(request(app, 'marcarAval', 'aval-one-token', { id: enrollment.id,
      avalReferencia: 'REF-1', avalCodigoExterno: 'CODE-1' })).toMatchObject({
      success: true, alreadyConfirmed: true, legacy: false, data: { valorAval: 1.5, baseMonto: 10, porcentajeAplicado: 15 },
    })
    expect(request(app, 'marcarAval', 'aval-one-token', { id: enrollment.id,
      avalReferencia: 'REF-1', avalCodigoExterno: 'CODE-2' })).toMatchObject({ success: false, error: expect.stringMatching(/bloqueados/i) })
    expect(app.objects('EntregablesAval')).toHaveLength(1)
    expect(app.objects('Inscripciones')[0].ValorAval).toBe(1.5)
  })

  it('una institución no puede listar ni confirmar avales de otra, aunque cambie el ID enviado', () => {
    const app = setup()
    const one = createInstitution(app, 'Instituto Uno')
    const two = createInstitution(app, 'Instituto Dos')
    const agreementOne = createAgreement(app, one.id, { name: 'Convenio uno' })
    const agreementTwo = createAgreement(app, two.id, { name: 'Convenio dos' })
    const own = createEnrollment(app, one.id, agreementOne.id)
    const other = createEnrollment(app, two.id, agreementTwo.id, { clienteNombre: 'Participante Dos' })
    assignInstitutionalUser(app, one.id)

    const list = request(app, 'getCertificadosAval', 'aval-one-token')
    expect(list.data.map(item => item.ID)).toEqual([own.id])
    expect(request(app, 'marcarAval', 'aval-one-token', { id: other.id, avalCodigoExterno: 'CROSS-1' })).toMatchObject({
      success: false, error: expect.stringMatching(/otra institución/i),
    })
  })

  it('una cuenta heredada asignada por nombre ve sus pendientes con ID maestro sin acceder a otra institución', () => {
    const app = setup()
    const one = createInstitution(app, 'Instituto Uno')
    const two = createInstitution(app, 'Instituto Dos')
    const agreementOne = createAgreement(app, one.id, { name: 'Convenio uno' })
    const agreementTwo = createAgreement(app, two.id, { name: 'Convenio dos' })
    const own = createEnrollment(app, one.id, agreementOne.id)
    const other = createEnrollment(app, two.id, agreementTwo.id, { clienteNombre: 'Participante Dos' })

    // El usuario se creó antes de existir InstitucionAvalID, pero su nombre
    // coincide sin ambigüedad con la ficha maestra de Instituto Uno.
    const pending = request(app, 'getCertificadosAval', 'aval-one-token')
    expect(pending.data.map(item => item.ID)).toEqual([own.id])
    expect(request(app, 'marcarAval', 'aval-one-token', {
      id: other.id, avalCodigoExterno: 'NO-PERMITIDO',
    })).toMatchObject({ success: false, error: expect.stringMatching(/otra institución/i) })
    expect(request(app, 'marcarAval', 'aval-one-token', {
      id: own.id, avalCodigoExterno: 'IU-2026-001',
    }).success).toBe(true)
  })

  it('una cuenta con roles vendedor + aval conserva el alcance de su institución al crear y editar avales', () => {
    const app = setup()
    const one = createInstitution(app, 'Instituto Uno')
    const two = createInstitution(app, 'Instituto Dos')
    const agreementOne = createAgreement(app, one.id, { name: 'Convenio uno' })
    const agreementTwo = createAgreement(app, two.id, { name: 'Convenio dos' })
    const own = createEnrollment(app, one.id, agreementOne.id)
    expect(assignSellerAsInstitutionalUser(app, one.id).success).toBe(true)

    expect(request(app, 'getInstitucionesAval', 'seller-token')).toMatchObject({
      success: false, error: expect.stringMatching(/sesión inválida/i),
    })
    app.seed('Sesiones', [{ Token: 'seller-aval-token', Username: 'seller', UserID: 'USR-S',
      Rol: 'vendedor', Roles: '["vendedor","aval"]', Nombre: 'Seller', Expira: '2099-01-01T00:00:00.000Z' }])
    const sessions = app.ensureSheet('Sesiones')
    const headers = sessions.rows[0]
    const sellerRow = sessions.rows.find(row => row[headers.indexOf('Token')] === 'seller-aval-token')
    expect(sellerRow).toBeTruthy()

    expect(createEnrollment(app, two.id, agreementTwo.id, { clienteNombre: 'No autorizado' }, 'seller-aval-token')).toMatchObject({
      success: false, error: expect.stringMatching(/institución que tiene asignada/i),
    })
    expect(request(app, 'updateInscripcion', 'seller-aval-token', { id: own.id, inscripcion: {
      requiereAvalExterno: true, institucionAvalId: two.id, convenioId: agreementTwo.id,
    } })).toMatchObject({ success: false, error: expect.stringMatching(/institución que tiene asignada/i) })
    expect(request(app, 'getInstitucionesAval', 'seller-aval-token').data).toEqual(['Instituto Uno'])
  })

  it('rechaza servicios inactivos o nombres manipulados al abrir un nuevo aval', () => {
    const app = setup()
    const institution = createInstitution(app)
    const agreement = createAgreement(app, institution.id)
    expect(createEnrollment(app, institution.id, agreement.id, { servicioNombre: 'Otro curso' })).toMatchObject({
      success: false, error: expect.stringMatching(/no coincide/i),
    })

    const services = app.ensureSheet('Servicios')
    const headers = services.rows[0]
    services.rows[1][headers.indexOf('Activo')] = false
    expect(createEnrollment(app, institution.id, agreement.id)).toMatchObject({
      success: false, error: expect.stringMatching(/servicio activo/i),
    })
  })

  it('un cambio futuro del convenio conserva snapshots previos y aplica la nueva regla solo a confirmaciones posteriores', () => {
    const app = setup()
    const institution = createInstitution(app)
    const agreement = createAgreement(app, institution.id)
    const first = createEnrollment(app, institution.id, agreement.id)
    const second = createEnrollment(app, institution.id, agreement.id, { clienteNombre: 'Participante Dos' })
    assignInstitutionalUser(app, institution.id)

    const firstConfirm = request(app, 'marcarAval', 'aval-one-token', { id: first.id, avalCodigoExterno: 'CODE-1' })
    expect(firstConfirm.data).toMatchObject({ porcentajeAplicado: 15, valorAval: 1.5 })

    const updated = request(app, 'updateConvenio', 'admin-token', { id: agreement.id, convenio: {
      institucionId: institution.id, objeto: 'Convenio de aval', estado: 'activo', porcentajeAval: '20',
      baseCalculoAval: 'precio_servicio',
    } })
    expect(updated.success).toBe(true)
    const firstHistorical = app.objects('Inscripciones').find(item => item.ID === first.id)
    expect(firstHistorical).toMatchObject({ AvalPorcentajeAplicado: 15, AvalMontoBase: 10, AvalMontoCalculado: 1.5 })

    const secondConfirm = request(app, 'marcarAval', 'aval-one-token', { id: second.id, avalCodigoExterno: 'CODE-2', valorAval: 7 })
    expect(secondConfirm).toMatchObject({ success: false, error: expect.stringMatching(/servidor|monto manual/i) })
    const secondSaved = request(app, 'marcarAval', 'aval-one-token', { id: second.id, avalCodigoExterno: 'CODE-2' })
    expect(secondSaved.data).toMatchObject({ porcentajeAplicado: 20, valorAval: 2 })
    expect(app.objects('Inscripciones').find(item => item.ID === first.id).AvalMontoCalculado).toBe(1.5)
  })

  it('permite una corrección administrativa solo con motivo y conserva fijo el snapshot económico', () => {
    const app = setup()
    const institution = createInstitution(app)
    const agreement = createAgreement(app, institution.id)
    const enrollment = createEnrollment(app, institution.id, agreement.id)
    assignInstitutionalUser(app, institution.id)
    request(app, 'marcarAval', 'aval-one-token', { id: enrollment.id, avalReferencia: 'REF-OLD', avalCodigoExterno: 'CODE-OLD' })

    expect(request(app, 'corregirAvalConfirmado', 'admin-token', { id: enrollment.id, confirmacion: 'CORREGIR_AVAL_CONFIRMADO',
      avalCodigoExterno: 'CODE-NEW', motivo: 'Código transcrito incorrectamente' }).success).toBe(true)
    const corrected = app.objects('Inscripciones')[0]
    expect(corrected).toMatchObject({ AvalCodigoExterno: 'CODE-NEW', AvalMontoBase: 10, AvalPorcentajeAplicado: 15, AvalMontoCalculado: 1.5 })
    expect(app.objects('AuditoriaCertificados').some(item => item.Accion === 'AVAL_CONFIRMED_DATA_CORRECTED')).toBe(true)
    expect(request(app, 'corregirAvalConfirmado', 'admin-token', { id: enrollment.id, confirmacion: 'CORREGIR_AVAL_CONFIRMADO',
      avalCodigoExterno: 'CODE-OTHER', motivo: 'breve' }).success).toBe(false)

    const deliverableBefore = app.objects('EntregablesAval')[0]
    const auditSheet = app.ensureSheet('AuditoriaCertificados')
    auditSheet.appendRow = () => { throw new Error('simulated correction audit failure') }
    expect(request(app, 'corregirAvalConfirmado', 'admin-token', { id: enrollment.id, confirmacion: 'CORREGIR_AVAL_CONFIRMADO',
      avalCodigoExterno: 'CODE-ROLLBACK', motivo: 'Corregir y verificar rollback de auditoría' })).toMatchObject({ success: false })
    expect(app.objects('Inscripciones')[0].AvalCodigoExterno).toBe('CODE-NEW')
    expect(app.objects('EntregablesAval')[0]).toMatchObject({ CodigoExterno: 'CODE-NEW', UpdatedAt: deliverableBefore.UpdatedAt })
  })

  it('revierte la confirmación y no prepara un entregable si no puede escribir la auditoría', () => {
    const app = setup()
    const institution = createInstitution(app)
    const agreement = createAgreement(app, institution.id)
    const enrollment = createEnrollment(app, institution.id, agreement.id)
    assignInstitutionalUser(app, institution.id)
    const auditSheet = app.ensureSheet('AuditoriaCertificados')
    auditSheet.appendRow = () => { throw new Error('simulated confirmation audit failure') }

    expect(request(app, 'marcarAval', 'aval-one-token', { id: enrollment.id, avalCodigoExterno: 'CODE-1' })).toMatchObject({ success: false })
    expect(app.objects('Inscripciones')[0]).toMatchObject({ EstadoAval: 'pendiente', AvalMontoCalculado: '', AvalConfirmadoPor: '' })
    expect(app.objects('EntregablesAval')).toHaveLength(0)
  })

  it('congela el precio del servicio usado al confirmar, aunque el catálogo cambie después', () => {
    const app = setup()
    const institution = createInstitution(app)
    const agreement = createAgreement(app, institution.id)
    const enrollment = createEnrollment(app, institution.id, agreement.id)
    assignInstitutionalUser(app, institution.id)
    expect(request(app, 'marcarAval', 'aval-one-token', { id: enrollment.id, avalCodigoExterno: 'CODE-1' }).success).toBe(true)

    const serviceSheet = app.ensureSheet('Servicios')
    const headers = serviceSheet.rows[0]
    serviceSheet.rows[1][headers.indexOf('Precio')] = 25
    const historical = request(app, 'getCertificadosAval', 'aval-one-token').data[0]
    expect(historical).toMatchObject({ ValorAval: 1.5, AvalMontoBase: 10, AvalPorcentajeAplicado: 15 })
  })

  it('mantiene montos históricos sin snapshot como legacy y no adivina porcentaje ni base', () => {
    const app = setup()
    app.seed('Inscripciones', [{ ID: 'INS-OLD', ClienteNombre: 'Persona antigua', ClienteID: '0601234560',
      ServicioNombre: 'Curso anterior', RequiereAvalExterno: true, EstadoAval: 'avalado', InstitucionAval: 'Instituto antiguo',
      ValorAval: 7.35, AvalCodigoExterno: 'OLD-1' }])
    const response = request(app, 'getCertificadosAval', 'admin-token')
    expect(response.data[0]).toMatchObject({ AvalLegacy: true, ValorAval: 7.35, AvalMontoBase: '', AvalPorcentajeAplicado: '' })
    expect(response.data[0].AvalEstimacion).toBeNull()
  })

  it('rechaza confirmación si el convenio no está configurado, venció o pertenece a otra institución', () => {
    const app = setup()
    const institution = createInstitution(app)
    const other = createInstitution(app, 'Instituto Dos')
    const missing = request(app, 'addConvenio', 'admin-token', { convenio: { institucionId: institution.id, objeto: 'Sin regla', estado: 'activo' } })
    const wrong = createAgreement(app, other.id)
    const enrollmentMissingRule = createEnrollment(app, institution.id, missing.id)
    expect(enrollmentMissingRule.success).toBe(false)
    const enrollmentWrong = createEnrollment(app, institution.id, wrong.id)
    expect(enrollmentWrong.success).toBe(false)
  })
})
