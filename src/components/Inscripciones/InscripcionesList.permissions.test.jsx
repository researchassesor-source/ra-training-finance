import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import InscripcionesList from './InscripcionesList'

const state = vi.hoisted(() => ({
  user: { rol: 'admin', username: 'admin.demo', nombre: 'Admin Demo' },
  rows: [],
}))

const apiMock = vi.hoisted(() => ({
  getInscripciones: vi.fn(async () => ({ data: state.rows })),
  getServicios: vi.fn(async () => ({ data: [] })),
  getUsuarios: vi.fn(async () => ({ data: [] })),
  getConfigPagos: vi.fn(async () => ({ data: [] })),
  emitirCertificado: vi.fn(async () => ({ data: state.rows[0] })),
  registrarGeneracionCertificado: vi.fn(async () => ({ success: true })),
  actualizarEntregaCertificado: vi.fn(async () => ({ success: true })),
}))

const certificateMocks = vi.hoisted(() => ({
  buildCertificatePdf: vi.fn(async () => ({
    blob: new Blob(['pdf'], { type: 'application/pdf' }),
    filename: 'certificado_demo.pdf',
  })),
  saveAs: vi.fn(),
}))

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    user: state.user,
    isAdmin: state.user.rol === 'admin',
  }),
}))
vi.mock('../../services/api', () => ({ api: apiMock }))
vi.mock('file-saver', () => ({ saveAs: certificateMocks.saveAs }))
vi.mock('../../utils/exporters', () => ({
  exportInscripcionPDF: vi.fn(),
  exportInscripcionesCSV: vi.fn(),
  exportInscripcionesPDF: vi.fn(),
}))
vi.mock('../../utils/certificateGenerator', () => ({
  buildCertificatePdf: certificateMocks.buildCertificatePdf,
  validateCertificateData: vi.fn(() => []),
}))
vi.mock('../../utils/qr', () => ({
  buildVerificationUrl: vi.fn(() => 'https://example.test/verificar/INS-DEMO'),
  generateQrDataUrl: vi.fn(async () => 'data:image/png;base64,AA=='),
}))

const emittedRow = {
  ID: 'INS-DEMO-001',
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
  EstadoPago: 'verificado',
  EstadoCertificado: 'emitido',
  EstadoEntrega: 'pendiente',
  RequiereAvalExterno: false,
  CodigoCertificado: 'RA-2026-DEMO001',
}

describe('acciones visibles en inscripciones', () => {
  beforeEach(() => {
    state.rows = [emittedRow]
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:certificate-preview') })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
    vi.spyOn(window, 'open').mockReturnValue({
      opener: null,
      document: { title: '', body: { innerHTML: '' } },
      location: { replace: vi.fn() },
      closed: false,
      close: vi.fn(),
    })
  })
  afterEach(() => cleanup())

  it('muestra descargar, QR y entrega al administrador', async () => {
    state.user = { rol: 'admin', username: 'admin.demo', nombre: 'Admin Demo' }
    render(<InscripcionesList />)
    await screen.findByText('Participante Demo')
    expect(screen.getByRole('button', { name: 'Ver y descargar certificado académico' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ver y descargar QR' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Entregar certificado' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Auditoría de certificados/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /No puede eliminarse una inscripción con certificado emitido/i })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Eliminar inscripción' })).not.toBeInTheDocument()
  })

  it('oculta las acciones oficiales al vendedor y conserva el estado', async () => {
    state.user = { rol: 'vendedor', username: 'vendedor.demo', nombre: 'Vendedor Demo' }
    render(<InscripcionesList />)
    await screen.findByText('Participante Demo')
    expect(screen.getAllByText('Emitido').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'Ver y descargar certificado académico' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ver y descargar QR' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Entregar certificado' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Auditoría de certificados/i })).not.toBeInTheDocument()
  })

  it('descarga antes de esperar la auditoría remota', async () => {
    state.user = { rol: 'admin', username: 'admin.demo', nombre: 'Admin Demo' }
    apiMock.emitirCertificado.mockImplementationOnce(() => new Promise(() => {}))
    render(<InscripcionesList />)
    await screen.findByText('Participante Demo')

    fireEvent.click(screen.getByRole('button', { name: 'Ver y descargar certificado académico' }))

    await waitFor(() => expect(certificateMocks.saveAs).toHaveBeenCalledWith(
      expect.any(Blob),
      'certificado_demo.pdf',
    ))
  })
})
