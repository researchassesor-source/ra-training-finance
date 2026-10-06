import { useCallback, useEffect, useMemo, useState } from 'react'
import { Archive, Building2, CheckCircle2, FileText, Image, Landmark, Link2, Pencil, PenTool, Plus, Search, ShieldCheck, Upload } from 'lucide-react'
import { api } from '../../services/api'
import { fmt } from '../../utils/formatters'
import Modal from '../UI/Modal'
import ConfirmDialog from '../UI/ConfirmDialog'
import Spinner from '../UI/Spinner'

const EMPTY_INSTITUTION = {
  nombre: '', nombreLegal: '', nombreComercial: '', siglas: '', identificacion: '',
  tipoIdentificacion: 'RUC_EC', tipo: '', telefono: '', email: '', direccion: '',
  ciudad: '', provincia: '', sitioWeb: '', codigoResolucion: '', estado: 'activo', notas: '',
}

const EMPTY_AUTHORITY = {
  nombre: '', identificacion: '', tipoIdentificacion: 'CEDULA_EC', cargo: '', funcion: '',
  esRepresentanteLegal: false, firmaConvenios: false, firmaCertificados: false,
  fechaInicio: '', fechaFin: '', estado: 'activo', notas: '',
}

function checked(value) { return value === true || String(value).toLowerCase() === 'true' }
function institutionFormValue(item) {
  if (!item) return EMPTY_INSTITUTION
  return {
    nombre: item.Nombre || '', nombreLegal: item.NombreLegal || '', nombreComercial: item.NombreComercial || '',
    siglas: item.Siglas || '', identificacion: item.Identificacion || '', tipoIdentificacion: item.TipoIdentificacion || 'RUC_EC',
    tipo: item.Tipo || '', telefono: item.Telefono || '', email: item.Email || '', direccion: item.Direccion || '',
    ciudad: item.Ciudad || '', provincia: item.Provincia || '', sitioWeb: item.SitioWeb || '',
    codigoResolucion: item.CodigoResolucion || '',
    estado: item.Estado || 'activo', notas: item.Notas || '',
  }
}
function authorityFormValue(item) {
  if (!item) return EMPTY_AUTHORITY
  return {
    nombre: item.Nombre || '', identificacion: item.Identificacion || '', tipoIdentificacion: item.TipoIdentificacion || 'CEDULA_EC',
    cargo: item.Cargo || '', funcion: item.Funcion || '', esRepresentanteLegal: checked(item.EsRepresentanteLegal),
    firmaConvenios: checked(item.FirmaConvenios), firmaCertificados: checked(item.FirmaCertificados),
    fechaInicio: String(item.FechaInicio || '').slice(0, 10), fechaFin: String(item.FechaFin || '').slice(0, 10),
    estado: item.Estado || 'activo', notas: item.Notas || '',
  }
}
function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('No se pudo leer el archivo seleccionado.'))
    reader.onload = () => resolve({ base64: reader.result, mimeType: file.type, nombreArchivo: file.name })
    reader.readAsDataURL(file)
  })
}
function sizeLabel(bytes) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}
function downloadPrivateFile(result) {
  const binary = atob(result.base64)
  const chunks = []
  for (let offset = 0; offset < binary.length; offset += 1024 * 512) {
    const slice = binary.slice(offset, offset + 1024 * 512)
    const bytes = new Uint8Array(slice.length)
    for (let index = 0; index < slice.length; index += 1) bytes[index] = slice.charCodeAt(index)
    chunks.push(bytes)
  }
  const blob = new Blob(chunks, { type: result.mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = result.nombreArchivo || 'archivo-institucional'
  anchor.click()
  URL.revokeObjectURL(url)
}

function InstitutionForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(() => institutionFormValue(initial))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmDuplicate, setConfirmDuplicate] = useState(false)
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }))

  async function submit(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      if (initial?.ID) await api.updateInstitucionMaestra(initial.ID, form, confirmDuplicate)
      else await api.addInstitucionMaestra(form, confirmDuplicate)
      onSave()
    } catch (cause) {
      setError(cause.message)
      setConfirmDuplicate(false)
    } finally { setSaving(false) }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-800">
        Registre aquí a la entidad externa una sola vez. Sus convenios, autoridades y archivos se administran en secciones separadas.
      </div>
      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-brand-700">Datos generales</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><label className="label" htmlFor="institution-name">Nombre institucional *</label>
            <input id="institution-name" className="input" required maxLength={180} value={form.nombre} onChange={e => set('nombre', e.target.value)} /></div>
          <div><label className="label" htmlFor="institution-short">Siglas / nombre corto</label>
            <input id="institution-short" className="input" maxLength={40} value={form.siglas} onChange={e => set('siglas', e.target.value)} /></div>
          <div><label className="label" htmlFor="institution-type">Tipo de institución</label>
            <input id="institution-type" className="input" maxLength={80} placeholder="Instituto, universidad, empresa…" value={form.tipo} onChange={e => set('tipo', e.target.value)} /></div>
          <div><label className="label" htmlFor="institution-id-type">Identificación</label>
            <div className="flex gap-2"><select id="institution-id-type" className="input w-40" value={form.tipoIdentificacion} onChange={e => set('tipoIdentificacion', e.target.value)}>
              <option value="RUC_EC">RUC Ecuador</option><option value="OTRO">Otra</option>
            </select><input className="input min-w-0 flex-1" inputMode="text" maxLength={64} value={form.identificacion} onChange={e => set('identificacion', e.target.value)} placeholder="Se conserva como texto" /></div></div>
          <div><label className="label" htmlFor="institution-legal-name">Razón social</label>
            <input id="institution-legal-name" className="input" maxLength={180} value={form.nombreLegal} onChange={e => set('nombreLegal', e.target.value)} /></div>
          <div><label className="label" htmlFor="institution-business-name">Nombre comercial</label>
            <input id="institution-business-name" className="input" maxLength={180} value={form.nombreComercial} onChange={e => set('nombreComercial', e.target.value)} /></div>
          <div><label className="label" htmlFor="institution-email">Correo institucional</label>
            <input id="institution-email" className="input" type="email" value={form.email} onChange={e => set('email', e.target.value)} /></div>
          <div><label className="label" htmlFor="institution-phone">Teléfono</label>
            <input id="institution-phone" className="input" type="tel" maxLength={40} value={form.telefono} onChange={e => set('telefono', e.target.value)} /></div>
          <div className="sm:col-span-2"><label className="label" htmlFor="institution-address">Dirección</label>
            <input id="institution-address" className="input" maxLength={240} value={form.direccion} onChange={e => set('direccion', e.target.value)} /></div>
          <div><label className="label" htmlFor="institution-city">Ciudad</label>
            <input id="institution-city" className="input" value={form.ciudad} onChange={e => set('ciudad', e.target.value)} /></div>
          <div><label className="label" htmlFor="institution-province">Provincia</label>
            <input id="institution-province" className="input" value={form.provincia} onChange={e => set('provincia', e.target.value)} /></div>
          <div><label className="label" htmlFor="institution-web">Sitio web</label>
            <input id="institution-web" className="input" type="url" placeholder="https://…" value={form.sitioWeb} onChange={e => set('sitioWeb', e.target.value)} /></div>
          <div><label className="label" htmlFor="institution-resolution-code">Código de resolución institucional</label>
            <input id="institution-resolution-code" className="input" maxLength={100} placeholder="Ej.: RPC-SO-22-No.364-2024" value={form.codigoResolucion} onChange={e => set('codigoResolucion', e.target.value)} />
            <p className="mt-1 text-xs text-gray-500">Identifica jurídicamente a la institución; es distinto del código único que asigna a cada aval.</p>
          </div>
          <div><label className="label" htmlFor="institution-state">Estado</label>
            <select id="institution-state" className="input" value={form.estado} onChange={e => set('estado', e.target.value)}><option value="activo">Activa</option><option value="inactivo">Inactiva</option></select></div>
          <div className="sm:col-span-2"><label className="label" htmlFor="institution-notes">Notas administrativas</label>
            <textarea id="institution-notes" className="input" rows={3} maxLength={1500} value={form.notas} onChange={e => set('notas', e.target.value)} /></div>
        </div>
      </section>
      {error && <div className="space-y-2 rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">
        <p>{error}</p>{/confirme explícitamente/i.test(error) && <button type="button" className="btn-secondary text-xs" onClick={() => { setConfirmDuplicate(true); setError('') }}>Confirmar que es otra entidad y continuar</button>}
      </div>}
      <div className="flex gap-3 border-t border-gray-100 pt-4"><button type="button" className="btn-secondary flex-1" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="btn-primary flex-1" disabled={saving}>{saving ? 'Guardando…' : initial?.ID ? 'Guardar ficha' : 'Crear ficha institucional'}</button></div>
    </form>
  )
}

function AuthorityForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(() => authorityFormValue(initial))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }))
  async function submit(event) {
    event.preventDefault(); setSaving(true); setError('')
    try {
      if (initial?.ID) await api.updateAutoridadInstitucion(initial.ID, form)
      else await api.addAutoridadInstitucion(initial?.InstitucionID || '', form)
      onSave()
    } catch (cause) { setError(cause.message) } finally { setSaving(false) }
  }
  return <form onSubmit={submit} className="space-y-4">
    <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800">La persona y su cargo se guardan por separado. Si cambia quien ocupa el cargo, agregue la nueva autoridad y archive la anterior para conservar el historial.</p>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2"><label className="label">Nombre completo *</label><input className="input" required maxLength={160} value={form.nombre} onChange={e => set('nombre', e.target.value)} /></div>
      <div><label className="label">Cargo *</label><input className="input" required maxLength={100} placeholder="Rectora, director, representante…" value={form.cargo} onChange={e => set('cargo', e.target.value)} /></div>
      <div><label className="label">Función</label><input className="input" maxLength={100} placeholder="Ej.: autoridad firmante" value={form.funcion} onChange={e => set('funcion', e.target.value)} /></div>
      <div><label className="label">Tipo de identificación</label><select className="input" value={form.tipoIdentificacion} onChange={e => set('tipoIdentificacion', e.target.value)}><option value="CEDULA_EC">Cédula ecuatoriana</option><option value="PASAPORTE">Pasaporte</option><option value="OTRO">Otra</option></select></div>
      <div><label className="label">Identificación</label><input className="input" maxLength={64} value={form.identificacion} onChange={e => set('identificacion', e.target.value)} /></div>
      <div><label className="label">Vigente desde</label><input className="input" type="date" value={form.fechaInicio} onChange={e => set('fechaInicio', e.target.value)} /></div>
      <div><label className="label">Vigente hasta</label><input className="input" type="date" value={form.fechaFin} onChange={e => set('fechaFin', e.target.value)} /></div>
      <div><label className="label">Estado</label><select className="input" value={form.estado} onChange={e => set('estado', e.target.value)}><option value="activo">Activa</option><option value="inactivo">Inactiva</option></select></div>
      <div className="flex flex-col justify-end gap-2 text-sm text-gray-700">
        <label className="flex items-center gap-2"><input type="checkbox" checked={form.esRepresentanteLegal} onChange={e => set('esRepresentanteLegal', e.target.checked)} /> Representante legal</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={form.firmaConvenios} onChange={e => set('firmaConvenios', e.target.checked)} /> Puede firmar convenios</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={form.firmaCertificados} onChange={e => set('firmaCertificados', e.target.checked)} /> Puede firmar certificados futuros</label>
      </div>
      <div className="sm:col-span-2"><label className="label">Notas</label><textarea className="input" rows={2} value={form.notas} onChange={e => set('notas', e.target.value)} /></div>
    </div>
    {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}
    <div className="flex gap-3"><button type="button" className="btn-secondary flex-1" onClick={onCancel}>Cancelar</button><button className="btn-primary flex-1" disabled={saving}>{saving ? 'Guardando…' : initial?.ID ? 'Guardar autoridad' : 'Agregar autoridad'}</button></div>
  </form>
}

