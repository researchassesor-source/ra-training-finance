import { AlertTriangle, FlaskConical, WifiOff } from 'lucide-react'

export default function FiscalBanner() {
  return (
    <div className="rounded-xl border border-orange-300 bg-orange-50 px-4 py-3 text-orange-950 shadow-sm" role="status">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-bold tracking-wide sm:text-sm">
        <span className="inline-flex items-center gap-2"><FlaskConical size={17} /> AMBIENTE LOCAL DE DESARROLLO</span>
        <span className="inline-flex items-center gap-2"><AlertTriangle size={17} /> SIN VALIDEZ TRIBUTARIA</span>
        <span className="inline-flex items-center gap-2"><WifiOff size={17} /> NO CONECTADO AL SRI</span>
      </div>
    </div>
  )
}
