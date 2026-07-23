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
    const data = JSON.parse(e && e.postData ? e.postData.contents : '{}');
    return respond(processRequest(data));
  } catch (err) {
    return respond({ success: false, error: 'No se pudo procesar la solicitud.' });
  }
}

function doGet(e) {
  try {
    const payload = e && e.parameter && e.parameter.payload;
    if (!payload) return respond({ success: true, message: 'R.A. Training Finance API v1.0 — Online' });
    const data = JSON.parse(payload);
    return respond(processRequest(data));
  } catch (err) {
    return respond({ success: false, error: 'No se pudo procesar la solicitud.' });
  }
}

function processRequest(data) {
  const { action, token, ...params } = data;

  if (action === 'login') return handleLogin(params);
  // Endpoint público: verificación de certificados por QR, sin sesión requerida.
  if (action === 'verificarCertificado') return handleVerificarCertificado(params);

  const user = validateToken(token);
  if (!user) return { success: false, error: 'Sesión inválida o expirada. Por favor inicia sesión de nuevo.' };

  const handlers = {
    logout:           () => handleLogout(token),
    getDashboard:     () => getDashboard(user, params),
    getIngresos:      () => getIngresos(user, params),
    addIngreso:       () => addIngreso(user, params),
    updateIngreso:    () => updateIngreso(user, params),
    deleteIngreso:    () => deleteIngresoSeguro(user, params),
    getEgresos:       () => getEgresos(user, params),
    addEgreso:        () => addEgreso(user, params),
    updateEgreso:     () => updateEgreso(user, params),
    deleteEgreso:     () => deleteIfOwner(user, 'Egresos', params.id, 'Estado'),
    getPagos:         () => getPagos(user, params),
    addPago:          () => addPago(user, params),
    updatePago:       () => updatePago(user, params),
    deletePago:       () => deletePagoConSync(user, params),
    getContratos:     () => getContratos(user, params),
    addContrato:      () => addContrato(user, params),
    updateContrato:   () => updateContrato(user, params),
    getProyecciones:  () => getProyecciones(user, params),
    addProyeccion:    () => addProyeccion(user, params),
    updateProyeccion: () => updateProyeccion(user, params),
    deleteProyeccion: () => deleteRecord(user, 'Proyecciones', params, true),
    getCategorias:    () => getCategorias(user, params),
    addCategoria:     () => addCategoria(user, params),
    getUsuarios:        () => getUsuarios(user, params),
    addUsuario:         () => addUsuario(user, params),
    updateUsuario:      () => updateUsuario(user, params),
    deleteUsuario:      () => deleteUsuario(user, params),
    getInstitucionesAval: () => getInstitucionesAval(user, params),
    getCertificadosAval: () => getCertificadosAval(user, params),
    marcarAval:          () => marcarAval(user, params),
    getServicios:       () => getServicios(user, params),
    addServicio:        () => addServicio(user, params),
    updateServicio:     () => updateServicio(user, params),
    getInscripciones:   () => getInscripciones(user, params),
    addInscripcion:     () => addInscripcion(user, params),
    updateInscripcion:  () => updateInscripcion(user, params),
    verificarPagoInscripcion: () => verificarPagoInscripcion(user, params),
    emitirCertificado:  () => emitirCertificado(user, params),
    actualizarEntregaCertificado: () => actualizarEntregaCertificado(user, params),
    enviarCertificadoEmail: () => enviarCertificadoEmail(user, params),
    getConfigPagos:     () => getConfigPagos(user, params),
    addConfigPago:      () => addConfigPago(user, params),
    updateConfigPago:   () => updateConfigPago(user, params),
    getConvenios:       () => getConvenios(user, params),
    addConvenio:        () => addConvenio(user, params),
    updateConvenio:     () => updateConvenio(user, params),
    deleteConvenio:     () => deleteRecord(user, 'Convenios', params, true),
    getCalendario:        () => getCalendario(user, params),
    deleteInscripcion:    () => deleteInscripcion(user, params),
    registrarTimbrada:    () => registrarTimbrada(user, params),
    getAsistencia:        () => getAsistencia(user, params),
    getResumenSemanal:    () => getResumenSemanal(user, params),
    getFlujosSemana:      () => getFlujosSemana(user, params),
    addFlujoSemanal:      () => addFlujoSemanal(user, params),
    updateFlujoSemanal:   () => updateFlujoSemanal(user, params),
    deleteFlujoSemanal:   () => deleteFlujoSemanal(user, params),
    addActividadFlujo:    () => addActividadFlujo(user, params),
    updateActividadFlujo: () => updateActividadFlujo(user, params),
    deleteActividadFlujo: () => deleteRecord(user, 'ActividadesFlujo', params, false),
    deleteTimbrada:       () => deleteTimbrada(user, params),
  };

  if (!handlers[action]) return { success: false, error: 'Acción no reconocida.' };
  try {
    return handlers[action]();
  } catch (err) {
    return { success: false, error: err && err.message ? err.message : 'No se pudo completar la operación.' };
  }
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
  Usuarios:         ['ID','Nombre','Email','Username','PasswordHash','Rol','Activo','FechaCreacion','InstitucionAval'],
  Ingresos:         ['ID','Fecha','Tipo','Modalidad','Concepto','Cliente','ContratoID','Monto','MetodoPago','Estado','Notas','CreadoPor','FechaCreacion','ClienteTelefono','Referencia'],
  Egresos:          ['ID','Fecha','Categoria','Concepto','Proveedor','Monto','Estado','AprobadoPor','FechaAprobacion','Notas','CreadoPor','FechaCreacion'],
  Pagos:            ['ID','Fecha','Tipo','Beneficiario','Concepto','Referencia','Monto','MetodoPago','EgresoID','ContratoID','Estado','Notas','CreadoPor','FechaCreacion'],
  Contratos:        ['ID','Tipo','Nombre','Concepto','ValorTotal','FechaInicio','FechaFin','Estado','Notas','CreadoPor','FechaCreacion'],
  Proyecciones:     ['ID','Evento','Tipo','FechaEstimada','MontoProyectado','MontoReal','Estado','Notas','CreadoPor','FechaCreacion'],
  Categorias:       ['ID','Nombre','Tipo','Activo'],
  Servicios:        ['ID','Nombre','Tipo','Modalidad','Precio','Duracion','Descripcion','Activo','FechaCreacion','FechaEvento','FechaFinEvento','LugarEvento'],
  Inscripciones:    ['ID','ClienteNombre','ClienteID','ClienteEmail','ClienteTelefono','ServicioID','ServicioNombre','Modalidad','FechaInicio','Monto','MetodoPago','RazonSocial','RUC','DireccionFactura','EstadoPago','EstadoCertificado','IngresoID','Notas','CreadoPor','FechaCreacion','FechaEmisionCertificado','RequiereAvalExterno','EstadoAval','AvalReferencia','FechaAval','ValorAval','FechaFin','NumeroComprobante','FechaPago','FechaVerificacionPago','VerificadoPor','InstitucionAval','CodigoCertificado','EmitidoPor','EstadoEntrega','FechaEntregaCertificado','EntregadoPor','AvalEnlaceExterno','AvalCodigoExterno'],
  Sesiones:         ['Token','Username','UserID','Rol','Nombre','Expira'],
  ConfigPagos:      ['ID','Nombre','Tipo','Detalles','Instrucciones','Activo','FechaCreacion'],
  Convenios:        ['ID','Organizacion','Representante','Cargo','Objeto','ObligacionesRA','ObligacionesAliado','Vigencia','FechaInicio','FechaFin','Estado','Notas','CreadoPor','FechaCreacion'],
  Asistencia:       ['ID','Username','Nombre','Tipo','Timestamp','Fecha','Notas','FechaCreacion'],
  FlujosSemanales:  ['ID','Username','NombreUsuario','Semana','FechaInicio','FechaFin','TotalHorasPlan','Estado','Notas','CreadoPor','FechaCreacion'],
  ActividadesFlujo: ['ID','FlujoID','Username','Titulo','Descripcion','DiaSemana','HorasEstimadas','Estado','HorasReales','Notas','Evidencia','CompletadoEn','FechaCreacion'],
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
  } else if (SHEET_HEADERS[name]) {
    // Auto-add any columns that exist in SHEET_HEADERS but not in the actual sheet
    const lastCol = sheet.getLastColumn();
    const existing = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
    SHEET_HEADERS[name].forEach(function(h) {
      if (existing.indexOf(h) === -1) {
        const col = sheet.getLastColumn() + 1;
        var cell = sheet.getRange(1, col);
        cell.setValue(h);
        cell.setFontWeight('bold').setBackground('#3730a3').setFontColor('#ffffff');
      }
    });
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
      headers.forEach((h, j) => {
        // Google Sheets returns Date objects for date-formatted cells; convert to ISO string
        obj[h] = row[j] instanceof Date ? row[j].toISOString() : row[j];
      });
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

// ─────────────────────────────────────────────
// CACHE HELPERS
// ─────────────────────────────────────────────

function sheetCache(key, ttlSec, fn) {
  const cache = CacheService.getScriptCache();
  const hit = cache.get(key);
  if (hit) { try { return JSON.parse(hit); } catch(e) {} }
  const result = fn();
  try { cache.put(key, JSON.stringify(result), ttlSec); } catch(e) {}
  return result;
}

function bustSheet() {
  try { CacheService.getScriptCache().removeAll(Array.prototype.slice.call(arguments)); } catch(e) {}
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

function isAdmin(user)    { return user.Rol === 'admin'; }
function isVendedor(user) { return user.Rol === 'vendedor' || user.Rol === 'admin'; }
function isAval(user)     { return user.Rol === 'aval'; }

function esVerdadero(value) {
  return value === true || String(value).toLowerCase() === 'true';
}

function emailValido(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function requiereComprobante(metodo) {
  const normalizado = String(metodo || '').toLowerCase();
  return normalizado.indexOf('transfer') > -1 ||
    normalizado.indexOf('tarjeta') > -1 ||
    normalizado.indexOf('cheque') > -1;
}

function fechaLimite(value, finDelDia) {
  if (!value) return null;
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const d = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), finDelDia ? 23 : 0, finDelDia ? 59 : 0, finDelDia ? 59 : 0, finDelDia ? 999 : 0)
    : new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function fechaSolo(value) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function tipoIngresoPorModalidad(modalidad) {
  const mod = String(modalidad || '').toLowerCase();
  if (mod === 'virtual') return 'Curso virtual';
  if (mod === 'presencial') return 'Curso presencial';
  if (mod.indexOf('brid') > -1) return 'Curso híbrido';
  return 'Otro';
}

function mapaUsuariosPorUsername() {
  const mapa = {};
  sheetToObjects(getSheet('Usuarios')).forEach(function(u) {
    mapa[u.Username] = {
      ID: u.ID,
      Nombre: u.Nombre,
      Email: u.Email,
      Username: u.Username,
      Rol: u.Rol,
      InstitucionAval: u.InstitucionAval || '',
    };
  });
  return mapa;
}

function institucionAvalDelUsuario(user) {
  const row = sheetToObjects(getSheet('Usuarios')).find(function(u) {
    return u.ID === user.ID || u.Username === user.Username;
  });
  return row ? String(row.InstitucionAval || '').trim() : '';
}

function mismaInstitucionAval(a, b) {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}

function enriquecerVendedor(row, usuarios) {
  const usuario = usuarios[row.CreadoPor] || {};
  return Object.assign({}, row, {
    VendedorNombre: usuario.Nombre || row.CreadoPor || 'Sin vendedor',
    VendedorID: usuario.ID || '',
    VendedorUsername: usuario.Username || row.CreadoPor || '',
  });
}

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

// Endpoint público (sin token) para el QR de verificación de certificados.
// Solo expone campos no sensibles y nunca revela si un ID existe pero
// aún no fue emitido (mismo mensaje "no válido" para ambos casos).
function handleVerificarCertificado({ id } = {}) {
  if (!id) return { success: true, valido: false };
  const row = sheetToObjects(getSheet('Inscripciones')).find(r => r.ID === id);
  if (!row || row.EstadoCertificado !== 'emitido') return { success: true, valido: false };
  const duracionDe = mapaDuracionServicios();
  const avalActivo = esVerdadero(row.RequiereAvalExterno) && row.EstadoAval === 'avalado';
  return {
    success: true,
    valido: true,
    data: {
      codigo:          row.CodigoCertificado || codigoCertificadoEstable(row),
      nombre:          row.ClienteNombre,
      servicio:        row.ServicioNombre,
      duracion:        duracionDe(row),
      modalidad:       row.Modalidad,
      fechaInicio:     row.FechaInicio,
      fechaFin:        row.FechaFin || '',
      fechaEmision:    row.FechaEmisionCertificado || '',
      institucionAval: avalActivo ? (row.InstitucionAval || '') : '',
      estadoAval:      avalActivo ? 'avalado' : '',
      avalReferencia:  avalActivo ? (row.AvalReferencia || '') : '',
      avalCodigoExterno: avalActivo ? (row.AvalCodigoExterno || '') : '',
      avalEnlaceExterno: avalActivo ? (row.AvalEnlaceExterno || '') : '',
    },
  };
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
  const pagos        = sheetToObjects(getSheet('Pagos'));
  const contratos    = sheetToObjects(getSheet('Contratos'));
  const proyecciones = sheetToObjects(getSheet('Proyecciones'));
  const inscripciones = sheetToObjects(getSheet('Inscripciones'));

  // Solo ingresos CONFIRMADOS cuentan como dinero real recibido
  const ingAño = ingresos.filter(function(i) {
    var d = new Date(i.Fecha);
    return d.getFullYear() === filterYear && i.Estado === 'confirmado';
  });
  // Egresos del año (referencia — pendientes/aprobados no son salidas aún)
  const egrAño = egresos.filter(function(e) {
    return new Date(e.Fecha).getFullYear() === filterYear;
  });
  // Solo pagos COMPLETADOS = dinero realmente salido de la empresa
  const pagAño = pagos.filter(function(p) {
    var d = new Date(p.Fecha);
    return d.getFullYear() === filterYear && p.Estado === 'completado';
  });

  const sum = function(arr, field) {
    return arr.reduce(function(s, r) { return s + (Number(r[field]) || 0); }, 0);
  };

  const months = Array.from({ length: 12 }, function(_, i) { return i; });
  const ingresosXMes = months.map(function(m) { return {
    mes: m + 1,
    total: sum(ingAño.filter(function(i) { return new Date(i.Fecha).getMonth() === m; }), 'Monto'),
  }; });
  const pagosXMes = months.map(function(m) { return {
    mes: m + 1,
    total: sum(pagAño.filter(function(p) { return new Date(p.Fecha).getMonth() === m; }), 'Monto'),
  }; });

  const totalIngresos        = sum(ingAño, 'Monto');
  const totalPagosEjecutados = sum(pagAño, 'Monto');
  // Balance real = ingresos confirmados − pagos realmente ejecutados
  const balance = totalIngresos - totalPagosEjecutados;

  // Distribución de salidas reales (desde pagos ejecutados, enlazados a categoría de egreso si aplica)
  const catMap = {};
  pagAño.forEach(function(p) {
    var egreso = egrAño.find(function(e) { return e.ID === p.EgresoID; });
    var cat = egreso ? (egreso.Categoria || 'Proveedor') : (p.Tipo || 'Pago Directo');
    catMap[cat] = (catMap[cat] || 0) + (Number(p.Monto) || 0);
  });

  const proyFuturas = proyecciones.filter(function(p) { return p.Estado === 'proyectado'; });
  const inscripcionesAnio = inscripciones.filter(function(i) {
    var d = new Date(i.FechaCreacion || i.FechaInicio);
    return !isNaN(d.getTime()) && d.getFullYear() === filterYear;
  });
  const certificadosEmitidos = inscripciones.filter(function(i) {
    if (i.EstadoCertificado !== 'emitido') return false;
    var d = new Date(i.FechaEmisionCertificado || i.FechaCreacion);
    return !isNaN(d.getTime()) && d.getFullYear() === filterYear;
  }).length;

  return {
    success: true,
    data: {
      kpis: {
        totalIngresos,           // Solo confirmados
        totalPagosEjecutados,    // Dinero real salido
        balance,                 // Balance real
        contratosActivos:  contratos.filter(function(c) { return c.Estado === 'activo'; }).length,
        egresosPendientes: egresos.filter(function(e) { return e.Estado === 'pendiente'; }).length,
        egresosAprobados:  egresos.filter(function(e) { return e.Estado === 'aprobado'; }).length,
        ingPendientes:     ingresos.filter(function(i) {
          return i.Estado === 'pendiente' || i.Estado === 'pendiente_verificacion';
        }).length,
        totalProyectado:   sum(proyFuturas, 'MontoProyectado'),
        inscripciones:     inscripcionesAnio.length,
        certificadosRaPendientes: inscripcionesAnio.filter(function(i) {
          return i.EstadoPago === 'verificado'
            && !esVerdadero(i.RequiereAvalExterno)
            && i.EstadoCertificado !== 'emitido';
        }).length,
        certificadosAvalPendientes: inscripcionesAnio.filter(function(i) {
          return esVerdadero(i.RequiereAvalExterno) && i.EstadoAval !== 'avalado';
        }).length,
        certificadosEmitidos: certificadosEmitidos,
      },
      ingresosXMes,
      pagosXMes,
      categorias: Object.entries(catMap).map(function(entry) { return { nombre: entry[0], total: entry[1] }; }),
      recentIngresos: ingAño.sort(function(a,b) { return new Date(b.FechaCreacion) - new Date(a.FechaCreacion); }).slice(0, 5),
      // recentEgresos: solo los que aún no se han pagado (pendiente / aprobado)
      recentEgresos: egrAño
        .filter(function(e) { return e.Estado !== 'pagado'; })
        .sort(function(a,b) { return new Date(b.FechaCreacion) - new Date(a.FechaCreacion); })
        .slice(0, 5),
      recentPagos: pagAño.sort(function(a,b) { return new Date(b.FechaCreacion) - new Date(a.FechaCreacion); }).slice(0, 5),
      proyeccionesFuturas: proyFuturas.sort(function(a,b) { return new Date(a.FechaEstimada) - new Date(b.FechaEstimada); }).slice(0, 5),
    },
  };
}

// ─────────────────────────────────────────────
// INGRESOS
// ─────────────────────────────────────────────

function getIngresos(user, { filtros = {} } = {}) {
  let data = sheetToObjects(getSheet('Ingresos'));
  if (!isAdmin(user)) data = data.filter(i => i.CreadoPor === user.Username);
  if (filtros.tipo)   data = data.filter(i => i.Tipo === filtros.tipo);
  if (filtros.estado) data = data.filter(i => i.Estado === filtros.estado);
  const desde = fechaLimite(filtros.desde, false);
  const hasta = fechaLimite(filtros.hasta, true);
  if (desde) data = data.filter(i => new Date(i.Fecha).getTime() >= desde.getTime());
  if (hasta) data = data.filter(i => new Date(i.Fecha).getTime() <= hasta.getTime());
  const usuarios = mapaUsuariosPorUsername();
  const inscripcionPorIngreso = {};
  sheetToObjects(getSheet('Inscripciones')).forEach(function(ins) {
    if (ins.IngresoID) inscripcionPorIngreso[ins.IngresoID] = ins.ID;
  });
  data = data.map(function(i) {
    return Object.assign(enriquecerVendedor(i, usuarios), { InscripcionID: inscripcionPorIngreso[i.ID] || '' });
  });
  return { success: true, data };
}

function addIngreso(user, { ingreso }) {
  if (!isVendedor(user)) throw new Error('Acceso denegado.');
  const sheet  = getSheet('Ingresos');
  const id     = generateId('ING');
  const now    = new Date().toISOString();
  const estado = isAdmin(user) ? (ingreso.estado || 'confirmado') : 'pendiente_verificacion';
  sheet.appendRow([
    id, ingreso.fecha, ingreso.tipo, ingreso.modalidad || 'N/A',
    ingreso.concepto, ingreso.cliente || '', ingreso.contratoId || '',
    Number(ingreso.monto) || 0, ingreso.metodoPago,
    estado, ingreso.notas || '', user.Username, now,
    ingreso.clienteTelefono || '',
    ingreso.referencia || '',
  ]);
  return { success: true, id };
}

function updateIngreso(user, { id, ingreso }) {
  if (!isVendedor(user)) throw new Error('Acceso denegado.');
  const sheet = getSheet('Ingresos');
  const row   = sheetToObjects(sheet).find(r => r.ID === id);
  if (!row) return { success: false, error: 'Ingreso no encontrado.' };
  if (!isAdmin(user) && row.CreadoPor !== user.Username) return { success: false, error: 'No autorizado.' };
  const vinculada = sheetToObjects(getSheet('Inscripciones')).find(function(ins) { return ins.IngresoID === id; });
  if (vinculada) {
    return { success: false, error: 'Este ingreso está vinculado a una inscripción. Edítelo desde el módulo Inscripciones.' };
  }
  updateRow(sheet, row, {
    Fecha: ingreso.fecha, Tipo: ingreso.tipo, Modalidad: ingreso.modalidad,
    Concepto: ingreso.concepto, Cliente: ingreso.cliente, ContratoID: ingreso.contratoId,
    Monto: Number(ingreso.monto) || 0, MetodoPago: ingreso.metodoPago,
    Estado: isAdmin(user) ? ingreso.estado : row.Estado,
    Notas: ingreso.notas,
    ClienteTelefono: ingreso.clienteTelefono || '',
    Referencia: ingreso.referencia,
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
  const sheet = getSheet('Egresos');
  const row   = sheetToObjects(sheet).find(r => r.ID === id);
  if (!row) return { success: false, error: 'Egreso no encontrado.' };
  // El dueño puede editar su propio egreso mientras siga pendiente (igual que
  // el frontend lo permite); cualquier otro caso requiere admin.
  if (!isAdmin(user)) {
    if (row.CreadoPor !== user.Username) return { success: false, error: 'No autorizado.' };
    if (row.Estado !== 'pendiente') return { success: false, error: 'Solo puede editar egresos en estado pendiente.' };
  }
  const now = new Date().toISOString();
  const nuevoEstado = isAdmin(user) ? egreso.estado : row.Estado;
  updateRow(sheet, row, {
    Fecha: egreso.fecha, Categoria: egreso.categoria, Concepto: egreso.concepto,
    Proveedor: egreso.proveedor, Monto: Number(egreso.monto) || 0,
    Estado: nuevoEstado, Notas: egreso.notas,
    AprobadoPor:      nuevoEstado === 'aprobado' ? user.Username : row.AprobadoPor,
    FechaAprobacion:  nuevoEstado === 'aprobado' ? now : row.FechaAprobacion,
  });
  return { success: true };
}

// ─────────────────────────────────────────────
// PAGOS
// ─────────────────────────────────────────────

function getPagos(user, { filtros = {} } = {}) {
  requireAdmin(user);
  let data = sheetToObjects(getSheet('Pagos'));
  if (filtros.tipo)     data = data.filter(p => p.Tipo === filtros.tipo);
  if (filtros.estado)   data = data.filter(p => p.Estado === filtros.estado);
  if (filtros.egresoId) data = data.filter(p => p.EgresoID === filtros.egresoId);
  if (filtros.desde)    data = data.filter(p => new Date(p.Fecha) >= new Date(filtros.desde));
  if (filtros.hasta)    data = data.filter(p => new Date(p.Fecha) <= new Date(filtros.hasta));
  return { success: true, data };
}

// Cuando un pago vinculado a un egreso queda 'completado', el egreso pasa a
// 'pagado' — si no, un egreso pagado se queda mostrando "Aprobado" para siempre.
function marcarEgresoPagado(egresoId) {
  if (!egresoId) return;
  const sheet = getSheet('Egresos');
  const row   = sheetToObjects(sheet).find(e => e.ID === egresoId);
  if (row && row.Estado !== 'pagado') updateRow(sheet, row, { Estado: 'pagado' });
}

// Contraparte: si el pago que marcaba el egreso como pagado se elimina o se
// invalida, el egreso vuelve a 'aprobado' para poder registrar el pago correcto.
function revertirEgresoSiPagado(egresoId) {
  if (!egresoId) return;
  const sheet = getSheet('Egresos');
  const row   = sheetToObjects(sheet).find(e => e.ID === egresoId);
  if (row && row.Estado === 'pagado') updateRow(sheet, row, { Estado: 'aprobado' });
}

function addPago(user, { pago }) {
  requireAdmin(user);
  const sheet = getSheet('Pagos');
  const id    = generateId('PAG');
  const now   = new Date().toISOString();
  const estado = pago.estado || 'completado';
  sheet.appendRow([
    id, pago.fecha, pago.tipo, pago.beneficiario, pago.concepto,
    pago.referencia || '', Number(pago.monto) || 0, pago.metodoPago,
    pago.egresoId || '', pago.contratoId || '',
    estado, pago.notas || '', user.Username, now,
  ]);
  if (estado === 'completado') marcarEgresoPagado(pago.egresoId);
  return { success: true, id };
}

function updatePago(user, { id, pago }) {
  requireAdmin(user);
  const sheet = getSheet('Pagos');
  const row   = sheetToObjects(sheet).find(r => r.ID === id);
  if (!row) return { success: false, error: 'Pago no encontrado.' };
  // 'Pendiente' en un pago existente significa que fue un registro erróneo
  // (no un pago real) — se elimina para no dejar valores duplicados en Pagos,
  // y el egreso vinculado vuelve a 'aprobado' para poder pagarlo correctamente.
  if (pago.estado === 'pendiente') {
    sheet.deleteRow(row._row);
    revertirEgresoSiPagado(row.EgresoID);
    return { success: true, eliminado: true };
  }
  updateRow(sheet, row, {
    Fecha: pago.fecha, Tipo: pago.tipo, Beneficiario: pago.beneficiario,
    Concepto: pago.concepto, Referencia: pago.referencia,
    Monto: Number(pago.monto) || 0, MetodoPago: pago.metodoPago,
    Estado: pago.estado, Notas: pago.notas,
  });
  if (pago.estado === 'completado') marcarEgresoPagado(pago.egresoId || row.EgresoID);
  return { success: true };
}

function deletePagoConSync(user, { id }) {
  requireAdmin(user);
  const sheet = getSheet('Pagos');
  const row   = sheetToObjects(sheet).find(r => r.ID === id);
  if (!row) return { success: false, error: 'Pago no encontrado.' };
  sheet.deleteRow(row._row);
  revertirEgresoSiPagado(row.EgresoID);
  return { success: true };
}

// ─────────────────────────────────────────────
// CONTRATOS
// ─────────────────────────────────────────────

function getContratos(user, { filtros = {} } = {}) {
  requireAdmin(user);
  let data = sheetCache('contratos', 120, function() {
    return sheetToObjects(getSheet('Contratos'));
  });
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
  bustSheet('contratos');
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
  bustSheet('contratos');
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
  return sheetCache('categorias', 300, function() {
    return { success: true, data: sheetToObjects(getSheet('Categorias')) };
  });
}

function addCategoria(user, { categoria }) {
  requireAdmin(user);
  const sheet = getSheet('Categorias');
  const id    = generateId('CAT');
  sheet.appendRow([id, categoria.nombre, categoria.tipo, true]);
  bustSheet('categorias');
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
    InstitucionAval: u.InstitucionAval || '',
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
  const rol = usuario.rol || 'usuario';
  const institucionAval = rol === 'aval' ? String(usuario.institucionAval || '').trim() : '';
  if (rol === 'aval' && !institucionAval) {
    return { success: false, error: 'Asigne una institucion al usuario de aval.' };
  }
  const id   = generateId('USR');
  const hash = hashPassword(usuario.password);
  const now  = new Date().toISOString();
  sheet.appendRow([id, usuario.nombre, usuario.email || '', usuario.username, hash, rol, true, now, institucionAval]);
  return { success: true, id };
}

function updateUsuario(user, { id, usuario }) {
  requireAdmin(user);
  const sheet = getSheet('Usuarios');
  const rows  = sheetToObjects(sheet);
  const row   = rows.find(function(u) { return u.ID === id; });
  if (!row) return { success: false, error: 'Usuario no encontrado.' };
  const rol = usuario.rol || row.Rol;
  const institucionAval = rol === 'aval'
    ? String(usuario.institucionAval !== undefined ? usuario.institucionAval : row.InstitucionAval || '').trim()
    : '';
  if (rol === 'aval' && !institucionAval) {
    return { success: false, error: 'Asigne una institucion al usuario de aval.' };
  }
  const fields = {
    Nombre: usuario.nombre, Email: usuario.email,
    Rol: rol, Activo: usuario.activo, InstitucionAval: institucionAval,
  };
  // Permitir cambio de username con verificación de unicidad
  if (usuario.username && usuario.username !== row.Username) {
    if (rows.find(function(u) { return u.Username === usuario.username && u.ID !== id; })) {
      return { success: false, error: 'El nombre de usuario ya está en uso.' };
    }
    fields.Username = usuario.username;
  }
  if (usuario.password) fields.PasswordHash = hashPassword(usuario.password);
  updateRow(sheet, row, fields);
  return { success: true };
}

function deleteUsuario(user, { id }) {
  requireAdmin(user);
  if (id === user.ID) return { success: false, error: 'No puedes eliminar tu propio usuario.' };
  const sheet = getSheet('Usuarios');
  const rows  = sheetToObjects(sheet);
  const row   = rows.find(function(u) { return u.ID === id; });
  if (!row) return { success: false, error: 'Usuario no encontrado.' };
  if (row.Rol === 'admin') {
    const otrosAdmins = rows.filter(function(u) {
      return u.Rol === 'admin' && u.ID !== id && (u.Activo === true || u.Activo === 'TRUE');
    });
    if (otrosAdmins.length === 0) return { success: false, error: 'Debe existir al menos un administrador activo.' };
  }
  sheet.deleteRow(row._row);
  // Invalidar todas las sesiones activas del usuario eliminado — sin esto
  // seguiría con acceso hasta que su token expire solo (hasta 24h).
  const sesSheet = getSheet('Sesiones');
  let sesiones = sheetToObjects(sesSheet).filter(function(s) { return s.Username === row.Username; });
  while (sesiones.length > 0) {
    sesSheet.deleteRow(sesiones[0]._row);
    sesiones = sheetToObjects(sesSheet).filter(function(s) { return s.Username === row.Username; });
  }
  return { success: true };
}

// ─────────────────────────────────────────────
// SERVICIOS
// ─────────────────────────────────────────────

function getServicios(user, params) {
  return sheetCache('servicios', 180, function() {
    return { success: true, data: sheetToObjects(getSheet('Servicios')) };
  });
}

function servicioRequiereDuracion(tipo) {
  const normalized = String(tipo || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return ['curso', 'certificacion', 'taller', 'certificado lms', 'capacitacion'].indexOf(normalized) !== -1;
}

function addServicio(user, { servicio }) {
  requireAdmin(user);
  if (servicioRequiereDuracion(servicio.tipo) && !String(servicio.duracion || '').trim()) {
    return { success: false, error: 'La duración académica es obligatoria para este tipo de servicio.' };
  }
  const sheet = getSheet('Servicios');
  const id    = generateId('SRV');
  const now   = new Date().toISOString();
  sheet.appendRow([
    id, servicio.nombre, servicio.tipo, servicio.modalidad || 'N/A',
    Number(servicio.precio) || 0, servicio.duracion || '',
    servicio.descripcion || '', true, now,
    servicio.fechaEvento || '', servicio.fechaFinEvento || '', servicio.lugarEvento || '',
  ]);
  bustSheet('servicios');
  bustSheet('inscripciones');
  return { success: true, id };
}

function updateServicio(user, { id, servicio }) {
  requireAdmin(user);
  const sheet = getSheet('Servicios');
  const row   = sheetToObjects(sheet).find(r => r.ID === id);
  if (!row) return { success: false, error: 'Servicio no encontrado.' };
  const tipo = servicio.tipo === undefined ? row.Tipo : servicio.tipo;
  const duracion = servicio.duracion === undefined ? row.Duracion : servicio.duracion;
  if (servicioRequiereDuracion(tipo) && !String(duracion || '').trim()) {
    return { success: false, error: 'La duración académica es obligatoria para este tipo de servicio.' };
  }
  updateRow(sheet, row, {
    Nombre: servicio.nombre, Tipo: servicio.tipo, Modalidad: servicio.modalidad,
    Precio: Number(servicio.precio) || 0, Duracion: servicio.duracion,
    Descripcion: servicio.descripcion, Activo: servicio.activo,
    FechaEvento: servicio.fechaEvento || '', FechaFinEvento: servicio.fechaFinEvento || '',
    LugarEvento: servicio.lugarEvento || '',
  });
  bustSheet('servicios');
  bustSheet('inscripciones');
  return { success: true };
}

function getCalendario(user, { year, month } = {}) {
  const now   = new Date();
  const yr    = year  || now.getFullYear();
  const mn    = month || null; // null = todo el año

  function inRange(dateStr) {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    if (isNaN(d)) return false;
    if (d.getFullYear() !== yr) return false;
    if (mn !== null && d.getMonth() + 1 !== mn) return false;
    return true;
  }

  const eventos = [];

  // Servicios con fechaEvento programada
  const servicios = sheetToObjects(getSheet('Servicios'));
  servicios.forEach(function(s) {
    if (!inRange(s.FechaEvento)) return;
    eventos.push({
      id:     s.ID,
      fecha:  s.FechaEvento,
      fechaFin: s.FechaFinEvento || s.FechaEvento,
      titulo: s.Nombre,
      tipo:   'Servicio',
      sub:    s.Tipo + (s.LugarEvento ? ' · ' + s.LugarEvento : ''),
      color:  'blue',
    });
  });

  // Inscripciones (FechaInicio = evento del cliente)
  const inscripciones = sheetToObjects(getSheet('Inscripciones'));
  inscripciones.forEach(function(i) {
    if (!inRange(i.FechaInicio)) return;
    eventos.push({
      id:     i.ID,
      fecha:  i.FechaInicio,
      fechaFin: i.FechaInicio,
      titulo: i.ServicioNombre || i.ServicioID,
      tipo:   'Inscripcion',
      sub:    i.ClienteNombre,
      color:  'green',
    });
  });

  // Proyecciones futuras
  const proyecciones = sheetToObjects(getSheet('Proyecciones'));
  proyecciones.forEach(function(p) {
    if (!inRange(p.FechaEstimada)) return;
    eventos.push({
      id:     p.ID,
      fecha:  p.FechaEstimada,
      fechaFin: p.FechaEstimada,
      titulo: p.Evento,
      tipo:   'Proyeccion',
      sub:    p.Tipo,
      color:  'purple',
    });
  });

  eventos.sort(function(a, b) { return new Date(a.fecha) - new Date(b.fecha); });
  return { success: true, data: eventos };
}

// ─────────────────────────────────────────────
// INSCRIPCIONES
// ─────────────────────────────────────────────

// Mapa de Servicios por ID y por Nombre (respaldo para registros antiguos sin
// ServicioID) para anexar la Duracion (horas) de un servicio a una inscripcion.
function mapaDuracionServicios() {
  const servicios = sheetToObjects(getSheet('Servicios'));
  const porId = {}, porNombre = {};
  servicios.forEach(function(s) { porId[s.ID] = s; porNombre[s.Nombre] = s; });
  return function(i) {
    const s = porId[i.ServicioID] || porNombre[i.ServicioNombre];
    return s ? (s.Duracion || '') : '';
  };
}

function inscripcionEnriquecida(row, duracionDe, usuarios) {
  return Object.assign(enriquecerVendedor(row, usuarios), {
    Duracion: duracionDe(row),
    NumeroComprobanteMostrado: row.NumeroComprobante || row.Notas || '',
  });
}

function validarDatosInscripcion(inscripcion) {
  if (!inscripcion) return 'Los datos de la inscripción son obligatorios.';
  if (!inscripcion.servicioId && !inscripcion.servicioNombre) return 'Seleccione un servicio.';
  if (!String(inscripcion.clienteNombre || '').trim()) return 'Ingrese el nombre del participante.';
  const monto = Number(inscripcion.monto);
  if (String(inscripcion.monto === undefined ? '' : inscripcion.monto).trim() === '' || !isFinite(monto) || monto < 0) return 'Ingrese un monto válido.';
  if (!String(inscripcion.metodoPago || '').trim()) return 'Seleccione el método de pago.';
  if (inscripcion.clienteEmail && !emailValido(inscripcion.clienteEmail)) return 'Ingrese un correo electrónico válido.';
  if (inscripcion.fechaInicio && inscripcion.fechaFin && fechaSolo(inscripcion.fechaFin) < fechaSolo(inscripcion.fechaInicio)) {
    return 'La fecha de finalización no puede ser anterior a la fecha de inicio.';
  }
  const comprobante = String(inscripcion.numeroComprobante || '').trim();
  if (requiereComprobante(inscripcion.metodoPago) && !comprobante) {
    return 'Ingrese el número de comprobante para el método de pago seleccionado.';
  }
  if (comprobante && !inscripcion.fechaPago) return 'Ingrese la fecha del pago o transferencia.';
  if (inscripcion.requiereAvalExterno && !String(inscripcion.institucionAval || '').trim()) {
    return 'Ingrese la institución avaladora.';
  }
  return '';
}

function estadoIngresoDesdePago(estadoPago) {
  if (estadoPago === 'verificado') return 'confirmado';
  if (estadoPago === 'cancelado') return 'cancelado';
  return 'pendiente_verificacion';
}

function sincronizarIngresoInscripcion(inscripcion) {
  if (!inscripcion.IngresoID) return { sincronizado: false, motivo: 'La inscripción no tiene un ingreso vinculado.' };
  const ingSheet = getSheet('Ingresos');
  const ingRow = sheetToObjects(ingSheet).find(function(r) { return r.ID === inscripcion.IngresoID; });
  if (!ingRow) return { sincronizado: false, motivo: 'El ingreso vinculado no existe.' };
  updateRow(ingSheet, ingRow, {
    Fecha: fechaSolo(inscripcion.FechaPago || inscripcion.FechaCreacion),
    Tipo: tipoIngresoPorModalidad(inscripcion.Modalidad),
    Modalidad: inscripcion.Modalidad || 'N/A',
    Concepto: 'Inscripción: ' + inscripcion.ClienteNombre + ' — ' + inscripcion.ServicioNombre,
    Cliente: inscripcion.ClienteNombre,
    ClienteTelefono: inscripcion.ClienteTelefono || '',
    Monto: Number(inscripcion.Monto) || 0,
    MetodoPago: inscripcion.MetodoPago || '',
    Referencia: inscripcion.NumeroComprobante || inscripcion.Notas || '',
    Estado: estadoIngresoDesdePago(inscripcion.EstadoPago),
  });
  return { sincronizado: true };
}

function getInscripciones(user, { filtros = {} } = {}) {
  if (!isVendedor(user)) throw new Error('Acceso denegado.');
  let data = sheetToObjects(getSheet('Inscripciones'));
  if (!isAdmin(user)) data = data.filter(i => i.CreadoPor === user.Username);
  if (filtros.vendedor && isAdmin(user)) data = data.filter(i => i.CreadoPor === filtros.vendedor);
  if (filtros.estadoPago)        data = data.filter(i => i.EstadoPago === filtros.estadoPago);
  if (filtros.estadoCertificado) data = data.filter(i => i.EstadoCertificado === filtros.estadoCertificado);
  if (filtros.servicioId)        data = data.filter(i => i.ServicioID === filtros.servicioId);
  if (filtros.servicio)          data = data.filter(i => i.ServicioNombre === filtros.servicio);
  if (filtros.tipoAval === 'sin_aval') data = data.filter(i => !esVerdadero(i.RequiereAvalExterno));
  if (filtros.tipoAval === 'aval_pendiente') data = data.filter(i => esVerdadero(i.RequiereAvalExterno) && i.EstadoAval !== 'avalado');
  if (filtros.tipoAval === 'avalado') data = data.filter(i => esVerdadero(i.RequiereAvalExterno) && i.EstadoAval === 'avalado');
  const desde = fechaLimite(filtros.desde, false);
  const hasta = fechaLimite(filtros.hasta, true);
  if (desde) data = data.filter(i => new Date(i.FechaCreacion).getTime() >= desde.getTime());
  if (hasta) data = data.filter(i => new Date(i.FechaCreacion).getTime() <= hasta.getTime());
  data.sort(function(a, b) { return new Date(b.FechaCreacion || 0) - new Date(a.FechaCreacion || 0); });
  const duracionDe = mapaDuracionServicios();
  const usuarios = mapaUsuariosPorUsername();
  data = data.map(function(i) { return inscripcionEnriquecida(i, duracionDe, usuarios); });
  return { success: true, data };
}

function addInscripcion(user, { inscripcion }) {
  if (!isVendedor(user)) throw new Error('Acceso denegado.');
  const validationError = validarDatosInscripcion(inscripcion);
  if (validationError) return { success: false, error: validationError };
  const sheet    = getSheet('Inscripciones');
  const id       = generateId('INS');
  const now      = new Date().toISOString();
  const estadosPago = ['pendiente', 'pagado', 'verificado', 'cancelado'];
  const estadoSolicitado = estadosPago.indexOf(inscripcion.estadoPago) > -1 ? inscripcion.estadoPago : 'pendiente';
  const estadoPago = isAdmin(user) ? estadoSolicitado : 'pendiente';
  const requiereAval = !!inscripcion.requiereAvalExterno;
  const numeroComprobante = String(inscripcion.numeroComprobante || '').trim();
  const fechaPago = fechaSolo(inscripcion.fechaPago);

  sheet.appendRow([
    id,
    inscripcion.clienteNombre, inscripcion.clienteID || '', inscripcion.clienteEmail || '',
    inscripcion.clienteTelefono || '', inscripcion.servicioId || '', inscripcion.servicioNombre,
    inscripcion.modalidad || 'N/A', inscripcion.fechaInicio || '',
    Number(inscripcion.monto) || 0, inscripcion.metodoPago || '',
    inscripcion.razonSocial || '', inscripcion.ruc || '', inscripcion.direccionFactura || '',
    estadoPago, 'pendiente', '', inscripcion.notas || '', user.Username, now,
    '',                                    // FechaEmisionCertificado
    requiereAval,                          // RequiereAvalExterno
    requiereAval ? 'pendiente' : '',       // EstadoAval
    '',                                    // AvalReferencia
    '',                                    // FechaAval
    0,                                     // ValorAval
    inscripcion.fechaFin || '',            // FechaFin
    numeroComprobante,                     // NumeroComprobante
    fechaPago,                             // FechaPago
    estadoPago === 'verificado' ? now : '',// FechaVerificacionPago
    estadoPago === 'verificado' ? user.Username : '', // VerificadoPor
    requiereAval ? String(inscripcion.institucionAval || '').trim() : '', // InstitucionAval
    '',                                    // CodigoCertificado
    '',                                    // EmitidoPor
    'pendiente',                           // EstadoEntrega
    '',                                    // FechaEntregaCertificado
    '',                                    // EntregadoPor
    '',                                    // AvalEnlaceExterno
    '',                                    // AvalCodigoExterno
  ]);

  // Auto-crear ingreso vinculado — columnas deben coincidir exactamente con SHEET_HEADERS.Ingresos
  const ingresoId = generateId('ING');
  const estadoIngreso = estadoPago === 'verificado' ? 'confirmado' : 'pendiente_verificacion';
  getSheet('Ingresos').appendRow([
    ingresoId,                    // ID
    fechaPago || now.slice(0, 10),// Fecha (YYYY-MM-DD)
    tipoIngresoPorModalidad(inscripcion.modalidad), // Tipo
    inscripcion.modalidad || 'N/A', // Modalidad
    'Inscripción: ' + inscripcion.clienteNombre + ' — ' + inscripcion.servicioNombre, // Concepto
    inscripcion.clienteNombre,    // Cliente
    '',                           // ContratoID
    Number(inscripcion.monto) || 0,  // Monto
    inscripcion.metodoPago || '', // MetodoPago
    estadoIngreso,                // Estado
    '',                           // Notas
    user.Username,                // CreadoPor
    now,                          // FechaCreacion
    inscripcion.clienteTelefono || '', // ClienteTelefono
    numeroComprobante,            // Referencia
  ]);

  // Actualizar IngresoID en la inscripción
  const inscRow = sheetToObjects(sheet).find(r => r.ID === id);
  if (inscRow) updateRow(sheet, inscRow, { IngresoID: ingresoId });

  return { success: true, id, ingresoId };
}

function updateInscripcion(user, { id, inscripcion }) {
  if (!isVendedor(user)) throw new Error('Acceso denegado.');
  const sheet = getSheet('Inscripciones');
  const row   = sheetToObjects(sheet).find(r => r.ID === id);
  if (!row) return { success: false, error: 'Inscripción no encontrada.' };
  if (!isAdmin(user) && row.CreadoPor !== user.Username) return { success: false, error: 'No autorizado.' };
  const validationError = validarDatosInscripcion(inscripcion);
  if (validationError) return { success: false, error: validationError };

  const requiereAval = inscripcion.requiereAvalExterno !== undefined
    ? !!inscripcion.requiereAvalExterno
    : esVerdadero(row.RequiereAvalExterno);
  const institucionAval = requiereAval ? String(inscripcion.institucionAval || row.InstitucionAval || '').trim() : '';
  const cambiaConfiguracionAval = requiereAval !== esVerdadero(row.RequiereAvalExterno)
    || (requiereAval && !mismaInstitucionAval(institucionAval, row.InstitucionAval));
  if (row.EstadoCertificado === 'emitido' && cambiaConfiguracionAval) {
    return { success: false, error: 'No puede cambiar el tipo o la institución de aval de un certificado ya emitido.' };
  }
  let estadoPago = row.EstadoPago;
  if (isAdmin(user) && inscripcion.estadoPago && inscripcion.estadoPago !== 'verificado') estadoPago = inscripcion.estadoPago;
  if (row.EstadoPago === 'verificado') estadoPago = 'verificado';

  updateRow(sheet, row, {
    ClienteNombre: inscripcion.clienteNombre, ClienteID: inscripcion.clienteID,
    ClienteEmail: inscripcion.clienteEmail, ClienteTelefono: inscripcion.clienteTelefono,
    ServicioID: inscripcion.servicioId, ServicioNombre: inscripcion.servicioNombre, Modalidad: inscripcion.modalidad,
    FechaInicio: inscripcion.fechaInicio, FechaFin: inscripcion.fechaFin,
    Monto: Number(inscripcion.monto) || 0,
    MetodoPago: inscripcion.metodoPago, RazonSocial: inscripcion.razonSocial,
    RUC: inscripcion.ruc, DireccionFactura: inscripcion.direccionFactura,
    EstadoPago: estadoPago,
    Notas: inscripcion.notas !== undefined ? inscripcion.notas : row.Notas,
    NumeroComprobante: inscripcion.numeroComprobante !== undefined ? String(inscripcion.numeroComprobante).trim() : row.NumeroComprobante,
    FechaPago: inscripcion.fechaPago !== undefined ? fechaSolo(inscripcion.fechaPago) : row.FechaPago,
    RequiereAvalExterno: requiereAval,
    InstitucionAval: institucionAval,
    EstadoAval: requiereAval ? (cambiaConfiguracionAval ? 'pendiente' : (row.EstadoAval || 'pendiente')) : '',
    AvalReferencia: cambiaConfiguracionAval ? '' : row.AvalReferencia,
    FechaAval: cambiaConfiguracionAval ? '' : row.FechaAval,
    ValorAval: cambiaConfiguracionAval ? 0 : row.ValorAval,
    AvalEnlaceExterno: cambiaConfiguracionAval ? '' : row.AvalEnlaceExterno,
    AvalCodigoExterno: cambiaConfiguracionAval ? '' : row.AvalCodigoExterno,
  });
  const updated = sheetToObjects(sheet).find(function(r) { return r.ID === id; });
  const sync = sincronizarIngresoInscripcion(updated);
  const duracionDe = mapaDuracionServicios();
  const usuarios = mapaUsuariosPorUsername();
  return {
    success: true,
    data: inscripcionEnriquecida(updated, duracionDe, usuarios),
    warning: sync.sincronizado ? '' : sync.motivo,
  };
}

function verificarPagoInscripcion(user, { id, numeroComprobante, fechaPago } = {}) {
  requireAdmin(user);
  const sheet = getSheet('Inscripciones');
  const row = sheetToObjects(sheet).find(function(r) { return r.ID === id; });
  if (!row) return { success: false, error: 'Inscripción no encontrada.' };
  if (!row.IngresoID) return { success: false, error: 'La inscripción no tiene un ingreso vinculado. Revise el registro antes de continuar.' };
  const ingresoExiste = sheetToObjects(getSheet('Ingresos')).some(function(i) { return i.ID === row.IngresoID; });
  if (!ingresoExiste) return { success: false, error: 'El ingreso vinculado no existe. Revise el registro antes de continuar.' };
  const comprobanteActual = String(row.NumeroComprobante || row.Notas || '').trim();
  const comprobanteSolicitado = numeroComprobante !== undefined
    ? String(numeroComprobante || '').trim()
    : comprobanteActual;
  if (numeroComprobante !== undefined && comprobanteActual && comprobanteSolicitado !== comprobanteActual) {
    return { success: false, error: 'El número de comprobante no coincide con el registro existente. Edite primero la inscripción y vuelva a verificar el pago.' };
  }
  const comprobante = numeroComprobante !== undefined
    ? comprobanteSolicitado
    : comprobanteActual;
  const fecha = fechaPago !== undefined ? fechaSolo(fechaPago) : fechaSolo(row.FechaPago);
  if (requiereComprobante(row.MetodoPago) && !comprobante) {
    return { success: false, error: 'Registre el número de comprobante antes de verificar el pago.' };
  }
  if (comprobante && !fecha) return { success: false, error: 'Registre la fecha del pago antes de verificarlo.' };

  const ahora = new Date().toISOString();
  updateRow(sheet, row, {
    NumeroComprobante: comprobante,
    FechaPago: fecha,
    EstadoPago: 'verificado',
    FechaVerificacionPago: row.FechaVerificacionPago || ahora,
    VerificadoPor: row.VerificadoPor || user.Username,
  });
  const updated = sheetToObjects(sheet).find(function(r) { return r.ID === id; });
  const sync = sincronizarIngresoInscripcion(updated);
  if (!sync.sincronizado) return { success: false, error: sync.motivo + ' Revise el registro antes de continuar.' };
  return { success: true, data: inscripcionEnriquecida(updated, mapaDuracionServicios(), mapaUsuariosPorUsername()) };
}

function codigoCertificadoEstable(row) {
  const fecha = row.FechaEmisionCertificado ? new Date(row.FechaEmisionCertificado) : new Date();
  let fragmento = String(row.ID || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(-10);
  while (fragmento.length < 8) fragmento = '0' + fragmento;
  return 'RA-' + fecha.getFullYear() + '-' + fragmento;
}

function datosFaltantesCertificado(row) {
  const duracion = mapaDuracionServicios()(row);
  const campos = [
    ['participante', row.ClienteNombre],
    ['identificación', row.ClienteID],
    ['curso', row.ServicioNombre],
    ['duración', duracion],
    ['fecha de inicio', row.FechaInicio],
    ['fecha de fin', row.FechaFin],
    ['modalidad', row.Modalidad],
  ];
  return campos.filter(function(item) { return !String(item[1] || '').trim(); }).map(function(item) { return item[0]; });
}

function emitirCertificado(user, { id, codigoCertificado } = {}) {
  requireAdmin(user);
  const sheet = getSheet('Inscripciones');
  const row = sheetToObjects(sheet).find(function(r) { return r.ID === id; });
  if (!row) return { success: false, error: 'Inscripción no encontrada.' };
  if (row.EstadoPago !== 'verificado') return { success: false, error: 'El pago debe estar verificado antes de emitir el certificado.' };
  if (esVerdadero(row.RequiereAvalExterno) && row.EstadoAval !== 'avalado') {
    return { success: false, error: 'El certificado requiere el aval institucional antes de poder emitirse.' };
  }
  const faltantes = datosFaltantesCertificado(row);
  if (faltantes.length) return { success: false, error: 'Faltan los siguientes datos para generar el certificado: ' + faltantes.join(', ') + '.' };

  const propuesto = String(codigoCertificado || '').trim().toUpperCase();
  const codigo = /^RA-\d{4}-[A-Z0-9_-]{5,32}$/.test(propuesto) ? propuesto : codigoCertificadoEstable(row);
  updateRow(sheet, row, {
    EstadoCertificado: 'emitido',
    CodigoCertificado: row.CodigoCertificado || codigo,
    FechaEmisionCertificado: row.FechaEmisionCertificado || new Date().toISOString(),
    EmitidoPor: row.EmitidoPor || user.Username,
    EstadoEntrega: row.EstadoEntrega || 'pendiente',
  });
  const updated = sheetToObjects(sheet).find(function(r) { return r.ID === id; });
  return { success: true, data: inscripcionEnriquecida(updated, mapaDuracionServicios(), mapaUsuariosPorUsername()) };
}

function actualizarEntregaCertificado(user, { id, estadoEntrega } = {}) {
  if (!isVendedor(user)) throw new Error('Acceso denegado.');
  const permitidos = ['descargado', 'compartido'];
  if (permitidos.indexOf(estadoEntrega) === -1) return { success: false, error: 'Estado de entrega no válido.' };
  const sheet = getSheet('Inscripciones');
  const row = sheetToObjects(sheet).find(function(r) { return r.ID === id; });
  if (!row) return { success: false, error: 'Inscripción no encontrada.' };
  if (!isAdmin(user) && row.CreadoPor !== user.Username) return { success: false, error: 'No autorizado.' };
  if (row.EstadoCertificado !== 'emitido') return { success: false, error: 'El certificado todavía no ha sido emitido.' };
  updateRow(sheet, row, {
    EstadoEntrega: estadoEntrega,
    FechaEntregaCertificado: new Date().toISOString(),
    EntregadoPor: user.Username,
  });
  return { success: true };
}

function deleteIngresoSeguro(user, { id } = {}) {
  const vinculada = sheetToObjects(getSheet('Inscripciones')).find(function(ins) { return ins.IngresoID === id; });
  if (vinculada) return { success: false, error: 'No se puede eliminar un ingreso vinculado a una inscripción.' };
  return deleteIfOwner(user, 'Ingresos', id, 'Estado');
}

function enviarCertificadoEmail(user, { id, pdfBase64, mimeType, filename, email } = {}) {
  requireAdmin(user);
  const sheet = getSheet('Inscripciones');
  const row = sheetToObjects(sheet).find(function(r) { return r.ID === id; });
  if (!row) return { success: false, error: 'Inscripción no encontrada.' };
  if (row.EstadoCertificado !== 'emitido') return { success: false, error: 'El certificado todavía no ha sido emitido.' };
  const destinatario = String(email || row.ClienteEmail || '').trim();
  if (!emailValido(destinatario)) return { success: false, error: 'La inscripción no tiene un correo electrónico válido.' };
  if (mimeType !== 'application/pdf') return { success: false, error: 'Solo se aceptan certificados en formato PDF.' };
  if (!pdfBase64 || typeof pdfBase64 !== 'string') return { success: false, error: 'No se recibió el archivo PDF.' };
  let bytes;
  try { bytes = Utilities.base64Decode(pdfBase64); }
  catch (err) { return { success: false, error: 'El archivo PDF recibido no es válido.' }; }
  if (bytes.length > 3 * 1024 * 1024) return { success: false, error: 'El PDF supera el límite permitido de 3 MB.' };
  if (bytes.length < 5 || bytes[0] !== 37 || bytes[1] !== 80 || bytes[2] !== 68 || bytes[3] !== 70 || bytes[4] !== 45) {
    return { success: false, error: 'El archivo recibido no contiene un PDF válido.' };
  }
  const nombreArchivo = String(filename || ('certificado_' + row.ID + '.pdf')).replace(/[^a-zA-Z0-9._-]/g, '_');
  const blob = Utilities.newBlob(bytes, 'application/pdf', nombreArchivo);
  try {
    MailApp.sendEmail({
      to: destinatario,
      subject: 'Certificado académico - R.A. Training',
      body: 'Estimado/a ' + row.ClienteNombre + ',\n\nAdjuntamos su certificado académico del curso ' + row.ServicioNombre + '.\n\nCódigo: ' + (row.CodigoCertificado || '') + '\n\nR.A. Training',
      name: 'R.A. Training',
      attachments: [blob],
    });
  } catch (err) {
    return { success: false, error: 'No se pudo enviar el correo. Revise la autorización de MailApp y vuelva a intentarlo.' };
  }
  updateRow(sheet, row, {
    EstadoEntrega: 'enviado_email',
    FechaEntregaCertificado: new Date().toISOString(),
    EntregadoPor: user.Username,
  });
  return { success: true };
}

// ─────────────────────────────────────────────
// AVAL EXTERNO — superficie minima para el rol 'aval'
// ─────────────────────────────────────────────

function getInstitucionesAval(user) {
  if (!isVendedor(user)) throw new Error('Acceso denegado.');
  const instituciones = [];
  sheetToObjects(getSheet('Usuarios')).forEach(function(u) {
    if (u.Rol === 'aval' && esVerdadero(u.Activo) && String(u.InstitucionAval || '').trim()) {
      instituciones.push(String(u.InstitucionAval).trim());
    }
  });
  sheetToObjects(getSheet('Inscripciones')).forEach(function(i) {
    if (esVerdadero(i.RequiereAvalExterno) && String(i.InstitucionAval || '').trim()) {
      instituciones.push(String(i.InstitucionAval).trim());
    }
  });
  const unicas = [];
  instituciones.sort().forEach(function(nombre) {
    if (!unicas.some(function(actual) { return mismaInstitucionAval(actual, nombre); })) unicas.push(nombre);
  });
  return { success: true, data: unicas };
}

function getCertificadosAval(user, { filtros = {} } = {}) {
  if (!isAval(user) && !isAdmin(user)) throw new Error('Acceso denegado.');
  let data = sheetToObjects(getSheet('Inscripciones'))
    .filter(function(i) { return esVerdadero(i.RequiereAvalExterno); });
  if (isAval(user)) {
    const institucionUsuario = institucionAvalDelUsuario(user);
    if (!institucionUsuario) {
      return { success: false, error: 'Su usuario de aval no tiene una institución asignada. Solicite la configuración al administrador.' };
    }
    data = data.filter(function(i) { return mismaInstitucionAval(i.InstitucionAval, institucionUsuario); });
  }
  if (filtros.estadoAval) {
    data = data.filter(function(i) { return (i.EstadoAval || 'pendiente') === filtros.estadoAval; });
  }
  if (filtros.institucionAval && isAdmin(user)) {
    data = data.filter(function(i) { return mismaInstitucionAval(i.InstitucionAval, filtros.institucionAval); });
  }
  // Los ultimos registros ingresados primero (por fecha de creacion, no por
  // fecha del curso — un curso futuro no deberia "esconder" lo recien creado).
  data.sort(function(a, b) { return new Date(b.FechaCreacion || 0) - new Date(a.FechaCreacion || 0); });
  const duracionDe = mapaDuracionServicios();
  // Whitelist explicito — a pedido, incluye cédula y correo del participante;
  // sigue sin exponer monto, RUC, teléfono ni datos de facturación a este rol.
  const out = data.map(function(i) {
    return {
      ID: i.ID,
      ClienteNombre: i.ClienteNombre,
      ClienteID: i.ClienteID || '',
      ClienteEmail: i.ClienteEmail || '',
      ServicioNombre: i.ServicioNombre,
      Modalidad: i.Modalidad,
      FechaInicio: i.FechaInicio,
      FechaFin: i.FechaFin || '',
      Duracion: duracionDe(i),
      InstitucionAval: i.InstitucionAval || '',
      EstadoAval: i.EstadoAval || 'pendiente',
      AvalReferencia: i.AvalReferencia || '',
      AvalEnlaceExterno: i.AvalEnlaceExterno || '',
      AvalCodigoExterno: i.AvalCodigoExterno || '',
      FechaAval: i.FechaAval || '',
      ValorAval: Number(i.ValorAval) || 0,
    };
  });
  return { success: true, data: out };
}

function marcarAval(user, { id, avalReferencia, valorAval, avalEnlaceExterno, avalCodigoExterno } = {}) {
  if (!isAval(user) && !isAdmin(user)) throw new Error('Acceso denegado.');
  const sheet = getSheet('Inscripciones');
  const row   = sheetToObjects(sheet).find(function(r) { return r.ID === id; });
  if (!row) return { success: false, error: 'Registro no encontrado.' };
  if (!esVerdadero(row.RequiereAvalExterno)) {
    return { success: false, error: 'Este registro no requiere aval externo.' };
  }
  if (isAval(user)) {
    const institucionUsuario = institucionAvalDelUsuario(user);
    if (!institucionUsuario || !mismaInstitucionAval(row.InstitucionAval, institucionUsuario)) {
      return { success: false, error: 'No está autorizado para gestionar certificados de otra institución.' };
    }
  }
  if (valorAval !== undefined && (!isFinite(Number(valorAval)) || Number(valorAval) < 0)) {
    return { success: false, error: 'Ingrese un valor de aval válido.' };
  }
  const referencia = avalReferencia !== undefined ? String(avalReferencia || '').trim() : String(row.AvalReferencia || '').trim();
  const enlace = avalEnlaceExterno !== undefined ? String(avalEnlaceExterno || '').trim() : String(row.AvalEnlaceExterno || '').trim();
  const codigo = avalCodigoExterno !== undefined ? String(avalCodigoExterno || '').trim() : String(row.AvalCodigoExterno || '').trim();
  if (!referencia && !enlace && !codigo) {
    return { success: false, error: 'Ingrese al menos una referencia, un código externo o un enlace de validación.' };
  }
  if (enlace && !/^https?:\/\//i.test(enlace)) {
    return { success: false, error: 'El enlace externo debe comenzar con http:// o https://.' };
  }
  updateRow(sheet, row, {
    EstadoAval: 'avalado',
    AvalReferencia: referencia,
    FechaAval: row.FechaAval || new Date().toISOString(),
    ValorAval: valorAval !== undefined ? (Number(valorAval) || 0) : (Number(row.ValorAval) || 0),
    AvalEnlaceExterno: enlace,
    AvalCodigoExterno: codigo,
  });
  return { success: true };
}

// ─────────────────────────────────────────────
// GENERIC DELETE
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

// Permite eliminar si el usuario es admin O si es el propietario del registro (solo en estado pendiente)
function deleteIfOwner(user, sheetName, id, estadoField) {
  const sheet = getSheet(sheetName);
  const data  = sheetToObjects(sheet);
  const row   = data.find(function(r) { return r.ID === id; });
  if (!row) return { success: false, error: 'Registro no encontrado.' };
  if (!isAdmin(user)) {
    if (row.CreadoPor !== user.Username) return { success: false, error: 'No autorizado.' };
    var estado = row[estadoField] || '';
    if (estado && estado !== 'pendiente' && estado !== 'pendiente_verificacion') {
      return { success: false, error: 'Solo puede eliminar registros en estado pendiente.' };
    }
  }
  sheet.deleteRow(row._row);
  return { success: true };
}

function deleteInscripcion(user, { id }) {
  if (!isVendedor(user)) throw new Error('Acceso denegado.');
  return deleteIfOwner(user, 'Inscripciones', id, 'EstadoPago');
}

// ─────────────────────────────────────────────
// CONFIG PAGOS
// ─────────────────────────────────────────────

function getConfigPagos(user) {
  if (!isVendedor(user)) throw new Error('Acceso denegado.');
  return sheetCache('configpagos', 300, function() {
    return { success: true, data: sheetToObjects(getSheet('ConfigPagos')) };
  });
}

function addConfigPago(user, { configPago }) {
  requireAdmin(user);
  const sheet = getSheet('ConfigPagos');
  const id    = generateId('CPG');
  const now   = new Date().toISOString();
  sheet.appendRow([id, configPago.nombre, configPago.tipo, configPago.detalles || '', configPago.instrucciones || '', true, now]);
  bustSheet('configpagos');
  return { success: true, id };
}

function updateConfigPago(user, { id, configPago }) {
  requireAdmin(user);
  const sheet = getSheet('ConfigPagos');
  const row   = sheetToObjects(sheet).find(r => r.ID === id);
  if (!row) return { success: false, error: 'Configuración no encontrada.' };
  updateRow(sheet, row, {
    Nombre: configPago.nombre, Tipo: configPago.tipo,
    Detalles: configPago.detalles, Instrucciones: configPago.instrucciones,
    Activo: configPago.activo,
  });
  bustSheet('configpagos');
  return { success: true };
}

// ─────────────────────────────────────────────
// CONVENIOS
// ─────────────────────────────────────────────

function getConvenios(user, { filtros = {} } = {}) {
  requireAdmin(user);
  let data = sheetCache('convenios', 120, function() {
    return sheetToObjects(getSheet('Convenios'));
  });
  if (filtros.estado) data = data.filter(c => c.Estado === filtros.estado);
  if (filtros.desde)  data = data.filter(c => new Date(c.FechaInicio) >= new Date(filtros.desde));
  if (filtros.hasta)  data = data.filter(c => new Date(c.FechaInicio) <= new Date(filtros.hasta));
  return { success: true, data };
}

function addConvenio(user, { convenio }) {
  requireAdmin(user);
  const sheet = getSheet('Convenios');
  const id    = generateId('CVN');
  const now   = new Date().toISOString();
  sheet.appendRow([
    id,
    convenio.organizacion, convenio.representante || '', convenio.cargo || '',
    convenio.objeto, convenio.obligacionesRA || '', convenio.obligacionesAliado || '',
    convenio.vigencia || '', convenio.fechaInicio || '', convenio.fechaFin || '',
    convenio.estado || 'activo', convenio.notas || '',
    user.Username, now,
  ]);
  bustSheet('convenios');
  return { success: true, id };
}

function updateConvenio(user, { id, convenio }) {
  requireAdmin(user);
  const sheet = getSheet('Convenios');
  const row   = sheetToObjects(sheet).find(r => r.ID === id);
  if (!row) return { success: false, error: 'Convenio no encontrado.' };
  updateRow(sheet, row, {
    Organizacion: convenio.organizacion, Representante: convenio.representante,
    Cargo: convenio.cargo, Objeto: convenio.objeto,
    ObligacionesRA: convenio.obligacionesRA, ObligacionesAliado: convenio.obligacionesAliado,
    Vigencia: convenio.vigencia, FechaInicio: convenio.fechaInicio,
    FechaFin: convenio.fechaFin, Estado: convenio.estado, Notas: convenio.notas,
  });
  bustSheet('convenios');
  return { success: true };
}

// ─────────────────────────────────────────────
// ASISTENCIA — TIMBRADAS
// ─────────────────────────────────────────────

// Fecha local en Ecuador (America/Guayaquil = UTC-5) como YYYY-MM-DD.
// Evita que registros después de las 7pm Ecuador aparezcan en el día UTC siguiente.
function hoyLocal() {
  return Utilities.formatDate(new Date(), 'America/Guayaquil', 'yyyy-MM-dd');
}

// Helper: devuelve solo YYYY-MM-DD aunque el valor sea un Date→ISO completo
// Google Sheets auto-detecta strings de fecha como objetos Date; sheetToObjects
// los convierte a ISO completo (ej: '2026-05-11T05:00:00.000Z'). Usar este
// helper en TODOS los comparadores de fecha para evitar falsos negativos.
function ds(val) {
  return val ? String(val).slice(0, 10) : '';
}

function getMondayOf(dateStr) {
  // Usar UTC para evitar problemas de zona horaria al parsear "YYYY-MM-DD"
  var d = dateStr ? new Date(dateStr + 'T12:00:00Z') : new Date();
  if (!dateStr) {
    // Para fecha actual usar mediodia UTC del dia local del servidor (GAS corre en UTC)
    var now = new Date();
    d = new Date(now.getUTCFullYear() + '-' +
      String(now.getUTCMonth() + 1).padStart(2,'0') + '-' +
      String(now.getUTCDate()).padStart(2,'0') + 'T12:00:00Z');
  }
  var day = d.getUTCDay(); // 0=Dom 1=Lun...6=Sab en UTC
  var diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

function registrarTimbrada(user, { tipo, notas } = {}) {
  if (!isVendedor(user)) throw new Error('Acceso denegado.');
  if (tipo !== 'entrada' && tipo !== 'salida')
    return { success: false, error: 'Tipo inválido. Use "entrada" o "salida".' };
  const sheet = getSheet('Asistencia');
  const rows  = sheetToObjects(sheet);
  const hoy   = hoyLocal();   // fecha local Ecuador, no UTC
  const now   = new Date().toISOString();
  // Última timbrada del usuario hoy
  const misHoy = rows
    .filter(function(r) { return r.Username === user.Username && ds(r.Fecha) === hoy; })
    .sort(function(a, b) { return new Date(b.Timestamp) - new Date(a.Timestamp); });
  const ultimaTipo = misHoy.length > 0 ? misHoy[0].Tipo : 'salida';
  if (tipo === 'entrada' && ultimaTipo === 'entrada')
    return { success: false, error: 'Ya tienes una entrada registrada. Registra tu salida primero.' };
  if (tipo === 'salida' && ultimaTipo === 'salida')
    return { success: false, error: 'No tienes una entrada activa hoy.' };
  const id = generateId('TIM');
  sheet.appendRow([id, user.Username, user.Nombre, tipo, now, hoy, notas || '', now]);
  return { success: true, tipo: tipo, timestamp: now };
}

function getAsistencia(user, { username, desde, hasta } = {}) {
  if (!isVendedor(user)) throw new Error('Acceso denegado.');
  const target = (isAdmin(user) && username) ? username : user.Username;
  let data = sheetToObjects(getSheet('Asistencia'))
    .filter(function(r) { return r.Username === target; });
  if (desde) data = data.filter(function(r) { return ds(r.Fecha) >= desde; });
  if (hasta) data = data.filter(function(r) { return ds(r.Fecha) <= hasta; });
  // Normalizar Fecha a YYYY-MM-DD en cada registro para que el frontend pueda comparar
  data = data.map(function(r) { return Object.assign({}, r, { Fecha: ds(r.Fecha) }); });
  data.sort(function(a, b) { return new Date(b.Timestamp) - new Date(a.Timestamp); });
  // Estado actual (última timbrada de hoy — fecha local Ecuador)
  const hoy = hoyLocal();
  const ultHoy = data.filter(function(r) { return r.Fecha === hoy; });
  const estadoActual = ultHoy.length > 0 ? ultHoy[0].Tipo : null;
  return { success: true, data: data, estadoActual: estadoActual };
}

function getResumenSemanal(user, { username, semana } = {}) {
  if (!isVendedor(user)) throw new Error('Acceso denegado.');
  const target   = (isAdmin(user) && username) ? username : user.Username;
  const lunes    = getMondayOf(semana);
  const finD     = new Date(lunes + 'T12:00:00Z'); finD.setUTCDate(finD.getUTCDate() + 6);
  const finSemana = finD.toISOString().slice(0, 10);
  const timbradas = sheetToObjects(getSheet('Asistencia'))
    .filter(function(r) { return r.Username === target && ds(r.Fecha) >= lunes && ds(r.Fecha) <= finSemana; })
    .map(function(r) { return Object.assign({}, r, { Fecha: ds(r.Fecha) }); })
    .sort(function(a, b) { return new Date(a.Timestamp) - new Date(b.Timestamp); });
  // Construir mapa de días
  var diasMap = {};
  timbradas.forEach(function(t) {
    if (!diasMap[t.Fecha]) diasMap[t.Fecha] = [];
    diasMap[t.Fecha].push(t);
  });
  var totalMin = 0;
  var dias = Object.keys(diasMap).sort().map(function(fecha) {
    var regs = diasMap[fecha];
    var min = 0; var ult = null;
    regs.forEach(function(r) {
      if (r.Tipo === 'entrada') { ult = new Date(r.Timestamp); }
      else if (r.Tipo === 'salida' && ult) { min += (new Date(r.Timestamp) - ult) / 60000; ult = null; }
    });
    if (ult) min += (new Date() - ult) / 60000; // aún dentro
    totalMin += min;
    return { fecha: fecha, horas: Math.round(min / 60 * 100) / 100, registros: regs };
  });
  return {
    success: true,
    data: { semana: lunes, username: target, totalHoras: Math.round(totalMin / 60 * 100) / 100, dias: dias },
  };
}

function getAsistenciaTodosUsuarios(user) {
  requireAdmin(user);
  const hoy   = hoyLocal();
  const rows  = sheetToObjects(getSheet('Asistencia'))
    .filter(function(r) { return ds(r.Fecha) === hoy; })
    .sort(function(a,b) { return new Date(b.Timestamp) - new Date(a.Timestamp); });
  const usuariosMap = {};
  rows.forEach(function(r) {
    if (!usuariosMap[r.Username]) usuariosMap[r.Username] = { username: r.Username, nombre: r.Nombre, ultimaTimbrada: r };
  });
  return { success: true, data: Object.values(usuariosMap) };
}

// ─────────────────────────────────────────────
// FLUJOS SEMANALES DE TRABAJO
// ─────────────────────────────────────────────

function getFlujosSemana(user, { username, semana } = {}) {
  if (!isVendedor(user)) throw new Error('Acceso denegado.');
  const target = (isAdmin(user) && username) ? username : user.Username;
  const lunes  = getMondayOf(semana);
  const flujos = sheetToObjects(getSheet('FlujosSemanales'))
    .filter(function(f) { return f.Username === target && ds(f.Semana) === lunes; });
  const todasActs = sheetToObjects(getSheet('ActividadesFlujo'));
  const DIAS = ['Lunes','Martes','Miércoles','Jueves','Viernes'];
  const result = flujos.map(function(f) {
    var acts = todasActs
      .filter(function(a) { return a.FlujoID === f.ID; })
      .sort(function(a,b) { return DIAS.indexOf(a.DiaSemana) - DIAS.indexOf(b.DiaSemana); });
    return Object.assign({}, f, { actividades: acts });
  });
  return { success: true, data: result, semana: lunes };
}

function addFlujoSemanal(user, { flujo } = {}) {
  requireAdmin(user);
  const lunes = getMondayOf(flujo.semana);
  // Evitar duplicado
  const existe = sheetToObjects(getSheet('FlujosSemanales'))
    .find(function(f) { return f.Username === flujo.username && ds(f.Semana) === lunes; });
  if (existe) return { success: false, error: 'Ya existe un flujo para ese usuario y semana.' };
  const sheet  = getSheet('FlujosSemanales');
  const id     = generateId('FLJ');
  const now    = new Date().toISOString();
  const finD   = new Date(lunes + 'T12:00:00Z'); finD.setUTCDate(finD.getUTCDate() + 4);
  const uRow   = sheetToObjects(getSheet('Usuarios')).find(function(u) { return u.Username === flujo.username; });
  sheet.appendRow([
    id, flujo.username, uRow ? uRow.Nombre : flujo.username, lunes,
    lunes, finD.toISOString().slice(0, 10),
    Number(flujo.totalHorasPlan) || 40,
    'activo', flujo.notas || '', user.Username, now,
  ]);
  return { success: true, id: id, semana: lunes };
}

function updateFlujoSemanal(user, { id, flujo } = {}) {
  requireAdmin(user);
  const sheet = getSheet('FlujosSemanales');
  const row   = sheetToObjects(sheet).find(function(f) { return f.ID === id; });
  if (!row) return { success: false, error: 'Flujo no encontrado.' };
  updateRow(sheet, row, {
    TotalHorasPlan: Number(flujo.totalHorasPlan) || row.TotalHorasPlan,
    Estado: flujo.estado || row.Estado,
    Notas: flujo.notas !== undefined ? flujo.notas : row.Notas,
  });
  return { success: true };
}

function addActividadFlujo(user, { actividad } = {}) {
  requireAdmin(user);
  const sheet = getSheet('ActividadesFlujo');
  const id    = generateId('ACT');
  const now   = new Date().toISOString();
  // Recuperar username del flujo
  const flujo = sheetToObjects(getSheet('FlujosSemanales'))
    .find(function(f) { return f.ID === actividad.flujoId; });
  sheet.appendRow([
    id, actividad.flujoId, flujo ? flujo.Username : '',
    actividad.titulo, actividad.descripcion || '',
    actividad.diaSemana || 'Lunes',
    Number(actividad.horasEstimadas) || 1,
    'pendiente', 0, '', '', '', now,
  ]);
  return { success: true, id: id };
}

function deleteFlujoSemanal(user, { id } = {}) {
  requireAdmin(user);
  // Eliminar todas las actividades del flujo primero
  var actSheet = getSheet('ActividadesFlujo');
  var acts = sheetToObjects(actSheet).filter(function(a) { return a.FlujoID === id; });
  acts.forEach(function(a) {
    var data = actSheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] === a.ID) { actSheet.deleteRow(i + 1); return; }
    }
  });
  // Eliminar el flujo
  var flujoSheet = getSheet('FlujosSemanales');
  var data = flujoSheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === id) { flujoSheet.deleteRow(i + 1); break; }
  }
  return { success: true };
}

function deleteTimbrada(user, { id } = {}) {
  requireAdmin(user);
  var sheet = getSheet('Asistencia');
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) {
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }
  return { success: false, error: 'Registro no encontrado.' };
}

function updateActividadFlujo(user, { id, actividad } = {}) {
  if (!isVendedor(user)) throw new Error('Acceso denegado.');
  const sheet = getSheet('ActividadesFlujo');
  const row   = sheetToObjects(sheet).find(function(a) { return a.ID === id; });
  if (!row) return { success: false, error: 'Actividad no encontrada.' };
  var fields = {};
  if (isAdmin(user)) {
    if (actividad.titulo        !== undefined) fields.Titulo          = actividad.titulo;
    if (actividad.descripcion   !== undefined) fields.Descripcion     = actividad.descripcion;
    if (actividad.diaSemana     !== undefined) fields.DiaSemana       = actividad.diaSemana;
    if (actividad.horasEstimadas !== undefined) fields.HorasEstimadas = Number(actividad.horasEstimadas) || 0;
  }
  if (actividad.estado      !== undefined) {
    fields.Estado = actividad.estado;
    if (actividad.estado === 'completado' && !row.CompletadoEn)
      fields.CompletadoEn = new Date().toISOString();
  }
  if (actividad.horasReales !== undefined) fields.HorasReales = Number(actividad.horasReales) || 0;
  if (actividad.notas       !== undefined) fields.Notas     = actividad.notas;
  if (actividad.evidencia   !== undefined) fields.Evidencia = actividad.evidencia;
  updateRow(sheet, row, fields);
  return { success: true };
}

// Migración manual e idempotente para ejecutar exclusivamente en el proyecto
// de Apps Script de pruebas. No crea registros ni modifica estados de pago.
function migrarInscripcionesCertificadosV2() {
  const insSheet = getSheet('Inscripciones');
  const ingSheet = getSheet('Ingresos');
  const inscripciones = sheetToObjects(insSheet);
  const ingresos = sheetToObjects(ingSheet);
  let comprobantesMigrados = 0;
  let referenciasMigradas = 0;
  const comprobantePorIngreso = {};

  inscripciones.forEach(function(ins) {
    const comprobante = ins.NumeroComprobante || ins.Notas || '';
    if (!ins.NumeroComprobante && ins.Notas) {
      updateRow(insSheet, ins, { NumeroComprobante: ins.Notas });
      comprobantesMigrados++;
    }
    if (ins.IngresoID && comprobante) comprobantePorIngreso[ins.IngresoID] = comprobante;
  });

  ingresos.forEach(function(ingreso) {
    if (ingreso.Referencia) return;
    const referencia = comprobantePorIngreso[ingreso.ID] || ingreso.Notas || '';
    if (!referencia) return;
    updateRow(ingSheet, ingreso, { Referencia: referencia });
    referenciasMigradas++;
  });

  const resumen = {
    inscripcionesRevisadas: inscripciones.length,
    ingresosRevisados: ingresos.length,
    comprobantesMigrados: comprobantesMigrados,
    referenciasMigradas: referenciasMigradas,
  };
  Logger.log(JSON.stringify(resumen));
  return resumen;
}

// ─────────────────────────────────────────────
// SETUP INICIAL — Ejecutar una sola vez
// ─────────────────────────────────────────────

function setupInicial() {
  Object.keys(SHEET_HEADERS).forEach(name => getSheet(name));
  getSheet('ConfigPagos'); // inicializa hoja de cuentas de cobro

  // Servicios por defecto
  const srvSheet    = getSheet('Servicios');
  const existingSrv = sheetToObjects(srvSheet);
  const defaultSrv  = [
    ['Curso Virtual','Curso','Virtual',0,''],
    ['Curso Presencial','Curso','Presencial',0,''],
    ['Curso Híbrido','Curso','Híbrida',0,''],
    ['Certificación Profesional','Certificación','N/A',0,''],
    ['Taller Práctico','Taller','Presencial',0,''],
    ['Evento de Capacitación','Evento','N/A',0,''],
    ['Podcast — Patrocinio','Podcast','Virtual',0,''],
    ['Suscripción LMS','Suscripción LMS','Virtual',0,'Acceso mensual a plataforma'],
    ['Certificado LMS','Certificado LMS','Virtual',0,''],
    ['Consultoría Empresarial','Consultoría','N/A',0,''],
    ['Capacitación Presencial Corporativa','Capacitación','Presencial',0,''],
    ['Otro Servicio','Otro','N/A',0,''],
  ];
  defaultSrv.forEach(([nombre, tipo, modalidad, precio, descripcion]) => {
    if (!existingSrv.find(s => s.Nombre === nombre))
      srvSheet.appendRow([generateId('SRV'), nombre, tipo, modalidad, precio, '', descripcion, true, new Date().toISOString()]);
  });

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