function FileUploadForm({ institution, detail, onSave, onCancel }) {
  const [kind, setKind] = useState('logo')
  const [authorityId, setAuthorityId] = useState('')
  const [documentType, setDocumentType] = useState('convenio')
  const [convenioId, setConvenioId] = useState('')
  const [selectedFile, setSelectedFile] = useState(null)
  const [fechaDocumento, setFechaDocumento] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const isDocument = kind === 'documento'
  const activeAuthorities = (detail.autoridades || []).filter(item => item.Estado === 'activo' && item.VigenteAhora !== false)
  const activeAgreements = (detail.convenios || []).filter(item => item.Estado !== 'archivado')
  const accept = isDocument ? 'application/pdf,.pdf' : 'image/png,image/jpeg,.png,.jpg,.jpeg'
  async function submit(event) {
    event.preventDefault()
    if (!selectedFile) { setError('Seleccione un archivo antes de guardar.'); return }
    setSaving(true); setError('')
    try {
      const archivo = await readFile(selectedFile)
      if (isDocument) {
        await api.addDocumentoInstitucion({ institucionId: institution.ID, convenioId, tipo: documentType, fechaDocumento, notas: notes, archivo })
      } else {
        await api.addActivoInstitucion(institution.ID, kind, archivo, kind === 'firma' ? authorityId : '')
      }
      onSave()
    } catch (cause) { setError(cause.message) } finally { setSaving(false) }
  }
  return <form onSubmit={submit} className="space-y-4">
    <div><label className="label" htmlFor="institution-file-kind">Qué desea guardar</label><select id="institution-file-kind" className="input" value={kind} onChange={e => { setKind(e.target.value); setSelectedFile(null) }}>
      <option value="logo">Logotipo institucional</option><option value="sello">Sello institucional</option><option value="firma">Firma / rúbrica de autoridad</option><option value="documento">Documento PDF</option>
    </select></div>
    {kind === 'firma' && <div><label className="label" htmlFor="institution-signature-authority">Autoridad dueña de la firma *</label><select id="institution-signature-authority" className="input" required value={authorityId} onChange={e => setAuthorityId(e.target.value)}><option value="">Seleccione…</option>{activeAuthorities.map(item => <option key={item.ID} value={item.ID}>{item.Nombre} — {item.Cargo}</option>)}</select></div>}
    {isDocument && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div><label className="label" htmlFor="institution-document-type">Tipo de documento</label><select id="institution-document-type" className="input" value={documentType} onChange={e => setDocumentType(e.target.value)}><option value="convenio">Convenio / acuerdo</option><option value="resolucion">Resolución institucional</option><option value="aval">Documento de aval</option><option value="anexo">Anexo</option><option value="otro">Otro documento</option></select></div>
      <div><label className="label" htmlFor="institution-document-agreement">Convenio relacionado (opcional)</label><select id="institution-document-agreement" className="input" value={convenioId} onChange={e => setConvenioId(e.target.value)}><option value="">Documento general de la institución</option>{activeAgreements.map(item => <option key={item.ID} value={item.ID}>{item.Objeto || item.ID}</option>)}</select></div>
      <div><label className="label">Fecha del documento</label><input className="input" type="date" value={fechaDocumento} onChange={e => setFechaDocumento(e.target.value)} /></div>
      <div><label className="label">Nota breve</label><input className="input" maxLength={1000} value={notes} onChange={e => setNotes(e.target.value)} /></div>
    </div>}
    <div><label className="label">Archivo {isDocument ? 'PDF' : 'PNG/JPG'} *</label><input className="input" required type="file" accept={accept} onChange={e => setSelectedFile(e.target.files?.[0] || null)} />
      <p className="mt-1 text-xs text-gray-500">{isDocument ? 'PDF hasta 15 MB.' : 'PNG o JPG hasta 8 MB. SVG, HTML y ejecutables se rechazan. Cada reemplazo conserva la versión anterior.'}</p>
      {selectedFile && <p className="mt-1 text-xs text-gray-600">{selectedFile.name} · {sizeLabel(selectedFile.size)}</p>}</div>
    {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}
    <div className="flex gap-3"><button type="button" className="btn-secondary flex-1" onClick={onCancel}>Cancelar</button><button className="btn-primary flex-1" disabled={saving}>{saving ? 'Guardando en Drive privado…' : 'Guardar archivo'}</button></div>
  </form>
}

