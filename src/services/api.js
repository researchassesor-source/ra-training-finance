import { SESSION_EXPIRED_MESSAGE, notifySessionExpired } from '../utils/sessionEvents'

function rejectApiError(message, token) {
  if (message === SESSION_EXPIRED_MESSAGE) notifySessionExpired(token)
  throw new Error(message)
}

async function call(action, params = {}, token = null, { timeoutMs = 0 } = {}) {
  const body = { action, ...params }
  if (token) body.token = token
  const controller = timeoutMs && typeof AbortController !== 'undefined' ? new AbortController() : null
  let timeout = null
  try {
    if (controller) timeout = setTimeout(() => controller.abort(), timeoutMs)
    // Todas las acciones pasan por POST para que el token y los datos sensibles
    // no queden expuestos en la URL, el historial o los registros del proxy.
    const res = await fetch('/api/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      ...(controller ? { signal: controller.signal } : {}),
    })
    if (!res.ok) {
      const error = new Error(`Error HTTP ${res.status}`)
      error.status = res.status
      throw error
    }
    let data
    try { data = await res.json() }
    catch { throw new Error('El servidor devolvió una respuesta inválida.') }
    if (!data.success) {
      const backendMessage = String(data.error || 'Error desconocido')
      if (backendMessage === 'Acción no reconocida.' || backendMessage === 'Acción no reconocida') {
        const error = new Error(
          `El backend activo no reconoce la acción "${action}". `
          + 'Actualice la versión desplegada de Apps Script antes de reactivar esta interfaz.',
        )
        error.code = 'BACKEND_ACTION_UNSUPPORTED'
        error.action = action
        throw error
      }
      rejectApiError(backendMessage, token)
    }
    return data
  } catch (error) {
    if (controller && error?.name === 'AbortError') {
      const timeoutError = new Error('La solicitud agotó el tiempo de espera. Puede haberse completado en el servidor; verifique el estado antes de iniciar una operación distinta.')
      timeoutError.code = 'API_REQUEST_TIMEOUT'
      throw timeoutError
    }
    throw error
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

const PDF_TRANSFER_CHUNK_BASE64 = 2097152
const PDF_TRANSFER_MAX_BASE64 = 16000000
const PDF_TRANSFER_DIRECT_SAFE_BASE64 = 3000000
const PDF_TRANSFER_TIMEOUT_MS = 60000

function newPdfUploadId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function pdfTooLargeForProxy(error) {
  return error?.status === 413 || /HTTP 413/.test(String(error?.message || ''))
}

async function uploadPdfBase64InChunks(kind, id, artifact, token, legacyAction) {
  const content = String(artifact?.pdfBase64 || '')
  if (!content || content.length > PDF_TRANSFER_MAX_BASE64 || content.length % 4 !== 0
    || !/^[A-Za-z0-9+/]+={0,2}$/.test(content)) {
    throw new Error('El PDF no está en Base64 válido o supera el máximo permitido de 12 MB.')
  }
  const uploadId = newPdfUploadId()
  const chunkCount = Math.ceil(content.length / PDF_TRANSFER_CHUNK_BASE64)
  const session = { kind, id, uploadId, chunkCount, versionId: artifact.versionId || artifact.certificateId || '' }
  try {
    for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
      const chunkBase64 = content.slice(chunkIndex * PDF_TRANSFER_CHUNK_BASE64, (chunkIndex + 1) * PDF_TRANSFER_CHUNK_BASE64)
      await call('guardarPdfPrivadoChunk', { ...session, chunkIndex, chunkBase64 }, token, { timeoutMs: PDF_TRANSFER_TIMEOUT_MS })
    }
    const finalizeParams = {
      ...session,
      pdfHash: artifact.pdfHash,
      templateVersion: artifact.templateVersion,
      certificateVersion: artifact.certificateVersion,
    }
    if (kind === 'certificate-migration') {
      finalizeParams.certificateId = artifact.certificateId
      finalizeParams.motivo = artifact.motivo
      finalizeParams.confirmacion = artifact.confirmacion
    }
    return await call('finalizarPdfPrivadoChunk', finalizeParams, token, { timeoutMs: PDF_TRANSFER_TIMEOUT_MS })
  } catch (error) {
    try {
      await call('cancelarPdfPrivadoChunk', session, token, { timeoutMs: 15000 })
    } catch { /* Si el backend aún no tiene las acciones nuevas, no hay sesión que limpiar. */ }
    if (error?.code === 'BACKEND_ACTION_UNSUPPORTED') {
      if (content.length <= PDF_TRANSFER_DIRECT_SAFE_BASE64) return call(legacyAction, { id, ...artifact }, token)
      const required = new Error('El PDF es demasiado grande para enviarlo de una vez y el backend Apps Script aún no tiene activa la transferencia segura por fragmentos; no se confirmó ningún cambio al certificado.')
      required.code = 'PDF_CHUNK_BACKEND_REQUIRED'
      throw required
    }
    throw error
  }
}

