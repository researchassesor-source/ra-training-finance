import { useState, useEffect } from 'react'
import { api } from '../../services/api'
import { MODALIDADES, METODOS_PAGO, toDateInput } from '../../utils/formatters'
import { useAuth } from '../../context/AuthContext'

const EMPTY = {
  clienteNombre: '', clienteID: '', clienteEmail: '', clienteTelefono: '',
  servicioId: '', servicioNombre: '', modalidad: 'Virtual',
  fechaInicio: '', monto: '', metodoPago: '',
  razonSocial: '', ruc: '', direccionFactura: '',
  estadoPago: 'pendiente', notas: '', requiereAvalExterno: false,
}

function mapInitial(initial) {
  if (!initial) return EMPTY
  return {
    clienteNombre:   initial.ClienteNombre   || initial.clienteNombre   || '',
    clienteID:       initial.ClienteID       || initial.clienteID       || '',
    clienteEmail:    initial.ClienteEmail    || initial.clienteEmail    || '',
    clienteTelefono: initial.ClienteTelefono || initial.clienteTelefono || '',
    servicioId:      initial.ServicioID      || initial.servicioId      || '',
    servicioNombre:  initial.ServicioNombre  || initial.servicioNombre  || '',
    modalidad:       initial.Modalidad       || initial.modalidad       || 'Virtual',
    fechaInicio:     toDateInput(initial.FechaInicio || initial.fechaInicio),
    monto:           initial.Monto           || initial.monto           || '',
    metodoPago:      initial.MetodoPago      || initial.metodoPago      || '',
    razonSocial:     initial.RazonSocial     || initial.razonSocial     || '',
    ruc:             initial.RUC             || initial.ruc             || '',
    direccionFactura:initial.DireccionFactura|| initial.direccionFactura|| '',
    estadoPago:      initial.EstadoPago      || initial.estadoPago      || 'pendiente',
    notas:           initial.Notas           || initial.notas           || '',
    requiereAvalExterno: initial.RequiereAvalExterno === true || initial.RequiereAvalExterno === 'TRUE' ||
                         initial.requiereAvalExterno === true || false,
  }
}