export default function InstitucionesView() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [stateFilter, setStateFilter] = useState('')
  const [detail, setDetail] = useState(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [formTarget, setFormTarget] = useState(null)
  const [authorityTarget, setAuthorityTarget] = useState(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [archiveTarget, setArchiveTarget] = useState(null)
  const [archiving, setArchiving] = useState(false)
  const [preview, setPreview] = useState(null)
  const [previewLoading, setPreviewLoading] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try { const result = await api.getInstitucionesMaestras({ estado: stateFilter }); setData(result.data || []); setError('') }
    catch (cause) { setError(cause.message) }
    finally { setLoading(false) }
  }, [stateFilter])
  useEffect(() => { load() }, [load])

  async function openDetail(item) {
    setLoadingDetail(true); setError('')
    try { const result = await api.getInstitucionMaestra(item.ID); setDetail(result.data) }
    catch (cause) { setError(cause.message) }
    finally { setLoadingDetail(false) }
  }
  async function reloadDetail() {
    await load()
    if (detail?.institucion?.ID) {
      try { const result = await api.getInstitucionMaestra(detail.institucion.ID); setDetail(result.data) }
      catch (cause) { setError(cause.message) }
    }
  }
  async function archiveInstitution() {
    if (!archiveTarget) return
    setArchiving(true)
    try { await api.archivarInstitucionMaestra(archiveTarget.ID); setArchiveTarget(null); await load(); setDetail(null) }
    catch (cause) { setError(cause.message) } finally { setArchiving(false) }
  }
  async function previewFile(item) {
    setPreviewLoading(item.ID); setError('')
    try { const result = await api.getArchivoInstitucionPrivado(item.ID); setPreview({ ...result.data, type: item.Tipo, size: item.TamanoBytes }) }
    catch (cause) { setError(cause.message) } finally { setPreviewLoading('') }
  }
  function filteredData() {
    const term = query.trim().toLocaleLowerCase()
    return data.filter(item => !term || [item.Nombre, item.NombreLegal, item.NombreComercial, item.Siglas, item.Identificacion]
      .some(value => String(value || '').toLocaleLowerCase().includes(term)))
  }
  const visible = filteredData()
  const activeCount = data.filter(item => item.Estado === 'activo').length
  const archivedCount = data.filter(item => item.Estado !== 'activo').length
  const authorityById = useMemo(() => Object.fromEntries((detail?.autoridades || []).map(item => [item.ID, item])), [detail])

  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><div className="flex items-center gap-2"><Building2 className="text-brand-700" size={21} /><h2 className="text-xl font-bold text-gray-900">Instituciones y aliados</h2></div>
        <p className="mt-1 max-w-3xl text-sm text-gray-500">Ficha maestra para registrar una entidad una sola vez y reutilizar sus datos, autoridades, recursos institucionales y convenios.</p></div>
      <button className="btn-primary text-sm" onClick={() => setFormTarget({ mode: 'new' })}><Plus size={16} /> Nueva institución</button>
    </div>

    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {[{ label: 'Instituciones', value: data.length, tone: 'text-gray-900' }, { label: 'Activas', value: activeCount, tone: 'text-emerald-700' }, { label: 'Inactivas', value: archivedCount, tone: 'text-gray-500' }, { label: 'Convenios relacionados', value: data.reduce((sum, item) => sum + (Number(item.TotalConvenios) || 0), 0), tone: 'text-brand-700' }].map(card => <div key={card.label} className="card py-3 text-center"><p className={`text-xl font-bold ${card.tone}`}>{card.value}</p><p className="text-xs text-gray-500">{card.label}</p></div>)}
    </div>

    <div className="card flex flex-col gap-3 p-3 sm:flex-row">
      <label className="relative min-w-0 flex-1"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input className="input pl-9" aria-label="Buscar institución" placeholder="Buscar por nombre, siglas o identificación…" value={query} onChange={e => setQuery(e.target.value)} /></label>
      <select className="input sm:w-48" aria-label="Filtrar por estado" value={stateFilter} onChange={e => setStateFilter(e.target.value)}><option value="">Todos los estados</option><option value="activo">Activas</option><option value="inactivo">Inactivas</option></select>
    </div>

    {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}
    {loading ? <Spinner text="Cargando fichas institucionales…" /> : visible.length ? <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
      {visible.map(item => <article key={item.ID} className="card overflow-hidden p-0">
        <div className="flex flex-wrap items-start justify-between gap-3 p-4">
          <button type="button" onClick={() => openDetail(item)} className="min-w-0 flex-1 text-left">
            <span className="flex items-center gap-2"><Landmark size={17} className="shrink-0 text-brand-700" /><span className="truncate font-semibold text-gray-900">{item.Nombre}</span></span>
            <span className="mt-1 block pl-6 text-xs text-gray-500">{[item.Siglas, item.Tipo, item.Identificacion].filter(Boolean).join(' · ') || 'Ficha institucional'}</span>
          </button>
          <span className={item.Estado === 'activo' ? 'badge-green' : 'badge-gray'}>{item.Estado === 'activo' ? 'Activa' : 'Inactiva'}</span>
        </div>
        <div className="grid grid-cols-3 border-t border-gray-100 bg-gray-50/70 px-4 py-3 text-center text-xs">
          <div><strong className="block text-gray-800">{item.AutoridadesActivas || 0}</strong><span className="text-gray-500">autoridades</span></div>
          <div><strong className="block text-gray-800">{item.ConveniosActivos || 0}</strong><span className="text-gray-500">convenios activos</span></div>
          <div className={item.CompletitudCertificacionFutura?.listoParaCertificacionFutura ? 'text-emerald-700' : 'text-amber-700'}><strong className="block">{item.CompletitudCertificacionFutura?.listoParaCertificacionFutura ? 'Preparada' : 'Incompleta'}</strong><span>para uso futuro</span></div>
        </div>
        <div className="flex justify-end gap-2 p-3">
          <button type="button" className="btn-secondary text-xs" onClick={() => { setFormTarget({ mode: 'edit', item }) }}><Pencil size={14} /> Editar ficha</button>
          {item.Estado === 'activo' && <button type="button" className="btn-secondary text-xs" onClick={() => setArchiveTarget(item)}><Archive size={14} /> Desactivar</button>}
          <button type="button" className="btn-primary text-xs" onClick={() => openDetail(item)}>Abrir ficha</button>
        </div>
      </article>)}
    </div> : <div className="card py-12 text-center"><Building2 className="mx-auto mb-3 text-gray-300" size={34} /><p className="font-medium text-gray-700">{data.length ? 'No hay coincidencias con esa búsqueda.' : 'Aún no hay instituciones registradas.'}</p><p className="mt-1 text-sm text-gray-500">Al crear una ficha podrá vincularle autoridades, documentos y uno o varios convenios.</p></div>}

    <Modal open={!!formTarget} onClose={() => setFormTarget(null)} title={formTarget?.mode === 'edit' ? 'Editar institución' : 'Nueva ficha institucional'} size="xl">
      {formTarget && <InstitutionForm initial={formTarget.mode === 'edit' ? formTarget.item : null} onCancel={() => setFormTarget(null)} onSave={async () => { setFormTarget(null); await load() }} />}
    </Modal>

    <Modal open={loadingDetail || !!detail} onClose={() => setDetail(null)} title={loadingDetail ? 'Abriendo ficha…' : detail?.institucion?.Nombre || 'Ficha institucional'} size="xl">
      {loadingDetail ? <Spinner text="Cargando información relacionada…" /> : detail && <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl bg-gray-50 p-4">
          <div className="min-w-0"><p className="text-lg font-semibold text-gray-900">{detail.institucion.Nombre}</p><p className="text-sm text-gray-500">{[detail.institucion.Siglas, detail.institucion.Tipo, detail.institucion.Identificacion].filter(Boolean).join(' · ')}</p>
            <p className="mt-2 text-xs text-gray-500">{[detail.institucion.Email, detail.institucion.Telefono, detail.institucion.Ciudad, detail.institucion.Provincia].filter(Boolean).join(' · ') || 'Sin datos de contacto agregados'}</p></div>
          <span className={detail.institucion.Estado === 'activo' ? 'badge-green' : 'badge-gray'}>{detail.institucion.Estado === 'activo' ? 'Activa' : 'Inactiva'}</span>
        </div>
        <div className={`rounded-xl p-3 text-sm ${detail.completitudCertificacionFutura.listoParaCertificacionFutura ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`}>
          <p className="flex items-center gap-2 font-semibold">{detail.completitudCertificacionFutura.listoParaCertificacionFutura ? <CheckCircle2 size={16} /> : <ShieldCheck size={16} />} Estado de ficha para módulos futuros</p>
          {detail.completitudCertificacionFutura.listoParaCertificacionFutura ? <p className="mt-1 text-xs">Hay al menos una autoridad activa con capacidad de firma y una firma vigente asociada. Esto solo indica preparación de datos; aún no emite certificados.</p> : <ul className="mt-1 list-inside list-disc text-xs">{detail.completitudCertificacionFutura.faltantes.map(item => <li key={item}>{item}</li>)}</ul>}
        </div>

        <section><div className="mb-3 flex items-center justify-between"><h3 className="font-semibold text-gray-900">Autoridades</h3><button className="btn-secondary text-xs" onClick={() => setAuthorityTarget({ mode: 'new', item: { InstitucionID: detail.institucion.ID } })}><Plus size={14} /> Agregar autoridad</button></div>
          {detail.autoridades.length ? <div className="space-y-2">{detail.autoridades.map(person => <div key={person.ID} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-100 p-3">
            <div><p className="font-medium text-gray-800">{person.Nombre} <span className="font-normal text-gray-500">· {person.Cargo}</span></p><p className="text-xs text-gray-500">{[person.Funcion, checked(person.EsRepresentanteLegal) && 'Representante legal', checked(person.FirmaConvenios) && 'Firma convenios', checked(person.FirmaCertificados) && 'Firma certificados', person.Estado === 'inactivo' && 'Inactiva'].filter(Boolean).join(' · ') || 'Sin funciones especiales configuradas'}</p></div>
            <div className="flex gap-2"><button className="btn-secondary text-xs" onClick={() => setAuthorityTarget({ mode: 'edit', item: person })}><Pencil size={13} /> Editar</button>{person.Estado === 'activo' && <button className="btn-secondary text-xs" onClick={async () => { try { await api.archivarAutoridadInstitucion(person.ID); await reloadDetail() } catch (cause) { setError(cause.message) } }}><Archive size={13} /> Archivar</button>}</div>
          </div>)}</div> : <p className="rounded-lg border border-dashed border-gray-300 p-4 text-sm text-gray-500">Aún no hay autoridades. Puede crear la ficha ahora y completar esta sección luego.</p>}
        </section>

        <section><div className="mb-3 flex items-center justify-between"><h3 className="font-semibold text-gray-900">Logotipo, sello y firmas</h3><button className="btn-secondary text-xs" onClick={() => setUploadOpen(true)}><Upload size={14} /> Cargar recurso</button></div>
          {detail.activos.length ? <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{detail.activos.map(asset => { const authority = authorityById[asset.AutoridadID]; return <div key={asset.ID} className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 p-3">
            <div className="flex min-w-0 items-center gap-2">{asset.Tipo === 'firma' ? <PenTool size={17} className="shrink-0 text-brand-700" /> : <Image size={17} className="shrink-0 text-brand-700" />}<div className="min-w-0"><p className="truncate text-sm font-medium text-gray-800">{asset.Tipo === 'firma' ? `Firma · ${authority?.Nombre || 'autoridad'}` : asset.Tipo === 'logo' ? 'Logotipo institucional' : 'Sello institucional'}</p><p className="truncate text-xs text-gray-500">{asset.NombreArchivo} · v{asset.Version} · {asset.Estado === 'activo' ? 'Actual' : 'Histórico'}</p></div></div>
            <button type="button" className="btn-secondary shrink-0 text-xs" disabled={previewLoading === asset.ID} onClick={() => previewFile(asset)}>{previewLoading === asset.ID ? 'Cargando…' : 'Ver'}</button>
          </div> })}</div> : <p className="rounded-lg border border-dashed border-gray-300 p-4 text-sm text-gray-500">No hay recursos cargados. Las firmas, el sello y el logo quedan en almacenamiento privado.</p>}
        </section>

        <section><div className="mb-3 flex items-center justify-between"><h3 className="font-semibold text-gray-900">Convenios e historial</h3><Link2 size={16} className="text-gray-400" /></div>
          {detail.convenios.length ? <div className="space-y-2">{detail.convenios.map(agreement => <div key={agreement.ID} className="rounded-lg border border-gray-100 p-3"><div className="flex flex-wrap justify-between gap-2"><p className="font-medium text-gray-800">{agreement.Objeto}</p><span className={agreement.Estado === 'activo' ? 'badge-green' : agreement.Estado === 'archivado' ? 'badge-gray' : 'badge-yellow'}>{agreement.Estado}</span></div><p className="mt-1 text-xs text-gray-500">{agreement.FechaInicio ? `Desde ${fmt.date(agreement.FechaInicio)}` : 'Sin fecha de inicio'}{agreement.FechaFin ? ` · hasta ${fmt.date(agreement.FechaFin)}` : ''}{agreement.FechaFirma ? ` · firmado ${fmt.date(agreement.FechaFirma)}` : ''}</p></div>)}</div> : <p className="rounded-lg border border-dashed border-gray-300 p-4 text-sm text-gray-500">Sin convenios vinculados. Los convenios antiguos no se enlazan automáticamente.</p>}
        </section>

        <section><div className="mb-3 flex items-center justify-between"><h3 className="font-semibold text-gray-900">Documentos institucionales</h3><button className="btn-secondary text-xs" onClick={() => setUploadOpen(true)}><Plus size={14} /> Agregar documento</button></div>
          {detail.documentos.length ? <div className="space-y-2">{detail.documentos.map(document => <div key={document.ID} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-100 p-3"><div className="flex min-w-0 items-center gap-2"><FileText size={17} className="shrink-0 text-brand-700" /><div className="min-w-0"><p className="truncate text-sm font-medium text-gray-800">{document.NombreArchivo}</p><p className="text-xs text-gray-500">{document.Tipo}{document.FechaDocumento ? ` · ${fmt.date(document.FechaDocumento)}` : ''}{document.Notas ? ` · ${document.Notas}` : ''}</p></div></div><button className="btn-secondary text-xs" disabled={previewLoading === document.ID} onClick={() => previewFile(document)}>{previewLoading === document.ID ? 'Cargando…' : 'Ver PDF'}</button></div>)}</div> : <p className="rounded-lg border border-dashed border-gray-300 p-4 text-sm text-gray-500">Convenios, resoluciones y anexos pueden guardarse aquí como PDF privado.</p>}
        </section>
        <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-4"><button className="btn-secondary text-sm" onClick={() => setFormTarget({ mode: 'edit', item: detail.institucion })}><Pencil size={15} /> Editar datos generales</button><button className="btn-secondary text-sm" onClick={() => { setDetail(null) }}>Cerrar ficha</button></div>
      </div>}
    </Modal>

    <Modal open={!!authorityTarget} onClose={() => setAuthorityTarget(null)} title={authorityTarget?.mode === 'edit' ? 'Editar autoridad' : 'Nueva autoridad'} size="lg">
      {authorityTarget && <AuthorityForm initial={authorityTarget.mode === 'edit' ? authorityTarget.item : { InstitucionID: authorityTarget.item.InstitucionID }} onCancel={() => setAuthorityTarget(null)} onSave={async () => { setAuthorityTarget(null); await reloadDetail() }} />}
    </Modal>
    <Modal open={uploadOpen && !!detail} onClose={() => setUploadOpen(false)} title="Guardar recurso privado" size="lg">
      {uploadOpen && detail && <FileUploadForm institution={detail.institucion} detail={detail} onCancel={() => setUploadOpen(false)} onSave={async () => { setUploadOpen(false); await reloadDetail() }} />}
    </Modal>
    <ConfirmDialog open={!!archiveTarget} onClose={() => setArchiveTarget(null)} onConfirm={archiveInstitution} loading={archiving} title="Desactivar institución"
      message={`¿Desactivar “${archiveTarget?.Nombre}”? La ficha, los convenios, documentos y avales históricos se conservarán; solo dejará de aparecer en selectores de nuevos procesos.`} />
    <Modal open={!!preview} onClose={() => setPreview(null)} title={preview?.nombreArchivo || 'Vista previa privada'} size="xl">
      {preview && <div className="space-y-3"><p className="text-xs text-gray-500">{preview.type} · {sizeLabel(preview.size || 0)} · Archivo privado (acceso administrativo).</p>
        {preview.mimeType.startsWith('image/') ? <img className="mx-auto max-h-[65vh] max-w-full rounded-lg border border-gray-100 object-contain" src={`data:${preview.mimeType};base64,${preview.base64}`} alt={preview.nombreArchivo} /> : <iframe title={preview.nombreArchivo} className="h-[65vh] w-full rounded-lg border border-gray-200" src={`data:application/pdf;base64,${preview.base64}`} />}
        <button type="button" className="btn-secondary" onClick={() => downloadPrivateFile(preview)}><FileText size={15} /> Descargar archivo</button>
      </div>}
    </Modal>
  </div>
}