async function savePrivatePdf(kind, id, artifact, token, legacyAction) {
  const content = String(artifact?.pdfBase64 || '')
  if (content.length > PDF_TRANSFER_DIRECT_SAFE_BASE64) {
    return uploadPdfBase64InChunks(kind, id, artifact, token, legacyAction)
  }
  try {
    return await call(legacyAction, { id, ...artifact }, token)
  } catch (error) {
    if (!pdfTooLargeForProxy(error)) throw error
    return uploadPdfBase64InChunks(kind, id, artifact, token, legacyAction)
  }
}

async function readPrivatePdfInChunks(kind, params, token) {
  const first = await call('leerPdfPrivadoChunk', { kind, ...params, chunkIndex: 0 }, token, { timeoutMs: PDF_TRANSFER_TIMEOUT_MS })
  const totalBytes = Number(first.totalBytes)
  const totalChunks = Number(first.totalChunks)
  if (!Number.isSafeInteger(totalBytes) || totalBytes < 1 || totalBytes > 12000000
    || !Number.isInteger(totalChunks) || totalChunks < 1 || totalChunks > 8
    || first.chunkBytes !== 1572864 || totalChunks !== Math.ceil(totalBytes / first.chunkBytes)) {
    throw new Error('El backend devolvió metadatos incompletos o fuera de los límites para el PDF.')
  }
  const parts = [String(first.contentBase64 || '')]
  for (let chunkIndex = 1; chunkIndex < totalChunks; chunkIndex += 1) {
    const part = await call('leerPdfPrivadoChunk', { kind, ...params, chunkIndex }, token, { timeoutMs: PDF_TRANSFER_TIMEOUT_MS })
    if (part.chunkIndex !== chunkIndex || part.totalBytes !== totalBytes || part.totalChunks !== totalChunks
      || part.hash !== first.hash || part.reference !== first.reference || part.filename !== first.filename) {
      throw new Error('Los fragmentos recuperados no pertenecen a una misma versión del PDF.')
    }
    parts.push(String(part.contentBase64 || ''))
  }
  const contentBase64 = parts.join('')
  if (contentBase64.length !== Math.ceil(totalBytes / 3) * 4 || contentBase64.length > PDF_TRANSFER_MAX_BASE64) {
    throw new Error('La transferencia por fragmentos quedó incompleta; el PDF no se descargó.')
  }
  return { success: true, reference: first.reference, hash: first.hash, filename: first.filename, contentBase64 }
}

async function readPrivatePdf(legacyAction, legacyParams, kind, chunkParams) {
  const token = getToken()
  try {
    return await call(legacyAction, legacyParams, token)
  } catch (error) {
    if (!pdfTooLargeForProxy(error)) throw error
    return readPrivatePdfInChunks(kind, chunkParams, token)
  }
}

async function callPost(action, params = {}, token = null) {
  return call(action, params, token)
}

function getToken() {
  return localStorage.getItem('rat_token')
}

