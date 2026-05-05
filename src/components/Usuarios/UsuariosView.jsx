import { useEffect, useState, useCallback } from 'react'
import { api } from '../../services/api'
import { fmt } from '../../utils/formatters'
import Modal from '../UI/Modal'
import Spinner from '../UI/Spinner'
import { Plus, Pencil, UserCheck, UserX } from 'lucide-react'

const EMPTY = { nombre: '', email: '', username: '', password: '', rol: 'usuario', activo: true }

function mapInitial(initial) {
  if (!initial) return EMPTY
  return {
    nombre:   initial.Nombre   || initial.nombre   || '',
    email:    initial.Email    || initial.email    || '',
    username: initial.Username || initial.username || '',
    password: '',
    rol:      initial.Rol      || initial.rol      || 'usuario',
    activo:   initial.Activo === true || initial.Activo === 'TRUE' || initial.activo === true,
  }
}

function UsuarioForm({ initial, onSave, onCancel }) {
  const [form, setForm]   = useState(() => mapInitial(initial))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit(e) {
    e.preventDefault()
    if (!initial && !form.password) { setError('La contraseña es requerida'); return }
    setSaving(true)
    setError('')
    try {
      if (initial?.ID) await api.updateUsuario(initial.ID, form)
      else await api.addUsuario(form)
      onSave()
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className="label">Nombre completo *</label>
          <input className="input" required value={form.nombre}
            onChange={e => set('nombre', e.target.value)} placeholder="Nombre y apellido" />
        </div>
        <div>
          <label className="label">Email</label>
          <input className="input" type="email" value={form.email}
            onChange={e => set('email', e.target.value)} placeholder="correo@empresa.com" />
        </div>
        <div>
          <label className="label">Nombre de usuario *</label>
          <input className="input" required value={form.username}
            onChange={e => set('username', e.target.value.toLowerCase().replace(/\s/g,''))}
            placeholder="usuario.apellido" disabled={!!initial} />
        </div>
        <div>
          <label className="label">{initial ? 'Nueva Contraseña (dejar vacío para mantener)' : 'Contraseña *'}</label>
          <input className="input" type="password" value={form.password}
            onChange={e => set('password', e.target.value)} placeholder="••••••••" />
        </div>
        <div>
          <label className="label">Rol</label>
          <select className="input" value={form.rol} onChange={e => set('rol', e.target.value)}>
            <option value="usuario">Usuario (solo gastos)</option>
            <option value="vendedor">Vendedor (ingresos + gastos + inscripciones)</option>
            <option value="admin">Administrador (acceso total)</option>
          </select>
        </div>
        {initial && (
          <div className="flex items-center gap-3">
            <input type="checkbox" id="activo" checked={form.activo}
              onChange={e => set('activo', e.target.checked)} className="w-4 h-4 accent-brand-600" />
            <label htmlFor="activo" className="text-sm text-gray-700">Usuario activo</label>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}
      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onCancel} className="btn-secondary flex-1">Cancelar</button>
        <button type="submit" className="btn-primary flex-1" disabled={saving}>
          {saving ? 'Guardando...' : initial?.ID ? 'Actualizar' : 'Crear Usuario'}
        </button>
      </div>
    </form>
  )
}

export default function UsuariosView() {
  const [data, setData]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [modal, setModal]       = useState(null)
  const [selected, setSelected] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    api.getUsuarios()
      .then(r => setData(r.data || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">Máximo 10 usuarios permitidos ({data.length}/10)</p>
        <button onClick={() => { setSelected(null); setModal('new') }}
          disabled={data.length >= 10}
          className="btn-primary text-sm">
          <Plus size={15} /> Nuevo Usuario
        </button>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}

      {loading ? <Spinner text="Cargando usuarios..." /> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.map(u => (
            <div key={u.ID} className="card flex items-start gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${u.Activo ? 'bg-brand-100' : 'bg-gray-100'}`}>
                {u.Activo
                  ? <UserCheck size={20} className="text-brand-600" />
                  : <UserX size={20} className="text-gray-400" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 truncate">{u.Nombre}</p>
                <p className="text-xs text-gray-500">{u.Username}</p>
                {u.Email && <p className="text-xs text-gray-400 truncate">{u.Email}</p>}
                <div className="flex items-center gap-2 mt-2">
                  <span className={u.Rol === 'admin' ? 'badge-blue' : 'badge-gray'}>
                    {u.Rol === 'admin' ? 'Admin' : 'Usuario'}
                  </span>
                  <span className={u.Activo ? 'badge-green' : 'badge-red'}>
                    {u.Activo ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
                <p className="text-xs text-gray-300 mt-1">Creado: {fmt.date(u.FechaCreacion)}</p>
              </div>
              <button onClick={() => { setSelected(u); setModal('edit') }}
                className="p-1.5 hover:bg-brand-50 rounded text-gray-400 hover:text-brand-600 transition-colors flex-shrink-0">
                <Pencil size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <Modal open={!!modal} onClose={() => setModal(null)}
        title={modal === 'edit' ? 'Editar Usuario' : 'Nuevo Usuario'} size="md">
        <UsuarioForm
          initial={modal === 'edit' ? selected : null}
          onSave={() => { setModal(null); load() }}
          onCancel={() => setModal(null)}
        />
      </Modal>
    </div>
  )
}
