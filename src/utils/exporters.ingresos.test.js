import { afterEach, describe, expect, it, vi } from 'vitest'
import { exportCertificadosAvalPDF, exportIngresosPDF, summarizeIngresos } from './exporters'
import { fmt } from './formatters'

const autoTableMock = vi.hoisted(() => vi.fn())

vi.mock('jspdf-autotable', () => ({ default: autoTableMock }))
vi.mock('jspdf', () => ({
  default: class MockJsPDF {
    constructor() {
      this.internal = {
        pageSize: { getWidth: () => 210, getHeight: () => 297 },
        getNumberOfPages: () => 1,
      }
      this.setFillColor = vi.fn()
      this.rect = vi.fn()
      this.setTextColor = vi.fn()
      this.setFontSize = vi.fn()
      this.setFont = vi.fn()
      this.text = vi.fn()
      this.setPage = vi.fn()
      this.save = vi.fn()
    }
  },
}))

afterEach(() => autoTableMock.mockClear())

describe('reporte de ingresos', () => {
  it('separa montos confirmados y pendientes y excluye cancelados del dinero recibido', () => {
    expect(summarizeIngresos([
      { Estado: 'confirmado', Monto: 20 },
      { Estado: 'pendiente', Monto: 5 },
      { Estado: 'pendiente_verificacion', Monto: '7.50' },
      { Estado: 'cancelado', Monto: 100 },
      { Estado: 'desconocido', Monto: 50 },
    ])).toEqual({ confirmado: 20, pendiente: 12.5 })
  })

  it('el PDF muestra los totales en dos filas y conserva 9 celdas por fila', () => {
    exportIngresosPDF([
      { Fecha: '2026-08-01', Estado: 'confirmado', Monto: 20 },
      { Fecha: '2026-08-02', Estado: 'pendiente_verificacion', Monto: 5 },
      { Fecha: '2026-08-03', Estado: 'cancelado', Monto: 100 },
    ])

    const tableOptions = autoTableMock.mock.calls[0][1]
    expect(tableOptions.foot).toEqual([
      ['', '', '', '', '', '', '', 'CONFIRMADO', fmt.usd(20)],
      ['', '', '', '', '', '', '', 'PENDIENTE', fmt.usd(5)],
    ])
    expect(tableOptions.foot.every(row => row.length === 9)).toBe(true)
  })
})

describe('reporte económico de avales institucionales', () => {
  it('exporta los valores del snapshot confirmado y no los presenta como pagos realizados', () => {
    exportCertificadosAvalPDF([
      { ClienteNombre: 'Participante Uno', ServicioNombre: 'Curso Uno', EstadoAval: 'avalado', ValorAval: 1.5,
        AvalMontoBase: 10, AvalPorcentajeAplicado: 15, AvalLegacy: false, AvalConvenioID: 'CONV-1',
        CertificadoNormal: { CodigoCertificado: 'RA-NORMAL-1', CertificateStatus: 'emitido', CertificateVersion: 1 },
        EntregableAval: { CodigoCertificado: 'RA-AVAL-1', CertificateStatus: 'emitido', CertificateVersion: 1 } },
      { ClienteNombre: 'Registro antiguo', ServicioNombre: 'Curso anterior', EstadoAval: 'avalado', ValorAval: 7.35,
        AvalLegacy: true, AvalConvenioID: 'CONV-LEGACY' },
      { ClienteNombre: 'Pendiente', ServicioNombre: 'Curso Dos', EstadoAval: 'pendiente', ValorAval: 0,
        AvalMontoBase: 20, AvalPorcentajeAplicado: 10, AvalLegacy: false },
    ], 'Instituto Uno')

    const report = autoTableMock.mock.calls.at(-1)[1]
    expect(report.body).toHaveLength(3)
    expect(report.body[0].slice(10, 13)).toEqual([fmt.usd(10), '15%', fmt.usd(1.5)])
    expect(report.body[0][13]).toContain('RA-NORMAL-1')
    expect(report.body[0][13]).toContain('RA-AVAL-1')
    expect(report.body[1].slice(10, 13)).toEqual(['—', '—', fmt.usd(7.35)])
    expect(report.body[2].slice(10, 13)).toEqual(['—', '—', '—'])
    expect(report.foot).toEqual([['', '', '', '', '', '', '', '', '', '', '', 'TOTAL AVALADO', fmt.usd(8.85), '']])
    expect(report.foot[0]).toHaveLength(14)
  })
})
