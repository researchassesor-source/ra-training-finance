import { describe, expect, it } from 'vitest'
import { createAppsScriptHarness } from './appsScriptHarness'

const FUTURE = '2099-01-01T00:00:00.000Z'

function createHarness() {
  const harness = createAppsScriptHarness()
  harness.seed('Sesiones', [
    { Token: 'admin-token', Username: 'admin', UserID: 'USR-A', Rol: 'admin', Nombre: 'Admin', Expira: FUTURE },
    { Token: 'moodle-token', Username: 'moodle', UserID: 'USR-M', Rol: 'moodle', Nombre: 'Encargado Moodle', Expira: FUTURE },
    { Token: 'seller-token', Username: 'seller', UserID: 'USR-S', Rol: 'vendedor', Nombre: 'Vendedor', Expira: FUTURE },
  ])
  harness.seed('Usuarios', [
    { ID: 'USR-A', Nombre: 'Admin', Username: 'admin', Rol: 'admin', Activo: true },
    { ID: 'USR-M', Nombre: 'Encargado Moodle', Username: 'moodle', Rol: 'moodle', Activo: true },
    { ID: 'USR-S', Nombre: 'Vendedor', Username: 'seller', Rol: 'vendedor', Activo: true },
  ])
  harness.seed('Servicios', [
    { ID: 'SRV-1', Nombre: 'Curso Demo', Modalidad: 'Virtual', Duracion: '40', Activo: true },
  ])
  harness.seed('Inscripciones', [
    {
      ID: 'INS-1', ClienteNombre: 'Andrea Salazar', ClienteID: '0102030405',
      ClienteEmail: 'andrea@example.test', ServicioID: 'SRV-1', ServicioNombre: 'Curso Demo',
      Modalidad: 'Virtual', FechaInicio: '2026-09-01', FechaFin: '2026-09-02', Monto: 20,
      MetodoPago: 'Transferencia', EstadoPago: 'pendiente', EstadoCertificado: 'pendiente',
      CreadoPor: 'seller', FechaCreacion: '2026-08-01T10:00:00.000Z',
      CRMEnrollmentID: 'CRM-ENR-1', CRMContactID: 'CRM-CON-1', CRMCourseID: 'CRM-COURSE-1',
      Origen: 'CRM', MoodleStatus: 'pendiente',
    },
    {
      ID: 'INS-2', ClienteNombre: 'Luis Torres', ClienteID: '1717171717',
      ClienteEmail: 'luis@example.test', ServicioID: 'SRV-1', ServicioNombre: 'Curso Demo',
      Modalidad: 'Virtual', FechaInicio: '2026-09-03', FechaFin: '2026-09-04', Monto: 15,
      MetodoPago: 'Transferencia', EstadoPago: 'pendiente', EstadoCertificado: 'pendiente',
      CreadoPor: 'otro-vendedor', FechaCreacion: '2026-08-02T10:00:00.000Z',
      CRMEnrollmentID: '', CRMContactID: '', CRMCourseID: '', Origen: '', MoodleStatus: 'pendiente',
    },
  ])
  harness.seed('Ingresos', [])
  harness.seed('FacturasFiscales', [])
  return harness
}

