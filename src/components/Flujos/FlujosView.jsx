import { useEffect, useState, useCallback, useRef } from 'react'
import { api } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { fmt } from '../../utils/formatters'
import Modal from '../UI/Modal'
import ConfirmDialog from '../UI/ConfirmDialog'
import TableSkeleton from '../UI/TableSkeleton'
import {
  Plus, Pencil, Trash2, CheckCircle, Clock, ChevronLeft, ChevronRight,
  ListChecks, PlayCircle, AlertCircle, Paperclip, ExternalLink,
  Image as ImageIcon, X, Bold, List, ListOrdered, CheckSquare, Save,
  Link2, Highlighter, Underline, Quote,
  MessageSquare, XCircle, ShieldCheck,
} from 'lucide-react'

const DIAS_SEMANA = ['Lunes','Martes','Miércoles','Jueves','Viernes']

function normalizeDiaSemana(value) {
  const raw = String(value || '').trim().toLowerCase()
  const normalized = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const map = {
    lunes: 'Lunes',
    martes: 'Martes',
    miercoles: 'Miércoles',
    jueves: 'Jueves',
    viernes: 'Viernes',
  }
  return map[normalized] || ''
}

function getMondayOf(dateStr) {
  let d
  if (dateStr) {
    d = new Date(dateStr + 'T12:00:00Z')
  } else {
    const now = new Date()
    d = new Date(
      now.getUTCFullYear() + '-' +
      String(now.getUTCMonth() + 1).padStart(2, '0') + '-' +
      String(now.getUTCDate()).padStart(2, '0') + 'T12:00:00Z'
    )
  }
  const day = d.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setUTCDate(d.getUTCDate() + diff)
  return d.toISOString().slice(0, 10)
}
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

const ESTADO_ACT = {
  pendiente:   { label: 'Pendiente',    css: 'bg-gray-100 text-gray-600',    icon: Clock },
  en_proceso:  { label: 'En proceso',   css: 'bg-blue-100 text-blue-700',    icon: PlayCircle },
  completado:  { label: 'Completado',   css: 'bg-emerald-100 text-emerald-700', icon: CheckCircle },
  bloqueado:   { label: 'Bloqueado',    css: 'bg-red-100 text-red-700',      icon: AlertCircle },
}

const REVISION_ACT = {
  pendiente_revision: { label: 'Pendiente de aprobación', css: 'bg-amber-100 text-amber-700 border-amber-200', icon: Clock },
  aprobado:           { label: 'Horas aprobadas',         css: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: ShieldCheck },
  rechazado:          { label: 'No aprobado',             css: 'bg-red-100 text-red-700 border-red-200', icon: XCircle },
}

function getRevisionEstado(act) {
  return act.EstadoRevision || 'pendiente_revision'
}

function getHorasAprobadas(act) {
  return getRevisionEstado(act) === 'aprobado' ? (Number(act.HorasAprobadas) || 0) : 0
}

// Google Sheets limita cada celda a ~50k caracteres. Las capturas se guardan
// comprimidas dentro de la actividad, así que dejamos margen para el JSON/nombre.
const MAX_WORKFLOW_IMAGE_CHARS = 48_000
const MAX_WORKFLOW_IMAGES = 3

