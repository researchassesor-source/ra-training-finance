import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { api } from '../services/api'
import { hasRole } from '../utils/roles'
import { SESSION_EXPIRED_EVENT } from '../utils/sessionEvents'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const s = localStorage.getItem('rat_user')
      return s ? JSON.parse(s) : null
    } catch { return null }
  })

  useEffect(() => {
    const clearLocalSession = () => {
      localStorage.removeItem('rat_token')
      localStorage.removeItem('rat_user')
      setUser(null)
    }
    const onSessionExpired = event => {
      const failedToken = event.detail?.token
      if (failedToken && localStorage.getItem('rat_token') !== failedToken) return
      clearLocalSession()
    }
    const onStorage = event => {
      if (event.key !== 'rat_token' && event.key !== 'rat_user') return
      if (!localStorage.getItem('rat_token')) {
        clearLocalSession()
        return
      }
      if (event.key === 'rat_user') {
        try {
          const stored = localStorage.getItem('rat_user')
          setUser(stored ? JSON.parse(stored) : null)
        } catch {
          clearLocalSession()
        }
      }
    }

    window.addEventListener(SESSION_EXPIRED_EVENT, onSessionExpired)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(SESSION_EXPIRED_EVENT, onSessionExpired)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

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

  const isAdmin    = hasRole(user, 'admin')
  const isVendedor = hasRole(user, 'vendedor') || isAdmin
  const isAval     = hasRole(user, 'aval')
  const isContador = hasRole(user, 'contador')
  const isMoodle   = hasRole(user, 'moodle')

  return (
    <AuthContext.Provider value={{ user, isAdmin, isVendedor, isAval, isContador, isMoodle, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
