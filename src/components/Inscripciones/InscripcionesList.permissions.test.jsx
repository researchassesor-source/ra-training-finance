import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import InscripcionesList from './InscripcionesList'

const state = vi.hoisted(() => ({
  user: { rol: 'admin', username: 'admin.demo', nombre: 'Admin Demo' },
  rows: [],
  order: [],
  qrValid: true,
}))

const apiMock = vi.hoisted(() => ({
  getInscripciones: vi.fn(async () => ({ data: state.rows })),
  getServicios: vi.fn(async () => ({ data: [] })),
  getUsuarios: vi.fn(async () => ({ data: [] })),
  getConfigPagos: vi.fn(async () => ({ data: [] })),
  emitirCertificado: vi.fn(async () => ({ data: state.rows[0] })),
  getCertificadoParaDescarga: vi.fn(async () => ({ data: state.rows[0] })),
  registrarArtefactoCertificado: vi.fn(async () => ({ success: true })),
  solicitarDescargaCertificado: vi.fn(async () => { state.order.push('requested'); return { success: true, requestId: 'DLC-1' } }),
  confirmarDescargaCertificado: vi.fn(async (_id, result) => { state.order.push(result); return { success: true } }),
  registrarGeneracionCertificado: vi.fn(async () => ({ success: true })),
  actualizarEntregaCertificado: vi.fn(async () => ({ success: true })),
}))

const certificateMocks = vi.hoisted(() => ({
  buildCertificatePdf: vi.fn(async () => ({
    blob: new Blob(['pdf'], { type: 'application/pdf' }),
    filename: 'certificado_demo.pdf',
  })),
  prepare: vi.fn(async () => ({
    blob: new Blob(['pdf'], { type: 'application/pdf' }),
    filename: 'certificado_demo.pdf',
    hash: 'a'.repeat(64),
    reference: 'browser-indexeddb:INS-DEMO-001:v1',
    templateVersion: 'test-v1',
    certificateVersion: 1,
  })),
  saveAs: vi.fn(() => state.order.push('saved')),
}))

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    user: state.user,
    isAdmin: state.user.rol === 'admin',
  }),
}))
vi.mock('../../services/api', () => ({ api: apiMock }))
vi.mock('../../config/brand', () => ({
  certificatePublicUrlStatus: () => state.qrValid
    ? { valid: true, environment: 'development', url: 'http://localhost:5173', error: '' }
    : { valid: false, environment: 'preview', url: '', error: 'VITE_PUBLIC_APP_URL es obligatoria para emitir certificados en Preview y Production.' },
}))
vi.mock('../../services/certificatePdfRepository', () => ({
  certificatePdfRepository: {
    prepare: certificate => certificateMocks.prepare(certificate),
  },
}))
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
  CertificatePublicId: 'INS-DEMO-001',
  CertificateVersion: 1,
  TemplateVersion: 'test-v1',
  FechaEmisionCertificado: '2026-07-02T12:00:00.000Z',
}

describe('acciones visibles en inscripciones', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.rows = [emittedRow]
    state.order = []
    state.qrValid = true
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

  it('solicita auditoría antes de descargar y confirma el resultado después', async () => {
    state.user = { rol: 'admin', username: 'admin.demo', nombre: 'Admin Demo' }
    render(<InscripcionesList />)
    await screen.findByText('Participante Demo')

    fireEvent.click(screen.getByRole('button', { name: 'Ver y descargar certificado académico' }))

    await waitFor(() => expect(certificateMocks.saveAs).toHaveBeenCalledWith(
      expect.any(Blob),
      'certificado_demo.pdf',
    ))
    await waitFor(() => expect(apiMock.confirmarDescargaCertificado).toHaveBeenCalledWith('DLC-1', 'completado'))
    expect(state.order).toEqual(['requested', 'saved', 'completado'])
  })

  it('ofrece reemisión controlada si el certificado histórico no tiene artefacto local', async () => {
    state.user = { rol: 'admin', username: 'admin.demo', nombre: 'Admin Demo' }
    const missingArtifact = new Error('El PDF oficial existe, pero no está disponible en este navegador o dispositivo.')
    missingArtifact.code = 'CERTIFICATE_ARTIFACT_NOT_LOCAL'
    certificateMocks.prepare.mockRejectedValueOnce(missingArtifact)
    render(<InscripcionesList />)
    await screen.findByText('Participante Demo')

    fireEvent.click(screen.getByRole('button', { name: 'Ver y descargar certificado académico' }))

    expect(await screen.findByText('Recuperación controlada del certificado')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Iniciar reemisión controlada' })).toBeInTheDocument()
    expect(certificateMocks.saveAs).not.toHaveBeenCalled()
  })

  it('bloquea la emisión en Preview cuando falta la URL pública canónica', async () => {
    state.user = { rol: 'admin', username: 'admin.demo', nombre: 'Admin Demo' }
    state.qrValid = false
    state.rows = [{
      ...emittedRow,
      EstadoCertificado: 'pendiente',
      CertificateStatus: 'pendiente',
      CodigoCertificado: '',
      FechaEmisionCertificado: '',
    }]
    render(<InscripcionesList />)
    await screen.findByText('Participante Demo')
    const issue = screen.getByRole('button', { name: 'VITE_PUBLIC_APP_URL es obligatoria para emitir certificados en Preview y Production.' })
    expect(issue).toBeDisabled()
    expect(apiMock.emitirCertificado).not.toHaveBeenCalled()
  })
})
