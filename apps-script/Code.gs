// ============================================================
// R.A. Training Finance — Google Apps Script Backend v1.0
// Ejecutar setupInicial() UNA VEZ para crear hojas y usuario admin
// ============================================================

const CONFIG = {
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
    anularCertificado:   () => anularCertificado(user, params),
    reemitirCertificado: () => reemitirCertificado(user, params),
    getCertificadoParaDescarga: () => getCertificadoParaDescarga(user, params),
    registrarArtefactoCertificado: () => registrarArtefactoCertificado(user, params),
    solicitarDescargaCertificado: () => solicitarDescargaCertificado(user, params),
    confirmarDescargaCertificado: () => confirmarDescargaCertificado(user, params),
    getDescargasPendientes: () => getDescargasPendientes(user, params),
    registrarGeneracionCertificado: () => registrarGeneracionCertificado(user, params),
    actualizarEntregaCertificado: () => actualizarEntregaCertificado(user, params),
    enviarCertificadoEmail: () => enviarCertificadoEmail(user, params),
    getAuditoriaCertificados: () => getAuditoriaCertificados(user, params),
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
  Inscripciones:    ['ID','ClienteNombre','ClienteID','ClienteEmail','ClienteTelefono','ServicioID','ServicioNombre','Modalidad','FechaInicio','Monto','MetodoPago','RazonSocial','RUC','DireccionFactura','EstadoPago','EstadoCertificado','IngresoID','Notas','CreadoPor','FechaCreacion','FechaEmisionCertificado','RequiereAvalExterno','EstadoAval','AvalReferencia','FechaAval','ValorAval','FechaFin','NumeroComprobante','FechaPago','FechaVerificacionPago','VerificadoPor','InstitucionAval','CodigoCertificado','EmitidoPor','EstadoEntrega','FechaEntregaCertificado','EntregadoPor','AvalEnlaceExterno','AvalCodigoExterno','AvalTextoConfirmado','CertificateVersion','TemplateVersion','PdfHash','PdfStorageReference','OriginalCertificateId','ReissuedCertificateId','CertificateStatus','IssuedAt','IssuedBy','VoidedAt','VoidedBy','VoidReason','ReissueReason'],
  Sesiones:         ['Token','Username','UserID','Rol','Nombre','Expira'],
  ConfigPagos:      ['ID','Nombre','Tipo','Detalles','Instrucciones','Activo','FechaCreacion'],
  Convenios:        ['ID','Organizacion','Representante','Cargo','Objeto','ObligacionesRA','ObligacionesAliado','Vigencia','FechaInicio','FechaFin','Estado','Notas','CreadoPor','FechaCreacion'],
  Asistencia:       ['ID','Username','Nombre','Tipo','Timestamp','Fecha','Notas','FechaCreacion'],
  FlujosSemanales:  ['ID','Username','NombreUsuario','Semana','FechaInicio','FechaFin','TotalHorasPlan','Estado','Notas','CreadoPor','FechaCreacion'],
  ActividadesFlujo: ['ID','FlujoID','Username','Titulo','Descripcion','DiaSemana','HorasEstimadas','Estado','HorasReales','Notas','Evidencia','CompletadoEn','FechaCreacion'],
  AuditoriaCertificados: ['ID','CertificadoID','InscripcionID','Usuario','Rol','Accion','FechaHora','EstadoAnterior','EstadoNuevo','Canal','Resultado','Motivo','Metadatos'],
  Certificados: ['ID','InscripcionID','CodigoCertificado','CertificateVersion','TemplateVersion','PdfHash','PdfStorageReference','OriginalCertificateId','ReissuedCertificateId','CertificateStatus','IssuedAt','IssuedBy','VoidedAt','VoidedBy','VoidReason','ReissueReason','CreatedAt'],
  DescargasCertificados: ['ID','CertificadoID','InscripcionID','Usuario','Rol','Estado','FechaSolicitud','FechaConfirmacion','Motivo','PdfHash','PdfStorageReference','Canal'],
};

const CERTIFICATE_TEMPLATE_VERSION = 'ra-canva-2026-v1';

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

function getAuthSecret() {
  const secret = PropertiesService.getScriptProperties().getProperty('AUTH_SECRET');
  if (secret === null || String(secret).length === 0) {
    throw new Error('La autenticaci\u00f3n no est\u00e1 configurada de forma segura. Contacte al administrador.');
  }
  return String(secret);
}

function getBootstrapAdminPassword() {
  const password = PropertiesService.getScriptProperties().getProperty('BOOTSTRAP_ADMIN_PASSWORD');
  if (!password || String(password).length < 12) {
    throw new Error('La contrase\u00f1a temporal del administrador no est\u00e1 configurada de forma segura.');
  }
  return String(password);
}

function hashPassword(password) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    password + getAuthSecret()
  );
  return bytes.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
}

function requireAdmin(user) {
  if (user.Rol !== 'admin') throw new Error('Acceso denegado: se requiere rol de administrador.');
}

function registrarAuditoriaCertificado(evento) {
  try {
    var metadata = evento.metadatos && typeof evento.metadatos === 'object'
      ? JSON.stringify(evento.metadatos)
      : '';
    if (metadata.length > 1500) metadata = metadata.slice(0, 1500);
    getSheet('AuditoriaCertificados').appendRow([
      generateId('AUD'),
      String(evento.certificadoId || ''),
      String(evento.inscripcionId || ''),
      String(evento.usuario || ''),
      String(evento.rol || ''),
      String(evento.accion || ''),
      new Date().toISOString(),
      String(evento.estadoAnterior || ''),
      String(evento.estadoNuevo || ''),
      String(evento.canal || 'sistema'),
      String(evento.resultado || 'ok'),
      String(evento.motivo || '').slice(0, 500),
      metadata,
    ]);
    return true;
  } catch (err) {
    throw new Error('No se pudo registrar la auditor\u00eda obligatoria. La operaci\u00f3n no se complet\u00f3 y puede reintentarse.');
  }
}

function requireCertificateAdmin(user, action, context) {
  if (isAdmin(user)) return;
  context = context || {};
  registrarAuditoriaCertificado({
    certificadoId: context.certificadoId,
    inscripcionId: context.inscripcionId,
    usuario: user && user.Username,
    rol: user && user.Rol,
    accion: action,
    estadoAnterior: context.estadoAnterior,
    estadoNuevo: context.estadoNuevo,
    canal: context.canal || 'api',
    resultado: 'rechazado',
    motivo: 'Rol sin permiso administrativo para certificados.',
  });
  throw new Error('Acceso denegado: solo un administrador puede gestionar certificados oficiales.');
}

function isAdmin(user)    { return user.Rol === 'admin'; }
function isVendedor(user) { return user.Rol === 'vendedor' || user.Rol === 'admin'; }
function isAval(user)     { return user.Rol === 'aval'; }

function esVerdadero(value) {
  return value === true || String(value).toLowerCase() === 'true';
}

function certificadoProtegidoContraEliminacion(row) {
  var estado = String(row.CertificateStatus || row.EstadoCertificado || '').trim().toLowerCase();
  var protegidos = ['emitido', 'enviado', 'anulado', 'reemitido', 'issued', 'sent', 'voided', 'reissued'];
  return esVerdadero(row.CertificadoEmitido)
    || protegidos.indexOf(estado) !== -1
    || !!String(row.CodigoCertificado || '').trim()
    || !!String(row.FechaCertificado || row.FechaEmisionCertificado || row.IssuedAt || '').trim();
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

function fechaCalendarioPartes(year, month, day) {
  const y = Number(year), m = Number(month), d = Number(day);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d) || y < 1900 || y > 2200) return '';
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) return '';
  return String(y).padStart(4, '0') + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}

function esObjetoFecha(value) {
  return Object.prototype.toString.call(value) === '[object Date]'
    || Boolean(value && typeof value.getTime === 'function' && typeof value.getFullYear === 'function');
}

function fechaSolo(value) {
  if (value === '' || value === null || value === undefined) return '';
  if (esObjetoFecha(value)) {
    if (isNaN(value.getTime())) return '';
    return fechaCalendarioPartes(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }
  if (typeof value === 'number' && isFinite(value)) {
    const milliseconds = Math.round((value - 25569) * 86400000);
    const serialDate = new Date(milliseconds);
    return fechaCalendarioPartes(serialDate.getUTCFullYear(), serialDate.getUTCMonth() + 1, serialDate.getUTCDate());
  }
  const source = String(value).trim();
  let match = source.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
  if (match) return fechaCalendarioPartes(match[1], match[2], match[3]);
  match = source.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) return fechaCalendarioPartes(match[3], match[2], match[1]);
  if (/^\d+(?:\.\d+)?$/.test(source)) return fechaSolo(Number(source));
  return '';
}

function nombreEncabezadoNormalizado(value) {
  return String(value || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '');
}

const INSCRIPTION_HEADER_ALIASES = {
  ID: ['idinscripcion', 'inscripcionid'],
  ClienteNombre: ['participante', 'nombreparticipante', 'cliente'],
  ClienteID: ['identificacion', 'cedula', 'ceduladeidentidad', 'documento'],
  ServicioID: ['cursoid', 'idservicio'],
  ServicioNombre: ['servicio', 'curso', 'nombrecurso'],
  FechaInicio: ['iniciocurso', 'fechainiciocurso'],
  FechaFin: ['fincurso', 'fechafincurso'],
  FechaCreacion: ['fechaventa', 'fechadeventa'],
  CodigoCertificado: ['codigocertificado', 'codigodecertificado'],
};

function resolverEncabezadosInscripciones(headers) {
  const indices = {};
  const alternativas = {};
  const faltantes = [];
  const ambiguos = [];
  const duplicados = [];
  SHEET_HEADERS.Inscripciones.forEach(function(expected) {
    const exactos = [];
    headers.forEach(function(header, index) {
      if (String(header || '') === expected) exactos.push(index);
    });
    const aliases = [nombreEncabezadoNormalizado(expected)].concat(INSCRIPTION_HEADER_ALIASES[expected] || []);
    const equivalentes = [];
    headers.forEach(function(header, index) {
      if (aliases.indexOf(nombreEncabezadoNormalizado(header)) !== -1) equivalentes.push(index);
    });
    const candidatos = exactos.length === 1 ? exactos : equivalentes;
    alternativas[expected] = equivalentes.slice();
    if (candidatos.length === 1) indices[expected] = candidatos[0];
    else if (candidatos.length === 0) faltantes.push(expected);
    else ambiguos.push({ campo: expected, columnas: candidatos.map(function(index) { return index + 1; }) });
    if (equivalentes.length > 1) {
      duplicados.push({ campo: expected, columnas: equivalentes.map(function(index) { return index + 1; }) });
    }
  });
  return { indices: indices, alternativas: alternativas, faltantes: faltantes, ambiguos: ambiguos, duplicados: duplicados };
}

function valorInscripcionParaCliente(field, value) {
  if (['FechaInicio','FechaFin','FechaPago'].indexOf(field) !== -1) {
    const normalized = fechaSolo(value);
    return normalized || value;
  }
  if (esObjetoFecha(value)) {
    return value.toISOString();
  }
  return value;
}

function leerFilasInscripcionesFisicas(sheet) {
  if (!sheet || !sheet.getLastRow() || !sheet.getLastColumn()) {
    return { headers: [], schema: resolverEncabezadosInscripciones([]), rows: [] };
  }
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  const formulas = dataRange.getFormulas();
  const headers = values[0].map(function(header) { return String(header || ''); });
  const schema = resolverEncabezadosInscripciones(headers);
  const recognizedColumns = {};
  Object.keys(schema.alternativas).forEach(function(field) {
    schema.alternativas[field].forEach(function(column) { recognizedColumns[column] = true; });
  });
  const rows = values.slice(1).map(function(valuesRow, index) {
    const formulaRow = formulas[index + 1] || [];
    const item = {
      _row: index + 2,
      _raw: {},
      _formulas: {},
      _schema: schema,
      _rowAmbiguousFields: [],
      _unmappedColumns: [],
    };
    Object.keys(schema.indices).forEach(function(field) {
      const candidates = (schema.alternativas[field] || [schema.indices[field]]).map(function(column) {
        return { column: column, value: valuesRow[column] };
      });
      const nonEmpty = candidates.filter(function(candidate) {
        return candidate.value !== '' && candidate.value !== null && candidate.value !== undefined;
      });
      let raw = valuesRow[schema.indices[field]];
      if ((raw === '' || raw === null || raw === undefined) && nonEmpty.length === 1) raw = nonEmpty[0].value;
      const distinct = [];
      nonEmpty.forEach(function(candidate) {
        const comparable = valorComparableInscripcion(field, candidate.value);
        if (distinct.indexOf(comparable) === -1) distinct.push(comparable);
      });
      if (distinct.length > 1) item._rowAmbiguousFields.push(field);
      item._raw[field] = raw;
      item._formulas[field] = (schema.alternativas[field] || [schema.indices[field]])
        .map(function(column) { return formulaRow[column] || ''; })
        .filter(Boolean)[0] || '';
      item[field] = valorInscripcionParaCliente(field, raw);
    });
    valuesRow.forEach(function(value, column) {
      if (recognizedColumns[column] || value === '' || value === null || value === undefined) return;
      item._unmappedColumns.push({ columna: column + 1, encabezado: headers[column] || '(sin encabezado)' });
    });
    item._physicalHasData = valuesRow.some(function(value) {
      return value !== '' && value !== null && value !== undefined;
    });
    return item;
  }).filter(function(item) {
    return item._physicalHasData;
  });
  return { headers: headers, schema: schema, rows: rows };
}

function hashHexSeguro(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value || ''))
    .map(function(byte) { return ('0' + (byte & 0xFF).toString(16)).slice(-2); }).join('');
}

function claveHistoricaInscripcion(row) {
  const code = String(row.CodigoCertificado || '').trim().toUpperCase();
  const identification = String(row.ClienteID || '').trim().toUpperCase();
  const service = String(row.ServicioNombre || '').trim().toUpperCase().replace(/\s+/g, ' ');
  const created = String(row.FechaCreacion || '').trim();
  if (code && identification) return 'HIST-' + hashHexSeguro(['codigo', code, identification].join('|')).slice(0, 32);
  if (!identification || !service || !created) return '';
  const stable = ['datos', identification, service, created, String(row.Monto || ''), String(row.CreadoPor || '')].join('|');
  return 'HIST-' + hashHexSeguro(stable).slice(0, 32);
}

