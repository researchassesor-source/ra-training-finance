import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ServiciosView from './ServiciosView'

const apiMock = vi.hoisted(() => ({
  getServicios: vi.fn(async () => ({ data: [{
    ID: 'SRV-1', Nombre: 'Seminario de Derecho', Tipo: 'Evento', Modalidad: 'Virtual',
    Duracion: '40 horas', FechaEvento: '2026-09-05', FechaFinEvento: '2026-09-07',
    Capacitador: 'Docente de Prueba', CapacitadorID: 'CAP-1', Activo: true,
  }] })),
  getCapacitadores: vi.fn(async () => ({ data: [] })),
  preflightCertificadoCapacitador: vi.fn(async () => ({ data: {
    nombre: 'Docente de Prueba', identificacion: '0100000001', curso: 'Seminario de Derecho',
    duracion: '40 horas', modalidad: 'Virtual', fechaInicio: '2026-09-05',
    fechaFin: '2026-09-07', resumen: 'Experiencia acreditada.', datosCompletos: true,
    bloqueosDatos: [], emisionHabilitada: false,
    bloqueoEmision: 'Faltan firmas auténticas y activación del circuito profesional.',
  } })),
}))

vi.mock('../../services/api', () => ({ api: apiMock }))
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ isAdmin: true }) }))

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('preparación de certificados de capacitador', () => {
  it('muestra los datos leídos del backend y conserva bloqueada la emisión', async () => {
    render(<ServiciosView />)
    fireEvent.click(await screen.findByRole('button', { name: /Revisar certificado de capacitador/i }))
    await waitFor(() => expect(apiMock.preflightCertificadoCapacitador).toHaveBeenCalledWith('SRV-1'))
    expect(screen.getByText(/Datos del curso completos/)).toBeTruthy()
    expect(screen.getByText(/Emisión bloqueada:/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Emitir certificado/i })).toBeNull()
  })
})
