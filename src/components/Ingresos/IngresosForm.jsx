import { useState, useEffect } from 'react'
import { api } from '../../services/api'
import { TIPOS_INGRESO, MODALIDADES, METODOS_PAGO, toDateInput } from '../../utils/formatters'
import { useAuth } from '../../context/AuthContext'
import { MessageCircle, CheckCircle } from 'lucide-react'

const EMPTY = {
  fecha: '', tipo: '', modalidad: 'N/A', concepto: '', cliente: '',
  clienteTelefono: '', contratoId: '', monto: '', metodoPago: '',
  estado: 'confirmado', notas: '',
}

function mapInitial(initial) {
  if (!initial) return EMPTY
  return {
    fecha:           toDateInput(initial.Fecha           || initial.fecha),
    tipo:            initial.Tipo            || initial.tipo            || '',
    modalidad:       initial.Modalidad       || initial.modalidad       || 'N/A',
    concepto:        initial.Concepto        || initial.concepto        || '',
    cliente:         initial.Cliente         || initial.cliente         || '',
    clienteTelefono: initial.ClienteTelefono || initial.clienteTelefono || '',
    contratoId:      initial.ContratoID      || initial.contratoId      || '',
    monto:           initial.Monto           || initial.monto           || '',
    metodoPago:      initial.MetodoPago      || initial.metodoPago      || '',
    estado:          initial.Estado          || initial.estado          || 'confirmado',
    notas:           initial.Notas           || initial.notas           || '',
  }
}

export default function IngresosForm({ initial, onSave, onCancel }) {
  const { isAdmin } = useAuth()
  const [form, setForm]         = useState(() => mapInitial(initial))
  const [contratos, setContratos] = useState([])
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  // Estado post-guardado para ofrecer WhatsApp
  const [saved, setSaved]       = useState(false)
  const [cuentas, setCuentas]   = useState([])
  const [waCuenta, setWaCuenta] = useState('')
  const [waPhone, setWaPhone]   = useState('')

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
        onSave()
      } else {
        await api.addIngreso(form)
        // Cargar cuentas de pago y mostrar opción WhatsApp
        setWaPhone(form.clienteTelefono || '')
        api.getConfigPagos()
          .then(r => setCuentas((r.data || []).filter(c => c.Activo === true || c.Activo === 'TRUE')))
          .catch(() => {})
        setSaved(true)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  function buildWaMessage() {
    const cuenta = cuentas.find(c => c.ID === waCuenta)
    const lineas = [
      `*R.A. Training — Datos de Pago*`,
      ``,
      `Estimado/a *${form.cliente || 'cliente'}*,`,
      `Hemos registrado su pago por el siguiente concepto:`,
      ``,
      `📋 *Concepto:* ${form.concepto}`,
      `💵 *Monto:* $${Number(form.monto).toFixed(2)} USD`,
      `💳 *Método:* ${form.metodoPago}`,
      ``,
    ]
    if (cuenta) {
      lineas.push(`Para completar su pago, utilice los siguientes datos:`)
      lineas.push(`*${cuenta.Nombre}*`)
      lineas.push(cuenta.Detalles || '')
      if (cuenta.Instrucciones) { lineas.push(''); lineas.push(`ℹ️ ${cuenta.Instrucciones}`) }
    }
    lineas.push('', '¡Gracias por su preferencia! 🙏', 'R.A. Training')
    return lineas.join('\n')
  }

  function enviarWhatsApp() {
    const msg   = buildWaMessage()
    const phone = waPhone.replace(/\D/g, '')
    const url   = phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`
    window.open(url, '_blank')
    onSave()
  }

  // ── Pantalla post-guardado: ofrecer envío WhatsApp ──
  if (saved) {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
          <CheckCircle size={28} className="text-emerald-500 flex-shrink-0" />
          <div>
            <p className="font-semibold text-emerald-800">Ingreso registrado correctamente</p>
            <p className="text-sm text-emerald-600">{form.concepto} — ${Number(form.monto).toFixed(2)} USD</p>
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium text-gray-700">¿Desea enviar los datos de pago al cliente por WhatsApp?</p>

          <div>
            <label className="label">Número de WhatsApp del cliente</label>
            <input className="input" type="tel" value={waPhone}
              onChange={e => setWaPhone(e.target.value)}
              placeholder="+593 99 999 9999 (con código de país)" />
          </div>

          {cuentas.length > 0 && (
            <div>
              <label className="label">Incluir datos de cuenta de pago</label>
              <select className="input" value={waCuenta} onChange={e => setWaCuenta(e.target.value)}>
                <option value="">Solo confirmación del registro</option>
                {cuentas.map(c => <option key={c.ID} value={c.ID}>{c.Nombre} ({c.Tipo})</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="label">Vista previa del mensaje</label>
            <pre className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs whitespace-pre-wrap text-gray-700 max-h-44 overflow-y-auto">
              {buildWaMessage()}
            </pre>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onSave} className="btn-secondary flex-1">
            Continuar sin enviar
          </button>
          <button type="button" onClick={enviarWhatsApp} className="btn-primary flex-1">
            <MessageCircle size={15} /> Enviar por WhatsApp
          </button>
        </div>
      </div>
    )
  }

  // ── Formulario normal ──
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">Fecha *</label>
          <input className="input" type="date" required value={form.fecha}
            onChange={e => set('fecha', e.target.value)} />
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
          <label className="label">WhatsApp del cliente</label>
          <input className="input" type="tel" value={form.clienteTelefono}
            onChange={e => set('clienteTelefono', e.target.value)}
            placeholder="+593 99 999 9999" />
        </div>
        <div>
          <label className="label">Método de Pago *</label>
          <select className="input" required value={form.metodoPago}
            onChange={e => set('metodoPago', e.target.value)}>
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
          <label className="label">N° de Referencia / Comprobante *</label>
          <textarea className="input" rows={2} value={form.notas}
            onChange={e => set('notas', e.target.value)}
            placeholder="Ej: Transferencia #001234, Captura de pago adjunta, Nº comprobante Zelle..." />
          <p className="text-xs text-gray-400 mt-1">Este dato es revisado por el administrador para verificar el pago.</p>
        </div>
      </div>

      {!isAdmin && !initial?.ID && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
          El ingreso quedará <strong>pendiente de verificación</strong> hasta que el administrador lo confirme.
          Al guardar podrás enviar los datos de pago al cliente por WhatsApp.
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
