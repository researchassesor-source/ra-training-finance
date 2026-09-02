import { describe, expect, it } from 'vitest'
import { createAppsScriptHarness } from './appsScriptHarness'

function createHarness() {
  const harness = createAppsScriptHarness()
  harness.seed('Sesiones', [
    { Token: 'admin-token', Username: 'admin', UserID: 'USR-A', Rol: 'admin', Nombre: 'Admin', Expira: '2099-01-01T00:00:00.000Z' },
    { Token: 'contador-token', Username: 'contador', UserID: 'USR-C', Rol: 'contador', Nombre: 'Contador', Expira: '2099-01-01T00:00:00.000Z' },
    { Token: 'vendedor-token', Username: 'angel', UserID: 'USR-V', Rol: 'vendedor', Nombre: 'Angel', Expira: '2099-01-01T00:00:00.000Z' },
  ])
  harness.seed('Usuarios', [
    { ID: 'USR-A', Nombre: 'Admin', Username: 'admin', Rol: 'admin', Activo: true },
    { ID: 'USR-C', Nombre: 'Contador', Username: 'contador', Rol: 'contador', Activo: true },
    { ID: 'USR-V', Nombre: 'Angel', Username: 'angel', Rol: 'vendedor', Activo: true },
  ])
  harness.seed('Egresos', [])
  return harness
}

describe('egresos con datos contables de factura recibida', () => {
  it('admin registra una factura recibida sin romper el modelo de egreso existente', () => {
    const harness = createHarness()

    const created = harness.context.processRequest({
      action: 'addEgreso',
      token: 'admin-token',
      egreso: {
        fecha: '2026-09-02',
        categoria: 'Honorarios',
        concepto: 'Servicio profesional de capacitación',
        proveedor: 'Proveedor Demo',
        monto: 115,
        proveedorIdentificacion: '0999999999001',
        facturaCompraNumero: '001-001-000000123',
        autorizacionCompra: '0209202601',
        fechaEmisionFactura: '2026-09-01',
        baseImponible0: 0,
        baseImponible15: 100,
        ivaCompra: 15,
        formaPagoCompra: 'Transferencia',
        referenciaPagoCompra: 'TRX-123',
      },
    })

    expect(created.success).toBe(true)
    const row = harness.objects('Egresos')[0]
    expect(row).toMatchObject({
      Categoria: 'Honorarios',
      Concepto: 'Servicio profesional de capacitación',
      ProveedorIdentificacion: '0999999999001',
      FacturaCompraNumero: '001-001-000000123',
      AutorizacionCompra: '0209202601',
      FechaEmisionFactura: '2026-09-01',
      BaseImponible15: 100,
      IvaCompra: 15,
      FormaPagoCompra: 'Transferencia',
      ReferenciaPagoCompra: 'TRX-123',
    })
  })

  it('contador puede leer egresos contables pero no crearlos ni modificarlos', () => {
    const harness = createHarness()
    harness.context.processRequest({
      action: 'addEgreso',
      token: 'admin-token',
      egreso: { fecha: '2026-09-02', categoria: 'Papelería', concepto: 'Compra oficina', proveedor: 'Proveedor', monto: 20 },
    })

    const list = harness.context.processRequest({ action: 'getEgresos', token: 'contador-token', filtros: {} })
    const update = harness.context.processRequest({
      action: 'updateEgreso',
      token: 'contador-token',
      id: harness.objects('Egresos')[0].ID,
      egreso: { fecha: '2026-09-02', categoria: 'Papelería', concepto: 'Cambio no permitido', proveedor: 'Proveedor', monto: 20 },
    })

    expect(list.success).toBe(true)
    expect(list.data).toHaveLength(1)
    expect(update.success).toBe(false)
  })
})
