import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Eye, EyeOff, TrendingUp } from 'lucide-react'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [form, setForm]   = useState({ username: '', password: '' })
  const [show, setShow]   = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(form.username, form.password)
      // HomeRedirect (en "/") decide el destino correcto según el rol
      navigate('/')
    } catch (err) {
      setError(err.message || 'Usuario o contraseña incorrectos')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-brand-800 flex-col justify-center items-center p-12 text-white">
        <div className="max-w-md text-center">
          <div className="w-20 h-20 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <TrendingUp size={40} className="text-amber-400" />
          </div>
          <h1 className="text-3xl font-bold mb-4">R.A. Training</h1>
          <p className="text-brand-100 text-lg mb-8">Sistema de Gestión Financiera</p>
          <div className="grid grid-cols-3 gap-4 text-center">
            {[['Ingresos', 'Control de entradas'], ['Egresos', 'Gestión de gastos'], ['Proyecciones', 'Visión de futuro']].map(([t, s]) => (
              <div key={t} className="bg-white/10 rounded-xl p-4">
                <p className="font-semibold">{t}</p>
                <p className="text-xs text-brand-200 mt-1">{s}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-8 bg-gray-50">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8 lg:hidden">
            <div className="w-14 h-14 bg-brand-700 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <TrendingUp size={28} className="text-amber-400" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">R.A. Training</h1>
            <p className="text-gray-500 text-sm">Gestión Financiera</p>
          </div>

          <div className="card shadow-lg">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">Iniciar sesión</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label">Usuario</label>
                <input
                  className="input"
                  type="text"
                  placeholder="nombre.usuario"
                  value={form.username}
                  onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                  required autoFocus
                />
              </div>
              <div>
                <label className="label">Contraseña</label>
                <div className="relative">
                  <input
                    className="input pr-10"
                    type={show ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    required
                  />
                  <button type="button" onClick={() => setShow(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {show ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
                  {error}
                </div>
              )}

              <button type="submit" className="btn-primary w-full justify-center py-2.5" disabled={loading}>
                {loading ? 'Verificando...' : 'Entrar'}
              </button>
            </form>
          </div>

          <p className="text-center text-xs text-gray-400 mt-6">
            R.A. Training Finance &copy; {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </div>
  )
}
