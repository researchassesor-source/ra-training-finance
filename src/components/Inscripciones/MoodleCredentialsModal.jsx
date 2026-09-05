import { useState } from 'react'
import { Copy, Eye, EyeOff, GraduationCap, MessageCircle, Save } from 'lucide-react'
import Modal from '../UI/Modal'
import { api } from '../../services/api'

const STATUS_META = {
  pendiente: { label: 'Pendiente de carga', css: 'badge-yellow' },
  cargado: { label: 'Credenciales cargadas', css: 'badge-blue' },
  preparado: { label: 'WhatsApp preparado', css: 'badge-green' },
}

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '')
  // Los registros ecuatorianos suelen almacenarse como 09xxxxxxxx; wa.me
  // requiere el prefijo internacional sin el cero local.
  if (digits.length === 10 && digits.startsWith('0')) return `593${digits.slice(1)}`
  return digits
}

function credentialsMessage(item, values) {
  return [
    '*R.A. Training — Acceso al aula virtual*',
    '',
    `Hola *${item.ClienteNombre || 'participante'}*,`,
    'Te compartimos tus datos de acceso al aula virtual para que puedas iniciar tu curso:',
    '',
    `📚 *Curso:* ${item.ServicioNombre || 'Curso R.A. Training'}`,
    `🌐 *Aula virtual:* ${values.url}`,
    `👤 *Usuario:* ${values.username}`,
    `🔐 *Contraseña temporal:* ${values.password}`,
    '',
    'Por seguridad, cambia tu contraseña al ingresar por primera vez.',
    'Si tienes alguna dificultad, responde a este mensaje y te ayudaremos. 🙌',
    '',
    '¡Bienvenido/a a R.A. Training! 🎓',
  ].join('\n')
}

export default function MoodleCredentialsModal({ inscripcion, isAdmin, onClose, onUpdated }) {
  const [username, setUsername] = useState(inscripcion?.MoodleUsername || '')
  const [password, setPassword] = useState('')
  const [url, setUrl] = useState(inscripcion?.MoodleUrl || '')
  const [notes, setNotes] = useState(inscripcion?.MoodleNotes || '')
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  if (!inscripcion) return null
  const status = STATUS_META[inscripcion.MoodleStatus] || STATUS_META.pendiente
  const currentValues = {
    username: username.trim(),
    // Solo administración puede volver a utilizar una contraseña ya guardada
    // para preparar el envío. El encargado Moodle puede cargarla/actualizarla,
    // pero no recibe una vía directa para copiar o enviar credenciales.
    password: password.trim() || (isAdmin ? inscripcion.MoodlePassword || '' : ''),
    url: url.trim(),
  }

  function updateList(data) {
    if (data && onUpdated) onUpdated(data)
  }

  async function saveCredentials() {
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const result = await api.updateMoodleCredentials(inscripcion.ID, {
        username: currentValues.username,
        password: password.trim(),
        url: currentValues.url,
        notes: notes.trim(),
      })
      updateList(result.data)
      setPassword('')
      setNotice(result.status === 'cargado'
        ? 'Credenciales guardadas correctamente. El administrador decide cuándo compartirlas.'
        : 'Registro guardado como pendiente: complete usuario y contraseña para habilitar el acceso.')
    } catch (err) {
      setError(err.message || 'No se pudieron guardar las credenciales.')
    } finally {
      setSaving(false)
    }
  }

  async function prepareWhatsApp() {
    if (!currentValues.username || !currentValues.password || !currentValues.url) {
      setError('Complete usuario, contraseña y URL del aula antes de preparar el envío.')
      return
    }
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const saved = await api.updateMoodleCredentials(inscripcion.ID, {
        username: currentValues.username,
        password: password.trim(),
        url: currentValues.url,
        notes: notes.trim(),
      })
      const prepared = await api.registrarEnvioMoodle(inscripcion.ID)
      updateList(prepared.data || saved.data)
      const phone = normalizePhone(inscripcion.ClienteTelefono)
      const target = phone ? `https://wa.me/${phone}` : 'https://wa.me/'
      const waUrl = `${target}?text=${encodeURIComponent(credentialsMessage(inscripcion, currentValues))}`
      window.open(waUrl, '_blank', 'noopener,noreferrer')
      setPassword('')
      setNotice(phone
        ? 'WhatsApp se abrió con el mensaje personalizado y el envío quedó registrado.'
        : 'WhatsApp se abrió con el mensaje listo. Esta inscripción no tiene teléfono registrado; seleccione el contacto manualmente.')
    } catch (err) {
      setError(err.message || 'No se pudo preparar el envío por WhatsApp.')
    } finally {
      setSaving(false)
    }
  }

  async function copyMessage() {
    if (!currentValues.username || !currentValues.password || !currentValues.url) {
      setError('Complete usuario, contraseña y URL para copiar el mensaje.')
      return
    }
    try {
      await navigator.clipboard.writeText(credentialsMessage(inscripcion, currentValues))
      setNotice('Mensaje copiado. Puede pegarlo en el canal que prefiera.')
    } catch {
      setError('El navegador no permitió copiar automáticamente el mensaje.')
    }
  }

  return (
    <Modal open={!!inscripcion} onClose={onClose} title="Acceso al aula virtual Moodle" size="lg">
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-xl border border-brand-100 bg-brand-50/60 p-4">
          <div className="rounded-xl bg-white p-2 text-brand-700 shadow-sm"><GraduationCap size={22} /></div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-brand-900">{inscripcion.ClienteNombre}</p>
            <p className="text-sm text-brand-700">{inscripcion.ServicioNombre}</p>
            <span className={`${status.css} mt-2`}>{status.label}</span>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="moodle-username">Usuario Moodle *</label>
            <input id="moodle-username" className="input" value={username} onChange={e => setUsername(e.target.value)} placeholder="usuario del aula" autoComplete="off" />
          </div>
          <div>
            <label className="label" htmlFor="moodle-password">Contraseña Moodle *</label>
            <div className="relative">
              <input id="moodle-password" className="input pr-10" type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder={inscripcion.MoodlePassword ? 'Dejar vacío para conservar' : 'Contraseña temporal'} autoComplete="new-password" />
              <button type="button" onClick={() => setShowPassword(value => !value)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:text-brand-700" aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="moodle-url">URL del aula virtual *</label>
            <input id="moodle-url" className="input" type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://aula.ejemplo.com" />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="moodle-notes">Nota interna (opcional)</label>
            <textarea id="moodle-notes" className="input" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Observación para administración..." />
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-gray-700">Vista previa del mensaje</p>
            {isAdmin && <button type="button" onClick={copyMessage} className="btn-secondary px-2.5 py-1 text-xs"><Copy size={13} /> Copiar</button>}
          </div>
          <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-gray-700">{currentValues.username && currentValues.password && currentValues.url ? credentialsMessage(inscripcion, currentValues) : 'Complete los campos requeridos para ver el mensaje.'}</pre>
        </div>

        {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {notice && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}

        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="button" onClick={onClose} className="btn-secondary flex-1" disabled={saving}>Cerrar</button>
          <button type="button" onClick={saveCredentials} className="btn-primary flex-1" disabled={saving}><Save size={14} /> {saving ? 'Guardando...' : 'Guardar acceso'}</button>
          {isAdmin && <button type="button" onClick={prepareWhatsApp} className="btn-success flex-1" disabled={saving}><MessageCircle size={14} /> Preparar WhatsApp</button>}
        </div>
        {!isAdmin && <p className="text-xs text-gray-500">El administrador revisará los datos y decidirá cuándo compartirlos con el participante.</p>}
      </div>
    </Modal>
  )
}
