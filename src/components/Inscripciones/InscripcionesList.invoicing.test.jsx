import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import InscripcionesList from './InscripcionesList'

const navigateMock = vi.hoisted(() => vi.fn())
vi.mock('react-router-dom', async importOriginal => {
  const actual = await importOriginal()
  return { ...actual, useNavigate: () => navigateMock }
})

const state = vi.hoisted(() => ({
  user: { rol: 'admin', username: 'admin.demo', nombre: 'Admin Demo' },
  rows: [],
}))

const apiMock = vi.hoisted(() => ({
  getInscripciones: vi.fn(async () => ({ data: state.rows })),
  getServicios: vi.fn(async () => ({ data: [] })),
  getUsuarios: vi.fn(async () => ({ data: [] })),
  getInstitucionesAval: vi.fn(async () => ({ data: [] })),
  getConfigPagos: vi.fn(async () => ({ data: [] })),
  deleteInscripcion: vi.fn(async () => ({ success: true })),
  verificarPagoInscripcion: vi.fn(async () => ({ success: true })),
  crearFacturaFiscalDesdeInscripcion: vi.fn(async () => ({ success: true, data: { factura: { id: 'FAC-1', status: 'AUTHORIZED', documentNumber: '001-002-000000001' } } })),
}))

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: state.user, isAdmin: state.user.rol === 'admin' }),
}))
vi.mock('../../services/api', () => ({ api: apiMock }))
vi.mock('../../config/brand', () => ({
  certificatePublicUrlStatus: () => ({ valid: true, environment: 'development', url: 'http://localhost:5173', error: '' }),
  certificatePublicConfigurationNotice: () => null,
}))
vi.mock('file-saver', () => ({ saveAs: vi.fn() }))
vi.mock('../../utils/exporters', () => ({
  exportInscripcionPDF: vi.fn(),
  exportInscripcionesCSV: vi.fn(),
  exportInscripcionesPDF: vi.fn(),
}))
vi.mock('../../utils/qr', () => ({
  buildVerificationUrl: vi.fn(() => 'https://example.test/verificar/INS-DEMO'),
  generateQrDataUrl: vi.fn(async () => 'data:image/png;base64,AA=='),
}))

function baseRow(overrides = {}) {
  return {
    ID: 'INS-1',
    ClienteNombre: 'Participante Demo',
    ClienteEmail: 'demo@example.test',
    ClienteID: '0000000000',
    ClienteTelefono: '0000000000',
    ServicioNombre: 'Curso de demostración',
    Modalidad: 'Virtual',
    Duracion: '40 horas',
    FechaInicio: '2026-07-01',
    FechaFin: '2026-07-02',
    FechaCreacion: '2026-07-01T12:00:00.000Z',
    Monto: 20,
    EstadoPago: 'pendiente',
    EstadoCertificado: 'pendiente',
    RequiereAvalExterno: false,
    CodigoCertificado: '',
    FacturaID: '',
    FacturaStatus: '',
    FacturaNumero: '',
    FacturaReviewFlag: '',
    ...overrides,
  }
}

function renderList() {
  return render(<MemoryRouter><InscripcionesList /></MemoryRouter>)
}

/** El botón de fila y el botón de confirmación del modal comparten el mismo texto
 * accesible ("Emitir factura") mientras el modal está abierto -- el modal se
 * renderiza inline (sin portal), así que el último botón en el DOM es el del
 * ConfirmDialog. */
function confirmDialogButton() {
  const matches = screen.getAllByRole('button', { name: 'Emitir factura' })
  return matches[matches.length - 1]
}