describe('rol Moodle y gestión de accesos de aula', () => {
  it('ve todas las inscripciones, pero el vendedor no recibe credenciales Moodle', () => {
    const harness = createHarness()

    const moodle = harness.context.processRequest({ action: 'getInscripciones', token: 'moodle-token' })
    expect(moodle.success).toBe(true)
    expect(moodle.data.map(item => item.ID)).toEqual(['INS-2', 'INS-1'])

    const seller = harness.context.processRequest({ action: 'getInscripciones', token: 'seller-token' })
    expect(seller.success).toBe(true)
    expect(seller.data).toHaveLength(1)
    expect(seller.data[0]).not.toHaveProperty('MoodlePassword')
    expect(seller.data[0]).not.toHaveProperty('MoodleUsername')
  })

  it('guarda usuario, contraseña y aula sin alterar identidad, CRM ni estado de pago', () => {
    const harness = createHarness()
    const result = harness.context.processRequest({
      action: 'updateMoodleCredentials',
      token: 'moodle-token',
      id: 'INS-1',
      moodle: { username: 'andrea.moodle', password: 'Temporal-2026!', url: 'https://aula.example.test', notes: 'Acceso inicial' },
    })

    expect(result).toMatchObject({ success: true, status: 'cargado' })
    expect(result.data).toMatchObject({
      ID: 'INS-1', MoodleUsername: 'andrea.moodle', MoodlePassword: 'Temporal-2026!',
      MoodleUrl: 'https://aula.example.test', MoodleStatus: 'cargado', MoodleNotes: 'Acceso inicial',
      CRMEnrollmentID: 'CRM-ENR-1', CRMContactID: 'CRM-CON-1', CRMCourseID: 'CRM-COURSE-1', Origen: 'CRM',
      EstadoPago: 'pendiente', ClienteID: '0102030405',
    })
    expect(harness.objects('AuditoriaMoodle')).toHaveLength(1)
    expect(harness.objects('AuditoriaMoodle')[0].Metadatos).not.toContain('Temporal-2026!')

    // La edición general que todavía puede hacer el vendedor no debe filtrar
    // la contraseña en su respuesta aunque la inscripción ya tenga acceso.
    const sellerUpdate = harness.context.processRequest({
      action: 'updateInscripcion', token: 'seller-token', id: 'INS-1',
      inscripcion: { metodoPago: 'Efectivo' },
    })
    expect(sellerUpdate.success).toBe(true)
    expect(sellerUpdate.data).not.toHaveProperty('MoodlePassword')
  })

  it('permite al administrador preparar el envío una sola inscripción y registra auditoría sin reenviar nada', () => {
    const harness = createHarness()
    harness.context.processRequest({
      action: 'updateMoodleCredentials', token: 'moodle-token', id: 'INS-1',
      moodle: { username: 'andrea.moodle', password: 'Temporal-2026!', url: 'https://aula.example.test' },
    })

    const forbidden = harness.context.processRequest({ action: 'registrarEnvioMoodle', token: 'moodle-token', id: 'INS-1' })
    expect(forbidden.success).toBe(false)
    expect(forbidden.error).toMatch(/administrador/i)

    const sent = harness.context.processRequest({ action: 'registrarEnvioMoodle', token: 'admin-token', id: 'INS-1' })
    expect(sent).toMatchObject({ success: true, status: 'preparado', data: { ID: 'INS-1', MoodleStatus: 'preparado' } })
    expect(harness.objects('Inscripciones')[0]).toMatchObject({
      CRMEnrollmentID: 'CRM-ENR-1', CRMContactID: 'CRM-CON-1', CRMCourseID: 'CRM-COURSE-1', Origen: 'CRM',
      EstadoPago: 'pendiente', MoodleStatus: 'preparado',
    })
    expect(harness.objects('AuditoriaMoodle').map(item => item.Accion)).toEqual([
      'MOODLE_CREDENTIALS_UPDATED', 'MOODLE_WHATSAPP_PREPARED',
    ])
  })

  it('valida URL y evita guardar credenciales incompletas', () => {
    const harness = createHarness()
    const invalidUrl = harness.context.processRequest({
      action: 'updateMoodleCredentials', token: 'moodle-token', id: 'INS-1',
      moodle: { username: 'andrea.moodle', password: 'Temporal-2026!', url: 'aula.example.test' },
    })
    const missingPassword = harness.context.processRequest({
      action: 'updateMoodleCredentials', token: 'moodle-token', id: 'INS-1',
      moodle: { username: 'andrea.moodle', password: '', url: 'https://aula.example.test' },
    })
    expect(invalidUrl.success).toBe(false)
    expect(invalidUrl.error).toMatch(/http/i)
    expect(missingPassword.success).toBe(false)
    expect(missingPassword.error).toMatch(/contraseña/i)
    expect(harness.objects('AuditoriaMoodle')).toHaveLength(0)
  })
})
