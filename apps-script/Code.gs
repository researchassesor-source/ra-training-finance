// ============================================================
// R.A. Training Finance — Google Apps Script Backend v1.0
// Ejecutar setupInicial() UNA VEZ para crear hojas y usuario admin
// ============================================================

const CONFIG = {
  SECRET: 'RATraining$ecret2024',   // Cambiar antes de producción
  SESSION_EXPIRY_HOURS: 24,
};

// ─────────────────────────────────────────────
// ENTRY POINTS
// ─────────────────────────────────────────────

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    return respond(processRequest(data));
  } catch (err) {
    return respond({ success: false, error: 'Error interno: ' + err.toString() });
  }
}

function doGet(e) {
  try {
    const payload = e && e.parameter && e.parameter.payload;
    if (!payload) return respond({ success: true, message: 'R.A. Training Finance API v1.0 — Online' });
    const data = JSON.parse(payload);
    return respond(processRequest(data));
  } catch (err) {
    return respond({ success: false, error: 'Error interno: ' + err.toString() });
  }
}

function processRequest(data) {
  const { action, token, ...params } = data;

  if (action === 'login') return handleLogin(params);

  const user = validateToken(token);
  if (!user) return { success: false, error: 'Sesión inválida o expirada. Por favor inicia sesión de nuevo.' };

  const handlers = {
    logout:           () => handleLogout(token),
    getDashboard:     () => getDashboard(user, params),
    getIngresos:      () => getIngresos(user, params),
    addIngreso:       () => addIngreso(user, params),
    updateIngreso:    () => updateIngreso(user, params),
    deleteIngreso:    () => deleteRecord(user, 'Ingresos', params, true),
    getEgresos:       () => getEgresos(user, params),
    addEgreso:        () => addEgreso(user, params),
    updateEgreso:     () => updateEgreso(user, params),
    deleteEgreso:     () => deleteRecord(user, 'Egresos', params, true),
    getPagos:         () => getPagos(user, params),
    addPago:          () => addPago(user, params),
    updatePago:       () => updatePago(user, params),
    deletePago:       () => deleteRecord(user, 'Pagos', params, true),
    getContratos:     () => getContratos(user, params),
    addContrato:      () => addContrato(user, params),
    updateContrato:   () => updateContrato(user, params),
    getProyecciones:  () => getProyecciones(user, params),
    addProyeccion:    () => addProyeccion(user, params),
    updateProyeccion: () => updateProyeccion(user, params),
    getCategorias:    () => getCategorias(user, params),
    addCategoria:     () => addCategoria(user, params),
    getUsuarios:      () => getUsuarios(user, params),
    addUsuario:       () => addUsuario(user, params),
    updateUsuario:    () => updateUsuario(user, params),
  };

  if (!handlers[action]) return { success: false, error: 'Acción no reconocida: ' + action };
  return handlers[action]();
}

function respond(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─────────────────────────────────────────────
// SHEET HELPERS
// ─────────────────────────────────────────────

const SHEET_HEADERS = {
  Usuarios:    ['ID','Nombre','Email','Username','PasswordHash','Rol','Activo','FechaCreacion'],
  Ingresos:    ['ID','Fecha','Tipo','Modalidad','Concepto','Cliente','ContratoID','Monto','MetodoPago','Estado','Notas','CreadoPor','FechaCreacion'],
  Egresos:     ['ID','Fecha','Categoria','Concepto','Proveedor','Monto','Estado','AprobadoPor','FechaAprobacion','Notas','CreadoPor','FechaCreacion'],
  Pagos:       ['ID','Fecha','Tipo','Beneficiario','Concepto','Referencia','Monto','MetodoPago','EgresoID','ContratoID','Estado','Notas','CreadoPor','FechaCreacion'],
  Contratos:   ['ID','Tipo','Nombre','Concepto','ValorTotal','FechaInicio','FechaFin','Estado','Notas','CreadoPor','FechaCreacion'],
  Proyecciones:['ID','Evento','Tipo','FechaEstimada','MontoProyectado','MontoReal','Estado','Notas','CreadoPor','FechaCreacion'],
  Categorias:  ['ID','Nombre','Tipo','Activo'],
  Sesiones:    ['Token','Username','UserID','Rol','Nombre','Expira'],
};

function getSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (SHEET_HEADERS[name]) {
      sheet.appendRow(SHEET_HEADERS[name]);
      const hRange = sheet.getRange(1, 1, 1, SHEET_HEADERS[name].length);
      hRange.setFontWeight('bold');
      hRange.setBackground('#3730a3');
      hRange.setFontColor('#ffffff');
      sheet.setFrozenRows(1);
    }
  }
  return sheet;
}

