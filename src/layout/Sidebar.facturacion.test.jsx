import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Sidebar from './Sidebar'

const state = vi.hoisted(() => ({
  role: 'admin',
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { rol: state.role, username: state.role },
    isAdmin: state.role === 'admin',
    isVendedor: state.role === 'vendedor' || state.role === 'admin',
    isAval: state.role === 'aval',
  }),
}))

vi.mock('../assets/brand/logo-ra-training.webp', () => ({ default: '/logo.webp' }))

describe('Sidebar facturación', () => {
  afterEach(() => cleanup())

  it('muestra Facturación al administrador', () => {
    state.role = 'admin'
    render(<MemoryRouter><Sidebar open onClose={() => {}} /></MemoryRouter>)
    expect(screen.getByText('Facturación')).toBeInTheDocument()
  })

  it('no muestra Facturación al vendedor', () => {
    state.role = 'vendedor'
    render(<MemoryRouter><Sidebar open onClose={() => {}} /></MemoryRouter>)
    expect(screen.queryByText('Facturación')).not.toBeInTheDocument()
  })
})