describe('facturación desde Inscripciones — flujo de pago (sección 8/9 previas)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.user = { rol: 'admin', username: 'admin.demo', nombre: 'Admin Demo' }
    state.rows = [baseRow()]
    window.history.replaceState({}, '', '/inscripciones')
  })
  afterEach(() => cleanup())

  it('pago verificado + factura creada -> aviso verde con número/estado', async () => {
    apiMock.verificarPagoInscripcion.mockResolvedValueOnce({
      success: true,
      fiscal: { success: true, data: { factura: { id: 'FAC-1', status: 'AUTHORIZED', documentNumber: '001-002-000000001' } } },
    })
    renderList()
    await screen.findByText('Participante Demo')
    fireEvent.click(screen.getByRole('button', { name: 'Verificar pago' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar' }))

    expect(await screen.findByText('Pago verificado. Factura creada correctamente.')).toBeInTheDocument()
    expect(screen.getByText(/001-002-000000001/)).toBeInTheDocument()
  })

  it('pago verificado + fiscalWarning -> aviso ámbar y el pago NO se revierte', async () => {
    apiMock.verificarPagoInscripcion.mockResolvedValueOnce({
      success: true,
      fiscalWarning: 'Falta cédula/RUC válido del cliente para facturar.',
    })
    renderList()
    await screen.findByText('Participante Demo')
    fireEvent.click(screen.getByRole('button', { name: 'Verificar pago' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar' }))

    expect(await screen.findByText('Pago verificado, pero la factura no pudo generarse. Puede reintentarla sin duplicar el comprobante.')).toBeInTheDocument()
  })
})

describe('protección histórica de facturación (confirmación obligatoria)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.user = { rol: 'admin', username: 'admin.demo', nombre: 'Admin Demo' }
    state.rows = [baseRow()]
    window.history.replaceState({}, '', '/inscripciones')
  })
  afterEach(() => cleanup())

  it('1. admin + verificado + sin factura -> muestra "Emitir factura"', async () => {
    state.rows = [baseRow({ EstadoPago: 'verificado' })]
    renderList()
    await screen.findByText('Participante Demo')
    expect(screen.getByRole('button', { name: 'Emitir factura' })).toBeInTheDocument()
  })

  it('2. vendedor -> nunca muestra "Emitir factura" ni "Ver factura"', async () => {
    state.user = { rol: 'vendedor', username: 'vendedor.demo', nombre: 'Vendedor Demo' }
    state.rows = [
      baseRow({ EstadoPago: 'verificado' }),
      baseRow({ ID: 'INS-2', ClienteNombre: 'Otro Participante', EstadoPago: 'verificado', FacturaID: 'FAC-1' }),
    ]
    renderList()
    await screen.findByText('Participante Demo')
    expect(screen.queryByRole('button', { name: 'Emitir factura' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ver factura' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Verificar pago' })).not.toBeInTheDocument()
  })

  const estadosConFactura = ['DRAFT', 'SEQUENCE_RESERVED', 'GENERATED', 'SIGNED', 'SUBMITTING', 'RECEIVED', 'PROCESSING', 'AUTHORIZED', 'DELIVERY_PENDING', 'DELIVERED', 'NOT_AUTHORIZED']
  it.each(estadosConFactura)('%s existente -> no muestra "Emitir factura" (solo InscripcionID importa, no el estado)', async status => {
    state.rows = [baseRow({ EstadoPago: 'verificado', FacturaID: 'FAC-1', FacturaStatus: status })]
    renderList()
    await screen.findByText('Participante Demo')
    expect(screen.queryByRole('button', { name: 'Emitir factura' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ver factura' })).toBeInTheDocument()
  })

  it('9. click en "Emitir factura" abre ConfirmDialog y todavía NO llama a la API fiscal', async () => {
    state.rows = [baseRow({ EstadoPago: 'verificado' })]
    renderList()
    await screen.findByText('Participante Demo')

    fireEvent.click(screen.getByRole('button', { name: 'Emitir factura' }))

    expect(await screen.findByText('Emitir factura electrónica')).toBeInTheDocument()
    expect(screen.getByText(/Se emitirá una factura electrónica para/)).toBeInTheDocument()
    expect(screen.getAllByText(/Participante Demo/).length).toBeGreaterThan(0)
    expect(screen.getByText(/El pago ya está verificado y no será modificado/)).toBeInTheDocument()
    expect(apiMock.crearFacturaFiscalDesdeInscripcion).not.toHaveBeenCalled()
  })

  it('10. cancelar la confirmación -> 0 llamadas fiscales', async () => {
    state.rows = [baseRow({ EstadoPago: 'verificado' })]
    renderList()
    await screen.findByText('Participante Demo')

    fireEvent.click(screen.getByRole('button', { name: 'Emitir factura' }))
    await screen.findByText('Emitir factura electrónica')
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    await waitFor(() => expect(screen.queryByText('Emitir factura electrónica')).not.toBeInTheDocument())
    expect(apiMock.crearFacturaFiscalDesdeInscripcion).not.toHaveBeenCalled()
    expect(apiMock.verificarPagoInscripcion).not.toHaveBeenCalled()
  })

  it('11/12. confirmar histórico -> crearFacturaFiscalDesdeInscripcion exactamente 1 vez, verificarPagoInscripcion 0 veces', async () => {
    state.rows = [baseRow({ EstadoPago: 'verificado' })]
    renderList()
    await screen.findByText('Participante Demo')

    fireEvent.click(screen.getByRole('button', { name: 'Emitir factura' }))
    await screen.findByText('Emitir factura electrónica')
    fireEvent.click(confirmDialogButton())

    await screen.findByText('Factura creada correctamente.')
    expect(apiMock.crearFacturaFiscalDesdeInscripcion).toHaveBeenCalledTimes(1)
    expect(apiMock.crearFacturaFiscalDesdeInscripcion).toHaveBeenCalledWith('INS-1')
    expect(apiMock.verificarPagoInscripcion).not.toHaveBeenCalled()
  })

  it('13. doble clic sobre el botón de confirmación no duplica la petición', async () => {
    let resolvePending
    apiMock.crearFacturaFiscalDesdeInscripcion.mockImplementationOnce(() => new Promise(resolve => { resolvePending = resolve }))
    state.rows = [baseRow({ EstadoPago: 'verificado' })]
    renderList()
    await screen.findByText('Participante Demo')

    fireEvent.click(screen.getByRole('button', { name: 'Emitir factura' }))
    await screen.findByText('Emitir factura electrónica')
    const button = confirmDialogButton()
    fireEvent.click(button)
    await waitFor(() => expect(button).toBeDisabled())
    fireEvent.click(button) // bloqueado por el estado processing

    resolvePending({ success: true, data: { factura: { id: 'FAC-1', status: 'AUTHORIZED', documentNumber: '001-002-000000001' } } })
    await screen.findByText('Factura creada correctamente.')

    expect(apiMock.crearFacturaFiscalDesdeInscripcion).toHaveBeenCalledTimes(1)
  })

  it('14. respuesta idempotente -> aviso de éxito y la acción "Emitir factura" desaparece', async () => {
    apiMock.crearFacturaFiscalDesdeInscripcion.mockResolvedValueOnce({
      success: true,
      data: { factura: { id: 'FAC-1', status: 'AUTHORIZED', documentNumber: '001-002-000000001' }, idempotent: true },
    })
    state.rows = [baseRow({ EstadoPago: 'verificado' })]
    renderList()
    await screen.findByText('Participante Demo')

    fireEvent.click(screen.getByRole('button', { name: 'Emitir factura' }))
    await screen.findByText('Emitir factura electrónica')

    // El índice fiscal (getInscripciones) ya refleja la factura existente para cuando
    // el load() posterior a la confirmación se dispare -- simula la respuesta real del backend.
    state.rows = [baseRow({ EstadoPago: 'verificado', FacturaID: 'FAC-1', FacturaStatus: 'AUTHORIZED' })]
    fireEvent.click(confirmDialogButton())

    expect(await screen.findByText('Esta inscripción ya tiene una factura asociada.')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Emitir factura' })).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Ver factura' })).toBeInTheDocument()
  })

  it('15. la carga inicial / render nunca emite facturas automáticamente (sin auto-backfill)', async () => {
    state.rows = [
      baseRow({ ID: 'INS-1', EstadoPago: 'verificado' }),
      baseRow({ ID: 'INS-2', ClienteNombre: 'Otro Histórico', EstadoPago: 'verificado' }),
    ]
    renderList()
    await screen.findByText('Participante Demo')
    await screen.findByText('Otro Histórico')

    expect(apiMock.crearFacturaFiscalDesdeInscripcion).not.toHaveBeenCalled()
    expect(apiMock.verificarPagoInscripcion).not.toHaveBeenCalled()
  })

  it('16. flujo nuevo existente: "Verificar pago" sigue intentando factura automática (sin ConfirmDialog fiscal)', async () => {
    state.rows = [baseRow({ EstadoPago: 'pendiente' })]
    apiMock.verificarPagoInscripcion.mockResolvedValueOnce({
      success: true,
      fiscal: { success: true, data: { factura: { id: 'FAC-1', status: 'AUTHORIZED', documentNumber: '001-002-000000001' } } },
    })
    renderList()
    await screen.findByText('Participante Demo')

    fireEvent.click(screen.getByRole('button', { name: 'Verificar pago' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar' }))

    await waitFor(() => expect(apiMock.verificarPagoInscripcion).toHaveBeenCalledWith('INS-1'))
    expect(apiMock.crearFacturaFiscalDesdeInscripcion).not.toHaveBeenCalled()
  })

  it('inscripción con factura -> "Ver factura" navega a /facturacion?factura=<ID>, sin ConfirmDialog', async () => {
    state.rows = [baseRow({ EstadoPago: 'verificado', FacturaID: 'FAC-1', FacturaStatus: 'AUTHORIZED', FacturaNumero: '001-002-000000001' })]
    renderList()
    await screen.findByText('Participante Demo')
    fireEvent.click(screen.getByRole('button', { name: 'Ver factura' }))
    expect(navigateMock).toHaveBeenCalledWith('/facturacion?factura=FAC-1')
    expect(apiMock.crearFacturaFiscalDesdeInscripcion).not.toHaveBeenCalled()
  })

  it('inscripción sin pago verificado -> la acción fiscal queda deshabilitada con tooltip', async () => {
    state.rows = [baseRow({ EstadoPago: 'pendiente' })]
    renderList()
    await screen.findByText('Participante Demo')
    expect(screen.getByRole('button', { name: 'Verifique el pago antes de facturar.' })).toBeDisabled()
  })

  it('inscripción con ingreso vinculado -> "Ver pago (ingreso)" navega a /ingresos?inscripcion=<ID>, sin llamar a la API', async () => {
    state.rows = [baseRow({ IngresoID: 'ING-1' })]
    renderList()
    await screen.findByText('Participante Demo')
    fireEvent.click(screen.getByRole('button', { name: 'Ver pago (ingreso)' }))
    expect(navigateMock).toHaveBeenCalledWith('/ingresos?inscripcion=INS-1')
    expect(apiMock.crearFacturaFiscalDesdeInscripcion).not.toHaveBeenCalled()
    expect(apiMock.verificarPagoInscripcion).not.toHaveBeenCalled()
  })

  it('inscripción legacy sin IngresoID -> no muestra "Ver pago (ingreso)"', async () => {
    state.rows = [baseRow({ IngresoID: '' })]
    renderList()
    await screen.findByText('Participante Demo')
    expect(screen.queryByRole('button', { name: 'Ver pago (ingreso)' })).not.toBeInTheDocument()
  })
})