function sheetToObjects(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  const headers = data[0];
  return data.slice(1)
    .map((row, i) => {
      const obj = { _row: i + 2 };
      headers.forEach((h, j) => { obj[h] = row[j]; });
      return obj;
    })
    .filter(obj => obj[headers[0]] !== '' && obj[headers[0]] !== null && obj[headers[0]] !== undefined);
}

function updateRow(sheet, row, fieldMap) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  Object.entries(fieldMap).forEach(([col, val]) => {
    if (val === undefined) return;
    const idx = headers.indexOf(col) + 1;
    if (idx > 0) sheet.getRange(row._row, idx).setValue(val === null ? '' : val);
  });
}

function generateId(prefix) {
  return prefix + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5).toUpperCase();
}

function hashPassword(password) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    password + CONFIG.SECRET
  );
  return bytes.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
}

function requireAdmin(user) {
  if (user.Rol !== 'admin') throw new Error('Acceso denegado: se requiere rol de administrador.');
}

function isAdmin(user) { return user.Rol === 'admin'; }

// ─────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────

function handleLogin({ username, password }) {
  if (!username || !password) return { success: false, error: 'Usuario y contraseña requeridos.' };
  const sheet = getSheet('Usuarios');
  const users = sheetToObjects(sheet);
  const hash  = hashPassword(password);
  const user  = users.find(u =>
    u.Username === username &&
    u.PasswordHash === hash &&
    (u.Activo === true || u.Activo === 'TRUE' || u.Activo === 'true')
  );
  if (!user) return { success: false, error: 'Usuario o contraseña incorrectos.' };

  const token  = generateId('tok');
  const expiry = new Date();
  expiry.setHours(expiry.getHours() + CONFIG.SESSION_EXPIRY_HOURS);
  getSheet('Sesiones').appendRow([token, username, user.ID, user.Rol, user.Nombre, expiry.toISOString()]);

  return { success: true, token, user: { id: user.ID, nombre: user.Nombre, rol: user.Rol, username } };
}

function validateToken(token) {
  if (!token) return null;
  const sheet    = getSheet('Sesiones');
  const sessions = sheetToObjects(sheet);
  const session  = sessions.find(s => s.Token === token);
  if (!session) return null;
  if (new Date(session.Expira) < new Date()) {
    sheet.deleteRow(session._row);
    return null;
  }
  return { ID: session.UserID, Username: session.Username, Rol: session.Rol, Nombre: session.Nombre };
}

function handleLogout(token) {
  const sheet    = getSheet('Sesiones');
  const sessions = sheetToObjects(sheet);
  const session  = sessions.find(s => s.Token === token);
  if (session) sheet.deleteRow(session._row);
  return { success: true };
}

// ─────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────

