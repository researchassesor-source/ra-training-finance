import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import VerificarCertificado from './VerificarCertificado'

const state = vi.hoisted(() => ({ response: null }))

vi.mock('../../services/api', () => ({
  api: {
    verificarCertificado: vi.fn(async () => state.response),
  },
}))

function renderVerification(id = 'CRT-DEMO') {
  return render(
    <MemoryRouter initialEntries={[`/verificar/${id}`]}>
      <Routes><Route path="/verificar/:id" element={<VerificarCertificado />} /></Routes>
    </MemoryRouter>,
  )
}

const base = {
  codigo: 'RA-2026-DEMO',
  identificador: 'CRT-DEMO',
  nombre: 'Participante de Prueba',
  servicio: 'Curso de Prueba',
  duracion: '40 horas académicas',
  modalidad: 'Virtual',
  fechaInicio: '2026-07-01',
  fechaFin: '2026-07-02',
  fechaEmision: '2026-07-03',
  version: 1,
}

afterEach(() => cleanup())

describe('verificación histórica de certificados', () => {
  it('muestra claramente un certificado anulado sin ocultar su existencia', async () => {
    state.response = { valido: true, data: { ...base, estado: 'anulado' } }
    renderVerification()
    expect(await screen.findByRole('heading', { name: 'CERTIFICADO ANULADO' })).toBeInTheDocument()
    expect(screen.getByText(/ya no se encuentra vigente/i)).toBeInTheDocument()
    expect(screen.getByText('Participante de Prueba')).toBeInTheDocument()
  })

  it('muestra la reemisión y enlaza al identificador vigente', async () => {
    state.response = { valido: true, data: { ...base, estado: 'reemitido', certificadoVigenteId: 'CRT-V2' } }
    renderVerification()
    expect(await screen.findByRole('heading', { name: 'CERTIFICADO REEMITIDO' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Consultar certificado vigente' })).toHaveAttribute('href', '/verificar/CRT-V2')
  })

  it.each([
    ['certificado_normal', 'Certificado normal'],
    ['certificado_avalado', 'Certificado con aval institucional'],
  ])('distingue públicamente la variante %s sin confundirla con una versión', async (tipoDocumento, label) => {
    state.response = { valido: true, data: { ...base, estado: 'vigente', tipoDocumento, version: 2 } }
    renderVerification()
    expect(await screen.findByText(label)).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText(/Tipo de documento/)).toBeInTheDocument()
  })
})