function parseJsonArray(value) {
  if (Array.isArray(value)) return value
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function stringifyWorkflowArray(items) {
  return JSON.stringify(Array.isArray(items) ? items : [])
}

function insertSnippet(text, snippet) {
  return `${text || ''}${text ? '\n' : ''}${snippet}`
}

function RichTextBox({ value, onChange, rows = 4, placeholder = 'Describe la actividad...' }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value || '')
  const [color, setColor] = useState('brand')
  const textareaRef = useRef(null)

  function openEditor() {
    setDraft(value || '')
    setOpen(true)
  }

  function selectionOrEnd() {
    const textarea = textareaRef.current
    if (!textarea) return { start: draft.length, end: draft.length }
    return { start: textarea.selectionStart, end: textarea.selectionEnd }
  }

  function applyFormat(prefix, suffix = '', fallback = 'Texto') {
    const { start, end } = selectionOrEnd()
    const selected = draft.slice(start, end) || fallback
    const next = `${draft.slice(0, start)}${prefix}${selected}${suffix}${draft.slice(end)}`
    setDraft(next)
    requestAnimationFrame(() => {
      if (!textareaRef.current) return
      textareaRef.current.focus()
      const nextStart = start + prefix.length
      textareaRef.current.setSelectionRange(nextStart, nextStart + selected.length)
    })
  }

  function insertLine(snippet) {
    const { start, end } = selectionOrEnd()
    const before = draft.slice(0, start)
    const needsBreak = before && !before.endsWith('\n') ? '\n' : ''
    const next = `${before}${needsBreak}${snippet}${draft.slice(end)}`
    setDraft(next)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  function saveEditor() {
    onChange(draft)
    setOpen(false)
  }

  return (
    <div className="space-y-2">
      <button type="button" onClick={openEditor}
        className="w-full rounded-xl border border-brand-200 bg-brand-50/60 px-3 py-2 text-left text-sm text-brand-800 hover:bg-brand-50 flex items-center justify-between gap-3">
        <span className="flex items-center gap-2"><Pencil size={14} /> Abrir editor de texto</span>
        <span className="text-[11px] text-brand-600">Formato, colores y vista previa</span>
      </button>
      <div className="rounded-xl border border-gray-200 bg-white/70 p-2">
        {value ? <FormattedDescription text={value} /> : <p className="px-2 py-1 text-xs italic text-gray-400">Aún no hay contenido. Abre el editor para escribir.</p>}
      </div>
      <p className="text-[11px] text-gray-400">El contenido se guarda en el mismo campo y conserva compatibilidad con los flujos existentes.</p>

      <Modal open={open} onClose={() => setOpen(false)} title="Editor de actividad" size="xl">
        <div className="space-y-4">
          <div className="rounded-xl border border-brand-100 bg-brand-50/50 p-3">
            <p className="text-sm font-semibold text-brand-900">Organiza la indicación de forma clara</p>
            <p className="mt-1 text-xs text-brand-700">Selecciona texto para aplicarle formato. Los cambios se aplican al guardar.</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-gray-200 bg-gray-50 p-2">
            <button type="button" onClick={() => applyFormat('**', '**', 'Texto importante')} className="editor-tool"><Bold size={13} /> Negrita</button>
            <button type="button" onClick={() => applyFormat('*', '*', 'Texto destacado')} className="editor-tool"><span className="italic font-semibold">I</span> Cursiva</button>
            <button type="button" onClick={() => applyFormat('__', '__', 'Texto subrayado')} className="editor-tool"><Underline size={13} /> Subrayado</button>
            <button type="button" onClick={() => applyFormat('# ', '', 'Título')} className="editor-tool"><span className="font-bold">H</span> Título</button>
            <button type="button" onClick={() => insertLine('• Punto clave')} className="editor-tool"><List size={13} /> Lista</button>
            <button type="button" onClick={() => insertLine('1. Paso a realizar')} className="editor-tool"><ListOrdered size={13} /> Pasos</button>
            <button type="button" onClick={() => insertLine('[ ] Actividad verificable')} className="editor-tool"><CheckSquare size={13} /> Checklist</button>
            <button type="button" onClick={() => insertLine('> Nota importante')} className="editor-tool"><Quote size={13} /> Nota</button>
            <span className="mx-1 h-5 w-px bg-gray-200" />
            <label className="flex items-center gap-1 text-xs text-gray-600">
              Color
              <select className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs" value={color} onChange={e => setColor(e.target.value)}>
                <option value="brand">Azul</option><option value="red">Rojo</option><option value="green">Verde</option><option value="orange">Naranja</option><option value="purple">Morado</option>
              </select>
            </label>
            <button type="button" onClick={() => applyFormat(`{{color:${color}}}`, '{{/color}}', 'Texto con color')} className="editor-tool"><span className="font-bold text-brand-600">A</span> Aplicar color</button>
            <button type="button" onClick={() => applyFormat('==', '==', 'Texto resaltado')} className="editor-tool"><Highlighter size={13} /> Resaltar</button>
            <button type="button" onClick={() => applyFormat('[', '](https://ejemplo.com)', 'Enlace')} className="editor-tool"><Link2 size={13} /> Enlace</button>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <label className="label">Contenido</label>
              <textarea ref={textareaRef} className="input min-h-[360px] resize-y text-sm leading-7" value={draft}
                onChange={e => setDraft(e.target.value)} placeholder={placeholder} autoFocus rows={Math.max(rows, 12)} />
            </div>
            <div>
              <label className="label">Vista previa</label>
              <div className="min-h-[360px] rounded-xl border border-gray-200 bg-white p-3">
                {draft ? <FormattedDescription text={draft} /> : <p className="text-sm italic text-gray-400">La vista previa aparecerá aquí.</p>}
              </div>
            </div>
          </div>
          <div className="flex gap-3">
            <button type="button" className="btn-secondary flex-1" onClick={() => setOpen(false)}>Cancelar</button>
            <button type="button" className="btn-primary flex-1" onClick={saveEditor}><Save size={14} /> Guardar contenido</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function FormattedDescription({ text }) {
  if (!text) return null
  const lines = String(text).split(/\r?\n/)
  const renderInline = (value, keyPrefix) => {
    const parts = String(value || '').split(/(\*\*[^*]+\*\*|\*[^*]+\*|__[^_]+__|==[^=]+==|\{\{color:[a-z]+\}\}[^{}]*\{\{\/color\}\}|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/gi)
    return parts.map((part, index) => {
      const key = `${keyPrefix}-${index}`
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
        return <strong key={key} className="font-semibold text-gray-800">{part.slice(2, -2)}</strong>
      }
      if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
        return <em key={key} className="italic text-gray-700">{part.slice(1, -1)}</em>
      }
      if (part.startsWith('__') && part.endsWith('__') && part.length > 4) {
        return <u key={key} className="underline decoration-brand-400 underline-offset-2">{part.slice(2, -2)}</u>
      }
      if (part.startsWith('==') && part.endsWith('==') && part.length > 4) {
        return <mark key={key} className="rounded bg-amber-100 px-0.5 text-gray-800">{part.slice(2, -2)}</mark>
      }
      const colorMatch = part.match(/^\{\{color:([a-z]+)\}\}([\s\S]*)\{\{\/color\}\}$/)
      if (colorMatch) {
        const colors = { brand: 'text-brand-700', red: 'text-red-600', green: 'text-emerald-700', orange: 'text-orange-600', purple: 'text-purple-700' }
        return <span key={key} className={`font-medium ${colors[colorMatch[1]] || colors.brand}`}>{colorMatch[2]}</span>
      }
      const linkMatch = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/i)
      if (linkMatch) {
        return <a key={key} href={linkMatch[2]} target="_blank" rel="noreferrer" className="font-medium text-brand-700 underline underline-offset-2 hover:text-brand-900">{linkMatch[1]}</a>
      }
      return <span key={key}>{part}</span>
    })
  }
  return (
    <div className="mt-2 rounded-lg bg-white/70 border border-gray-100 px-3 py-2 text-xs text-gray-600 leading-relaxed space-y-1.5">
      {lines.map((line, index) => {
        const trimmed = line.trim()
        const checklist = trimmed.match(/^\[( |x|X)\]\s+(.+)$/)
        const bullet = trimmed.match(/^(?:•|-)\s+(.+)$/)
        const step = trimmed.match(/^(\d+)\.\s+(.+)$/)
        const heading = trimmed.match(/^(#{1,3})\s+(.+)$/)
        const quote = trimmed.match(/^>\s+(.+)$/)
        if (!trimmed) return <div key={index} className="h-1" />
        if (heading) {
          const Heading = heading[1].length === 1 ? 'h4' : 'h5'
          return <Heading key={index} className={`${heading[1].length === 1 ? 'text-sm' : 'text-xs'} font-semibold text-brand-900`}>{renderInline(heading[2], `heading-${index}`)}</Heading>
        }
        if (quote) {
          return <blockquote key={index} className="border-l-2 border-brand-300 bg-brand-50/70 px-3 py-1.5 text-gray-700">{renderInline(quote[1], `quote-${index}`)}</blockquote>
        }
        if (checklist) {
          const checked = checklist[1].toLowerCase() === 'x'
          return (
            <div key={index} className="flex items-start gap-2">
              <span className={`mt-0.5 flex h-4 w-4 items-center justify-center rounded border ${checked ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-gray-300 bg-white'}`}>
                {checked && <CheckCircle size={11} />}
              </span>
              <span className={checked ? 'line-through text-gray-400' : ''}>{renderInline(checklist[2], `chk-${index}`)}</span>
            </div>
          )
        }
        if (bullet) {
          return <div key={index} className="flex gap-2"><span className="text-brand-500">•</span><span>{renderInline(bullet[1], `bul-${index}`)}</span></div>
        }
        if (step) {
          return <div key={index} className="flex gap-2"><span className="font-semibold text-brand-600">{step[1]}.</span><span>{renderInline(step[2], `step-${index}`)}</span></div>
        }
        return <p key={index}>{renderInline(trimmed, `p-${index}`)}</p>
      })}
    </div>
  )
}

function EvidenceImagePreview({ image, onClose }) {
  return (
    <Modal open={!!image} onClose={onClose} title={image?.title || 'Evidencia visual'} size="xl">
      {image && (
        <div className="space-y-3">
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
            <img
              src={image.dataUrl}
              alt={image.name || 'Evidencia visual'}
              className="max-h-[70vh] w-full rounded-xl object-contain"
            />
          </div>
          <div className="rounded-xl bg-brand-50 px-4 py-3 text-sm text-gray-700">
            <p className="font-semibold text-brand-800">{image.name || 'Captura de evidencia'}</p>
            {image.description && <p className="mt-1 whitespace-pre-wrap">{image.description}</p>}
          </div>
        </div>
      )}
    </Modal>
  )
}

function normalizeChecklist(items) {
  return parseJsonArray(items)
    .map((item, index) => ({
      id: item.id || `chk-${index + 1}`,
      text: String(item.text || '').trim(),
      done: item.done === true,
    }))
    .filter(item => item.text)
}

function WorkflowChecklist({ items, onChange, readOnly = false, canManageItems = true }) {
  const [draft, setDraft] = useState('')
  const checklist = normalizeChecklist(items)
  const update = (next) => onChange(next)
  const canEdit = !readOnly
  const toggle = (id) => update(checklist.map(item => item.id === id ? { ...item, done: !item.done } : item))
  const remove = (id) => update(checklist.filter(item => item.id !== id))
  const add = () => {
    const text = draft.trim()
    if (!text) return
    update([...checklist, { id: `chk-${Date.now()}`, text, done: false }])
    setDraft('')
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white/80 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
          <ListChecks size={14} /> Checklist de verificación
        </p>
        <span className="text-[11px] text-gray-400">
          {checklist.filter(i => i.done).length}/{checklist.length} completadas
        </span>
      </div>
      {checklist.length === 0 ? (
        <p className="text-xs text-gray-400 italic">Sin puntos de verificación todavía.</p>
      ) : (
        <div className="space-y-1.5">
          {checklist.map(item => (
            <div key={item.id} className="flex items-start gap-2 text-xs">
              <button type="button" disabled={!canEdit} onClick={() => toggle(item.id)}
                className={`mt-0.5 h-4 w-4 rounded border flex items-center justify-center ${
                  item.done ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-gray-300 bg-white'
                } ${!canEdit ? 'cursor-default' : 'hover:border-emerald-500'}`}>
                {item.done && <CheckCircle size={11} />}
              </button>
              <span className={`flex-1 ${item.done ? 'line-through text-gray-400' : 'text-gray-700'}`}>{item.text}</span>
              {canEdit && canManageItems && (
                <button type="button" onClick={() => remove(item.id)}
                  className="text-gray-300 hover:text-red-500"><X size={12} /></button>
              )}
            </div>
          ))}
        </div>
      )}
      {canEdit && canManageItems && (
        <div className="flex gap-2 pt-1">
          <input className="input text-xs flex-1" value={draft}
            onChange={e => setDraft(e.target.value)} placeholder="Nuevo punto de verificación..." />
          <button type="button" onClick={add} className="btn-secondary text-xs px-3">Agregar</button>
        </div>
      )}
      {canEdit && !canManageItems && (
        <p className="text-[11px] text-gray-400">
          Puedes marcar avances, pero los puntos de verificación los define administración.
        </p>
      )}
    </div>
  )
}

async function compressWorkflowImage(file) {
  if (!file || !file.type?.startsWith('image/')) {
    throw new Error('Solo se permiten imágenes.')
  }
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('No se pudo leer la imagen.'))
    reader.readAsDataURL(file)
  })
  const img = await new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('No se pudo procesar la imagen.'))
    image.src = dataUrl
  })
  let maxWidth = 1400
  let quality = 0.82
  let compressed = ''

  for (let attempt = 0; attempt < 14; attempt += 1) {
    const scale = Math.min(1, maxWidth / img.width)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.width * scale))
    canvas.height = Math.max(1, Math.round(img.height * scale))
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    compressed = canvas.toDataURL('image/jpeg', quality)
    if (compressed.length <= MAX_WORKFLOW_IMAGE_CHARS) break
    if (quality > 0.5) {
      quality = Math.max(0.5, quality - 0.08)
    } else {
      maxWidth = Math.max(520, Math.round(maxWidth * 0.72))
      quality = 0.7
    }
  }

  if (compressed.length > MAX_WORKFLOW_IMAGE_CHARS) {
    throw new Error('La captura es demasiado pesada para guardarse segura en Sheets. Recórtala o pega un enlace de Drive.')
  }
  return {
    id: `img-${Date.now()}`,
    name: file.name || 'captura.jpg',
    type: 'image/jpeg',
    dataUrl: compressed,
    createdAt: new Date().toISOString(),
  }
}

