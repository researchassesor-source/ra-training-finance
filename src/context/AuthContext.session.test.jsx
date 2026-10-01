import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { AuthProvider, useAuth } from './AuthContext'
import { api } from '../services/api'
import { notifySessionExpired } from '../utils/sessionEvents'

function SessionLabel() {
  const { user } = useAuth()
  return <span>{user?.username || 'sin sesión'}</span>
}

function renderSession() {
  return render(<AuthProvider><SessionLabel /></AuthProvider>)
}

function seedSession(user = { username: 'angel', rol: 'vendedor' }) {
  localStorage.setItem('rat_token', 'session-token')
  localStorage.setItem('rat_user', JSON.stringify(user))
}

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.unstubAllGlobals()
})

describe('AuthContext: sesión expirada y varias pestañas', () => {
  it('cierra la sesión local cuando Apps Script confirma que el token expiró', async () => {
    seedSession()
    renderSession()
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ success: false, error: 'Sesión inválida o expirada. Por favor inicia sesión de nuevo.' }),
    })))

    await act(async () => {
      await expect(api.getAsistencia()).rejects.toThrow(/sesión inválida o expirada/i)
    })

    expect(screen.getByText('sin sesión')).toBeInTheDocument()
    expect(localStorage.getItem('rat_token')).toBeNull()
    expect(localStorage.getItem('rat_user')).toBeNull()
  })

  it('cierra la sesión cuando una descarga fiscal recibe 401 y mantiene el token fuera de la URL', async () => {
    seedSession()
    renderSession()
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({ success: false, error: 'Sesión inválida o expirada. Por favor inicia sesión de nuevo.' }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    await act(async () => {
      await expect(api.descargarDocumentoFiscal('FACT-1', 'RIDE')).rejects.toThrow(/sesión inválida o expirada/i)
    })

    expect(screen.getByText('sin sesión')).toBeInTheDocument()
    expect(fetchMock.mock.calls[0][0]).toBe('/api/fiscal/document?facturaId=FACT-1&tipo=RIDE')
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer session-token')
    expect(localStorage.getItem('rat_token')).toBeNull()
  })

  it('no cierra una sesión válida cuando el servidor responde una denegación de permisos', async () => {
    seedSession()
    renderSession()
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ success: false, error: 'Acceso denegado: se requiere rol de administrador.' }),
    })))

    await act(async () => {
      await expect(api.getAsistencia()).rejects.toThrow(/acceso denegado/i)
    })

    expect(screen.getByText('angel')).toBeInTheDocument()
    expect(localStorage.getItem('rat_token')).toBe('session-token')
  })

  it('no borra una sesión nueva si una respuesta tardía pertenece al token anterior', () => {
    seedSession({ username: 'alexandra', rol: 'admin' })
    renderSession()
    localStorage.setItem('rat_token', 'session-token-new')

    act(() => notifySessionExpired('session-token-old'))

    expect(screen.getByText('alexandra')).toBeInTheDocument()
    expect(localStorage.getItem('rat_token')).toBe('session-token-new')
  })

  it('sincroniza el usuario actualizado entre pestañas y cierra la sesión si otra pestaña sale', () => {
    seedSession()
    renderSession()

    act(() => {
      localStorage.setItem('rat_user', JSON.stringify({ username: 'alexandra', rol: 'admin' }))
      window.dispatchEvent(new StorageEvent('storage', { key: 'rat_user', newValue: localStorage.getItem('rat_user') }))
    })
    expect(screen.getByText('alexandra')).toBeInTheDocument()

    act(() => {
      localStorage.removeItem('rat_token')
      window.dispatchEvent(new StorageEvent('storage', { key: 'rat_token', oldValue: 'session-token', newValue: null }))
    })
    expect(screen.getByText('sin sesión')).toBeInTheDocument()
  })
})
