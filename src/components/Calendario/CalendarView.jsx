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

const TIPO_LABEL = { Servicio: 'Evento', ResumenInscripciones: 'Inscritos', Proyeccion: 'Proyección' }

function toYMD(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d)) return null
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function EventDetailCard({ ev }) {
  return (
    <div className={`rounded-lg p-2.5 ${COLOR[ev.color]?.chip || 'bg-gray-50'}`}>
      <p className="text-xs font-semibold flex items-center gap-1">
        {TIPO_LABEL[ev.tipo] || ev.tipo}
        {ev.estadoEvento === 'programado' && <span className="badge-blue">visible</span>}
        {ev.cursoActivo === false && <span className="badge-gray inline-flex items-center gap-1"><EyeOff size={10} /> curso inactivo</span>}
      </p>
      <p className="text-sm font-bold mt-0.5">{ev.titulo}</p>
      {ev.sub && <p className="text-xs mt-0.5 opacity-70">{ev.sub}</p>}
      {Number(ev.inscritos) > 0 && <p className="text-xs mt-1 font-semibold text-emerald-700">{ev.inscritos} inscritos registrados</p>}
      <div className="mt-2 space-y-1 text-xs opacity-80">
        {ev.capacitador && <p className="flex items-center gap-1"><UserRound size={12} /> {ev.capacitador}</p>}
        {ev.fechaFin && ev.fechaFin !== ev.fecha && <p className="flex items-center gap-1"><CheckCircle2 size={12} /> Hasta {fmt.date(ev.fechaFin)}</p>}
      </div>
    </div>
  )
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
  const [vista, setVista] = useState('mes')

  const load = useCallback(() => {
    setLoading(true)
    // Cargar el año completo permite que la grilla muestre correctamente los
    // primeros días del mes siguiente y últimos del anterior cuando aparecen en
    // la vista mensual.
    api.getCalendario(year)
      .then(r => setEventos(r.data || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [year])

  useEffect(() => { load() }, [load])

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
  }

  // Build calendar grid with adjacent month days, so the first days of next
  // month remain visible instead of blank cells.
  const gridStart = new Date(year, month, 1)
  gridStart.setDate(gridStart.getDate() - gridStart.getDay())
  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart)
    d.setDate(gridStart.getDate() + i)
    return d
  })

  function dateYMD(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  }

  function eventosForYMD(ymd) {
    return eventos.filter(ev => {
      if (tipoFiltro && ev.tipo !== tipoFiltro) return false
      const start = toYMD(ev.fecha)
      const end   = toYMD(ev.fechaFin) || start
      return ymd >= start && ymd <= end
    })
  }

  const todayYMD = toYMD(new Date().toISOString())
  const selectedEventos = selected ? eventosForYMD(selected) : []
  const baseViewDate = selected || todayYMD
  const baseDate = new Date(baseViewDate + 'T12:00:00')
  const weekStart = new Date(baseDate)
  weekStart.setDate(baseDate.getDate() - baseDate.getDay() + 1)
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(weekStart.getDate() + i)
    return d
  })

  // Upcoming events list (current month)
  const monthPrefix = `${year}-${String(month+1).padStart(2,'0')}`
  const monthEventos = eventos.filter(ev => {
    if (tipoFiltro && ev.tipo !== tipoFiltro) return false
    const start = toYMD(ev.fecha)
    const end = toYMD(ev.fechaFin) || start
    return (start && start.startsWith(monthPrefix)) || (end && end.startsWith(monthPrefix))
  }).sort((a, b) => new Date(a.fecha) - new Date(b.fecha))

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="card p-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-3">
            <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200">
              <ChevronLeft size={18} />
            </button>
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-400 font-semibold">Calendario operativo</p>
              <h2 className="text-xl font-bold text-gray-900 min-w-[180px]">
                {MESES_LARGO[month]} {year}
              </h2>
            </div>
            <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200">
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
            <div className="flex rounded-lg border border-gray-200 bg-white p-1">
              {['mes', 'semana', 'dia'].map(item => (
                <button key={item} type="button" onClick={() => setVista(item)}
                  className={`px-3 py-1.5 rounded-md font-semibold capitalize ${vista === item ? 'bg-brand-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                  {item}
                </button>
              ))}
            </div>
            <select className="input text-xs py-2 w-auto min-w-[190px]" value={tipoFiltro} onChange={e => setTipoFiltro(e.target.value)}>
              <option value="">Todo el calendario</option>
              <option value="Servicio">Solo eventos/cursos</option>
              <option value="ResumenInscripciones">Solo resumen de inscritos</option>
              <option value="Proyeccion">Solo proyecciones</option>
            </select>
            <button onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()); setSelected(todayYMD) }} className="btn-secondary text-xs py-2 px-3">
              Hoy
            </button>
            <span className="hidden md:flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />Eventos/cursos</span>
            <span className="hidden md:flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />Resumen inscritos</span>
            <span className="hidden md:flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-purple-500 inline-block" />Proyecciones</span>
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        {/* Calendar grid */}
        <div className="xl:col-span-3 card p-0 overflow-hidden">
          {vista === 'dia' && (
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-400 font-semibold">Vista diaria</p>
                  <h3 className="font-bold text-gray-900">
                    {new Date(baseViewDate + 'T12:00:00').toLocaleDateString('es-EC', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                  </h3>
                </div>
                <button type="button" className="btn-secondary text-xs" onClick={() => setSelected(todayYMD)}>Hoy</button>
              </div>
              {eventosForYMD(baseViewDate).length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">Sin eventos este día.</p>
              ) : (
                eventosForYMD(baseViewDate).map(ev => (
                  <EventDetailCard key={ev.id + ev.fecha} ev={ev} />
                ))
              )}
            </div>
          )}
          {vista === 'semana' && (
            <div className="grid md:grid-cols-7 divide-y md:divide-y-0 md:divide-x divide-gray-100">
              {weekDays.map(day => {
                const ymd = dateYMD(day)
                const evs = eventosForYMD(ymd)
                return (
                  <button key={ymd} type="button" onClick={() => setSelected(ymd)}
                    className={`min-h-[240px] p-3 text-left hover:bg-gray-50 ${ymd === selected ? 'bg-brand-50' : 'bg-white'}`}>
                    <p className={`text-xs font-semibold ${ymd === todayYMD ? 'text-brand-700' : 'text-gray-500'}`}>
                      {day.toLocaleDateString('es-EC', { weekday: 'short', day: 'numeric' })}
                    </p>
                    <div className="mt-3 space-y-2">
                      {evs.length === 0 ? <p className="text-xs text-gray-300">Sin eventos</p> : evs.map(ev => (
                        <div key={ev.id + ev.fecha} className={`text-[10px] leading-tight px-2 py-1.5 rounded-md ${COLOR[ev.color]?.chip || 'bg-gray-100 text-gray-700'}`}>
                          <p className="font-bold line-clamp-2">{ev.titulo}</p>
                          {Number(ev.inscritos) > 0 && <p className="mt-0.5 font-semibold">{ev.inscritos} inscritos</p>}
                        </div>
                      ))}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
          {vista === 'mes' && (
          <>
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
              {cells.map((cellDate, i) => {
                const ymd = dateYMD(cellDate)
                const d = cellDate.getDate()
                const isCurrentMonth = cellDate.getMonth() === month
                const evs = eventosForYMD(ymd)
                const isToday = ymd === todayYMD
                const isSelected = ymd === selected
                return (
                  <div
                    key={i}
                    onClick={() => setSelected(isSelected ? null : ymd)}
                    className={`min-h-[132px] border-b border-r border-gray-100 p-2 relative transition-colors
                      cursor-pointer hover:bg-gray-50
                      ${!isCurrentMonth ? 'bg-gray-50/70 text-gray-400' : 'bg-white'}
                      ${isSelected ? 'bg-brand-50 ring-1 ring-inset ring-brand-300' : ''}
                    `}
                  >
                    <span className={`text-xs font-semibold w-7 h-7 flex items-center justify-center rounded-full
                      ${isToday ? 'bg-brand-600 text-white' : isCurrentMonth ? 'text-gray-700' : 'text-gray-400'}
                    `}>{d}</span>
                    <div className="mt-1.5 space-y-1">
                      {evs.slice(0, 3).map((ev, ei) => (
                        <div key={ei} className={`text-[10px] leading-tight px-1.5 py-1 rounded-md shadow-sm ${COLOR[ev.color]?.chip || 'bg-gray-100 text-gray-700'}`}>
                          <p className="font-bold line-clamp-2">{ev.titulo}</p>
                          <p className="mt-0.5 opacity-75 truncate">{TIPO_LABEL[ev.tipo] || ev.tipo}</p>
                          {Number(ev.inscritos) > 0 && <p className="mt-0.5 font-semibold">{ev.inscritos} inscritos</p>}
                          {ev.capacitador && <p className="mt-0.5 opacity-80 truncate">Cap.: {ev.capacitador}</p>}
                        </div>
                      ))}
                      {evs.length > 3 && (
                        <div className="text-[10px] text-gray-400 px-1">+{evs.length - 3} más</div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          </>
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
                  {selectedEventos.map(ev => <EventDetailCard key={ev.id} ev={ev} />)}
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
