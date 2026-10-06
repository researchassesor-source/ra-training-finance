import { describe, expect, it } from 'vitest'
import { createAppsScriptHarness } from './appsScriptHarness'
import { PARTICIPANT_CERTIFICATE_TYPES } from '../config/certificateTypes'

function createHarness() {
  const harness = createAppsScriptHarness()
  harness.seed('Sesiones', [{
    Token: 'admin-token', Username: 'admin', UserID: 'USR-A', Rol: 'admin', Nombre: 'Admin', Expira: '2099-01-01T00:00:00.000Z',
  }])
  harness.seed('Usuarios', [{ ID: 'USR-A', Nombre: 'Admin', Username: 'admin', Rol: 'admin', Activo: true }])
  harness.seed('Servicios', [])
  harness.seed('Inscripciones', [])
  harness.seed('Proyecciones', [])
  return harness
}

describe('servicios y calendario operativo', () => {
  it('guarda por separado el período académico y las fechas del evento en vivo', () => {
    const harness = createHarness()
    const created = harness.context.processRequest({
      action: 'addServicio', token: 'admin-token',
      servicio: { nombre: 'Curso de prueba', tipo: 'Curso', duracion: '60',
        fechaInicioCurso: '2026-10-26', fechaFinCurso: '2026-10-30',
        fechaEvento: '2026-10-28', fechaFinEvento: '2026-10-28' },
    })
    expect(created.success).toBe(true)
    expect(harness.objects('Servicios')[0]).toMatchObject({
      FechaInicioCurso: '2026-10-26', FechaFinCurso: '2026-10-30',
      FechaEvento: '2026-10-28', FechaFinEvento: '2026-10-28',
    })
    const enrollment = harness.context.processRequest({ action: 'addInscripcion', token: 'admin-token',
      inscripcion: { servicioId: created.id, servicioNombre: 'Curso de prueba',
        clienteNombre: 'Participante Curso', clienteID: '0601234560',
        clienteTipoIdentificacion: 'CEDULA_EC', monto: 0, metodoPago: 'Efectivo' } })
    expect(enrollment.success).toBe(true)
    expect(harness.objects('Inscripciones')[0]).toMatchObject({
      FechaInicio: '2026-10-26', FechaFin: '2026-10-30',
    })
    const invalid = harness.context.processRequest({ action: 'updateServicio', token: 'admin-token', id: created.id,
      servicio: { fechaInicioCurso: '2026-10-31' } })
    expect(invalid.success).toBe(false)
    expect(harness.context.processRequest({ action: 'updateServicio', token: 'admin-token', id: created.id,
      servicio: { fechaFinCurso: 'fecha inválida' } }).success).toBe(false)
    expect(harness.context.processRequest({ action: 'addInscripcion', token: 'admin-token',
      inscripcion: { servicioId: created.id, servicioNombre: 'Curso de prueba',
        clienteNombre: 'Participante Dos', clienteID: '0601234560', clienteTipoIdentificacion: 'CEDULA_EC',
        monto: 0, metodoPago: 'Efectivo', fechaInicio: '2026-10-31' } }).success).toBe(false)
    expect(harness.objects('Servicios')[0].FechaInicioCurso).toBe('2026-10-26')
    expect(harness.objects('Inscripciones')).toHaveLength(1)
  })

  it('solo admite tipos de certificados de participantes y mantiene sincronizado el catálogo con Apps Script', () => {
    const harness = createHarness()
    Object.keys(PARTICIPANT_CERTIFICATE_TYPES).forEach((tipoCertificado, index) => {
      const result = harness.context.processRequest({
        action: 'addServicio', token: 'admin-token',
        servicio: { nombre: `Servicio ${index}`, tipo: 'Evento', tipoCertificado },
      })
      expect(result.success).toBe(true)
    })
    expect(harness.objects('Servicios').map(row => row.TipoCertificado)).toEqual(Object.keys(PARTICIPANT_CERTIFICATE_TYPES))
    const staff = harness.context.processRequest({
      action: 'addServicio', token: 'admin-token',
      servicio: { nombre: 'Falso ponente', tipo: 'Evento', tipoCertificado: 'ponente' },
    })
    expect(staff.success).toBe(false)
    expect(harness.objects('Servicios')).toHaveLength(Object.keys(PARTICIPANT_CERTIFICATE_TYPES).length)
  })

  it('registra fichas de capacitadores, vincula servicios y propaga cambios sin tocar certificados', () => {
    const harness = createHarness()
    harness.seed('AuditoriaCertificados', [])
    const created = harness.context.processRequest({
      action: 'addCapacitador', token: 'admin-token',
      capacitador: { nombre: 'Docente de Prueba', identificacion: '0100000009', tipoIdentificacion: 'CEDULA_EC', resumen: 'Experiencia académica acreditada.' },
    })
    expect(created.success).toBe(true)
    const trainer = harness.context.processRequest({ action: 'getCapacitadores', token: 'admin-token' }).data[0]
    expect(trainer).toMatchObject({ ID: created.id, Nombre: 'Docente de Prueba', Identificacion: '0100000009', TipoIdentificacion: 'CEDULA_EC' })
    const trainerHeaders = harness.sheets.Capacitadores.rows[0]
    expect(harness.sheets.Capacitadores.formats[1][trainerHeaders.indexOf('Identificacion')]).toBe('@')
    expect(harness.context.processRequest({
      action: 'addServicio', token: 'admin-token',
      servicio: { nombre: 'Curso con docente', tipo: 'Curso', duracion: '40', capacitadorId: created.id },
    }).success).toBe(true)
    expect(harness.objects('Servicios')[0]).toMatchObject({ CapacitadorID: created.id, Capacitador: 'Docente de Prueba' })
    expect(harness.context.processRequest({
      action: 'updateCapacitador', token: 'admin-token', id: created.id,
      capacitador: { nombre: 'Docente de Prueba Completo', resumen: 'Nueva semblanza profesional.' },
    }).success).toBe(true)
    expect(harness.objects('Servicios')[0].Capacitador).toBe('Docente de Prueba Completo')
    expect(harness.objects('AuditoriaCertificados').map(row => row.Accion)).toEqual(expect.arrayContaining([
      'TRAINER_PROFILE_CREATED', 'TRAINER_PROFILE_UPDATED',
    ]))
  })

  it('rechaza perfiles duplicados y revierte creación si no puede auditar', () => {
    const harness = createHarness()
    harness.seed('AuditoriaCertificados', [])
    const input = { nombre: 'Docente de Prueba', identificacion: '0100000009', tipoIdentificacion: 'CEDULA_EC' }
    expect(harness.context.processRequest({ action: 'addCapacitador', token: 'admin-token', capacitador: input }).success).toBe(true)
    expect(harness.context.processRequest({ action: 'addCapacitador', token: 'admin-token', capacitador: input }).success).toBe(false)
    harness.sheets.AuditoriaCertificados.appendRow = () => { throw new Error('audit unavailable') }
    expect(harness.context.processRequest({ action: 'addCapacitador', token: 'admin-token', capacitador: { nombre: 'Otro Docente' } }).success).toBe(false)
    expect(harness.objects('Capacitadores')).toHaveLength(1)
  })

  it('rechaza una cédula ecuatoriana inválida y no aplica su algoritmo a un pasaporte', () => {
    const harness = createHarness()
    harness.seed('AuditoriaCertificados', [])
    const invalidCedula = harness.context.processRequest({
      action: 'addCapacitador', token: 'admin-token',
      capacitador: { nombre: 'Docente Inválido', identificacion: '0601234567', tipoIdentificacion: 'CEDULA_EC' },
    })
    const passport = harness.context.processRequest({
      action: 'addCapacitador', token: 'admin-token',
      capacitador: { nombre: 'Docente Extranjero', identificacion: '1234567890', tipoIdentificacion: 'PASAPORTE' },
    })
    expect(invalidCedula.success).toBe(false)
    expect(invalidCedula.error).toMatch(/dígito verificador/)
    expect(passport.success).toBe(true)
    expect(harness.objects('Capacitadores')[0]).toMatchObject({ Identificacion: '1234567890', TipoIdentificacion: 'PASAPORTE' })
  })

  it('prepara el certificado de capacitador sin crear una inscripción ni emitir o alterar certificados', () => {
    const harness = createHarness()
    harness.seed('Capacitadores', [{
      ID: 'CAP-1', Nombre: 'Docente de Prueba', Identificacion: '0100000001',
      Resumen: 'Investigadora y docente en educación superior.', Activo: true,
    }])
    harness.seed('Servicios', [{
      ID: 'SRV-1', Nombre: 'Seminario de Derecho', Tipo: 'Evento', Modalidad: 'Virtual',
      Duracion: '40 horas', FechaEvento: '2026-09-05', FechaFinEvento: '2026-09-07',
      CapacitadorID: 'CAP-1', Capacitador: 'Docente de Prueba', EstadoEvento: 'finalizado',
    }])
    const before = JSON.stringify(harness.sheets.Servicios.rows)
    const result = harness.context.processRequest({
      action: 'preflightCertificadoCapacitador', token: 'admin-token', servicioId: 'SRV-1',
    })
    expect(result).toMatchObject({ success: true, data: {
      tipo: 'capacitador', nombre: 'Docente de Prueba', identificacion: '0100000001',
      curso: 'Seminario de Derecho', duracion: '40 horas', datosCompletos: true,
      emisionHabilitada: false, bloqueosDatos: [],
    } })
    expect(JSON.stringify(harness.sheets.Servicios.rows)).toBe(before)
    expect(harness.objects('Inscripciones')).toHaveLength(0)
    expect(harness.objects('Certificados')).toHaveLength(0)
    expect(harness.objects('AuditoriaCertificados')).toHaveLength(0)
    expect(harness.context.processRequest({
      action: 'preflightCertificadoCapacitador', token: 'admin-token', servicioId: 'SRV-1',
    })).toEqual(result)
  })

  it('detecta datos faltantes y no permite que vendedores consulten fichas profesionales', () => {
    const harness = createHarness()
    harness.seed('Sesiones', [{ Token: 'seller-token', Username: 'seller', UserID: 'USR-S', Rol: 'vendedor',
      Nombre: 'Vendedor', Expira: '2099-01-01T00:00:00.000Z' }])
    harness.seed('Servicios', [{ ID: 'SRV-1', Nombre: 'Curso', Tipo: 'Curso', Duracion: '3 días',
      Capacitador: 'Nombre manual', FechaEvento: '2026-09-09', FechaFinEvento: '2026-09-08' }])
    const admin = harness.context.processRequest({
      action: 'preflightCertificadoCapacitador', token: 'admin-token', servicioId: 'SRV-1',
    })
    expect(admin.success).toBe(true)
    expect(admin.data.datosCompletos).toBe(false)
    expect(admin.data.bloqueosDatos).toEqual(expect.arrayContaining([
      expect.stringContaining('Vincule una ficha'),
      expect.stringContaining('horas'),
      expect.stringContaining('fechas válidas'),
    ]))
    expect(harness.context.processRequest({
      action: 'preflightCertificadoCapacitador', token: 'seller-token', servicioId: 'SRV-1',
    }).success).toBe(false)
    expect(harness.context.processRequest({
      action: 'preflightCertificadoCapacitador', token: 'admin-token', servicioId: 'SRV-NONE',
    }).success).toBe(false)
  })

  it('guarda el tipo por servicio y congela aprobación al emitir sin cambiar certificados históricos', () => {
    const harness = createHarness()
    harness.seed('AuditoriaCertificados', [])
    harness.seed('Certificados', [])
    const created = harness.context.processRequest({
      action: 'addServicio', token: 'admin-token',
      servicio: { nombre: 'Seminario de Derecho', tipo: 'Evento', modalidad: 'Virtual', duracion: '8', tipoCertificado: 'asistencia' },
    })
    const service = harness.objects('Servicios')[0]
    expect(created.success).toBe(true)
    expect(service.TipoCertificado).toBe('asistencia')
    harness.seed('Inscripciones', [{
      ID: 'INS-EVENT', ClienteNombre: 'Participante', ClienteID: '0100000001', ServicioID: service.ID,
      ServicioNombre: service.Nombre, Modalidad: 'Virtual', FechaInicio: '2026-09-01', FechaFin: '2026-09-02',
      EstadoPago: 'verificado', EstadoCertificado: 'pendiente',
    }])
    const blocked = harness.context.processRequest({ action: 'emitirCertificado', token: 'admin-token', id: 'INS-EVENT' })
    expect(blocked.success).toBe(false)
    expect(blocked.error).toContain('pendiente de firmas')
    expect(harness.objects('Certificados')).toHaveLength(0)
    expect(harness.context.processRequest({ action: 'updateServicio', token: 'admin-token', id: service.ID, servicio: { tipoCertificado: 'aprobacion' } }).success).toBe(true)
    const issued = harness.context.processRequest({ action: 'emitirCertificado', token: 'admin-token', id: 'INS-EVENT' })
    expect(issued).toMatchObject({ success: true, data: { CertificateType: 'aprobacion' } })
    expect(harness.objects('Certificados')[0].CertificateType).toBe('aprobacion')
    expect(harness.context.processRequest({ action: 'updateServicio', token: 'admin-token', id: service.ID, servicio: { tipoCertificado: 'participacion' } }).success).toBe(true)
    expect(harness.objects('Certificados')[0].CertificateType).toBe('aprobacion')
    expect(harness.context.processRequest({ action: 'emitirCertificado', token: 'admin-token', id: 'INS-EVENT' }).data.CertificateType).toBe('aprobacion')
  })

  it('guarda capacitador y estado de evento como datos independientes del estado activo del curso', () => {
    const harness = createHarness()
    const created = harness.context.processRequest({
      action: 'addServicio',
      token: 'admin-token',
      servicio: {
        nombre: 'Habilidades blandas para profesionales',
        tipo: 'Curso',
        modalidad: 'Virtual',
        precio: 8,
        duracion: '40 horas',
        fechaEvento: '2026-09-01',
        fechaFinEvento: '2026-09-03',
        lugarEvento: 'Online',
        capacitador: 'Alexandra Villagómez',
      },
    })

    const row = harness.objects('Servicios')[0]
    expect(created.success).toBe(true)
    expect(row).toMatchObject({
      Activo: true,
      Capacitador: 'Alexandra Villagómez',
      EstadoEvento: 'programado',
    })
  })

  it('muestra eventos que cruzan de mes, incluye capacitador y oculta fechas finalizadas', () => {
    const harness = createHarness()
    harness.seed('Servicios', [
      {
        ID: 'SRV-1', Nombre: 'Curso cruza mes', Tipo: 'Curso', Modalidad: 'Virtual', Precio: 10, Duracion: '10 horas',
        Activo: true, FechaEvento: '2026-08-30', FechaFinEvento: '2026-09-02', LugarEvento: 'Online',
        Capacitador: 'Capacitador Uno', EstadoEvento: 'programado',
      },
      {
        ID: 'SRV-2', Nombre: 'Curso finalizado', Tipo: 'Curso', Modalidad: 'Virtual', Precio: 10, Duracion: '10 horas',
        Activo: true, FechaEvento: '2026-09-05', FechaFinEvento: '2026-09-05', LugarEvento: 'Online',
        Capacitador: 'Capacitador Dos', EstadoEvento: 'finalizado',
      },
    ])

    const result = harness.context.processRequest({
      action: 'getCalendario',
      token: 'admin-token',
      year: 2026,
      month: 9,
    })

    expect(result.success).toBe(true)
    expect(result.data).toHaveLength(1)
    expect(result.data[0]).toMatchObject({
      id: 'SRV-1',
      titulo: 'Curso cruza mes',
      capacitador: 'Capacitador Uno',
      estadoEvento: 'programado',
      cursoActivo: true,
    })
  })

  it('permite finalizar solo la fecha del evento sin desactivar el curso', () => {
    const harness = createHarness()
    harness.seed('Servicios', [{
      ID: 'SRV-1', Nombre: 'Curso activo', Tipo: 'Curso', Modalidad: 'Virtual', Precio: 10, Duracion: '10 horas',
      Activo: true, FechaEvento: '2026-09-10', FechaFinEvento: '2026-09-10', Capacitador: 'Capacitador Uno',
      EstadoEvento: 'programado',
    }])

    const updated = harness.context.processRequest({
      action: 'updateServicio',
      token: 'admin-token',
      id: 'SRV-1',
      servicio: { estadoEvento: 'finalizado' },
    })
    const row = harness.objects('Servicios')[0]
    const calendar = harness.context.processRequest({ action: 'getCalendario', token: 'admin-token', year: 2026, month: 9 })

    expect(updated.success).toBe(true)
    expect(row.Activo).toBe(true)
    expect(row.EstadoEvento).toBe('finalizado')
    expect(row.Capacitador).toBe('Capacitador Uno')
    expect(calendar.data).toEqual([])
  })

  it('getServicios devuelve datos frescos después de actualizar capacitador', () => {
    const harness = createHarness()
    harness.seed('Servicios', [{
      ID: 'SRV-1', Nombre: 'Curso activo', Tipo: 'Curso', Modalidad: 'Virtual', Precio: 10, Duracion: '10 horas',
      Activo: true, FechaEvento: '2026-09-10', FechaFinEvento: '2026-09-10', Capacitador: '',
      EstadoEvento: 'programado',
    }])

    const updated = harness.context.processRequest({
      action: 'updateServicio',
      token: 'admin-token',
      id: 'SRV-1',
      servicio: { capacitador: 'Omar', estadoEvento: 'programado' },
    })
    const servicios = harness.context.processRequest({ action: 'getServicios', token: 'admin-token' })

    expect(updated.success).toBe(true)
    expect(servicios.data[0].Capacitador).toBe('Omar')
    expect(servicios.data[0].EstadoEvento).toBe('programado')
  })

  it('persiste capacitador aunque la hoja productiva tenga encabezado duplicado', () => {
    const harness = createHarness()
    const sheet = harness.ensureSheet('Servicios')
    sheet.rows[0].push('Capacitador')
    harness.seed('Servicios', [{
      ID: 'SRV-1', Nombre: 'Curso con columna duplicada', Tipo: 'Curso', Modalidad: 'Virtual',
      Precio: 10, Duracion: '10 horas', Activo: true, EstadoEvento: 'programado',
    }])
    sheet.rows[1][sheet.rows[0].length - 1] = ''

    const updated = harness.context.processRequest({
      action: 'updateServicio',
      token: 'admin-token',
      id: 'SRV-1',
      servicio: { capacitador: 'Omar' },
    })
    const servicios = harness.context.processRequest({ action: 'getServicios', token: 'admin-token' })
    const headers = sheet.rows[0]
    const capIndexes = headers.map((h, i) => (h === 'Capacitador' ? i : -1)).filter(i => i >= 0)

    expect(updated.success).toBe(true)
    expect(capIndexes.length).toBe(2)
    expect(capIndexes.map(i => sheet.rows[1][i])).toEqual(['Omar', 'Omar'])
    expect(servicios.data[0].Capacitador).toBe('Omar')
  })

  it('resume inscripciones por curso en calendario sin crear un evento por cada participante', () => {
    const harness = createHarness()
    harness.seed('Servicios', [{
      ID: 'SRV-1', Nombre: 'Curso con inscritos', Tipo: 'Curso', Modalidad: 'Virtual',
      Precio: 10, Duracion: '10 horas', Activo: true, FechaEvento: '2026-09-10',
      FechaFinEvento: '2026-09-10', EstadoEvento: 'programado',
    }])
    harness.seed('Inscripciones', [
      { ID: 'INS-1', ServicioID: 'SRV-1', ServicioNombre: 'Curso con inscritos', ClienteNombre: 'Cliente Uno', FechaInicio: '2026-09-10' },
      { ID: 'INS-2', ServicioID: 'SRV-1', ServicioNombre: 'Curso con inscritos', ClienteNombre: 'Cliente Dos', FechaInicio: '2026-09-10' },
    ])

    const result = harness.context.processRequest({ action: 'getCalendario', token: 'admin-token', year: 2026, month: 9 })

    expect(result.success).toBe(true)
    expect(result.data).toHaveLength(1)
    expect(result.data[0]).toMatchObject({
      id: 'SRV-1',
      tipo: 'Servicio',
      inscritos: 2,
    })
    expect(result.data.some(ev => ev.sub === 'Cliente Uno')).toBe(false)
  })
})
