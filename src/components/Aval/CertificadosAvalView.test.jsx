import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CertificadosAvalView from './CertificadosAvalView'

const mock = vi.hoisted(() => ({
  admin: true,
  getCertificadosAval: vi.fn(),
  getOpcionesInstitucionesMaestras: vi.fn(),
  getConveniosParaAval: vi.fn(),
  configurarAvalPosteriorCertificado: vi.fn(),
  getHistorialCertificados: vi.fn(),
}))

vi.mock('../../services/api', () => ({ api: {
  getCertificadosAval: mock.getCertificadosAval,
  getOpcionesInstitucionesMaestras: mock.getOpcionesInstitucionesMaestras,
  getConveniosParaAval: mock.getConveniosParaAval,
  configurarAvalPosteriorCertificado: mock.configurarAvalPosteriorCertificado,
  getHistorialCertificados: mock.getHistorialCertificados,
} }))
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ isAdmin: mock.admin }) }))

const row = {
  ID: 'INS-ITSAL-1', ClienteNombre: 'Persona de Prueba', ClienteID: '0100000001',
  ClienteEmail: 'persona@example.com', ServicioNombre: 'Curso de Prueba',
  InstitucionAval: 'ITSAL', EstadoAval: 'avalado', AvalCodigoExterno: 'ITSAL-1',
  FechaInicio: '2026-09-01', FechaFin: '2026-09-02', Duracion: '40 horas',
  EntregableAval: { ID: 'AVAL-1', CodigoCertificado: 'RA-ITSAL-001',
    CertificateStatus: 'emitido', TemplateVersion: 'ra-itsal-security-2026-v1',
    PdfHash: 'a'.repeat(64), EstadoEntregaFinal: 'pendiente_envio' },
}

afterEach(() => { cleanup(); vi.clearAllMocks(); mock.admin = true })

const normalCertificate = {
  ID: 'CERT-NORMAL-1', CodigoCertificado: 'RA-NORMAL-001', CertificateStatus: 'emitido',
  CertificateVersion: 1, VersionHistory: [{ id: 'CERT-NORMAL-1', version: 1, pdfArchived: true }],
}