function getDashboard(user, { year } = {}) {
  requireAdmin(user);
  const now         = new Date();
  const filterYear  = year || now.getFullYear();

  const ingresos     = sheetToObjects(getSheet('Ingresos'));
  const egresos      = sheetToObjects(getSheet('Egresos'));
  const contratos    = sheetToObjects(getSheet('Contratos'));
  const proyecciones = sheetToObjects(getSheet('Proyecciones'));

  const ingAño = ingresos.filter(i => {
    const d = new Date(i.Fecha);
    return d.getFullYear() === filterYear && i.Estado !== 'cancelado';
  });
  const egrAño = egresos.filter(e => new Date(e.Fecha).getFullYear() === filterYear);

  const sum = (arr, field) => arr.reduce((s, r) => s + (Number(r[field]) || 0), 0);

  const months = Array.from({ length: 12 }, (_, i) => i);
  const ingresosXMes = months.map(m => ({
    mes: m + 1,
    total: sum(ingAño.filter(i => new Date(i.Fecha).getMonth() === m), 'Monto'),
  }));
  const egresosXMes = months.map(m => ({
    mes: m + 1,
    total: sum(egrAño.filter(e => new Date(e.Fecha).getMonth() === m), 'Monto'),
  }));

  const totalIngresos = sum(ingAño, 'Monto');
  const totalEgresos  = sum(egrAño, 'Monto');

  const catMap = {};
  egrAño.forEach(e => { catMap[e.Categoria] = (catMap[e.Categoria] || 0) + (Number(e.Monto) || 0); });

  const proyFuturas = proyecciones.filter(p => p.Estado === 'proyectado');

  return {
    success: true,
    data: {
      kpis: {
        totalIngresos,
        totalEgresos,
        balance: totalIngresos - totalEgresos,
        contratosActivos: contratos.filter(c => c.Estado === 'activo').length,
        egresosPendientes: egresos.filter(e => e.Estado === 'pendiente').length,
        totalProyectado: sum(proyFuturas, 'MontoProyectado'),
      },
      ingresosXMes,
      egresosXMes,
      categorias: Object.entries(catMap).map(([nombre, total]) => ({ nombre, total })),
      recentIngresos: ingAño.sort((a,b) => new Date(b.FechaCreacion) - new Date(a.FechaCreacion)).slice(0, 5),
      recentEgresos: egrAño.sort((a,b) => new Date(b.FechaCreacion) - new Date(a.FechaCreacion)).slice(0, 5),
      proyeccionesFuturas: proyFuturas.sort((a,b) => new Date(a.FechaEstimada) - new Date(b.FechaEstimada)).slice(0, 5),
    },
  };
}

// ─────────────────────────────────────────────
// INGRESOS
// ─────────────────────────────────────────────

function getIngresos(user, { filtros = {} } = {}) {
  requireAdmin(user);
  let data = sheetToObjects(getSheet('Ingresos'));
  if (filtros.tipo)   data = data.filter(i => i.Tipo === filtros.tipo);
  if (filtros.estado) data = data.filter(i => i.Estado === filtros.estado);
  if (filtros.desde)  data = data.filter(i => new Date(i.Fecha) >= new Date(filtros.desde));
  if (filtros.hasta)  data = data.filter(i => new Date(i.Fecha) <= new Date(filtros.hasta));
  return { success: true, data };
}

function addIngreso(user, { ingreso }) {
  requireAdmin(user);
  const sheet = getSheet('Ingresos');
  const id    = generateId('ING');
  const now   = new Date().toISOString();
  sheet.appendRow([
    id, ingreso.fecha, ingreso.tipo, ingreso.modalidad || 'N/A',
    ingreso.concepto, ingreso.cliente || '', ingreso.contratoId || '',
    Number(ingreso.monto) || 0, ingreso.metodoPago,
    ingreso.estado || 'confirmado', ingreso.notas || '', user.Username, now,
  ]);
  return { success: true, id };
}

function updateIngreso(user, { id, ingreso }) {
  requireAdmin(user);
  const sheet = getSheet('Ingresos');
  const row   = sheetToObjects(sheet).find(r => r.ID === id);
  if (!row) return { success: false, error: 'Ingreso no encontrado.' };
  updateRow(sheet, row, {
    Fecha: ingreso.fecha, Tipo: ingreso.tipo, Modalidad: ingreso.modalidad,
    Concepto: ingreso.concepto, Cliente: ingreso.cliente, ContratoID: ingreso.contratoId,
    Monto: Number(ingreso.monto) || 0, MetodoPago: ingreso.metodoPago,
    Estado: ingreso.estado, Notas: ingreso.notas,
  });
  return { success: true };
}

