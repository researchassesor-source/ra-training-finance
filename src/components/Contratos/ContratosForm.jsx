import { useState } from 'react'
import { api } from '../../services/api'

const EMPTY = {
  tipo: 'cliente', nombre: '', concepto: '', valorTotal: '',
  fechaInicio: '', fechaFin: '', estado: 'activo', notas: '',
}

export default function ContratosForm({ initial, onSave, onCancel }) {
  const [form, setForm]   = useState(initial ? { ...EMPTY, ...initial } : EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      if (initial?.ID) await api.updateContrato(initial.ID, form)
      else await api.addContrato(form)
      onSave()
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">Tipo de Contrato *</label>
          <select className="input" required value={form.tipo} onChange={e => set('tipo', e.target.value)}>
            <option value="cliente">Cliente (ingreso)</option>
            <option value="proveedor">Proveedor (egreso)</option>
          </select>
        </div>
        <div>
          <label className="label">Estado</label>
          <select className="input" value={form.estado} onChange={e => set('estado', e.target.value)}>
            <option value="activo">Activo</option>
            <option value="pendiente">Pendiente</option>
            <option value="vencido">Vencido</option>
            <option value="cancelado">Cancelado</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="label">Nombre (empresa / persona) *</label>
          <input className="input" required value={form.nombre}
            onChange={e => set('nombre', e.target.value)} placeholder="Nombre del cliente o proveedor" />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Concepto / Servicio *</label>
          <input className="input" required value={form.concepto}
            onChange={e => set('concepto', e.target.value)} placeholder="Descripción del contrato" />
        </div>
        <div>
          <label className="label">Valor Total (USD) *</label>
          <input className="input" type="number" step="0.01" min="0" required
            value={form.valorTotal} onChange={e => set('valorTotal', e.target.value)} placeholder="0.00" />
        </div>
        <div>
          <label className="label">Fecha de Inicio</label>
          <input className="input" type="date" value={form.fechaInicio} onChange={e => set('fechaInicio', e.target.value)} />
        </div>
        <div>
          <label className="label">Fecha de Vencimiento</label>
          <input className="input" type="date" value={form.fechaFin} onChange={e => set('fechaFin', e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Notas</label>
          <textarea className="input" rows={2} value={form.notas} onChange={e => set('notas', e.target.value)} />
        </div>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}
      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onCancel} className="btn-secondary flex-1">Cancelar</button>
        <button type="submit" className="btn-primary flex-1" disabled={saving}>
          {saving ? 'Guardando...' : initial?.ID ? 'Actualizar' : 'Crear Contrato'}
        </button>
      </div>
    </form>
  )
}
