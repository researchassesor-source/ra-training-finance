import { useState, useEffect } from 'react'
import { api } from '../../services/api'
import { MODALIDADES, METODOS_PAGO, toDateInput } from '../../utils/formatters'
import { useAuth } from '../../context/AuthContext'
import { IDENTIFICATION_TYPE, identificationError, normalizeIdentification, normalizeIdentificationType } from '../../utils/identification'

const EMPTY = {
  clienteNombre: '', clienteID: '', clienteTipoIdentificacion: IDENTIFICATION_TYPE.ECUADORIAN_ID,
  clienteEmail: '', clienteTelefono: '',
  servicioId: '', servicioNombre: '', modalidad: 'Virtual',
  fechaInicio: '', fechaFin: '', monto: '', metodoPago: '',
  razonSocial: '', ruc: '', tipoIdentificacionFactura: IDENTIFICATION_TYPE.ECUADORIAN_RUC, direccionFactura: '',
  estadoPago: 'pendiente', numeroComprobante: '', fechaPago: '', notas: '',
  requiereAvalExterno: false, institucionAval: '', institucionAvalId: '', convenioId: '',
}

function mapInitial(initial) {
  if (!initial) return EMPTY
  const clientId = normalizeIdentification(initial.ClienteID ?? initial.clienteID ?? '')
  const taxId = normalizeIdentification(initial.RUC ?? initial.ruc ?? '')
  const clientType = normalizeIdentificationType(initial.ClienteTipoIdentificacion || initial.clienteTipoIdentificacion)
  const billingType = normalizeIdentificationType(initial.TipoIdentificacionFactura || initial.tipoIdentificacionFactura
    || (taxId && taxId === clientId ? clientType : IDENTIFICATION_TYPE.UNSPECIFIED))
  return {
    clienteNombre:   initial.ClienteNombre   || initial.clienteNombre   || '',
    clienteID:       clientId,
    clienteTipoIdentificacion: clientType,
    clienteEmail:    initial.ClienteEmail    || initial.clienteEmail    || '',
    clienteTelefono: initial.ClienteTelefono || initial.clienteTelefono || '',
    servicioId:      initial.ServicioID      || initial.servicioId      || '',
    servicioNombre:  initial.ServicioNombre  || initial.servicioNombre  || '',
    modalidad:       initial.Modalidad       || initial.modalidad       || 'Virtual',
    fechaInicio:     toDateInput(initial.FechaInicio || initial.fechaInicio),
    fechaFin:        toDateInput(initial.FechaFin || initial.fechaFin),
    monto:           initial.Monto           ?? initial.monto           ?? '',
    metodoPago:      initial.MetodoPago      || initial.metodoPago      || '',
    razonSocial:     initial.RazonSocial     || initial.razonSocial     || '',
    ruc:             taxId,
    tipoIdentificacionFactura: billingType,
    direccionFactura:initial.DireccionFactura|| initial.direccionFactura|| '',
    estadoPago:      initial.EstadoPago      || initial.estadoPago      || 'pendiente',
    numeroComprobante: initial.NumeroComprobante || initial.numeroComprobante || initial.Notas || '',
    fechaPago:       toDateInput(initial.FechaPago || initial.fechaPago),
    notas:           initial.Notas           || initial.notas           || '',
    requiereAvalExterno: initial.RequiereAvalExterno === true || initial.RequiereAvalExterno === 'TRUE' ||
                         initial.requiereAvalExterno === true || false,
    institucionAval: initial.InstitucionAval || initial.institucionAval || '',
    institucionAvalId: initial.InstitucionID || initial.institucionAvalId || '',
    convenioId: initial.ConvenioID || initial.convenioId || '',
  }
}

