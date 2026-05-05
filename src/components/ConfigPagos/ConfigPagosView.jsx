import { useEffect, useState, useCallback } from 'react'
import { api } from '../../services/api'
import Modal from '../UI/Modal'
import Spinner from '../UI/Spinner'
import { Plus, Pencil, ToggleLeft, ToggleRight } from 'lucide-react'

const TIPOS_CUENTA = ['Transferencia Bancaria', 'PayPal', 'Zelle', 'Efectivo', 'Otro']

const EMPTY = { nombre: '', tipo: 'Transferencia Bancaria', detalles: '', instrucciones: '', activo: true }

function ConfigPagoForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial ? {
    nombre: initial.Nombre || '',
    tipo: initial.Tipo || 'Transferencia Bancaria',
    detalles: initial.Detalles || '',
    instrucciones: initial.Instrucciones || '',
    activo: initial.Activo === true || initial.Activo === 'TRUE',
  } : { ...EMPTY })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      if (initial?.ID) await api.updateConfigPago(initial.ID, form)
      else await api.addConfigPago(form)
      onSave()
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className="label">Nombre de la cuenta *</label>
          <input className="input" required value={form.nombre}
            onChange={e => set('nombre', e.target.value)} placeholder="Ej: Banco Pichincha — Cuenta Corriente" />
        </div>
        <div>
          <label className="label">Tipo *</label>
          <select className="input" required value={form.tipo} onChange={e => set('tipo', e.target.value)}>
            {TIPOS_CUENTA.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        {initial && (
          <div className="flex items-center gap-2 pt-6">
            <input type="checkbox" id="activo" checked={form.activo}
              onChange={e => set('activo', e.target.checked)} className="w-4 h-4 accent-brand-600" />
            <label htmlFor="activo" className="text-sm text-gray-700">Cuenta activa</label>
          </div>
        )}
        <div className="sm:col-span-2">
          <label className="label">Detalles de la cuenta *</label>
          <textarea className="input" rows={3} required value={form.detalles}
            onChange={e => set('detalles', e.target.value)}
            placeholder={form.tipo === 'Transferencia Bancaria'
              ? 'Banco: ...\nN° Cuenta: ...\nTitular: ...\nCédula/RUC: ...'
              : form.tipo === 'PayPal' ? 'Email PayPal: ...'
              : form.tipo === 'Zelle' ? 'Email/Teléfono Zelle: ...'
              : 'Detalles del método de pago...'} />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Instrucciones adicionales</label>
          <textarea className="input" rows={2} value={form.instrucciones}
            onChange={e => set('instrucciones', e.target.value)}
            placeholder="Ej: Enviar comprobante al WhatsApp +593..." />
        </div>
      </div>
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}
      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onCancel} className="btn-secondary flex-1">Cancelar</button>
        <button type="submit" className="btn-primary flex-1" disabled={saving}>
          {saving ? 'Guardando...' : initial?.ID ? 'Actualizar' : 'Crear Cuenta'}
        </button>
      </div>
    </form>
  )
}

export default function ConfigPagosView() {
  const [data, setData]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [modal, setModal]       = useState(null)
  const [selected, setSelected] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    api.getConfigPagos()
      .then(r => setData(r.data || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  async function toggleActivo(item) {
    try {
      await api.updateConfigPago(item.ID, {
        nombre: item.Nombre, tipo: item.Tipo,
        detalles: item.Detalles, instrucciones: item.Instrucciones,
        activo: !(item.Activo === true || item.Activo === 'TRUE'),
      })
      load()
    } catch (e) { setError(e.message) }
  }

  const activos = data.filter(d => d.Activo === true || d.Activo === 'TRUE').length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Cuentas de Pago</h2>
          <p className="text-sm text-gray-500">Configura los métodos de pago que los vendedores enviarán a clientes.</p>
        </div>
        <button onClick={() => { setSelected(null); setModal('new') }} className="btn-primary text-sm">
          <Plus size={15} /> Nueva Cuenta
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="card py-3 text-center">
          <p className="text-xl font-bold text-gray-900">{data.length}</p>
          <p className="text-xs text-gray-500">Total Cuentas</p>
        </div>
        <div className="card py-3 text-center">
          <p className="text-xl font-bold text-emerald-600">{activos}</p>
          <p className="text-xs text-gray-500">Activas</p>
        </div>
        <div className="card py-3 text-center">
          <p className="text-xl font-bold text-gray-400">{data.length - activos}</p>
          <p className="text-xs text-gray-500">Inactivas</p>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}

      {loading ? <Spinner text="Cargando cuentas..." /> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {data.length === 0 ? (
            <p className="text-center text-gray-400 py-10 sm:col-span-2">No hay cuentas configuradas</p>
          ) : data.map(item => {
            const activo = item.Activo === true || item.Activo === 'TRUE'
            return (
              <div key={item.ID} className={`card flex flex-col gap-3 ${!activo ? 'opacity-60' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-gray-900">{item.Nombre}</p>
                    <span className="badge-blue text-xs">{item.Tipo}</span>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button onClick={() => { setSelected(item); setModal('edit') }}
                      className="p-1.5 hover:bg-brand-50 rounded text-gray-400 hover:text-brand-600 transition-colors">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => toggleActivo(item)}
                      className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-700 transition-colors"
                      title={activo ? 'Desactivar' : 'Activar'}>
                      {activo ? <ToggleRight size={18} className="text-emerald-600" /> : <ToggleLeft size={18} />}
                    </button>
                  </div>
                </div>
                {item.Detalles && (
                  <pre className="text-xs text-gray-600 bg-gray-50 rounded-lg p-3 whitespace-pre-wrap font-sans">
                    {item.Detalles}
                  </pre>
                )}
                {item.Instrucciones && (
                  <p className="text-xs text-amber-700 bg-amber-50 rounded-lg p-2">{item.Instrucciones}</p>
                )}
                <div className="flex items-center gap-1 pt-1 border-t border-gray-50">
                  <span className={activo ? 'badge-green' : 'badge-gray'}>{activo ? 'Activa' : 'Inactiva'}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal open={!!modal} onClose={() => setModal(null)}
        title={modal === 'edit' ? 'Editar Cuenta de Pago' : 'Nueva Cuenta de Pago'} size="md">
        <ConfigPagoForm
          initial={modal === 'edit' ? selected : null}
          onSave={() => { setModal(null); load() }}
          onCancel={() => setModal(null)}
        />
      </Modal>
    </div>
  )
}
