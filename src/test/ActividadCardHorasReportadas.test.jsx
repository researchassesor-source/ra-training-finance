// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ActividadCard } from '../components/Flujos/FlujosView'

afterEach(cleanup)

const actividadPendiente = {
  ID: 'ACT-HOURS-UI',
  Titulo: 'Revisar asistencia',
  Descripcion: 'Comparar las marcas de entrada y salida.',
  DiaSemana: 'Martes',
  HorasEstimadas: 4,
  HorasReales: 0,
  Estado: 'completado',
  EstadoRevision: 'pendiente_revision',
  Checklist: '[]',
  Imagenes: '[]',
  Evidencia: 'https://drive.google.com/evidencia',
}

describe('edición de horas reportadas', () => {
  it('muestra la corrección solo pendiente y conserva la revisión sin aprobar', async () => {
    const onUpdate = vi.fn().mockResolvedValue(true)
    render(<ActividadCard act={actividadPendiente} isAdmin={false} onUpdate={onUpdate} onDelete={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Editar horas reportadas' }))
    expect(screen.getByText(/seguirá pendiente de revisión administrativa/i)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Horas reportadas'), { target: { value: '4' } })
    fireEvent.change(screen.getByLabelText('Minutos reportados'), { target: { value: '20' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar horas reportadas' }))

    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith('ACT-HOURS-UI', {
      horasReales: 4.33,
      notas: '',
    }))
    expect(onUpdate.mock.calls[0][1]).not.toHaveProperty('estadoRevision')
  })

  it('no ofrece la corrección cuando las horas ya están aprobadas', () => {
    render(<ActividadCard
      act={{ ...actividadPendiente, EstadoRevision: 'aprobado', HorasAprobadas: 4 }}
      isAdmin={false}
      onUpdate={vi.fn()}
      onDelete={vi.fn()}
    />)

    expect(screen.queryByRole('button', { name: 'Editar horas reportadas' })).toBeNull()
  })

  it('precarga las horas reportadas redondeadas en el campo de revisión', () => {
    render(<ActividadCard act={{ ...actividadPendiente, HorasReales: 4 + 17 / 60 }} isAdmin onUpdate={vi.fn()} onDelete={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Revisión admin' }))
    expect(screen.getByLabelText('Horas que se aprueban').value).toBe('4.28')
  })

  it('muestra horas reportadas y aprobadas con máximo dos decimales', () => {
    render(<ActividadCard
      act={{ ...actividadPendiente, HorasReales: 4 + 17 / 60, EstadoRevision: 'aprobado', HorasAprobadas: 5 + 45 / 60 }}
      isAdmin={false}
      onUpdate={vi.fn()}
      onDelete={vi.fn()}
    />)

    expect(screen.getByText('4.28h reales')).toBeTruthy()
    expect(screen.getByText('5.75h aprobadas')).toBeTruthy()
  })

  it('redondea las horas aprobadas a dos decimales antes de guardar', async () => {
    const onUpdate = vi.fn().mockResolvedValue(true)
    render(<ActividadCard
      act={{ ...actividadPendiente, HorasReales: 4 + 17 / 60 }}
      isAdmin
      onUpdate={onUpdate}
      onDelete={vi.fn()}
    />)

    fireEvent.click(screen.getByRole('button', { name: 'Revisión admin' }))
    fireEvent.change(screen.getByLabelText('Horas que se aprueban'), { target: { value: '4.287' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aprobar horas' }))

    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith('ACT-HOURS-UI', expect.objectContaining({
      estadoRevision: 'aprobado',
      horasAprobadas: 4.29,
    })))
  })
})
