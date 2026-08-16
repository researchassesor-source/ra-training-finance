import { describe, expect, it } from 'vitest'
import { createAppsScriptHarness } from './appsScriptHarness'

const FUTURE = '2099-01-01T00:00:00.000Z'

function baseHarness(inscripciones = [], facturas = []) {
  const harness = createAppsScriptHarness()
  harness.seed('Sesiones', [
    { Token: 'admin-token', Username: 'admin', UserID: 'USR-A', Rol: 'admin', Nombre: 'Admin', Expira: FUTURE },
    { Token: 'seller-token', Username: 'seller', UserID: 'USR-V', Rol: 'vendedor', Nombre: 'Vendedor', Expira: FUTURE },
  ])
  harness.seed('Usuarios', [
    { ID: 'USR-A', Nombre: 'Admin', Username: 'admin', Rol: 'admin', Activo: true },
    { ID: 'USR-V', Nombre: 'Vendedor', Username: 'seller', Rol: 'vendedor', Activo: true },
  ])
  harness.seed('Servicios', [{ ID: 'SRV-1', Nombre: 'Curso Demo', Duracion: '40', Modalidad: 'Virtual', Activo: true }])
  harness.seed('Inscripciones', inscripciones)
  harness.seed('Ingresos', [])
  harness.seed('Pagos', [])
  harness.seed('Certificados', [])
  harness.seed('AuditoriaCertificados', [])
  harness.seed('FacturasFiscales', facturas)
  return harness
}

function inscripcion(overrides = {}) {
  return {
    ID: 'INS-1', ClienteNombre: 'Andrea Salazar', ClienteID: '0102030405',
    ClienteEmail: 'andrea@example.test', ClienteTelefono: '0999999999',
    ServicioID: 'SRV-1', ServicioNombre: 'Curso Demo', Modalidad: 'Virtual',
    FechaInicio: '2026-09-01', FechaFin: '2026-09-02', Monto: 20, MetodoPago: 'Transferencia',
    EstadoPago: 'pendiente', EstadoCertificado: 'pendiente', CreadoPor: 'seller',
    FechaCreacion: '2026-08-01T10:00:00.000Z', NumeroComprobante: '', Notas: '',
    CRMEnrollmentID: '', CRMContactID: '', RazonSocial: '',
    ...overrides,
  }
}

function search(harness, q, extra = {}) {
  return harness.context.processRequest({ action: 'getInscripciones', token: 'admin-token', filtros: { q, ...extra } })
}

