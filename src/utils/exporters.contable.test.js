import { describe, expect, it, vi, beforeEach } from 'vitest'
import { exportFacturasEmitidasContableCSV, exportFacturasRecibidasContableCSV } from './exporters'

const saveAsMock = vi.hoisted(() => vi.fn())

vi.mock('file-saver', () => ({ saveAs: saveAsMock }))

async function csvTextFromLastSave() {
  const blob = saveAsMock.mock.calls.at(-1)[0]
  return await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = reject
    reader.readAsText(blob)
  })
}

describe('exportes contables para contador', () => {
  beforeEach(() => saveAsMock.mockClear())

  it('exporta facturas emitidas con el formato solicitado por contador', async () => {
    exportFacturasEmitidasContableCSV([{
      status: 'DELIVERED',
      issueDate: '2026-08-13T10:00:00.000Z',
      documentNumber: '001-002-000000001',
      authorizationNumber: '1308202601',
      subtotal0: 800,
      subtotalTaxed: 0,
      taxTotal: 0,
      grandTotal: 800,
      items: [{ descripcion: 'Habilidades blandas para profesionales' }],
    }])

    const csv = await csvTextFromLastSave()
    expect(csv).toContain('"FECHA","DETALLE","FACT. No.","AUTORIZACION","BASE IMPONIBLE 0%","BASE IMPONIBLE 15%","IVA","TOTAL"')
    expect(csv).toContain('"Habilidades blandas para profesionales"')
    expect(csv).toContain('"001-002-000000001"')
    expect(csv).toContain('"8.00","0.00","0.00","8.00"')
  })

  it('exporta facturas recibidas desde egresos sin romper egresos simples', async () => {
    exportFacturasRecibidasContableCSV([
      {
        Fecha: '2026-09-02',
        Concepto: 'Servicio profesional',
        FacturaCompraNumero: '001-001-000000123',
        AutorizacionCompra: '0209202601',
        BaseImponible0: 0,
        BaseImponible15: 100,
        IvaCompra: 15,
        Monto: 115,
      },
      {
        Fecha: '2026-09-02',
        Concepto: 'Gasto legacy',
        Monto: 20,
      },
    ])

    const csv = await csvTextFromLastSave()
    expect(csv).toContain('"Servicio profesional","001-001-000000123","0209202601","0.00","100.00","15.00","115.00"')
    expect(csv).toContain('"Gasto legacy","","","0.00","0.00","0.00","20.00"')
  })
})
