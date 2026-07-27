export const BRAND = Object.freeze({
  matrixName: 'R.A. Training',
  appName: 'Finance',
  fullName: 'R.A. Training Finance',
  subtitle: 'Sistema de gestión financiera y certificación',
  website: 'ra-training.com',
})

export function publicAppOrigin() {
  const configured = String(import.meta.env?.VITE_PUBLIC_APP_URL || '').trim()
  const browserOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'
  return (configured || browserOrigin).replace(/\/$/, '')
}
