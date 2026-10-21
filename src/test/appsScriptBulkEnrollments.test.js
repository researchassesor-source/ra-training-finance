import { describe, expect, it } from 'vitest'
import { createAppsScriptHarness } from './appsScriptHarness'

const FUTURE = '2099-01-01T00:00:00.000Z'
const BATCH_ID = 'cfe22ddc-b05f-4bb1-94d9-7c9c7c3f5a1b'

function seededHarness() {
  const harness = createAppsScriptHarness()
  harness.seed('Sesiones', [
    { Token: 'admin-token', Username: 'admin.test', UserID: 'USR-A', Rol: 'admin', Nombre: 'Admin Test', Expira: FUTURE },
    { Token: 'seller-token', Username: 'seller.test', UserID: 'USR-S', Rol: 'vendedor', Nombre: 'Seller Test', Expira: FUTURE },
  ])
  harness.seed('Usuarios', [
    { ID: 'USR-A', Nombre: 'Admin Test', Username: 'admin.test', Rol: 'admin', Activo: true },
    { ID: 'USR-S', Nombre: 'Seller Test', Username: 'seller.test', Rol: 'vendedor', Activo: true },
  ])
  harness.seed('Servicios', [{ ID: 'SRV-1', Nombre: 'Curso de prueba', Modalidad: 'Virtual', Duracion: '40 horas', Precio: 25, Activo: true }])
  harness.seed('Inscripciones', [])
  harness.seed('Ingresos', [])
  harness.seed('AuditoriaCertificados', [])
  return harness
}

function request(harness, participants, batchId = BATCH_ID, token = 'admin-token') {
  return harness.context.processRequest({
    action: 'importarInscripcionesMasivo',
    token,
    batchId,
    servicioId: 'SRV-1',
    participantes: participants,
  })
}

const participants = [
  { rowNumber: 2, clienteTipoIdentificacion: 'CEDULA_EC', clienteID: '0601234560', clienteNombre: 'Ana Pérez', clienteEmail: 'ana@example.com', clienteTelefono: '0999999999' },
  { rowNumber: 3, clienteTipoIdentificacion: 'PASAPORTE', clienteID: 'PA123456', clienteNombre: 'Luis Mora', clienteEmail: 'luis@example.com', clienteTelefono: '+593 99 123 4567' },
]

describe('importarInscripcionesMasivo (Apps Script)', () => {
  it('crea inscripciones e ingresos pendientes, nunca verificados ni certificados emitidos', () => {
    const harness = seededHarness()
    const result = request(harness, participants)

    expect(result).toMatchObject({ success: true, data: { creadas: 2, duplicadas: 0, errores: 0 } })
    expect(harness.objects('Inscripciones')).toHaveLength(2)
    expect(harness.objects('Ingresos')).toHaveLength(2)
    expect(harness.objects('Inscripciones').map(row => row.EstadoPago)).toEqual(['pendiente', 'pendiente'])
    expect(harness.objects('Inscripciones').map(row => row.EstadoCertificado)).toEqual(['pendiente', 'pendiente'])
    expect(harness.objects('Inscripciones').map(row => row.Monto)).toEqual([25, 25])
    expect(harness.objects('Inscripciones').every(row => row.IngresoID)).toBe(true)
    expect(harness.objects('Ingresos').every(row => row.Estado === 'pendiente_verificacion' && row.MetodoPago === '')).toBe(true)
    expect(harness.objects('Inscripciones').map(row => row.ImportBatchID)).toEqual([BATCH_ID, BATCH_ID])
  })

  it('reintentar el mismo lote no duplica las filas; detectar el mismo participante en otro lote', () => {
    const harness = seededHarness()
    const first = request(harness, participants)
    const retry = request(harness, participants)
    const otherBatch = request(harness, participants, 'b6efcdf4-2fea-43b7-a43e-869902cc056b')

    expect(first.data.creadas).toBe(2)
    expect(retry.data.yaImportadas).toBe(2)
    expect(otherBatch.data.duplicadas).toBe(2)
    expect(harness.objects('Inscripciones')).toHaveLength(2)
    expect(harness.objects('Ingresos')).toHaveLength(2)
  })

  it('rechaza el lote completo si una fila no pasa validación', () => {
    const harness = seededHarness()
    const invalid = [{ ...participants[0] }, { ...participants[1], clienteEmail: 'no-correo' }]
    const result = request(harness, invalid)

    expect(result.success).toBe(false)
    expect(result.error).toContain('Fila 3')
    expect(harness.objects('Inscripciones')).toHaveLength(0)
    expect(harness.objects('Ingresos')).toHaveLength(0)
  })

  it('solo permite carga masiva a administración', () => {
    const harness = seededHarness()
    const result = request(harness, participants, BATCH_ID, 'seller-token')
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/administrador/i)
    expect(harness.objects('Inscripciones')).toHaveLength(0)
  })

  it('considera opcionales los metadatos de lote en una hoja histórica', () => {
    const harness = seededHarness()
    const schema = harness.context.resolverEncabezadosInscripciones(['ID'])
    expect(schema.ambiguos.map(field => field.campo)).not.toEqual(expect.arrayContaining(['ImportBatchID', 'ImportBatchRow', 'ImportRowHash']))
  })

  it('repara un ingreso interrumpido al reintentar sin duplicar la inscripción', () => {
    const harness = seededHarness()
    const incomeSheet = harness.ensureSheet('Ingresos')
    const appendRow = incomeSheet.appendRow.bind(incomeSheet)
    let failOnce = true
    incomeSheet.appendRow = row => {
      if (failOnce) { failOnce = false; throw new Error('write interrupted') }
      appendRow(row)
    }

    const first = request(harness, [participants[0]])
    expect(first.data.errores).toBe(1)
    expect(harness.objects('Inscripciones')).toHaveLength(1)
    expect(harness.objects('Ingresos')).toHaveLength(0)

    const retry = request(harness, [participants[0]])
    expect(retry).toMatchObject({ success: true, data: { yaImportadas: 1, errores: 0 } })
    expect(harness.objects('Inscripciones')).toHaveLength(1)
    expect(harness.objects('Ingresos')).toHaveLength(1)
  })

  it('reconecta el mismo ingreso si se interrumpe después de crearlo y antes de enlazarlo', () => {
    const harness = seededHarness()
    const updateRow = harness.context.updateRow
    let failOnce = true
    harness.context.updateRow = (sheet, row, fields) => {
      if (failOnce && fields?.IngresoID) {
        failOnce = false
        throw new Error('link interrupted')
      }
      return updateRow(sheet, row, fields)
    }

    const first = request(harness, [participants[0]])
    expect(first.data.errores).toBe(1)
    expect(harness.objects('Inscripciones')).toHaveLength(1)
    expect(harness.objects('Ingresos')).toHaveLength(1)
    expect(harness.objects('Inscripciones')[0].IngresoID).toBe('')

    const retry = request(harness, [participants[0]])
    expect(retry).toMatchObject({ success: true, data: { yaImportadas: 1, errores: 0 } })
    expect(harness.objects('Ingresos')).toHaveLength(1)
    expect(harness.objects('Inscripciones')[0].IngresoID).toBe(harness.objects('Ingresos')[0].ID)
  })

  it('bloquea la reutilización del batch ID con datos distintos', () => {
    const harness = seededHarness()
    request(harness, [participants[0]])
    const altered = [{ ...participants[0], clienteEmail: 'otra@example.com' }]
    const result = request(harness, altered)
    expect(result.success).toBe(false)
    expect(result.error).toContain('datos diferentes')
    expect(harness.objects('Inscripciones')).toHaveLength(1)
  })
})
