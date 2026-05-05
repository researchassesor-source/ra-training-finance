import { useEffect, useState, useCallback } from 'react'
import { api } from '../../services/api'
import { fmt } from '../../utils/formatters'
import { exportConvenioPDF } from '../../utils/exporters'
import Modal from '../UI/Modal'
import ConfirmDialog from '../UI/ConfirmDialog'
import Spinner from '../UI/Spinner'
import { Plus, Pencil, Trash2, Download } from 'lucide-react'

const ESTADOS = {
  activo:     { label: 'Activo',     css: 'badge-green' },
  pendiente:  { label: 'Pendiente',  css: 'badge-yellow' },
  vencido:    { label: 'Vencido',    css: 'badge-red' },
  suspendido: { label: 'Suspendido', css: 'badge-gray' },
}

const EMPTY = {
  organizacion: '', representante: '', cargo: '', objeto: '',
  obligacionesRA: '', obligacionesAliado: '', vigencia: '',
  fechaInicio: '', fechaFin: '', estado: 'activo', notas: '',
}

function mapInitial(initial) {
  if (!initial) return EMPTY
  return {
    organizacion:      initial.Organizacion      || initial.organizacion      || '',
    representante:     initial.Representante     || initial.representante     || '',
    cargo:             initial.Cargo             || initial.cargo             || '',
    objeto:            initial.Objeto            || initial.objeto            || '',
    obligacionesRA:    initial.ObligacionesRA    || initial.obligacionesRA    || '',
    obligacionesAliado:initial.ObligacionesAliado|| initial.obligacionesAliado|| '',
    vigencia:          initial.Vigencia          || initial.vigencia          || '',
    fechaInicio:       initial.FechaInicio       || initial.fechaInicio       || '',
    fechaFin:          initial.FechaFin          || initial.fechaFin          || '',
    estado:            initial.Estado            || initial.estado            || 'activo',
    notas:             initial.Notas             || initial.notas             || '',
  }
}

function ConvenioForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(() => mapInitial(initial))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      if (initial?.ID) await api.updateConvenio(initial.ID, form)
      else await api.addConvenio(form)
      onSave()
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <h3 className="text-xs font-semibold text-brand-700 uppercase tracking-wide mb-3">Datos del Aliado</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="label">Organización / Empresa *</label>
            <input className="input" required value={form.organizacion}
              onChange={e => set('organizacion', e.target.value)} placeholder="Nombre de la institución u organización aliada" />
          </div>
          <div>
            <label className="label">Representante</label>
            <input className="input" value={form.representante}
              onChange={e => set('representante', e.target.value)} placeholder="Nombre completo del representante" />
          </div>
          <div>
            <label className="label">Cargo</label>
            <input className="input" value={form.cargo}
              onChange={e => set('cargo', e.target.value)} placeholder="Director, Gerente, Coordinador..." />
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold text-brand-700 uppercase tracking-wide mb-3">Términos del Convenio</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="label">Objeto del Convenio *</label>
            <textarea className="input" rows={3} required value={form.objeto}
              onChange={e => set('objeto', e.target.value)}
              placeholder="Describe el propósito y alcance de la alianza estratégica..." />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Compromisos de R.A. Training</label>
            <textarea className="input" rows={3} value={form.obligacionesRA}
              onChange={e => set('obligacionesRA', e.target.value)}
              placeholder="Detallar los compromisos de R.A. Training (uno por línea para generar lista automática)" />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Compromisos del Aliado</label>
            <textarea className="input" rows={3} value={form.obligacionesAliado}
              onChange={e => set('obligacionesAliado', e.target.value)}
              placeholder="Detallar los compromisos del aliado estratégico (uno por línea)" />
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold text-brand-700 uppercase tracking-wide mb-3">Vigencia y Estado</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Fecha de Inicio</label>
            <input className="input" type="date" value={form.fechaInicio} onChange={e => set('fechaInicio', e.target.value)} />
          </div>
          <div>
            <label className="label">Fecha de Vencimiento</label>
            <input className="input" type="date" value={form.fechaFin} onChange={e => set('fechaFin', e.target.value)} />
          </div>
          <div>
            <label className="label">Duración / Vigencia</label>
            <input className="input" value={form.vigencia}
              onChange={e => set('vigencia', e.target.value)} placeholder="Ej: 1 año renovable, 2 años" />
          </div>
          <div>
            <label className="label">Estado</label>
            <select className="input" value={form.estado} onChange={e => set('estado', e.target.value)}>
              <option value="activo">Activo</option>
              <option value="pendiente">Pendiente de firma</option>
              <option value="vencido">Vencido</option>
              <option value="suspendido">Suspendido</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label">Notas / Disposiciones especiales</label>
            <textarea className="input" rows={2} value={form.notas}
              onChange={e => set('notas', e.target.value)} placeholder="Condiciones especiales, acuerdos adicionales..." />
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}
      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onCancel} className="btn-secondary flex-1">Cancelar</button>
        <button type="submit" className="btn-primary flex-1" disabled={saving}>
          {saving ? 'Guardando...' : initial?.ID ? 'Actualizar' : 'Crear Convenio'}
        </button>
      </div>
    </form>
  )
}