// ─────────────────────────────────────────────
// EGRESOS
// ─────────────────────────────────────────────

function getEgresos(user, { filtros = {} } = {}) {
  let data = sheetToObjects(getSheet('Egresos'));
  if (!isAdmin(user)) data = data.filter(e => e.CreadoPor === user.Username);
  if (filtros.categoria) data = data.filter(e => e.Categoria === filtros.categoria);
  if (filtros.estado)    data = data.filter(e => e.Estado === filtros.estado);
  if (filtros.desde)     data = data.filter(e => new Date(e.Fecha) >= new Date(filtros.desde));
  if (filtros.hasta)     data = data.filter(e => new Date(e.Fecha) <= new Date(filtros.hasta));
  return { success: true, data };
}

function addEgreso(user, { egreso }) {
  const sheet  = getSheet('Egresos');
  const id     = generateId('EGR');
  const now    = new Date().toISOString();
  const estado = isAdmin(user) ? (egreso.estado || 'aprobado') : 'pendiente';
  sheet.appendRow([
    id, egreso.fecha, egreso.categoria, egreso.concepto, egreso.proveedor || '',
    Number(egreso.monto) || 0, estado, '', '', egreso.notas || '', user.Username, now,
  ]);
  return { success: true, id };
}

function updateEgreso(user, { id, egreso }) {
  requireAdmin(user);
  const sheet = getSheet('Egresos');
  const row   = sheetToObjects(sheet).find(r => r.ID === id);
  if (!row) return { success: false, error: 'Egreso no encontrado.' };
  const now = new Date().toISOString();
  updateRow(sheet, row, {
    Fecha: egreso.fecha, Categoria: egreso.categoria, Concepto: egreso.concepto,
    Proveedor: egreso.proveedor, Monto: Number(egreso.monto) || 0,
    Estado: egreso.estado, Notas: egreso.notas,
    AprobadoPor:      egreso.estado === 'aprobado' ? user.Username : row.AprobadoPor,
    FechaAprobacion:  egreso.estado === 'aprobado' ? now : row.FechaAprobacion,
  });
  return { success: true };
}

// ─────────────────────────────────────────────
// PAGOS
// ─────────────────────────────────────────────

function getPagos(user, { filtros = {} } = {}) {
  requireAdmin(user);
  let data = sheetToObjects(getSheet('Pagos'));
  if (filtros.tipo)   data = data.filter(p => p.Tipo === filtros.tipo);
  if (filtros.estado) data = data.filter(p => p.Estado === filtros.estado);
  if (filtros.desde)  data = data.filter(p => new Date(p.Fecha) >= new Date(filtros.desde));
  if (filtros.hasta)  data = data.filter(p => new Date(p.Fecha) <= new Date(filtros.hasta));
  return { success: true, data };
}

function addPago(user, { pago }) {
  requireAdmin(user);
  const sheet = getSheet('Pagos');
  const id    = generateId('PAG');
  const now   = new Date().toISOString();
  sheet.appendRow([
    id, pago.fecha, pago.tipo, pago.beneficiario, pago.concepto,
    pago.referencia || '', Number(pago.monto) || 0, pago.metodoPago,
    pago.egresoId || '', pago.contratoId || '',
    pago.estado || 'completado', pago.notas || '', user.Username, now,
  ]);
  return { success: true, id };
}

function updatePago(user, { id, pago }) {
  requireAdmin(user);
  const sheet = getSheet('Pagos');
  const row   = sheetToObjects(sheet).find(r => r.ID === id);
  if (!row) return { success: false, error: 'Pago no encontrado.' };
  updateRow(sheet, row, {
    Fecha: pago.fecha, Tipo: pago.tipo, Beneficiario: pago.beneficiario,
    Concepto: pago.concepto, Referencia: pago.referencia,
    Monto: Number(pago.monto) || 0, MetodoPago: pago.metodoPago,
    Estado: pago.estado, Notas: pago.notas,
  });
  return { success: true };
}

