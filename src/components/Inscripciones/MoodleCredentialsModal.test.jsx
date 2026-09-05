import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import MoodleCredentialsModal from './MoodleCredentialsModal'

const apiMock = vi.hoisted(() => ({
  updateMoodleCredentials: vi.fn(async (_id, moodle) => ({
    success: true,
    status: 'cargado',
    data: { ID: 'INS-1', MoodleUsername: moodle.username, MoodleUrl: moodle.url, MoodleStatus: 'cargado' },
  })),
  registrarEnvioMoodle: vi.fn(async () => ({ success: true, status: 'preparado', data: { ID: 'INS-1', MoodleStatus: 'preparado' } })),
}))

vi.mock('../../services/api', () => ({ api: apiMock }))

const enrollment = {
  ID: 'INS-1',
  ClienteNombre: 'Andrea Salazar',
  ClienteTelefono: '0999999999',
  ServicioNombre: 'Curso Demo',
  MoodleStatus: 'pendiente',
}

describe('MoodleCredentialsModal', () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks() })

  it('permite cargar acceso y deja claro que administración controla el envío', async () => {
    const onUpdated = vi.fn()
    render(<MoodleCredentialsModal inscripcion={enrollment} isAdmin={false} onClose={vi.fn()} onUpdated={onUpdated} />)

    expect(screen.getByText('Acceso al aula virtual Moodle')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Preparar WhatsApp' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Copiar' })).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Usuario Moodle *'), { target: { value: 'andrea.moodle' } })
    fireEvent.change(screen.getByLabelText('Contraseña Moodle *'), { target: { value: 'Temporal-2026!' } })
    fireEvent.change(screen.getByLabelText('URL del aula virtual *'), { target: { value: 'https://aula.example.test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar acceso' }))

    await waitFor(() => expect(apiMock.updateMoodleCredentials).toHaveBeenCalledWith('INS-1', {
      username: 'andrea.moodle', password: 'Temporal-2026!', url: 'https://aula.example.test', notes: '',
    }))
    expect(onUpdated).toHaveBeenCalled()
    expect(screen.getByText(/administrador revisará/)).toBeInTheDocument()
  })

  it('permite al administrador preparar WhatsApp solo después de completar el acceso', async () => {
    vi.spyOn(window, 'open').mockReturnValue({ closed: false })
    render(<MoodleCredentialsModal inscripcion={enrollment} isAdmin onClose={vi.fn()} onUpdated={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Usuario Moodle *'), { target: { value: 'andrea.moodle' } })
    fireEvent.change(screen.getByLabelText('Contraseña Moodle *'), { target: { value: 'Temporal-2026!' } })
    fireEvent.change(screen.getByLabelText('URL del aula virtual *'), { target: { value: 'https://aula.example.test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Preparar WhatsApp' }))

    await waitFor(() => expect(apiMock.registrarEnvioMoodle).toHaveBeenCalledWith('INS-1'))
    expect(window.open).toHaveBeenCalledWith(expect.stringContaining('wa.me/593999999999'), '_blank', 'noopener,noreferrer')
  })
})
