const ALLOWED_CONTEXTS = new Set(['auto', 'local', 'preview', 'certification', 'production'])
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])

const CONTEXT_COPY = {
  local: {
    context: 'local',
    environment: 'ENTORNO LOCAL DE DESARROLLO',
    validity: 'SIN VALIDEZ TRIBUTARIA',
    connection: 'NO CONECTADO AL SRI',
  },
  preview: {
    context: 'preview',
    environment: 'ENTORNO DE PREVISUALIZACIÓN',
    validity: 'SIN VALIDEZ TRIBUTARIA',
    connection: 'NO CONECTADO AL SRI',
  },
  certification: {
    context: 'certification',
    environment: 'AMBIENTE DE CERTIFICACIÓN SRI',
    validity: 'SIN VALIDEZ TRIBUTARIA',
    connection: 'NO CONECTADO AL SRI',
  },
  production: {
    context: 'production',
    environment: 'AMBIENTE DE PRODUCCIÓN SRI',
    validity: 'VALIDEZ SUJETA A AUTORIZACIÓN DEL SRI',
    connection: 'CONEXIÓN SRI NO CONFIRMADA',
  },
}
export function resolveFiscalRuntimeContext({
  configured = import.meta.env.VITE_FISCAL_RUNTIME_CONTEXT || 'auto',
  hostname = typeof window === 'undefined' ? 'localhost' : window.location.hostname,
  realSriConnectionEnabled = false,
  readinessReady = false,
  certificateConfigured = false,
  explicitProductionConnection = import.meta.env.VITE_FISCAL_PRODUCTION_CONNECTION_CONFIRMED === 'true',
} = {}) {
  const requested = ALLOWED_CONTEXTS.has(configured) ? configured : 'auto'
  let context = requested

  if (requested === 'auto') {
    context = LOCAL_HOSTS.has(hostname) ? 'local' : 'preview'
  }

  const productionConnected = context === 'production'
    && realSriConnectionEnabled
    && readinessReady
    && certificateConfigured
    && explicitProductionConnection

  if (context !== 'production' || !productionConnected) return CONTEXT_COPY[context]
  return { ...CONTEXT_COPY.production, connection: 'CONECTADO AL SRI' }
}
