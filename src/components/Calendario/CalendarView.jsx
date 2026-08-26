import { useEffect, useState, useCallback } from 'react'
import { api } from '../../services/api'
import { fmt } from '../../utils/formatters'
import { ChevronLeft, ChevronRight, Calendar, UserRound, EyeOff, CheckCircle2 } from 'lucide-react'

const DIAS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']
const MESES_LARGO = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

const COLOR = {
  blue:   { dot: 'bg-blue-500',   chip: 'bg-blue-50 text-blue-900 border border-blue-200' },
  green:  { dot: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-800 border border-emerald-200' },
  purple: { dot: 'bg-purple-500', chip: 'bg-purple-50 text-purple-800 border border-purple-200' },
  amber:  { dot: 'bg-amber-500',  chip: 'bg-amber-50 text-amber-800 border border-amber-200' },
}

const TIPO_LABEL = { Servicio: 'Evento', Inscripcion: 'Inscripción', Proyeccion: 'Proyección' }

function toYMD(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d)) return null
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

export default function CalendarView() {
  const now = new Date()
  const [year, setYear]     = useState(now.getFullYear())
  const [month, setMonth]   = useState(now.getMonth()) // 0-indexed
  const [eventos, setEventos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState('')
  const [selected, setSelected] = useState(null) // clicked day YMD
  const [tipoFiltro, setTipoFiltro] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    api.getCalendario(year, month + 1)
      .then(r => setEventos(r.data || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [year, month])

  useEffect(() => { load() }, [load])

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
  }

  // Build calendar grid
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  function dayYMD(d) {
    return `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
  }

  function eventosForDay(d) {
    const ymd = dayYMD(d)
    return eventos.filter(ev => {
      if (tipoFiltro && ev.tipo !== tipoFiltro) return false
      const start = toYMD(ev.fecha)
      const end   = toYMD(ev.fechaFin) || start
      return ymd >= start && ymd <= end
    })
  }

  const todayYMD = toYMD(new Date().toISOString())
  const selectedEventos = selected ? eventos.filter(ev => {
    if (tipoFiltro && ev.tipo !== tipoFiltro) return false
    const start = toYMD(ev.fecha)
    const end   = toYMD(ev.fechaFin) || start
    return selected >= start && selected <= end
  }) : []

  // Upcoming events list (current month)
  const monthPrefix = `${year}-${String(month+1).padStart(2,'0')}`
  const monthEventos = eventos.filter(ev => {
    if (tipoFiltro && ev.tipo !== tipoFiltro) return false
    const start = toYMD(ev.fecha)
    const end = toYMD(ev.fechaFin) || start
    return (start && start.startsWith(monthPrefix)) || (end && end.startsWith(monthPrefix))
  }).sort((a, b) => new Date(a.fecha) - new Date(b.fecha))

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <ChevronLeft size={18} />
          </button>
          <h2 className="text-lg font-bold text-gray-900 min-w-[180px] text-center">
            {MESES_LARGO[month]} {year}
          </h2>
          <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <select className="input text-xs py-1.5 w-auto" value={tipoFiltro} onChange={e => setTipoFiltro(e.target.value)}>
            <option value="">Todo el calendario</option>
            <option value="Servicio">Solo eventos/cursos</option>
            <option value="Inscripcion">Solo inscripciones</option>
            <option value="Proyeccion">Solo proyecciones</option>
          </select>
          <span className="hidden md:flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />Eventos</span>
          <span className="hidden md:flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />Inscripciones</span>
          <span className="hidden md:flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-purple-500 inline-block" />Proyecciones</span>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        {/* Calendar grid */}
        <div className="xl:col-span-3 card p-0 overflow-hidden">
          {/* Day headers */}
          <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-100">
            {DIAS.map(d => (
              <div key={d} className="py-2 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {d}
              </div>
            ))}
          </div>
          {/* Cells */}
          {loading ? (
            <div className="animate-pulse grid grid-cols-7">
              {Array.from({ length: 35 }).map((_, i) => (
                <div key={i} className="h-24 border-b border-r border-gray-50 last:border-r-0 p-2">
                  <div className="h-4 w-4 bg-gray-100 rounded" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-7">
              {cells.map((d, i) => {
                const ymd = d ? dayYMD(d) : null
                const evs = d ? eventosForDay(d) : []
                const isToday = ymd === todayYMD
                const isSelected = ymd === selected
                return (
                  <div
                    key={i}
                    onClick={() => d && setSelected(isSelected ? null : ymd)}
                    className={`min-h-[112px] border-b border-r border-gray-100 p-2 relative transition-colors
                      ${d ? 'cursor-pointer hover:bg-gray-50' : 'bg-gray-50/50'}
                      ${isSelected ? 'bg-brand-50 ring-1 ring-inset ring-brand-300' : ''}
                    `}
                  >
                    {d && (
                      <>
                        <span className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full
                          ${isToday ? 'bg-brand-600 text-white' : 'text-gray-700'}
                        `}>{d}</span>
                        <div className="mt-1.5 space-y-1">
                          {evs.slice(0, 2).map((ev, ei) => (
                            <div key={ei} className={`text-[10px] leading-tight px-1.5 py-1 rounded-md ${COLOR[ev.color]?.chip || 'bg-gray-100 text-gray-700'}`}>
                              <p className="font-semibold line-clamp-2">{ev.titulo}</p>
                              {ev.capacitador && <p className="mt-0.5 opacity-75 truncate">Cap.: {ev.capacitador}</p>}
                            </div>
                          ))}
                          {evs.length > 2 && (
                            <div className="text-[10px] text-gray-400 px-1">+{evs.length - 2} más</div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Side panel */}
        <div className="space-y-4">
          {/* Selected day detail */}
          {selected && (
            <div className="card">
              <h3 className="font-semibold text-gray-900 mb-3 text-sm flex items-center gap-2">
                <Calendar size={15} className="text-brand-600" />
                {new Date(selected + 'T12:00:00').toLocaleDateString('es-EC', { weekday: 'long', day: 'numeric', month: 'long' })}
              </h3>
              {selectedEventos.length === 0 ? (
                <p className="text-xs text-gray-400">Sin eventos este día</p>
              ) : (
                <div className="space-y-2">
                  {selectedEventos.map(ev => (
                    <div key={ev.id} className={`rounded-lg p-2.5 ${COLOR[ev.color]?.chip || 'bg-gray-50'}`}>
                      <p className="text-xs font-semibold flex items-center gap-1">
                        {TIPO_LABEL[ev.tipo] || ev.tipo}
                        {ev.estadoEvento === 'programado' && <span className="badge-blue">visible</span>}
                        {ev.cursoActivo === false && <span className="badge-gray inline-flex items-center gap-1"><EyeOff size={10} /> curso inactivo</span>}
                      </p>
                      <p className="text-sm font-bold mt-0.5">{ev.titulo}</p>
                      {ev.sub && <p className="text-xs mt-0.5 opacity-70">{ev.sub}</p>}
                      <div className="mt-2 space-y-1 text-xs opacity-80">
                        {ev.capacitador && <p className="flex items-center gap-1"><UserRound size={12} /> {ev.capacitador}</p>}
                        {ev.fechaFin && ev.fechaFin !== ev.fecha && <p className="flex items-center gap-1"><CheckCircle2 size={12} /> Hasta {fmt.date(ev.fechaFin)}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Month event list */}
          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-3 text-sm">Eventos del mes</h3>
            {monthEventos.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">Sin eventos en {MESES_LARGO[month]}</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {monthEventos.map(ev => (
                  <div key={ev.id + ev.fecha} className="flex items-start gap-2 py-2 border-b border-gray-50 last:border-0">
                    <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${COLOR[ev.color]?.dot || 'bg-gray-400'}`} />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-gray-500">{TIPO_LABEL[ev.tipo]} · {fmt.date(ev.fecha)}</p>
                      <p className="text-sm text-gray-900 font-medium line-clamp-2">{ev.titulo}</p>
                      {ev.sub && <p className="text-xs text-gray-400 line-clamp-2">{ev.sub}</p>}
                      {ev.capacitador && <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5"><UserRound size={11} /> {ev.capacitador}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