function criteriosInscripcionHistorica(row, schema) {
  const criterios = [];
  const estado = String(row.CertificateStatus || row.EstadoCertificado || '').trim().toLowerCase();
  const emitido = ['emitido','enviado','anulado','reemitido','issued','sent','voided','reissued'].indexOf(estado) !== -1;
  const template = String(row.TemplateVersion || '').trim();
  const reference = String(row.PdfStorageReference || '').trim();
  if (!String(row.ID || '').trim()) criterios.push('id_ausente');
  const missingModernColumns = schema ? schema.faltantes.filter(function(field) {
    return ['CertificateVersion','TemplateVersion','PdfHash','PdfStorageReference'].indexOf(field) !== -1;
  }) : [];
  if (missingModernColumns.length && (!String(row.ID || '').trim()
      || (emitido && (!String(row.CertificateVersion || '').trim() || !template)))) {
    criterios.push('columnas_esquema_ausentes');
  }
  if (/^legacy(?:-|$)/i.test(template)) criterios.push('plantilla_legacy');
  if (/:historical-recovery$/.test(reference) || (/^(private-drive|external|drive):/i.test(reference) && !template)) {
    criterios.push('almacenamiento_historico');
  }
  if (emitido && !String(row.CertificateVersion || '').trim()) criterios.push('version_ausente');
  if (emitido && !template) criterios.push('plantilla_ausente');
  if (String(row.PdfHash || '').trim() && !reference) criterios.push('hash_sin_referencia');
  if (String(row.CodigoCertificado || '').trim() && emitido
      && (!String(row.CertificateVersion || '').trim() || !template)) {
    criterios.push('certificado_emitido_con_esquema_incompleto');
  }
  return criterios.filter(function(value, index, all) { return all.indexOf(value) === index; });
}

function decorarInscripcionHistorica(row, schema, keyCounts) {
  const key = claveHistoricaInscripcion(row);
  const criterios = criteriosInscripcionHistorica(row, schema);
  const fechaInicioRaw = row._raw ? row._raw.FechaInicio : row.FechaInicio;
  const fechaFinRaw = row._raw ? row._raw.FechaFin : row.FechaFin;
  const fechaInicioValida = !String(fechaInicioRaw || '').trim() || !!fechaSolo(fechaInicioRaw);
  const fechaFinValida = !String(fechaFinRaw || '').trim() || !!fechaSolo(fechaFinRaw);
  const ambiguous = Boolean(key && keyCounts && keyCounts[key] > 1);
  return Object.assign({}, row, {
    HistoricalKey: key,
    HistoricalRowNumber: row._row,
    IsHistoricalRecord: criterios.length > 0,
    HistoricalCriteria: criterios,
    HistoricalAmbiguous: ambiguous,
    HistoricalRowAmbiguousFields: (row._rowAmbiguousFields || []).slice(),
    HistoricalFormulaFields: Object.keys(row._formulas || {}).filter(function(field) { return !!row._formulas[field]; }),
    HistoricalUnmappedColumns: (row._unmappedColumns || []).slice(),
    HistoricalNormalizationRequired: criterios.length > 0 && (
      !String(row.ID || '').trim() || !String(row.FechaInicio || '').trim() || !String(row.FechaFin || '').trim()
      || !fechaInicioValida || !fechaFinValida || Boolean(schema && schema.ambiguos.length)
      || Boolean(row._rowAmbiguousFields && row._rowAmbiguousFields.length)
    ),
  });
}

function asegurarColumnasInscripcion(sheet, fields) {
  let headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function(value) { return String(value || ''); });
  let schema = resolverEncabezadosInscripciones(headers);
  const ambiguosSolicitados = schema.ambiguos.filter(function(item) { return fields.indexOf(item.campo) !== -1; });
  if (ambiguosSolicitados.length) {
    throw new Error('La hoja contiene encabezados ambiguos para: ' + ambiguosSolicitados.map(function(item) { return item.campo; }).join(', ') + '.');
  }
  fields.forEach(function(field) {
    if (schema.indices[field] !== undefined) return;
    const column = sheet.getLastColumn() + 1;
    sheet.getRange(1, column).setValue(field);
    headers.push(field);
  });
  return resolverEncabezadosInscripciones(headers);
}

function actualizarFilaInscripcionFisica(sheet, rowNumber, fieldMap) {
  const fields = Object.keys(fieldMap).filter(function(field) { return fieldMap[field] !== undefined; });
  const schema = asegurarColumnasInscripcion(sheet, fields);
  fields.forEach(function(field) {
    const columnIndex = schema.indices[field];
    if (columnIndex === undefined) throw new Error('No se pudo resolver la columna ' + field + '.');
    const value = fieldMap[field] === null ? '' : fieldMap[field];
    const equivalentColumns = (schema.alternativas[field] || [columnIndex]).filter(function(column, index, all) {
      return all.indexOf(column) === index;
    });
    equivalentColumns.forEach(function(column) {
      sheet.getRange(rowNumber, column + 1).setValue(value);
    });
  });
}

function filaInscripcionPorNumero(sheet, rowNumber) {
  return filasInscripcionesDecoradas(sheet).rows.find(function(row) { return row._row === rowNumber; }) || null;
}

function appendInscripcionPorEncabezados(sheet, valuesByField) {
  const fields = Object.keys(valuesByField);
  const schema = asegurarColumnasInscripcion(sheet, fields);
  const width = sheet.getLastColumn();
  const values = Array(width).fill('');
  fields.forEach(function(field) {
    values[schema.indices[field]] = valuesByField[field] === undefined || valuesByField[field] === null
      ? ''
      : valuesByField[field];
  });
  sheet.appendRow(values);
}

function registrarRechazoActualizacionHistorica(user, id, historicalKey, motivo) {
  registrarAuditoriaCertificado({
    inscripcionId: id || '',
    usuario: user && user.Username,
    rol: user && user.Rol,
    accion: 'HISTORICAL_ENROLLMENT_UPDATE_REJECTED',
    canal: 'api',
    resultado: 'rechazado',
    motivo: motivo,
    metadatos: { historicalKey: historicalKey || '' },
  });
}

function resolverFilaInscripcionParaActualizar(sheet, user, id, historicalKey) {
  const snapshot = filasInscripcionesDecoradas(sheet);
  const normalizedId = String(id || '').trim();
  if (normalizedId) {
    const matches = snapshot.rows.filter(function(row) { return String(row.ID || '').trim() === normalizedId; });
    if (matches.length !== 1) {
      const reason = matches.length ? 'El ID de inscripción está duplicado.' : 'Inscripción no encontrada por ID.';
      registrarRechazoActualizacionHistorica(user, normalizedId, '', reason);
      return { error: reason };
    }
    if (matches[0].HistoricalRowAmbiguousFields.length) {
      const reason = 'La fila contiene valores contradictorios en columnas equivalentes: '
        + matches[0].HistoricalRowAmbiguousFields.join(', ') + '.';
      registrarRechazoActualizacionHistorica(user, normalizedId, '', reason);
      return { error: reason };
    }
    return { row: matches[0], snapshot: snapshot, usedHistoricalKey: false };
  }
  const key = String(historicalKey || '').trim();
  if (!key) return { error: 'La inscripción no tiene un identificador estable. Ejecute primero el diagnóstico histórico.' };
  if (!isAdmin(user)) return { error: 'Solo un administrador puede corregir una inscripción histórica sin ID.' };
  const matches = snapshot.rows.filter(function(row) { return row.HistoricalKey === key; });
  if (matches.length !== 1) {
    const reason = matches.length ? 'La clave histórica es ambigua; no se modificó ninguna fila.' : 'No existe una coincidencia para la clave histórica.';
    registrarRechazoActualizacionHistorica(user, '', key, reason);
    return { error: reason };
  }
  if (!matches[0].IsHistoricalRecord) return { error: 'La clave alternativa solo puede utilizarse con registros históricos confirmados.' };
  if (matches[0].HistoricalRowAmbiguousFields.length) {
    const reason = 'La fila histórica contiene valores contradictorios en columnas equivalentes.';
    registrarRechazoActualizacionHistorica(user, '', key, reason);
    return { error: reason };
  }
  return { row: matches[0], snapshot: snapshot, usedHistoricalKey: true };
}

function filasInscripcionesDecoradas(sheet) {
  const snapshot = leerFilasInscripcionesFisicas(sheet);
  const keyCounts = {};
  snapshot.rows.forEach(function(row) {
    const key = claveHistoricaInscripcion(row);
    if (key) keyCounts[key] = (keyCounts[key] || 0) + 1;
  });
  return {
    headers: snapshot.headers,
    schema: snapshot.schema,
    rows: snapshot.rows.map(function(row) { return decorarInscripcionHistorica(row, snapshot.schema, keyCounts); }),
    keyCounts: keyCounts,
  };
}