export default function InscripcionesForm({ initial, onSave, onCancel }) {
  const { isAdmin } = useAuth()
  const [form, setForm]       = useState(() => mapInitial(initial))
  const [servicios, setServicios] = useState([])
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const [facturaIgual, setFacturaIgual] = useState(!initial)

  useEffect(() => {
    api.getServicios()
      .then(r => setServicios((r.data || []).filter(s => s.Activo)))
      .catch(() => {})
  }, [])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  function handleServicio(id) {
    const s = servicios.find(s => s.ID === id)
    set('servicioId', id)
    set('servicioNombre', s?.Nombre || '')
    if (s?.Precio) set('monto', s.Precio)
    if (s?.Modalidad) set('modalidad', s.Modalidad)
  }

  useEffect(() => {
    if (facturaIgual) {
      set('razonSocial', form.clienteNombre)
      set('ruc', form.clienteID)
    }
  }, [facturaIgual, form.clienteNombre, form.clienteID])

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      if (initial?.ID) await api.updateInscripcion(initial.ID, form)
      else await api.addInscripcion(form)
      onSave()
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Servicio */}
      <div>
        <h3 className="text-sm font-semibold text-brand-700 uppercase tracking-wide mb-3">Servicio</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="label">Servicio *</label>
            <select className="input" required value={form.servicioId} onChange={e => handleServicio(e.target.value)}>
              <option value="">Seleccionar servicio...</option>
              {servicios.map(s => <option key={s.ID} value={s.ID}>{s.Nombre} {s.Precio > 0 ? `— $${s.Precio}` : ''}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Modalidad *</label>
            <select className="input" required value={form.modalidad} onChange={e => set('modalidad', e.target.value)}>
              {MODALIDADES.map(m => <option key={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Fecha de Inicio</label>
            <input className="input" type="date" value={form.fechaInicio} onChange={e => set('fechaInicio', e.target.value)} />
          </div>
        </div>
      </div>

      {/* Cliente */}
      <div>
        <h3 className="text-sm font-semibold text-brand-700 uppercase tracking-wide mb-3">Datos del Participante</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="label">Nombre completo *</label>
            <input className="input" required value={form.clienteNombre}
              onChange={e => set('clienteNombre', e.target.value)} placeholder="Nombre y apellido" />
          </div>
          <div>
            <label className="label">Cédula / Pasaporte</label>
            <input className="input" value={form.clienteID}
              onChange={e => set('clienteID', e.target.value)} placeholder="Número de identificación" />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" value={form.clienteEmail}
              onChange={e => set('clienteEmail', e.target.value)} placeholder="correo@cliente.com" />
          </div>
          <div>
            <label className="label">Teléfono</label>
            <input className="input" value={form.clienteTelefono}
              onChange={e => set('clienteTelefono', e.target.value)} placeholder="+1 000 000 0000" />
          </div>
        </div>
      </div>

      {/* Facturación */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-brand-700 uppercase tracking-wide">Datos de Facturación</h3>
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input type="checkbox" checked={facturaIgual} onChange={e => setFacturaIgual(e.target.checked)}
              className="accent-brand-600" />
            Igual al participante
          </label>
        </div>
        {!facturaIgual && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="label">Razón Social</label>
              <input className="input" value={form.razonSocial}
                onChange={e => set('razonSocial', e.target.value)} placeholder="Nombre o empresa para factura" />
            </div>
            <div>
              <label className="label">RUC / NIT / ID Fiscal</label>
              <input className="input" value={form.ruc}
                onChange={e => set('ruc', e.target.value)} placeholder="Número tributario" />
            </div>
            <div>
              <label className="label">Dirección de Facturación</label>
              <input className="input" value={form.direccionFactura}
                onChange={e => set('direccionFactura', e.target.value)} placeholder="Dirección fiscal" />
            </div>
          </div>
        )}
      </div>

      {/* Pago */}
      <div>
        <h3 className="text-sm font-semibold text-brand-700 uppercase tracking-wide mb-3">Pago</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Monto (USD) *</label>
            <input className="input" type="number" step="0.01" min="0" required
              value={form.monto} onChange={e => set('monto', e.target.value)} placeholder="0.00" />
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
              <label className="label">Estado de Pago</label>
              <select className="input" value={form.estadoPago} onChange={e => set('estadoPago', e.target.value)}>
                <option value="pendiente">Pendiente</option>
                <option value="pagado">Pagado</option>
                <option value="verificado">Verificado</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </div>
          )}
          <div className={isAdmin ? '' : 'sm:col-span-2'}>
            <label className="label">Notas</label>
            <textarea className="input" rows={2} value={form.notas}
              onChange={e => set('notas', e.target.value)} placeholder="Observaciones..." />
          </div>
          <div className="sm:col-span-2 flex items-center gap-2">
            <input type="checkbox" id="requiereAval" checked={form.requiereAvalExterno}
              onChange={e => set('requiereAvalExterno', e.target.checked)} className="w-4 h-4 accent-brand-600" />
            <label htmlFor="requiereAval" className="text-sm text-gray-700">
              El cliente requiere aval externo para este certificado
            </label>
          </div>
        </div>
      </div>

      {!isAdmin && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
          La inscripción quedará <strong>pendiente de verificación</strong> hasta que el administrador la confirme.
        </div>
      )}

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}

      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onCancel} className="btn-secondary flex-1">Cancelar</button>
        <button type="submit" className="btn-primary flex-1" disabled={saving}>
          {saving ? 'Guardando...' : initial?.ID ? 'Actualizar' : 'Registrar Inscripción'}
        </button>
      </div>
    </form>
  )
}