describe('entregable institucional ITSAL', () => {
  it('permite al admin descargar el PDF archivado y decidir explícitamente su envío', async () => {
    mock.getCertificadosAval.mockResolvedValue({ data: [row] })
    render(<CertificadosAvalView />)
    expect(await screen.findByText(/PDF oficial archivado/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Descargar avalado' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Enviar por correo' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Corregir versión' })).toBeTruthy()
  })

  it('muestra la emisión para instituciones distintas de ITSAL y no ofrece versionado fuera de alcance', async () => {
    mock.getCertificadosAval.mockResolvedValue({ data: [{
      ...row,
      ID: 'INS-DELTA-1',
      InstitucionAval: 'Instituto Delta',
      AvalCodigoExterno: 'DELTA-2026-001',
      EntregableAval: { ID: 'AVAL-DELTA-1', CodigoCertificado: 'RA-DELTA-001',
        CertificateStatus: 'pendiente_pdf', TemplateVersion: 'ra-institutional-aval-2026',
        EstadoEntregaFinal: 'pendiente_envio' },
    }] })
    render(<CertificadosAvalView />)
    expect(await screen.findAllByText('Instituto Delta')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Emitir y descargar avalado' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Corregir versión' })).toBeNull()
  })

  it('muestra el historial sin mezclar los PDF de cada versión', async () => {
    mock.getCertificadosAval.mockResolvedValue({ data: [{
      ...row,
      EntregableAval: { ...row.EntregableAval, VersionHistory: [
        { id: 'AVAL-OLD', version: 1, codigo: 'RA-ITSAL-OLD', estado: 'reemitido', templateVersion: 'aval-v1', issuedAt: '2026-09-01T12:00:00.000Z', issuedBy: 'admin.demo', reason: 'Corrección del código externo', pdfArchived: true },
        { id: 'AVAL-PENDING', version: 2, codigo: 'RA-ITSAL-PENDING', estado: 'pendiente_pdf', templateVersion: 'aval-v1', issuedAt: '2026-09-02T12:00:00.000Z', issuedBy: 'admin.demo', reason: 'Reemisión pendiente', pdfArchived: false },
      ] },
    }] })
    render(<CertificadosAvalView />)
    fireEvent.click(await screen.findByRole('button', { name: 'Historial aval (2)' }))
    expect(await screen.findByRole('heading', { name: 'Historial de versiones del aval' })).toBeTruthy()
    expect(screen.getByText('RA-ITSAL-OLD')).toBeTruthy()
    expect(screen.getByText('Corrección del código externo')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Descargar PDF original' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'PDF no archivado' })).toBeDisabled()
    expect(screen.getByRole('status').textContent).toContain('vigencia')
  })

  it('no expone emisión ni envío al rol institucional', async () => {
    mock.admin = false
    mock.getCertificadosAval.mockResolvedValue({ data: [{ ...row, EntregableAval: null }] })
    render(<CertificadosAvalView />)
    expect(await screen.findByText('Persona de Prueba')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Descargar avalado' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Enviar por correo' })).toBeNull()
  })

  it('configura el aval posterior solo tras confirmación explícita y presenta el certificado normal como intacto', async () => {
    mock.getCertificadosAval.mockResolvedValue({ data: [{
      ...row,
      EstadoAval: 'pendiente',
      AvalCodigoExterno: '',
      CertificadoNormal: normalCertificate,
      AvalUpgradeVerificado: true,
      AvalUpgradeCRMOrderID: 'CRM-UPGRADE-1',
      PuedeConfigurarAvalPosterior: true,
      EntregableAval: null,
    }] })
    mock.getOpcionesInstitucionesMaestras.mockResolvedValue({ data: [{ ID: 'INST-1', Nombre: 'Instituto de Prueba', Siglas: 'IP' }] })
    mock.getConveniosParaAval.mockResolvedValue({ data: [{ ID: 'CONV-1', Objeto: 'Convenio vigente', PorcentajeAval: 15, DisponibleParaAval: true }] })
    mock.configurarAvalPosteriorCertificado.mockResolvedValue({ data: { institutionName: 'Instituto de Prueba' } })
    render(<CertificadosAvalView />)

    fireEvent.click(await screen.findByRole('button', { name: 'Configurar aval posterior' }))
    expect(await screen.findByText(/El certificado normal se conservará sin cambios/)).toBeTruthy()
    expect(screen.getByText(/Certificado normal: RA-NORMAL-001/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Institución avaladora'), { target: { value: 'INST-1' } })
    expect(await screen.findByRole('option', { name: /Convenio vigente/ })).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Convenio vigente y regla económica'), { target: { value: 'CONV-1' } })
    const submit = screen.getByRole('button', { name: 'Continuar con el aval' })
    expect(submit).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox'))
    expect(submit).toBeEnabled()
    fireEvent.click(submit)

    expect(mock.configurarAvalPosteriorCertificado).toHaveBeenCalledWith('INS-ITSAL-1', {
      institucionId: 'INST-1', convenioId: 'CONV-1',
    })
    expect(await screen.findByText(/El certificado normal permanece intacto/)).toBeTruthy()
  })

  it('muestra el historial normal aislado y descarga la versión archivada desde su propio vínculo', async () => {
    mock.getCertificadosAval.mockResolvedValue({ data: [{
      ...row,
      CertificadoNormal: normalCertificate,
      EntregableAval: null,
    }] })
    mock.getHistorialCertificados.mockResolvedValue({ data: [{ id: 'CERT-NORMAL-1', codigo: 'RA-NORMAL-001', version: 1,
      estado: 'emitido', plantilla: 'normal-v1', fecha: '2026-09-01', actor: 'admin', motivo: '', pdfArchivado: true }] })
    render(<CertificadosAvalView />)
    fireEvent.click(await screen.findByRole('button', { name: /Historial \(1\)/ }))
    expect(await screen.findByRole('heading', { name: 'Historial del certificado normal' })).toBeTruthy()
    expect(screen.getByText('Este historial corresponde solo al certificado normal. Las versiones y archivos del certificado avalado se administran por separado.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Descargar PDF original' })).toBeTruthy()
  })
})
