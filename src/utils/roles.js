export const ROLE_META = {
  admin: { label: 'Administrador', shortLabel: 'Admin', css: 'badge-blue' },
  vendedor: { label: 'Vendedor', shortLabel: 'Vendedor', css: 'badge-green' },
  contador: { label: 'Contador', shortLabel: 'Contador', css: 'badge-blue' },
  moodle: { label: 'Encargado Moodle', shortLabel: 'Moodle', css: 'badge-purple' },
  aval: { label: 'Aval externo', shortLabel: 'Aval', css: 'badge-yellow' },
  usuario: { label: 'Usuario', shortLabel: 'Usuario', css: 'badge-gray' },
}

export const ROLE_ORDER = ['admin', 'vendedor', 'contador', 'moodle', 'aval', 'usuario']

export function normalizeRole(role) {
  const normalized = String(role || '').trim().toLowerCase()
  return ROLE_META[normalized] ? normalized : ''
}

export function parseRoles(value) {
  if (Array.isArray(value)) return value.map(normalizeRole).filter(Boolean)
  const raw = String(value || '').trim()
  if (!raw) return []
  if (raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed.map(normalizeRole).filter(Boolean)
    } catch {
      // Fallback to separator parsing below.
    }
  }
  return raw.split(/[,;|]/).map(normalizeRole).filter(Boolean)
}

export function uniqueRoles(roles) {
  const set = new Set(parseRoles(roles))
  return ROLE_ORDER.filter(role => set.has(role))
}

export function rolesOf(user) {
  const roles = uniqueRoles([
    ...parseRoles(user?.roles),
    ...parseRoles(user?.Roles),
    normalizeRole(user?.rol),
    normalizeRole(user?.Rol),
  ])
  return roles.length ? roles : ['usuario']
}

export function hasRole(user, role) {
  return rolesOf(user).includes(role)
}

export function primaryRole(roles) {
  const normalized = uniqueRoles(roles)
  return normalized[0] || 'usuario'
}
