async function call(action, params = {}, token = null) {
  const body = { action, ...params }
  if (token) body.token = token

  const url = `/api/proxy?payload=${encodeURIComponent(JSON.stringify(body))}`
  const res = await fetch(url)

  if (!res.ok) throw new Error(`Error HTTP ${res.status}`)
  const data = await res.json()
  if (!data.success) throw new Error(data.error || 'Error desconocido')
  return data
}

function getToken() {
  return localStorage.getItem('rat_token')
}

// ── In-memory cache (stale-while-revalidate, 45 s TTL) ──────────────────────
const _cache = new Map()
const _TTL   = 45_000

function _key(action, params, token) {
  // Include token tail so different users never share cached data
  return action + ':' + (token ? token.slice(-12) : 'anon') + ':' + JSON.stringify(params ?? {})
}

async function callCached(action, params, token) {
  const k   = _key(action, params, token)
  const hit = _cache.get(k)
  if (hit) {
    const age = Date.now() - hit.ts
    if (age < _TTL) return hit.data
    // stale — return immediately and refresh in background
    call(action, params, token)
      .then(d => _cache.set(k, { data: d, ts: Date.now() }))
      .catch(() => {})
    return hit.data
  }
  const data = await call(action, params, token)
  _cache.set(k, { data, ts: Date.now() })
  return data
}

function bust(...prefixes) {
  const tok = getToken()
  const tail = tok ? tok.slice(-12) : 'anon'
  for (const k of _cache.keys()) {
    if (prefixes.some(p => k.startsWith(p + ':' + tail))) _cache.delete(k)
  }
}

export const api = {
  login: (username, password) =>
    call('login', { username, password }),

  logout: () => {
    _cache.clear()  // clear all cache on logout
    return call('logout', {}, getToken())
  },

  getDashboard: (year, month) =>
    callCached('getDashboard', { year, month }, getToken()),

  getIngresos: (filtros = {}) =>
    callCached('getIngresos', { filtros }, getToken()),
  addIngreso: (ingreso) => {
    bust('getIngresos', 'getDashboard')
    return call('addIngreso', { ingreso }, getToken())
  },
  updateIngreso: (id, ingreso) => {
    bust('getIngresos', 'getDashboard')
    return call('updateIngreso', { id, ingreso }, getToken())
  },
  deleteIngreso: (id) => {
    bust('getIngresos', 'getDashboard')
    return call('deleteIngreso', { id }, getToken())
  },

  getEgresos: (filtros = {}) =>
    callCached('getEgresos', { filtros }, getToken()),
  addEgreso: (egreso) => {
    bust('getEgresos', 'getDashboard')
    return call('addEgreso', { egreso }, getToken())
  },
  updateEgreso: (id, egreso) => {
    bust('getEgresos', 'getDashboard')
    return call('updateEgreso', { id, egreso }, getToken())
  },
  deleteEgreso: (id) => {
    bust('getEgresos', 'getDashboard')
    return call('deleteEgreso', { id }, getToken())
  },

  getPagos: (filtros = {}) =>
    callCached('getPagos', { filtros }, getToken()),
  addPago: (pago) => {
    bust('getPagos', 'getDashboard')
    return call('addPago', { pago }, getToken())
  },
  updatePago: (id, pago) => {
    bust('getPagos', 'getDashboard')
    return call('updatePago', { id, pago }, getToken())
  },
  deletePago: (id) => {
    bust('getPagos', 'getDashboard')
    return call('deletePago', { id }, getToken())
  },

  getContratos: (filtros = {}) =>
    callCached('getContratos', { filtros }, getToken()),
  addContrato: (contrato) => {
    bust('getContratos')
    return call('addContrato', { contrato }, getToken())
  },
  updateContrato: (id, contrato) => {
    bust('getContratos')
    return call('updateContrato', { id, contrato }, getToken())
  },

  getProyecciones: (filtros = {}) =>
    callCached('getProyecciones', { filtros }, getToken()),
  addProyeccion: (proyeccion) => {
    bust('getProyecciones', 'getDashboard')
    return call('addProyeccion', { proyeccion }, getToken())
  },
  updateProyeccion: (id, proyeccion) => {
    bust('getProyecciones', 'getDashboard')
    return call('updateProyeccion', { id, proyeccion }, getToken())
  },

  getCategorias: () =>
    callCached('getCategorias', {}, getToken()),
  addCategoria: (categoria) => {
    bust('getCategorias')
    return call('addCategoria', { categoria }, getToken())
  },

  getUsuarios: () =>
    callCached('getUsuarios', {}, getToken()),
  addUsuario: (usuario) => {
    bust('getUsuarios')
    return call('addUsuario', { usuario }, getToken())
  },
  updateUsuario: (id, usuario) => {
    bust('getUsuarios')
    return call('updateUsuario', { id, usuario }, getToken())
  },

  getServicios: () =>
    callCached('getServicios', {}, getToken()),
  addServicio: (servicio) => {
    bust('getServicios')
    return call('addServicio', { servicio }, getToken())
  },
  updateServicio: (id, servicio) => {
    bust('getServicios')
    return call('updateServicio', { id, servicio }, getToken())
  },

  getInscripciones: (filtros = {}) =>
    callCached('getInscripciones', { filtros }, getToken()),
  addInscripcion: (inscripcion) => {
    bust('getInscripciones', 'getDashboard')
    return call('addInscripcion', { inscripcion }, getToken())
  },
  updateInscripcion: (id, inscripcion) => {
    bust('getInscripciones', 'getDashboard')
    return call('updateInscripcion', { id, inscripcion }, getToken())
  },

  getConfigPagos: () =>
    callCached('getConfigPagos', {}, getToken()),
  addConfigPago: (configPago) => {
    bust('getConfigPagos')
    return call('addConfigPago', { configPago }, getToken())
  },
  updateConfigPago: (id, configPago) => {
    bust('getConfigPagos')
    return call('updateConfigPago', { id, configPago }, getToken())
  },

  getCalendario: (year, month) =>
    callCached('getCalendario', { year, month }, getToken()),

  getConvenios: (filtros = {}) =>
    callCached('getConvenios', { filtros }, getToken()),
  addConvenio: (convenio) => {
    bust('getConvenios')
    return call('addConvenio', { convenio }, getToken())
  },
  updateConvenio: (id, convenio) => {
    bust('getConvenios')
    return call('updateConvenio', { id, convenio }, getToken())
  },
  deleteConvenio: (id) => {
    bust('getConvenios')
    return call('deleteConvenio', { id }, getToken())
  },
}
