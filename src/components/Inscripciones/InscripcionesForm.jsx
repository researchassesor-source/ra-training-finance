import { useState, useEffect } from 'react'
import { api } from '../../services/api'
import { MODALIDADES, METODOS_PAGO, toDateInput } from '../../utils/formatters'
import { useAuth } from '../../context/AuthContext'

const EMPTY = {
  clienteNombre: '', clienteID: '', clienteEmail: '', clienteTelefono: '',
  servicioId: '', servicioNombre: '', modalidad: 'Virtual',
  fechaInicio: '', fechaFin: '', monto: '', metodoPago: '',
  razonSocial: '', ruc: '', direccionFactura: '',
  estadoPago: 'pendiente', numeroComprobante: '', fechaPago: '', notas: '',
  requiereAvalExterno: false, institucionAval: '',
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
    fechaFin:        toDateInput(initial.FechaFin || initial.fechaFin),
    monto:           initial.Monto           || initial.monto           || '',
    metodoPago:      initial.MetodoPago      || initial.metodoPago      || '',
    razonSocial:     initial.RazonSocial     || initial.razonSocial     || '',
    ruc:             initial.RUC             || initial.ruc             || '',
    direccionFactura:initial.DireccionFactura|| initial.direccionFactura|| '',
    estadoPago:      initial.EstadoPago      || initial.estadoPago      || 'pendiente',
    numeroComprobante: initial.NumeroComprobante || initial.numeroComprobante || initial.Notas || '',
    fechaPago:       toDateInput(initial.FechaPago || initial.fechaPago),
    notas:           initial.Notas           || initial.notas           || '',
    requiereAvalExterno: initial.RequiereAvalExterno === true || initial.RequiereAvalExterno === 'TRUE' ||
                         initial.requiereAvalExterno === true || false,
    institucionAval: initial.InstitucionAval || initial.institucionAval || '',
  }
}

export default function InscripcionesForm({ initial, onSave, onCancel }) {
  const { isAdmin } = useAuth()
  const [form, setForm]       = useState(() => mapInitial(initial))
  const [servicios, setServicios] = useState([])
  const [institucionesAval, setInstitucionesAval] = useState([])
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const [facturaIgual, setFacturaIgual] = useState(!initial)

  useEffect(() => {
    api.getServicios()
      .then(r => setServicios((r.data || []).filter(s => s.Activo)))
      .catch(() => {})
    api.getInstitucionesAval()
      .then(r => setInstitucionesAval(r.data || []))
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
    setError('')
    const monto = Number(form.monto)
    const necesitaComprobante = ['transferencia', 'tarjeta', 'cheque']
      .some(tipo => form.metodoPago.toLowerCase().includes(tipo))
    if (!form.servicioId) return setError('Seleccione un servicio.')
    if (!form.clienteNombre.trim()) return setError('Ingrese el nombre del participante.')
    if (String(form.monto).trim() === '' || !Number.isFinite(monto) || monto < 0) return setError('Ingrese un monto válido.')
    if (!form.metodoPago) return setError('Seleccione el método de pago.')
    if (form.fechaInicio && form.fechaFin && form.fechaFin < form.fechaInicio) {
      return setError('La fecha de finalización no puede ser anterior a la fecha de inicio.')
    }
    if (form.clienteEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.clienteEmail)) {
      return setError('Ingrese un correo electrónico válido.')
    }
    if (necesitaComprobante && !form.numeroComprobante.trim()) {
      return setError('Ingrese el número de comprobante para el método de pago seleccionado.')
    }
    if (form.numeroComprobante.trim() && !form.fechaPago) {
      return setError('Ingrese la fecha del pago o transferencia.')
    }
    if (form.requiereAvalExterno && !form.institucionAval.trim()) {
      return setError('Ingrese la institución avaladora.')
    }
    setSaving(true)
    try {
      if (initial?.ID) {
        const result = await api.updateInscripcion(initial.ID, form)
        if (result.warning) {
          setError(`La inscripción se actualizó, pero no se pudo sincronizar el ingreso: ${result.warning}`)
          return
        }
        if (isAdmin && form.estadoPago === 'verificado' && initial.EstadoPago !== 'verificado') {
          await api.verificarPagoInscripcion(initial.ID, {
            numeroComprobante: form.numeroComprobante,
            fechaPago: form.fechaPago,
          })
        }
      } else await api.addInscripcion(form)
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
          <div>
            <label className="label">Fecha de Fin</label>
            <input className="input" type="date" value={form.fechaFin} onChange={e => set('fechaFin', e.target.value)} />
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
            <label className="label">Número de comprobante</label>
            <input className="input" value={form.numeroComprobante}
              onChange={e => set('numeroComprobante', e.target.value)}
              placeholder="Ej.: 123456789, transferencia #001234 o referencia bancaria" />
            <p className="text-xs text-gray-400 mt-1">
              Ingrese el número que aparece en el voucher o comprobante. La responsable financiera utilizará este dato para verificar la transferencia.
            </p>
          </div>
          <div>
            <label className="label">Fecha del pago o transferencia</label>
            <input className="input" type="date" value={form.fechaPago}
              onChange={e => set('fechaPago', e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Observaciones internas</label>
            <textarea className="input" rows={2} value={form.notas}
              onChange={e => set('notas', e.target.value)} placeholder="Opcional; no use este campo para el comprobante." />
          </div>
          <fieldset className="sm:col-span-2 space-y-2">
            <legend className="label">Tipo de certificado</legend>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="radio" name="tipoCertificado" checked={!form.requiereAvalExterno}
                onChange={() => set('requiereAvalExterno', false)} className="accent-brand-600" />
              Certificado R.A. Training (aval propio)
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="radio" name="tipoCertificado" checked={form.requiereAvalExterno}
                onChange={() => set('requiereAvalExterno', true)} className="accent-brand-600" />
              R.A. Training + aval institucional
            </label>
          </fieldset>
          {form.requiereAvalExterno && (
            <div className="sm:col-span-2">
              <label className="label">Institución avaladora *</label>
              <input className="input" required list="instituciones-aval" value={form.institucionAval}
                onChange={e => set('institucionAval', e.target.value)}
                placeholder="Nombre de la institución que otorgará el aval" />
              <datalist id="instituciones-aval">
                {institucionesAval.map(nombre => <option key={nombre} value={nombre} />)}
              </datalist>
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 mt-2">
                El certificado quedará pendiente hasta que la institución entregue su referencia, código o enlace. El QR será únicamente el de verificación de R.A. Training.
              </p>
            </div>
          )}
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
