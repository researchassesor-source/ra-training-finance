import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import InstitucionesView from './InstitucionesView'

const mock = vi.hoisted(() => ({
  institutions: [],
  detail: null,
  getInstitucionesMaestras: vi.fn(),
  getInstitucionMaestra: vi.fn(),
  addInstitucionMaestra: vi.fn(),
  updateInstitucionMaestra: vi.fn(),
  archivarInstitucionMaestra: vi.fn(),
  addAutoridadInstitucion: vi.fn(),
  updateAutoridadInstitucion: vi.fn(),
  archivarAutoridadInstitucion: vi.fn(),
  addActivoInstitucion: vi.fn(),
  addDocumentoInstitucion: vi.fn(),
  getArchivoInstitucionPrivado: vi.fn(),
}))

vi.mock('../../services/api', () => ({ api: mock }))

function institution(overrides = {}) {
  return { ID: 'INS-1', Nombre: 'Instituto Superior Uno', Siglas: 'ISU', Tipo: 'Instituto',
    Identificacion: '0691783737001', Estado: 'activo', TotalConvenios: 1, ...overrides }
}

function institutionDetail(overrides = {}) {
  return {
    institucion: institution(),
    completitudCertificacionFutura: { listoParaCertificacionFutura: false, faltantes: ['Falta una firma vigente'] },
    autoridades: [], activos: [], convenios: [], documentos: [],
    ...overrides,
  }
}

beforeEach(() => {
  mock.institutions = []
  mock.detail = null
  mock.getInstitucionesMaestras.mockReset()
  mock.getInstitucionMaestra.mockReset()
  mock.addInstitucionMaestra.mockReset()
  mock.getInstitucionesMaestras.mockImplementation(async () => ({ data: mock.institutions }))
  mock.getInstitucionMaestra.mockImplementation(async () => ({ data: mock.detail }))
  mock.addInstitucionMaestra.mockImplementation(async data => {
    const saved = institution({ ID: 'INS-NEW', Nombre: data.nombre, Siglas: data.siglas, Estado: data.estado })
    mock.institutions = [...mock.institutions, saved]
    return { success: true, id: saved.ID }
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('ficha maestra institucional', () => {
  it('crea una ficha y la muestra después de volver a cargar el listado', async () => {
    render(<InstitucionesView />)
    await screen.findByText('Aún no hay instituciones registradas.')
    fireEvent.click(screen.getByRole('button', { name: /nueva institución/i }))
    fireEvent.change(screen.getByLabelText('Nombre institucional *'), { target: { value: 'Instituto Tecnológico Nuevo' } })
    fireEvent.change(screen.getByLabelText('Siglas / nombre corto'), { target: { value: 'ITN' } })
    fireEvent.click(screen.getByRole('button', { name: 'Crear ficha institucional' }))

    await waitFor(() => expect(mock.addInstitucionMaestra).toHaveBeenCalledWith(
      expect.objectContaining({ nombre: 'Instituto Tecnológico Nuevo', siglas: 'ITN' }), false))
    expect(await screen.findByText('Instituto Tecnológico Nuevo')).toBeTruthy()
    expect(mock.getInstitucionesMaestras).toHaveBeenCalledTimes(2)
  })

  it('permite consultar convenios y documentos asociados desde la ficha', async () => {
    mock.institutions = [institution()]
    mock.detail = institutionDetail({
      convenios: [{ ID: 'CVN-1', Objeto: 'Cooperación académica', Estado: 'activo', FechaInicio: '2026-01-01' }],
      documentos: [{ ID: 'DOC-1', NombreArchivo: 'Convenio firmado.pdf', Tipo: 'convenio' }],
    })
    render(<InstitucionesView />)
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir ficha' }))

    expect(await screen.findByText('Cooperación académica')).toBeTruthy()
    expect(screen.getByText('Convenio firmado.pdf')).toBeTruthy()
    expect(mock.getInstitucionMaestra).toHaveBeenCalledWith('INS-1')
  })

  it('no ofrece firmas de autoridades cuyo periodo de vigencia terminó', async () => {
    mock.institutions = [institution()]
    mock.detail = institutionDetail({ autoridades: [
      { ID: 'AUTH-EXPIRED', Nombre: 'Autoridad Anterior', Cargo: 'Director', Estado: 'activo',
        FirmaCertificados: true, VigenteAhora: false },
      { ID: 'AUTH-CURRENT', Nombre: 'Autoridad Vigente', Cargo: 'Rectora', Estado: 'activo',
        FirmaCertificados: true, VigenteAhora: true },
    ] })
    render(<InstitucionesView />)
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir ficha' }))
    await screen.findByText('Autoridades')
    fireEvent.click(screen.getByRole('button', { name: 'Cargar recurso' }))
    fireEvent.change(screen.getByLabelText('Qué desea guardar'), { target: { value: 'firma' } })

    const authoritySelect = screen.getByLabelText('Autoridad dueña de la firma *')
    expect(within(authoritySelect).queryByRole('option', { name: /Autoridad Anterior/ })).toBeNull()
    expect(within(authoritySelect).getByRole('option', { name: /Autoridad Vigente/ })).toBeTruthy()
  })
})
