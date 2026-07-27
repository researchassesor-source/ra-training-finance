export const BRAND = Object.freeze({
  matrixName: 'R.A. Training',
  appName: 'Finance',
  fullName: 'R.A. Training Finance',
  subtitle: 'Sistema de gestión financiera y certificación',
  website: 'ra-training.com',
})

function normalizedEnvironment(value) {
  const environment = String(value || '').trim().toLowerCase()
  if (['development', 'preview', 'production'].includes(environment)) return environment
  return environment === 'test' ? 'development' : 'production'
}

function isLocalHostname(hostname) {
  return ['localhost', '127.0.0.1', '::1'].includes(String(hostname || '').toLowerCase())
}

export function resolveCertificatePublicBaseUrl({ environment, configuredUrl, browserOrigin } = {}) {
  const resolvedEnvironment = normalizedEnvironment(environment)
  const configured = String(configuredUrl || '').trim()
  const localOrigin = String(browserOrigin || '').trim()
  const candidate = configured || (resolvedEnvironment === 'development' ? localOrigin : '')
  if (!candidate) {
    return {
      valid: false,
      environment: resolvedEnvironment,
      url: '',
      error: 'VITE_PUBLIC_APP_URL es obligatoria para emitir certificados en Preview y Production.',
    }
  }
  try {
    const parsed = new URL(candidate)
    const validProtocol = parsed.protocol === 'https:' || (resolvedEnvironment === 'development' && parsed.protocol === 'http:')
    if (!validProtocol || parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error('invalid')
    if (resolvedEnvironment !== 'development' && isLocalHostname(parsed.hostname)) throw new Error('local')
    return {
      valid: true,
      environment: resolvedEnvironment,
      url: parsed.origin + parsed.pathname.replace(/\/$/, ''),
      error: '',
    }
  } catch {
    return {
      valid: false,
      environment: resolvedEnvironment,
      url: '',
      error: 'La URL pública de certificados es inválida o no es segura para este entorno.',
    }
  }
}

export function detectCertificateEnvironment({ explicit, mode, isDev, hostname } = {}) {
  if (explicit) return explicit
  if (mode === 'test' || isDev || isLocalHostname(hostname)) return 'development'
  const host = String(hostname || '').toLowerCase()
  if (host.endsWith('.vercel.app') && /(?:^|-)git-|-[a-z0-9]{6,}-/.test(host)) return 'preview'
  return 'production'
}

function runtimeCertificateEnvironment() {
  return detectCertificateEnvironment({
    explicit: import.meta.env?.VITE_DEPLOYMENT_ENV,
    mode: import.meta.env?.MODE,
    isDev: import.meta.env?.DEV,
    hostname: typeof window !== 'undefined' ? window.location.hostname : '',
  })
}

export function certificatePublicUrlStatus() {
  return resolveCertificatePublicBaseUrl({
    environment: runtimeCertificateEnvironment(),
    configuredUrl: import.meta.env?.VITE_PUBLIC_APP_URL,
    browserOrigin: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000',
  })
}

export function getCertificatePublicBaseUrl() {
  const status = certificatePublicUrlStatus()
  if (!status.valid) throw new Error(status.error)
  return status.url
}

export function publicAppOrigin() {
  return getCertificatePublicBaseUrl()
}