// ─────────────────────────────────────────────
// CONTRATOS
// ─────────────────────────────────────────────

function getContratos(user, { filtros = {} } = {}) {
  requireAdmin(user);
  let data = sheetToObjects(getSheet('Contratos'));
  if (filtros.tipo)   data = data.filter(c => c.Tipo === filtros.tipo);
  if (filtros.estado) data = data.filter(c => c.Estado === filtros.estado);
  return { success: true, data };
}

function addContrato(user, { contrato }) {
  requireAdmin(user);
  const sheet = getSheet('Contratos');
  const id    = generateId('CON');
  const now   = new Date().toISOString();
  sheet.appendRow([
    id, contrato.tipo, contrato.nombre, contrato.concepto,
    Number(contrato.valorTotal) || 0, contrato.fechaInicio || '', contrato.fechaFin || '',
    contrato.estado || 'activo', contrato.notas || '', user.Username, now,
  ]);
  return { success: true, id };
}

function updateContrato(user, { id, contrato }) {
  requireAdmin(user);
  const sheet = getSheet('Contratos');
  const row   = sheetToObjects(sheet).find(r => r.ID === id);
  if (!row) return { success: false, error: 'Contrato no encontrado.' };
  updateRow(sheet, row, {
    Tipo: contrato.tipo, Nombre: contrato.nombre, Concepto: contrato.concepto,
    ValorTotal: Number(contrato.valorTotal) || 0,
    FechaInicio: contrato.fechaInicio, FechaFin: contrato.fechaFin,
    Estado: contrato.estado, Notas: contrato.notas,
  });
  return { success: true };
}

// ─────────────────────────────────────────────
// PROYECCIONES
// ─────────────────────────────────────────────

function getProyecciones(user, { filtros = {} } = {}) {
  requireAdmin(user);
  let data = sheetToObjects(getSheet('Proyecciones'));
  if (filtros.estado) data = data.filter(p => p.Estado === filtros.estado);
  return { success: true, data };
}

function addProyeccion(user, { proyeccion }) {
  requireAdmin(user);
  const sheet = getSheet('Proyecciones');
  const id    = generateId('PRY');
  const now   = new Date().toISOString();
  sheet.appendRow([
    id, proyeccion.evento, proyeccion.tipo, proyeccion.fechaEstimada,
    Number(proyeccion.montoProyectado) || 0, Number(proyeccion.montoReal) || 0,
    proyeccion.estado || 'proyectado', proyeccion.notas || '', user.Username, now,
  ]);
  return { success: true, id };
}

function updateProyeccion(user, { id, proyeccion }) {
  requireAdmin(user);
  const sheet = getSheet('Proyecciones');
  const row   = sheetToObjects(sheet).find(r => r.ID === id);
  if (!row) return { success: false, error: 'Proyección no encontrada.' };
  updateRow(sheet, row, {
    Evento: proyeccion.evento, Tipo: proyeccion.tipo,
    FechaEstimada: proyeccion.fechaEstimada,
    MontoProyectado: Number(proyeccion.montoProyectado) || 0,
    MontoReal: Number(proyeccion.montoReal) || 0,
    Estado: proyeccion.estado, Notas: proyeccion.notas,
  });
  return { success: true };
}

// ─────────────────────────────────────────────
// CATEGORIAS
// ─────────────────────────────────────────────

function getCategorias(user) {
  const data = sheetToObjects(getSheet('Categorias'));
  return { success: true, data };
}

function addCategoria(user, { categoria }) {
  requireAdmin(user);
  const sheet = getSheet('Categorias');
  const id    = generateId('CAT');
  sheet.appendRow([id, categoria.nombre, categoria.tipo, true]);
  return { success: true, id };
}

// ─────────────────────────────────────────────
// USUARIOS
// ─────────────────────────────────────────────

