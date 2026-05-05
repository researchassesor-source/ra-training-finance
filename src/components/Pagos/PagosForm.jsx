import { useState, useEffect } from 'react'
import { api } from '../../services/api'
import { TIPOS_PAGO, METODOS_PAGO } from '../../utils/formatters'

const EMPTY = {
  fecha: '', tipo: '', beneficiario: '', concepto: '', referencia: '',
  monto: '', metodoPago: '', egresoId: '', contratoId: '', estado: 'completado', notas: '',
}

export default function PagosForm({ initial, onSave, onCancel }) {
  const [form, setForm]       = useState(initial ? { ...EMPTY, ...initial } : { ...EMPTY, fecha: new Date().toISOString().slice(0,10) })
  const [egresos, setEgresos] = useState([])
  const [contratos, setContratos] = useState([])
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')

  useEffect(() => {
    Promise.all([
      api.getEgresos({ estado: 'aprobado' }),
      api.getContratos(),
    ]).then(([e, c]) => {
      setEgresos(e.data || [])
      setContratos(c.data || [])
    }).catch(() => {})
  }, [])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      if (initial?.ID) await api.updatePago(initial.ID, form)
      else await api.addPago(form)
      onSave()
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">Fecha *</label>
          <input className="input" type="date" required value={form.fecha} onChange={e => set('fecha', e.target.value)} />
        </div>
        <div>
          <label className="label">Tipo de Pago *</label>
          <select className="input" required value={form.tipo} onChange={e => set('tipo', e.target.value)}>
            <option value="">Seleccionar...</option>
            {TIPOS_PAGO.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Beneficiario *</label>
          <input className="input" required value={form.beneficiario}
            onChange={e => set('beneficiario', e.target.value)} placeholder="Proveedor o persona" />
        </div>
        <div>
          <label className="label">Monto (USD) *</label>
          <input className="input" type="number" step="0.01" min="0" required
            value={form.monto} onChange={e => set('monto', e.target.value)} placeholder="0.00" />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Concepto *</label>
          <input className="input" required value={form.concepto}
            onChange={e => set('concepto', e.target.value)} placeholder="Descripción del pago" />
        </div>
        <div>
          <label className="label">Método de Pago *</label>
          <select className="input" required value={form.metodoPago} onChange={e => set('metodoPago', e.target.value)}>
            <option value="">Seleccionar...</option>
            {METODOS_PAGO.map(m => <option key={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Referencia / Número</label>
          <input className="input" value={form.referencia}
            onChange={e => set('referencia', e.target.value)} placeholder="# Transferencia, cheque, etc." />
        </div>
        <div>
          <label className="label">Egreso vinculado</label>
          <select className="input" value={form.egresoId} onChange={e => set('egresoId', e.target.value)}>
            <option value="">Ninguno</option>
            {egresos.map(e => <option key={e.ID} value={e.ID}>{e.Concepto} — {e.Proveedor}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Contrato vinculado</label>
          <select className="input" value={form.contratoId} onChange={e => set('contratoId', e.target.value)}>
            <option value="">Ninguno</option>
            {contratos.map(c => <option key={c.ID} value={c.ID}>{c.Nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Estado</label>
          <select className="input" value={form.estado} onChange={e => set('estado', e.target.value)}>
            <option value="completado">Completado</option>
            <option value="pendiente">Pendiente</option>
            <option value="cancelado">Cancelado</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="label">Notas</label>
          <textarea className="input" rows={2} value={form.notas}
            onChange={e => set('notas', e.target.value)} />
        </div>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}
      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onCancel} className="btn-secondary flex-1">Cancelar</button>
        <button type="submit" className="btn-primary flex-1" disabled={saving}>
          {saving ? 'Guardando...' : initial?.ID ? 'Actualizar' : 'Registrar Pago'}
        </button>
      </div>
    </form>
  )
}
