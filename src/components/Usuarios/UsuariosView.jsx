import { useEffect, useState, useCallback } from 'react'
import { api } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { fmt } from '../../utils/formatters'
import Modal from '../UI/Modal'
import ConfirmDialog from '../UI/ConfirmDialog'
import Spinner from '../UI/Spinner'
import { Plus, Pencil, Trash2, UserCheck, UserX } from 'lucide-react'
import { ROLE_META, ROLE_ORDER, primaryRole, rolesOf } from '../../utils/roles'

const EMPTY = { nombre: '', email: '', username: '', password: '', roles: ['usuario'], rol: 'usuario', activo: true, institucionAval: '' }

const ROLE_OPTIONS = [
  { value: 'usuario', label: 'Usuario', detail: 'Gastos y reportes propios' },
  { value: 'vendedor', label: 'Vendedor', detail: 'Ingresos, inscripciones, servicios, asistencia y flujos' },
  { value: 'contador', label: 'Contador', detail: 'Facturación y reportes contables' },
  { value: 'moodle', label: 'Encargado Moodle', detail: 'Carga y prepara accesos del aula virtual' },
  { value: 'aval', label: 'Aval externo', detail: 'Certificados asignados a una institución' },
  { value: 'admin', label: 'Administrador', detail: 'Acceso total' },
]

function mapInitial(initial) {
  if (!initial) return EMPTY
  return {
    nombre:   initial.Nombre   || initial.nombre   || '',
    email:    initial.Email    || initial.email    || '',
    username: initial.Username || initial.username || '',
    password: '',
    roles:    rolesOf(initial),
    rol:      primaryRole(rolesOf(initial)),
    activo:   initial.Activo === true || initial.Activo === 'TRUE' || initial.activo === true,
    institucionAval: initial.InstitucionAval || initial.institucionAval || '',
  }
}

function UsuarioForm({ initial, onSave, onCancel }) {
  const [form, setForm]   = useState(() => mapInitial(initial))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const hasAvalRole = form.roles.includes('aval')

  function toggleRole(role) {
    setForm(actual => {
      let nextRoles = actual.roles.includes(role)
        ? actual.roles.filter(item => item !== role)
        : [...actual.roles.filter(item => item !== 'usuario'), role]
      if (!nextRoles.length) nextRoles = ['usuario']
      if (role === 'usuario' && !actual.roles.includes('usuario')) nextRoles = ['usuario']
      nextRoles = ROLE_ORDER.filter(item => nextRoles.includes(item))
      return {
        ...actual,
        roles: nextRoles,
        rol: primaryRole(nextRoles),
        institucionAval: nextRoles.includes('aval') ? actual.institucionAval : '',
      }
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!initial && !form.password) { setError('La contraseña es requerida'); return }
    if (hasAvalRole && !form.institucionAval.trim()) {
      setError('Ingrese la institución asignada a este usuario de aval.')
      return
    }
    const payload = { ...form, rol: primaryRole(form.roles) }
    setSaving(true)
    setError('')
    try {
      if (initial?.ID) await api.updateUsuario(initial.ID, payload)
      else await api.addUsuario(payload)
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
            placeholder="usuario.apellido" />
          {initial && (
            <p className="text-xs text-amber-600 mt-1">⚠ Al cambiar el username el usuario deberá iniciar sesión nuevamente.</p>
          )}
        </div>
        <div>
          <label className="label">{initial ? 'Nueva Contraseña (dejar vacío para mantener)' : 'Contraseña *'}</label>
          <input className="input" type="password" value={form.password}
            onChange={e => set('password', e.target.value)} placeholder="••••••••" />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Roles</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {ROLE_OPTIONS.map(option => (
              <label key={option.value} className={`border rounded-lg p-3 cursor-pointer transition-colors ${form.roles.includes(option.value) ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-brand-200'}`}>
                <span className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={form.roles.includes(option.value)}
                    onChange={() => toggleRole(option.value)}
                    className="mt-0.5 w-4 h-4 accent-brand-600"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-gray-900">{option.label}</span>
                    <span className="block text-xs text-gray-500">{option.detail}</span>
                  </span>
                </span>
              </label>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Puedes combinar roles, por ejemplo Vendedor + Encargado Moodle. El rol principal se mantiene automáticamente para compatibilidad.
          </p>
        </div>
        {hasAvalRole && (
          <div className="sm:col-span-2">
            <label className="label">Institución asignada *</label>
            <input className="input" required value={form.institucionAval}
              onChange={e => set('institucionAval', e.target.value)}
              placeholder="Ej.: IPSA" />
            <p className="text-xs text-gray-500 mt-1">
              Este usuario solo podrá ver y registrar avales de esta institución.
            </p>
          </div>
        )}
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
  const { user } = useAuth()
  const [data, setData]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [modal, setModal]       = useState(null)
  const [selected, setSelected] = useState(null)
  const [confirm, setConfirm]   = useState(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    api.getUsuarios()
      .then(r => setData(r.data || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  async function handleDelete() {
    setDeleting(true)
    try { await api.deleteUsuario(confirm.ID); setConfirm(null); load() }
    catch (e) { setError(e.message) }
    finally { setDeleting(false) }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">Usuarios registrados: {data.length}. Administra roles y accesos sin límite operativo fijo.</p>
        <button onClick={() => { setSelected(null); setModal('new') }}
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
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  {rolesOf(u).map(role => (
                    <span key={role} className={ROLE_META[role]?.css || 'badge-gray'}>
                      {ROLE_META[role]?.label || role}
                    </span>
                  ))}
                  <span className={u.Activo ? 'badge-green' : 'badge-red'}>
                    {u.Activo ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
                {rolesOf(u).includes('aval') && u.InstitucionAval && (
                  <p className="text-xs text-amber-700 mt-1 truncate" title={u.InstitucionAval}>
                    Institución: {u.InstitucionAval}
                  </p>
                )}
                <p className="text-xs text-gray-300 mt-1">Creado: {fmt.date(u.FechaCreacion)}</p>
              </div>
              <div className="flex flex-col gap-1 flex-shrink-0">
                <button onClick={() => { setSelected(u); setModal('edit') }}
                  className="p-1.5 hover:bg-brand-50 rounded text-gray-400 hover:text-brand-600 transition-colors">
                  <Pencil size={14} />
                </button>
                {u.ID !== user?.id && (
                  <button onClick={() => setConfirm(u)} title="Eliminar usuario"
                    className="p-1.5 hover:bg-red-50 rounded text-gray-400 hover:text-red-600 transition-colors">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
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

      <ConfirmDialog
        open={!!confirm} onClose={() => setConfirm(null)} onConfirm={handleDelete}
        loading={deleting} title="Eliminar Usuario"
        message={`¿Eliminar el usuario "${confirm?.Nombre}" (${confirm?.Username})? Esta acción no se puede deshacer.`}
      />
    </div>
  )
}
