import { useState, useEffect } from 'react'
import { api } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { toDateInput } from '../../utils/formatters'

const EMPTY = {
  fecha: '', categoria: '', concepto: '', proveedor: '',
  monto: '', estado: 'pendiente', notas: '',
}

function mapInitial(initial) {
  if (!initial) return { ...EMPTY, fecha: new Date().toISOString().slice(0,10) }
  return {
    fecha:     toDateInput(initial.Fecha || initial.fecha) || new Date().toISOString().slice(0,10),
    categoria: initial.Categoria || initial.categoria || '',
    concepto:  initial.Concepto  || initial.concepto  || '',
    proveedor: initial.Proveedor || initial.proveedor || '',
    monto:     initial.Monto     || initial.monto     || '',
    estado:    initial.Estado    || initial.estado    || 'pendiente',
    notas:     initial.Notas     || initial.notas     || '',
  }
}

export default function EgresosForm({ initial, onSave, onCancel }) {
  const { isAdmin } = useAuth()
  const [form, setForm]   = useState(() => mapInitial(initial))
  const [cats, setCats]   = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.getCategorias()
      .then(r => setCats((r.data || []).filter(c => c.Tipo === 'egreso' && c.Activo)))
      .catch(() => {})
  }, [])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      if (initial?.ID) {
        await api.updateEgreso(initial.ID, form)
      } else {
        await api.addEgreso(form)
      }
      onSave()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">Fecha *</label>
          <input className="input" type="date" required value={form.fecha} onChange={e => set('fecha', e.target.value)} />
        </div>
        <div>
          <label className="label">Categoría *</label>
          <select className="input" required value={form.categoria} onChange={e => set('categoria', e.target.value)}>
            <option value="">Seleccionar...</option>
            {cats.map(c => <option key={c.ID}>{c.Nombre}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="label">Concepto *</label>
          <input className="input" required value={form.concepto}
            onChange={e => set('concepto', e.target.value)} placeholder="Descripción del gasto" />
        </div>
        <div>
          <label className="label">Proveedor / Beneficiario</label>
          <input className="input" value={form.proveedor}
            onChange={e => set('proveedor', e.target.value)} placeholder="Nombre del proveedor" />
        </div>
        <div>
          <label className="label">Monto (USD) *</label>
          <input className="input" type="number" step="0.01" min="0" required
            value={form.monto} onChange={e => set('monto', e.target.value)} placeholder="0.00" />
        </div>
        {isAdmin && (
          <div>
            <label className="label">Estado</label>
            <select className="input" value={form.estado} onChange={e => set('estado', e.target.value)}>
              <option value="pendiente">Pendiente</option>
              <option value="aprobado">Aprobado</option>
              <option value="rechazado">Rechazado</option>
              <option value="pagado">Pagado</option>
            </select>
          </div>
        )}
        <div className={isAdmin ? '' : 'sm:col-span-2'}>
          <label className="label">Notas</label>
          <textarea className="input" rows={2} value={form.notas}
            onChange={e => set('notas', e.target.value)} placeholder="Observaciones o justificación del gasto..." />
        </div>
      </div>

      {!isAdmin && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
          Tu reporte quedará en estado <strong>Pendiente</strong> hasta que la gerencia lo apruebe.
        </div>
      )}

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}

      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onCancel} className="btn-secondary flex-1">Cancelar</button>
        <button type="submit" className="btn-primary flex-1" disabled={saving}>
          {saving ? 'Guardando...' : initial?.ID ? 'Actualizar' : 'Reportar Gasto'}
        </button>
      </div>
    </form>
  )
}