describe('buscador libre de Inscripciones (filtros.q)', () => {
  it('1. busca por nombre (case-insensitive, tolerante a espacios)', () => {
    const harness = baseHarness([inscripcion()])
    const result = search(harness, '  andrea  ')
    expect(result.data).toHaveLength(1)
    expect(result.data[0].ClienteNombre).toBe('Andrea Salazar')
  })

  it('2. busca por apellido dentro de ClienteNombre', () => {
    const harness = baseHarness([inscripcion()])
    const result = search(harness, 'SALAZAR')
    expect(result.data).toHaveLength(1)
  })

  it('3. busca por cédula/RUC (ClienteID)', () => {
    const harness = baseHarness([inscripcion()])
    const result = search(harness, '0102030405')
    expect(result.data).toHaveLength(1)
  })

  it('4. busca por email', () => {
    const harness = baseHarness([inscripcion()])
    const result = search(harness, 'andrea@example.test')
    expect(result.data).toHaveLength(1)
  })

  it('5. busca por NumeroComprobante (fuente estructurada, no Notas)', () => {
    const harness = baseHarness([inscripcion({ NumeroComprobante: 'FAC-000123', Notas: 'observación interna' })])
    expect(search(harness, 'FAC-000123').data).toHaveLength(1)
    expect(search(harness, 'observación interna').data).toHaveLength(0)
  })

  it('5b. fallback a Notas SOLO para registros legacy sin comprobante estructurado', () => {
    const harness = baseHarness([inscripcion({ NumeroComprobante: '', Notas: 'transferencia manual enero' })])
    expect(search(harness, 'transferencia manual enero').data).toHaveLength(1)
  })

  it('6. busca por CRMEnrollmentID', () => {
    const harness = baseHarness([inscripcion({ CRMEnrollmentID: 'ENR-CRM-777' })])
    expect(search(harness, 'enr-crm-777').data).toHaveLength(1)
  })

  it('6b. busca por CRMContactID', () => {
    const harness = baseHarness([inscripcion({ CRMContactID: 'CTC-999' })])
    expect(search(harness, 'ctc-999').data).toHaveLength(1)
  })

  it('7. se combina con estadoPago (AND, no reemplaza el filtro existente)', () => {
    const harness = baseHarness([
      inscripcion({ ID: 'INS-1', ClienteNombre: 'Andrea Salazar', EstadoPago: 'verificado' }),
      inscripcion({ ID: 'INS-2', ClienteNombre: 'Andrea Torres', EstadoPago: 'pendiente' }),
    ])
    const result = search(harness, 'andrea', { estadoPago: 'verificado' })
    expect(result.data).toHaveLength(1)
    expect(result.data[0].ID).toBe('INS-1')
  })

  it('no encuentra coincidencias irrelevantes', () => {
    const harness = baseHarness([inscripcion()])
    expect(search(harness, 'nombre-que-no-existe').data).toHaveLength(0)
  })

  it('sin q, el contrato existente sigue funcionando exactamente igual (retrocompatibilidad)', () => {
    const harness = baseHarness([inscripcion(), inscripcion({ ID: 'INS-2', ClienteNombre: 'Otra Persona' })])
    const result = harness.context.processRequest({ action: 'getInscripciones', token: 'admin-token', filtros: {} })
    expect(result.data).toHaveLength(2)
    const legacyCall = harness.context.processRequest({ action: 'getInscripciones', token: 'admin-token' })
    expect(legacyCall.data).toHaveLength(2)
  })

  it('nunca infiere compras/modos comerciales por monto: q no filtra por Monto', () => {
    const harness = baseHarness([inscripcion({
      Monto: 20, ClienteID: '0999999999', ClienteEmail: 'sin-veinte@example.test',
      ClienteNombre: 'Persona Ejemplo', NumeroComprobante: '',
    })])
    expect(search(harness, '20').data).toHaveLength(0)
  })
})

