import { useState, useEffect } from 'react'
import { api } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { toDateInput } from '../../utils/formatters'

const EMPTY = {
  fecha: '', categoria: '', concepto: '', proveedor: '',
  monto: '', estado: 'pendiente', notas: '',
  proveedorIdentificacion: '', facturaCompraNumero: '', autorizacionCompra: '',
  fechaEmisionFactura: '', baseImponible0: '', baseImponible15: '', ivaCompra: '',
  formaPagoCompra: '', referenciaPagoCompra: '',
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
    proveedorIdentificacion: initial.ProveedorIdentificacion || initial.proveedorIdentificacion || '',
    facturaCompraNumero: initial.FacturaCompraNumero || initial.facturaCompraNumero || '',
    autorizacionCompra: initial.AutorizacionCompra || initial.autorizacionCompra || '',
    fechaEmisionFactura: toDateInput(initial.FechaEmisionFactura || initial.fechaEmisionFactura) || '',
    baseImponible0: initial.BaseImponible0 || initial.baseImponible0 || '',
    baseImponible15: initial.BaseImponible15 || initial.baseImponible15 || '',
    ivaCompra: initial.IvaCompra || initial.ivaCompra || '',
    formaPagoCompra: initial.FormaPagoCompra || initial.formaPagoCompra || '',
    referenciaPagoCompra: initial.ReferenciaPagoCompra || initial.referenciaPagoCompra || '',
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
  const totalFacturaRecibida = (
    (Number(form.baseImponible0) || 0)
    + (Number(form.baseImponible15) || 0)
    + (Number(form.ivaCompra) || 0)
  )

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
        <div className="sm:col-span-2 rounded-2xl border border-brand-100 bg-brand-50/40 p-4">
          <div className="mb-3">
            <p className="text-sm font-semibold text-brand-900">Datos de factura recibida / compra</p>
            <p className="text-xs text-brand-700">
              Opcional. Úsalo cuando el proveedor entregue una factura a R.A. Training; alimenta el Excel contable del contador.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label">RUC / identificación proveedor</label>
              <input className="input" value={form.proveedorIdentificacion}
                onChange={e => set('proveedorIdentificacion', e.target.value)} placeholder="Ej: 0999999999001" />
            </div>
            <div>
              <label className="label">Factura No.</label>
              <input className="input" value={form.facturaCompraNumero}
                onChange={e => set('facturaCompraNumero', e.target.value)} placeholder="001-001-000000123" />
            </div>
            <div>
              <label className="label">Autorización / clave de acceso</label>
              <input className="input" value={form.autorizacionCompra}
                onChange={e => set('autorizacionCompra', e.target.value)} placeholder="Número de autorización SRI" />
            </div>
            <div>
              <label className="label">Fecha emisión factura</label>
              <input className="input" type="date" value={form.fechaEmisionFactura}
                onChange={e => set('fechaEmisionFactura', e.target.value)} />
            </div>
            <div>
              <label className="label">Base imponible 0%</label>
              <input className="input" type="number" step="0.01" min="0" value={form.baseImponible0}
                onChange={e => set('baseImponible0', e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <label className="label">Base imponible 15%</label>
              <input className="input" type="number" step="0.01" min="0" value={form.baseImponible15}
                onChange={e => set('baseImponible15', e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <label className="label">IVA</label>
              <input className="input" type="number" step="0.01" min="0" value={form.ivaCompra}
                onChange={e => set('ivaCompra', e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <label className="label">Forma de pago / referencia</label>
              <input className="input" value={form.formaPagoCompra}
                onChange={e => set('formaPagoCompra', e.target.value)} placeholder="Transferencia, efectivo..." />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Referencia de pago</label>
              <input className="input" value={form.referenciaPagoCompra}
                onChange={e => set('referenciaPagoCompra', e.target.value)} placeholder="N.º transferencia, comprobante o soporte" />
            </div>
          </div>
          {totalFacturaRecibida > 0 && (
            <p className="mt-3 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-brand-800">
              Total tributario calculado: ${totalFacturaRecibida.toFixed(2)}
            </p>
          )}
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
