import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import InscripcionesList from './InscripcionesList'

const state = vi.hoisted(() => ({
  user: { rol: 'admin', username: 'admin.demo', nombre: 'Admin Demo' },
  rows: [],
  order: [],
  qrValid: true,
  qrEnvironment: 'development',
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
    ? { valid: true, environment: state.qrEnvironment, url: 'http://localhost:5173', error: '' }
    : { valid: false, environment: state.qrEnvironment, url: '', error: 'VITE_PUBLIC_APP_URL es obligatoria para emitir certificados en Preview y Production.' },
  certificatePublicConfigurationNotice: status => {
    if (status.environment === 'production') {
      return status.valid ? null : { tone: 'error', title: 'La verificación pública de certificados requiere revisión administrativa.', details: '' }
    }
    return {
      tone: status.valid ? 'success' : 'error',
      title: `QR público · ${status.environment} · ${status.valid ? 'Configuración válida' : 'Emisión bloqueada'}`,
      details: status.valid ? status.url : status.error,
    }
  },
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
    state.qrEnvironment = 'development'
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

  it('mantiene bloqueada la recuperación y descarga para el rol aval', async () => {
    state.user = { rol: 'aval', username: 'aval.demo', nombre: 'Institución Aval' }
    render(<InscripcionesList />)
    await screen.findByText('Participante Demo')
    expect(screen.queryByRole('button', { name: 'Ver y descargar certificado académico' })).not.toBeInTheDocument()
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

  it('recupera el histórico, lo descarga y advierte al administrador sin exigir reemisión', async () => {
    state.user = { rol: 'admin', username: 'admin.demo', nombre: 'Admin Demo' }
    certificateMocks.prepare.mockResolvedValueOnce({
      blob: new Blob(['pdf-historico'], { type: 'application/pdf' }),
      filename: 'certificado_historico.pdf',
      hash: 'b'.repeat(64),
      reference: 'browser-indexeddb:INS-DEMO-001:v1:historical-recovery',
      templateVersion: 'ra-canva-2026-v1',
      certificateVersion: 1,
      historicalRecovered: true,
      auditAction: 'CERTIFICATE_HISTORICAL_ARTIFACT_RECOVERED',
    })
    render(<InscripcionesList />)
    await screen.findByText('Participante Demo')

    fireEvent.click(screen.getByRole('button', { name: 'Ver y descargar certificado académico' }))

    expect(await screen.findByText(/Se recuperó el artefacto del certificado histórico con la plantilla vigente/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Iniciar reemisión controlada' })).not.toBeInTheDocument()
    expect(certificateMocks.saveAs).toHaveBeenCalledWith(expect.any(Blob), 'certificado_historico.pdf')
  })

  it('oculta la franja técnica válida en Production', async () => {
    state.user = { rol: 'admin', username: 'admin.demo', nombre: 'Admin Demo' }
    state.qrEnvironment = 'production'
    render(<InscripcionesList />)
    await screen.findByText('Participante Demo')
    expect(screen.queryByText(/QR público/)).not.toBeInTheDocument()
  })

  it('mantiene la franja técnica en Preview', async () => {
    state.user = { rol: 'admin', username: 'admin.demo', nombre: 'Admin Demo' }
    state.qrEnvironment = 'preview'
    render(<InscripcionesList />)
    await screen.findByText('Participante Demo')
    expect(screen.getByText(/QR público · preview/)).toBeInTheDocument()
  })

  it('muestra solo un aviso administrativo discreto si Production es inválido', async () => {
    state.user = { rol: 'admin', username: 'admin.demo', nombre: 'Admin Demo' }
    state.qrEnvironment = 'production'
    state.qrValid = false
    render(<InscripcionesList />)
    await screen.findByText('Participante Demo')
    expect(screen.getByText('La verificación pública de certificados requiere revisión administrativa.')).toBeInTheDocument()
    expect(screen.queryByText(/VITE_PUBLIC_APP_URL/)).not.toBeInTheDocument()
    expect(screen.queryByText(/http:\/\//)).not.toBeInTheDocument()
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
