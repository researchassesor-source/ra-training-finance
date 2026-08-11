import { describe, expect, it } from 'vitest'
import { createAppsScriptHarness } from './appsScriptHarness'

function createHarness(services = [{
  ID: 'SRV-CRM-1',
  Nombre: 'Curso de Liderazgo Ágil',
  Tipo: 'Curso',
  Modalidad: 'Virtual',
  Precio: 50,
  Duracion: '20 horas',
  Activo: true,
}]) {
  const harness = createAppsScriptHarness()
  harness.seed('Sesiones', [{
    Token: 'integration-token', Username: 'crm.integration', UserID: 'USR-CRM',
    Rol: 'admin', Nombre: 'Integración CRM', Expira: '2099-01-01T00:00:00.000Z',
  }])
  harness.seed('Usuarios', [{
    ID: 'USR-CRM', Nombre: 'Integración CRM', Username: 'crm.integration',
    Rol: 'admin', Activo: true,
  }])
  harness.seed('Servicios', services)
  harness.seed('Inscripciones', [])
  harness.seed('Ingresos', [])
  harness.seed('Pagos', [])
  harness.seed('Certificados', [])
  harness.seed('AuditoriaCertificados', [])
  return harness
}

function crmRequest(overrides = {}) {
  const inscripcion = {
    crmEnrollmentId: 'ENR-CRM-001',
    crmContactId: 'CONTACT-001',
    crmCourseId: 'COURSE-001',
    courseTitle: '  Curso de Liderazgo Agil ',
    modality: 'Híbrida',
    startDate: '2026-09-01',
    endDate: '2026-09-03',
    participant: {
      firstName: 'Ana', lastName: 'Pérez', fullName: 'Ana Pérez',
      email: 'ana@example.test', phone: '0990000000', identification: null,
    },
    amount: 75.5,
    source: 'crm',
    servicioNombre: 'Nombre legacy ignorado',
    modalidad: 'Virtual',
    monto: 999,
    clienteNombre: 'Nombre legacy ignorado',
    clienteEmail: 'legacy@example.test',
    clienteTelefono: '0000000000',
    notas: 'Registro confirmado comercialmente en CRM.',
    ...overrides,
  }
  return {
    action: 'addInscripcion',
    token: 'integration-token',
    idempotencyKey: inscripcion.crmEnrollmentId,
    inscripcion,
  }
}

