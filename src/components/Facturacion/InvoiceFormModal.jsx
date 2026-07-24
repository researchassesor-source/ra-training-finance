import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Calculator, FilePlus2, Info, Plus, Search, ShieldAlert, Trash2 } from 'lucide-react'
import Modal from '../UI/Modal'

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil' }).format(new Date())
const money = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100
const newItem = (source) => ({
  id: crypto.randomUUID(), mainCode: source?.serviceCode || 'CUR-DEMO', auxiliaryCode: '',
  description: source?.serviceName || '', quantity: '1', unitPrice: source?.amount || '0.00', discount: '0.00',
  taxCode: '2', percentageCode: '0', rate: '0.00', taxCategory: 'IVA_0', fiscalClassificationValidated: false,
})
const newPayment = (amount = '0.00') => ({ id: crypto.randomUUID(), methodCode: '20', amount, term: '', timeUnit: 'dias' })

function Section({ letter, title, hint, children }) {
  return <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
    <div className="mb-4 flex items-start gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-700 text-sm font-bold text-white">{letter}</span><div><h3 className="font-bold text-brand-900">{title}</h3>{hint && <p className="mt-0.5 text-xs text-gray-500">{hint}</p>}</div></div>
    {children}
  </section>
}

export default function InvoiceFormModal({ source, config, paymentMethods = [], readiness, onClose, onSubmit, loading }) {
  const initial = useMemo(() => ({
    issueDate: today(), identificationType: '05', identification: source?.participantIdentification || '',
    legalName: source?.participantName || '', address: source?.participantAddress || '', email: source?.participantEmail || '',
    phone: source?.participantPhone || '', participantName: source?.participantName || '', remissionGuide: '', negotiableInvoice: false, tip: '0.00',
  }), [source])
  const [form, setForm] = useState(initial)
  const [items, setItems] = useState([newItem(source)])
  const [payments, setPayments] = useState([newPayment(source?.amount || '0.00')])
  const [additionalFields, setAdditionalFields] = useState([{ id: crypto.randomUUID(), name: 'Curso', value: source?.serviceName || '' }])
  useEffect(() => { setForm(initial); setItems([newItem(source)]); setPayments([newPayment(source?.amount || '0.00')]); setAdditionalFields([{ id: crypto.randomUUID(), name: 'Curso', value: source?.serviceName || '' }]) }, [initial, source])

  const totals = useMemo(() => {
    let gross = 0; let discount = 0; let tax = 0
    items.forEach((item) => { const rowGross = money(Number(item.quantity) * Number(item.unitPrice)); const rowDiscount = money(item.discount); const base = Math.max(0, money(rowGross - rowDiscount)); gross += rowGross; discount += rowDiscount; tax += money(base * Number(item.rate) / 100) })
    const withoutTaxes = money(gross - discount); const taxes = money(tax); const total = money(withoutTaxes + taxes + Number(form.tip || 0))
    return { gross: money(gross), discount: money(discount), withoutTaxes, taxes, total }
  }, [items, form.tip])
  const paid = money(payments.reduce((sum, item) => sum + Number(item.amount || 0), 0))
  const paymentDifference = money(totals.total - paid)
  useEffect(() => { setPayments((current) => current.length === 1 ? [{ ...current[0], amount: totals.total.toFixed(2) }] : current) }, [totals.total])
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  const setItem = (id, key, value) => setItems((current) => current.map((item) => item.id === id ? { ...item, [key]: value } : item))
  const setPayment = (id, key, value) => setPayments((current) => current.map((item) => item.id === id ? { ...item, [key]: value } : item))
  const setAdditional = (id, key, value) => setAdditionalFields((current) => current.map((item) => item.id === id ? { ...item, [key]: value } : item))

  async function submit(event) {
    event.preventDefault()
    await onSubmit({
      sourceEnrollmentId: source.id, issueDate: form.issueDate,
      customer: { identificationType: form.identificationType, identification: form.identification, legalName: form.legalName, address: form.address, email: form.email, phone: form.phone, sourceParticipantId: `PART-${source.id}` },
      participantName: form.participantName, remissionGuide: form.remissionGuide || undefined, negotiableInvoice: form.negotiableInvoice, tip: Number(form.tip || 0).toFixed(2),
      items: items.map(({ id, ...item }) => item),
      payments: payments.map(({ id, term, ...payment }) => ({ ...payment, amount: Number(payment.amount || 0).toFixed(2), ...(term !== '' ? { term: Number(term) } : {}) })),
      additionalFields: additionalFields.filter((field) => field.name.trim() && field.value.trim()).map(({ id, ...field }) => field),
    })
  }

  const blockers = readiness?.officialBlockers || ['Configuración institucional incompleta', 'Conexión oficial deshabilitada']
  const issuer = config?.issuer || {}
  return <Modal open={Boolean(source)} onClose={onClose} title="Nueva factura de prueba" size="xl">
    {source && <form onSubmit={submit} className="space-y-4">
      <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800"><p className="flex items-center gap-2 font-semibold"><ShieldAlert size={16} /> DOCUMENTO DE PRUEBA - SIN VALIDEZ TRIBUTARIA</p><p className="mt-1">La organización funcional toma como referencia el Facturador SRI, con identidad visual propia y datos de prueba.</p></div>

      <Section letter="A" title="Datos de emisión" hint="Serie de prueba; el secuencial oficial continúa bloqueado.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label><span className="label">Establecimiento</span><input className="input bg-gray-50" value={`${config?.establishment?.code || '001'} - ${issuer.tradeName || 'Emisor de prueba'}`} readOnly /></label>
          <label><span className="label">Punto de emisión</span><input className="input bg-gray-50" value={config?.emissionPoint?.code || '001'} readOnly /></label>
          <label><span className="label">Fecha de emisión</span><input className="input" type="date" value={form.issueDate} onChange={(event) => set('issueDate', event.target.value)} required /></label>
          <label><span className="label">Guía de remisión (opcional)</span><input className="input" value={form.remissionGuide} onChange={(event) => set('remissionGuide', event.target.value)} placeholder="001-001-000000001" /></label>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={form.negotiableInvoice} onChange={(event) => set('negotiableInvoice', event.target.checked)} /> Factura comercial negociable (opción preparada; requiere validación oficial)</label>
      </Section>

      <Section letter="B" title="Adquirente" hint="El comprador puede ser distinto del participante.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label><span className="label">Tipo de identificación</span><select className="input" value={form.identificationType} onChange={(event) => set('identificationType', event.target.value)}><option value="05">05 - Cédula</option><option value="04">04 - RUC</option><option value="06">06 - Pasaporte</option><option value="08">08 - Identificación exterior</option><option value="07">07 - Consumidor final</option></select></label>
          <label><span className="label">Identificación</span><span className="flex gap-2"><input className="input" value={form.identification} onChange={(event) => set('identification', event.target.value)} required /><button type="button" className="btn-secondary px-3" title="Búsqueda futura deshabilitada"><Search size={16} /></button></span></label>
          <label><span className="label">Teléfono</span><input className="input" value={form.phone} onChange={(event) => set('phone', event.target.value)} /></label>
          <label className="sm:col-span-2"><span className="label">Razón social / nombres</span><input className="input" value={form.legalName} onChange={(event) => set('legalName', event.target.value)} required /></label>
          <label><span className="label">Correo del receptor</span><input className="input" type="email" value={form.email} onChange={(event) => set('email', event.target.value)} required /></label>
          <label className="sm:col-span-2"><span className="label">Dirección</span><input className="input" value={form.address} onChange={(event) => set('address', event.target.value)} required /></label>
          <label><span className="label">Participante</span><input className="input" value={form.participantName} onChange={(event) => set('participantName', event.target.value)} /></label>
        </div>
      </Section>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-4">
          <Section letter="C" title="Detalle" hint="Varias líneas; la clasificación tributaria real no se asigna automáticamente.">
            <div className="space-y-3">{items.map((item, index) => <article key={item.id} className="rounded-xl border border-gray-200 bg-slate-50 p-3">
              <div className="mb-3 flex items-center justify-between"><strong className="text-sm text-brand-900">Línea {index + 1}</strong><button type="button" className="rounded-lg p-2 text-red-600 hover:bg-red-50" disabled={items.length === 1} onClick={() => setItems((current) => current.filter((row) => row.id !== item.id))} title="Eliminar línea"><Trash2 size={16} /></button></div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label><span className="label">Código principal</span><input className="input" value={item.mainCode} onChange={(event) => setItem(item.id, 'mainCode', event.target.value)} required /></label>
                <label><span className="label">Código auxiliar</span><input className="input" value={item.auxiliaryCode} onChange={(event) => setItem(item.id, 'auxiliaryCode', event.target.value)} /></label>
                <label className="sm:col-span-2"><span className="label">Descripción</span><input className="input" value={item.description} onChange={(event) => setItem(item.id, 'description', event.target.value)} required /></label>
                <label><span className="label">Cantidad</span><input className="input" inputMode="decimal" value={item.quantity} onChange={(event) => setItem(item.id, 'quantity', event.target.value)} required /></label>
                <label><span className="label">Precio unitario</span><input className="input" inputMode="decimal" value={item.unitPrice} onChange={(event) => setItem(item.id, 'unitPrice', event.target.value)} required /></label>
                <label><span className="label">Descuento</span><input className="input" inputMode="decimal" value={item.discount} onChange={(event) => setItem(item.id, 'discount', event.target.value)} required /></label>
                <label><span className="label">Tarifa ilustrativa</span><select className="input" value={item.percentageCode} onChange={(event) => { const option = event.target.selectedOptions[0]; setItems((current) => current.map((row) => row.id === item.id ? { ...row, percentageCode: event.target.value, rate: option.dataset.rate, taxCategory: option.dataset.category, fiscalClassificationValidated: false } : row)) }}><option value="0" data-rate="0.00" data-category="IVA_0">IVA 0 % - revisar</option><option value="5" data-rate="5.00" data-category="IVA_5">IVA 5 % - revisar</option><option value="4" data-rate="15.00" data-category="GENERAL">IVA 15 % - revisar</option><option value="6" data-rate="0.00" data-category="NOT_SUBJECT">No objeto - revisar</option><option value="7" data-rate="0.00" data-category="EXEMPT">Exento - revisar</option></select></label>
              </div><p className="mt-2 flex items-center gap-1 text-[11px] font-medium text-amber-700"><AlertTriangle size={13} /> REQUIERE REVISIÓN TRIBUTARIA antes de una emisión oficial.</p>
            </article>)}</div>
            <div className="mt-3 flex flex-wrap gap-2"><button type="button" className="btn-secondary" onClick={() => setItems((current) => [...current, newItem(null)])}><Plus size={16} /> Agregar línea manual</button><button type="button" className="btn-secondary" disabled title="Se habilitará cuando el catálogo sea validado"><Search size={16} /> Buscar en catálogo</button></div>
          </Section>

          <Section letter="D" title="Formas de pago" hint="La suma debe coincidir exactamente con el valor total.">
            <div className="space-y-3">{payments.map((payment) => <div key={payment.id} className="grid gap-3 rounded-xl border border-gray-200 p-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_100px_120px_auto]">
              <label><span className="label">Forma</span><select className="input" value={payment.methodCode} onChange={(event) => setPayment(payment.id, 'methodCode', event.target.value)}>{paymentMethods.map((method) => <option key={method.code} value={method.code}>{method.code} - {method.shortLabel || method.label}</option>)}</select></label>
              <label><span className="label">Valor</span><input className="input" inputMode="decimal" value={payment.amount} onChange={(event) => setPayment(payment.id, 'amount', event.target.value)} required /></label>
              <label><span className="label">Plazo</span><input className="input" type="number" min="0" value={payment.term} onChange={(event) => setPayment(payment.id, 'term', event.target.value)} /></label>
              <label><span className="label">Unidad</span><select className="input" value={payment.timeUnit} onChange={(event) => setPayment(payment.id, 'timeUnit', event.target.value)}><option value="dias">Días</option><option value="meses">Meses</option><option value="anios">Años</option></select></label>
              <button type="button" className="self-end rounded-lg p-2.5 text-red-600 hover:bg-red-50" disabled={payments.length === 1} onClick={() => setPayments((current) => current.filter((row) => row.id !== payment.id))}><Trash2 size={16} /></button>
            </div>)}</div>
            <button type="button" className="btn-secondary mt-3" onClick={() => setPayments((current) => [...current, newPayment('0.00')])}><Plus size={16} /> Agregar forma de pago</button>
            <p className={`mt-3 text-xs font-semibold ${paymentDifference === 0 ? 'text-emerald-700' : 'text-red-700'}`}>Registrado: ${paid.toFixed(2)} · Diferencia: ${paymentDifference.toFixed(2)}</p>
          </Section>

          <Section letter="E" title="Campos adicionales" hint="No se permiten secretos, saltos de línea ni etiquetas XML.">
            <div className="space-y-2">{additionalFields.map((field) => <div key={field.id} className="grid gap-2 sm:grid-cols-[180px_1fr_auto]"><input className="input" value={field.name} onChange={(event) => setAdditional(field.id, 'name', event.target.value)} placeholder="Nombre" maxLength={60} /><input className="input" value={field.value} onChange={(event) => setAdditional(field.id, 'value', event.target.value)} placeholder="Descripción" maxLength={300} /><button type="button" className="rounded-lg p-2 text-red-600 hover:bg-red-50" onClick={() => setAdditionalFields((current) => current.filter((row) => row.id !== field.id))}><Trash2 size={16} /></button></div>)}</div>
            <button type="button" className="btn-secondary mt-3" onClick={() => setAdditionalFields((current) => [...current, { id: crypto.randomUUID(), name: '', value: '' }])}><Plus size={16} /> Agregar campo</button>
          </Section>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-0">
          <Section letter="F" title="Totales">
            <dl className="space-y-2 text-sm"><div className="flex justify-between"><dt>Subtotal bruto</dt><dd>${totals.gross.toFixed(2)}</dd></div><div className="flex justify-between"><dt>Descuento</dt><dd>${totals.discount.toFixed(2)}</dd></div><div className="flex justify-between"><dt>Sin impuestos</dt><dd>${totals.withoutTaxes.toFixed(2)}</dd></div>{totals.taxes !== 0 && <div className="flex justify-between"><dt>IVA</dt><dd>${totals.taxes.toFixed(2)}</dd></div>}<label className="block border-t pt-2"><span className="label">Propina opcional</span><input className="input text-right" inputMode="decimal" value={form.tip} onChange={(event) => set('tip', event.target.value)} /></label><div className="flex justify-between border-t pt-3 text-base font-bold text-brand-900"><dt>VALOR TOTAL</dt><dd>${totals.total.toFixed(2)}</dd></div></dl>
            <p className="mt-3 flex items-start gap-1 text-[11px] text-gray-500"><Calculator size={14} className="mt-0.5 shrink-0" /> El servicio recalcula con decimales exactos.</p>
          </Section>
          <Section letter="G" title="Acciones">
            <div className="space-y-2"><button type="submit" className="btn-primary w-full justify-center" disabled={loading || paymentDifference !== 0}><FilePlus2 size={17} /> {loading ? 'Guardando...' : 'Guardar borrador'}</button><button type="button" className="btn-secondary w-full justify-center" disabled><ShieldAlert size={16} /> Firmar y enviar</button></div>
            <details className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900"><summary className="cursor-pointer font-semibold">¿Por qué está bloqueado?</summary><ul className="mt-2 space-y-1 pl-4">{blockers.map((blocker) => <li key={blocker} className="list-disc">{blocker}</li>)}</ul></details>
            <p className="mt-3 flex gap-1 text-[11px] text-gray-500"><Info size={14} className="shrink-0" /> “Completar flujo de prueba” estará disponible después de guardar.</p>
          </Section>
        </aside>
      </div>
      <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end"><button type="button" className="btn-secondary justify-center" onClick={onClose}>Cancelar</button><button type="submit" className="btn-primary justify-center xl:hidden" disabled={loading || paymentDifference !== 0}><FilePlus2 size={17} /> Guardar borrador</button></div>
    </form>}
  </Modal>
}