function inscripcionSinMetadatosInternos(row) {
  const result = Object.assign({}, row);
  delete result._raw;
  delete result._formulas;
  delete result._schema;
  delete result._row;
  delete result._rowAmbiguousFields;
  delete result._unmappedColumns;
  delete result._physicalHasData;
  return result;
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
  const resultado = buscarCertificadoPublico(id);
  if (!resultado) return { success: true, valido: false };
  const row = resultado.inscripcion;
  const certificado = resultado.certificado;
  const estado = estadoPublicoCertificado(certificado);
  if (['vigente', 'anulado', 'reemitido'].indexOf(estado) === -1) return { success: true, valido: false };
  const duracionDe = mapaDuracionServicios();
  const avalActivo = esVerdadero(row.RequiereAvalExterno) && row.EstadoAval === 'avalado';
  return {
    success: true,
    valido: true,
    data: {
      codigo:          certificado.CodigoCertificado || row.CodigoCertificado || codigoCertificadoEstable(row),
      identificador:   certificado.ID || row.ID,
      estado:          estado,
      nombre:          row.ClienteNombre,
      servicio:        row.ServicioNombre,
      duracion:        duracionDe(row),
      modalidad:       row.Modalidad,
      fechaInicio:     row.FechaInicio,
      fechaFin:        row.FechaFin || '',
      fechaEmision:    certificado.IssuedAt || row.FechaEmisionCertificado || '',
      version:         Number(certificado.CertificateVersion) || 1,
      certificadoVigenteId: estado === 'reemitido' ? (certificado.ReissuedCertificateId || '') : '',
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

function resumenCertificadoParaVendedor(row) {
  var resumen = Object.assign({}, row);
  resumen.CodigoCertificado = '';
  resumen.FechaEmisionCertificado = '';
  resumen.EmitidoPor = '';
  resumen.FechaEntregaCertificado = '';
  resumen.EntregadoPor = '';
  resumen.AvalReferencia = '';
  resumen.AvalEnlaceExterno = '';
  resumen.AvalCodigoExterno = '';
  return resumen;
}

function validarDatosInscripcion(inscripcion) {
  if (!inscripcion) return 'Los datos de la inscripción son obligatorios.';
  if (!inscripcion.servicioId && !inscripcion.servicioNombre) return 'Seleccione un servicio.';
  if (!String(inscripcion.clienteNombre || '').trim()) return 'Ingrese el nombre del participante.';
  const monto = Number(inscripcion.monto);
  if (String(inscripcion.monto === undefined ? '' : inscripcion.monto).trim() === '' || !isFinite(monto) || monto < 0) return 'Ingrese un monto válido.';
  if (!String(inscripcion.metodoPago || '').trim()) return 'Seleccione el método de pago.';
  if (inscripcion.clienteEmail && !emailValido(inscripcion.clienteEmail)) return 'Ingrese un correo electrónico válido.';
  if (inscripcion.fechaInicio && !fechaSolo(inscripcion.fechaInicio)) return 'La fecha de inicio no tiene un formato válido.';
  if (inscripcion.fechaFin && !fechaSolo(inscripcion.fechaFin)) return 'La fecha de fin no tiene un formato válido.';
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
  const existingSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Inscripciones');
  let data = existingSheet ? filasInscripcionesDecoradas(existingSheet).rows : [];
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
  data = data.map(function(i) {
    var enriched = inscripcionEnriquecida(inscripcionSinMetadatosInternos(i), duracionDe, usuarios);
    return isAdmin(user) ? enriched : resumenCertificadoParaVendedor(enriched);
  });
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

  appendInscripcionPorEncabezados(sheet, {
    ID: id,
    ClienteNombre: inscripcion.clienteNombre,
    ClienteID: inscripcion.clienteID || '',
    ClienteEmail: inscripcion.clienteEmail || '',
    ClienteTelefono: inscripcion.clienteTelefono || '',
    ServicioID: inscripcion.servicioId || '',
    ServicioNombre: inscripcion.servicioNombre,
    Modalidad: inscripcion.modalidad || 'N/A',
    FechaInicio: fechaSolo(inscripcion.fechaInicio),
    FechaFin: fechaSolo(inscripcion.fechaFin),
    Monto: Number(inscripcion.monto) || 0,
    MetodoPago: inscripcion.metodoPago || '',
    RazonSocial: inscripcion.razonSocial || '',
    RUC: inscripcion.ruc || '',
    DireccionFactura: inscripcion.direccionFactura || '',
    EstadoPago: estadoPago,
    EstadoCertificado: 'pendiente',
    IngresoID: '',
    Notas: inscripcion.notas || '',
    CreadoPor: user.Username,
    FechaCreacion: now,
    FechaEmisionCertificado: '',
    RequiereAvalExterno: requiereAval,
    EstadoAval: requiereAval ? 'pendiente' : '',
    AvalReferencia: '',
    FechaAval: '',
    ValorAval: 0,
    NumeroComprobante: numeroComprobante,
    FechaPago: fechaPago,
    FechaVerificacionPago: estadoPago === 'verificado' ? now : '',
    VerificadoPor: estadoPago === 'verificado' ? user.Username : '',
    InstitucionAval: requiereAval ? String(inscripcion.institucionAval || '').trim() : '',
    CodigoCertificado: '',
    EmitidoPor: '',
    EstadoEntrega: 'pendiente',
    FechaEntregaCertificado: '',
    EntregadoPor: '',
    AvalEnlaceExterno: '',
    AvalCodigoExterno: '',
  });

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

  registrarAuditoriaCertificado({
    inscripcionId: id,
    usuario: user.Username,
    rol: user.Rol,
    accion: 'INSCRIPTION_CREATED',
    estadoNuevo: 'INSCRIPTION_CREATED',
    canal: 'panel',
    resultado: 'ok',
  });
  if (numeroComprobante || fechaPago || estadoSolicitado === 'pagado' || estadoSolicitado === 'verificado') {
    registrarAuditoriaCertificado({
      inscripcionId: id,
      usuario: user.Username,
      rol: user.Rol,
      accion: 'PAYMENT_REPORTED',
      estadoAnterior: 'sin_reporte',
      estadoNuevo: estadoPago,
      canal: 'panel',
      resultado: 'ok',
      metadatos: {
        tieneComprobante: !!numeroComprobante,
        fechaPago: fechaPago || '',
      },
    });
  }

  return { success: true, id, ingresoId };
}

function tienePropiedad(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function valorComparableInscripcion(field, value) {
  if (['FechaInicio','FechaFin','FechaPago'].indexOf(field) !== -1) return fechaSolo(value);
  if (field === 'Monto' || field === 'ValorAval') return Number(value) || 0;
  if (field === 'RequiereAvalExterno') return esVerdadero(value);
  return String(value === null || value === undefined ? '' : value);
}

function camposPersistidosCoinciden(row, expectedFields) {
  return Object.keys(expectedFields).every(function(field) {
    return valorComparableInscripcion(field, row[field]) === valorComparableInscripcion(field, expectedFields[field]);
  });
}

function campoInscripcionCambioReal(row, field, expectedValue) {
  if (['FechaInicio','FechaFin','FechaPago'].indexOf(field) !== -1) {
    const raw = row._raw && tienePropiedad(row._raw, field) ? row._raw[field] : row[field];
    const expected = fechaSolo(expectedValue);
    return !(typeof raw === 'string' && raw === expected);
  }
  return valorComparableInscripcion(field, row[field]) !== valorComparableInscripcion(field, expectedValue);
}

function updateInscripcion(user, params) {
  return conBloqueoCertificados(function() {
    return updateInscripcionBajoBloqueo(user, params || {});
  });
}

function updateInscripcionBajoBloqueo(user, { id, historicalKey, inscripcion } = {}) {
  if (!isVendedor(user)) throw new Error('Acceso denegado.');
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Inscripciones');
  if (!sheet) return { success: false, error: 'No existe la hoja Inscripciones.' };
  const resolution = resolverFilaInscripcionParaActualizar(sheet, user, id, historicalKey);
  if (resolution.error) return { success: false, error: resolution.error };
  const row = resolution.row;
  if (row.IsHistoricalRecord && !isAdmin(user)) {
    return { success: false, error: 'Solo un administrador puede corregir inscripciones históricas.' };
  }
  if (!isAdmin(user) && row.CreadoPor !== user.Username) return { success: false, error: 'No autorizado.' };
  inscripcion = inscripcion || {};

  const fechaInicioNueva = tienePropiedad(inscripcion, 'fechaInicio')
    ? (String(inscripcion.fechaInicio || '').trim() ? fechaSolo(inscripcion.fechaInicio) : '')
    : fechaSolo(row.FechaInicio);
  const fechaFinNueva = tienePropiedad(inscripcion, 'fechaFin')
    ? (String(inscripcion.fechaFin || '').trim() ? fechaSolo(inscripcion.fechaFin) : '')
    : fechaSolo(row.FechaFin);
  if (tienePropiedad(inscripcion, 'fechaInicio') && String(inscripcion.fechaInicio || '').trim() && !fechaInicioNueva) {
    return { success: false, error: 'La fecha de inicio no tiene un formato válido.' };
  }
  if (tienePropiedad(inscripcion, 'fechaFin') && String(inscripcion.fechaFin || '').trim() && !fechaFinNueva) {
    return { success: false, error: 'La fecha de fin no tiene un formato válido.' };
  }
  const estadoCertificado = estadoNormalizadoCertificado(row);
  if (['emitido','enviado'].indexOf(estadoCertificado) !== -1
      && ((!fechaInicioNueva && tienePropiedad(inscripcion, 'fechaInicio'))
        || (!fechaFinNueva && tienePropiedad(inscripcion, 'fechaFin')))) {
    return { success: false, error: 'No se pueden limpiar las fechas obligatorias de un certificado emitido.' };
  }

  const merged = {
    clienteNombre: tienePropiedad(inscripcion, 'clienteNombre') ? inscripcion.clienteNombre : row.ClienteNombre,
    clienteID: tienePropiedad(inscripcion, 'clienteID') ? inscripcion.clienteID : row.ClienteID,
    clienteEmail: tienePropiedad(inscripcion, 'clienteEmail') ? inscripcion.clienteEmail : row.ClienteEmail,
    clienteTelefono: tienePropiedad(inscripcion, 'clienteTelefono') ? inscripcion.clienteTelefono : row.ClienteTelefono,
    servicioId: tienePropiedad(inscripcion, 'servicioId') ? inscripcion.servicioId : row.ServicioID,
    servicioNombre: tienePropiedad(inscripcion, 'servicioNombre') ? inscripcion.servicioNombre : row.ServicioNombre,
    modalidad: tienePropiedad(inscripcion, 'modalidad') ? inscripcion.modalidad : row.Modalidad,
    fechaInicio: fechaInicioNueva,
    fechaFin: fechaFinNueva,
    monto: tienePropiedad(inscripcion, 'monto') ? inscripcion.monto : row.Monto,
    metodoPago: tienePropiedad(inscripcion, 'metodoPago') ? inscripcion.metodoPago : row.MetodoPago,
    numeroComprobante: tienePropiedad(inscripcion, 'numeroComprobante') ? inscripcion.numeroComprobante : row.NumeroComprobante,
    fechaPago: tienePropiedad(inscripcion, 'fechaPago') ? inscripcion.fechaPago : row.FechaPago,
    requiereAvalExterno: tienePropiedad(inscripcion, 'requiereAvalExterno')
      ? inscripcion.requiereAvalExterno : esVerdadero(row.RequiereAvalExterno),
    institucionAval: tienePropiedad(inscripcion, 'institucionAval') ? inscripcion.institucionAval : row.InstitucionAval,
  };
  const validationError = validarDatosInscripcion(merged);
  if (validationError) return { success: false, error: validationError };

  const requiereAval = tienePropiedad(inscripcion, 'requiereAvalExterno')
    ? !!inscripcion.requiereAvalExterno
    : esVerdadero(row.RequiereAvalExterno);
  const institucionAval = requiereAval
    ? String(tienePropiedad(inscripcion, 'institucionAval') ? inscripcion.institucionAval : (row.InstitucionAval || '')).trim()
    : '';
  const cambiaConfiguracionAval = requiereAval !== esVerdadero(row.RequiereAvalExterno)
    || (requiereAval && !mismaInstitucionAval(institucionAval, row.InstitucionAval));
  if (['emitido','enviado'].indexOf(estadoCertificado) !== -1 && cambiaConfiguracionAval) {
    return { success: false, error: 'No puede cambiar el tipo o la institución de aval de un certificado ya emitido.' };
  }
  let estadoPago = row.EstadoPago;
  if (isAdmin(user) && inscripcion.estadoPago && inscripcion.estadoPago !== 'verificado') estadoPago = inscripcion.estadoPago;
  if (row.EstadoPago === 'verificado') estadoPago = 'verificado';
  const numeroComprobanteNuevo = tienePropiedad(inscripcion, 'numeroComprobante')
    ? String(inscripcion.numeroComprobante).trim()
    : String(row.NumeroComprobante || '').trim();
  const fechaPagoNueva = tienePropiedad(inscripcion, 'fechaPago')
    ? (String(inscripcion.fechaPago || '').trim() ? fechaSolo(inscripcion.fechaPago) : '')
    : fechaSolo(row.FechaPago);
  if (tienePropiedad(inscripcion, 'fechaPago') && String(inscripcion.fechaPago || '').trim() && !fechaPagoNueva) {
    return { success: false, error: 'La fecha de pago no tiene un formato válido.' };
  }
  const pagoReportado = (numeroComprobanteNuevo && numeroComprobanteNuevo !== String(row.NumeroComprobante || '').trim())
    || (fechaPagoNueva && fechaPagoNueva !== fechaSolo(row.FechaPago))
    || (estadoPago === 'pagado' && row.EstadoPago !== 'pagado');

  const fieldMap = {};
  const mappings = {
    clienteNombre: 'ClienteNombre', clienteID: 'ClienteID', clienteEmail: 'ClienteEmail',
    clienteTelefono: 'ClienteTelefono', servicioId: 'ServicioID', servicioNombre: 'ServicioNombre',
    modalidad: 'Modalidad', metodoPago: 'MetodoPago', razonSocial: 'RazonSocial', ruc: 'RUC',
    direccionFactura: 'DireccionFactura', notas: 'Notas',
  };
  Object.keys(mappings).forEach(function(inputField) {
    if (tienePropiedad(inscripcion, inputField)) fieldMap[mappings[inputField]] = inscripcion[inputField];
  });
  if (tienePropiedad(inscripcion, 'fechaInicio')) fieldMap.FechaInicio = fechaInicioNueva;
  if (tienePropiedad(inscripcion, 'fechaFin')) fieldMap.FechaFin = fechaFinNueva;
  if (tienePropiedad(inscripcion, 'monto')) fieldMap.Monto = Number(inscripcion.monto);
  if (tienePropiedad(inscripcion, 'estadoPago')) fieldMap.EstadoPago = estadoPago;
  if (tienePropiedad(inscripcion, 'numeroComprobante')) fieldMap.NumeroComprobante = numeroComprobanteNuevo;
  if (tienePropiedad(inscripcion, 'fechaPago')) fieldMap.FechaPago = fechaPagoNueva;
  if (tienePropiedad(inscripcion, 'requiereAvalExterno') || tienePropiedad(inscripcion, 'institucionAval')) {
    fieldMap.RequiereAvalExterno = requiereAval;
    fieldMap.InstitucionAval = institucionAval;
    fieldMap.EstadoAval = requiereAval ? (cambiaConfiguracionAval ? 'pendiente' : (row.EstadoAval || 'pendiente')) : '';
    fieldMap.AvalReferencia = cambiaConfiguracionAval ? '' : row.AvalReferencia;
    fieldMap.FechaAval = cambiaConfiguracionAval ? '' : row.FechaAval;
    fieldMap.ValorAval = cambiaConfiguracionAval ? 0 : row.ValorAval;
    fieldMap.AvalEnlaceExterno = cambiaConfiguracionAval ? '' : row.AvalEnlaceExterno;
    fieldMap.AvalCodigoExterno = cambiaConfiguracionAval ? '' : row.AvalCodigoExterno;
  }
  const changedFields = Object.keys(fieldMap).filter(function(field) {
    return campoInscripcionCambioReal(row, field, fieldMap[field]);
  });
  const formulaFields = changedFields.filter(function(field) {
    return Boolean(row._formulas && row._formulas[field]);
  });
  if (formulaFields.length) {
    const reason = 'No se modificó la fila porque contiene fórmulas en: ' + formulaFields.join(', ') + '.';
    registrarRechazoActualizacionHistorica(user, row.ID || '', historicalKey || '', reason);
    return { success: false, error: reason };
  }
  const fieldsToWrite = {};
  const previousFields = {};
  changedFields.forEach(function(field) {
    fieldsToWrite[field] = fieldMap[field];
    previousFields[field] = row._raw && tienePropiedad(row._raw, field) ? row._raw[field] : row[field];
  });

  if (changedFields.length) actualizarFilaInscripcionFisica(sheet, row._row, fieldsToWrite);
  let updated = filaInscripcionPorNumero(sheet, row._row);
  if (!updated || !camposPersistidosCoinciden(updated, fieldsToWrite)) {
    if (changedFields.length) actualizarFilaInscripcionFisica(sheet, row._row, previousFields);
    return { success: false, error: 'La actualización no pudo verificarse en Google Sheets. No se confirmó ningún cambio.' };
  }
  try {
    if (changedFields.length) {
      registrarAuditoriaCertificado({
        certificadoId: updated.CodigoCertificado,
        inscripcionId: updated.ID || '',
        usuario: user.Username,
        rol: user.Rol,
        accion: 'ENROLLMENT_UPDATED',
        estadoAnterior: row.EstadoCertificado || 'pendiente',
        estadoNuevo: updated.EstadoCertificado || 'pendiente',
        canal: 'panel',
        resultado: 'ok',
        metadatos: {
          fields: changedFields,
          historicalKey: resolution.usedHistoricalKey ? historicalKey : '',
          physicalRow: row._row,
          persistenceVerified: true,
        },
      });
    }
  } catch (error) {
    if (changedFields.length) actualizarFilaInscripcionFisica(sheet, row._row, previousFields);
    throw error;
  }

  const incomeFields = ['ClienteNombre','ClienteTelefono','ServicioNombre','Modalidad','Monto','MetodoPago','NumeroComprobante','FechaPago','EstadoPago'];
  const shouldSyncIncome = changedFields.some(function(field) { return incomeFields.indexOf(field) !== -1; });
  const sync = shouldSyncIncome ? sincronizarIngresoInscripcion(updated) : { sincronizado: true, motivo: '' };
  if (pagoReportado) {
    registrarAuditoriaCertificado({
      certificadoId: updated.CodigoCertificado,
      inscripcionId: updated.ID || '',
      usuario: user.Username,
      rol: user.Rol,
      accion: 'PAYMENT_REPORTED',
      estadoAnterior: row.EstadoPago || 'pendiente',
      estadoNuevo: updated.EstadoPago || estadoPago,
      canal: 'panel',
      resultado: 'ok',
      metadatos: {
        tieneComprobante: !!numeroComprobanteNuevo,
        fechaPago: fechaPagoNueva || '',
      },
    });
  }
  const duracionDe = mapaDuracionServicios();
  const usuarios = mapaUsuariosPorUsername();
  return {
    success: true,
    persistenceVerified: true,
    changedFields: changedFields,
    data: inscripcionEnriquecida(inscripcionSinMetadatosInternos(updated), duracionDe, usuarios),
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
  registrarAuditoriaCertificado({
    certificadoId: updated.CodigoCertificado,
    inscripcionId: id,
    usuario: user.Username,
    rol: user.Rol,
    accion: 'PAYMENT_VERIFIED',
    estadoAnterior: row.EstadoPago || 'pendiente',
    estadoNuevo: 'verificado',
    canal: 'panel',
    resultado: 'ok',
  });
  return { success: true, data: inscripcionEnriquecida(updated, mapaDuracionServicios(), mapaUsuariosPorUsername()) };
}

function codigoCertificadoEstable(row) {
  const fecha = row.FechaEmisionCertificado ? new Date(row.FechaEmisionCertificado) : new Date();
  let fragmento = String(row.ID || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(-10);
  while (fragmento.length < 8) fragmento = '0' + fragmento;
  return 'RA-' + fecha.getFullYear() + '-' + fragmento;
}

function conBloqueoCertificados(callback) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}

function codigoCertificadoEnUso(codigo, exceptCertificateId, exceptInscripcionId) {
  const normalized = String(codigo || '').trim().toUpperCase();
  if (!normalized) return false;
  const usadoEnCertificados = sheetToObjects(getSheet('Certificados')).some(function(item) {
    return String(item.CodigoCertificado || '').trim().toUpperCase() === normalized
      && String(item.ID || '') !== String(exceptCertificateId || '');
  });
  if (usadoEnCertificados) return true;
  return sheetToObjects(getSheet('Inscripciones')).some(function(item) {
    return String(item.CodigoCertificado || '').trim().toUpperCase() === normalized
      && String(item.ID || '') !== String(exceptInscripcionId || '');
  });
}

function generarCodigoCertificadoUnico(row, exceptCertificateId, exceptInscripcionId) {
  const base = codigoCertificadoEstable(row);
  if (!codigoCertificadoEnUso(base, exceptCertificateId, exceptInscripcionId)) return base;
  for (var intento = 2; intento <= 99; intento += 1) {
    var candidato = base + '-' + String(intento).padStart(2, '0');
    if (!codigoCertificadoEnUso(candidato, exceptCertificateId, exceptInscripcionId)) return candidato;
  }
  throw new Error('No se pudo reservar un c\u00f3digo de certificado \u00fanico. Intente nuevamente.');
}

function estadoNormalizadoCertificado(row) {
  var estado = String(row.CertificateStatus || row.EstadoCertificado || '').trim().toLowerCase();
  var mapa = {
    issued: 'emitido', sent: 'enviado', voided: 'anulado', reissued: 'reemitido',
    descargado: 'emitido', compartido: 'enviado', enviado_email: 'enviado', enviado_whatsapp: 'enviado',
  };
  return mapa[estado] || estado || 'pendiente';
}

function estadoPublicoCertificado(row) {
  var estado = estadoNormalizadoCertificado(row);
  if (estado === 'anulado') return 'anulado';
  if (estado === 'reemitido') return 'reemitido';
  if (estado === 'emitido' || estado === 'enviado') return 'vigente';
  return estado;
}

function certificadoHistoricoDesdeInscripcion(row) {
  return {
    ID: row.ID,
    InscripcionID: row.ID,
    CodigoCertificado: row.CodigoCertificado || codigoCertificadoEstable(row),
    CertificateVersion: Number(row.CertificateVersion) || 1,
    TemplateVersion: row.TemplateVersion || 'legacy-v1',
    PdfHash: row.PdfHash || '',
    PdfStorageReference: row.PdfStorageReference || '',
    OriginalCertificateId: row.OriginalCertificateId || '',
    ReissuedCertificateId: row.ReissuedCertificateId || '',
    CertificateStatus: estadoNormalizadoCertificado(row),
    IssuedAt: row.IssuedAt || row.FechaEmisionCertificado || row.FechaCreacion || row.FechaInicio || '',
    IssuedBy: row.IssuedBy || row.EmitidoPor || '',
    VoidedAt: row.VoidedAt || '',
    VoidedBy: row.VoidedBy || '',
    VoidReason: row.VoidReason || '',
    ReissueReason: row.ReissueReason || '',
  };
}

function appendCertificado(registro) {
  var sheet = getSheet('Certificados');
  var existentes = sheetToObjects(sheet);
  if (existentes.some(function(item) { return item.ID === registro.ID; })) {
    throw new Error('El identificador del certificado ya existe.');
  }
  if (codigoCertificadoEnUso(registro.CodigoCertificado, registro.ID, registro.InscripcionID)) {
    throw new Error('El c\u00f3digo del certificado ya est\u00e1 asignado a otro registro.');
  }
  sheet.appendRow(SHEET_HEADERS.Certificados.map(function(header) {
    return registro[header] === undefined || registro[header] === null ? '' : registro[header];
  }));
  return sheetToObjects(sheet).find(function(item) { return item.ID === registro.ID; });
}

function asegurarRegistroCertificado(row, user) {
  var sheet = getSheet('Certificados');
  var existentes = sheetToObjects(sheet);
  var encontrado = existentes.find(function(item) {
    return item.ID === row.ID
      || (row.CodigoCertificado && item.CodigoCertificado === row.CodigoCertificado && item.InscripcionID === row.ID);
  });
  if (encontrado) return encontrado;
  if (codigoCertificadoEnUso(row.CodigoCertificado, row.ID, row.ID)) {
    registrarAuditoriaCertificado({
      certificadoId: row.CodigoCertificado,
      inscripcionId: row.ID,
      usuario: user && user.Username,
      rol: user && user.Rol,
      accion: 'CERTIFICATE_CODE_CONFLICT',
      canal: 'api',
      resultado: 'rechazado',
      motivo: 'El c\u00f3digo hist\u00f3rico pertenece a otro certificado.',
    });
    throw new Error('El c\u00f3digo hist\u00f3rico del certificado est\u00e1 duplicado. Revise la migraci\u00f3n antes de continuar.');
  }
  var historico = certificadoHistoricoDesdeInscripcion(row);
  historico.CreatedAt = new Date().toISOString();
  historico.IssuedBy = historico.IssuedBy || (user && user.Username) || '';
  return appendCertificado(historico);
}

function buscarCertificadoPublico(identifier) {
  var certificados = sheetToObjects(getSheet('Certificados'));
  var certificateMatches = certificados.filter(function(item) {
    return item.ID === identifier || item.CodigoCertificado === identifier;
  });
  if (certificateMatches.length > 1) return null;
  var certificado = certificateMatches[0];
  var insSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Inscripciones');
  var inscripciones = insSheet ? filasInscripcionesDecoradas(insSheet).rows : [];
  if (certificado) {
    var linkedMatches = inscripciones.filter(function(item) {
      return (certificado.InscripcionID && item.ID === certificado.InscripcionID)
        || (!certificado.InscripcionID && item.CodigoCertificado === certificado.CodigoCertificado);
    });
    var vinculada = linkedMatches.length === 1 ? linkedMatches[0] : null;
    return vinculada ? { certificado: certificado, inscripcion: vinculada } : null;
  }
  var historicalMatches = inscripciones.filter(function(item) {
    return item.ID === identifier || item.CodigoCertificado === identifier;
  });
  var historica = historicalMatches.length === 1 ? historicalMatches[0] : null;
  if (!historica || ['emitido', 'enviado', 'anulado', 'reemitido'].indexOf(estadoNormalizadoCertificado(historica)) === -1) return null;
  return { certificado: certificadoHistoricoDesdeInscripcion(historica), inscripcion: historica };
}

function resolverCertificadoAdministrativo(identifier, user) {
  var insSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Inscripciones');
  var inscripciones = insSheet ? filasInscripcionesDecoradas(insSheet).rows : [];
  var certificados = sheetToObjects(getSheet('Certificados'));
  var enrollmentMatches = inscripciones.filter(function(item) {
    return item.ID === identifier || item.CodigoCertificado === identifier;
  });
  if (enrollmentMatches.length > 1) return null;
  var inscripcion = enrollmentMatches[0];
  var certificado;
  if (inscripcion) {
    var linkedCertificates = certificados.filter(function(item) {
      return (inscripcion.CodigoCertificado && item.CodigoCertificado === inscripcion.CodigoCertificado)
        || (inscripcion.ID && item.ID === (inscripcion.ReissuedCertificateId || inscripcion.ID));
    });
    if (linkedCertificates.length > 1) return null;
    certificado = linkedCertificates[0];
    if (!certificado && certificadoProtegidoContraEliminacion(inscripcion)) {
      certificado = inscripcion.ID
        ? asegurarRegistroCertificado(inscripcion, user)
        : certificadoHistoricoDesdeInscripcion(inscripcion);
    }
  } else {
    var certificateMatches = certificados.filter(function(item) { return item.ID === identifier || item.CodigoCertificado === identifier; });
    if (certificateMatches.length !== 1) return null;
    certificado = certificateMatches[0];
    var linkedEnrollments = inscripciones.filter(function(item) {
      return (certificado.InscripcionID && item.ID === certificado.InscripcionID)
        || (!certificado.InscripcionID && item.CodigoCertificado === certificado.CodigoCertificado);
    });
    if (linkedEnrollments.length !== 1) return null;
    inscripcion = linkedEnrollments[0];
  }
  return certificado && inscripcion ? { certificado: certificado, inscripcion: inscripcion } : null;
}

function criteriosCertificadoLegacy(certificado, inscripcion) {
  const criterios = [];
  const template = String(certificado.TemplateVersion || '').trim();
  const reference = String(certificado.PdfStorageReference || '').trim();
  const estado = estadoNormalizadoCertificado(certificado);
  const emitido = ['emitido','enviado','anulado','reemitido'].indexOf(estado) !== -1;
  if (inscripcion && inscripcion.IsHistoricalRecord && Array.isArray(inscripcion.HistoricalCriteria)) {
    Array.prototype.push.apply(criterios, inscripcion.HistoricalCriteria.filter(function(criterio) {
      return criterio !== 'columnas_esquema_ausentes';
    }));
  }
  if (/^legacy(?:-|$)/i.test(template)) criterios.push('plantilla_legacy');
  if (/:historical-recovery$/.test(reference) || /^(private-drive|external|drive):/i.test(reference)) {
    criterios.push('almacenamiento_historico');
  }
  if (emitido && !String(certificado.CertificateVersion || '').trim()) criterios.push('version_ausente');
  if (emitido && !template) criterios.push('plantilla_ausente');
  if (String(certificado.PdfHash || '').trim() && !reference) criterios.push('hash_sin_referencia');
  if (inscripcion && String(inscripcion.PdfHash || '').trim() && !String(inscripcion.PdfStorageReference || '').trim()) {
    criterios.push('inscripcion_con_hash_sin_referencia');
  }
  return criterios.filter(function(value, index, all) { return all.indexOf(value) === index; });
}

function certificadoParaCliente(certificado, inscripcion) {
  const legacyCriteria = criteriosCertificadoLegacy(certificado, inscripcion);
  const missingRequired = datosFaltantesCertificado(inscripcion);
  return Object.assign({}, inscripcionEnriquecida(inscripcionSinMetadatosInternos(inscripcion), mapaDuracionServicios(), mapaUsuariosPorUsername()), {
    ID: certificado.ID,
    InscripcionID: inscripcion.ID,
    CertificatePublicId: certificado.ID,
    CodigoCertificado: certificado.CodigoCertificado,
    CertificateVersion: Number(certificado.CertificateVersion) || 1,
    TemplateVersion: certificado.TemplateVersion || 'legacy-v1',
    PdfHash: certificado.PdfHash || '',
    PdfStorageReference: certificado.PdfStorageReference || '',
    OriginalCertificateId: certificado.OriginalCertificateId || '',
    ReissuedCertificateId: certificado.ReissuedCertificateId || '',
    CertificateStatus: estadoNormalizadoCertificado(certificado),
    EstadoCertificado: estadoNormalizadoCertificado(certificado),
    FechaEmisionCertificado: certificado.IssuedAt || inscripcion.FechaEmisionCertificado,
    IssuedAt: certificado.IssuedAt || inscripcion.FechaEmisionCertificado,
    IssuedBy: certificado.IssuedBy || inscripcion.EmitidoPor,
    IsHistoricalRecord: legacyCriteria.length > 0,
    HistoricalCriteria: legacyCriteria,
    HistoricalNormalizationRequired: Boolean(inscripcion.HistoricalNormalizationRequired || missingRequired.length),
  });
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

function emitirCertificado(user, params) {
  return conBloqueoCertificados(function() {
    return emitirCertificadoBajoBloqueo(user, params || {});
  });
}

function emitirCertificadoBajoBloqueo(user, { id } = {}) {
  requireCertificateAdmin(user, 'CERTIFICATE_ISSUE', { inscripcionId: id, canal: 'api' });
  const sheet = getSheet('Inscripciones');
  const row = sheetToObjects(sheet).find(function(r) { return r.ID === id; });
  if (!row) return { success: false, error: 'Inscripción no encontrada.' };
  const estadoActual = estadoNormalizadoCertificado(row);
  if (estadoActual === 'anulado') {
    return { success: false, error: 'El certificado está anulado. Utilice la reemisión controlada para crear una nueva versión.' };
  }
  if (['emitido', 'enviado', 'reemitido'].indexOf(estadoActual) !== -1) {
    const codigoFaltante = !String(row.CodigoCertificado || '').trim();
    const fechaFaltante = !String(row.FechaEmisionCertificado || '').trim();
    if (codigoFaltante || fechaFaltante) {
      const fechaHistorica = row.FechaEmisionCertificado || row.FechaCreacion || row.FechaInicio || new Date().toISOString();
      const normalizado = Object.assign({}, row, { FechaEmisionCertificado: fechaHistorica });
      updateRow(sheet, row, {
        CodigoCertificado: row.CodigoCertificado || generarCodigoCertificadoUnico(normalizado, row.ID, row.ID),
        FechaEmisionCertificado: fechaHistorica,
        EmitidoPor: row.EmitidoPor || user.Username,
        EstadoEntrega: row.EstadoEntrega || 'pendiente',
        CertificateVersion: Number(row.CertificateVersion) || 1,
        TemplateVersion: row.TemplateVersion || 'legacy-v1',
        CertificateStatus: estadoActual,
        IssuedAt: row.IssuedAt || fechaHistorica,
        IssuedBy: row.IssuedBy || row.EmitidoPor || user.Username,
      });
      const updatedLegacy = sheetToObjects(sheet).find(function(r) { return r.ID === id; });
      registrarAuditoriaCertificado({
        certificadoId: updatedLegacy.CodigoCertificado,
        inscripcionId: id,
        usuario: user.Username,
        rol: user.Rol,
        accion: 'CERTIFICATE_METADATA_BACKFILLED',
        estadoAnterior: 'emitido_sin_metadatos',
        estadoNuevo: 'emitido',
        canal: 'panel',
        resultado: 'ok',
      });
      const certificadoLegacy = asegurarRegistroCertificado(updatedLegacy, user);
      return { success: true, alreadyIssued: true, metadataBackfilled: true, data: certificadoParaCliente(certificadoLegacy, updatedLegacy) };
    }
    const certificadoExistente = asegurarRegistroCertificado(row, user);
    return { success: true, alreadyIssued: true, data: certificadoParaCliente(certificadoExistente, row) };
  }
  if (row.EstadoPago !== 'verificado') return { success: false, error: 'El pago debe estar verificado antes de emitir el certificado.' };
  if (esVerdadero(row.RequiereAvalExterno) && row.EstadoAval !== 'avalado') {
    return { success: false, error: 'El certificado requiere el aval institucional antes de poder emitirse.' };
  }
  const faltantes = datosFaltantesCertificado(row);
  if (faltantes.length) return { success: false, error: 'Faltan los siguientes datos para generar el certificado: ' + faltantes.join(', ') + '.' };

  if (row.CodigoCertificado && codigoCertificadoEnUso(row.CodigoCertificado, row.ID, row.ID)) {
    registrarAuditoriaCertificado({
      certificadoId: row.CodigoCertificado,
      inscripcionId: row.ID,
      usuario: user.Username,
      rol: user.Rol,
      accion: 'CERTIFICATE_CODE_CONFLICT',
      estadoAnterior: estadoActual,
      estadoNuevo: estadoActual,
      canal: 'api',
      resultado: 'rechazado',
      motivo: 'C\u00f3digo preexistente asignado a otro certificado.',
    });
    return { success: false, error: 'El c\u00f3digo del certificado ya est\u00e1 asignado a otro registro.' };
  }

  const ahora = new Date().toISOString();
  const codigo = row.CodigoCertificado || generarCodigoCertificadoUnico(
    Object.assign({}, row, { FechaEmisionCertificado: ahora }),
    row.ID,
    row.ID
  );
  updateRow(sheet, row, {
    EstadoCertificado: 'emitido',
    CodigoCertificado: codigo,
    FechaEmisionCertificado: row.FechaEmisionCertificado || ahora,
    EmitidoPor: row.EmitidoPor || user.Username,
    EstadoEntrega: row.EstadoEntrega || 'pendiente',
    CertificateVersion: 1,
    TemplateVersion: CERTIFICATE_TEMPLATE_VERSION,
    CertificateStatus: 'emitido',
    IssuedAt: row.IssuedAt || row.FechaEmisionCertificado || ahora,
    IssuedBy: row.IssuedBy || row.EmitidoPor || user.Username,
  });
  const updated = sheetToObjects(sheet).find(function(r) { return r.ID === id; });
  registrarAuditoriaCertificado({
    certificadoId: updated.CodigoCertificado,
    inscripcionId: id,
    usuario: user.Username,
    rol: user.Rol,
    accion: 'CERTIFICATE_ISSUED',
    estadoAnterior: row.EstadoCertificado || 'pendiente',
    estadoNuevo: 'emitido',
    canal: 'panel',
    resultado: 'ok',
  });
  const certificado = asegurarRegistroCertificado(updated, user);
  return { success: true, data: certificadoParaCliente(certificado, updated) };
}

function anularCertificado(user, { id, motivo, confirmacion } = {}) {
  requireCertificateAdmin(user, 'CERTIFICATE_VOID', { inscripcionId: id, canal: 'api' });
  const motivoSeguro = String(motivo || '').trim();
  if (confirmacion !== 'ANULAR') return { success: false, error: 'Confirme explícitamente la anulación del certificado.' };
  if (motivoSeguro.length < 5) return { success: false, error: 'El motivo de anulación es obligatorio y debe ser suficientemente descriptivo.' };
  const resolved = resolverCertificadoAdministrativo(id, user);
  if (!resolved) return { success: false, error: 'Certificado no encontrado.' };
  const certificado = resolved.certificado;
  const inscripcion = resolved.inscripcion;
  const estadoAnterior = estadoNormalizadoCertificado(certificado);
  if (estadoAnterior === 'anulado') return { success: false, error: 'El certificado ya se encuentra anulado.' };
  if (estadoAnterior === 'reemitido') return { success: false, error: 'El certificado original ya fue reemitido y conserva su estado histórico.' };
  const ahora = new Date().toISOString();
  const certSheet = getSheet('Certificados');
  updateRow(certSheet, certificado, {
    CertificateStatus: 'anulado',
    VoidedAt: ahora,
    VoidedBy: user.Username,
    VoidReason: motivoSeguro,
  });
  const insSheet = getSheet('Inscripciones');
  updateRow(insSheet, inscripcion, {
    EstadoCertificado: 'anulado',
    CertificateStatus: 'anulado',
    VoidedAt: ahora,
    VoidedBy: user.Username,
    VoidReason: motivoSeguro,
  });
  registrarAuditoriaCertificado({
    certificadoId: certificado.CodigoCertificado,
    inscripcionId: inscripcion.ID,
    usuario: user.Username,
    rol: user.Rol,
    accion: 'CERTIFICATE_VOIDED',
    estadoAnterior: estadoAnterior,
    estadoNuevo: 'anulado',
    canal: 'panel',
    resultado: 'ok',
    motivo: motivoSeguro,
    metadatos: { certificateId: certificado.ID, version: Number(certificado.CertificateVersion) || 1 },
  });
  const updated = sheetToObjects(certSheet).find(function(item) { return item.ID === certificado.ID; });
  const updatedIns = sheetToObjects(insSheet).find(function(item) { return item.ID === inscripcion.ID; });
  return { success: true, data: certificadoParaCliente(updated, updatedIns) };
}

function reemitirCertificado(user, params) {
  return conBloqueoCertificados(function() {
    return reemitirCertificadoBajoBloqueo(user, params || {});
  });
}

function reemitirCertificadoBajoBloqueo(user, { id, motivo, confirmacion } = {}) {
  requireCertificateAdmin(user, 'CERTIFICATE_REISSUE', { inscripcionId: id, canal: 'api' });
  const motivoSeguro = String(motivo || '').trim();
  if (confirmacion !== 'REEMITIR') return { success: false, error: 'Confirme explícitamente la reemisión del certificado.' };
  if (motivoSeguro.length < 5) return { success: false, error: 'El motivo de reemisión es obligatorio y debe ser suficientemente descriptivo.' };
  const resolved = resolverCertificadoAdministrativo(id, user);
  if (!resolved) return { success: false, error: 'Certificado no encontrado.' };
  const original = resolved.certificado;
  const inscripcion = resolved.inscripcion;
  const estadoAnterior = estadoNormalizadoCertificado(original);
  if (estadoAnterior === 'reemitido') return { success: false, error: 'Este identificador corresponde a un certificado histórico ya reemitido.' };
  const ahora = new Date().toISOString();
  const nuevoId = generateId('CRT');
  const nuevaVersion = (Number(original.CertificateVersion) || 1) + 1;
  const nuevoCodigo = generarCodigoCertificadoUnico(
    { ID: nuevoId, FechaEmisionCertificado: ahora },
    nuevoId,
    inscripcion.ID
  );
  const nuevo = appendCertificado({
    ID: nuevoId,
    InscripcionID: inscripcion.ID,
    CodigoCertificado: nuevoCodigo,
    CertificateVersion: nuevaVersion,
    TemplateVersion: CERTIFICATE_TEMPLATE_VERSION,
    OriginalCertificateId: original.ID,
    CertificateStatus: 'emitido',
    IssuedAt: ahora,
    IssuedBy: user.Username,
    ReissueReason: motivoSeguro,
    CreatedAt: ahora,
  });
  const certSheet = getSheet('Certificados');
  updateRow(certSheet, original, {
    CertificateStatus: 'reemitido',
    ReissuedCertificateId: nuevo.ID,
    ReissueReason: motivoSeguro,
  });
  const insSheet = getSheet('Inscripciones');
  updateRow(insSheet, inscripcion, {
    EstadoCertificado: 'reemitido',
    CodigoCertificado: nuevo.CodigoCertificado,
    FechaEmisionCertificado: nuevo.IssuedAt,
    EmitidoPor: user.Username,
    CertificateStatus: 'emitido',
    CertificateVersion: nuevaVersion,
    TemplateVersion: nuevo.TemplateVersion,
    OriginalCertificateId: original.ID,
    ReissuedCertificateId: nuevo.ID,
    ReissueReason: motivoSeguro,
    EstadoEntrega: 'pendiente',
    FechaEntregaCertificado: '',
    EntregadoPor: '',
  });
  registrarAuditoriaCertificado({
    certificadoId: nuevo.CodigoCertificado,
    inscripcionId: inscripcion.ID,
    usuario: user.Username,
    rol: user.Rol,
    accion: 'CERTIFICATE_REISSUED',
    estadoAnterior: estadoAnterior,
    estadoNuevo: 'reemitido',
    canal: 'panel',
    resultado: 'ok',
    motivo: motivoSeguro,
    metadatos: {
      originalCertificateId: original.ID,
      newCertificateId: nuevo.ID,
      version: nuevaVersion,
      templateVersion: nuevo.TemplateVersion,
    },
  });
  const updatedIns = sheetToObjects(insSheet).find(function(item) { return item.ID === inscripcion.ID; });
  return { success: true, data: certificadoParaCliente(nuevo, updatedIns) };
}

function getCertificadoParaDescarga(user, { id } = {}) {
  requireCertificateAdmin(user, 'CERTIFICATE_DOWNLOAD_READ', { inscripcionId: id, canal: 'api' });
  const resolved = resolverCertificadoAdministrativo(id, user);
  if (!resolved) return { success: false, error: 'Certificado no encontrado.' };
  const estado = estadoNormalizadoCertificado(resolved.certificado);
  if (estado === 'anulado') return { success: false, error: 'El certificado est\u00e1 anulado y no puede descargarse.' };
  if (['emitido', 'enviado'].indexOf(estado) === -1) {
    return { success: false, error: 'El certificado no est\u00e1 vigente para descarga.' };
  }
  const missing = datosFaltantesCertificado(resolved.inscripcion);
  if (!String(resolved.inscripcion.ID || '').trim()) {
    return { success: false, error: 'El registro histórico requiere normalización porque no tiene un ID estable. Ejecute primero el diagnóstico.' };
  }
  if (missing.length) {
    const fechaFinMissing = missing.indexOf('fecha de fin') !== -1;
    const prefix = criteriosCertificadoLegacy(resolved.certificado, resolved.inscripcion).length
      ? 'El registro histórico requiere normalización: '
      : 'Faltan datos obligatorios del certificado: ';
    return {
      success: false,
      error: prefix + (fechaFinMissing ? 'falta FechaFin. ' : '') + 'Complete: ' + missing.join(', ') + '.',
    };
  }
  return { success: true, data: certificadoParaCliente(resolved.certificado, resolved.inscripcion) };
}

function esCertificadoHistoricoParaRebase(certificado, inscripcion) {
  return criteriosCertificadoLegacy(certificado, inscripcion).length > 0;
}

function tieneRebaseHistoricoRegistrado(certificado, inscripcion) {
  return sheetToObjects(getSheet('AuditoriaCertificados')).some(function(evento) {
    return evento.Accion === 'CERTIFICATE_HISTORICAL_HASH_REBASED'
      && (evento.CertificadoID === certificado.CodigoCertificado || evento.InscripcionID === inscripcion.ID);
  });
}

function registrarArtefactoCertificado(user, options) {
  return conBloqueoCertificados(function() {
    return registrarArtefactoCertificadoBajoBloqueo(user, options || {});
  });
}

function registrarArtefactoCertificadoBajoBloqueo(user, {
  id, pdfHash, pdfStorageReference, templateVersion, certificateVersion,
  historicalHashRebase, previousPdfHash, originalArtifactUnavailable,
  historicalHashRebaseConfirmation, historicalHashRebaseReason,
} = {}) {
  requireCertificateAdmin(user, 'CERTIFICATE_ARTIFACT_REGISTER', { inscripcionId: id, canal: 'api' });
  const hash = String(pdfHash || '').trim().toLowerCase();
  const storageReference = String(pdfStorageReference || '').trim();
  const previousHash = String(previousPdfHash || '').trim().toLowerCase();
  const rebaseReason = String(historicalHashRebaseReason || '').trim();
  if (!/^[a-f0-9]{64}$/.test(hash)) return { success: false, error: 'El hash SHA-256 del PDF no es v\u00e1lido.' };
  if (!/^(browser-indexeddb|private-drive|test-memory):[a-zA-Z0-9._:-]+$/.test(storageReference)) {
    return { success: false, error: 'La referencia privada del PDF no es v\u00e1lida.' };
  }
  if (/^https?:\/\//i.test(storageReference)) {
    return { success: false, error: 'No se permiten enlaces p\u00fablicos como almacenamiento del certificado.' };
  }
  const resolved = resolverCertificadoAdministrativo(id, user);
  if (!resolved) return { success: false, error: 'Certificado no encontrado.' };
  const certificado = resolved.certificado;
  const inscripcion = resolved.inscripcion;
  const estado = estadoNormalizadoCertificado(certificado);
  if (estado !== 'emitido' && estado !== 'enviado') {
    return { success: false, error: 'Solo un certificado vigente puede registrar un artefacto PDF.' };
  }
  const expectedVersion = Number(certificado.CertificateVersion) || 1;
  if (Number(certificateVersion || expectedVersion) !== expectedVersion) {
    return { success: false, error: 'La versi\u00f3n del PDF no corresponde al certificado vigente.' };
  }
  const currentHash = String(certificado.PdfHash || '').trim().toLowerCase();
  const hashMismatch = Boolean(currentHash && currentHash !== hash);
  const rebaseAlreadyRegistered = hashMismatch && tieneRebaseHistoricoRegistrado(certificado, inscripcion);
  const historicalHashRebaseAuthorized = hashMismatch
    && historicalHashRebase === true
    && originalArtifactUnavailable === true
    && historicalHashRebaseConfirmation === 'REBASE_HISTORICAL_HASH_ONCE'
    && /^[a-f0-9]{64}$/.test(previousHash)
    && previousHash === currentHash
    && rebaseReason.length >= 30
    && esCertificadoHistoricoParaRebase(certificado, inscripcion)
    && !rebaseAlreadyRegistered;
  if (hashMismatch && !historicalHashRebaseAuthorized) {
    return {
      success: false,
      error: rebaseAlreadyRegistered
        ? 'La huella de este certificado hist\u00f3rico ya fue recuperada una vez y no puede sustituirse nuevamente.'
        : 'El artefacto PDF ya fue fijado y no puede sobrescribirse.',
    };
  }
  if (certificado.PdfStorageReference
      && String(certificado.PdfStorageReference) !== storageReference
      && !historicalHashRebaseAuthorized) {
    return { success: false, error: 'La referencia del PDF ya fue fijada y no puede sobrescribirse.' };
  }
  const requestedTemplate = String(templateVersion || certificado.TemplateVersion || CERTIFICATE_TEMPLATE_VERSION).trim();
  const resolvedTemplate = historicalHashRebaseAuthorized && certificado.TemplateVersion
    ? String(certificado.TemplateVersion).trim()
    : requestedTemplate;
  if (certificado.PdfHash && certificado.TemplateVersion
      && certificado.TemplateVersion !== resolvedTemplate
      && !historicalHashRebaseAuthorized) {
    return { success: false, error: 'La versi\u00f3n de plantilla no corresponde al certificado emitido.' };
  }
  const previousCertificateArtifact = {
    PdfHash: certificado.PdfHash || '',
    PdfStorageReference: certificado.PdfStorageReference || '',
    TemplateVersion: certificado.TemplateVersion || '',
  };
  const previousEnrollmentArtifact = {
    PdfHash: inscripcion.PdfHash || '',
    PdfStorageReference: inscripcion.PdfStorageReference || '',
    CertificateVersion: inscripcion.CertificateVersion || '',
    TemplateVersion: inscripcion.TemplateVersion || '',
  };
  const certificateArtifactUpdate = {
    PdfHash: hash,
    PdfStorageReference: storageReference,
  };
  const enrollmentArtifactUpdate = {
    PdfHash: hash,
    PdfStorageReference: storageReference,
  };
  if (!historicalHashRebaseAuthorized) {
    certificateArtifactUpdate.TemplateVersion = resolvedTemplate;
    enrollmentArtifactUpdate.CertificateVersion = expectedVersion;
    enrollmentArtifactUpdate.TemplateVersion = resolvedTemplate;
  }
  updateRow(getSheet('Certificados'), certificado, certificateArtifactUpdate);
  updateRow(getSheet('Inscripciones'), inscripcion, enrollmentArtifactUpdate);
  try {
    registrarAuditoriaCertificado({
      certificadoId: certificado.CodigoCertificado,
      inscripcionId: inscripcion.ID,
      usuario: user.Username,
      rol: user.Rol,
      accion: historicalHashRebaseAuthorized
        ? 'CERTIFICATE_HISTORICAL_HASH_REBASED'
        : certificado.PdfHash ? 'CERTIFICATE_ARTIFACT_CONFIRMED' : 'CERTIFICATE_ARTIFACT_REGISTERED',
      estadoAnterior: estado,
      estadoNuevo: estado,
      canal: 'panel',
      resultado: 'ok',
      motivo: historicalHashRebaseAuthorized ? rebaseReason : '',
      metadatos: {
        certificateId: certificado.ID,
        certificateVersion: expectedVersion,
        templateVersion: resolvedTemplate,
        requestedTemplateVersion: requestedTemplate,
        pdfHash: hash,
        previousPdfHash: historicalHashRebaseAuthorized ? currentHash : '',
        recoveredPdfHash: historicalHashRebaseAuthorized ? hash : '',
        pdfStorageReference: storageReference,
        administrator: historicalHashRebaseAuthorized ? user.Username : '',
        recoveredAt: historicalHashRebaseAuthorized ? new Date().toISOString() : '',
        originalArtifactUnavailable: historicalHashRebaseAuthorized,
      },
    });
  } catch (error) {
    if (historicalHashRebaseAuthorized) {
      updateRow(getSheet('Certificados'), certificado, previousCertificateArtifact);
      updateRow(getSheet('Inscripciones'), inscripcion, previousEnrollmentArtifact);
    }
    throw error;
  }
  return {
    success: true,
    data: {
      CertificatePublicId: certificado.ID,
      CertificateVersion: expectedVersion,
      TemplateVersion: resolvedTemplate,
      PdfHash: hash,
      PdfStorageReference: storageReference,
      historicalHashRebased: historicalHashRebaseAuthorized,
    },
  };
}

function solicitudDescargaParaCliente(row) {
  return {
    ID: row.ID,
    CertificadoID: row.CertificadoID,
    InscripcionID: row.InscripcionID,
    Estado: row.Estado,
    FechaSolicitud: row.FechaSolicitud,
    FechaConfirmacion: row.FechaConfirmacion || '',
    Motivo: row.Motivo || '',
  };
}

function solicitarDescargaCertificado(user, { id, pdfHash, pdfStorageReference } = {}) {
  requireCertificateAdmin(user, 'CERTIFICATE_DOWNLOAD_REQUEST', { inscripcionId: id, canal: 'api' });
  const resolved = resolverCertificadoAdministrativo(id, user);
  if (!resolved) return { success: false, error: 'Certificado no encontrado.' };
  const certificado = resolved.certificado;
  const inscripcion = resolved.inscripcion;
  const estado = estadoNormalizadoCertificado(certificado);
  if (estado !== 'emitido' && estado !== 'enviado') {
    return { success: false, error: 'El certificado no est\u00e1 vigente para descarga.' };
  }
  const hash = String(pdfHash || '').trim().toLowerCase();
  const reference = String(pdfStorageReference || '').trim();
  if (!certificado.PdfHash || !certificado.PdfStorageReference) {
    return { success: false, error: 'El PDF oficial todav\u00eda no tiene hash y referencia inmutable registrados.' };
  }
  if (hash !== String(certificado.PdfHash).trim().toLowerCase() || reference !== String(certificado.PdfStorageReference)) {
    return { success: false, error: 'El artefacto solicitado no coincide con el PDF oficial registrado.' };
  }

  const sheet = getSheet('DescargasCertificados');
  const pendientes = sheetToObjects(sheet);
  var solicitud = pendientes.find(function(item) {
    return item.CertificadoID === certificado.ID
      && item.Usuario === user.Username
      && item.Estado === 'AUDIT_PENDING'
      && item.PdfHash === hash
      && item.PdfStorageReference === reference;
  });
  if (!solicitud) {
    const solicitudId = generateId('DLC');
    sheet.appendRow([
      solicitudId,
      certificado.ID,
      inscripcion.ID,
      user.Username,
      user.Rol,
      'AUDIT_PENDING',
      new Date().toISOString(),
      '',
      '',
      hash,
      reference,
      'panel',
    ]);
    solicitud = sheetToObjects(sheet).find(function(item) { return item.ID === solicitudId; });
  }

  registrarAuditoriaCertificado({
    certificadoId: certificado.CodigoCertificado,
    inscripcionId: inscripcion.ID,
    usuario: user.Username,
    rol: user.Rol,
    accion: 'CERTIFICATE_DOWNLOAD_REQUESTED',
    estadoAnterior: estado,
    estadoNuevo: 'AUDIT_PENDING',
    canal: 'panel',
    resultado: 'pendiente',
    metadatos: {
      requestId: solicitud.ID,
      certificateId: certificado.ID,
      pdfHash: hash,
      pdfStorageReference: reference,
    },
  });

  return {
    success: true,
    requestId: solicitud.ID,
    auditStatus: 'AUDIT_PENDING',
    data: certificadoParaCliente(certificado, inscripcion),
  };
}

function confirmarDescargaCertificado(user, { solicitudId, resultado, motivo } = {}) {
  requireCertificateAdmin(user, 'CERTIFICATE_DOWNLOAD_CONFIRM', { canal: 'api' });
  const estadoFinal = resultado === 'completado'
    ? 'AUDIT_CONFIRMED'
    : resultado === 'fallido' ? 'AUDIT_FAILED' : '';
  if (!estadoFinal) return { success: false, error: 'El resultado de descarga no es v\u00e1lido.' };
  const sheet = getSheet('DescargasCertificados');
  const solicitud = sheetToObjects(sheet).find(function(item) { return item.ID === solicitudId; });
  if (!solicitud) return { success: false, error: 'Solicitud de descarga no encontrada.' };
  if (solicitud.Estado === estadoFinal) {
    return { success: true, alreadyConfirmed: true, data: solicitudDescargaParaCliente(solicitud) };
  }
  if (solicitud.Estado !== 'AUDIT_PENDING') {
    return { success: false, error: 'La solicitud de descarga ya fue cerrada con otro resultado.' };
  }
  if (solicitud.Usuario !== user.Username) {
    return { success: false, error: 'Solo el administrador que inici\u00f3 la descarga puede confirmarla.' };
  }
  const certificados = sheetToObjects(getSheet('Certificados'));
  const certificado = certificados.find(function(item) { return item.ID === solicitud.CertificadoID; });
  const inscripciones = sheetToObjects(getSheet('Inscripciones'));
  const inscripcion = inscripciones.find(function(item) { return item.ID === solicitud.InscripcionID; });
  if (!certificado || !inscripcion) return { success: false, error: 'La solicitud perdi\u00f3 su referencia documental.' };
  const motivoSeguro = String(motivo || '').trim().slice(0, 500);

  registrarAuditoriaCertificado({
    certificadoId: certificado.CodigoCertificado,
    inscripcionId: inscripcion.ID,
    usuario: user.Username,
    rol: user.Rol,
    accion: estadoFinal === 'AUDIT_CONFIRMED' ? 'CERTIFICATE_DOWNLOAD_COMPLETED' : 'CERTIFICATE_DOWNLOAD_FAILED',
    estadoAnterior: 'AUDIT_PENDING',
    estadoNuevo: estadoFinal,
    canal: 'panel',
    resultado: estadoFinal === 'AUDIT_CONFIRMED' ? 'ok' : 'error',
    motivo: motivoSeguro,
    metadatos: {
      requestId: solicitud.ID,
      certificateId: certificado.ID,
      pdfHash: solicitud.PdfHash,
      pdfStorageReference: solicitud.PdfStorageReference,
    },
  });

  const ahora = new Date().toISOString();
  updateRow(sheet, solicitud, {
    Estado: estadoFinal,
    FechaConfirmacion: ahora,
    Motivo: motivoSeguro,
  });
  if (estadoFinal === 'AUDIT_CONFIRMED') {
    updateRow(getSheet('Inscripciones'), inscripcion, {
      EstadoEntrega: 'descargado',
      FechaEntregaCertificado: ahora,
      EntregadoPor: user.Username,
    });
  }
  const updated = sheetToObjects(sheet).find(function(item) { return item.ID === solicitud.ID; });
  return { success: true, auditStatus: estadoFinal, data: solicitudDescargaParaCliente(updated) };
}

function getDescargasPendientes(user, { limit } = {}) {
  requireCertificateAdmin(user, 'CERTIFICATE_PENDING_DOWNLOADS_READ', { canal: 'api' });
  const max = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const data = sheetToObjects(getSheet('DescargasCertificados'))
    .filter(function(item) { return item.Estado === 'AUDIT_PENDING'; })
    .sort(function(a, b) { return new Date(a.FechaSolicitud || 0) - new Date(b.FechaSolicitud || 0); })
    .slice(0, max)
    .map(solicitudDescargaParaCliente);
  return { success: true, data: data };
}

function actualizarEntregaCertificado(user, { id, estadoEntrega } = {}) {
  requireCertificateAdmin(user, 'CERTIFICATE_DELIVERY_UPDATE', { inscripcionId: id, canal: 'api' });
  const permitidos = ['descargado', 'compartido', 'enviado_whatsapp'];
  if (permitidos.indexOf(estadoEntrega) === -1) return { success: false, error: 'Estado de entrega no válido.' };
  const sheet = getSheet('Inscripciones');
  const row = sheetToObjects(sheet).find(function(r) { return r.ID === id; });
  if (!row) return { success: false, error: 'Inscripción no encontrada.' };
  if (['emitido', 'enviado', 'reemitido'].indexOf(estadoNormalizadoCertificado(row)) === -1) return { success: false, error: 'El certificado todavía no ha sido emitido o no está vigente.' };
  updateRow(sheet, row, {
    EstadoEntrega: estadoEntrega,
    FechaEntregaCertificado: new Date().toISOString(),
    EntregadoPor: user.Username,
  });
  registrarAuditoriaCertificado({
    certificadoId: row.CodigoCertificado,
    inscripcionId: id,
    usuario: user.Username,
    rol: user.Rol,
    accion: estadoEntrega === 'descargado' ? 'CERTIFICATE_DOWNLOADED' : 'CERTIFICATE_SHARED',
    estadoAnterior: row.EstadoEntrega || 'pendiente',
    estadoNuevo: estadoEntrega,
    canal: estadoEntrega === 'enviado_whatsapp' ? 'whatsapp' : 'panel',
    resultado: 'ok',
  });
  return { success: true };
}

function registrarGeneracionCertificado(user, { id } = {}) {
  requireCertificateAdmin(user, 'CERTIFICATE_GENERATE', { inscripcionId: id, canal: 'api' });
  const row = sheetToObjects(getSheet('Inscripciones')).find(function(r) { return r.ID === id; });
  if (!row) return { success: false, error: 'Inscripción no encontrada.' };
  if (['emitido', 'enviado', 'reemitido'].indexOf(estadoNormalizadoCertificado(row)) === -1) return { success: false, error: 'El certificado todavía no ha sido emitido o no está vigente.' };
  registrarAuditoriaCertificado({
    certificadoId: row.CodigoCertificado,
    inscripcionId: id,
    usuario: user.Username,
    rol: user.Rol,
    accion: 'CERTIFICATE_GENERATED',
    estadoAnterior: 'emitido',
    estadoNuevo: 'emitido',
    canal: 'panel',
    resultado: 'ok',
  });
  return { success: true };
}

function deleteIngresoSeguro(user, { id } = {}) {
  const vinculada = sheetToObjects(getSheet('Inscripciones')).find(function(ins) { return ins.IngresoID === id; });
  if (vinculada) return { success: false, error: 'No se puede eliminar un ingreso vinculado a una inscripción.' };
  return deleteIfOwner(user, 'Ingresos', id, 'Estado');
}

function enviarCertificadoEmail(user, { id, pdfBase64, mimeType, filename, email } = {}) {
  requireCertificateAdmin(user, 'CERTIFICATE_EMAIL_SEND', { inscripcionId: id, canal: 'email' });
  const sheet = getSheet('Inscripciones');
  const row = sheetToObjects(sheet).find(function(r) { return r.ID === id; });
  if (!row) return { success: false, error: 'Inscripción no encontrada.' };
  if (['emitido', 'enviado', 'reemitido'].indexOf(estadoNormalizadoCertificado(row)) === -1) return { success: false, error: 'El certificado todavía no ha sido emitido o no está vigente.' };
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
    registrarAuditoriaCertificado({
      certificadoId: row.CodigoCertificado,
      inscripcionId: id,
      usuario: user.Username,
      rol: user.Rol,
      accion: 'CERTIFICATE_DELIVERY_FAILED',
      estadoAnterior: row.EstadoEntrega || 'pendiente',
      estadoNuevo: row.EstadoEntrega || 'pendiente',
      canal: 'email',
      resultado: 'error',
      motivo: 'MailApp no pudo completar el envío.',
    });
    return { success: false, error: 'No se pudo enviar el correo. Revise la autorización de MailApp y vuelva a intentarlo.' };
  }
  updateRow(sheet, row, {
    EstadoEntrega: 'enviado_email',
    FechaEntregaCertificado: new Date().toISOString(),
    EntregadoPor: user.Username,
  });
  registrarAuditoriaCertificado({
    certificadoId: row.CodigoCertificado,
    inscripcionId: id,
    usuario: user.Username,
    rol: user.Rol,
    accion: row.EstadoEntrega === 'enviado_email' ? 'CERTIFICATE_RESENT' : 'CERTIFICATE_SENT',
    estadoAnterior: row.EstadoEntrega || 'pendiente',
    estadoNuevo: 'enviado_email',
    canal: 'email',
    resultado: 'ok',
  });
  return { success: true };
}

function getAuditoriaCertificados(user, { filtros = {} } = {}) {
  requireCertificateAdmin(user, 'CERTIFICATE_AUDIT_READ', { canal: 'api' });
  var data = sheetToObjects(getSheet('AuditoriaCertificados'));
  if (filtros.inscripcionId) data = data.filter(function(e) { return e.InscripcionID === filtros.inscripcionId; });
  if (filtros.certificadoId) data = data.filter(function(e) { return e.CertificadoID === filtros.certificadoId; });
  if (filtros.accion) data = data.filter(function(e) { return e.Accion === filtros.accion; });
  data.sort(function(a, b) { return new Date(b.FechaHora || 0) - new Date(a.FechaHora || 0); });
  var limit = Math.min(Math.max(Number(filtros.limit) || 100, 1), 500);
  return {
    success: true,
    data: data.slice(0, limit).map(function(e) {
      return {
        ID: e.ID,
        CertificadoID: e.CertificadoID || '',
        InscripcionID: e.InscripcionID || '',
        Usuario: e.Usuario || '',
        Rol: e.Rol || '',
        Accion: e.Accion || '',
        FechaHora: e.FechaHora || '',
        EstadoAnterior: e.EstadoAnterior || '',
        EstadoNuevo: e.EstadoNuevo || '',
        Canal: e.Canal || '',
        Resultado: e.Resultado || '',
        Motivo: e.Motivo || '',
      };
    }),
  };
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
  registrarAuditoriaCertificado({
    certificadoId: row.CodigoCertificado,
    inscripcionId: id,
    usuario: user.Username,
    rol: user.Rol,
    accion: 'AVAL_CONFIRMED',
    estadoAnterior: row.EstadoAval || 'pendiente',
    estadoNuevo: 'avalado',
    canal: 'panel_aval',
    resultado: 'ok',
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
  const sheet = getSheet('Inscripciones');
  const row = sheetToObjects(sheet).find(function(r) { return r.ID === id; });
  if (!row) return { success: false, error: 'Registro no encontrado.' };
  if (!isAdmin(user) && row.CreadoPor !== user.Username) return { success: false, error: 'No autorizado.' };
  if (certificadoProtegidoContraEliminacion(row)) {
    registrarAuditoriaCertificado({
      certificadoId: row.CodigoCertificado,
      inscripcionId: row.ID,
      usuario: user.Username,
      rol: user.Rol,
      accion: 'CERTIFICATE_DELETE_REJECTED',
      estadoAnterior: row.CertificateStatus || row.EstadoCertificado || 'emitido',
      estadoNuevo: row.CertificateStatus || row.EstadoCertificado || 'emitido',
      canal: 'panel',
      resultado: 'rechazado',
      motivo: 'La inscripción conserva un certificado histórico protegido.',
    });
    return {
      success: false,
      error: 'No puede eliminarse una inscripción con certificado emitido. Utilice anulación o corrección controlada.',
    };
  }
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

function objetosHojaSoloLectura(name) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet || !sheet.getLastRow() || !sheet.getLastColumn()) return [];
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(function(value) { return String(value || '').trim(); });
  return values.slice(1).map(function(row, index) {
    const item = { _row: index + 2 };
    headers.forEach(function(header, column) { if (header) item[header] = row[column]; });
    return item;
  }).filter(function(item) {
    return headers.some(function(header) {
      const value = item[header];
      return value !== '' && value !== null && value !== undefined;
    });
  });
}

function duplicadosNoVacios(values) {
  const counts = {};
  values.map(function(value) { return String(value || '').trim(); }).filter(Boolean).forEach(function(value) {
    counts[value] = (counts[value] || 0) + 1;
  });
  return Object.keys(counts).filter(function(value) { return counts[value] > 1; }).sort();
}

function conteoValores(values) {
  const result = {};
  values.forEach(function(value) {
    const key = String(value || '').trim() || '(vacío)';
    result[key] = (result[key] || 0) + 1;
  });
  return result;
}

function verificarIntegridadInscripcionesHistoricas() {
  const insSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Inscripciones');
  const inscripciones = insSheet ? leerFilasInscripcionesFisicas(insSheet).rows : [];
  const ingresos = objetosHojaSoloLectura('Ingresos');
  const pagos = objetosHojaSoloLectura('Pagos');
  const certificados = objetosHojaSoloLectura('Certificados');
  const ids = inscripciones.map(function(row) { return row.ID; });
  const codes = inscripciones.map(function(row) { return row.CodigoCertificado; })
    .concat(certificados.map(function(row) { return row.CodigoCertificado; }));
  return {
    soloLectura: true,
    filas: {
      inscripciones: inscripciones.length,
      ingresos: ingresos.length,
      pagos: pagos.length,
      certificados: certificados.length,
    },
    idsInscripcionDuplicados: duplicadosNoVacios(ids),
    idsInscripcionVacios: ids.filter(function(value) { return !String(value || '').trim(); }).length,
    codigosCertificadoDuplicados: duplicadosNoVacios(codes),
    codigosCertificadoUnicos: Array.from(new Set(codes.map(function(value) { return String(value || '').trim(); }).filter(Boolean))).sort(),
    referenciasPdf: Array.from(new Set(inscripciones.concat(certificados).map(function(row) {
      return String(row.PdfStorageReference || '').trim();
    }).filter(Boolean))).sort(),
    totalMontosInscripciones: inscripciones.reduce(function(total, row) { return total + (Number(row.Monto) || 0); }, 0),
    totalMontosIngresos: ingresos.reduce(function(total, row) { return total + (Number(row.Monto) || 0); }, 0),
    totalMontosPagos: pagos.reduce(function(total, row) { return total + (Number(row.Monto) || 0); }, 0),
    estadosPago: conteoValores(inscripciones.map(function(row) { return row.EstadoPago; })),
  };
}

function riesgoEstructuralInscripcion(row) {
  const reasons = [];
  const modalidad = String(row.Modalidad || '').trim().toLowerCase();
  if (modalidad && ['virtual','presencial','híbrida','hibrida','n/a'].indexOf(modalidad) === -1) reasons.push('modalidad_fuera_de_catalogo');
  if (String(row.Monto || '').trim() && !isFinite(Number(row.Monto))) reasons.push('monto_no_numerico');
  if (String(row._raw && row._raw.FechaInicio || '').trim() && !fechaSolo(row._raw.FechaInicio)) reasons.push('fecha_inicio_invalida');
  if (String(row._raw && row._raw.FechaFin || '').trim() && !fechaSolo(row._raw.FechaFin)) reasons.push('fecha_fin_invalida');
  if ((row.HistoricalFormulaFields || []).some(function(field) { return ['FechaInicio','FechaFin'].indexOf(field) !== -1; })) {
    reasons.push('fecha_con_formula');
  }
  if ((row.HistoricalUnmappedColumns || []).length) reasons.push('datos_en_columnas_no_reconocidas');
  const payment = String(row.EstadoPago || '').trim().toLowerCase();
  if (payment && ['pendiente','pagado','verificado','cancelado'].indexOf(payment) === -1) reasons.push('estado_pago_invalido');
  return reasons;
}

function diagnosticarInscripcionesHistoricas() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Inscripciones');
  if (!sheet) {
    return { soloLectura: true, fechaDiagnostico: new Date().toISOString(), error: 'No existe la hoja Inscripciones.', filas: [] };
  }
  const snapshot = filasInscripcionesDecoradas(sheet);
  const idCounts = {};
  snapshot.rows.forEach(function(row) {
    const id = String(row.ID || '').trim();
    if (id) idCounts[id] = (idCounts[id] || 0) + 1;
  });
  const services = objetosHojaSoloLectura('Servicios');
  const durationById = {}, durationByName = {};
  services.forEach(function(service) {
    if (service.ID) durationById[String(service.ID)] = service.Duracion || '';
    if (service.Nombre) durationByName[String(service.Nombre).trim().toLowerCase()] = service.Duracion || '';
  });
  const rows = snapshot.rows.map(function(source) {
    const row = decorarInscripcionHistorica(source, snapshot.schema, snapshot.keyCounts);
    const id = String(row.ID || '').trim();
    const duplicateId = Boolean(id && idCounts[id] > 1);
    const riskReasons = riesgoEstructuralInscripcion(row);
    const duration = durationById[String(row.ServicioID || '')]
      || durationByName[String(row.ServicioNombre || '').trim().toLowerCase()] || '';
    const required = [
      ['participante', row.ClienteNombre], ['identificación', row.ClienteID], ['curso', row.ServicioNombre],
      ['duración', duration], ['FechaInicio', row.FechaInicio], ['FechaFin', row.FechaFin], ['modalidad', row.Modalidad],
    ].filter(function(item) { return !String(item[1] || '').trim(); }).map(function(item) { return item[0]; });
    const safeLocator = Boolean(id && !duplicateId) || Boolean(row.HistoricalKey && !row.HistoricalAmbiguous);
    const critical = duplicateId || row.HistoricalAmbiguous || snapshot.schema.ambiguos.length > 0
      || row.HistoricalRowAmbiguousFields.length > 0 || riskReasons.length > 0;
    return {
      numeroFila: row._row,
      ID: id,
      idFalta: !id,
      idDuplicado: duplicateId,
      participante: row.ClienteNombre || '',
      identificacion: row.ClienteID || '',
      servicioCurso: row.ServicioNombre || '',
      FechaVenta: row.FechaCreacion || '',
      FechaInicio: row.FechaInicio || '',
      FechaFin: row.FechaFin || '',
      modalidad: row.Modalidad || '',
      codigoCertificado: row.CodigoCertificado || '',
      estadoCertificado: estadoNormalizadoCertificado(row),
      version: row.CertificateVersion || '',
      hash: row.PdfHash || '',
      referenciaPdf: row.PdfStorageReference || '',
      columnasFaltantes: snapshot.schema.faltantes.slice(),
      columnasAmbiguas: snapshot.schema.ambiguos.slice(),
      columnasNoReconocidasConDatos: row.HistoricalUnmappedColumns.slice(),
      camposConFormula: row.HistoricalFormulaFields.slice(),
      camposObligatoriosFaltantes: required,
      esHistorico: row.IsHistoricalRecord,
      criterioHistorico: row.HistoricalCriteria.slice(),
      actualizablePorID: Boolean(id && !duplicateId),
      necesitaClaveHistoricaAlternativa: !id,
      claveHistoricaDisponible: Boolean(row.HistoricalKey),
      ambigua: row.HistoricalAmbiguous || duplicateId,
      candidatoNormalizacion: row.IsHistoricalRecord && safeLocator && !critical,
      riesgoRevisionManual: critical || (!id && !row.HistoricalKey),
      motivosRiesgo: riskReasons.concat(row.HistoricalAmbiguous ? ['clave_historica_ambigua'] : [])
        .concat(duplicateId ? ['id_duplicado'] : [])
        .concat(snapshot.schema.ambiguos.length ? ['encabezados_ambiguos'] : [])
        .concat(row.HistoricalRowAmbiguousFields.length ? ['valores_duplicados_contradictorios'] : []),
    };
  });
  return {
    soloLectura: true,
    fechaDiagnostico: new Date().toISOString(),
    columnasFaltantes: snapshot.schema.faltantes.slice(),
    columnasAmbiguas: snapshot.schema.ambiguos.slice(),
    encabezadosDuplicadosOAlias: snapshot.schema.duplicados.slice(),
    resumen: {
      filas: rows.length,
      historicas: rows.filter(function(row) { return row.esHistorico; }).length,
      modernas: rows.filter(function(row) { return !row.esHistorico; }).length,
      candidatas: rows.filter(function(row) { return row.candidatoNormalizacion; }).length,
      revisionManual: rows.filter(function(row) { return row.riesgoRevisionManual; }).length,
    },
    integridad: verificarIntegridadInscripcionesHistoricas(),
    filas: rows,
  };
}

function administradorMigracionHistorica(administrador) {
  const candidates = [];
  const explicit = String(administrador || '').trim();
  if (explicit) candidates.push(explicit);
  try {
    const email = Session.getActiveUser().getEmail();
    if (email) candidates.push(String(email).trim());
  } catch (error) {}
  const configured = String(PropertiesService.getScriptProperties()
    .getProperty('HISTORICAL_INSCRIPTIONS_MIGRATION_ADMIN') || '').trim();
  if (configured) candidates.push(configured);
  const admins = objetosHojaSoloLectura('Usuarios').filter(function(user) {
    return String(user.Rol || '').trim().toLowerCase() === 'admin' && esVerdadero(user.Activo);
  });
  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i].toLowerCase();
    const match = admins.find(function(user) {
      return [user.ID, user.Username, user.Email].some(function(value) {
        return String(value || '').trim().toLowerCase() === candidate;
      });
    });
    if (match) return String(match.Username || match.Email || match.ID).trim();
  }
  return '';
}

function integridadComercialIgual(before, after) {
  return before.filas.inscripciones === after.filas.inscripciones
    && before.filas.ingresos === after.filas.ingresos
    && before.filas.pagos === after.filas.pagos
    && before.filas.certificados === after.filas.certificados
    && before.totalMontosInscripciones === after.totalMontosInscripciones
    && before.totalMontosIngresos === after.totalMontosIngresos
    && before.totalMontosPagos === after.totalMontosPagos
    && JSON.stringify(before.estadosPago) === JSON.stringify(after.estadosPago)
    && JSON.stringify(before.codigosCertificadoUnicos) === JSON.stringify(after.codigosCertificadoUnicos)
    && JSON.stringify(before.codigosCertificadoDuplicados) === JSON.stringify(after.codigosCertificadoDuplicados)
    && JSON.stringify(before.referenciasPdf) === JSON.stringify(after.referenciasPdf);
}

function migrarInscripcionesHistoricasAplicar(confirmacion, administrador) {
  const configured = PropertiesService.getScriptProperties().getProperty('HISTORICAL_INSCRIPTIONS_MIGRATION_CONFIRMATION');
  if (confirmacion !== 'MIGRATE_HISTORICAL_INSCRIPTIONS_ONCE'
      && configured !== 'MIGRATE_HISTORICAL_INSCRIPTIONS_ONCE') {
    throw new Error('Migración bloqueada: falta la confirmación explícita MIGRATE_HISTORICAL_INSCRIPTIONS_ONCE.');
  }
  const admin = administradorMigracionHistorica(administrador);
  if (!admin) throw new Error('Migración bloqueada: no se pudo identificar al administrador ejecutor.');
  return conBloqueoCertificados(function() {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Inscripciones');
    if (!sheet) throw new Error('No existe la hoja Inscripciones.');
    const diagnosisBefore = diagnosticarInscripcionesHistoricas();
    const integrityBefore = verificarIntegridadInscripcionesHistoricas();
    const diagnosisByRow = {};
    diagnosisBefore.filas.forEach(function(row) { diagnosisByRow[row.numeroFila] = row; });
    const requiredHeaders = ['ID','FechaInicio','FechaFin','Modalidad','CertificateVersion','TemplateVersion','PdfHash','PdfStorageReference'];
    const headersBefore = resolverEncabezadosInscripciones(sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]);
    asegurarColumnasInscripcion(sheet, requiredHeaders);
    const addedHeaders = requiredHeaders.filter(function(header) { return headersBefore.indices[header] === undefined; });
    const snapshot = filasInscripcionesDecoradas(sheet);
    const idsUsed = {};
    snapshot.rows.forEach(function(row) { if (row.ID) idsUsed[String(row.ID)] = true; });
    const modified = [], omitted = [], errors = [];

    snapshot.rows.forEach(function(row) {
      const initial = diagnosisByRow[row._row];
      if (!initial || !initial.esHistorico) {
        omitted.push({ fila: row._row, motivo: 'registro_moderno' });
        return;
      }
      if (!initial.candidatoNormalizacion || initial.ambigua || initial.riesgoRevisionManual) {
        omitted.push({ fila: row._row, motivo: 'revision_manual_requerida', detalles: initial.motivosRiesgo });
        return;
      }
      const changes = {}, previous = {};
      if (!String(row.ID || '').trim()) {
        if (String(row.CodigoCertificado || '').trim() || String(row.IngresoID || '').trim()) {
          omitted.push({ fila: row._row, motivo: 'id_ausente_con_relacion_existente' });
          return;
        }
        if (!row.HistoricalKey || row.HistoricalAmbiguous) {
          omitted.push({ fila: row._row, motivo: 'clave_historica_no_segura' });
          return;
        }
        const generatedId = 'INS_HIST_' + String(row.HistoricalKey).replace(/^HIST-/, '').slice(0, 20).toUpperCase();
        if (idsUsed[generatedId]) {
          omitted.push({ fila: row._row, motivo: 'colision_id_deterministico' });
          return;
        }
        changes.ID = generatedId;
        previous.ID = row._raw.ID || '';
      }
      ['FechaInicio','FechaFin'].forEach(function(field) {
        const raw = row._raw[field];
        if (raw === '' || raw === null || raw === undefined) return;
        const normalized = fechaSolo(raw);
        if (!normalized) return;
        if (!(typeof raw === 'string' && raw === normalized)) {
          changes[field] = normalized;
          previous[field] = raw;
        }
      });
      if (!Object.keys(changes).length) {
        omitted.push({ fila: row._row, motivo: 'sin_cambios_necesarios' });
        return;
      }
      try {
        actualizarFilaInscripcionFisica(sheet, row._row, changes);
        const persisted = filaInscripcionPorNumero(sheet, row._row);
        if (!persisted || !camposPersistidosCoinciden(persisted, changes)) {
          actualizarFilaInscripcionFisica(sheet, row._row, previous);
          throw new Error('La persistencia no pudo verificarse.');
        }
        try {
          registrarAuditoriaCertificado({
            certificadoId: persisted.CodigoCertificado || '',
            inscripcionId: persisted.ID || '',
            usuario: admin,
            rol: 'admin',
            accion: 'HISTORICAL_ENROLLMENT_NORMALIZED',
            estadoAnterior: persisted.EstadoCertificado || '',
            estadoNuevo: persisted.EstadoCertificado || '',
            canal: 'apps_script',
            resultado: 'ok',
            motivo: 'Normalización controlada de estructura histórica.',
            metadatos: { fila: row._row, campos: Object.keys(changes), valoresAnteriores: previous, valoresNuevos: changes },
          });
        } catch (auditError) {
          actualizarFilaInscripcionFisica(sheet, row._row, previous);
          throw auditError;
        }
        if (changes.ID) idsUsed[changes.ID] = true;
        modified.push({ fila: row._row, ID: persisted.ID || changes.ID || '', valoresAnteriores: previous, valoresNuevos: changes });
      } catch (error) {
        errors.push({ fila: row._row, error: String(error.message || error) });
      }
    });

    const integrityAfter = verificarIntegridadInscripcionesHistoricas();
    if (!integridadComercialIgual(integrityBefore, integrityAfter)) {
      throw new Error('La migración alteró una invariantes comercial y fue bloqueada. Restaure el respaldo y revise el reporte.');
    }
    return {
      aplicada: true,
      idempotente: true,
      confirmacion: 'MIGRATE_HISTORICAL_INSCRIPTIONS_ONCE',
      administrador: admin,
      fecha: new Date().toISOString(),
      filasRevisadas: snapshot.rows.length,
      columnasAgregadas: addedHeaders,
      filasModificadas: modified,
      filasOmitidas: omitted,
      errores: errors,
      advertencias: diagnosisBefore.resumen.revisionManual
        ? ['Existen filas que requieren revisión manual y fueron omitidas.'] : [],
      integridadAntes: integrityBefore,
      integridadDespues: integrityAfter,
    };
  });
}

// ─────────────────────────────────────────────
// SETUP INICIAL — Ejecutar una sola vez
// ─────────────────────────────────────────────

const CERTIFICATE_V3_MIGRATION_SCHEMAS = {
  Inscripciones: [
    'AvalTextoConfirmado','CertificateVersion','TemplateVersion','PdfHash','PdfStorageReference',
    'OriginalCertificateId','ReissuedCertificateId','CertificateStatus','IssuedAt','IssuedBy',
    'VoidedAt','VoidedBy','VoidReason','ReissueReason',
  ],
  Certificados: SHEET_HEADERS.Certificados,
  AuditoriaCertificados: SHEET_HEADERS.AuditoriaCertificados,
  DescargasCertificados: SHEET_HEADERS.DescargasCertificados,
};

function leerHojaMigracionV3(name) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) return { name: name, sheet: null, headers: [], rows: [], formulas: [] };
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (!lastRow || !lastColumn) return { name: name, sheet: sheet, headers: [], rows: [], formulas: [] };
  const range = sheet.getRange(1, 1, lastRow, lastColumn);
  const values = range.getValues();
  return {
    name: name,
    sheet: sheet,
    headers: values[0].map(function(value) { return String(value || '').trim(); }),
    rows: values.slice(1),
    formulas: range.getFormulas(),
  };
}