export default function InscripcionesForm({ initial, onSave, onCancel }) {
  const { isAdmin } = useAuth()
  const [form, setForm]       = useState(() => mapInitial(initial))
  const [servicios, setServicios] = useState([])
  const [institucionesMaestras, setInstitucionesMaestras] = useState([])
  const [conveniosAval, setConveniosAval] = useState([])
  const [institucionesError, setInstitucionesError] = useState('')
  const [conveniosError, setConveniosError] = useState('')
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const [facturaIgual, setFacturaIgual] = useState(!initial)
  const initialInstitutionId = String(initial?.InstitucionID || initial?.institucionAvalId || '').trim()
  const initialInstitutionName = String(initial?.InstitucionAval || initial?.institucionAval || '').trim()
  const initialAgreementId = String(initial?.ConvenioID || initial?.convenioId || '').trim()
  const legacyInstitutionUnchanged = Boolean(initial && !initialInstitutionId
    && initialInstitutionName && form.institucionAval.trim() === initialInstitutionName)
  const unchangedLegacyAgreement = Boolean(initial && !initialAgreementId
    && form.institucionAvalId === initialInstitutionId)

  useEffect(() => {
    api.getServicios()
      .then(r => setServicios((r.data || []).filter(s => s.Activo)))
      .catch(() => {})
    api.getOpcionesInstitucionesMaestras()
      .then(r => setInstitucionesMaestras(r.data || []))
      .catch(() => setInstitucionesError('No se pudo cargar la lista maestra de instituciones.'))
  }, [])

  useEffect(() => {
    let current = true
    if (!form.requiereAvalExterno || !form.institucionAvalId) {
      setConveniosAval([])
      setConveniosError('')
      return () => { current = false }
    }
    setConveniosError('')
    api.getConveniosParaAval(form.institucionAvalId, form.convenioId)
      .then(result => { if (current) setConveniosAval(result.data || []) })
      .catch(err => { if (current) { setConveniosAval([]); setConveniosError(err.message || 'No se pudieron cargar los convenios.') } })
    return () => { current = false }
  }, [form.requiereAvalExterno, form.institucionAvalId, form.convenioId])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  function handleServicio(id) {
    const s = servicios.find(s => s.ID === id)
    set('servicioId', id)
    set('servicioNombre', s?.Nombre || '')
    if (!initial && s?.Precio) set('monto', s.Precio)
    if (s?.Modalidad) set('modalidad', s.Modalidad)
  }

  useEffect(() => {
    if (facturaIgual) {
      set('razonSocial', form.clienteNombre)
      set('ruc', form.clienteID)
      set('tipoIdentificacionFactura', form.clienteTipoIdentificacion)
    }
  }, [facturaIgual, form.clienteNombre, form.clienteID, form.clienteTipoIdentificacion])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const monto = Number(form.monto)
    const necesitaComprobante = ['transferencia', 'tarjeta', 'cheque']
      .some(tipo => form.metodoPago.toLowerCase().includes(tipo))
    if (!form.servicioId) return setError('Seleccione un servicio.')
    if (!form.clienteNombre.trim()) return setError('Ingrese el nombre del participante.')
    const originalIdentity = initial?.ClienteID ?? initial?.clienteID ?? ''
    const legacyIdentityUnchanged = Boolean(initial)
      && form.clienteTipoIdentificacion === IDENTIFICATION_TYPE.UNSPECIFIED
      && String(form.clienteID) === String(originalIdentity)
    const identityMessage = identificationError(form.clienteID, form.clienteTipoIdentificacion, {
      allowUnspecified: legacyIdentityUnchanged,
    })
    if (identityMessage) return setError(identityMessage)
    const originalTaxIdentity = initial?.RUC ?? initial?.ruc ?? ''
    const legacyBillingIdentityUnchanged = Boolean(initial)
      && form.tipoIdentificacionFactura === IDENTIFICATION_TYPE.UNSPECIFIED
      && String(form.ruc) === String(originalTaxIdentity)
    const billingIdentityMessage = identificationError(form.ruc, form.tipoIdentificacionFactura, {
      allowUnspecified: legacyBillingIdentityUnchanged,
      allowConsumerFinal: true,
    })
    if (billingIdentityMessage && form.ruc.trim()) return setError(`Identificación fiscal: ${billingIdentityMessage}`)
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
    if (form.requiereAvalExterno && !form.institucionAvalId && !legacyInstitutionUnchanged) {
      return setError('Seleccione una institución de la ficha maestra para el aval.')
    }
    if (form.requiereAvalExterno && !form.convenioId && !legacyInstitutionUnchanged && !unchangedLegacyAgreement) {
      return setError('Seleccione un convenio vigente con su regla económica configurada para registrar el aval.')
    }
    setSaving(true)
    try {
      if (initial && (initial.ID || initial.HistoricalKey)) {
        const result = await api.updateInscripcion(initial.ID || '', form, initial.HistoricalKey || '')
        if (result.persistenceVerified !== true) {
          throw new Error('El servidor no confirmó que la inscripción quedara guardada.')
        }
        if (isAdmin && initial.ID && form.estadoPago === 'verificado' && initial.EstadoPago !== 'verificado') {
          await api.verificarPagoInscripcion(initial.ID, {
            numeroComprobante: form.numeroComprobante,
            fechaPago: form.fechaPago,
          })
        }
        onSave(result.data, result.warning || '')
        return
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
            <label className="label" htmlFor="participantIdentityType">Tipo de identificación</label>
            <select id="participantIdentityType" className="input" value={form.clienteTipoIdentificacion}
              onChange={e => set('clienteTipoIdentificacion', e.target.value)}>
              {form.clienteTipoIdentificacion === IDENTIFICATION_TYPE.UNSPECIFIED && (
                <option value={IDENTIFICATION_TYPE.UNSPECIFIED}>No especificado (registro anterior)</option>
              )}
              <option value={IDENTIFICATION_TYPE.ECUADORIAN_ID}>Cédula ecuatoriana</option>
              <option value={IDENTIFICATION_TYPE.ECUADORIAN_RUC}>RUC ecuatoriano</option>
              <option value={IDENTIFICATION_TYPE.PASSPORT}>Pasaporte</option>
              <option value={IDENTIFICATION_TYPE.OTHER}>Otro documento</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="participantIdentity">Identificación</label>
            <input id="participantIdentity" className="input" type="text" inputMode={[IDENTIFICATION_TYPE.ECUADORIAN_ID, IDENTIFICATION_TYPE.ECUADORIAN_RUC].includes(form.clienteTipoIdentificacion) ? 'numeric' : 'text'}
              autoComplete="off" maxLength={64} value={form.clienteID}
              onChange={e => set('clienteID', e.target.value)} placeholder={form.clienteTipoIdentificacion === IDENTIFICATION_TYPE.ECUADORIAN_ID ? '10 dígitos; incluya el cero inicial' : form.clienteTipoIdentificacion === IDENTIFICATION_TYPE.ECUADORIAN_RUC ? '13 dígitos; incluya todos los ceros' : 'Número de documento'}
              aria-describedby="participantIdentityHelp" />
            <p id="participantIdentityHelp" className="mt-1 text-xs text-gray-500">
              {form.clienteTipoIdentificacion === IDENTIFICATION_TYPE.ECUADORIAN_ID
                ? 'Se valida estructura y dígito verificador; esto no confirma oficialmente la identidad.'
                : form.clienteTipoIdentificacion === IDENTIFICATION_TYPE.ECUADORIAN_RUC
                  ? 'Se comprueba el formato de 13 dígitos; no se consulta vigencia ni existencia en el SRI.'
                  : form.clienteTipoIdentificacion === IDENTIFICATION_TYPE.UNSPECIFIED
                    ? 'Registro anterior sin tipo documentado. Mantenga el valor y seleccione el tipo correcto si lo edita.'
                    : 'El documento se conserva como texto, incluidos ceros iniciales y letras.'}
            </p>
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
              <label className="label" htmlFor="billingIdentityType">Tipo de identificación fiscal</label>
              <select id="billingIdentityType" className="input" value={form.tipoIdentificacionFactura}
                onChange={e => {
                const nextType = e.target.value
                set('tipoIdentificacionFactura', nextType)
                if (nextType === IDENTIFICATION_TYPE.CONSUMER_FINAL) set('ruc', '9999999999999')
                else if (form.tipoIdentificacionFactura === IDENTIFICATION_TYPE.CONSUMER_FINAL && form.ruc === '9999999999999') set('ruc', '')
                }} aria-describedby="billingIdentityHelp">
                {form.tipoIdentificacionFactura === IDENTIFICATION_TYPE.UNSPECIFIED && (
                  <option value={IDENTIFICATION_TYPE.UNSPECIFIED}>No especificado (registro anterior)</option>
                )}
                <option value={IDENTIFICATION_TYPE.ECUADORIAN_ID}>Cédula ecuatoriana</option>
                <option value={IDENTIFICATION_TYPE.ECUADORIAN_RUC}>RUC ecuatoriano</option>
                <option value={IDENTIFICATION_TYPE.PASSPORT}>Pasaporte</option>
                <option value={IDENTIFICATION_TYPE.CONSUMER_FINAL}>Consumidor final (SRI)</option>
                <option value={IDENTIFICATION_TYPE.OTHER}>Otro documento</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="billingIdentity">Identificación fiscal</label>
              <input id="billingIdentity" className={`input ${form.tipoIdentificacionFactura === IDENTIFICATION_TYPE.CONSUMER_FINAL ? 'bg-gray-50 text-gray-600' : ''}`} type="text"
                inputMode={[IDENTIFICATION_TYPE.ECUADORIAN_ID, IDENTIFICATION_TYPE.ECUADORIAN_RUC].includes(form.tipoIdentificacionFactura) ? 'numeric' : 'text'}
                autoComplete="off" maxLength={64} value={form.ruc}
                readOnly={form.tipoIdentificacionFactura === IDENTIFICATION_TYPE.CONSUMER_FINAL}
                onChange={e => set('ruc', e.target.value)} placeholder="Número tributario" />
              <p id="billingIdentityHelp" className="mt-1 text-xs text-gray-500">
                {form.tipoIdentificacionFactura === IDENTIFICATION_TYPE.ECUADORIAN_ID
                  ? 'Se valida la cédula; esto no confirma oficialmente la identidad.'
                  : form.tipoIdentificacionFactura === IDENTIFICATION_TYPE.ECUADORIAN_RUC
                    ? 'Se valida el formato de 13 dígitos; no se consulta vigencia ni existencia en el SRI.'
                    : form.tipoIdentificacionFactura === IDENTIFICATION_TYPE.CONSUMER_FINAL
                      ? 'Se enviará al SRI como venta a consumidor final (tipo 07), con la identificación fija 9999999999999.'
                    : form.tipoIdentificacionFactura === IDENTIFICATION_TYPE.UNSPECIFIED
                      ? 'Registro anterior sin tipo guardado. Mantenga el dato o seleccione el tipo correcto.'
                      : 'El documento fiscal se conserva como texto, incluidos ceros iniciales y letras.'}
              </p>
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
              <label className="label" htmlFor="institutionAvalId">Institución avaladora *</label>
              <select id="institutionAvalId" className="input" required={!(initial && !initialInstitutionId && initialInstitutionName)}
                value={form.institucionAvalId}
                onChange={e => {
                  const id = e.target.value
                  const selected = institucionesMaestras.find(item => item.ID === id)
                  setForm(current => ({ ...current,
                    institucionAvalId: id,
                    institucionAval: selected?.Nombre || (legacyInstitutionUnchanged ? initialInstitutionName : ''),
                    convenioId: id === current.institucionAvalId ? current.convenioId : '',
                  }))
                }}>
                <option value="">{legacyInstitutionUnchanged ? `Conservar registro anterior: ${initialInstitutionName}` : 'Seleccionar institución activa...'}</option>
                {initialInstitutionId && !institucionesMaestras.some(item => item.ID === initialInstitutionId) && (
                  <option value={initialInstitutionId}>{initialInstitutionName || 'Institución vinculada'} (histórica/inactiva)</option>
                )}
                {institucionesMaestras.map(item => (
                  <option key={item.ID} value={item.ID}>{item.Nombre}{item.Siglas ? ` (${item.Siglas})` : ''}</option>
                ))}
              </select>
              {legacyInstitutionUnchanged && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 mt-2">
                  Esta inscripción anterior conserva el nombre original sin enlace. Si desea normalizarla, seleccione una ficha maestra; no se modificará hasta guardar.
                </p>
              )}
              {institucionesError && <p role="status" className="mt-2 text-xs text-amber-700">{institucionesError} Puede conservar el dato histórico, pero no crear un nuevo aval sin seleccionar una ficha.</p>}
              {!institucionesError && institucionesMaestras.length === 0 && !legacyInstitutionUnchanged && (
                <p className="mt-2 text-xs text-amber-700">Aún no hay instituciones activas. Solicite a administración que cree la ficha maestra antes de registrar el aval.</p>
              )}
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 mt-2">
                El certificado quedará pendiente hasta que la institución entregue su referencia, código o enlace. El QR será únicamente el de verificación de R.A. Training.
              </p>
              {!legacyInstitutionUnchanged && form.institucionAvalId && (
                <div className="mt-4">
                  <label className="label" htmlFor="aval-agreement">Convenio aplicable *</label>
                  <select id="aval-agreement" className="input" required={!unchangedLegacyAgreement}
                    value={form.convenioId}
                    onChange={e => set('convenioId', e.target.value)}>
                    <option value="">Seleccione un convenio con regla económica…</option>
                    {conveniosAval.map(item => (
                      <option key={item.ID} value={item.ID} disabled={!item.DisponibleParaAval}>
                        {item.Objeto || item.ID}{item.PorcentajeAval !== '' && item.PorcentajeAval !== undefined ? ` · ${Number(item.PorcentajeAval)}%` : ' · requiere configuración'}
                        {!item.DisponibleParaAval ? ' (no vigente/configurable)' : ''}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-gray-500">
                    La regla vigente se comprobará de nuevo al confirmar el aval. Si administración cambia el porcentaje antes de esa confirmación, se aplicará la condición vigente en ese momento.
                  </p>
                  {conveniosError && <p role="status" className="mt-2 text-xs text-red-700">{conveniosError}</p>}
                  {!conveniosError && conveniosAval.length === 0 && <p className="mt-2 text-xs text-amber-700">
                    No hay convenios aplicables disponibles. Administración debe vincular uno vigente a esta institución y configurar porcentaje y base.
                  </p>}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {!isAdmin && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
          La inscripción quedará <strong>pendiente de verificación</strong> hasta que el administrador la confirme.
        </div>
      )}

      {error && <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}

      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onCancel} className="btn-secondary flex-1">Cancelar</button>
        <button type="submit" className="btn-primary flex-1" disabled={saving}>
          {saving ? (initial ? 'Actualizando...' : 'Guardando...') : initial ? 'Actualizar' : 'Registrar Inscripción'}
        </button>
      </div>
    </form>
  )
}
