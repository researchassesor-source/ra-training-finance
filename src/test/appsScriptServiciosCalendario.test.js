import { describe, expect, it } from 'vitest'
import { createAppsScriptHarness } from './appsScriptHarness'

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
})
