import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const state = vi.hoisted(() => ({
  user: { rol: 'admin', username: 'admin', nombre: 'Admin' },
}))

vi.mock('./context/AuthContext', () => ({
  AuthProvider: ({ children }) => children,
  useAuth: () => ({
    user: state.user,
    isAdmin: state.user?.rol === 'admin',
    isVendedor: state.user?.rol === 'vendedor' || state.user?.rol === 'admin',
    isAval: state.user?.rol === 'aval',
    isContador: state.user?.rol === 'contador',
  }),
}))

vi.mock('./layout/Layout', async () => {
  const { Outlet } = await vi.importActual('react-router-dom')
  return { default: () => <div><nav>Layout</nav><Outlet /></div> }
})

vi.mock('./components/Facturacion/FacturacionView', () => ({
  default: () => <div>Vista de Facturación</div>,
}))

describe('ruta /facturacion', () => {
  afterEach(() => cleanup())

  it('queda disponible para administrador', () => {
    state.user = { rol: 'admin', username: 'admin' }
    render(<MemoryRouter initialEntries={['/facturacion']}><App /></MemoryRouter>)
    expect(screen.getByText('Vista de Facturación')).toBeInTheDocument()
  })

  it('bloquea al vendedor', () => {
    state.user = { rol: 'vendedor', username: 'seller' }
    render(<MemoryRouter initialEntries={['/facturacion']}><App /></MemoryRouter>)
    expect(screen.queryByText('Vista de Facturación')).not.toBeInTheDocument()
  })

  it('queda disponible para contador en modo lectura operativa', () => {
    state.user = { rol: 'contador', username: 'contador' }
    render(<MemoryRouter initialEntries={['/facturacion']}><App /></MemoryRouter>)
    expect(screen.getByText('Vista de Facturación')).toBeInTheDocument()
  })
})