function objetosMigracionV3(snapshot) {
  return snapshot.rows.map(function(row, index) {
    const object = { _row: index + 2 };
    snapshot.headers.forEach(function(header, column) { object[header] = row[column]; });
    return object;
  }).filter(function(item) { return item[snapshot.headers[0]] !== '' && item[snapshot.headers[0]] !== undefined; });
}

function migrarCertificadosV3Diagnostico() {
  const snapshots = {};
  const columnasFaltantes = {};
  const formulas = {};
  const hojasFaltantes = [];
  Object.keys(CERTIFICATE_V3_MIGRATION_SCHEMAS).forEach(function(name) {
    const snapshot = leerHojaMigracionV3(name);
    snapshots[name] = snapshot;
    if (!snapshot.sheet) hojasFaltantes.push(name);
    columnasFaltantes[name] = CERTIFICATE_V3_MIGRATION_SCHEMAS[name].filter(function(header) {
      return snapshot.headers.indexOf(header) === -1;
    });
    formulas[name] = snapshot.formulas.reduce(function(total, row) {
      return total + row.filter(function(formula) { return !!String(formula || '').trim(); }).length;
    }, 0);
  });

  const inscripciones = objetosMigracionV3(snapshots.Inscripciones);
  const certificados = objetosMigracionV3(snapshots.Certificados);
  const codeOwners = {};
  function registerCode(code, owner, source) {
    const normalized = String(code || '').trim().toUpperCase();
    if (!normalized) return;
    if (!codeOwners[normalized]) codeOwners[normalized] = {};
    codeOwners[normalized][String(owner || source)] = true;
  }
  inscripciones.forEach(function(item) { registerCode(item.CodigoCertificado, item.ID, 'Inscripciones'); });
  certificados.forEach(function(item) { registerCode(item.CodigoCertificado, item.InscripcionID || item.ID, 'Certificados'); });
  const codigosDuplicados = Object.keys(codeOwners).filter(function(code) {
    return Object.keys(codeOwners[code]).length > 1;
  }).map(function(code) { return { codigo: code, propietarios: Object.keys(codeOwners[code]) }; });

  const estadosCompatibles = ['pendiente','en_proceso','emitido','enviado','anulado','reemitido','issued','sent','voided','reissued','descargado','compartido','enviado_email','enviado_whatsapp'];
  const emitidosSinCodigo = [];
  const emitidosSinFecha = [];
  const estadosInconsistentes = [];
  const certificadosQuePodrianRomperse = [];
  inscripciones.forEach(function(item) {
    const estado = String(item.CertificateStatus || item.EstadoCertificado || '').trim().toLowerCase();
    const emitido = ['emitido','enviado','anulado','reemitido','issued','sent','voided','reissued'].indexOf(estado) !== -1;
    const reasons = [];
    if (emitido && !String(item.CodigoCertificado || '').trim()) {
      emitidosSinCodigo.push(item.ID);
      reasons.push('sin_codigo');
    }
    if (emitido && !String(item.IssuedAt || item.FechaEmisionCertificado || '').trim()) {
      emitidosSinFecha.push(item.ID);
      reasons.push('sin_fecha_emision');
    }
    if (estado && estadosCompatibles.indexOf(estado) === -1) {
      estadosInconsistentes.push({ id: item.ID, estado: estado });
      reasons.push('estado_inconsistente');
    }
    if (emitido && !String(item.ClienteNombre || '').trim()) reasons.push('sin_participante');
    if (emitido && !String(item.ServicioNombre || '').trim()) reasons.push('sin_curso');
    if (reasons.length) certificadosQuePodrianRomperse.push({ id: item.ID, motivos: reasons });
  });

  return {
    soloLectura: true,
    fechaDiagnostico: new Date().toISOString(),
    registros: {
      inscripciones: inscripciones.length,
      certificados: certificados.length,
      auditoria: objetosMigracionV3(snapshots.AuditoriaCertificados).length,
      descargas: objetosMigracionV3(snapshots.DescargasCertificados).length,
    },
    hojasFaltantes: hojasFaltantes,
    columnasFaltantes: columnasFaltantes,
    formulas: formulas,
    codigosDuplicados: codigosDuplicados,
    emitidosSinCodigo: emitidosSinCodigo,
    emitidosSinFecha: emitidosSinFecha,
    estadosInconsistentes: estadosInconsistentes,
    certificadosQuePodrianRomperse: certificadosQuePodrianRomperse,
  };
}