function getUsuarios(user) {
  requireAdmin(user);
  const data = sheetToObjects(getSheet('Usuarios')).map(u => ({
    ID: u.ID, Nombre: u.Nombre, Email: u.Email, Username: u.Username,
    Rol: u.Rol, Activo: u.Activo, FechaCreacion: u.FechaCreacion,
  }));
  return { success: true, data };
}

function addUsuario(user, { usuario }) {
  requireAdmin(user);
  const sheet    = getSheet('Usuarios');
  const existing = sheetToObjects(sheet);
  if (existing.find(u => u.Username === usuario.username))
    return { success: false, error: 'El nombre de usuario ya existe.' };
  if (existing.length >= 10)
    return { success: false, error: 'Límite máximo de 10 usuarios alcanzado.' };
  const id   = generateId('USR');
  const hash = hashPassword(usuario.password);
  const now  = new Date().toISOString();
  sheet.appendRow([id, usuario.nombre, usuario.email || '', usuario.username, hash, usuario.rol || 'usuario', true, now]);
  return { success: true, id };
}

function updateUsuario(user, { id, usuario }) {
  requireAdmin(user);
  const sheet = getSheet('Usuarios');
  const row   = sheetToObjects(sheet).find(u => u.ID === id);
  if (!row) return { success: false, error: 'Usuario no encontrado.' };
  const fields = {
    Nombre: usuario.nombre, Email: usuario.email,
    Rol: usuario.rol, Activo: usuario.activo,
  };
  if (usuario.password) fields.PasswordHash = hashPassword(usuario.password);
  updateRow(sheet, row, fields);
  return { success: true };
}

// ─────────────────────────────────────────────
// GENERIC DELETE (solo admin)
// ─────────────────────────────────────────────

function deleteRecord(user, sheetName, { id }, adminOnly = true) {
  if (adminOnly) requireAdmin(user);
  const sheet = getSheet(sheetName);
  const data  = sheetToObjects(sheet);
  const row   = data.find(r => r.ID === id);
  if (!row) return { success: false, error: 'Registro no encontrado.' };
  sheet.deleteRow(row._row);
  return { success: true };
}

// ─────────────────────────────────────────────
// SETUP INICIAL — Ejecutar una sola vez
// ─────────────────────────────────────────────

function setupInicial() {
  // Crear todas las hojas
  Object.keys(SHEET_HEADERS).forEach(name => getSheet(name));

  // Crear usuario admin por defecto si no existe
  const usersSheet = getSheet('Usuarios');
  const existing   = sheetToObjects(usersSheet);
  if (!existing.find(u => u.Username === 'admin')) {
    usersSheet.appendRow([
      generateId('USR'), 'Administrador R.A.', 'admin@ratraining.com',
      'admin', hashPassword('Admin2024!'), 'admin', true, new Date().toISOString(),
    ]);
  }

  // Categorías por defecto
  const catSheet    = getSheet('Categorias');
  const existingCat = sheetToObjects(catSheet);
  const defaultCats = [
    ['Nómina','egreso'],['Marketing','egreso'],['Logística','egreso'],
    ['Arrendamiento','egreso'],['Servicios Públicos','egreso'],['Tecnología','egreso'],
    ['Materiales','egreso'],['Viáticos','egreso'],['Proveedores','egreso'],
    ['Honorarios','egreso'],['Impuestos','egreso'],['Otros Gastos','egreso'],
    ['Cursos','ingreso'],['Certificaciones','ingreso'],['Talleres','ingreso'],
    ['Eventos','ingreso'],['Podcasts','ingreso'],['Suscripciones LMS','ingreso'],
    ['Certificados LMS','ingreso'],['Contratos Corporativos','ingreso'],
  ];
  defaultCats.forEach(([nombre, tipo]) => {
    if (!existingCat.find(c => c.Nombre === nombre))
      catSheet.appendRow([generateId('CAT'), nombre, tipo, true]);
  });

  Logger.log('✅ Setup completado. Credenciales admin: usuario=admin / contraseña=Admin2024!');
  Logger.log('⚠️  IMPORTANTE: Cambia la contraseña del admin después del primer login.');
  return '✅ Setup exitoso';
}
