import { useEffect, useMemo, useState } from 'react'
import { Calculator, FilePlus2, ShieldAlert } from 'lucide-react'
import Modal from '../UI/Modal'

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil' }).format(new Date())

export default function InvoiceFormModal({ source, onClose, onSubmit, loading }) {
  const initial = useMemo(() => {
    const gross = source ? Number(source.amount) : 115
    const base = (gross / 1.15).toFixed(2)
    return {
      issueDate: today(),
      identificationType: '05',
      identification: source?.participantIdentification || '',
      legalName: source?.participantName || '',
      address: source?.participantAddress || '',
      email: source?.participantEmail || '',
      phone: source?.participantPhone || '',
      description: source?.serviceName || '',
      mainCode: source?.serviceCode || 'CUR-DEMO',
      quantity: '1', unitPrice: base, discount: '0.00', rate: '15.00', percentageCode: '4', paymentMethodCode: '20',
    }
  }, [source])
  const [form, setForm] = useState(initial)
  useEffect(() => setForm(initial), [initial])
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  const base = Math.max(0, Number(form.quantity || 0) * Number(form.unitPrice || 0) - Number(form.discount || 0))
  const tax = base * Number(form.rate || 0) / 100
  const total = base + tax

  async function submit(event) {
    event.preventDefault()
    await onSubmit({
      sourceEnrollmentId: source.id,
      issueDate: form.issueDate,
      customer: {
        identificationType: form.identificationType,
        identification: form.identification,
        legalName: form.legalName,
        address: form.address,
        email: form.email,
        phone: form.phone,
        sourceParticipantId: `PART-${source.id}`,
      },
      items: [{
        mainCode: form.mainCode,
        description: form.description,
        quantity: form.quantity,
        unitPrice: form.unitPrice,
        discount: form.discount,
        taxCode: '2',
        percentageCode: form.percentageCode,
        rate: form.rate,
      }],
      paymentMethodCode: form.paymentMethodCode,
    })
  }

  return (
    <Modal open={Boolean(source)} onClose={onClose} title="Nueva factura ficticia" size="xl">
      {source && <form onSubmit={submit} className="space-y-5">
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
          <p className="flex items-center gap-2 font-semibold"><ShieldAlert size={16} /> Datos exclusivamente ficticios</p>
          <p className="mt-1">La tarifa seleccionada es un ejemplo del catálogo SRI; su aplicabilidad requiere revisión tributaria institucional.</p>
        </div>

        <section>
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-brand-800">Origen y cliente</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label><span className="label">Inscripción ficticia</span><input className="input bg-gray-50" value={source.id} readOnly /></label>
            <label><span className="label">Fecha de emisión</span><input className="input" type="date" value={form.issueDate} onChange={(e) => set('issueDate', e.target.value)} required /></label>
            <label><span className="label">Tipo de identificación</span><select className="input" value={form.identificationType} onChange={(e) => set('identificationType', e.target.value)}><option value="05">Cédula</option><option value="04">RUC</option><option value="06">Pasaporte</option><option value="07">Consumidor final</option></select></label>
            <label><span className="label">Identificación</span><input className="input" value={form.identification} onChange={(e) => set('identification', e.target.value)} required /></label>
            <label className="sm:col-span-2"><span className="label">Razón social / nombre</span><input className="input" value={form.legalName} onChange={(e) => set('legalName', e.target.value)} required /></label>
            <label className="sm:col-span-2"><span className="label">Dirección</span><input className="input" value={form.address} onChange={(e) => set('address', e.target.value)} required /></label>
            <label><span className="label">Correo</span><input className="input" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} required /></label>
          </div>
        </section>

        <section>
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-brand-800">Detalle e impuesto de demostración</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label><span className="label">Código</span><input className="input" value={form.mainCode} onChange={(e) => set('mainCode', e.target.value)} required /></label>
            <label className="sm:col-span-2"><span className="label">Descripción</span><input className="input" value={form.description} onChange={(e) => set('description', e.target.value)} required /></label>
            <label><span className="label">Cantidad</span><input className="input" inputMode="decimal" value={form.quantity} onChange={(e) => set('quantity', e.target.value)} required /></label>
            <label><span className="label">Precio unitario</span><input className="input" inputMode="decimal" value={form.unitPrice} onChange={(e) => set('unitPrice', e.target.value)} required /></label>
            <label><span className="label">Descuento</span><input className="input" inputMode="decimal" value={form.discount} onChange={(e) => set('discount', e.target.value)} required /></label>
            <label><span className="label">IVA de ejemplo</span><select className="input" value={form.percentageCode} onChange={(e) => { const option = e.target.selectedOptions[0]; setForm((current) => ({ ...current, percentageCode: e.target.value, rate: option.dataset.rate })) }}><option value="0" data-rate="0.00">0%</option><option value="4" data-rate="15.00">15%</option></select></label>
            <label><span className="label">Forma de pago</span><select className="input" value={form.paymentMethodCode} onChange={(e) => set('paymentMethodCode', e.target.value)}><option value="20">Otros - sistema financiero</option><option value="01">Sin sistema financiero</option><option value="19">Tarjeta de crédito</option></select></label>
          </div>
        </section>

        <div className="grid gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-4">
          <p><span className="block text-xs text-gray-500">Base</span><strong>${base.toFixed(2)}</strong></p>
          <p><span className="block text-xs text-gray-500">Impuesto</span><strong>${tax.toFixed(2)}</strong></p>
          <p><span className="block text-xs text-gray-500">Total</span><strong className="text-brand-800">${total.toFixed(2)}</strong></p>
          <p className="flex items-center gap-2 text-xs text-gray-500"><Calculator size={17} /> El backend recalcula con Decimal.</p>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
          <button type="button" className="btn-secondary justify-center" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn-primary justify-center" disabled={loading}><FilePlus2 size={17} /> {loading ? 'Creando...' : 'Crear borrador local'}</button>
        </div>
      </form>}
    </Modal>
  )
}
