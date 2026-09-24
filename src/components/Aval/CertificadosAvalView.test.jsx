import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CertificadosAvalView from './CertificadosAvalView'

const mock = vi.hoisted(() => ({
  admin: true,
  getCertificadosAval: vi.fn(),
}))

vi.mock('../../services/api', () => ({ api: { getCertificadosAval: mock.getCertificadosAval } }))
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ isAdmin: mock.admin }) }))

const row = {
  ID: 'INS-ITSAL-1', ClienteNombre: 'Persona de Prueba', ClienteID: '0100000001',
  ClienteEmail: 'persona@example.com', ServicioNombre: 'Curso de Prueba',
  InstitucionAval: 'ITSAL', EstadoAval: 'avalado', AvalCodigoExterno: 'ITSAL-1',
  FechaInicio: '2026-09-01', FechaFin: '2026-09-02', Duracion: '40 horas',
  EntregableAval: { ID: 'AVAL-1', CodigoCertificado: 'RA-ITSAL-001',
    CertificateStatus: 'emitido', PdfHash: 'a'.repeat(64), EstadoEntregaFinal: 'pendiente_envio' },
}

afterEach(() => { cleanup(); vi.clearAllMocks(); mock.admin = true })

describe('entregable institucional ITSAL', () => {
  it('permite al admin descargar el PDF archivado y decidir explícitamente su envío', async () => {
    mock.getCertificadosAval.mockResolvedValue({ data: [row] })
    render(<CertificadosAvalView />)
    expect(await screen.findByText(/PDF oficial archivado/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Descargar' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Enviar por correo' })).toBeTruthy()
  })

  it('no expone emisión ni envío al rol institucional', async () => {
    mock.admin = false
    mock.getCertificadosAval.mockResolvedValue({ data: [{ ...row, EntregableAval: null }] })
    render(<CertificadosAvalView />)
    expect(await screen.findByText('Persona de Prueba')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Descargar' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Enviar por correo' })).toBeNull()
  })
})
