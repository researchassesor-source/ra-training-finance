import { createContext, useContext, useState, useCallback } from 'react'
import { api } from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const s = localStorage.getItem('rat_user')
      return s ? JSON.parse(s) : null
    } catch { return null }
  })

  const login = useCallback(async (username, password) => {
    const res = await api.login(username, password)
    localStorage.setItem('rat_token', res.token)
    localStorage.setItem('rat_user', JSON.stringify(res.user))
    setUser(res.user)
    return res.user
  }, [])

  const logout = useCallback(async () => {
    try { await api.logout() } catch { /* ignore */ }
    localStorage.removeItem('rat_token')
    localStorage.removeItem('rat_user')
    setUser(null)
  }, [])

  const isAdmin    = user?.rol === 'admin'
  const isVendedor = user?.rol === 'vendedor' || user?.rol === 'admin'
  const isAval     = user?.rol === 'aval'

  return (
    <AuthContext.Provider value={{ user, isAdmin, isVendedor, isAval, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
