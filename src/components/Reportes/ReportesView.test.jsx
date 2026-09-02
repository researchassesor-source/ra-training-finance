import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ReportesView from './ReportesView'

const authState = vi.hoisted(() => ({
  value: { isAdmin: false, isContador: true, user: { username: 'contador', nombre: 'Contador', rol: 'contador' } },
}))

const apiMock = vi.hoisted(() => ({
  getUsuarios: vi.fn(async () => ({ data: [] })),
  getIngresos: vi.fn(async () => ({ data: [] })),
  getEgresos: vi.fn(async () => ({ data: [] })),
  getPagos: vi.fn(async () => ({ data: [] })),
  getContratos: vi.fn(async () => ({ data: [] })),
  getDashboard: vi.fn(async () => ({ data: { kpis: {}, ingresosXMes: [], egresosXMes: [] } })),
  getReporteFlujosTrabajo: vi.fn(async () => ({ data: [] })),
  getReporteAsistencia: vi.fn(async () => ({ data: { registros: [], resumenes: [] } })),
  getFacturasFiscales: vi.fn(async () => ({ data: { items: [] } })),
}))

const exportersMock = vi.hoisted(() => ({
  exportIngresosPDF: vi.fn(),
  exportEgresosPDF: vi.fn(),
  exportPagosPDF: vi.fn(),
  exportContratosPDF: vi.fn(),
  exportResumenPDF: vi.fn(),
  exportResumenWord: vi.fn(),
  exportFlujosTrabajoPDF: vi.fn(),
  exportAsistenciaPDF: vi.fn(),
  exportFacturasEmitidasContableCSV: vi.fn(),
  exportFacturasRecibidasContableCSV: vi.fn(),
}))

vi.mock('../../context/AuthContext', () => ({ useAuth: () => authState.value }))
vi.mock('../../services/api', () => ({ api: apiMock }))
vi.mock('../../utils/exporters', () => exportersMock)

describe('ReportesView — permisos contables', () => {
  beforeEach(() => {
    Object.values(apiMock).forEach(mock => mock.mockClear())
    Object.values(exportersMock).forEach(mock => mock.mockClear())
    authState.value = { isAdmin: false, isContador: true, user: { username: 'contador', nombre: 'Contador', rol: 'contador' } }
  })

  afterEach(() => cleanup())

  it('contador ve solo reportes relacionados con contabilidad, no flujos internos ni asistencia', () => {
    render(<ReportesView />)

    expect(screen.getByText('Excel contable — facturas emitidas')).toBeInTheDocument()
    expect(screen.getByText('Excel contable — facturas recibidas')).toBeInTheDocument()
    expect(screen.getByText('Reporte de Pagos')).toBeInTheDocument()
    expect(screen.queryByText('Reporte de Flujo de Trabajo')).not.toBeInTheDocument()
    expect(screen.queryByText('Reporte de Asistencia')).not.toBeInTheDocument()
    expect(screen.queryByText('Informe Ejecutivo Anual')).not.toBeInTheDocument()
    expect(apiMock.getUsuarios).not.toHaveBeenCalled()
  })

  it('admin conserva todos los reportes, incluidos operativos y contables', async () => {
    authState.value = { isAdmin: true, isContador: false, user: { username: 'admin', nombre: 'Admin', rol: 'admin' } }
    apiMock.getUsuarios.mockResolvedValueOnce({ data: [{ ID: 'USR-A', Username: 'admin', Nombre: 'Admin', Activo: true }] })

    render(<ReportesView />)

    expect(screen.getByText('Excel contable — facturas emitidas')).toBeInTheDocument()
    expect(screen.getByText('Excel contable — facturas recibidas')).toBeInTheDocument()
    expect(screen.getByText('Reporte de Flujo de Trabajo')).toBeInTheDocument()
    expect(screen.getByText('Reporte de Asistencia')).toBeInTheDocument()
    expect(screen.getByText('Informe Ejecutivo Anual')).toBeInTheDocument()
    await waitFor(() => expect(apiMock.getUsuarios).toHaveBeenCalled())
  })

  it('botón Excel de facturas emitidas consulta producción en modo lectura', async () => {
    render(<ReportesView />)
    const emittedCard = screen.getByText('Excel contable — facturas emitidas').closest('.card')

    fireEvent.click(emittedCard.querySelectorAll('button')[1])

    await waitFor(() => expect(apiMock.getFacturasFiscales).toHaveBeenCalledWith(expect.objectContaining({ environment: 'production' })))
    expect(exportersMock.exportFacturasEmitidasContableCSV).toHaveBeenCalled()
  })
})