function migrarCertificadosV3Aplicar(confirmacion) {
  const confirmacionConfigurada = PropertiesService.getScriptProperties()
    .getProperty('CERTIFICATES_V3_MIGRATION_CONFIRMATION');
  if (confirmacion !== 'APLICAR_CERTIFICADOS_V3' && confirmacionConfigurada !== 'APLICAR_CERTIFICADOS_V3') {
    throw new Error('Migraci\u00f3n bloqueada: configure o proporcione la confirmaci\u00f3n expl\u00edcita APLICAR_CERTIFICADOS_V3.');
  }
  const antes = migrarCertificadosV3Diagnostico();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const agregadas = {};
  Object.keys(CERTIFICATE_V3_MIGRATION_SCHEMAS).forEach(function(name) {
    var sheet = ss.getSheetByName(name);
    const schema = CERTIFICATE_V3_MIGRATION_SCHEMAS[name];
    if (!sheet) {
      sheet = ss.insertSheet(name);
      sheet.getRange(1, 1, 1, schema.length).setValues([schema]);
      agregadas[name] = schema.slice();
      return;
    }
    const lastColumn = sheet.getLastColumn();
    const headers = lastColumn ? sheet.getRange(1, 1, 1, lastColumn).getValues()[0] : [];
    const missing = schema.filter(function(header) { return headers.indexOf(header) === -1; });
    agregadas[name] = missing.slice();
    missing.forEach(function(header) {
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue(header);
    });
  });
  const despues = migrarCertificadosV3Diagnostico();
  const resumen = {
    aplicada: true,
    idempotente: true,
    fecha: new Date().toISOString(),
    columnasAgregadas: agregadas,
    formulasAntes: antes.formulas,
    formulasDespues: despues.formulas,
    diagnosticoPosterior: despues,
    rollback: 'Restaurar la copia de seguridad previa documentada en docs/migrations/CERTIFICATES_V3.md.',
  };
  Logger.log(JSON.stringify(resumen));
  return resumen;
}

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
      'admin', hashPassword(getBootstrapAdminPassword()), 'admin', true, new Date().toISOString(),
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

  Logger.log('Setup completado. No se imprimieron credenciales.');
  Logger.log('Elimine BOOTSTRAP_ADMIN_PASSWORD de Script Properties y cambie la contraseña temporal después del primer acceso.');
  return '✅ Setup exitoso';
}
