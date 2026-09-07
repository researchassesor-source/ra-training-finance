import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Sidebar from './Sidebar'

const state = vi.hoisted(() => ({
  role: 'admin',
  roles: null,
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: () => {
    const roles = state.roles || [state.role]
    return {
      user: { rol: state.role, roles, username: state.role },
      isAdmin: roles.includes('admin'),
      isVendedor: roles.includes('vendedor') || roles.includes('admin'),
      isAval: roles.includes('aval'),
      isContador: roles.includes('contador'),
      isMoodle: roles.includes('moodle'),
    }
  },
}))

vi.mock('../assets/brand/logo-ra-training.webp', () => ({ default: '/logo.webp' }))

describe('Sidebar facturación', () => {
  afterEach(() => cleanup())

  it('muestra Facturación al administrador', () => {
    state.role = 'admin'
    state.roles = null
    render(<MemoryRouter><Sidebar open onClose={() => {}} /></MemoryRouter>)
    expect(screen.getByText('Facturación')).toBeInTheDocument()
  })

  it('no muestra Facturación al vendedor', () => {
    state.role = 'vendedor'
    state.roles = null
    render(<MemoryRouter><Sidebar open onClose={() => {}} /></MemoryRouter>)
    expect(screen.queryByText('Facturación')).not.toBeInTheDocument()
  })

  it('combina permisos de vendedor y moodle sin ocultar flujos', () => {
    state.role = 'vendedor'
    state.roles = ['vendedor', 'moodle']
    render(<MemoryRouter><Sidebar open onClose={() => {}} /></MemoryRouter>)
    expect(screen.getByText('Mi Plan Semanal')).toBeInTheDocument()
    expect(screen.getByText('Inscripciones')).toBeInTheDocument()
  })
})
