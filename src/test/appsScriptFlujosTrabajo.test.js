import { describe, expect, it } from 'vitest'
import { createAppsScriptHarness } from './appsScriptHarness'

function createHarness() {
  const harness = createAppsScriptHarness()
  harness.seed('Sesiones', [
    { Token: 'admin-token', Username: 'admin', UserID: 'USR-A', Rol: 'admin', Nombre: 'Admin', Expira: '2099-01-01T00:00:00.000Z' },
    { Token: 'angel-token', Username: 'angel', UserID: 'USR-U', Rol: 'vendedor', Nombre: 'Angel Espinoza', Expira: '2099-01-01T00:00:00.000Z' },
    { Token: 'luis-token', Username: 'luis', UserID: 'USR-L', Rol: 'vendedor', Nombre: 'Luis Coloma', Expira: '2099-01-01T00:00:00.000Z' },
  ])
  harness.seed('Usuarios', [
    { ID: 'USR-A', Nombre: 'Admin', Username: 'admin', Rol: 'admin', Activo: true },
    { ID: 'USR-U', Nombre: 'Angel Espinoza', Username: 'angel', Rol: 'vendedor', Activo: true },
    { ID: 'USR-L', Nombre: 'Luis Coloma', Username: 'luis', Rol: 'vendedor', Activo: true },
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
      EstadoRevision: 'pendiente_revision',
      HorasAprobadas: 0,
    })
  })

  it('normaliza el día al crear actividades para que no queden ocultas fuera del calendario semanal', () => {
    const harness = createHarness()

    const created = harness.context.processRequest({
      action: 'addActividadFlujo',
      token: 'admin-token',
      actividad: {
        flujoId: 'FLJ-1',
        titulo: 'Revisión y optimización de CRM',
        descripcion: 'Validar CRM y automatizaciones.',
        diaSemana: ' martes ',
        horasEstimadas: 4,
        checklist: '[]',
      },
    })
    const row = harness.objects('ActividadesFlujo')[0]

    expect(created.success).toBe(true)
    expect(row.DiaSemana).toBe('Martes')
  })

  it('crea actividades alineadas aunque la hoja tenga encabezados legacy con columnas nuevas al final', () => {
    const harness = createHarness()
    const sheet = harness.ensureSheet('ActividadesFlujo')
    const legacyHeaders = [
      'ID','FlujoID','Username','Titulo','Descripcion','DiaSemana','HorasEstimadas',
      'Estado','HorasReales','Notas','Checklist','Evidencia','FechaCreacion',
    ]
    const expectedHeaders = harness.sourceHeaders('ActividadesFlujo')
    sheet.rows[0] = [
      ...legacyHeaders,
      ...expectedHeaders.filter(header => !legacyHeaders.includes(header)),
    ]

    const checklist = JSON.stringify([{ id: 'chk-1', text: 'Validar disponibilidad del CRM', done: false }])
    const created = harness.context.processRequest({
      action: 'addActividadFlujo',
      token: 'admin-token',
      actividad: {
        flujoId: 'FLJ-1',
        titulo: 'Revisión y optimización de CRM',
        descripcion: 'Validar CRM y automatizaciones.',
        descripcionFormato: 'texto_enriquecido_v1',
        diaSemana: 'Martes',
        horasEstimadas: 4,
        checklist,
        imagenes: '[]',
      },
    })
    const row = harness.objects('ActividadesFlujo')[0]

    expect(created.success).toBe(true)
    expect(row.DiaSemana).toBe('Martes')
    expect(row.HorasEstimadas).toBe(4)
    expect(row.Estado).toBe('pendiente')
    expect(row.DescripcionFormato).toBe('texto_enriquecido_v1')
    expect(row.Checklist).toBe(checklist)
  })

  it('migra filas de ActividadesFlujo corridas por encabezados legacy de forma idempotente', () => {
    const harness = createHarness()
    const sheet = harness.ensureSheet('ActividadesFlujo')
    const legacyHeaders = [
      'ID','FlujoID','Username','Titulo','Descripcion','DiaSemana','HorasEstimadas',
      'Estado','HorasReales','Notas','Checklist','Evidencia','FechaCreacion',
    ]
    const expectedHeaders = harness.sourceHeaders('ActividadesFlujo')
    sheet.rows[0] = [
      ...legacyHeaders,
      ...expectedHeaders.filter(header => !legacyHeaders.includes(header)),
    ]
    const checklist = JSON.stringify([
      { id: 'chk-1', text: 'Revisar conexión con base de datos NEO.', done: false },
      { id: 'chk-2', text: 'Validar disponibilidad del CRM.', done: false },
    ])
    const canonicalRow = {
      ID: 'ACT-SHIFTED-1',
      FlujoID: 'FLJ-1',
      Username: 'angel',
      Titulo: 'Revisión y optimización de CRM, base de datos y automatizaciones',
      Descripcion: 'Durante la jornada se revisó CRM y NEO.',
      DescripcionFormato: 'texto_enriquecido_v1',
      DiaSemana: 'Martes',
      HorasEstimadas: 4,
      Estado: 'pendiente',
      HorasReales: 0,
      Notas: '',
      Checklist: checklist,
      Evidencia: '',
      Imagenes: '[]',
      EstadoRevision: 'pendiente_revision',
      HorasAprobadas: 0,
      FeedbackRevision: '',
      RevisadoPor: '',
      RevisadoEn: '',
      ReprogramadoDesde: '',
      ReprogramadoPara: '',
      CompletadoEn: '',
      FechaCreacion: '2026-08-27T21:42:46.917Z',
    }
    sheet.appendRow(expectedHeaders.map(header => canonicalRow[header] ?? ''))

    expect(harness.objects('ActividadesFlujo')[0].DiaSemana).toBe('texto_enriquecido_v1')
    expect(harness.objects('ActividadesFlujo')[0].HorasEstimadas).toBe('Martes')

    const migrated = harness.context.processRequest({
      action: 'migrarActividadesFlujoV2',
      token: 'admin-token',
      confirmacion: 'APLICAR_ACTIVIDADES_FLUJO_V2',
    })
    const secondRun = harness.context.processRequest({
      action: 'migrarActividadesFlujoV2',
      token: 'admin-token',
      confirmacion: 'APLICAR_ACTIVIDADES_FLUJO_V2',
    })
    const row = harness.objects('ActividadesFlujo')[0]

    expect(migrated.success).toBe(true)
    expect(migrated.migrated).toBe(1)
    expect(secondRun.success).toBe(true)
    expect(secondRun.migrated).toBe(0)
    expect(row.DiaSemana).toBe('Martes')
    expect(row.HorasEstimadas).toBe(4)
    expect(row.Estado).toBe('pendiente')
    expect(row.Checklist).toBe(checklist)
    expect(row.EstadoRevision).toBe('pendiente_revision')
  })

  it('rechaza días inválidos al crear actividades para evitar registros imposibles de mostrar', () => {
    const harness = createHarness()

    const created = harness.context.processRequest({
      action: 'addActividadFlujo',
      token: 'admin-token',
      actividad: {
        flujoId: 'FLJ-1',
        titulo: 'Actividad con día inválido',
        diaSemana: 'Sábado',
        horasEstimadas: 1,
      },
    })

    expect(created.success).toBe(false)
    expect(created.error).toContain('Día de actividad inválido')
    expect(harness.objects('ActividadesFlujo')).toHaveLength(0)
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

  it('permite al administrador aprobar horas y dejar retroalimentación visible', () => {
    const harness = createHarness()
    harness.seed('ActividadesFlujo', [{
      ID: 'ACT-REV-1',
      FlujoID: 'FLJ-1',
      Username: 'angel',
      Titulo: 'Preparar evidencia',
      Descripcion: 'Subir capturas',
      DiaSemana: 'Jueves',
      HorasEstimadas: 4,
      Estado: 'completado',
      HorasReales: 4,
      EstadoRevision: 'pendiente_revision',
      HorasAprobadas: 0,
    }])

    const updated = harness.context.processRequest({
      action: 'updateActividadFlujo',
      token: 'admin-token',
      id: 'ACT-REV-1',
      actividad: {
        estadoRevision: 'aprobado',
        horasAprobadas: 4,
        feedbackRevision: 'Actividad cumplida correctamente. Horas aprobadas.',
      },
    })
    const row = harness.objects('ActividadesFlujo')[0]

    expect(updated.success).toBe(true)
    expect(row.EstadoRevision).toBe('aprobado')
    expect(row.HorasAprobadas).toBe(4)
    expect(row.FeedbackRevision).toBe('Actividad cumplida correctamente. Horas aprobadas.')
    expect(row.RevisadoPor).toBe('admin')
    expect(row.RevisadoEn).toBeTruthy()
  })

  it('bloquea al vendedor para aprobar horas administrativas', () => {
    const harness = createHarness()
    harness.seed('ActividadesFlujo', [{
      ID: 'ACT-REV-2',
      FlujoID: 'FLJ-1',
      Username: 'angel',
      Titulo: 'Intento de aprobación',
      DiaSemana: 'Jueves',
      HorasEstimadas: 3,
      Estado: 'completado',
      HorasReales: 3,
      EstadoRevision: 'pendiente_revision',
      HorasAprobadas: 0,
    }])

    const updated = harness.context.processRequest({
      action: 'updateActividadFlujo',
      token: 'angel-token',
      id: 'ACT-REV-2',
      actividad: {
        estadoRevision: 'aprobado',
        horasAprobadas: 3,
        feedbackRevision: 'Me apruebo solo',
      },
    })
    const row = harness.objects('ActividadesFlujo')[0]

    expect(updated.success).toBe(true)
    expect(row.EstadoRevision).toBe('pendiente_revision')
    expect(row.HorasAprobadas).toBe(0)
    expect(row.FeedbackRevision).toBe('')
  })

  it('permite al encargado marcar checks pero no cambiar los puntos definidos por administración', () => {
    const harness = createHarness()
    harness.seed('ActividadesFlujo', [{
      ID: 'ACT-CHK-1',
      FlujoID: 'FLJ-1',
      Username: 'angel',
      Titulo: 'Checklist controlado',
      DiaSemana: 'Jueves',
      HorasEstimadas: 3,
      Estado: 'en_proceso',
      HorasReales: 0,
      Checklist: JSON.stringify([{ id: 'chk-1', text: 'Adjuntar evidencia', done: false }]),
    }])

    const marked = harness.context.processRequest({
      action: 'updateActividadFlujo',
      token: 'angel-token',
      id: 'ACT-CHK-1',
      actividad: {
        checklist: JSON.stringify([{ id: 'chk-1', text: 'Adjuntar evidencia', done: true }]),
      },
    })
    expect(marked.success).toBe(true)
    expect(JSON.parse(harness.objects('ActividadesFlujo')[0].Checklist)[0].done).toBe(true)

    const tampered = harness.context.processRequest({
      action: 'updateActividadFlujo',
      token: 'angel-token',
      id: 'ACT-CHK-1',
      actividad: {
        checklist: JSON.stringify([
          { id: 'chk-1', text: 'Adjuntar evidencia', done: true },
          { id: 'chk-2', text: 'Me agrego otro punto', done: true },
        ]),
      },
    })
    expect(tampered.success).toBe(false)
    expect(tampered.error).toContain('Solo administración')
  })

  it('bloquea que un vendedor actualice actividades asignadas a otro usuario', () => {
    const harness = createHarness()
    harness.seed('ActividadesFlujo', [{
      ID: 'ACT-OWNER-1',
      FlujoID: 'FLJ-1',
      Username: 'angel',
      Titulo: 'Actividad de Angel',
      DiaSemana: 'Jueves',
      HorasEstimadas: 2,
      Estado: 'en_proceso',
      HorasReales: 0,
      Checklist: '[]',
    }])

    const updated = harness.context.processRequest({
      action: 'updateActividadFlujo',
      token: 'luis-token',
      id: 'ACT-OWNER-1',
      actividad: { evidencia: 'Intento tocar tarea ajena' },
    })
    const row = harness.objects('ActividadesFlujo')[0]

    expect(updated.success).toBe(false)
    expect(updated.error).toContain('tus propias actividades')
    expect(row.Evidencia).toBe('')
  })

  it('exige observación para no aprobar y permite reprogramar la actividad', () => {
    const harness = createHarness()
    harness.seed('ActividadesFlujo', [{
      ID: 'ACT-REV-3',
      FlujoID: 'FLJ-1',
      Username: 'angel',
      Titulo: 'Enviar informe',
      DiaSemana: 'Jueves',
      HorasEstimadas: 2,
      Estado: 'completado',
      HorasReales: 2,
      EstadoRevision: 'pendiente_revision',
      HorasAprobadas: 0,
    }])

    const withoutFeedback = harness.context.processRequest({
      action: 'updateActividadFlujo',
      token: 'admin-token',
      id: 'ACT-REV-3',
      actividad: { estadoRevision: 'rechazado' },
    })
    expect(withoutFeedback.success).toBe(false)
    expect(withoutFeedback.error).toContain('observación')

    const rejected = harness.context.processRequest({
      action: 'updateActividadFlujo',
      token: 'admin-token',
      id: 'ACT-REV-3',
      actividad: {
        estadoRevision: 'rechazado',
        feedbackRevision: 'No se cumplió como fue indicado; falta evidencia.',
        reprogramadoPara: 'Viernes',
      },
    })
    const row = harness.objects('ActividadesFlujo')[0]

    expect(rejected.success).toBe(true)
    expect(row.EstadoRevision).toBe('rechazado')
    expect(row.HorasAprobadas).toBe(0)
    expect(row.FeedbackRevision).toBe('No se cumplió como fue indicado; falta evidencia.')
    expect(row.ReprogramadoDesde).toBe('Jueves')
    expect(row.ReprogramadoPara).toBe('Viernes')
    expect(row.DiaSemana).toBe('Viernes')
  })

  it('normaliza el día al editar o reprogramar actividades', () => {
    const harness = createHarness()
    harness.seed('ActividadesFlujo', [{
      ID: 'ACT-DAY-1',
      FlujoID: 'FLJ-1',
      Username: 'angel',
      Titulo: 'Mover actividad',
      DiaSemana: 'Lunes',
      HorasEstimadas: 2,
      Estado: 'pendiente',
      HorasReales: 0,
      EstadoRevision: 'pendiente_revision',
      HorasAprobadas: 0,
    }])

    const edited = harness.context.processRequest({
      action: 'updateActividadFlujo',
      token: 'admin-token',
      id: 'ACT-DAY-1',
      actividad: { diaSemana: ' miercoles ' },
    })
    expect(edited.success).toBe(true)
    expect(harness.objects('ActividadesFlujo')[0].DiaSemana).toBe('Miércoles')

    const reprogrammed = harness.context.processRequest({
      action: 'updateActividadFlujo',
      token: 'admin-token',
      id: 'ACT-DAY-1',
      actividad: {
        estadoRevision: 'rechazado',
        feedbackRevision: 'Reprogramar para revisión posterior.',
        reprogramadoPara: ' viernes ',
      },
    })

    const row = harness.objects('ActividadesFlujo')[0]
    expect(reprogrammed.success).toBe(true)
    expect(row.DiaSemana).toBe('Viernes')
    expect(row.ReprogramadoDesde).toBe('Miércoles')
    expect(row.ReprogramadoPara).toBe('Viernes')
  })
})
