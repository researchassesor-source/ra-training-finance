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
  ])
  harness.seed('FlujosSemanales', [{
    ID: 'FLJ-1',
    Username: 'angel',
    NombreUsuario: 'Angel Espinoza',
    Semana: '2026-08-24',
    FechaInicio: '2026-08-24',
    FechaFin: '2026-08-28',
    TotalHorasPlan: 40,
    Estado: 'activo',
  }])
  harness.seed('ActividadesFlujo', [])
  return harness
}

describe('flujos de trabajo enriquecidos', () => {
  it('crea actividades con editor enriquecido, checklist e imágenes sin romper columnas legacy', () => {
    const harness = createHarness()
    const checklist = JSON.stringify([
      { id: 'chk-1', text: 'Revisar requerimiento del jefe', done: false },
      { id: 'chk-2', text: 'Adjuntar evidencia visual', done: false },
    ])
    const imagenes = JSON.stringify([
      { id: 'img-1', name: 'captura.jpg', type: 'image/jpeg', dataUrl: 'data:image/jpeg;base64,abc', createdAt: '2026-08-27T10:00:00.000Z' },
    ])

    const created = harness.context.processRequest({
      action: 'addActividadFlujo',
      token: 'admin-token',
      actividad: {
        flujoId: 'FLJ-1',
        titulo: 'Documentar flujo',
        descripcion: 'Objetivo\n• Crear checklist\n[ ] Validar evidencia',
        descripcionFormato: 'texto_enriquecido_v1',
        diaSemana: 'Lunes',
        horasEstimadas: 2,
        checklist,
        imagenes,
      },
    })
    const row = harness.objects('ActividadesFlujo')[0]

    expect(created.success).toBe(true)
    expect(row).toMatchObject({
      Titulo: 'Documentar flujo',
      DescripcionFormato: 'texto_enriquecido_v1',
      Checklist: checklist,
      Imagenes: imagenes,
      Evidencia: '',
      Estado: 'pendiente',
    })
  })

  it('permite al encargado marcar checklist, guardar notas e imágenes sin permisos admin', () => {
    const harness = createHarness()
    harness.seed('ActividadesFlujo', [{
      ID: 'ACT-1',
      FlujoID: 'FLJ-1',
      Username: 'angel',
      Titulo: 'QA Finance',
      Descripcion: 'Validar módulo',
      DescripcionFormato: 'texto_enriquecido_v1',
      DiaSemana: 'Martes',
      HorasEstimadas: 3,
      Estado: 'en_proceso',
      HorasReales: 0,
      Checklist: JSON.stringify([{ id: 'chk-1', text: 'Probar guardado', done: false }]),
      Evidencia: '',
      Imagenes: '[]',
    }])

    const checklist = JSON.stringify([{ id: 'chk-1', text: 'Probar guardado', done: true }])
    const imagenes = JSON.stringify([{ id: 'img-1', name: 'qa.jpg', dataUrl: 'data:image/jpeg;base64,ok' }])
    const updated = harness.context.processRequest({
      action: 'updateActividadFlujo',
      token: 'angel-token',
      id: 'ACT-1',
      actividad: {
        checklist,
        imagenes,
        evidencia: 'Captura cargada en la actividad',
        horasReales: 2,
      },
    })
    const row = harness.objects('ActividadesFlujo')[0]

    expect(updated.success).toBe(true)
    expect(row.Checklist).toBe(checklist)
    expect(row.Imagenes).toBe(imagenes)
    expect(row.Evidencia).toBe('Captura cargada en la actividad')
    expect(row.HorasReales).toBe(2)
  })

  it('mantiene compatibilidad con actividades antiguas sin campos enriquecidos', () => {
    const harness = createHarness()
    harness.seed('ActividadesFlujo', [{
      ID: 'ACT-LEGACY',
      FlujoID: 'FLJ-1',
      Username: 'angel',
      Titulo: 'Actividad legacy',
      Descripcion: 'Texto simple anterior',
      DiaSemana: 'Miércoles',
      HorasEstimadas: 1,
      Estado: 'pendiente',
      HorasReales: 0,
    }])

    const result = harness.context.processRequest({
      action: 'getFlujosSemana',
      token: 'admin-token',
      username: 'angel',
      semana: '2026-08-24',
    })

    expect(result.success).toBe(true)
    expect(result.data[0].actividades[0]).toMatchObject({
      ID: 'ACT-LEGACY',
      Titulo: 'Actividad legacy',
      Descripcion: 'Texto simple anterior',
    })
  })
})
