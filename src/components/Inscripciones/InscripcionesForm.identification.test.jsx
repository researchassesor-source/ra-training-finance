import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import InscripcionesForm from './InscripcionesForm'

const apiMock = vi.hoisted(() => ({
  getServicios: vi.fn(async () => ({ data: [{ ID: 'SRV-1', Nombre: 'Curso demo', Precio: 20, Modalidad: 'Virtual', Activo: true }] })),
  getInstitucionesAval: vi.fn(async () => ({ data: [] })),
  getOpcionesInstitucionesMaestras: vi.fn(async () => ({ data: [{ ID: 'INST-1', Nombre: 'Instituto Demo', Siglas: 'ID' }] })),
  getConveniosParaAval: vi.fn(async () => ({ data: [{ ID: 'CONV-1', Objeto: 'Convenio vigente', PorcentajeAval: 15, BaseCalculoAval: 'precio_servicio', DisponibleParaAval: true }] })),
  addInscripcion: vi.fn(async () => ({ success: true })),
}))

vi.mock('../../services/api', () => ({ api: apiMock }))
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ isAdmin: false }) }))

function renderForm() {
  return render(<InscripcionesForm onSave={vi.fn()} onCancel={vi.fn()} />)
}

describe('InscripcionesForm — identificación textual', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => cleanup())

  it('usa input de texto y conserva el cero mientras se escribe', async () => {
    renderForm()
    const field = screen.getByLabelText('Identificación')
    await screen.findByRole('option', { name: /Curso demo/ })

    expect(field.type).toBe('text')
    expect(field.inputMode).toBe('numeric')
    fireEvent.change(field, { target: { value: '0601234560' } })
    expect(field.value).toBe('0601234560')
  })

  it('rechaza una cédula inválida en la interfaz antes de llamar al API', async () => {
    const { container } = renderForm()
    await screen.findByRole('option', { name: /Curso demo/ })
    const selects = screen.getAllByRole('combobox')
    fireEvent.change(selects[0], { target: { value: 'SRV-1' } })
    fireEvent.change(screen.getByPlaceholderText('Nombre y apellido'), { target: { value: 'Participante Demo' } })
    fireEvent.change(screen.getByLabelText('Identificación'), { target: { value: '0601234567' } })
    fireEvent.submit(container.querySelector('form'))

    expect(await screen.findByRole('alert')).toHaveTextContent(/dígito verificador/)
    expect(apiMock.addInscripcion).not.toHaveBeenCalled()
  })

  it('envía una cédula válida iniciada en cero como la misma cadena', async () => {
    const { container } = renderForm()
    await screen.findByRole('option', { name: /Curso demo/ })
    const selects = screen.getAllByRole('combobox')
    fireEvent.change(selects[0], { target: { value: 'SRV-1' } })
    fireEvent.change(screen.getByPlaceholderText('Nombre y apellido'), { target: { value: 'Participante Demo' } })
    fireEvent.change(screen.getByLabelText('Identificación'), { target: { value: '0601234560' } })
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '20' } })
    fireEvent.change(selects[selects.length - 1], { target: { value: 'Efectivo' } })
    fireEvent.submit(container.querySelector('form'))

    await waitFor(() => expect(apiMock.addInscripcion).toHaveBeenCalledTimes(1))
    expect(apiMock.addInscripcion.mock.calls[0][0]).toMatchObject({
      clienteID: '0601234560',
      clienteTipoIdentificacion: 'CEDULA_EC',
    })
  })

  it('al elegir consumidor final separa la facturación y establece el identificador SRI textual', async () => {
    renderForm()
    await screen.findByRole('option', { name: /Curso demo/ })
    fireEvent.click(screen.getByLabelText('Igual al participante'))
    fireEvent.change(screen.getByLabelText('Tipo de identificación fiscal'), {
      target: { value: 'CONSUMIDOR_FINAL' },
    })

    expect(screen.getByLabelText('Identificación fiscal')).toHaveValue('9999999999999')
    expect(screen.getByLabelText('Identificación fiscal')).toHaveAttribute('readonly')
    expect(screen.getByText(/tipo 07/)).toBeInTheDocument()
  })

  it('selecciona el aval desde la ficha maestra, no desde un campo de texto libre', async () => {
    renderForm()
    await screen.findByRole('option', { name: /Curso demo/ })
    fireEvent.click(screen.getByLabelText(/Aval institucional/))

    const institution = await screen.findByLabelText('Institución avaladora *')
    expect(institution.tagName).toBe('SELECT')
    fireEvent.change(institution, { target: { value: 'INST-1' } })
    expect(institution).toHaveValue('INST-1')
    expect(apiMock.getOpcionesInstitucionesMaestras).toHaveBeenCalled()
  })

  it('carga el convenio de esa institución y muestra la regla económica, no un monto editable', async () => {
    renderForm()
    await screen.findByRole('option', { name: /Curso demo/ })
    fireEvent.click(screen.getByLabelText(/Aval institucional/))
    const institution = await screen.findByLabelText('Institución avaladora *')
    fireEvent.change(institution, { target: { value: 'INST-1' } })

    expect(await screen.findByLabelText('Convenio aplicable *')).toHaveValue('')
    expect(apiMock.getConveniosParaAval).toHaveBeenCalledWith('INST-1', '')
    expect(screen.getByRole('option', { name: /Convenio vigente · 15%/ })).toBeInTheDocument()
    expect(screen.getByText(/La regla vigente se comprobará de nuevo al confirmar/)).toBeInTheDocument()
  })
})