describe('estado fiscal en batch en getInscripciones (sin N+1)', () => {
  function factura(overrides = {}) {
    return {
      ID: 'FAC-1', Environment: 'production', Status: 'AUTHORIZED', InscripcionID: 'INS-1',
      DocumentNumber: '001-002-000000001', ReviewFlag: '', CreatedAt: '2026-08-02T10:00:00.000Z',
      ...overrides,
    }
  }

  it('anexa FacturaID/FacturaStatus/FacturaNumero cuando existe una factura para la inscripción', () => {
    const harness = baseHarness([inscripcion({ EstadoPago: 'verificado' })], [factura()])
    const result = search(harness, '')
    expect(result.data[0]).toMatchObject({
      FacturaID: 'FAC-1', FacturaStatus: 'AUTHORIZED', FacturaNumero: '001-002-000000001', FacturaReviewFlag: '',
    })
  })

  it('deja los campos de factura vacíos cuando no existe ninguna (Sin factura)', () => {
    const harness = baseHarness([inscripcion()], [])
    const result = search(harness, '')
    expect(result.data[0]).toMatchObject({ FacturaID: '', FacturaStatus: '', FacturaNumero: '' })
  })

  it('nunca copia RUC/dirección/comprobante completo de la factura dentro de Inscripciones', () => {
    const harness = baseHarness([inscripcion({ EstadoPago: 'verificado' })], [factura({ BuyerAddress: 'Dirección secreta', AccessKey: 'clave-secreta' })])
    const result = search(harness, '')
    const keys = Object.keys(result.data[0])
    expect(keys).not.toContain('BuyerAddress')
    expect(keys).not.toContain('AccessKey')
  })

  it('con varias inscripciones, cada una recibe su propia factura (una sola lectura de FacturasFiscales, sin N+1)', () => {
    const harness = baseHarness(
      [inscripcion({ ID: 'INS-1' }), inscripcion({ ID: 'INS-2', ClienteNombre: 'Otra Persona' })],
      [factura({ ID: 'FAC-1', InscripcionID: 'INS-1' }), factura({ ID: 'FAC-2', InscripcionID: 'INS-2', Status: 'PROCESSING' })],
    )
    const result = search(harness, '')
    const byId = Object.fromEntries(result.data.map(item => [item.ID, item]))
    expect(byId['INS-1'].FacturaID).toBe('FAC-1')
    expect(byId['INS-2'].FacturaID).toBe('FAC-2')
    expect(byId['INS-2'].FacturaStatus).toBe('PROCESSING')
  })

  it('expone ReviewFlag para que el frontend pueda marcar "Con novedad" sin reinventar el estado fiscal', () => {
    const harness = baseHarness([inscripcion({ EstadoPago: 'verificado' })], [factura({ Status: 'PROCESSING', ReviewFlag: 'REQUIRES_REVIEW' })])
    const result = search(harness, '')
    expect(result.data[0].FacturaReviewFlag).toBe('REQUIRES_REVIEW')
  })

  describe('aislamiento test/production (hotfix: caso Alexander Mosquera Puente)', () => {
    it('5. production (default, sin fiscalEnvironment): una factura test NO aparece como factura productiva', () => {
      const harness = baseHarness([inscripcion({ EstadoPago: 'verificado' })], [factura({ Environment: 'test', Status: 'DRAFT', DocumentNumber: '' })])
      const result = search(harness, '')
      expect(result.data[0]).toMatchObject({ FacturaID: '', FacturaStatus: '', FacturaNumero: '' })
    })

    it('6. production: una factura production sí aparece', () => {
      const harness = baseHarness([inscripcion({ EstadoPago: 'verificado' })], [factura({ Environment: 'production' })])
      const result = search(harness, '')
      expect(result.data[0]).toMatchObject({ FacturaID: 'FAC-1', FacturaStatus: 'AUTHORIZED' })
    })

    it('7. misma InscripcionID con factura test y factura production -> production muestra únicamente la production (nunca se mezclan)', () => {
      const harness = baseHarness(
        [inscripcion({ EstadoPago: 'verificado' })],
        [
          factura({ ID: 'FAC-TEST', Environment: 'test', Status: 'DRAFT', DocumentNumber: '' }),
          factura({ ID: 'FAC-PROD', Environment: 'production', Status: 'AUTHORIZED' }),
        ],
      )
      const productionView = search(harness, '')
      expect(productionView.data[0].FacturaID).toBe('FAC-PROD')

      const testView = search(harness, '', { fiscalEnvironment: 'test' })
      expect(testView.data[0].FacturaID).toBe('FAC-TEST')
      expect(testView.data[0].FacturaStatus).toBe('DRAFT')
    })

    it('el borrador test de Alexander (DRAFT, sin secuencial) nunca contamina la vista productiva de su inscripción', () => {
      const harness = baseHarness(
        [inscripcion({ ID: 'INS-ALEXANDER', ClienteNombre: 'Alexander Mosquera Puente', EstadoPago: 'verificado', Monto: 20 })],
        [factura({ ID: 'FAC-ALEXANDER-TEST', Environment: 'test', InscripcionID: 'INS-ALEXANDER', Status: 'DRAFT', DocumentNumber: '', Sequential: '' })],
      )
      const result = search(harness, '')
      expect(result.data[0]).toMatchObject({ ID: 'INS-ALEXANDER', FacturaID: '', FacturaStatus: '', FacturaNumero: '' })
    })
  })
})
