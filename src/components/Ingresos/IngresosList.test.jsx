import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import IngresosList, { matchesQuery, normalizeSearchValue } from './IngresosList'

const navigateMock = vi.hoisted(() => vi.fn())
vi.mock('react-router-dom', async importOriginal => {
  const actual = await importOriginal()
  return { ...actual, useNavigate: () => navigateMock }
})

const state = vi.hoisted(() => ({ rows: [] }))

const apiMock = vi.hoisted(() => ({
  getIngresos: vi.fn(async () => ({ data: state.rows })),
  getConfigPagos: vi.fn(async () => ({ data: [] })),
  deleteIngreso: vi.fn(async () => ({ success: true })),
  updateIngreso: vi.fn(async () => ({ success: true })),
  verificarPagoInscripcion: vi.fn(async () => ({ success: true })),
}))

vi.mock('../../services/api', () => ({ api: apiMock }))
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { rol: 'admin', username: 'admin.demo' }, isAdmin: true, isVendedor: false }),
}))
vi.mock('../../utils/exporters', () => ({ exportIngresosPDF: vi.fn() }))

function baseRow(overrides = {}) {
  return {
    ID: 'ING-1', Fecha: '2026-08-01', Tipo: 'Inscripción', Modalidad: 'Virtual',
    Concepto: 'Inscripción: Cliente Demo — Curso Demo', Cliente: 'Cliente Demo',
    MetodoPago: 'Transferencia', Estado: 'confirmado', Referencia: 'TRX-998877',
    Monto: 20, InscripcionID: 'INS-1',
    ...overrides,
  }
}

function renderList() {
  return render(<MemoryRouter><IngresosList /></MemoryRouter>)
}

beforeEach(() => {
  state.rows = []
  navigateMock.mockClear()
  Object.values(apiMock).forEach(mock => mock.mockClear())
  window.history.replaceState({}, '', '/ingresos')
})

afterEach(() => cleanup())

describe('IngresosList — trazabilidad hacia la inscripción de origen', () => {
  it('búsqueda por número de comprobante/referencia encuentra el ingreso', async () => {
    state.rows = [baseRow(), baseRow({ ID: 'ING-2', Cliente: 'Otro Cliente', Referencia: 'TRX-000111', InscripcionID: '' })]
    renderList()
    await screen.findByText('Cliente Demo')
    expect(screen.getByText('Otro Cliente')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('Buscar cliente, referencia o comprobante'), { target: { value: 'TRX-998877' } })

    expect(screen.getByText('Cliente Demo')).toBeInTheDocument()
    expect(screen.queryByText('Otro Cliente')).not.toBeInTheDocument()
  })

  it('"Ver inscripción" navega SOLO (no llama verificarPagoInscripcion ni updateIngreso)', async () => {
    state.rows = [baseRow()]
    renderList()
    await screen.findByText('Cliente Demo')

    fireEvent.click(screen.getByTitle('Ver inscripción de origen'))

    expect(navigateMock).toHaveBeenCalledWith('/inscripciones?open=INS-1')
    expect(apiMock.verificarPagoInscripcion).not.toHaveBeenCalled()
    expect(apiMock.updateIngreso).not.toHaveBeenCalled()
  })

  it('ingreso legacy sin InscripcionID: no muestra "Ver inscripción" y no lanza error', async () => {
    state.rows = [baseRow({ ID: 'ING-LEGACY', InscripcionID: '' })]
    renderList()
    await screen.findByText('Cliente Demo')
    expect(screen.queryByTitle('Ver inscripción de origen')).not.toBeInTheDocument()
  })

  it('?inscripcion=<ID> abre el detalle del ingreso vinculado sin ejecutar ninguna acción', async () => {
    state.rows = [baseRow()]
    window.history.replaceState({}, '', '/ingresos?inscripcion=INS-1')
    renderList()

    await waitFor(() => expect(screen.getByText('Verificar Pago Pendiente')).toBeInTheDocument())
    expect(apiMock.verificarPagoInscripcion).not.toHaveBeenCalled()
    expect(apiMock.updateIngreso).not.toHaveBeenCalled()
  })

  it('regresión: ?inscripcion=<ID> con Referencia numérica no rompe la vista (pantalla blanca)', async () => {
    state.rows = [baseRow({ InscripcionID: 'INS_TEST', Referencia: 123456789 })]
    window.history.replaceState({}, '', '/ingresos?inscripcion=INS_TEST')
    renderList()

    await waitFor(() => expect(screen.getByText('Verificar Pago Pendiente')).toBeInTheDocument())
    expect(screen.getAllByText('Cliente Demo').length).toBeGreaterThan(0)
    expect(screen.getByPlaceholderText('Buscar cliente, referencia o comprobante').value).toBe('123456789')
  })
})

describe('matchesQuery / normalizeSearchValue — normalización defensiva', () => {
  it('normalizeSearchValue convierte number, null, undefined y boolean a string', () => {
    expect(normalizeSearchValue(123456789)).toBe('123456789')
    expect(normalizeSearchValue(null)).toBe('')
    expect(normalizeSearchValue(undefined)).toBe('')
    expect(normalizeSearchValue(true)).toBe('true')
  })

  it('encuentra el registro cuando Referencia es numérica', () => {
    const ingreso = baseRow({ Referencia: 123456789 })
    expect(matchesQuery(ingreso, '123456')).toBe(true)
  })

  it('q numérico no lanza TypeError y filtra correctamente', () => {
    const ingreso = baseRow({ Referencia: 'TRX-998877' })
    expect(() => matchesQuery(ingreso, 998877)).not.toThrow()
    expect(matchesQuery(ingreso, 998877)).toBe(true)
    expect(matchesQuery(ingreso, 111111)).toBe(false)
  })

  it('es robusta ante Cliente/Referencia/teléfono null, undefined o boolean', () => {
    const ingreso = baseRow({ Cliente: null, Referencia: undefined, ClienteTelefono: true })
    expect(() => matchesQuery(ingreso, 'x')).not.toThrow()
  })
})
