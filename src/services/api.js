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

export const api = {
  login: (username, password) =>
    call('login', { username, password }),

  logout: () =>
    call('logout', {}, getToken()),

  getDashboard: (year, month) =>
    call('getDashboard', { year, month }, getToken()),

  getIngresos: (filtros = {}) =>
    call('getIngresos', { filtros }, getToken()),
  addIngreso: (ingreso) =>
    call('addIngreso', { ingreso }, getToken()),
  updateIngreso: (id, ingreso) =>
    call('updateIngreso', { id, ingreso }, getToken()),
  deleteIngreso: (id) =>
    call('deleteIngreso', { id }, getToken()),

  getEgresos: (filtros = {}) =>
    call('getEgresos', { filtros }, getToken()),
  addEgreso: (egreso) =>
    call('addEgreso', { egreso }, getToken()),
  updateEgreso: (id, egreso) =>
    call('updateEgreso', { id, egreso }, getToken()),
  deleteEgreso: (id) =>
    call('deleteEgreso', { id }, getToken()),

  getPagos: (filtros = {}) =>
    call('getPagos', { filtros }, getToken()),
  addPago: (pago) =>
    call('addPago', { pago }, getToken()),
  updatePago: (id, pago) =>
    call('updatePago', { id, pago }, getToken()),
  deletePago: (id) =>
    call('deletePago', { id }, getToken()),

  getContratos: (filtros = {}) =>
    call('getContratos', { filtros }, getToken()),
  addContrato: (contrato) =>
    call('addContrato', { contrato }, getToken()),
  updateContrato: (id, contrato) =>
    call('updateContrato', { id, contrato }, getToken()),

  getProyecciones: (filtros = {}) =>
    call('getProyecciones', { filtros }, getToken()),
  addProyeccion: (proyeccion) =>
    call('addProyeccion', { proyeccion }, getToken()),
  updateProyeccion: (id, proyeccion) =>
    call('updateProyeccion', { id, proyeccion }, getToken()),

  getCategorias: () =>
    call('getCategorias', {}, getToken()),
  addCategoria: (categoria) =>
    call('addCategoria', { categoria }, getToken()),

  getUsuarios: () =>
    call('getUsuarios', {}, getToken()),
  addUsuario: (usuario) =>
    call('addUsuario', { usuario }, getToken()),
  updateUsuario: (id, usuario) =>
    call('updateUsuario', { id, usuario }, getToken()),

  getServicios: () =>
    call('getServicios', {}, getToken()),
  addServicio: (servicio) =>
    call('addServicio', { servicio }, getToken()),
  updateServicio: (id, servicio) =>
    call('updateServicio', { id, servicio }, getToken()),

  getInscripciones: (filtros = {}) =>
    call('getInscripciones', { filtros }, getToken()),
  addInscripcion: (inscripcion) =>
    call('addInscripcion', { inscripcion }, getToken()),
  updateInscripcion: (id, inscripcion) =>
    call('updateInscripcion', { id, inscripcion }, getToken()),

  getConfigPagos: () =>
    call('getConfigPagos', {}, getToken()),
  addConfigPago: (configPago) =>
    call('addConfigPago', { configPago }, getToken()),
  updateConfigPago: (id, configPago) =>
    call('updateConfigPago', { id, configPago }, getToken()),

  getConvenios: (filtros = {}) =>
    call('getConvenios', { filtros }, getToken()),
  addConvenio: (convenio) =>
    call('addConvenio', { convenio }, getToken()),
  updateConvenio: (id, convenio) =>
    call('updateConvenio', { id, convenio }, getToken()),
  deleteConvenio: (id) =>
    call('deleteConvenio', { id }, getToken()),
}
