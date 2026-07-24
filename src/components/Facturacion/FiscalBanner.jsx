import { AlertTriangle, FlaskConical, WifiOff } from 'lucide-react'
import { resolveFiscalRuntimeContext } from '../../utils/fiscalRuntimeContext'

export default function FiscalBanner({ config, readiness }) {
  const runtime = resolveFiscalRuntimeContext({
    realSriConnectionEnabled: config?.sri?.realConnectionEnabled,
    readinessReady: readiness?.ready,
    certificateConfigured: config?.certificate?.configured,
  })
  return (
    <div className="rounded-xl border border-orange-300 bg-orange-50 px-4 py-3 text-orange-950 shadow-sm" role="status">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-bold tracking-wide sm:text-sm">
        <span className="inline-flex items-center gap-2"><FlaskConical size={17} /> {runtime.environment}</span>
        <span className="inline-flex items-center gap-2"><AlertTriangle size={17} /> {runtime.validity}</span>
        <span className="inline-flex items-center gap-2"><WifiOff size={17} /> {runtime.connection}</span>
      </div>
    </div>
  )
}