export default function ConveniosList() {
  const [data, setData]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [modal, setModal]       = useState(null)
  const [selected, setSelected] = useState(null)
  const [confirm, setConfirm]   = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [filtroEstado, setFiltroEstado] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    api.getConvenios(filtroEstado ? { estado: filtroEstado } : {})
      .then(r => setData(r.data || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [filtroEstado])

  useEffect(() => { load() }, [load])

  async function handleDelete() {
    setDeleting(true)
    try { await api.deleteConvenio(confirm.ID); setConfirm(null); load() }
    catch (e) { setError(e.message) }
    finally { setDeleting(false) }
  }

  const activos = data.filter(d => d.Estado === 'activo').length
  const pendientes = data.filter(d => d.Estado === 'pendiente').length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <select className="input w-auto text-sm" value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
            <option value="">Todos los estados</option>
            <option value="activo">Activos</option>
            <option value="pendiente">Pendientes</option>
            <option value="vencido">Vencidos</option>
            <option value="suspendido">Suspendidos</option>
          </select>
        </div>
        <button onClick={() => { setSelected(null); setModal('new') }} className="btn-primary text-sm">
          <Plus size={15} /> Nuevo Convenio
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Convenios', val: data.length,   css: 'text-gray-900' },
          { label: 'Activos',         val: activos,        css: 'text-emerald-600' },
          { label: 'Pendientes',      val: pendientes,     css: 'text-amber-600' },
          { label: 'Vencidos',        val: data.filter(d => d.Estado === 'vencido').length, css: 'text-red-500' },
        ].map(s => (
          <div key={s.label} className="card py-3 text-center">
            <p className={`text-xl font-bold ${s.css}`}>{s.val}</p>
            <p className="text-xs text-gray-500">{s.label}</p>
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}

      {loading ? <Spinner text="Cargando convenios..." /> : (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Organización','Representante','Objeto','Inicio','Vence','Estado',''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-10 text-gray-400">Sin convenios registrados</td></tr>
                ) : data.map(c => (
                  <tr key={c.ID} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900 whitespace-nowrap">{c.Organizacion}</p>
                      {c.Cargo && <p className="text-xs text-gray-400">{c.Cargo}</p>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">{c.Representante || '—'}</td>
                    <td className="px-4 py-3 max-w-xs truncate text-gray-600">{c.Objeto}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{fmt.date(c.FechaInicio) || '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{fmt.date(c.FechaFin) || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={ESTADOS[c.Estado]?.css || 'badge-gray'}>
                        {ESTADOS[c.Estado]?.label || c.Estado}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => exportConvenioPDF(c)}
                          title="Descargar carta de compromiso PDF"
                          className="p-1.5 hover:bg-brand-50 rounded text-gray-400 hover:text-brand-600 transition-colors">
                          <Download size={14} />
                        </button>
                        <button onClick={() => { setSelected(c); setModal('edit') }}
                          className="p-1.5 hover:bg-brand-50 rounded text-gray-400 hover:text-brand-600 transition-colors">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => setConfirm(c)}
                          className="p-1.5 hover:bg-red-50 rounded text-gray-400 hover:text-red-600 transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={!!modal} onClose={() => setModal(null)}
        title={modal === 'edit' ? 'Editar Convenio' : 'Nuevo Convenio de Alianza'} size="lg">
        <ConvenioForm
          initial={modal === 'edit' ? selected : null}
          onSave={() => { setModal(null); load() }}
          onCancel={() => setModal(null)}
        />
      </Modal>

      <ConfirmDialog
        open={!!confirm} onClose={() => setConfirm(null)} onConfirm={handleDelete}
        loading={deleting} title="Eliminar Convenio"
        message={`¿Eliminar el convenio con "${confirm?.Organizacion}"? Esta acción no se puede deshacer.`}
      />
    </div>
  )
}