async function fiscalFetch(path, options = {}) {
  const token = getToken()
  const method = options.method || 'GET'
  // El token de sesión NUNCA viaja en la query string (quedaba filtrado en los Vercel
  // Logs y en el historial del navegador, p.ej. /api/fiscal/process?token=...) --
  // siempre por Authorization: Bearer, tanto en GET/descargas como en POST.
  const query = new URLSearchParams(options.query || {})
  const url = `${path}${query.toString() ? `?${query.toString()}` : ''}`
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  const fetchOptions = { method, headers }
  if (options.body) {
    headers['Content-Type'] = 'application/json'
    fetchOptions.body = JSON.stringify(options.body)
  }
  const res = await fetch(url, fetchOptions)
  if (options.blob) {
    if (!res.ok) {
      let message = `Error HTTP ${res.status}`
      try {
        const data = await res.json()
        message = data.error || message
      } catch { /* ignore */ }
      rejectApiError(message, token)
    }
    const blob = await res.blob()
    const disposition = res.headers.get('Content-Disposition') || ''
    const match = disposition.match(/filename="?([^";]+)"?/i)
    return { blob, filename: match ? match[1] : options.fallbackFilename }
  }
  let data
  try { data = await res.json() }
  catch { throw new Error('El servidor devolvió una respuesta inválida.') }
  if (!res.ok || data.success !== true) rejectApiError(data.error || `Error HTTP ${res.status}`, token)
  return data
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

  // Pública — sin token, usada por la página de verificación de certificados (QR)
  verificarCertificado: (id) =>
    call('verificarCertificado', { id }),

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
    // Un pago vinculado a un egreso puede marcarlo como 'pagado' en el backend
    bust('getPagos', 'getDashboard', 'getEgresos')
    return call('addPago', { pago }, getToken())
  },
  updatePago: (id, pago) => {
    bust('getPagos', 'getDashboard', 'getEgresos')
    return call('updatePago', { id, pago }, getToken())
  },
  deletePago: (id) => {
    bust('getPagos', 'getDashboard', 'getEgresos')
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
  deleteProyeccion: (id) => {
    bust('getProyecciones', 'getDashboard')
    return call('deleteProyeccion', { id }, getToken())
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
    bust('getUsuarios', 'getInstitucionesAval')
    return call('addUsuario', { usuario }, getToken())
  },
  updateUsuario: (id, usuario) => {
    bust('getUsuarios', 'getInstitucionesAval')
    return call('updateUsuario', { id, usuario }, getToken())
  },
  deleteUsuario: (id) => {
    bust('getUsuarios', 'getInstitucionesAval')
    return call('deleteUsuario', { id }, getToken())
  },

  getInstitucionesAval: () =>
    callCached('getInstitucionesAval', {}, getToken()),
  getInstitucionesMaestras: (filtros = {}) =>
    call('getInstitucionesMaestras', { filtros }, getToken()),
  getInstitucionMaestra: (id) =>
    call('getInstitucionMaestra', { id }, getToken()),
  getOpcionesInstitucionesMaestras: () =>
    callCached('getOpcionesInstitucionesMaestras', {}, getToken()),
  addInstitucionMaestra: (institucion, confirmarDuplicadoNombre = false) => {
    bust('getInstitucionesMaestras', 'getOpcionesInstitucionesMaestras', 'getInstitucionesAval', 'getConvenios')
    return call('addInstitucionMaestra', { institucion, confirmarDuplicadoNombre }, getToken())
  },
  updateInstitucionMaestra: (id, institucion, confirmarDuplicadoNombre = false) => {
    bust('getInstitucionesMaestras', 'getOpcionesInstitucionesMaestras', 'getInstitucionesAval', 'getConvenios')
    return call('updateInstitucionMaestra', { id, institucion, confirmarDuplicadoNombre }, getToken())
  },
  archivarInstitucionMaestra: (id) => {
    bust('getInstitucionesMaestras', 'getOpcionesInstitucionesMaestras', 'getInstitucionesAval', 'getConvenios')
    return call('archivarInstitucionMaestra', { id, confirmacion: 'ARCHIVAR_INSTITUCION' }, getToken())
  },
  addAutoridadInstitucion: (institucionId, autoridad) =>
    call('addAutoridadInstitucion', { institucionId, autoridad }, getToken()),
  updateAutoridadInstitucion: (id, autoridad) =>
    call('updateAutoridadInstitucion', { id, autoridad }, getToken()),
  archivarAutoridadInstitucion: (id) =>
    call('archivarAutoridadInstitucion', { id, confirmacion: 'ARCHIVAR_AUTORIDAD' }, getToken()),
  addActivoInstitucion: (institucionId, tipo, archivo, autoridadId = '') =>
    call('addActivoInstitucion', { institucionId, tipo, archivo, autoridadId }, getToken()),
  addDocumentoInstitucion: (documento) =>
    call('addDocumentoInstitucion', documento, getToken()),
  getArchivoInstitucionPrivado: (id) =>
    call('getArchivoInstitucionPrivado', { id }, getToken()),
  getCertificadosAval: (filtros = {}) =>
    call('getCertificadosAval', { filtros }, getToken()),
  buscarCertificadosParaAvalPosterior: (q) =>
    call('buscarCertificadosParaAvalPosterior', { q }, getToken()),
  getConveniosParaAval: (institucionId, convenioActualId = '') =>
    call('getConveniosParaAval', { institucionId, convenioActualId }, getToken()),
  configurarAvalPosteriorCertificado: (id, { institucionId, convenioId, motivo, ingresoAvalId, nuevoIngresoAval, sinCobroAutorizado }) => {
    bust('getInscripciones', 'getDashboard', 'getCertificadosAval', 'getIngresos')
    return call('configurarAvalPosteriorCertificado', {
      id, institucionId, convenioId, motivo, ingresoAvalId, nuevoIngresoAval, sinCobroAutorizado,
      confirmacion: 'CONFIGURAR_AVAL_POSTERIOR',
    }, getToken())
  },
  marcarAval: (id, datos = {}) => {
    bust('getInscripciones', 'getDashboard', 'getInstitucionesAval', 'getCertificadosAval')
    return call('marcarAval', { id, ...datos }, getToken())
  },
  corregirAvalConfirmado: (id, datos = {}) => {
    bust('getInscripciones', 'getInstitucionesAval', 'getCertificadosAval')
    return call('corregirAvalConfirmado', { id, ...datos, confirmacion: 'CORREGIR_AVAL_CONFIRMADO' }, getToken())
  },
  corregirIdentificacionAvalConfirmado: (id, datos = {}) => {
    bust('getInscripciones', 'getCertificadosAval', 'getHistorialCertificados')
    return call('corregirIdentificacionAvalConfirmado', {
      id, ...datos, confirmacion: 'CORREGIR_IDENTIFICACION_AVAL',
    }, getToken())
  },
  corregirNombreAvalConfirmado: (id, datos = {}) => {
    bust('getInscripciones', 'getCertificadosAval', 'getHistorialCertificados')
    return call('corregirNombreAvalConfirmado', {
      id, ...datos, confirmacion: 'CORREGIR_NOMBRE_AVAL',
    }, getToken())
  },
  emitirEntregableAval: (id) => call('emitirEntregableAval', { id }, getToken()),
  anularEntregableAval: (id, motivo) => call('anularEntregableAval', { id, motivo, confirmacion: 'ANULAR' }, getToken()),
  reemitirEntregableAval: (id, motivo) => call('reemitirEntregableAval', { id, motivo, confirmacion: 'REEMITIR' }, getToken()),
  guardarPdfEntregableAvalPrivado: (id, pdf) => savePrivatePdf('aval', id, pdf, getToken(), 'guardarPdfEntregableAvalPrivado'),
  leerPdfEntregableAvalPrivado: (id, versionId = '') => readPrivatePdf(
    'leerPdfEntregableAvalPrivado', { id, versionId }, 'aval', { id, versionId },
  ),
  enviarEntregableAvalEmail: (id, email) => call('enviarEntregableAvalEmail', { id, email }, getToken()),
  resolverEnvioEntregableAval: (id, resultado, motivo) =>
    call('resolverEnvioEntregableAval', { id, resultado, motivo, confirmacion: 'RECONCILIAR_ENVIO_AVAL' }, getToken()),

  getEstadoFirmasCertificado: () =>
    call('getEstadoFirmasCertificado', {}, getToken()),
  guardarDatosFirmanteCertificado: (nombre, cargo) =>
    call('guardarDatosFirmanteCertificado', { nombre, cargo, confirmacion: 'CONFIRMO_DATOS_OFICIALES_DE_FIRMA' }, getToken()),
  registrarFirmaOficialCertificado: (rol, pngBase64, confirmacion, version = 'v2') =>
    call('registrarFirmaOficialCertificado', { rol, pngBase64, confirmacion, version }, getToken()),
  activarPlantillaCertificadoV2: (confirmacion) =>
    call('activarPlantillaCertificadoV2', { confirmacion }, getToken()),
  activarPlantillaCertificadoV3: (confirmacion) =>
    call('activarPlantillaCertificadoV3', { confirmacion }, getToken()),
  // No cachear ni registrar el contenido: las rúbricas salen de Drive privado
  // solo durante la generación de un PDF nuevo por una sesión administradora.
  getFirmasOficialesCertificado: (options = {}) =>
    call('getFirmasOficialesCertificado', options, getToken()),

  getServicios: () =>
    callCached('getServicios', {}, getToken()),
  addServicio: (servicio) => {
    bust('getServicios', 'getInscripciones', 'getCalendario')
    return call('addServicio', { servicio }, getToken())
  },
  updateServicio: (id, servicio) => {
    bust('getServicios', 'getInscripciones', 'getCalendario')
    return call('updateServicio', { id, servicio }, getToken())
  },
  getCapacitadores: () => call('getCapacitadores', {}, getToken()),
  getIdentityIntegrityReport: () => call('getIdentityIntegrityReport', {}, getToken()),
  addCapacitador: (capacitador) => call('addCapacitador', { capacitador }, getToken()),
  updateCapacitador: (id, capacitador) => call('updateCapacitador', { id, capacitador }, getToken()),
  preflightCertificadoCapacitador: (servicioId) =>
    call('preflightCertificadoCapacitador', { servicioId }, getToken()),
  emitirCertificadoCapacitador: (servicioId) =>
    call('emitirCertificadoCapacitador', { servicioId }, getToken()),
  getCertificadoCapacitadorParaDescarga: (id) =>
    call('getCertificadoCapacitadorParaDescarga', { id }, getToken()),
  anularCertificadoCapacitador: (id, motivo) =>
    call('anularCertificadoCapacitador', { id, motivo, confirmacion: 'ANULAR' }, getToken()),
  reemitirCertificadoCapacitador: (id, motivo) =>
    call('reemitirCertificadoCapacitador', { id, motivo, confirmacion: 'REEMITIR' }, getToken()),

  getInscripciones: (filtros = {}) =>
    callCached('getInscripciones', { filtros }, getToken()),
  updateMoodleCredentials: (id, moodle) => {
    bust('getInscripciones')
    return call('updateMoodleCredentials', { id, moodle }, getToken())
  },
  registrarEnvioMoodle: (id) => {
    bust('getInscripciones')
    return call('registrarEnvioMoodle', { id }, getToken())
  },
  addInscripcion: (inscripcion) => {
    bust('getInscripciones', 'getDashboard', 'getCertificadosAval')
    return call('addInscripcion', { inscripcion }, getToken())
  },
  importarInscripcionesMasivo: ({ batchId, servicioId, participantes }) => {
    bust('getInscripciones', 'getIngresos', 'getDashboard', 'getCertificadosAval')
    return call('importarInscripcionesMasivo', { batchId, servicioId, participantes }, getToken())
  },
  updateInscripcion: (id, inscripcion, historicalKey = '') => {
    bust('getInscripciones', 'getIngresos', 'getDashboard', 'getCertificadosAval')
    return call('updateInscripcion', { id, historicalKey, inscripcion }, getToken())
  },
  verificarPagoInscripcion: async (id, correcciones = {}) => {
    bust('getInscripciones', 'getIngresos', 'getDashboard')
    // Registrar/verificar el pago es una operación financiera independiente.
    // La emisión SRI solo se inicia desde la acción explícita de facturación.
    return call('verificarPagoInscripcion', { id, ...correcciones }, getToken())
  },
  emitirCertificado: (id) => {
    bust('getInscripciones', 'getDashboard')
    return call('emitirCertificado', { id }, getToken())
  },
  anularCertificado: (id, motivo) => {
    bust('getInscripciones', 'getDashboard')
    return call('anularCertificado', { id, motivo, confirmacion: 'ANULAR' }, getToken())
  },
  reemitirCertificado: (id, motivo) => {
    bust('getInscripciones', 'getDashboard')
    return call('reemitirCertificado', { id, motivo, confirmacion: 'REEMITIR' }, getToken())
  },
  getCertificadoParaDescarga: (id, certificateId = '') =>
    call('getCertificadoParaDescarga', { id, certificateId }, getToken()),
  getHistorialCertificados: (id) =>
    call('getHistorialCertificados', { id }, getToken()),
  getCertificadoPendienteParaCompletar: (inscripcionId, certificateId) =>
    call('getCertificadoPendienteParaCompletar', { inscripcionId, certificateId }, getToken()),
  getCertificadoVersionParaDescarga: (inscripcionId, certificateId) =>
    call('getCertificadoVersionParaDescarga', { inscripcionId, certificateId }, getToken()),
  registrarArtefactoCertificado: (id, artifact) => {
    bust('getInscripciones')
    return call('registrarArtefactoCertificado', { id, ...artifact }, getToken())
  },
  guardarPdfCertificadoPrivado: (id, artifact) => {
    bust('getInscripciones')
    return savePrivatePdf('certificate', id, artifact, getToken(), 'guardarPdfCertificadoPrivado')
  },
  migrarPdfCertificadoPrivado: (id, artifact) => {
    bust('getInscripciones')
    return savePrivatePdf('certificate-migration', id, artifact, getToken(), 'migrarPdfCertificadoPrivado')
  },
  leerPdfCertificadoPrivado: (id) => readPrivatePdf(
    'leerPdfCertificadoPrivado', { id, certificateId: id }, 'certificate', { id, certificateId: id },
  ),
  solicitarDescargaCertificado: (id, artifact) =>
    call('solicitarDescargaCertificado', { id, ...artifact }, getToken()),
  confirmarDescargaCertificado: (solicitudId, resultado, motivo = '') => {
    bust('getInscripciones')
    return call('confirmarDescargaCertificado', { solicitudId, resultado, motivo }, getToken())
  },
  getDescargasPendientes: (limit = 100) =>
    call('getDescargasPendientes', { limit }, getToken()),
  registrarGeneracionCertificado: (id) =>
    call('registrarGeneracionCertificado', { id }, getToken()),
  actualizarEntregaCertificado: (id, estadoEntrega) => {
    bust('getInscripciones')
    return call('actualizarEntregaCertificado', { id, estadoEntrega }, getToken())
  },
  enviarCertificadoEmail: (id, { email } = {}) => {
    bust('getInscripciones')
    return callPost('enviarCertificadoEmail', { id, email }, getToken())
  },
  getAuditoriaCertificados: (filtros = {}) =>
    call('getAuditoriaCertificados', { filtros }, getToken()),
  deleteInscripcion: (id) => {
    bust('getInscripciones', 'getIngresos', 'getDashboard')
    return call('deleteInscripcion', { id }, getToken())
  },

  getFacturasFiscales: (filtros = {}) =>
    fiscalFetch('/api/fiscal/list', { query: filtros }),
  getFacturaFiscalStatus: (facturaId) =>
    fiscalFetch('/api/fiscal/status', { query: { facturaId } }),
  descargarDocumentoFiscal: (facturaId, tipo) =>
    fiscalFetch('/api/fiscal/document', {
      query: { facturaId, tipo },
      blob: true,
      fallbackFilename: `${tipo === 'XML_AUTORIZADO' ? 'factura' : 'ride'}_${facturaId}`,
    }),
  enviarFacturaFiscalEmail: (facturaId, email) =>
    fiscalFetch('/api/fiscal/email', { method: 'POST', body: { facturaId, email } }),
  generarLinksFacturaFiscal: (facturaId) =>
    fiscalFetch('/api/fiscal/share-document', { method: 'POST', body: { facturaId } }),
  procesarFacturaFiscal: (facturaId) =>
    fiscalFetch('/api/fiscal/process', { method: 'POST', body: { facturaId } }),
  cerrarEntregaFiscal: (facturaId) =>
    fiscalFetch('/api/fiscal/finalize-delivery', { method: 'POST', body: { facturaId } }),
  crearFacturaFiscalDesdeInscripcion: (inscripcionId) =>
    fiscalFetch('/api/fiscal/from-inscripcion', { method: 'POST', body: { inscripcionId } }),

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
    bust('getConvenios', 'getConveniosParaAval', 'getCertificadosAval', 'getInscripciones')
    return call('addConvenio', { convenio }, getToken())
  },
  updateConvenio: (id, convenio) => {
    bust('getConvenios', 'getConveniosParaAval', 'getCertificadosAval', 'getInscripciones')
    return call('updateConvenio', { id, convenio }, getToken())
  },
  deleteConvenio: (id) => {
    bust('getConvenios', 'getConveniosParaAval', 'getCertificadosAval', 'getInscripciones')
    return call('deleteConvenio', { id, confirmacion: 'ARCHIVAR_CONVENIO' }, getToken())
  },

  // ── Asistencia (timbradas) ──
  registrarTimbrada: (tipo, notas = '') =>
    call('registrarTimbrada', { tipo, notas }, getToken()),
  getAsistencia: (params = {}) =>
    call('getAsistencia', params, getToken()),
  getResumenSemanal: (params = {}) =>
    call('getResumenSemanal', params, getToken()),
  getReporteFlujosTrabajo: (params = {}) =>
    call('getReporteFlujosTrabajo', params, getToken()),
  getReporteAsistencia: (params = {}) =>
    call('getReporteAsistencia', params, getToken()),
  getResumenCertificaciones: (params = {}) =>
    call('getResumenCertificaciones', params, getToken()),
  deleteTimbrada: (id) =>
    call('deleteTimbrada', { id }, getToken()),

  // ── Flujos semanales de trabajo ──
  getFlujosSemana: (params = {}) =>
    call('getFlujosSemana', params, getToken()),
  addFlujoSemanal: (flujo) => {
    bust('getFlujosSemana', 'getReporteFlujosTrabajo')
    return call('addFlujoSemanal', { flujo }, getToken())
  },
  updateFlujoSemanal: (id, flujo) => {
    bust('getFlujosSemana', 'getReporteFlujosTrabajo')
    return call('updateFlujoSemanal', { id, flujo }, getToken())
  },
  deleteFlujoSemanal: (id) => {
    bust('getFlujosSemana', 'getReporteFlujosTrabajo')
    return call('deleteFlujoSemanal', { id }, getToken())
  },
  addActividadFlujo: (actividad) => {
    bust('getFlujosSemana', 'getReporteFlujosTrabajo')
    return call('addActividadFlujo', { actividad }, getToken())
  },
  updateActividadFlujo: (id, actividad) => {
    bust('getFlujosSemana', 'getReporteFlujosTrabajo')
    return call('updateActividadFlujo', { id, actividad }, getToken())
  },
  deleteActividadFlujo: (id) => {
    bust('getFlujosSemana', 'getReporteFlujosTrabajo')
    return call('deleteActividadFlujo', { id }, getToken())
  },
}
