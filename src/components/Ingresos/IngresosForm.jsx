import { useState, useEffect } from 'react'
import { api } from '../../services/api'
import { TIPOS_INGRESO, MODALIDADES, METODOS_PAGO } from '../../utils/formatters'
import { useAuth } from '../../context/AuthContext'

const EMPTY = {
  fecha: '', tipo: '', modalidad: 'N/A', concepto: '', cliente: '',
  contratoId: '', monto: '', metodoPago: '', estado: 'confirmado', notas: '',
}

function mapInitial(initial) {
  if (!initial) return EMPTY
  return {
    fecha:      initial.Fecha      || initial.fecha      || '',
    tipo:       initial.Tipo       || initial.tipo       || '',
    modalidad:  initial.Modalidad  || initial.modalidad  || 'N/A',
    concepto:   initial.Concepto   || initial.concepto   || '',
    cliente:    initial.Cliente    || initial.cliente    || '',
    contratoId: initial.ContratoID || initial.contratoId || '',
    monto:      initial.Monto      || initial.monto      || '',
    metodoPago: initial.MetodoPago || initial.metodoPago || '',
    estado:     initial.Estado     || initial.estado     || 'confirmado',
    notas:      initial.Notas      || initial.notas      || '',
  }
}

export default function IngresosForm({ initial, onSave, onCancel }) {
  const { isAdmin } = useAuth()
  const [form, setForm]       = useState(() => mapInitial(initial))
  const [contratos, setContratos] = useState([])
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')

  useEffect(() => {
    if (!isAdmin) return
    api.getContratos({ tipo: 'cliente' })
      .then(r => setContratos(r.data || []))
      .catch(() => {})
  }, [isAdmin])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      if (initial?.ID) {
        await api.updateIngreso(initial.ID, form)
      } else {
        await api.addIngreso(form)
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
          <label className="label">Tipo de Ingreso *</label>
          <select className="input" required value={form.tipo} onChange={e => set('tipo', e.target.value)}>
            <option value="">Seleccionar...</option>
            {TIPOS_INGRESO.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Modalidad</label>
          <select className="input" value={form.modalidad} onChange={e => set('modalidad', e.target.value)}>
            {MODALIDADES.map(m => <option key={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Monto (USD) *</label>
          <input className="input" type="number" step="0.01" min="0" required
            value={form.monto} onChange={e => set('monto', e.target.value)} placeholder="0.00" />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Concepto *</label>
          <input className="input" required value={form.concepto}
            onChange={e => set('concepto', e.target.value)} placeholder="Descripción del ingreso" />
        </div>
        <div>
          <label className="label">Cliente</label>
          <input className="input" value={form.cliente}
            onChange={e => set('cliente', e.target.value)} placeholder="Nombre del cliente" />
        </div>
        <div>
          <label className="label">Método de Pago *</label>
          <select className="input" required value={form.metodoPago} onChange={e => set('metodoPago', e.target.value)}>
            <option value="">Seleccionar...</option>
            {METODOS_PAGO.map(m => <option key={m}>{m}</option>)}
          </select>
        </div>
        {isAdmin && (
          <div>
            <label className="label">Contrato vinculado</label>
            <select className="input" value={form.contratoId} onChange={e => set('contratoId', e.target.value)}>
              <option value="">Ninguno</option>
              {contratos.map(c => <option key={c.ID} value={c.ID}>{c.Nombre} — {c.Concepto}</option>)}
            </select>
          </div>
        )}
        {isAdmin && (
          <div>
            <label className="label">Estado</label>
            <select className="input" value={form.estado} onChange={e => set('estado', e.target.value)}>
              <option value="confirmado">Confirmado</option>
              <option value="pendiente">Pendiente</option>
              <option value="cancelado">Cancelado</option>
            </select>
          </div>
        )}
        <div className="sm:col-span-2">
          <label className="label">Notas</label>
          <textarea className="input" rows={2} value={form.notas}
            onChange={e => set('notas', e.target.value)} placeholder="Observaciones adicionales..." />
        </div>
      </div>

      {!isAdmin && !initial?.ID && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
          El ingreso quedará <strong>pendiente de verificación</strong> hasta que el administrador lo confirme.
        </div>
      )}

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}

      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onCancel} className="btn-secondary flex-1">Cancelar</button>
        <button type="submit" className="btn-primary flex-1" disabled={saving}>
          {saving ? 'Guardando...' : initial?.ID ? 'Actualizar' : 'Reportar Ingreso'}
        </button>
      </div>
    </form>
  )
}