function ActividadCard({ act, isAdmin, onUpdate, onDelete }) {
  const [editHoras, setEditHoras]       = useState(false)
  const [editEvidencia, setEditEvidencia] = useState(false)
  const [editDetalle, setEditDetalle]   = useState(false)
  const [editRevision, setEditRevision] = useState(false)
  const [checklist, setChecklist]       = useState(() => normalizeChecklist(act.Checklist))
  const [imagenes, setImagenes]         = useState(() => parseJsonArray(act.Imagenes))
  const [horas, setHoras]               = useState(act.HorasReales || 0)
  const [notas, setNotas]               = useState(act.Notas || '')
  const [evidencia, setEvidencia]       = useState(act.Evidencia || '')
  const [revisionHoras, setRevisionHoras] = useState(act.HorasAprobadas || act.HorasReales || act.HorasEstimadas || 0)
  const [revisionFeedback, setRevisionFeedback] = useState(act.FeedbackRevision || '')
  const [revisionEvidencia, setRevisionEvidencia] = useState(act.EvidenciaRevision || '')
  const [revisionImagenes, setRevisionImagenes] = useState(() => parseJsonArray(act.ImagenesRevision))
  const [revisionReprogramar, setRevisionReprogramar] = useState('')
  const [revisionError, setRevisionError] = useState('')
  const [previewImage, setPreviewImage]   = useState(null)
  const [detalle, setDetalle]           = useState({
    titulo: act.Titulo, descripcion: act.Descripcion || '',
    diaSemana: normalizeDiaSemana(act.DiaSemana) || 'Lunes', horasEstimadas: act.HorasEstimadas,
  })
  const [saving, setSaving]             = useState(false)
  const [imageError, setImageError]     = useState('')
  const est = ESTADO_ACT[act.Estado] || ESTADO_ACT.pendiente
  const tituloActividad = act.Titulo || 'Actividad sin título'
  const diaActividad = normalizeDiaSemana(act.DiaSemana) || act.DiaSemana || 'Sin día asignado'
  const Icon = est.icon
  const revisionEstado = getRevisionEstado(act)
  const revision = REVISION_ACT[revisionEstado] || REVISION_ACT.pendiente_revision
  const RevisionIcon = revision.icon
  const horasAprobadas = getHorasAprobadas(act)

  async function saveHoras() {
    setSaving(true)
    await onUpdate(act.ID, { horasReales: Number(horas), notas })
    setSaving(false)
    setEditHoras(false)
  }

  async function saveEvidencia() {
    setSaving(true)
    await onUpdate(act.ID, { evidencia, imagenes: stringifyWorkflowArray(imagenes) })
    setSaving(false)
    setEditEvidencia(false)
  }

  async function saveDetalle() {
    setSaving(true)
    await onUpdate(act.ID, {
      titulo: detalle.titulo, descripcion: detalle.descripcion,
      descripcionFormato: 'texto_enriquecido_v1',
      diaSemana: detalle.diaSemana, horasEstimadas: Number(detalle.horasEstimadas),
    })
    setSaving(false)
    setEditDetalle(false)
  }

  async function saveChecklist(nextChecklist = checklist) {
    setChecklist(nextChecklist)
    await onUpdate(act.ID, { checklist: stringifyWorkflowArray(nextChecklist) }, { preserveScroll: true })
  }

  async function saveRevision(estadoRevision) {
    const feedback = revisionFeedback.trim()
    if (estadoRevision === 'rechazado' && !feedback) {
      setRevisionError('Escribe una observación para explicar por qué no se aprueban las horas.')
      return
    }
    setRevisionError('')
    setSaving(true)
    await onUpdate(act.ID, {
      estadoRevision,
      horasAprobadas: estadoRevision === 'aprobado' ? Number(revisionHoras) : 0,
      feedbackRevision: feedback,
      evidenciaRevision: revisionEvidencia,
      imagenesRevision: stringifyWorkflowArray(revisionImagenes),
      reprogramadoPara: estadoRevision === 'rechazado' ? revisionReprogramar : '',
    })
    setSaving(false)
    setEditRevision(false)
  }

  async function handleImageUpload(event) {
    const files = Array.from(event.target.files || [])
    if (files.length === 0) return
    setImageError('')
    try {
      const disponibles = Math.max(0, MAX_WORKFLOW_IMAGES - imagenes.length)
      if (disponibles === 0) throw new Error(`Máximo ${MAX_WORKFLOW_IMAGES} imágenes por actividad.`)
      const nuevas = []
      for (const file of files.slice(0, disponibles)) {
        nuevas.push(await compressWorkflowImage(file))
      }
      setImagenes(prev => [...prev, ...nuevas])
    } catch (err) {
      setImageError(err.message || 'No se pudo cargar la imagen.')
    } finally {
      event.target.value = ''
    }
  }

  function removeImage(id) {
    setImagenes(prev => prev.filter(img => img.id !== id))
  }

  async function handleRevisionImageUpload(event) {
    const files = Array.from(event.target.files || [])
    if (files.length === 0) return
    setImageError('')
    try {
      const disponibles = Math.max(0, MAX_WORKFLOW_IMAGES - revisionImagenes.length)
      if (disponibles === 0) throw new Error(`Máximo ${MAX_WORKFLOW_IMAGES} imágenes por revisión.`)
      const nuevas = []
      for (const file of files.slice(0, disponibles)) {
        nuevas.push(await compressWorkflowImage(file))
      }
      setRevisionImagenes(prev => [...prev, ...nuevas])
    } catch (err) {
      setImageError(err.message || 'No se pudo cargar la evidencia de revisión.')
    } finally {
      event.target.value = ''
    }
  }

  function removeRevisionImage(id) {
    setRevisionImagenes(prev => prev.filter(img => img.id !== id))
  }

  const isUrl = (s) => s && (s.startsWith('http://') || s.startsWith('https://'))
  const checklistDone = checklist.filter(item => item.done).length
  const checklistTotal = checklist.length
  const adminRevisionImages = parseJsonArray(act.ImagenesRevision)
  const hasAdminFeedback = Boolean(act.FeedbackRevision || act.EvidenciaRevision || adminRevisionImages.length > 0 || act.RevisadoPor)

  return (
    <div className={`border rounded-xl p-4 space-y-3 transition-all
      ${act.Estado === 'completado' ? 'bg-emerald-50 border-emerald-200' :
        act.Estado === 'en_proceso' ? 'bg-blue-50 border-blue-200' :
        act.Estado === 'bloqueado'  ? 'bg-red-50 border-red-200' :
        'bg-white border-gray-200'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className={`font-semibold text-sm ${act.Estado === 'completado' ? 'line-through text-gray-400' : 'text-gray-900'}`}>
            {tituloActividad}
          </p>
          <FormattedDescription text={act.Descripcion} />
        </div>
        <div className="flex gap-1 flex-shrink-0">
          {isAdmin && (
            <>
              <button onClick={() => { setEditDetalle(v => !v); setEditHoras(false); setEditEvidencia(false); setEditRevision(false) }}
                className="p-1 hover:bg-brand-50 rounded text-gray-400 hover:text-brand-600">
                <Pencil size={14} />
              </button>
              <button onClick={() => onDelete(act)} className="p-1 hover:bg-red-50 rounded text-gray-400 hover:text-red-600">
                <Trash2 size={14} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Panel: Editar detalle (solo admin) */}
      {editDetalle && (
        <div className="pt-2 space-y-2 border-t border-gray-100">
          <input className="input text-sm" value={detalle.titulo}
            onChange={e => setDetalle(d => ({ ...d, titulo: e.target.value }))} placeholder="Título" />
          <RichTextBox value={detalle.descripcion}
            onChange={value => setDetalle(d => ({ ...d, descripcion: value }))}
            placeholder="Descripción organizada: objetivos, pasos, notas, enlaces o checklist textual..." />
          <div className="flex gap-2">
            <select className="input text-sm flex-1" value={detalle.diaSemana}
              onChange={e => setDetalle(d => ({ ...d, diaSemana: e.target.value }))}>
              {DIAS_SEMANA.map(d => <option key={d}>{d}</option>)}
            </select>
            <input type="number" min="0.5" step="0.5" className="input text-sm w-28"
              value={detalle.horasEstimadas}
              onChange={e => setDetalle(d => ({ ...d, horasEstimadas: e.target.value }))} placeholder="Horas" />
          </div>
          <div className="flex gap-2">
            <button onClick={() => setEditDetalle(false)} className="btn-secondary text-xs flex-1">Cancelar</button>
            <button onClick={saveDetalle} disabled={saving} className="btn-primary text-xs flex-1">
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium ${est.css}`}>
          <Icon size={11} /> {est.label}
        </span>
        <span className="text-gray-400">{diaActividad}</span>
        <span className="text-gray-400">{act.HorasEstimadas}h estimadas</span>
        {checklistTotal > 0 && (
          <span className="text-indigo-700 font-medium">{checklistDone}/{checklistTotal} verificadas</span>
        )}
        {Number(act.HorasReales) > 0 && (
          <span className="text-emerald-700 font-medium">{act.HorasReales}h reales</span>
        )}
        {horasAprobadas > 0 && (
          <span className="text-brand-700 font-semibold">{horasAprobadas}h aprobadas</span>
        )}
      </div>

      <div className={`rounded-xl border px-3 py-2 text-xs ${revision.css}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-semibold flex items-center gap-1.5">
            <RevisionIcon size={14} /> {revision.label}
          </span>
          {revisionEstado === 'aprobado' && (
            <span>{horasAprobadas}h válidas para prácticas/pago</span>
          )}
          {revisionEstado === 'pendiente_revision' && (
            <span>Las horas aún no cuentan hasta revisión administrativa.</span>
          )}
        </div>
        {hasAdminFeedback && (
          <div className="mt-2 rounded-lg border border-white/70 bg-white/70 p-2">
            <p className="mb-1.5 flex items-center gap-1.5 font-semibold text-gray-700">
              <MessageSquare size={13} /> {isAdmin ? 'Evidencia de revisión' : 'Retroalimentación administrativa'}
            </p>
            {act.FeedbackRevision && <p className="text-gray-700">{act.FeedbackRevision}</p>}
            {act.EvidenciaRevision && (
              <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-gray-600">
                <Paperclip size={12} className="text-gray-400 flex-shrink-0" />
                {isUrl(act.EvidenciaRevision) ? (
                  <a href={act.EvidenciaRevision} target="_blank" rel="noopener noreferrer"
                    className="text-brand-600 hover:underline flex items-center gap-1 truncate">
                    Ver evidencia del admin <ExternalLink size={11} />
                  </a>
                ) : (
                  <span className="truncate">{act.EvidenciaRevision}</span>
                )}
              </div>
            )}
            {adminRevisionImages.length > 0 && (
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
                {adminRevisionImages.map(img => (
                  <button key={img.id} type="button"
                    onClick={() => setPreviewImage({
                      ...img,
                      title: 'Evidencia de revisión administrativa',
                      description: act.FeedbackRevision || act.EvidenciaRevision || 'Captura enviada por administración.',
                    })}
                    className="group block rounded-lg overflow-hidden border border-gray-200 bg-white">
                    <img src={img.dataUrl} alt={img.name || 'Evidencia de revisión'}
                      className="h-24 w-full object-cover group-hover:opacity-90" />
                    <span className="block truncate px-2 py-1 text-[11px] text-gray-500">{img.name || 'Captura admin'}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {act.ReprogramadoPara && (
          <p className="mt-1 text-gray-600">
            Reprogramada: {act.ReprogramadoDesde || 'día anterior'} → {act.ReprogramadoPara}
          </p>
        )}
      </div>

      <WorkflowChecklist items={checklist} onChange={saveChecklist} readOnly={false} canManageItems={isAdmin} />

      {/* Evidencia adjunta */}
      {(act.Evidencia || imagenes.length > 0) && (
        <div className="space-y-2">
          {act.Evidencia && (
            <div className="flex items-center gap-1.5 text-xs text-gray-600 bg-white/70 rounded-lg px-2.5 py-1.5 border border-gray-200">
              <Paperclip size={12} className="text-gray-400 flex-shrink-0" />
              {isUrl(act.Evidencia) ? (
                <a href={act.Evidencia} target="_blank" rel="noopener noreferrer"
                  className="text-brand-600 hover:underline flex items-center gap-1 truncate">
                  Ver evidencia <ExternalLink size={11} />
                </a>
              ) : (
                <span className="truncate">{act.Evidencia}</span>
              )}
            </div>
          )}
          {imagenes.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {imagenes.map(img => (
                <button key={img.id} type="button"
                  onClick={() => setPreviewImage({
                    ...img,
                    title: isAdmin ? 'Evidencia del trabajador' : 'Mi evidencia enviada',
                    description: act.Evidencia || 'Captura adjunta a la actividad.',
                  })}
                  className="group block rounded-lg overflow-hidden border border-gray-200 bg-white">
                  <img src={img.dataUrl} alt={img.name || 'Evidencia visual'}
                    className="h-24 w-full object-cover group-hover:opacity-90" />
                  <span className="block truncate px-2 py-1 text-[11px] text-gray-500">{img.name || 'Captura'}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Controles de estado */}
      <div className="flex flex-wrap gap-1.5 pt-1">
        {act.Estado === 'pendiente' && (
          <button onClick={() => onUpdate(act.ID, { estado: 'en_proceso' })}
            className="text-xs px-2.5 py-1 rounded-lg bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-1">
            <PlayCircle size={12} /> Iniciar
          </button>
        )}
        {act.Estado === 'en_proceso' && (
          <>
            <button onClick={() => { setEditHoras(v => !v); setEditEvidencia(false); setEditRevision(false) }}
              className="text-xs px-2.5 py-1 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 flex items-center gap-1">
              <Clock size={12} /> Horas reales
            </button>
            <button onClick={() => onUpdate(act.ID, { estado: 'completado', horasReales: Number(horas) })}
              className="text-xs px-2.5 py-1 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 flex items-center gap-1">
              <CheckCircle size={12} /> Completar
            </button>
          </>
        )}
        {/* La administración puede adjuntar guía/evidencia desde el inicio; el usuario agrega evidencia al avanzar la actividad. */}
        {(isAdmin || act.Estado !== 'pendiente') && (
          <button onClick={() => { setEditEvidencia(v => !v); setEditHoras(false); setEditRevision(false) }}
            className="text-xs px-2.5 py-1 rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200 flex items-center gap-1">
            <Paperclip size={12} /> {(act.Evidencia || imagenes.length) ? 'Editar evidencia' : 'Agregar evidencia'}
          </button>
        )}
        {isAdmin && (
          <button onClick={() => { setEditRevision(v => !v); setEditHoras(false); setEditEvidencia(false); setEditDetalle(false) }}
            className="text-xs px-2.5 py-1 rounded-lg bg-indigo-100 text-indigo-700 hover:bg-indigo-200 flex items-center gap-1">
            <ShieldCheck size={12} /> Revisión admin
          </button>
        )}
      </div>

      {/* Panel: Horas reales */}
      {editHoras && (
        <div className="pt-2 space-y-2">
          <div className="flex gap-2">
            <input type="number" step="0.5" min="0" className="input text-sm flex-1"
              value={horas} onChange={e => setHoras(e.target.value)} placeholder="Horas trabajadas" />
            <button onClick={saveHoras} disabled={saving} className="btn-primary text-xs px-3">
              {saving ? '...' : 'Guardar'}
            </button>
          </div>
          <textarea className="input text-xs" rows={2} value={notas}
            onChange={e => setNotas(e.target.value)} placeholder="Notas opcionales..." />
        </div>
      )}

      {/* Panel: Revisión administrativa */}
      {editRevision && isAdmin && (
        <div className="pt-3 space-y-3 border-t border-indigo-100 bg-white/60 rounded-xl p-3">
          <div>
            <p className="text-xs font-semibold text-indigo-800 flex items-center gap-1.5">
              <ShieldCheck size={14} /> Revisión administrativa de horas
            </p>
            <p className="text-[11px] text-gray-500 mt-0.5">
              Solo las horas aprobadas aquí cuentan para prácticas, pago y cumplimiento.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-2">
            <div>
              <label className="label">Horas que se aprueban</label>
              <input type="number" step="0.5" min="0" className="input text-sm"
                value={revisionHoras} onChange={e => setRevisionHoras(e.target.value)}
                placeholder="Ej: 4" />
            </div>
            <div>
              <label className="label">Si no cumple, mover a otro día</label>
              <select className="input text-sm" value={revisionReprogramar}
                onChange={e => setRevisionReprogramar(e.target.value)}>
                <option value="">No reprogramar</option>
                {DIAS_SEMANA.filter(d => d !== diaActividad).map(d => <option key={d}>{d}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Observación / retroalimentación para la persona</label>
            <RichTextBox value={revisionFeedback} onChange={setRevisionFeedback} rows={3}
              placeholder="Ej: Actividad aprobada. / No se cumplió lo solicitado: falta adjuntar evidencia..." />
            {revisionError && <p className="text-xs text-red-600 mt-1">{revisionError}</p>}
          </div>
          <div className="rounded-xl border border-dashed border-indigo-200 bg-indigo-50/50 p-3 space-y-2">
            <label className="text-xs font-semibold text-indigo-800 flex items-center gap-1.5">
              <ImageIcon size={13} /> Evidencia de revisión para el trabajador
            </label>
            <p className="text-[11px] text-gray-500">
              Úsalo para adjuntar capturas de lo que falta, errores encontrados o referencias que la persona debe corregir.
            </p>
            <RichTextBox value={revisionEvidencia} onChange={setRevisionEvidencia} rows={2}
              placeholder="Enlace, nota breve o explicación de la captura..." />
            <input type="file" accept="image/*" multiple onChange={handleRevisionImageUpload}
              className="block w-full text-xs text-gray-500 file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-indigo-700 hover:file:bg-indigo-50" />
            {imageError && <p className="text-xs text-red-600">{imageError}</p>}
            {revisionImagenes.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {revisionImagenes.map(img => (
                  <div key={img.id} className="relative rounded-lg overflow-hidden border border-indigo-100 bg-white">
                    <img src={img.dataUrl} alt={img.name || 'Evidencia de revisión'} className="h-24 w-full object-cover" />
                    <button type="button" onClick={() => removeRevisionImage(img.id)}
                      className="absolute top-1 right-1 rounded-full bg-white/90 p-1 text-gray-500 hover:text-red-600">
                      <X size={12} />
                    </button>
                    <p className="truncate px-2 py-1 text-[11px] text-gray-500">{img.name || 'Captura admin'}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="grid sm:grid-cols-3 gap-2">
            <button type="button" onClick={() => saveRevision('aprobado')} disabled={saving}
              className="text-xs px-3 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 font-semibold flex items-center justify-center gap-1.5">
              <CheckCircle size={13} /> Aprobar horas
            </button>
            <button type="button" onClick={() => saveRevision('rechazado')} disabled={saving}
              className="text-xs px-3 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 font-semibold flex items-center justify-center gap-1.5">
              <XCircle size={13} /> No aprobar
            </button>
            <button type="button" onClick={() => saveRevision('pendiente_revision')} disabled={saving}
              className="btn-secondary text-xs">
              Dejar pendiente
            </button>
          </div>
        </div>
      )}

      {/* Panel: Evidencia */}
      {editEvidencia && (
        <div className="pt-2 space-y-2">
          <p className="text-xs text-gray-500">Escribe una explicación ordenada, pega un enlace o usa el editor flotante para dar formato a la evidencia.</p>
          <RichTextBox value={evidencia} onChange={setEvidencia} rows={3}
            placeholder="https://drive.google.com/... o descripción de lo que se realizó" />
          <div className="rounded-lg border border-dashed border-gray-300 bg-white/70 p-3 space-y-2">
            <label className="text-xs font-medium text-gray-700 flex items-center gap-1.5">
              <ImageIcon size={13} /> Capturas o referencias visuales
            </label>
            <input type="file" accept="image/*" multiple onChange={handleImageUpload}
              className="block w-full text-xs text-gray-500 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-brand-700 hover:file:bg-brand-100" />
            {imageError && <p className="text-xs text-red-600">{imageError}</p>}
            {imagenes.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {imagenes.map(img => (
                  <div key={img.id} className="relative rounded-lg overflow-hidden border border-gray-200 bg-white">
                    <img src={img.dataUrl} alt={img.name || 'Evidencia'} className="h-24 w-full object-cover" />
                    <button type="button" onClick={() => removeImage(img.id)}
                      className="absolute top-1 right-1 rounded-full bg-white/90 p-1 text-gray-500 hover:text-red-600">
                      <X size={12} />
                    </button>
                    <p className="truncate px-2 py-1 text-[11px] text-gray-500">{img.name || 'Captura'}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setEditEvidencia(false)} className="btn-secondary text-xs flex-1">Cancelar</button>
            <button onClick={saveEvidencia} disabled={saving} className="btn-primary text-xs flex-1">
              {saving ? 'Guardando...' : <><Save size={12} /> Guardar evidencia</>}
            </button>
          </div>
        </div>
      )}

      <EvidenceImagePreview image={previewImage} onClose={() => setPreviewImage(null)} />
    </div>
  )
}

function NuevaActividadForm({ flujoId, username, onSave, onCancel, diaInicial = 'Lunes' }) {
  const [form, setForm] = useState({
    titulo: '', descripcion: '', diaSemana: diaInicial, horasEstimadas: 1, checklist: [],
  })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setFormError('')
    try {
      await api.addActividadFlujo({
        ...form,
        flujoId,
        username,
        descripcionFormato: 'texto_enriquecido_v1',
        checklist: stringifyWorkflowArray(form.checklist),
        imagenes: '[]',
      })
      onSave()
    } catch (err) {
      setFormError(err?.message || 'No se pudo guardar la actividad.')
    }
    finally { setSaving(false) }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 border border-dashed border-brand-300 rounded-xl p-4 bg-brand-50">
      <p className="text-xs font-semibold text-brand-700 uppercase tracking-wide">Nueva actividad</p>
      <input className="input text-sm" required placeholder="Título de la actividad *"
        value={form.titulo} onChange={e => set('titulo', e.target.value)} />
      <RichTextBox value={form.descripcion} onChange={value => set('descripcion', value)} rows={3}
        placeholder="Describe objetivos, pasos, responsables o referencias de esta actividad..." />
      <WorkflowChecklist items={form.checklist} onChange={items => set('checklist', items)} />
      {formError && <p className="text-xs text-red-600 bg-red-50 rounded-lg p-2">{formError}</p>}
      <div className="flex gap-2">
        <select className="input text-sm flex-1" value={form.diaSemana} onChange={e => set('diaSemana', e.target.value)}>
          {DIAS_SEMANA.map(d => <option key={d}>{d}</option>)}
        </select>
        <input type="number" min="0.5" step="0.5" className="input text-sm w-28"
          value={form.horasEstimadas} onChange={e => set('horasEstimadas', Number(e.target.value))}
          placeholder="Horas" />
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="btn-secondary text-xs flex-1">Cancelar</button>
        <button type="submit" disabled={saving} className="btn-primary text-xs flex-1">
          {saving ? 'Guardando...' : 'Agregar Actividad'}
        </button>
      </div>
    </form>
  )
}

export default function FlujosView() {
  const { isAdmin, user } = useAuth()
  const [semana, setSemana]       = useState(getMondayOf())
  const [flujos, setFlujos]       = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')
  const [usuarios, setUsuarios]   = useState([])
  const [usuarioSel, setUsuarioSel] = useState('')
  const [showNuevoFlujo, setShowNuevoFlujo]   = useState(false)
  const [showNuevaAct, setShowNuevaAct]       = useState(null)
  const [confirmDel, setConfirmDel]           = useState(null)      // actividad
  const [confirmDelFlujo, setConfirmDelFlujo] = useState(false)     // flujo completo
  const [editFlujo, setEditFlujo]             = useState(false)     // panel editar flujo
  const [deleting, setDeleting]               = useState(false)
  const [horasPlan, setHorasPlan]             = useState(40)
  const [notasFlujo, setNotasFlujo]           = useState('')
  const [editHorasPlan, setEditHorasPlan]     = useState(40)
  const [editNotas, setEditNotas]             = useState('')
  const [saving, setSaving]                   = useState(false)

  const targetUser = isAdmin
    ? usuarioSel   // no fallback: esperar a que setUsuarioSel se inicialice
    : (user?.username || '')

  const load = useCallback(({ preserveScroll = false } = {}) => {
    if (!targetUser) return  // evita carga con usuario vacío
    const scrollY = typeof window !== 'undefined' ? window.scrollY : 0
    setLoading(true)
    api.getFlujosSemana({ username: targetUser, semana })
      .then(r => setFlujos(r.data || []))
      .catch(e => setError(e.message))
      .finally(() => {
        setLoading(false)
        if (preserveScroll && typeof window !== 'undefined') {
          window.requestAnimationFrame(() => window.scrollTo({ top: scrollY }))
        }
      })
  }, [semana, targetUser])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (isAdmin) {
      api.getUsuarios()
        .then(r => {
          const activos = (r.data || []).filter(u => u.Activo === true || u.Activo === 'TRUE')
          setUsuarios(activos)
          if (!usuarioSel && activos.length > 0) setUsuarioSel(activos[0].Username)
        })
        .catch(() => {})
    }
  }, [isAdmin])

  const semanaLabel = (() => {
    const d   = new Date(semana + 'T12:00:00Z')
    const fin = new Date(semana + 'T12:00:00Z')
    fin.setUTCDate(fin.getUTCDate() + 4)
    return `${d.getUTCDate()} – ${fin.getUTCDate()} ${fin.toLocaleDateString('es-EC', { month:'long', year:'numeric' })}`
  })()

  async function crearFlujo() {
    setSaving(true)
    try {
      await api.addFlujoSemanal({ username: targetUser, semana, totalHorasPlan: horasPlan, notas: notasFlujo })
      setShowNuevoFlujo(false)
      load()
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  async function handleUpdateAct(id, data, options = {}) {
    try { await api.updateActividadFlujo(id, data); load({ preserveScroll: options.preserveScroll === true }) }
    catch (e) { setError(e.message) }
  }

  async function handleDeleteAct() {
    setDeleting(true)
    try { await api.deleteActividadFlujo(confirmDel.ID); setConfirmDel(null); load() }
    catch (e) { setError(e.message) }
    finally { setDeleting(false) }
  }

  async function handleEditFlujo() {
    setSaving(true)
    try {
      await api.updateFlujoSemanal(flujoActual.ID, { totalHorasPlan: editHorasPlan, notas: editNotas })
      setEditFlujo(false)
      load()
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  async function handleDeleteFlujo() {
    setDeleting(true)
    try {
      await api.deleteFlujoSemanal(flujoActual.ID)
      setConfirmDelFlujo(false)
      load()
    } catch (e) { setError(e.message) }
    finally { setDeleting(false) }
  }

  function openEditFlujo() {
    setEditHorasPlan(Number(flujoActual.TotalHorasPlan) || 40)
    setEditNotas(flujoActual.Notas || '')
    setEditFlujo(true)
  }

  const flujoActual = flujos[0]
  const totalEst   = flujoActual?.actividades?.reduce((s, a) => s + (Number(a.HorasEstimadas) || 0), 0) || 0
  const totalReal  = flujoActual?.actividades?.reduce((s, a) => s + (Number(a.HorasReales) || 0), 0) || 0
  const totalAprobado = flujoActual?.actividades?.reduce((s, a) => s + getHorasAprobadas(a), 0) || 0
  const completadas = flujoActual?.actividades?.filter(a => a.Estado === 'completado').length || 0
  const aprobadas = flujoActual?.actividades?.filter(a => getRevisionEstado(a) === 'aprobado').length || 0
  const rechazadas = flujoActual?.actividades?.filter(a => getRevisionEstado(a) === 'rechazado').length || 0
  const totalActs   = flujoActual?.actividades?.length || 0
  const actividades = flujoActual?.actividades || []

  // Agrupar actividades por día
  const actsByDia = DIAS_SEMANA.reduce((acc, d) => {
    acc[d] = actividades.filter(a => normalizeDiaSemana(a.DiaSemana) === d)
    return acc
  }, {})
  const actsSinDia = actividades.filter(a => !normalizeDiaSemana(a.DiaSemana))

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Flujos Semanales de Trabajo</h2>
          <p className="text-sm text-gray-500">Planificación y seguimiento de actividades</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isAdmin && (
            <select className="input w-auto text-sm" value={usuarioSel}
              onChange={e => setUsuarioSel(e.target.value)}>
              {usuarios.map(u => <option key={u.ID} value={u.Username}>{u.Nombre}</option>)}
            </select>
          )}
          <button onClick={() => setSemana(s => addDays(s, -7))}
            className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50"><ChevronLeft size={18} /></button>
          <span className="text-sm font-medium text-gray-700 whitespace-nowrap px-1">{semanaLabel}</span>
          <button onClick={() => setSemana(s => addDays(s, 7))}
            className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50"><ChevronRight size={18} /></button>
          <button onClick={() => setSemana(getMondayOf())} className="btn-secondary text-sm">Esta semana</button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}

      {loading ? <TableSkeleton cols={3} rows={6} /> : (
        <>
          {!flujoActual ? (
            /* ── Sin flujo para esta semana ── */
            <div className="card text-center py-12">
              <ListChecks size={40} className="text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">
                {isAdmin
                  ? `No hay flujo creado para ${targetUser} esta semana`
                  : 'No tienes un plan de trabajo asignado para esta semana'}
              </p>
              {isAdmin && (
                <button onClick={() => setShowNuevoFlujo(v => !v)}
                  className="btn-primary text-sm mt-4 mx-auto inline-flex items-center gap-2">
                  <Plus size={16} /> Crear flujo semanal
                </button>
              )}
              {showNuevoFlujo && (
                <div className="mt-6 max-w-sm mx-auto text-left space-y-3 bg-gray-50 rounded-xl p-4">
                  <p className="text-sm font-semibold text-gray-700">Nuevo flujo — semana del {semanaLabel}</p>
                  <div>
                    <label className="label">Horas planificadas</label>
                    <input type="number" className="input" value={horasPlan}
                      onChange={e => setHorasPlan(Number(e.target.value))} />
                  </div>
                  <div>
                    <label className="label">Notas (opcional)</label>
                    <textarea className="input" rows={2} value={notasFlujo}
                      onChange={e => setNotasFlujo(e.target.value)} />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setShowNuevoFlujo(false)} className="btn-secondary flex-1 text-sm">Cancelar</button>
                    <button onClick={crearFlujo} disabled={saving} className="btn-primary flex-1 text-sm">
                      {saving ? 'Creando...' : 'Crear flujo'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Cabecera del flujo con acciones admin */}
              {isAdmin && (
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs text-gray-500">Flujo asignado a <span className="font-semibold text-gray-700">{targetUser}</span> · semana {semanaLabel}</p>
                    {flujoActual.Notas && <p className="text-xs text-gray-400 mt-0.5 italic">{flujoActual.Notas}</p>}
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button onClick={openEditFlujo}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium transition-colors">
                      <Pencil size={13} /> Editar flujo
                    </button>
                    <button onClick={() => setConfirmDelFlujo(true)}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 font-medium transition-colors">
                      <Trash2 size={13} /> Eliminar
                    </button>
                  </div>
                </div>
              )}

              {/* Panel de edición del flujo */}
              {editFlujo && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                  <p className="text-sm font-semibold text-amber-800">Editar flujo de trabajo</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">Horas planificadas</label>
                      <input type="number" className="input" value={editHorasPlan}
                        onChange={e => setEditHorasPlan(Number(e.target.value))} />
                    </div>
                    <div>
                      <label className="label">Notas</label>
                      <input className="input" value={editNotas}
                        onChange={e => setEditNotas(e.target.value)} placeholder="Opcional..." />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setEditFlujo(false)} className="btn-secondary flex-1 text-sm">Cancelar</button>
                    <button onClick={handleEditFlujo} disabled={saving} className="btn-primary flex-1 text-sm">
                      {saving ? 'Guardando...' : 'Guardar cambios'}
                    </button>
                  </div>
                </div>
              )}

              {/* Resumen del flujo */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {[
                  { label: 'Horas plan',   val: `${flujoActual.TotalHorasPlan}h`,      css: 'text-brand-700' },
                  { label: 'H. estimadas', val: `${totalEst}h`,                         css: 'text-gray-700' },
                  { label: 'H. reportadas', val: `${totalReal}h`,                       css: 'text-emerald-700' },
                  { label: 'H. aprobadas', val: `${totalAprobado}h`,                    css: 'text-indigo-700' },
                  { label: 'Progreso',     val: totalActs ? `${completadas}/${totalActs} tareas` : '0 tareas', css: 'text-amber-700' },
                ].map(k => (
                  <div key={k.label} className="card py-3 text-center">
                    <p className={`text-lg font-bold ${k.css}`}>{k.val}</p>
                    <p className="text-xs text-gray-500">{k.label}</p>
                  </div>
                ))}
              </div>

              {/* Barra de progreso */}
              {totalActs > 0 && (
                <div className="card py-3">
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
                    <span>Progreso general</span>
                    <span className="font-medium">{Math.round(completadas / totalActs * 100)}%</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full transition-all"
                      style={{ width: `${Math.round(completadas / totalActs * 100)}%` }} />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
                    <span className="font-medium text-indigo-700">{aprobadas}/{totalActs} aprobadas</span>
                    {rechazadas > 0 && <span className="font-medium text-red-600">{rechazadas} no aprobadas</span>}
                    <span>Las horas solo suman cuando administración aprueba la actividad.</span>
                  </div>
                </div>
              )}

              {/* Actividades por día */}
              <div className="space-y-4">
                {DIAS_SEMANA.map((dia, i) => {
                  const fechaDia = addDays(semana, i)
                  const now = new Date()
                  const todayLocal = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
                  const esHoy = fechaDia === todayLocal
                  const acts = actsByDia[dia]
                  return (
                    <div key={dia}>
                      <div className={`flex items-center gap-2 mb-2 ${esHoy ? 'text-brand-700' : 'text-gray-700'}`}>
                        <span className={`text-sm font-bold ${esHoy ? 'text-brand-700' : 'text-gray-700'}`}>{dia}</span>
                        <span className="text-xs text-gray-400">{fmt.date(fechaDia)}</span>
                        {esHoy && <span className="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-medium">Hoy</span>}
                        <div className="flex-1 h-px bg-gray-100 ml-2" />
                        {isAdmin && (
                          <button onClick={() => setShowNuevaAct(showNuevaAct === `${flujoActual.ID}-${dia}` ? null : `${flujoActual.ID}-${dia}`)}
                            className="text-xs text-brand-600 hover:text-brand-800 flex items-center gap-1">
                            <Plus size={14} /> Agregar
                          </button>
                        )}
                      </div>

                      {showNuevaAct === `${flujoActual.ID}-${dia}` && (
                        <NuevaActividadForm
                          flujoId={flujoActual.ID}
                          username={targetUser}
                          diaInicial={dia}
                          onSave={() => { setShowNuevaAct(null); load() }}
                          onCancel={() => setShowNuevaAct(null)}
                        />
                      )}

                      {acts.length === 0 ? (
                        <p className="text-xs text-gray-300 italic pl-2">Sin actividades para este día</p>
                      ) : (
                        <div className="space-y-2">
                          {acts.map(act => (
                            <ActividadCard
                              key={act.ID}
                              act={act}
                              isAdmin={isAdmin}
                              onUpdate={handleUpdateAct}
                              onDelete={setConfirmDel}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
                {actsSinDia.length > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <div className="flex items-center gap-2 mb-2 text-amber-800">
                      <AlertCircle size={15} />
                      <span className="text-sm font-bold">Actividades guardadas sin día válido</span>
                      <span className="text-xs text-amber-700">
                        Edita la actividad y asígnala a Lunes, Martes, Miércoles, Jueves o Viernes.
                      </span>
                    </div>
                    <div className="space-y-2">
                      {actsSinDia.map(act => (
                        <ActividadCard
                          key={act.ID}
                          act={act}
                          isAdmin={isAdmin}
                          onUpdate={handleUpdateAct}
                          onDelete={setConfirmDel}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Admin: agregar actividad global */}
              {isAdmin && (
                <div className="flex justify-center pt-2">
                  <button onClick={() => setShowNuevaAct(showNuevaAct === 'global' ? null : 'global')}
                    className="btn-secondary text-sm flex items-center gap-2">
                    <Plus size={16} /> Agregar actividad al flujo
                  </button>
                </div>
              )}
              {showNuevaAct === 'global' && (
                <NuevaActividadForm
                  flujoId={flujoActual.ID}
                  username={targetUser}
                  onSave={() => { setShowNuevaAct(null); load() }}
                  onCancel={() => setShowNuevaAct(null)}
                />
              )}
            </>
          )}
        </>
      )}

      <ConfirmDialog
        open={!!confirmDel} onClose={() => setConfirmDel(null)} onConfirm={handleDeleteAct}
        loading={deleting} title="Eliminar Actividad"
        message={`¿Eliminar la actividad "${confirmDel?.Titulo || 'Actividad sin título'}"?`}
      />

      <ConfirmDialog
        open={confirmDelFlujo} onClose={() => setConfirmDelFlujo(false)} onConfirm={handleDeleteFlujo}
        loading={deleting} title="Eliminar Flujo Semanal"
        message={`¿Eliminar el flujo completo de la semana ${semanaLabel}? Se eliminarán también todas sus actividades. Esta acción no se puede deshacer.`}
      />
    </div>
  )
}
