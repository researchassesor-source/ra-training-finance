import { describe, expect, it } from 'vitest'
import { createAppsScriptHarness } from './appsScriptHarness'

function createHarness() {
  const harness = createAppsScriptHarness()
  harness.seed('Sesiones', [
    { Token: 'admin-token', Username: 'admin', UserID: 'USR-A', Rol: 'admin', Nombre: 'Admin', Expira: '2099-01-01T00:00:00.000Z' },
    { Token: 'angel-token', Username: 'angel', UserID: 'USR-U', Rol: 'vendedor', Nombre: 'Angel Espinoza', Expira: '2099-01-01T00:00:00.000Z' },
  ])
  harness.seed('Usuarios', [
    { ID: 'USR-A', Nombre: 'Admin', Username: 'admin', Rol: 'admin', Activo: true },
    { ID: 'USR-U', Nombre: 'Angel Espinoza', Username: 'angel', Rol: 'vendedor', Activo: true },
    { ID: 'USR-I', Nombre: 'Inactivo', Username: 'inactivo', Rol: 'vendedor', Activo: false },
  ])
  harness.seed('FlujosSemanales', [{
    ID: 'FLJ-1', Username: 'angel', NombreUsuario: 'Angel Espinoza', Semana: '2026-08-24',
    FechaInicio: '2026-08-24', FechaFin: '2026-08-28', TotalHorasPlan: 40, Estado: 'activo',
  }])
  harness.seed('ActividadesFlujo', [
    { ID: 'ACT-1', FlujoID: 'FLJ-1', Username: 'angel', Titulo: 'Revisar Finance', DiaSemana: 'Lunes', HorasEstimadas: 4, Estado: 'completado', HorasReales: 3 },
    { ID: 'ACT-2', FlujoID: 'FLJ-1', Username: 'angel', Titulo: 'QA reportes', DiaSemana: 'Martes', HorasEstimadas: 2, Estado: 'pendiente', HorasReales: 0 },
  ])
  harness.seed('Asistencia', [
    { ID: 'TIM-1', Username: 'angel', Nombre: 'Angel Espinoza', Tipo: 'entrada', Timestamp: '2026-08-24T13:00:00.000Z', Fecha: '2026-08-24' },
    { ID: 'TIM-2', Username: 'angel', Nombre: 'Angel Espinoza', Tipo: 'salida', Timestamp: '2026-08-24T17:30:00.000Z', Fecha: '2026-08-24' },
    { ID: 'TIM-3', Username: 'inactivo', Nombre: 'Inactivo', Tipo: 'entrada', Timestamp: '2026-08-24T13:00:00.000Z', Fecha: '2026-08-24' },
  ])
  return harness
}

describe('reportes internos agregados en Apps Script', () => {
  it('genera reporte de flujo en una sola acción backend con actividades', () => {
    const harness = createHarness()
    const result = harness.context.processRequest({
      action: 'getReporteFlujosTrabajo',
      token: 'admin-token',
      username: 'angel',
      desde: '2026-08-01',
      hasta: '2026-08-31',
    })

    expect(result.success).toBe(true)
    expect(result.data).toHaveLength(1)
    expect(result.data[0].NombreUsuario).toBe('Angel Espinoza')
    expect(result.data[0].actividades).toHaveLength(2)
  })

  it('genera reporte de asistencia con resumen de horas y excluye usuarios inactivos en reporte general', () => {
    const harness = createHarness()
    const result = harness.context.processRequest({
      action: 'getReporteAsistencia',
      token: 'admin-token',
      desde: '2026-08-01',
      hasta: '2026-08-31',
    })

    expect(result.success).toBe(true)
    expect(result.data.registros.map(r => r.Username)).toEqual(['angel', 'angel'])
    expect(result.data.resumenes).toHaveLength(1)
    expect(result.data.resumenes[0].totalHoras).toBe(4.5)
  })

  it('un vendedor solo puede generar sus propios reportes aunque pida otro username', () => {
    const harness = createHarness()
    const result = harness.context.processRequest({
      action: 'getReporteFlujosTrabajo',
      token: 'angel-token',
      username: 'admin',
      desde: '2026-08-01',
      hasta: '2026-08-31',
    })

    expect(result.success).toBe(true)
    expect(result.data).toHaveLength(1)
    expect(result.data[0].Username).toBe('angel')
  })
})
