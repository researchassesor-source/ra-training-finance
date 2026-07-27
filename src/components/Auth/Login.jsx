import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Award, Eye, EyeOff, ShieldCheck } from 'lucide-react'
import logo from '../../assets/brand/logo-ra-training.webp'
import mascot from '../../assets/brand/mascot-ra-training.webp'
import { BRAND } from '../../config/brand'

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
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-brand-950 via-brand-800 to-brand-700 lg:flex lg:w-1/2 flex-col justify-center items-center p-12 text-white">
        <div className="absolute -left-28 -top-28 h-72 w-72 rounded-full border-[32px] border-secondary-500/20" aria-hidden="true" />
        <div className="relative z-10 max-w-lg text-center">
          <img src={logo} alt="Símbolo oficial de R.A. Training" className="mx-auto mb-5 h-24 w-auto object-contain" />
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-secondary-300">{BRAND.matrixName}</p>
          <h1 className="mt-2 text-4xl font-bold">{BRAND.appName}</h1>
          <p className="mt-3 text-lg text-brand-100">{BRAND.subtitle}</p>
          <div className="mt-8 grid grid-cols-3 gap-4 text-center">
            {[['Ingresos', 'Control financiero'], ['Certificados', 'Emisión verificable'], ['Auditoría', 'Trazabilidad']].map(([t, s]) => (
              <div key={t} className="rounded-xl border border-white/10 bg-white/10 p-4 backdrop-blur-sm">
                <p className="font-semibold">{t}</p>
                <p className="text-xs text-brand-200 mt-1">{s}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 inline-flex items-center gap-2 rounded-full border border-secondary-300/40 bg-secondary-500 px-4 py-2 text-sm font-semibold text-brand-950">
            <ShieldCheck size={17} aria-hidden="true" /> Gestión segura y centralizada
          </div>
        </div>
        <div className="absolute bottom-0 right-5 h-44 w-32 overflow-hidden rounded-t-3xl bg-slate-950 shadow-2xl" aria-hidden="true">
          <img src={mascot} alt="" className="h-full w-full object-cover object-top" />
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-8 bg-gray-50">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8 lg:hidden">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-800 p-2 shadow-lg">
              <img src={logo} alt="Símbolo oficial de R.A. Training" className="h-full w-auto object-contain" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">{BRAND.fullName}</h1>
            <p className="text-gray-500 text-sm">{BRAND.subtitle}</p>
          </div>

          <div className="card shadow-lg">
            <div className="mb-6 flex items-center gap-2">
              <Award className="text-secondary-600" size={22} aria-hidden="true" />
              <h2 className="text-xl font-semibold text-gray-900">Iniciar sesión</h2>
            </div>
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
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded text-gray-400 hover:text-gray-600"
                    aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
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
            {BRAND.fullName} &copy; {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </div>
  )
}