describe('handoff idempotente CRM a Finance', () => {
  it('crea una inscripción CRM y devuelve exactamente el ID real de Finance', () => {
    const harness = createHarness()

    const result = harness.context.processRequest(crmRequest())
    const enrollment = harness.objects('Inscripciones')[0]
    const income = harness.objects('Ingresos')[0]

    expect(result).toEqual({ success: true, id: enrollment.ID })
    expect(enrollment).toMatchObject({
      CRMEnrollmentID: 'ENR-CRM-001', CRMContactID: 'CONTACT-001', CRMCourseID: 'COURSE-001', Origen: 'CRM',
      ClienteNombre: 'Ana Pérez', ClienteID: '', ClienteEmail: 'ana@example.test', ClienteTelefono: '0990000000',
      ServicioID: 'SRV-CRM-1', ServicioNombre: 'Curso de Liderazgo Ágil', Modalidad: 'Híbrida',
      FechaInicio: '2026-09-01', FechaFin: '2026-09-03', Monto: 75.5,
      MetodoPago: '', EstadoPago: 'pendiente', EstadoCertificado: 'pendiente',
      NumeroComprobante: '', FechaPago: '', CodigoCertificado: '',
    })
    expect(income).toMatchObject({
      ID: enrollment.IngresoID, Estado: 'pendiente_verificacion', MetodoPago: '', Referencia: '', Monto: 75.5,
    })
    expect(harness.objects('Certificados')).toHaveLength(0)
    expect(harness.objects('Pagos')).toHaveLength(0)
    expect(harness.objects('AuditoriaCertificados')).toEqual([
      expect.objectContaining({ Accion: 'INSCRIPTION_CREATED', Canal: 'crm', InscripcionID: enrollment.ID }),
    ])
    expect(harness.sheets.Inscripciones.rows[0].slice(-4)).toEqual([
      'CRMEnrollmentID', 'CRMContactID', 'CRMCourseID', 'Origen',
    ])
  })

  it('devuelve el mismo ID en reintentos y no duplica inscripción, ingreso ni auditoría', () => {
    const harness = createHarness()
    const request = crmRequest()

    const first = harness.context.processRequest(request)
    harness.sheets.Servicios.rows.splice(1)
    harness.sheets.Servicios.formulas.splice(1)
    const retry = harness.context.processRequest(request)

    expect(retry).toEqual(first)
    expect(harness.objects('Inscripciones')).toHaveLength(1)
    expect(harness.objects('Ingresos')).toHaveLength(1)
    expect(harness.objects('AuditoriaCertificados')).toHaveLength(1)
    expect(harness.locks).toEqual({ waits: 2, releases: 2 })
  })

  it('rechaza una clave distinta o vacía sin escribir datos', () => {
    const harness = createHarness()
    const mismatch = crmRequest()
    mismatch.idempotencyKey = 'ENR-OTRO'
    const empty = crmRequest({ crmEnrollmentId: '' })
    empty.idempotencyKey = ''

    expect(harness.context.processRequest(mismatch)).toMatchObject({ success: false })
    expect(harness.context.processRequest(empty)).toMatchObject({ success: false })
    expect(harness.objects('Inscripciones')).toHaveLength(0)
    expect(harness.objects('Ingresos')).toHaveLength(0)
  })

  it('rechaza un servicio desconocido o ambiguo y nunca crea servicios', () => {
    const duplicateServices = [
      { ID: 'SRV-A', Nombre: 'Curso Duplicado', Modalidad: 'Virtual', Activo: true },
      { ID: 'SRV-B', Nombre: 'curso-duplicado', Modalidad: 'Virtual', Activo: true },
    ]
    const harness = createHarness(duplicateServices)
    const before = harness.objects('Servicios')

    const unknown = harness.context.processRequest(crmRequest({ courseTitle: 'Curso inexistente' }))
    const ambiguous = harness.context.processRequest(crmRequest({ courseTitle: 'Curso Duplicado' }))

    expect(unknown).toEqual({ success: false, error: 'Servicio de Finance no configurado para este curso.' })
    expect(ambiguous).toEqual({ success: false, error: 'Servicio de Finance no configurado para este curso.' })
    expect(harness.objects('Servicios')).toEqual(before)
    expect(harness.objects('Inscripciones')).toHaveLength(0)
  })

  it('conserva intacto el alta manual, incluso su semántica administrativa de pago', () => {
    const harness = createHarness()
    const result = harness.context.processRequest({
      action: 'addInscripcion', token: 'integration-token',
      inscripcion: {
        clienteNombre: 'Registro Manual', clienteID: '0102030405', clienteEmail: 'manual@example.test',
        clienteTelefono: '0980000000', servicioId: 'SRV-CRM-1', servicioNombre: 'Curso de Liderazgo Ágil',
        modalidad: 'Virtual', fechaInicio: '2026-09-05', fechaFin: '2026-09-06', monto: 50,
        metodoPago: 'Efectivo', estadoPago: 'verificado', requiereAvalExterno: false,
      },
    })

    expect(result).toMatchObject({ success: true, id: expect.any(String), ingresoId: expect.any(String) })
    expect(harness.objects('Inscripciones')[0]).toMatchObject({
      EstadoPago: 'verificado', Origen: '', CRMEnrollmentID: '', MetodoPago: 'Efectivo',
    })
    expect(harness.objects('Ingresos')[0].Estado).toBe('confirmado')
  })
})
