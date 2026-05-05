// URL del Google Apps Script desplegado como Web App
// Reemplazar con la URL real después del deploy
const API_URL = import.meta.env.VITE_API_URL || ''

async function call(action, params = {}, token = null) {
  if (!API_URL) throw new Error('API_URL no configurada. Revisa el archivo .env')

  const body = { action, ...params }
  if (token) body.token = token

  const res = await fetch(API_URL, {
    method: 'POST',
    body: JSON.stringify(body),
    redirect: 'follow',
  })

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

  // Ingresos
  getIngresos: (filtros = {}) =>
    call('getIngresos', { filtros }, getToken()),
  addIngreso: (ingreso) =>
    call('addIngreso', { ingreso }, getToken()),
  updateIngreso: (id, ingreso) =>
    call('updateIngreso', { id, ingreso }, getToken()),
  deleteIngreso: (id) =>
    call('deleteIngreso', { id }, getToken()),

  // Egresos
  getEgresos: (filtros = {}) =>
    call('getEgresos', { filtros }, getToken()),
  addEgreso: (egreso) =>
    call('addEgreso', { egreso }, getToken()),
  updateEgreso: (id, egreso) =>
    call('updateEgreso', { id, egreso }, getToken()),
  deleteEgreso: (id) =>
    call('deleteEgreso', { id }, getToken()),

  // Pagos
  getPagos: (filtros = {}) =>
    call('getPagos', { filtros }, getToken()),
  addPago: (pago) =>
    call('addPago', { pago }, getToken()),
  updatePago: (id, pago) =>
    call('updatePago', { id, pago }, getToken()),
  deletePago: (id) =>
    call('deletePago', { id }, getToken()),

  // Contratos
  getContratos: (filtros = {}) =>
    call('getContratos', { filtros }, getToken()),
  addContrato: (contrato) =>
    call('addContrato', { contrato }, getToken()),
  updateContrato: (id, contrato) =>
    call('updateContrato', { id, contrato }, getToken()),

  // Proyecciones
  getProyecciones: (filtros = {}) =>
    call('getProyecciones', { filtros }, getToken()),
  addProyeccion: (proyeccion) =>
    call('addProyeccion', { proyeccion }, getToken()),
  updateProyeccion: (id, proyeccion) =>
    call('updateProyeccion', { id, proyeccion }, getToken()),

  // Categorías
  getCategorias: () =>
    call('getCategorias', {}, getToken()),
  addCategoria: (categoria) =>
    call('addCategoria', { categoria }, getToken()),

  // Usuarios (solo admin)
  getUsuarios: () =>
    call('getUsuarios', {}, getToken()),
  addUsuario: (usuario) =>
    call('addUsuario', { usuario }, getToken()),
  updateUsuario: (id, usuario) =>
    call('updateUsuario', { id, usuario }, getToken()),
}
