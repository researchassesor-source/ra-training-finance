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
  const { action, token, serviceToken, ...params } = data;

  if (action === 'login') return handleLogin(params);
  // Endpoint público: verificación de certificados por QR, sin sesión requerida.
  if (action === 'verificarCertificado') return handleVerificarCertificado(params);

  // Llamadas servidor-a-servidor del orquestador fiscal (Vercel -> Apps Script), sin
  // sesión de usuario interactiva. Ver apps-script/Fiscal.gs — solo un allowlist
  // explícito de acciones acepta este camino, y solo si el secreto coincide con la
  // Script Property FISCAL_SERVICE_TOKEN (nunca hardcodeado, nunca logueado).
  // Llamadas servidor-a-servidor del CRM comercial (importCrmPurchase,
  // getCrmPurchaseStatus(es), markCrmCourseCompleted) -- mismo patron que el fiscal,
  // secreto propio (CRM_SERVICE_TOKEN) y allowlist propio.
  var user;
  if (serviceToken && isFiscalServiceAction_(action)) {
    user = validateFiscalServiceToken_(serviceToken);
    if (!user) return { success: false, error: 'Token de servicio fiscal inválido o no configurado.' };
  } else if (isCrmServiceAction_(action)) {
    // Sin fallback: las acciones comerciales CRM exigen SIEMPRE serviceToken
    // válido, aunque venga un token legacy (admin) co-presente en el mismo
    // payload -- ese token legacy nunca sustituye al serviceToken aquí.
    user = validateCrmServiceToken_(serviceToken);
    if (!user) return { success: false, error: 'Token de servicio CRM inválido o no configurado.' };
  } else {
    user = validateToken(token);
  }
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
    getInstitucionesMaestras: () => getInstitucionesMaestras(user, params),
    getInstitucionMaestra: () => getInstitucionMaestra(user, params),
    getOpcionesInstitucionesMaestras: () => getOpcionesInstitucionesMaestras(user, params),
    addInstitucionMaestra: () => addInstitucionMaestra(user, params),
    updateInstitucionMaestra: () => updateInstitucionMaestra(user, params),
    archivarInstitucionMaestra: () => archivarInstitucionMaestra(user, params),
    addAutoridadInstitucion: () => addAutoridadInstitucion(user, params),
    updateAutoridadInstitucion: () => updateAutoridadInstitucion(user, params),
    archivarAutoridadInstitucion: () => archivarAutoridadInstitucion(user, params),
    addActivoInstitucion: () => addActivoInstitucion(user, params),
    addDocumentoInstitucion: () => addDocumentoInstitucion(user, params),
    getArchivoInstitucionPrivado: () => getArchivoInstitucionPrivado(user, params),
    getCertificadosAval: () => getCertificadosAval(user, params),
    getConveniosParaAval: () => getConveniosParaAval(user, params),
    configurarAvalPosteriorCertificado: () => configurarAvalPosteriorCertificado(user, params),
    marcarAval:          () => marcarAval(user, params),
    corregirAvalConfirmado: () => corregirAvalConfirmado(user, params),
    corregirIdentificacionAvalConfirmado: () => corregirIdentificacionAvalConfirmado(user, params),
    emitirEntregableAval: () => emitirEntregableAval(user, params),
    anularEntregableAval: () => anularEntregableAval(user, params),
    reemitirEntregableAval: () => reemitirEntregableAval(user, params),
    resolverEnvioEntregableAval: () => resolverEnvioEntregableAval(user, params),
    guardarPdfEntregableAvalPrivado: () => guardarPdfEntregableAvalPrivado(user, params),
    leerPdfEntregableAvalPrivado: () => leerPdfEntregableAvalPrivado(user, params),
    getServicios:       () => getServicios(user, params),
    addServicio:        () => addServicio(user, params),
    updateServicio:     () => updateServicio(user, params),
    getCapacitadores:   () => getCapacitadores(user, params),
    getIdentityIntegrityReport: () => getIdentityIntegrityReport(user),
    addCapacitador:     () => addCapacitador(user, params),
    updateCapacitador:  () => updateCapacitador(user, params),
    preflightCertificadoCapacitador: () => preflightCertificadoCapacitador(user, params),
    emitirCertificadoCapacitador: () => emitirCertificadoCapacitador(user, params),
    getCertificadoCapacitadorParaDescarga: () => getCertificadoCapacitadorParaDescarga(user, params),
    anularCertificadoCapacitador: () => anularCertificadoCapacitador(user, params),
    reemitirCertificadoCapacitador: () => reemitirCertificadoCapacitador(user, params),
    getEstadoFirmasCertificado: () => getEstadoFirmasCertificado(user),
    guardarDatosFirmanteCertificado: () => guardarDatosFirmanteCertificado(user, params),
    registrarFirmaOficialCertificado: () => registrarFirmaOficialCertificado(user, params),
    activarPlantillaCertificadoV2: () => activarPlantillaCertificadoV2(user, params),
    activarPlantillaCertificadoV3: () => activarPlantillaCertificadoV3(user, params),
    getFirmasOficialesCertificado: () => getFirmasOficialesCertificado(user, params),
    getInscripciones:   () => getInscripciones(user, params),
    updateMoodleCredentials: () => updateMoodleCredentials(user, params),
    registrarEnvioMoodle: () => registrarEnvioMoodle(user, params),
    addInscripcion:     () => addInscripcion(user, params),
    updateInscripcion:  () => updateInscripcion(user, params),
    verificarPagoInscripcion: () => verificarPagoInscripcion(user, params),
    emitirCertificado:  () => emitirCertificado(user, params),
    anularCertificado:   () => anularCertificado(user, params),
    reemitirCertificado: () => reemitirCertificado(user, params),
    getCertificadoParaDescarga: () => getCertificadoParaDescarga(user, params),
    getHistorialCertificados: () => getHistorialCertificados(user, params),
    getCertificadoVersionParaDescarga: () => getCertificadoVersionParaDescarga(user, params),
    registrarArtefactoCertificado: () => registrarArtefactoCertificado(user, params),
    guardarPdfCertificadoPrivado: () => guardarPdfCertificadoPrivado(user, params),
    leerPdfCertificadoPrivado: () => leerPdfCertificadoPrivado(user, params),
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
    deleteConvenio:     () => archivarConvenio(user, params),
    getCalendario:        () => getCalendario(user, params),
    deleteInscripcion:    () => deleteInscripcion(user, params),
    registrarTimbrada:    () => registrarTimbrada(user, params),
    getAsistencia:        () => getAsistencia(user, params),
    getResumenSemanal:    () => getResumenSemanal(user, params),
    getFlujosSemana:      () => getFlujosSemana(user, params),
    getReporteFlujosTrabajo: () => getReporteFlujosTrabajo(user, params),
    getReporteAsistencia: () => getReporteAsistencia(user, params),
    getResumenCertificaciones: () => getResumenCertificaciones(user, params),
    addFlujoSemanal:      () => addFlujoSemanal(user, params),
    updateFlujoSemanal:   () => updateFlujoSemanal(user, params),
    deleteFlujoSemanal:   () => deleteFlujoSemanal(user, params),
    migrarActividadesFlujoV2: () => migrarActividadesFlujoV2(user, params),
    addActividadFlujo:    () => addActividadFlujo(user, params),
    updateActividadFlujo: () => updateActividadFlujo(user, params),
    deleteActividadFlujo: () => deleteRecord(user, 'ActividadesFlujo', params, false),
    deleteTimbrada:       () => deleteTimbrada(user, params),
    // Módulo fiscal SRI — ver apps-script/Fiscal.gs
    migrarModuloFiscal:          () => migrarModuloFiscal(user, params),
    migrarCatalogoFiscalV2:      () => migrarCatalogoFiscalV2(user, params),
    getConfiguracionFiscal:      () => obtenerConfiguracionFiscalActiva(user, params),
    confirmarValidacionTributariaFiscal: () => confirmarValidacionTributariaFiscal(user, params),
    verificarConflictoSerieFiscal: () => verificarConflictoSerieFiscal(user, params),
    crearBorradorFactura:        () => crearBorradorFactura(user, params),
    reservarSecuencialFiscal:    () => reservarSecuencialFiscal(user, params),
    transicionEstadoFactura:     () => transicionEstadoFactura(user, params),
    getFacturasFiscales:         () => getFacturasFiscales(user, params),
    getAuditoriaFiscal:          () => getAuditoriaFiscal(user, params),
    getFacturaFiscalCompleta:       () => getFacturaFiscalCompleta(user, params),
    listarFacturasPendientesDePolling: () => listarFacturasPendientesDePolling(user, params),
    reanudarPollingFactura:         () => reanudarPollingFactura(user, params),
    reabrirFacturaRechazadaParaCorreccion: () => reabrirFacturaRechazadaParaCorreccion(user, params),
    recuperarFacturaRechazadaPorIdentificacionReceptor: () => recuperarFacturaRechazadaPorIdentificacionReceptor(user, params),
    recuperarFacturaRechazadaPorFechaEmisionExtemporanea: () => recuperarFacturaRechazadaPorFechaEmisionExtemporanea(user, params),
    backfillSriPaymentCodeFacturaAutorizada: () => backfillSriPaymentCodeFacturaAutorizada(user, params),
    guardarRideFiscal:              () => guardarRideFiscal(user, params),
    getDocumentoFiscalParaDescarga: () => getDocumentoFiscalParaDescarga(user, params),
    enviarFacturaFiscalEmail:       () => enviarFacturaFiscalEmail(user, params),
    cerrarEntregaFiscal:            () => cerrarEntregaFiscal(user, params),
    // Modulo comercial CRM (aditivo) -- ver seccion MODULO COMERCIAL CRM
    importCrmPurchase:        () => importCrmPurchase(user, params),
    verificarPagoCompraCrm:   () => verificarPagoCompraCrm(user, params),
    getCrmPurchaseStatus:     () => getCrmPurchaseStatus(user, params),
    getCrmPurchaseStatuses:   () => getCrmPurchaseStatuses(user, params),
    markCrmCourseCompleted:   () => markCrmCourseCompleted(user, params),
    getCrmEnrollmentCommerceState:  () => getCrmEnrollmentCommerceState(user, params),
    getCrmEnrollmentCommerceStates: () => getCrmEnrollmentCommerceStates(user, params),
    enviarEntregableAvalEmail: () => enviarEntregableAvalEmail(user, params),
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
  Usuarios:         ['ID','Nombre','Email','Username','PasswordHash','Rol','Activo','FechaCreacion','InstitucionAval','Roles','InstitucionAvalID'],
  Ingresos:         ['ID','Fecha','Tipo','Modalidad','Concepto','Cliente','ContratoID','Monto','MetodoPago','Estado','Notas','CreadoPor','FechaCreacion','ClienteTelefono','Referencia'],
  Egresos:          ['ID','Fecha','Categoria','Concepto','Proveedor','Monto','Estado','AprobadoPor','FechaAprobacion','Notas','CreadoPor','FechaCreacion','ProveedorIdentificacion','FacturaCompraNumero','AutorizacionCompra','FechaEmisionFactura','BaseImponible0','BaseImponible15','IvaCompra','FormaPagoCompra','ReferenciaPagoCompra'],
  Pagos:            ['ID','Fecha','Tipo','Beneficiario','Concepto','Referencia','Monto','MetodoPago','EgresoID','ContratoID','Estado','Notas','CreadoPor','FechaCreacion'],
  Contratos:        ['ID','Tipo','Nombre','Concepto','ValorTotal','FechaInicio','FechaFin','Estado','Notas','CreadoPor','FechaCreacion'],
  Proyecciones:     ['ID','Evento','Tipo','FechaEstimada','MontoProyectado','MontoReal','Estado','Notas','CreadoPor','FechaCreacion'],
  Categorias:       ['ID','Nombre','Tipo','Activo'],
  Servicios:        ['ID','Nombre','Tipo','Modalidad','Precio','Duracion','Descripcion','Activo','FechaCreacion','FechaEvento','FechaFinEvento','LugarEvento','Capacitador','EstadoEvento','TipoCertificado','CapacitadorID'],
  Capacitadores:    ['ID','Nombre','Identificacion','Resumen','Activo','CreadoPor','CreadoEn','ActualizadoPor','ActualizadoEn','TipoIdentificacion'],
  Inscripciones:    ['ID','ClienteNombre','ClienteID','ClienteTipoIdentificacion','ClienteEmail','ClienteTelefono','ServicioID','ServicioNombre','Modalidad','FechaInicio','Monto','MetodoPago','RazonSocial','RUC','TipoIdentificacionFactura','DireccionFactura','EstadoPago','EstadoCertificado','IngresoID','Notas','CreadoPor','FechaCreacion','FechaEmisionCertificado','RequiereAvalExterno','EstadoAval','AvalReferencia','FechaAval','ValorAval','FechaFin','NumeroComprobante','FechaPago','FechaVerificacionPago','VerificadoPor','InstitucionAval','CodigoCertificado','EmitidoPor','EstadoEntrega','FechaEntregaCertificado','EntregadoPor','AvalEnlaceExterno','AvalCodigoExterno','AvalTextoConfirmado','CertificateVersion','TemplateVersion','PdfHash','PdfStorageReference','OriginalCertificateId','ReissuedCertificateId','CertificateStatus','IssuedAt','IssuedBy','VoidedAt','VoidedBy','VoidReason','ReissueReason',
                     // Modulo comercial CRM (aditivo) -- ver seccion MODULO COMERCIAL CRM.
                     // Insertadas ANTES de CRMEnrollmentID/CRMContactID/CRMCourseID/Origen a
                     // proposito: appsScriptCrmHandoff.test.js fija esas 4 como las ULTIMAS
                     // columnas de la hoja; agregar aqui en vez de al final preserva ese
                     // contrato exacto. Vacias para todo registro legacy/manual o CRM sin
                     // oferta comercial: nunca cambia su comportamiento actual.
                     // Acceso al aula virtual: solo el rol Moodle y administración
                     // pueden gestionar estos campos. Se mantienen separados de
                     // pagos, certificados y facturación.
                     'CertificateType',
                     'MoodleUsername','MoodlePassword','MoodleUrl','MoodleStatus','MoodleLoadedBy','MoodleLoadedAt','MoodleLastSentAt','MoodleNotes',
                     'CRMOfferType','CRMParentOrderID','CRMCompletionStatus','CRMCompletedAt',
                     // Enlace canónico aditivo a la ficha maestra. InstitucionAval se
                     // conserva como snapshot legible para registros históricos y consumidores existentes.
                      'InstitucionID','ConvenioID','AvalInstitucionID','AvalConvenioID','AvalBaseTipoAplicado','AvalMontoBase','AvalPorcentajeAplicado','AvalMontoCalculado','AvalConfirmadoPor',
                      'CRMEnrollmentID','CRMContactID','CRMCourseID','Origen'],
  Sesiones:         ['Token','Username','UserID','Rol','Nombre','Expira','Roles'],
  ConfigPagos:      ['ID','Nombre','Tipo','Detalles','Instrucciones','Activo','FechaCreacion'],
  Convenios:        ['ID','Organizacion','Representante','Cargo','Objeto','ObligacionesRA','ObligacionesAliado','Vigencia','FechaInicio','FechaFin','Estado','Notas','CreadoPor','FechaCreacion','InstitucionID','FechaFirma','ArchivadoPor','ArchivadoEn','PorcentajeAval','BaseCalculoAval'],
  Instituciones:    ['ID','Nombre','NombreLegal','NombreComercial','Siglas','Identificacion','TipoIdentificacion','Tipo','Telefono','Email','Direccion','Ciudad','Provincia','SitioWeb','Estado','Notas','CreadoPor','CreadoEn','ActualizadoPor','ActualizadoEn','ArchivadoPor','ArchivadoEn'],
  AutoridadesInstitucion: ['ID','InstitucionID','Nombre','Identificacion','TipoIdentificacion','Cargo','Funcion','EsRepresentanteLegal','FirmaConvenios','FirmaCertificados','FechaInicio','FechaFin','Estado','Notas','CreadoPor','CreadoEn','ActualizadoPor','ActualizadoEn','ArchivadoPor','ArchivadoEn'],
  ActivosInstitucionales: ['ID','InstitucionID','AutoridadID','Tipo','NombreArchivo','MimeType','DriveFileID','Sha256','TamanoBytes','Version','Estado','CreadoPor','CreadoEn'],
  DocumentosInstitucionales: ['ID','InstitucionID','ConvenioID','Tipo','NombreArchivo','MimeType','DriveFileID','Sha256','TamanoBytes','FechaDocumento','Notas','Estado','CreadoPor','CreadoEn'],
  AuditoriaInstituciones: ['ID','EntidadTipo','EntidadID','Accion','Usuario','Rol','FechaHora','EstadoAnterior','EstadoNuevo','Metadatos'],
  Asistencia:       ['ID','Username','Nombre','Tipo','Timestamp','Fecha','Notas','FechaCreacion'],
  FlujosSemanales:  ['ID','Username','NombreUsuario','Semana','FechaInicio','FechaFin','TotalHorasPlan','Estado','Notas','CreadoPor','FechaCreacion'],
  ActividadesFlujo: ['ID','FlujoID','Username','Titulo','Descripcion','DescripcionFormato','DiaSemana','HorasEstimadas','Estado','HorasReales','Notas','Checklist','Evidencia','Imagenes','EstadoRevision','HorasAprobadas','FeedbackRevision','EvidenciaRevision','ImagenesRevision','RevisadoPor','RevisadoEn','ReprogramadoDesde','ReprogramadoPara','CompletadoEn','FechaCreacion'],
  AuditoriaCertificados: ['ID','CertificadoID','InscripcionID','Usuario','Rol','Accion','FechaHora','EstadoAnterior','EstadoNuevo','Canal','Resultado','Motivo','Metadatos'],
  AuditoriaMoodle:   ['ID','InscripcionID','Usuario','Rol','Accion','FechaHora','Resultado','Metadatos'],
  Certificados: ['ID','InscripcionID','CodigoCertificado','CertificateVersion','TemplateVersion','PdfHash','PdfStorageReference','OriginalCertificateId','ReplacesCertificateId','ReissuedCertificateId','CertificateStatus','IssuedAt','IssuedBy','VoidedAt','VoidedBy','VoidReason','ReissueReason','CreatedAt','CertificateType','CertificatePreparedAt','DocumentSnapshot','DocumentSnapshotHash'],
  CertificadosProfesionales: ['ID','CapacitadorID','ServicioID','Rol','Nombre','Identificacion','Resumen','ServicioNombre','Duracion','Modalidad','FechaInicio','FechaFin','Lugar','CodigoCertificado','CertificateVersion','TemplateVersion','PdfHash','PdfStorageReference','OriginalCertificateId','ReissuedCertificateId','CertificateStatus','IssuedAt','IssuedBy','VoidedAt','VoidedBy','VoidReason','ReissueReason','CreatedAt','TipoIdentificacion','ReplacesCertificateId','CertificatePreparedAt','DocumentSnapshot','DocumentSnapshotHash'],
  DescargasCertificados: ['ID','CertificadoID','InscripcionID','Usuario','Rol','Estado','FechaSolicitud','FechaConfirmacion','Motivo','PdfHash','PdfStorageReference','Canal'],
  // Modulo comercial CRM (aditivo). Una compra = una fila, identidad CRMOrderID.
  // FinanceInscripcionID apunta a la UNICA inscripcion academica del enrollment
  // (compartida entre INSTITUTIONAL y su AVAL_UPGRADE -- nunca duplicada).
  CRMCompras: ['ID','CRMOrderID','CRMEnrollmentID','FinanceInscripcionID','CRMContactID','CRMCourseID','OfferType','ParentCRMOrderID','Amount','PaymentStatus','NumeroComprobante','FechaPago','FechaVerificacionPago','VerificadoPor','CreatedAt','UpdatedAt'],
  // Segundo entregable (certificado avalado externamente) para compras FULL.
  // Hoja SEPARADA, vinculada por InscripcionID -- nunca una segunda fila en
  // Certificados, para no romper resolvers que asumen un certificado principal por
  // inscripcion (asegurarRegistroCertificado, buscarCertificadoPublico,
  // resolverCertificadoAdministrativo).
  EntregablesAval: ['ID','InscripcionID','EstadoValidacionExterna','ReferenciaExterna','EnlaceExterno','CodigoExterno','PdfHash','PdfStorageReference','EstadoEntregaFinal','FechaEntregaFinal','CreatedAt','UpdatedAt','CodigoCertificado','CertificateVersion','TemplateVersion','CertificateStatus','IssuedAt','IssuedBy','OriginalCertificateId','ReplacesCertificateId','ReissuedCertificateId','VoidedAt','VoidedBy','VoidReason','ReissueReason',
    'CertificateInstitutionId','CertificateAgreementId','CertificateInstitutionName','CertificateInstitutionLegalName','CertificateInstitutionSiglas','CertificateInstitutionIdentification','CertificateInstitutionIdentificationType','CertificateInstitutionCity','CertificateInstitutionProvince','CertificateInstitutionAddress','CertificateInstitutionWebsite',
    'CertificateAuthorityId','CertificateAuthorityName','CertificateAuthorityIdentification','CertificateAuthorityIdentificationType','CertificateAuthorityRole','CertificateAuthorityFunction','CertificateAuthoritySignatureAssetId','CertificateAuthoritySignatureSha256',
    'CertificateInstitutionLogoAssetId','CertificateInstitutionLogoSha256','CertificateInstitutionSealAssetId','CertificateInstitutionSealSha256','CertificateAgreementObject','CertificateAgreementSignedAt','CertificateResolutionDocumentId','CertificateResolutionName','CertificateResolutionDate','CertificateResolutionNotes',
    'CertificateManagerName','CertificateManagerTitle','CertificateManagerSignatureSha256','CertificatePreparedAt','DocumentSnapshot','DocumentSnapshotHash'],
  // Módulo fiscal SRI (feature/sri-integration-production-ready) — ver docs/fiscal/DATA_MODEL.md
  FacturasFiscales: ['ID','Environment','Status','InscripcionID','IdempotencyKey','DocumentType','IssueDate','Timezone','IssuerRuc','Establishment','EmissionPoint','Sequential','DocumentNumber','AccessKey','NumericCode','BuyerIdentificationType','BuyerIdentification','BuyerName','BuyerEmail','BuyerAddress','SubtotalWithoutTax','Subtotal0','SubtotalTaxed','DiscountCents','TaxTotal','GrandTotal','Currency','PaymentMethodInternal','SriPaymentCode','XmlVersion','SoftwareProviderMode','SoftwareProviderRuc','XmlGeneratedReference','XmlSignedReference','XmlAuthorizedReference','RideReference','Sha256Generated','Sha256Signed','Sha256Authorized','Sha256Ride','SriReceptionStatus','SriAuthorizationStatus','AuthorizationNumber','AuthorizationDate','LastSriMessage','RetryCount','CreatedBy','CreatedAt','UpdatedAt','AuthorizedAt','DeliveredAt','LastPolledAt','NextPollAt','XmlAuthorizedContent','ReviewFlag','ReviewReason'],
  FacturaItems: ['ID','FacturaID','Codigo','Descripcion','Cantidad','PrecioUnitarioCents','DescuentoCents','TaxRateBasisPoints','SriTaxCode','BaseCents','TotalCents','CatalogVersion','ConfirmedBy','CreatedAt'],
  SecuenciaFiscal: ['ID','Environment','Establishment','EmissionPoint','DocumentType','LastSequential','UpdatedAt'],
  AuditoriaFiscal: ['ID','FacturaID','Usuario','Rol','Accion','FechaHora','EstadoAnterior','EstadoNuevo','Canal','Resultado','Motivo','Metadatos'],
  ConfiguracionFiscal: ['ID','CodigoInterno','Descripcion','TaxRateBasisPoints','SriTaxCode','Activo','Version','ActualizadoPor','ActualizadoEn','ValidacionTributaria','ValidadoPor','ValidadoEn','MotivoValidacion','TestOnly'],
};

const CERTIFICATE_TEMPLATE_VERSION = 'ra-canva-2026-v1';
const CERTIFICATE_SECURITY_TEMPLATE_VERSION = 'ra-security-2026-v2';
const CERTIFICATE_SECURITY_TEMPLATE_V3_VERSION = 'ra-security-2026-v3';
const CERTIFICATE_INSTITUTIONAL_AVAL_TEMPLATE = 'ra-institutional-aval-2026';
const CERTIFICATE_V2_ACTIVE_PROPERTY = 'CERTIFICATE_V2_ACTIVE';
const CERTIFICATE_V3_ACTIVE_PROPERTY = 'CERTIFICATE_V3_ACTIVE';
const CERTIFICATE_MANAGER_NAME_PROPERTY = 'CERTIFICATE_MANAGER_NAME';
const CERTIFICATE_MANAGER_TITLE_PROPERTY = 'CERTIFICATE_MANAGER_TITLE';

function propiedadFirmaCertificado_(rol, version) {
  const value = String(rol || '').trim().toLowerCase();
  const suffix = String(version || 'v2').toLowerCase() === 'v3' ? 'V3_' : '';
  if (value === 'director') return 'CERTIFICATE_' + suffix + 'DIRECTOR_SIGNATURE_FILE_ID';
  if (value === 'manager') return 'CERTIFICATE_' + suffix + 'MANAGER_SIGNATURE_FILE_ID';
  throw new Error('Rol de firma desconocido.');
}

function sha256BytesCertificado_(bytes) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes)
    .map(function(byte) { return ('0' + (byte & 255).toString(16)).slice(-2); }).join('');
}

function snapshotDocumentalCertificado_(tipo, datos) {
  const serializado = JSON.stringify({ schemaVersion: 1, tipo: String(tipo || ''), datos: datos || {} });
  return {
    DocumentSnapshot: serializado,
    DocumentSnapshotHash: sha256BytesCertificado_(Utilities.newBlob(serializado, 'text/plain').getBytes()),
  };
}

function leerSnapshotDocumentalCertificado_(row) {
  const serialized = String(row && row.DocumentSnapshot || '').trim();
  const expectedHash = String(row && row.DocumentSnapshotHash || '').trim().toLowerCase();
  if (!serialized || !/^[a-f0-9]{64}$/.test(expectedHash)) return null;
  const actualHash = sha256BytesCertificado_(Utilities.newBlob(serialized, 'text/plain').getBytes());
  if (actualHash !== expectedHash) return null;
  try {
    const parsed = JSON.parse(serialized);
    return parsed && parsed.schemaVersion === 1 && parsed.datos && typeof parsed.datos === 'object'
      ? parsed : null;
  } catch (error) { return null; }
}

function identificacionDocumentalDifiere_(documento, inscripcion, tipoSnapshot) {
  const snapshot = leerSnapshotDocumentalCertificado_(documento);
  // Un snapshot presente pero sin integridad verificable tampoco puede habilitar un envío.
  if (!snapshot && String(documento && documento.DocumentSnapshot || '').trim()) return true;
  if (!snapshot || snapshot.tipo !== tipoSnapshot) return false;
  const participante = tipoSnapshot === 'aval_institucional' ? snapshot.datos.participante : snapshot.datos;
  return Boolean(participante && (
    String(participante.ClienteID || '') !== String(inscripcion.ClienteID || '')
    || String(participante.ClienteTipoIdentificacion || '') !== String(inscripcion.ClienteTipoIdentificacion || '')
  ));
}

function huellasFirmasOficialesCertificado_() {
  const props = PropertiesService.getScriptProperties();
  const version = props.getProperty(CERTIFICATE_V3_ACTIVE_PROPERTY) === 'ON' ? 'v3' : 'v2';
  return {
    directorSignatureSha256: String(props.getProperty(propiedadFirmaCertificado_('director', version) + '_SHA256') || '').toLowerCase(),
    managerSignatureSha256: String(props.getProperty(propiedadFirmaCertificado_('manager', version) + '_SHA256') || '').toLowerCase(),
  };
}

function datosSnapshotCertificadoParticipante_(inscripcion, certificado) {
  const servicio = servicioParaCertificado_(inscripcion) || {};
  const duracion = mapaDuracionServicios()(inscripcion);
  const enriched = inscripcionEnriquecida(
    inscripcionSinMetadatosInternos(inscripcion),
    mapaDuracionServicios(),
    mapaUsuariosPorUsername()
  );
  return {
    ClienteNombre: String(enriched.ClienteNombre || inscripcion.ClienteNombre || ''),
    ClienteID: String(enriched.ClienteID || inscripcion.ClienteID || ''),
    ClienteTipoIdentificacion: String(enriched.ClienteTipoIdentificacion || inscripcion.ClienteTipoIdentificacion || inscripcion.TipoIdentificacion || ''),
    ServicioID: String(inscripcion.ServicioID || servicio.ID || ''),
    ServicioNombre: String(enriched.ServicioNombre || inscripcion.ServicioNombre || servicio.Nombre || ''),
    Duracion: String(duracion || servicio.Duracion || ''),
    Modalidad: String(inscripcion.Modalidad || servicio.Modalidad || ''),
    FechaInicio: String(inscripcion.FechaInicio || servicio.FechaEvento || ''),
    FechaFin: String(inscripcion.FechaFin || servicio.FechaFinEvento || inscripcion.FechaInicio || ''),
    Capacitador: String(servicio.Capacitador || ''),
    ResumenCapacitador: String(servicio.ResumenCapacitador || ''),
    Lugar: String(servicio.LugarEvento || servicio.Lugar || ''),
    CertificateType: String(certificado.CertificateType || inscripcion.CertificateType || 'aprobacion'),
    CodigoCertificado: String(certificado.CodigoCertificado || ''),
    CertificateVersion: Number(certificado.CertificateVersion) || 1,
    TemplateVersion: String(certificado.TemplateVersion || ''),
    IssuedAt: String(certificado.IssuedAt || certificado.CertificatePreparedAt || ''),
    IssuedBy: String(certificado.IssuedBy || ''),
    SignatureHashes: huellasFirmasOficialesCertificado_(),
  };
}

function leerFirmaOficialCertificado_(rol, version) {
  const props = PropertiesService.getScriptProperties();
  const key = propiedadFirmaCertificado_(rol, version);
  const id = String(props.getProperty(key) || '').trim();
  const expectedHash = String(props.getProperty(key + '_SHA256') || '').trim();
  if (!id || !expectedHash) throw new Error('Falta la firma oficial aprobada de ' + rol + '.');
  const bytes = DriveApp.getFileById(id).getBlob().getBytes();
  if (sha256BytesCertificado_(bytes) !== expectedHash) throw new Error('La firma oficial de ' + rol + ' no superó la comprobación SHA-256.');
  return Utilities.base64Encode(bytes);
}

function plantillaActivaCertificado_() {
  if (PropertiesService.getScriptProperties().getProperty(CERTIFICATE_V2_ACTIVE_PROPERTY) !== 'ON') return CERTIFICATE_TEMPLATE_VERSION;
  if (PropertiesService.getScriptProperties().getProperty(CERTIFICATE_V3_ACTIVE_PROPERTY) === 'ON') {
    leerFirmaOficialCertificado_('director', 'v3');
    leerFirmaOficialCertificado_('manager', 'v3');
    return CERTIFICATE_SECURITY_TEMPLATE_V3_VERSION;
  }
  leerFirmaOficialCertificado_('director');
  leerFirmaOficialCertificado_('manager');
  return CERTIFICATE_SECURITY_TEMPLATE_VERSION;
}

function getEstadoFirmasCertificado(user) {
  requireCertificateAdmin(user, 'CERTIFICATE_SIGNATURE_STATUS', { canal: 'api' });
  const props = PropertiesService.getScriptProperties();
  return { success: true, data: {
    director: Boolean(props.getProperty(propiedadFirmaCertificado_('director'))),
    manager: Boolean(props.getProperty(propiedadFirmaCertificado_('manager'))),
    directorV3: Boolean(props.getProperty(propiedadFirmaCertificado_('director', 'v3'))),
    managerV3: Boolean(props.getProperty(propiedadFirmaCertificado_('manager', 'v3'))),
    plantillaActiva: props.getProperty(CERTIFICATE_V2_ACTIVE_PROPERTY) === 'ON',
    versionActiva: props.getProperty(CERTIFICATE_V3_ACTIVE_PROPERTY) === 'ON'
      ? CERTIFICATE_SECURITY_TEMPLATE_V3_VERSION
      : props.getProperty(CERTIFICATE_V2_ACTIVE_PROPERTY) === 'ON'
        ? CERTIFICATE_SECURITY_TEMPLATE_VERSION : CERTIFICATE_TEMPLATE_VERSION,
    managerSigner: {
      name: String(props.getProperty(CERTIFICATE_MANAGER_NAME_PROPERTY) || ''),
      title: String(props.getProperty(CERTIFICATE_MANAGER_TITLE_PROPERTY) || ''),
    },
    managerSignerConfigured: Boolean(String(props.getProperty(CERTIFICATE_MANAGER_NAME_PROPERTY) || '').trim()
      && String(props.getProperty(CERTIFICATE_MANAGER_TITLE_PROPERTY) || '').trim()),
  } };
}

function guardarDatosFirmanteCertificado(user, { nombre, cargo, confirmacion } = {}) {
  requireCertificateAdmin(user, 'CERTIFICATE_SIGNER_DETAILS_WRITE', { canal: 'api' });
  if (confirmacion !== 'CONFIRMO_DATOS_OFICIALES_DE_FIRMA') {
    return { success: false, error: 'Confirme que el nombre y cargo corresponden al gerente firmante autorizado.' };
  }
  const cleanName = String(nombre || '').replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim();
  const cleanTitle = String(cargo || '').replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (cleanName.length < 3 || cleanName.length > 160 || cleanTitle.length < 3 || cleanTitle.length > 100) {
    return { success: false, error: 'Ingrese nombre completo (3–160 caracteres) y cargo (3–100 caracteres).' };
  }
  return conBloqueoCertificados(function() {
    const props = PropertiesService.getScriptProperties();
    const before = {
      name: String(props.getProperty(CERTIFICATE_MANAGER_NAME_PROPERTY) || ''),
      title: String(props.getProperty(CERTIFICATE_MANAGER_TITLE_PROPERTY) || ''),
    };
    props.setProperty(CERTIFICATE_MANAGER_NAME_PROPERTY, cleanName);
    props.setProperty(CERTIFICATE_MANAGER_TITLE_PROPERTY, cleanTitle);
    try {
      registrarAuditoriaCertificado({ certificadoId: '', inscripcionId: '', usuario: user.Username, rol: user.Rol,
        accion: 'CERTIFICATE_SIGNER_DETAILS_UPDATED', canal: 'panel', resultado: 'ok',
        metadatos: { signerRole: 'manager', fieldsConfigured: true } });
    } catch (error) {
      if (before.name) props.setProperty(CERTIFICATE_MANAGER_NAME_PROPERTY, before.name); else props.deleteProperty(CERTIFICATE_MANAGER_NAME_PROPERTY);
      if (before.title) props.setProperty(CERTIFICATE_MANAGER_TITLE_PROPERTY, before.title); else props.deleteProperty(CERTIFICATE_MANAGER_TITLE_PROPERTY);
      throw error;
    }
    return { success: true, data: { name: cleanName, title: cleanTitle } };
  });
}

function registrarFirmaOficialCertificado(user, { rol, pngBase64, confirmacion, version } = {}) {
  requireCertificateAdmin(user, 'CERTIFICATE_SIGNATURE_REGISTER', { canal: 'api' });
  if (confirmacion !== 'CONFIRMO_FIRMA_AUTENTICA_Y_USO_AUTORIZADO') {
    return { success: false, error: 'Confirme que la rúbrica es auténtica y su uso está autorizado.' };
  }
  return conBloqueoCertificados(function() {
    const resolvedVersion = String(version || 'v2').toLowerCase();
    if (['v2', 'v3'].indexOf(resolvedVersion) === -1) return { success: false, error: 'Versión de firma desconocida.' };
    const key = propiedadFirmaCertificado_(rol, resolvedVersion);
    const props = PropertiesService.getScriptProperties();
    if (resolvedVersion === 'v3' && props.getProperty(CERTIFICATE_V2_ACTIVE_PROPERTY) !== 'ON') {
      return { success: false, error: 'Primero debe estar activa la plantilla v2.' };
    }
    if (props.getProperty(key)) return { success: false, error: 'La firma ya está registrada. Una rotación requiere una nueva versión de plantilla.' };
    const encoded = String(pngBase64 || '').replace(/^data:image\/png;base64,/i, '');
    if (!/^[A-Za-z0-9+/]+=*$/.test(encoded) || encoded.length > 2100000) {
      return { success: false, error: 'La firma debe ser PNG válido de hasta 1,5 MB.' };
    }
    const bytes = Utilities.base64Decode(encoded);
    const header = [137,80,78,71,13,10,26,10];
    const png = bytes.length >= 500 && header.every(function(value, index) { return (bytes[index] & 255) === value; });
    const dimension = function(start) { return ((bytes[start] & 255) * 16777216) + ((bytes[start + 1] & 255) << 16) + ((bytes[start + 2] & 255) << 8) + (bytes[start + 3] & 255); };
    if (!png || dimension(16) < 100 || dimension(20) < 25) {
      return { success: false, error: 'La imagen PNG está dañada o es demasiado pequeña para una firma oficial.' };
    }
    const hash = sha256BytesCertificado_(bytes);
    const blob = Utilities.newBlob(bytes, 'image/png', 'firma-certificado-' + resolvedVersion + '-' + rol + '.png');
    const file = DriveApp.createFile(blob);
    try {
      file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
      props.setProperty(key, file.getId());
      props.setProperty(key + '_SHA256', hash);
      registrarAuditoriaCertificado({ certificadoId: '', inscripcionId: '', usuario: user.Username, rol: user.Rol,
        accion: 'CERTIFICATE_SIGNATURE_REGISTERED', canal: 'panel', resultado: 'ok', metadatos: { signerRole: rol, version: resolvedVersion, sha256: hash } });
    } catch (error) {
      props.deleteProperty(key);
      props.deleteProperty(key + '_SHA256');
      file.setTrashed(true);
      throw error;
    }
    return { success: true, data: { rol: rol, sha256: hash } };
  });
}

function activarPlantillaCertificadoV2(user, { confirmacion } = {}) {
  requireCertificateAdmin(user, 'CERTIFICATE_TEMPLATE_ACTIVATE', { canal: 'api' });
  if (confirmacion !== 'ACTIVAR_CERTIFICADOS_SEGURIDAD_V2') return { success: false, error: 'Falta la confirmación explícita de activación.' };
  return conBloqueoCertificados(function() {
    const props = PropertiesService.getScriptProperties();
    if (props.getProperty(CERTIFICATE_V2_ACTIVE_PROPERTY) === 'ON') return { success: true, alreadyActive: true };
    leerFirmaOficialCertificado_('director');
    leerFirmaOficialCertificado_('manager');
    props.setProperty(CERTIFICATE_V2_ACTIVE_PROPERTY, 'ON');
    try {
      registrarAuditoriaCertificado({ certificadoId: '', inscripcionId: '', usuario: user.Username, rol: user.Rol,
        accion: 'CERTIFICATE_TEMPLATE_V2_ACTIVATED', canal: 'panel', resultado: 'ok', metadatos: { templateVersion: CERTIFICATE_SECURITY_TEMPLATE_VERSION } });
    } catch (error) {
      props.deleteProperty(CERTIFICATE_V2_ACTIVE_PROPERTY);
      throw error;
    }
    return { success: true, data: { templateVersion: CERTIFICATE_SECURITY_TEMPLATE_VERSION } };
  });
}

function activarPlantillaCertificadoV3(user, { confirmacion } = {}) {
  requireCertificateAdmin(user, 'CERTIFICATE_TEMPLATE_V3_ACTIVATE', { canal: 'api' });
  if (confirmacion !== 'ACTIVAR_CERTIFICADOS_SEGURIDAD_V3') return { success: false, error: 'Falta la confirmación explícita de activación.' };
  return conBloqueoCertificados(function() {
    const props = PropertiesService.getScriptProperties();
    if (props.getProperty(CERTIFICATE_V2_ACTIVE_PROPERTY) !== 'ON') return { success: false, error: 'La plantilla v2 debe estar activa antes de activar v3.' };
    if (props.getProperty(CERTIFICATE_V3_ACTIVE_PROPERTY) === 'ON') return { success: true, alreadyActive: true };
    leerFirmaOficialCertificado_('director', 'v3');
    leerFirmaOficialCertificado_('manager', 'v3');
    props.setProperty(CERTIFICATE_V3_ACTIVE_PROPERTY, 'ON');
    try {
      registrarAuditoriaCertificado({ certificadoId: '', inscripcionId: '', usuario: user.Username, rol: user.Rol,
        accion: 'CERTIFICATE_TEMPLATE_V3_ACTIVATED', canal: 'panel', resultado: 'ok',
        metadatos: { templateVersion: CERTIFICATE_SECURITY_TEMPLATE_V3_VERSION } });
    } catch (error) {
      props.deleteProperty(CERTIFICATE_V3_ACTIVE_PROPERTY);
      throw error;
    }
    return { success: true, data: { templateVersion: CERTIFICATE_SECURITY_TEMPLATE_V3_VERSION } };
  });
}

function getFirmasOficialesCertificado(user, { templateVersion, managerSignatureSha256 } = {}) {
  requireCertificateAdmin(user, 'CERTIFICATE_SIGNATURE_READ', { canal: 'api' });
  if (PropertiesService.getScriptProperties().getProperty(CERTIFICATE_V2_ACTIVE_PROPERTY) !== 'ON') {
    return { success: false, error: 'La plantilla de seguridad aún no está activada.' };
  }
  const props = PropertiesService.getScriptProperties();
  const requestedTemplate = String(templateVersion || '').trim();
  let version = requestedTemplate === CERTIFICATE_SECURITY_TEMPLATE_V3_VERSION ? 'v3' : 'v2';
  if (requestedTemplate === CERTIFICATE_INSTITUTIONAL_AVAL_TEMPLATE) {
    const requestedHash = String(managerSignatureSha256 || '').trim().toLowerCase();
    const v2Hash = String(props.getProperty(propiedadFirmaCertificado_('manager', 'v2') + '_SHA256') || '').toLowerCase();
    const v3Hash = String(props.getProperty(propiedadFirmaCertificado_('manager', 'v3') + '_SHA256') || '').toLowerCase();
    if (!requestedHash || (requestedHash !== v2Hash && requestedHash !== v3Hash)) {
      return { success: false, error: 'La firma del gerente no coincide con el snapshot institucional.' };
    }
    version = requestedHash === v2Hash ? 'v2' : 'v3';
  } else if (requestedTemplate && requestedTemplate !== CERTIFICATE_SECURITY_TEMPLATE_VERSION
      && requestedTemplate !== CERTIFICATE_SECURITY_TEMPLATE_V3_VERSION
      && requestedTemplate !== CERTIFICATE_ITSAL_TEMPLATE_VERSION) {
    return { success: false, error: 'Versión de plantilla desconocida.' };
  }
  if (version === 'v3' && props.getProperty(CERTIFICATE_V3_ACTIVE_PROPERTY) !== 'ON') {
    return { success: false, error: 'La plantilla v3 no está activa.' };
  }
  return { success: true, signatures: {
    director: 'data:image/png;base64,' + leerFirmaOficialCertificado_('director', version),
    manager: 'data:image/png;base64,' + leerFirmaOficialCertificado_('manager', version),
  }, signers: {
    manager: { name: String(props.getProperty(CERTIFICATE_MANAGER_NAME_PROPERTY) || ''),
      title: String(props.getProperty(CERTIFICATE_MANAGER_TITLE_PROPERTY) || ''),
      signatureSha256: String(props.getProperty(propiedadFirmaCertificado_('manager', version) + '_SHA256') || '').toLowerCase() },
  } };
}

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
        const avalColumnsBeforeCrm = ['InstitucionID','ConvenioID','AvalInstitucionID','AvalConvenioID',
          'AvalBaseTipoAplicado','AvalMontoBase','AvalPorcentajeAplicado','AvalMontoCalculado','AvalConfirmadoPor'];
        const crmEnrollmentIndex = name === 'Inscripciones' && avalColumnsBeforeCrm.indexOf(h) !== -1
          ? existing.indexOf('CRMEnrollmentID') : -1;
        const col = crmEnrollmentIndex >= 0 ? crmEnrollmentIndex + 1 : sheet.getLastColumn() + 1;
        if (crmEnrollmentIndex >= 0) sheet.insertColumnBefore(col);
        var cell = sheet.getRange(1, col);
        cell.setValue(h);
        cell.setFontWeight('bold').setBackground('#3730a3').setFontColor('#ffffff');
        existing.splice(col - 1, 0, h);
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
        const value = row[j] instanceof Date ? row[j].toISOString() : normalizarValorTextoSensible_(h, row[j]);
        // Si una hoja real tiene encabezados duplicados por migraciones/manual,
        // una columna vacia posterior no debe borrar el valor leido antes.
        if (obj[h] !== undefined && (value === '' || value === null || value === undefined)) return;
        obj[h] = value;
      });
      return obj;
    })
    .filter(obj => obj[headers[0]] !== '' && obj[headers[0]] !== null && obj[headers[0]] !== undefined);
}

function updateRow(sheet, row, fieldMap) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  Object.entries(fieldMap).forEach(([col, val]) => {
    if (val === undefined) return;
    const normalized = val === null ? '' : val;
    headers.forEach(function(header, index) {
      // Actualizar todas las columnas con el mismo encabezado. Esto corrige hojas
      // productivas con columnas duplicadas (ej. Capacitador) sin destruir datos.
      if (header === col) {
        const range = sheet.getRange(row._row, index + 1);
        escribirCeldaPreservandoTexto_(range, header, normalized);
      }
    });
  });
}

const TEXT_SENSITIVE_HEADERS = {
  ID: true,
  Identificacion: true,
  TipoIdentificacion: true,
  ClienteTipoIdentificacion: true,
  TipoIdentificacionFactura: true,
  ClienteID: true,
  ClienteTelefono: true,
  RUC: true,
  ProveedorIdentificacion: true,
  NumeroComprobante: true,
  FacturaCompraNumero: true,
  AutorizacionCompra: true,
  IngresoID: true,
  ServicioID: true,
  ContratoID: true,
  FacturaID: true,
  CRMEnrollmentID: true,
  CRMContactID: true,
  CRMCourseID: true,
  IssuerRuc: true,
  Establishment: true,
  EmissionPoint: true,
  Sequential: true,
  DocumentNumber: true,
  AccessKey: true,
  NumericCode: true,
  BuyerIdentification: true,
  BuyerIdentificationType: true,
  SriPaymentCode: true,
  AuthorizationNumber: true,
  LastSequential: true,
  // Credenciales del aula: conservar exactamente como texto (incluidos ceros
  // iniciales y caracteres especiales) y evitar conversiones automáticas de
  // Google Sheets. Solo se exponen a los roles Moodle/administración.
  MoodleUsername: true,
  MoodlePassword: true,
};

function esEncabezadoTextoSensible_(header) {
  return !!TEXT_SENSITIVE_HEADERS[String(header || '').trim()];
}

function normalizarValorTextoSensible_(header, value) {
  if (!esEncabezadoTextoSensible_(header)) return value;
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function escribirCeldaPreservandoTexto_(range, header, value) {
  if (esEncabezadoTextoSensible_(header)) {
    range.setNumberFormat('@');
    return range.setValue(normalizarValorTextoSensible_(header, value));
  }
  return range.setValue(value);
}

function appendRowPreservandoTexto_(sheet, headers, rowValues) {
  const values = headers.map(function(header, index) {
    const value = rowValues[index] === undefined || rowValues[index] === null ? '' : rowValues[index];
    return normalizarValorTextoSensible_(header, value);
  });
  sheet.appendRow(values);
  const rowNumber = sheet.getLastRow();
  headers.forEach(function(header, index) {
    if (!esEncabezadoTextoSensible_(header)) return;
    escribirCeldaPreservandoTexto_(sheet.getRange(rowNumber, index + 1), header, values[index]);
  });
  return rowNumber;
}

function appendObjectBySheetHeaders_(sheet, valuesByField) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const values = headers.map(function(header) {
    return valuesByField[header] === undefined || valuesByField[header] === null
      ? ''
      : normalizarValorTextoSensible_(header, valuesByField[header]);
  });
  sheet.appendRow(values);
  const rowNumber = sheet.getLastRow();
  headers.forEach(function(header, index) {
    if (!esEncabezadoTextoSensible_(header)) return;
    if (valuesByField[header] === undefined || valuesByField[header] === null) return;
    escribirCeldaPreservandoTexto_(sheet.getRange(rowNumber, index + 1), header, valuesByField[header]);
  });
  return rowNumber;
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
  if (!isAdmin(user)) throw new Error('Acceso denegado: se requiere rol de administrador.');
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

function parseRolesValue_(value) {
  if (Array.isArray(value)) return value;
  var raw = String(value || '').trim();
  if (!raw) return [];
  if (raw.charAt(0) === '[') {
    try {
      var parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch (e) {}
  }
  return raw.split(/[,;|]/);
}

function normalizarRol_(role) {
  var normalized = String(role || '').trim().toLowerCase();
  var valid = ['admin','vendedor','contador','moodle','aval','usuario'];
  return valid.indexOf(normalized) === -1 ? '' : normalized;
}

function rolesUsuario_(user) {
  if (!user) return [];
  var seen = {};
  var roles = [];
  parseRolesValue_(user.Roles).concat(parseRolesValue_(user.roles), [user.Rol, user.rol]).forEach(function(role) {
    var normalized = normalizarRol_(role);
    if (normalized && !seen[normalized]) {
      seen[normalized] = true;
      roles.push(normalized);
    }
  });
  if (roles.length === 0) roles.push('usuario');
  var order = ['admin','vendedor','contador','moodle','aval','usuario'];
  return order.filter(function(role) { return seen[role] || roles.indexOf(role) !== -1; });
}

function rolPrincipal_(roles) {
  roles = rolesUsuario_({ Roles: roles });
  return roles[0] || 'usuario';
}

function serializarRoles_(roles) {
  return JSON.stringify(rolesUsuario_({ Roles: roles }));
}

function tieneRol_(user, role) {
  return rolesUsuario_(user).indexOf(role) !== -1;
}

function isAdmin(user)    { return tieneRol_(user, 'admin'); }
function isVendedor(user) { return isAdmin(user) || tieneRol_(user, 'vendedor'); }
function isAval(user)     { return tieneRol_(user, 'aval'); }
function isContador(user) { return tieneRol_(user, 'contador'); }
function isMoodle(user)   { return tieneRol_(user, 'moodle'); }

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
  ClienteTipoIdentificacion: ['tipodocumento', 'tipoidentificacion', 'tipodeidentificacion', 'tipodocumentoparticipante'],
  TipoIdentificacionFactura: ['tipoidentificacionfactura', 'tipodedocumentofactura', 'tipoidfactura'],
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
  if (esEncabezadoTextoSensible_(field)) {
    return normalizarValorTextoSensible_(field, value);
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
      escribirCeldaPreservandoTexto_(sheet.getRange(rowNumber, column + 1), field, value);
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
      : normalizarValorTextoSensible_(field, valuesByField[field]);
  });
  sheet.appendRow(values);
  const rowNumber = sheet.getLastRow();
  fields.forEach(function(field) {
    if (!esEncabezadoTextoSensible_(field)) return;
    const columnIndex = schema.indices[field];
    if (columnIndex === undefined) return;
    escribirCeldaPreservandoTexto_(sheet.getRange(rowNumber, columnIndex + 1), field, valuesByField[field]);
  });
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

function institucionAvalIdDelUsuario_(user) {
  const row = sheetToObjects(getSheet('Usuarios')).find(function(u) {
    return u.ID === user.ID || u.Username === user.Username;
  });
  return row ? String(row.InstitucionAvalID || '').trim() : '';
}

function usuarioPuedeGestionarAvalDeInscripcion_(user, inscripcion) {
  if (isAdmin(user)) return true;
  if (!isAval(user)) return false;
  const assignedId = institucionAvalIdDelUsuario_(user);
  const recordId = String(inscripcion.InstitucionID || '').trim();
  if (assignedId) return !!recordId && assignedId === recordId;
  // Compatibilidad solo para filas y usuarios antiguos todavía sin IDs maestros.
  const assignedName = institucionAvalDelUsuario(user);
  return !recordId && !!assignedName && mismaInstitucionAval(inscripcion.InstitucionAval, assignedName);
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
  const roles = rolesUsuario_(user);
  const rolPrincipal = rolPrincipal_(roles);
  appendRowPreservandoTexto_(getSheet('Sesiones'), SHEET_HEADERS.Sesiones, [
    token, username, user.ID, rolPrincipal, user.Nombre, expiry.toISOString(), serializarRoles_(roles),
  ]);

  return { success: true, token, user: { id: user.ID, nombre: user.Nombre, rol: rolPrincipal, roles: roles, username } };
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
  return { ID: session.UserID, Username: session.Username, Rol: session.Rol, Roles: session.Roles, Nombre: session.Nombre };
}

function handleLogout(token) {
  const sheet    = getSheet('Sesiones');
  const sessions = sheetToObjects(sheet);
  const session  = sessions.find(s => s.Token === token);
  if (session) sheet.deleteRow(session._row);
  return { success: true };
}

function invalidarSesionesUsuario_(userId, usernames) {
  const sheet = getSheet('Sesiones');
  const id = String(userId || '');
  const nombres = (usernames || []).map(function(username) { return String(username || ''); }).filter(Boolean);
  const sessions = sheetToObjects(sheet).filter(function(session) {
    return (id && String(session.UserID || '') === id)
      || nombres.indexOf(String(session.Username || '')) !== -1;
  });
  // Borrar de abajo hacia arriba evita que los índices de las filas restantes cambien.
  // Si falla la revocación, el cambio de cuenta debe abortar (fail closed).
  try {
    sessions.sort(function(a, b) { return b._row - a._row; }).forEach(function(session) {
      sheet.deleteRow(session._row);
    });
  } catch (err) {
    throw new Error('No se pudieron invalidar las sesiones existentes. El cambio de cuenta no se completó; reintente.');
  }
  return sessions.length;
}

// Endpoint público (sin token) para el QR de verificación de certificados.
// Solo expone campos no sensibles y nunca revela si un ID existe pero
// aún no fue emitido (mismo mensaje "no válido" para ambos casos).
function handleVerificarCertificado({ id } = {}) {
  const identifier = String(id || '').trim();
  if (!identifier) return { success: true, valido: false };
  const matchesIdentifier = function(item) {
    return String(item.ID || '') === identifier || String(item.CodigoCertificado || '') === identifier;
  };
  const avalMatches = sheetToObjects(getSheet('EntregablesAval')).filter(matchesIdentifier);
  const professionalSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('CertificadosProfesionales');
  const professionalMatches = professionalSheet ? sheetToObjects(professionalSheet).filter(matchesIdentifier) : [];
  const normalSheetMatches = sheetToObjects(getSheet('Certificados')).filter(matchesIdentifier);
  const normalResult = normalSheetMatches.length <= 1 ? buscarCertificadoPublico(identifier) : null;
  const hasNormalMatch = normalSheetMatches.length > 0 || Boolean(normalResult);

  // Los códigos visibles se reservan globalmente. Si un dato histórico ambiguo
  // rompe esa regla, se falla cerrado y no se presenta un documento equivocado.
  if (avalMatches.length > 1 || professionalMatches.length > 1
      || normalSheetMatches.length > 1
      || Number(Boolean(hasNormalMatch)) + avalMatches.length + professionalMatches.length > 1) {
    return { success: true, valido: false };
  }
  const entregaAval = avalMatches[0] || null;
  if (entregaAval) {
    if (['emitido', 'anulado', 'reemitido'].indexOf(entregaAval.CertificateStatus) === -1 || !entregaAval.PdfHash || !entregaAval.PdfStorageReference) {
      return { success: true, valido: false };
    }
    const inscripcionAval = sheetToObjects(getSheet('Inscripciones')).find(function(item) { return item.ID === entregaAval.InscripcionID; });
    if (!inscripcionAval || inscripcionAval.EstadoAval !== 'avalado') return { success: true, valido: false };
    return { success: true, valido: true, data: {
      codigo: entregaAval.CodigoCertificado, identificador: entregaAval.ID,
      estado: entregaAval.CertificateStatus === 'emitido' ? 'vigente' : entregaAval.CertificateStatus,
       tipoSujeto: 'aval_institucional', tipoDocumento: 'certificado_avalado', certificadoVigenteId: entregaAval.ReissuedCertificateId || '',
      nombre: inscripcionAval.ClienteNombre, servicio: inscripcionAval.ServicioNombre,
      duracion: mapaDuracionServicios()(inscripcionAval), modalidad: inscripcionAval.Modalidad,
      fechaInicio: inscripcionAval.FechaInicio, fechaFin: inscripcionAval.FechaFin || '',
      fechaEmision: entregaAval.IssuedAt, version: Number(entregaAval.CertificateVersion) || 1,
      institucionAval: inscripcionAval.InstitucionAval,
      estadoAval: 'avalado', avalReferencia: entregaAval.ReferenciaExterna || '',
      avalCodigoExterno: entregaAval.CodigoExterno || '', avalEnlaceExterno: entregaAval.EnlaceExterno || '',
    } };
  }
  const professional = professionalMatches[0] || null;
  if (professional) {
    const estadoProfesional = estadoPublicoCertificado(professional);
    if (['vigente', 'anulado', 'reemitido'].indexOf(estadoProfesional) === -1) return { success: true, valido: false };
    return { success: true, valido: true, data: {
      codigo: professional.CodigoCertificado, identificador: professional.ID, estado: estadoProfesional,
      tipoSujeto: 'profesional', tipoDocumento: 'certificado_profesional', rolProfesional: professional.Rol,
      nombre: professional.Nombre, servicio: professional.ServicioNombre, duracion: professional.Duracion,
      modalidad: professional.Modalidad, fechaInicio: professional.FechaInicio, fechaFin: professional.FechaFin,
      fechaEmision: professional.IssuedAt, version: Number(professional.CertificateVersion) || 1,
      certificadoVigenteId: estadoProfesional === 'reemitido' ? professional.ReissuedCertificateId || '' : '',
    } };
  }
  const resultado = normalResult;
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
      tipoDocumento:   'certificado_normal',
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
  if (!isAdmin(user) && !isContador(user)) throw new Error('Acceso denegado: se requiere rol administrativo o contable.');
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
  if (!isAdmin(user) && !isContador(user)) data = data.filter(i => i.CreadoPor === user.Username);
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
  if (!isAdmin(user) && !isContador(user)) data = data.filter(e => e.CreadoPor === user.Username);
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
  appendObjectBySheetHeaders_(sheet, {
    ID: id,
    Fecha: egreso.fecha,
    Categoria: egreso.categoria,
    Concepto: egreso.concepto,
    Proveedor: egreso.proveedor || '',
    Monto: Number(egreso.monto) || 0,
    Estado: estado,
    AprobadoPor: '',
    FechaAprobacion: '',
    Notas: egreso.notas || '',
    CreadoPor: user.Username,
    FechaCreacion: now,
    ProveedorIdentificacion: egreso.proveedorIdentificacion || '',
    FacturaCompraNumero: egreso.facturaCompraNumero || '',
    AutorizacionCompra: egreso.autorizacionCompra || '',
    FechaEmisionFactura: egreso.fechaEmisionFactura || egreso.fecha || '',
    BaseImponible0: Number(egreso.baseImponible0) || 0,
    BaseImponible15: Number(egreso.baseImponible15) || 0,
    IvaCompra: Number(egreso.ivaCompra) || 0,
    FormaPagoCompra: egreso.formaPagoCompra || '',
    ReferenciaPagoCompra: egreso.referenciaPagoCompra || '',
  });
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
    ProveedorIdentificacion: egreso.proveedorIdentificacion,
    FacturaCompraNumero: egreso.facturaCompraNumero,
    AutorizacionCompra: egreso.autorizacionCompra,
    FechaEmisionFactura: egreso.fechaEmisionFactura,
    BaseImponible0: egreso.baseImponible0 === undefined ? undefined : Number(egreso.baseImponible0) || 0,
    BaseImponible15: egreso.baseImponible15 === undefined ? undefined : Number(egreso.baseImponible15) || 0,
    IvaCompra: egreso.ivaCompra === undefined ? undefined : Number(egreso.ivaCompra) || 0,
    FormaPagoCompra: egreso.formaPagoCompra,
    ReferenciaPagoCompra: egreso.referenciaPagoCompra,
    AprobadoPor:      nuevoEstado === 'aprobado' ? user.Username : row.AprobadoPor,
    FechaAprobacion:  nuevoEstado === 'aprobado' ? now : row.FechaAprobacion,
  });
  return { success: true };
}

// ─────────────────────────────────────────────
// PAGOS
// ─────────────────────────────────────────────

function getPagos(user, { filtros = {} } = {}) {
  if (!isAdmin(user) && !isContador(user)) throw new Error('Acceso denegado: se requiere rol administrativo o contable.');
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
  if (!isAdmin(user) && !isContador(user)) throw new Error('Acceso denegado: se requiere rol administrativo o contable.');
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
  if (!isAdmin(user) && !isContador(user)) throw new Error('Acceso denegado: se requiere rol administrativo o contable.');
  const data = sheetToObjects(getSheet('Usuarios')).map(u => ({
    ID: u.ID, Nombre: u.Nombre, Email: u.Email, Username: u.Username,
    Rol: u.Rol, Roles: u.Roles || serializarRoles_(u.Rol), Activo: u.Activo, FechaCreacion: u.FechaCreacion,
    InstitucionAval: u.InstitucionAval || '', InstitucionAvalID: u.InstitucionAvalID || '',
  }));
  return { success: true, data };
}

function addUsuario(user, { usuario }) {
  requireAdmin(user);
  const sheet    = getSheet('Usuarios');
  const existing = sheetToObjects(sheet);
  if (existing.find(u => u.Username === usuario.username))
    return { success: false, error: 'El nombre de usuario ya existe.' };
  const roles = rolesUsuario_({
    Roles: usuario.roles,
    Rol: usuario.roles !== undefined ? '' : (usuario.rol || 'usuario'),
  });
  const rol = rolPrincipal_(roles);
  const institucionAvalID = roles.indexOf('aval') !== -1 ? String(usuario.institucionAvalId || '').trim() : '';
  const institucionAvalRecord = institucionAvalID ? institucionPorId_(institucionAvalID) : null;
  if (roles.indexOf('aval') !== -1 && (!institucionAvalRecord || institucionAvalRecord.Estado !== 'activo')) {
    return { success: false, error: 'Asigne al usuario de aval una institución activa de la ficha maestra.' };
  }
  const institucionAval = institucionAvalRecord ? String(institucionAvalRecord.Nombre || '').trim() : '';
  const id   = generateId('USR');
  const hash = hashPassword(usuario.password);
  const now  = new Date().toISOString();
  appendRowPreservandoTexto_(sheet, SHEET_HEADERS.Usuarios, [
    id, usuario.nombre, usuario.email || '', usuario.username, hash, rol, true, now, institucionAval, serializarRoles_(roles), institucionAvalID,
  ]);
  return { success: true, id };
}

function updateUsuario(user, { id, usuario }) {
  requireAdmin(user);
  const sheet = getSheet('Usuarios');
  const rows  = sheetToObjects(sheet);
  const row   = rows.find(function(u) { return u.ID === id; });
  if (!row) return { success: false, error: 'Usuario no encontrado.' };
  const roles = rolesUsuario_({
    Roles: usuario.roles !== undefined ? usuario.roles : row.Roles,
    Rol: usuario.roles !== undefined ? '' : (usuario.rol || row.Rol),
  });
  const rol = rolPrincipal_(roles);
  const retainsLegacyInstitution = roles.indexOf('aval') !== -1 && !row.InstitucionAvalID
    && usuario.institucionAvalId === undefined
    && String(usuario.institucionAval === undefined ? row.InstitucionAval || '' : usuario.institucionAval).trim()
      === String(row.InstitucionAval || '').trim();
  const institucionAvalID = roles.indexOf('aval') !== -1
    ? String(usuario.institucionAvalId !== undefined ? usuario.institucionAvalId : row.InstitucionAvalID || '').trim()
    : '';
  const institucionAvalRecord = institucionAvalID ? institucionPorId_(institucionAvalID) : null;
  if (roles.indexOf('aval') !== -1 && !retainsLegacyInstitution
      && (!institucionAvalRecord || (institucionAvalRecord.Estado !== 'activo' && institucionAvalID !== String(row.InstitucionAvalID || '')))) {
    return { success: false, error: 'Asigne al usuario de aval una institución activa de la ficha maestra.' };
  }
  const institucionAval = roles.indexOf('aval') !== -1
    ? (institucionAvalRecord ? String(institucionAvalRecord.Nombre || '').trim() : (retainsLegacyInstitution ? String(row.InstitucionAval || '').trim() : ''))
    : '';
  if (roles.indexOf('aval') !== -1 && !institucionAval) {
    return { success: false, error: 'Asigne una institución registrada al usuario de aval.' };
  }
  const fields = {
    Nombre: usuario.nombre, Email: usuario.email,
    Rol: rol, Roles: serializarRoles_(roles), Activo: usuario.activo, InstitucionAval: institucionAval,
    InstitucionAvalID: institucionAvalID,
  };
  // Permitir cambio de username con verificación de unicidad
  if (usuario.username && usuario.username !== row.Username) {
    if (rows.find(function(u) { return u.Username === usuario.username && u.ID !== id; })) {
      return { success: false, error: 'El nombre de usuario ya está en uso.' };
    }
    fields.Username = usuario.username;
  }
  if (usuario.password) fields.PasswordHash = hashPassword(usuario.password);
  const boolActivo = function(value) { return value === true || String(value).toUpperCase() === 'TRUE'; };
  const cambiaAcceso = serializarRoles_(roles) !== serializarRoles_(rolesUsuario_(row))
    || (usuario.activo !== undefined && boolActivo(usuario.activo) !== boolActivo(row.Activo))
    || Boolean(fields.Username && fields.Username !== row.Username)
    || Boolean(usuario.password);
  // El alcance institucional se consulta desde la ficha vigente de Usuarios en
  // cada petición; no está congelado dentro del token de sesión. Por eso su
  // cambio se aplica inmediatamente sin cerrar sesiones válidas del usuario.
  // Revocar antes de persistir un cambio de autenticación evita tokens antiguos
  // activos si la escritura de la hoja de sesiones falla.
  if (cambiaAcceso) invalidarSesionesUsuario_(id, [row.Username, fields.Username]);
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
  if (isAdmin(row)) {
    const otrosAdmins = rows.filter(function(u) {
      return isAdmin(u) && u.ID !== id && (u.Activo === true || u.Activo === 'TRUE');
    });
    if (otrosAdmins.length === 0) return { success: false, error: 'Debe existir al menos un administrador activo.' };
  }
  // Revocar primero: si falla, la cuenta no debe borrarse dejando tokens vivos.
  invalidarSesionesUsuario_(id, [row.Username]);
  sheet.deleteRow(row._row);
  return { success: true };
}

// ─────────────────────────────────────────────
// SERVICIOS
// ─────────────────────────────────────────────

const TIPOS_IDENTIFICACION = {
  CEDULA_EC: 'CEDULA_EC',
  RUC_EC: 'RUC_EC',
  PASAPORTE: 'PASAPORTE',
  CONSUMIDOR_FINAL: 'CONSUMIDOR_FINAL',
  OTRO: 'OTRO',
  NO_ESPECIFICADO: 'NO_ESPECIFICADO',
};

function normalizarTipoIdentificacion_(value) {
  const source = String(value || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  const aliases = {
    CEDULA_EC: TIPOS_IDENTIFICACION.CEDULA_EC,
    CEDULA: TIPOS_IDENTIFICACION.CEDULA_EC,
    'CEDULA ECUATORIANA': TIPOS_IDENTIFICACION.CEDULA_EC,
    ECUADORIAN_ID: TIPOS_IDENTIFICACION.CEDULA_EC,
    RUC_EC: TIPOS_IDENTIFICACION.RUC_EC,
    RUC: TIPOS_IDENTIFICACION.RUC_EC,
    ECUADORIAN_RUC: TIPOS_IDENTIFICACION.RUC_EC,
    '04': TIPOS_IDENTIFICACION.RUC_EC,
    '05': TIPOS_IDENTIFICACION.CEDULA_EC,
    '06': TIPOS_IDENTIFICACION.PASAPORTE,
    '07': TIPOS_IDENTIFICACION.CONSUMIDOR_FINAL,
    '08': TIPOS_IDENTIFICACION.OTRO,
    PASSPORT: TIPOS_IDENTIFICACION.PASAPORTE,
    PASAPORTE: TIPOS_IDENTIFICACION.PASAPORTE,
    OTRO: TIPOS_IDENTIFICACION.OTRO,
    OTHER: TIPOS_IDENTIFICACION.OTRO,
    OTRO_DOCUMENTO: TIPOS_IDENTIFICACION.OTRO,
    NO_ESPECIFICADO: TIPOS_IDENTIFICACION.NO_ESPECIFICADO,
    UNSPECIFIED: TIPOS_IDENTIFICACION.NO_ESPECIFICADO,
    CEDULAEC: TIPOS_IDENTIFICACION.CEDULA_EC,
    EXTERIOR: TIPOS_IDENTIFICACION.OTRO,
    CONSUMIDOR_FINAL: TIPOS_IDENTIFICACION.CONSUMIDOR_FINAL,
    'CONSUMIDOR FINAL': TIPOS_IDENTIFICACION.CONSUMIDOR_FINAL,
  };
  return aliases[source] || '';
}

function esCedulaEcuatorianaValida_(value) {
  if (typeof value !== 'string' || !/^\d{10}$/.test(value)) return false;
  const province = Number(value.slice(0, 2));
  const thirdDigit = Number(value.charAt(2));
  const ordinaryProvince = province >= 1 && province <= 24;
  const consularDocument = province === 30 && (thirdDigit === 4 || thirdDigit === 5);
  if ((!ordinaryProvince && !consularDocument) || thirdDigit > 5) return false;
  let sum = 0;
  for (let index = 0; index < 9; index += 1) {
    const digit = value.charCodeAt(index) - 48;
    const product = digit * (index % 2 === 0 ? 2 : 1);
    sum += product > 9 ? product - 9 : product;
  }
  return (10 - (sum % 10)) % 10 === value.charCodeAt(9) - 48;
}

function validarIdentificacion_(tipo, value, options) {
  options = options || {};
  if (value === null || value === undefined || value === '') return options.required ? 'Ingrese la identificación.' : '';
  const legacyUnchanged = options.allowLegacyUnchanged
    && normalizarTipoIdentificacion_(tipo) === TIPOS_IDENTIFICACION.NO_ESPECIFICADO
    && String(value) === String(options.legacyOriginal);
  if (typeof value !== 'string' && !legacyUnchanged) {
    return 'La identificación debe enviarse como texto para preservar sus ceros iniciales.';
  }
  const identification = String(value).trim();
  if (!identification) return options.required ? 'Ingrese la identificación.' : '';
  const documentType = normalizarTipoIdentificacion_(tipo);
  if (documentType === TIPOS_IDENTIFICACION.NO_ESPECIFICADO && legacyUnchanged) return '';
  if (!documentType) return 'Seleccione el tipo de identificación.';
  if (documentType === TIPOS_IDENTIFICACION.CEDULA_EC) {
    if (!/^\d{10}$/.test(identification)) return 'La cédula ecuatoriana debe contener exactamente 10 dígitos.';
    if (!esCedulaEcuatorianaValida_(identification)) {
      return 'La cédula no supera la validación de estructura y dígito verificador; esto no confirma la identidad de la persona.';
    }
    return '';
  }
  if (documentType === TIPOS_IDENTIFICACION.RUC_EC) {
    return /^\d{13}$/.test(identification)
      ? ''
      : 'El RUC ecuatoriano debe contener exactamente 13 dígitos. El formato no confirma su vigencia ni existencia.';
  }
  if (documentType === TIPOS_IDENTIFICACION.CONSUMIDOR_FINAL) {
    if (!options.allowConsumerFinal) {
      return 'Consumidor final solo es válido como tipo de identificación fiscal de facturación.';
    }
    return identification === '9999999999999'
      ? ''
      : 'Para consumidor final, la identificación SRI debe ser exactamente 9999999999999.';
  }
  if (![TIPOS_IDENTIFICACION.PASAPORTE, TIPOS_IDENTIFICACION.OTRO, TIPOS_IDENTIFICACION.NO_ESPECIFICADO].includes(documentType)) {
    return 'Seleccione un tipo de identificación válido.';
  }
  if (documentType === TIPOS_IDENTIFICACION.NO_ESPECIFICADO && !options.allowUnspecified) {
    return 'Seleccione el tipo de identificación.';
  }
  return /^[\p{L}\p{N}][\p{L}\p{N} .\/-]{0,63}$/u.test(identification)
    ? ''
    : 'El documento admite hasta 64 caracteres alfanuméricos, espacios, punto, guion o barra.';
}

function validarCapacitador_(data, options) {
  options = options || {};
  const nombre = String(data.nombre || '').trim().replace(/\s+/g, ' ');
  const rawIdentification = data.identificacion === undefined ? '' : data.identificacion;
  const identificacion = typeof rawIdentification === 'string' ? rawIdentification.trim() : rawIdentification;
  const tipoIdentificacion = normalizarTipoIdentificacion_(data.tipoIdentificacion || data.TipoIdentificacion || '');
  const resumen = String(data.resumen || '').trim();
  if (nombre.length < 5 || nombre.length > 160) throw new Error('Ingrese el nombre completo del capacitador (5 a 160 caracteres).');
  const identityError = validarIdentificacion_(tipoIdentificacion, identificacion, {
    allowLegacyUnchanged: !!options.allowLegacyUnchanged,
    legacyOriginal: options.legacyOriginal,
    allowUnspecified: !!options.allowUnspecified,
  });
  if (identityError) throw new Error(identityError);
  if (resumen.length > 1000) throw new Error('El resumen profesional no puede superar 1000 caracteres.');
  return { nombre: nombre, identificacion: identificacion, tipoIdentificacion: tipoIdentificacion, resumen: resumen };
}

function getCapacitadores(user) {
  requireAdmin(user);
  return { success: true, data: sheetToObjects(getSheet('Capacitadores')) };
}

function getIdentityIntegrityReport(user) {
  requireAdmin(user);
  const definitions = [
    { sheet: 'Capacitadores', field: 'Identificacion', typeField: 'TipoIdentificacion', label: 'Capacitadores' },
    { sheet: 'Inscripciones', field: 'ClienteID', typeField: 'ClienteTipoIdentificacion', label: 'Participantes / clientes' },
    { sheet: 'Inscripciones', field: 'RUC', typeField: 'TipoIdentificacionFactura', label: 'Identificación fiscal de facturación' },
    { sheet: 'CertificadosProfesionales', field: 'Identificacion', typeField: 'TipoIdentificacion', label: 'Certificados de capacitadores' },
    { sheet: 'Egresos', field: 'ProveedorIdentificacion', label: 'Proveedores' },
    { sheet: 'FacturasFiscales', field: 'BuyerIdentification', typeField: 'BuyerIdentificationType', label: 'Facturación electrónica SRI' },
  ];
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const data = definitions.map(function(definition) {
    const sheet = spreadsheet.getSheetByName(definition.sheet);
    if (!sheet || sheet.getLastRow() < 2 || sheet.getLastColumn() < 1) {
      return { modulo: definition.label, registros: 0, celdasNumericas: 0, posiblesCerosInicialesPerdidos: 0, cedulasNoValidas: 0, duplicadosTipados: 0 };
    }
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
      .map(function(header) { return String(header || '').trim(); });
    const fieldIndex = headers.indexOf(definition.field);
    const typeIndex = definition.typeField ? headers.indexOf(definition.typeField) : -1;
    if (fieldIndex < 0) {
      return { modulo: definition.label, registros: 0, celdasNumericas: 0, posiblesCerosInicialesPerdidos: 0, cedulasNoValidas: 0, duplicadosTipados: 0 };
    }
    const rowCount = sheet.getLastRow() - 1;
    const identityValues = sheet.getRange(2, fieldIndex + 1, rowCount, 1).getValues();
    const typeValues = typeIndex >= 0
      ? sheet.getRange(2, typeIndex + 1, rowCount, 1).getValues()
      : Array.from({ length: rowCount }, function() { return ['']; });
    let registros = 0;
    let celdasNumericas = 0;
    let posiblesCerosInicialesPerdidos = 0;
    let cedulasNoValidas = 0;
    let duplicadosTipados = 0;
    const seen = Object.create(null);
    identityValues.forEach(function(row, index) {
      const raw = row[0];
      if (raw === '' || raw === null || raw === undefined) return;
      registros += 1;
      const value = typeof raw === 'string' ? raw.trim() : String(raw);
      const documentType = typeIndex >= 0 ? normalizarTipoIdentificacion_(typeValues[index][0]) : '';
      const tipoNoEspecificado = !documentType || documentType === TIPOS_IDENTIFICACION.NO_ESPECIFICADO;
      if (typeof raw === 'number') celdasNumericas += 1;
      // Es un indicio, no una reparación: Sheets puede haber descartado el cero
      // antes de que Finance recibiera el valor. También se marcan cadenas cortas
      // con longitud sospechosa para no perder el hallazgo si alguien abrió/guardó
      // un legacy como texto sin completar ni validar el documento.
      if ((documentType === TIPOS_IDENTIFICACION.CEDULA_EC && /^\d{9}$/.test(value))
        || (tipoNoEspecificado && (/^\d{9}$/.test(value) || (definition.field === 'RUC' && /^\d{12}$/.test(value))))) {
        posiblesCerosInicialesPerdidos += 1;
      }
      if (documentType === TIPOS_IDENTIFICACION.CEDULA_EC && !esCedulaEcuatorianaValida_(value)) cedulasNoValidas += 1;
      if (documentType && value) {
        const key = documentType + '|' + value.toUpperCase();
        if (seen[key]) duplicadosTipados += 1;
        seen[key] = true;
      }
    });
    return { modulo: definition.label, registros: registros, celdasNumericas: celdasNumericas,
      posiblesCerosInicialesPerdidos: posiblesCerosInicialesPerdidos, cedulasNoValidas: cedulasNoValidas,
      duplicadosTipados: duplicadosTipados };
  });
  return { success: true, data: { soloLectura: true, generadoEn: new Date().toISOString(), modulos: data,
    advertencia: 'Los conteos son diagnósticos, no demuestran pérdida ni pertenencia del documento. No se modificó ningún registro y no se reconstruyen ceros automáticamente.' } };
}

function addCapacitador(user, { capacitador } = {}) {
  requireAdmin(user);
  return conBloqueoCertificados(function() {
    const data = validarCapacitador_(capacitador || {});
    const sheet = getSheet('Capacitadores');
    const identityKey = data.tipoIdentificacion + '|' + String(data.identificacion || '').trim().toUpperCase();
    if (data.identificacion && sheetToObjects(sheet).some(function(item) {
      return (normalizarTipoIdentificacion_(item.TipoIdentificacion) || TIPOS_IDENTIFICACION.NO_ESPECIFICADO)
        + '|' + String(item.Identificacion || '').trim().toUpperCase() === identityKey;
    })) {
      return { success: false, error: 'Ya existe un capacitador con esa identificación.' };
    }
    const now = new Date().toISOString();
    const id = generateId('CAP');
    const rowNumber = appendObjectBySheetHeaders_(sheet, {
      ID: id, Nombre: data.nombre, Identificacion: data.identificacion, Resumen: data.resumen,
      Activo: true, CreadoPor: user.Username, CreadoEn: now, ActualizadoPor: user.Username,
      ActualizadoEn: now, TipoIdentificacion: data.tipoIdentificacion,
    });
    try {
      registrarAuditoriaCertificado({ certificadoId: '', inscripcionId: '', usuario: user.Username, rol: user.Rol,
        accion: 'TRAINER_PROFILE_CREATED', canal: 'panel', resultado: 'ok', metadatos: { capacitadorId: id } });
    } catch (error) {
      sheet.deleteRow(rowNumber);
      throw error;
    }
    return { success: true, id: id };
  });
}

function updateCapacitador(user, { id, capacitador } = {}) {
  requireAdmin(user);
  return conBloqueoCertificados(function() {
    const sheet = getSheet('Capacitadores');
    const row = sheetToObjects(sheet).find(function(item) { return item.ID === id; });
    if (!row) return { success: false, error: 'Capacitador no encontrado.' };
    const input = capacitador || {};
    const data = validarCapacitador_({
      nombre: input.nombre === undefined ? row.Nombre : input.nombre,
      identificacion: input.identificacion === undefined ? row.Identificacion : input.identificacion,
      tipoIdentificacion: input.tipoIdentificacion === undefined && input.TipoIdentificacion === undefined
        ? (row.TipoIdentificacion || TIPOS_IDENTIFICACION.NO_ESPECIFICADO)
        : (input.tipoIdentificacion || input.TipoIdentificacion),
      resumen: input.resumen === undefined ? row.Resumen : input.resumen,
    }, {
      allowLegacyUnchanged: !row.TipoIdentificacion
        && String(input.identificacion === undefined ? row.Identificacion : input.identificacion) === String(row.Identificacion),
      legacyOriginal: row.Identificacion,
      allowUnspecified: !row.TipoIdentificacion,
    });
    const identityKey = data.tipoIdentificacion + '|' + String(data.identificacion || '').trim().toUpperCase();
    if (data.identificacion && sheetToObjects(sheet).some(function(item) {
      return item.ID !== id
        && (normalizarTipoIdentificacion_(item.TipoIdentificacion) || TIPOS_IDENTIFICACION.NO_ESPECIFICADO)
          + '|' + String(item.Identificacion || '').trim().toUpperCase() === identityKey;
    })) {
      return { success: false, error: 'Ya existe otro capacitador con esa identificación.' };
    }
    const previous = { Nombre: row.Nombre, Identificacion: row.Identificacion, TipoIdentificacion: row.TipoIdentificacion, Resumen: row.Resumen,
      Activo: row.Activo, ActualizadoPor: row.ActualizadoPor, ActualizadoEn: row.ActualizadoEn };
    const serviceSheet = getSheet('Servicios');
    const linked = sheetToObjects(serviceSheet).filter(function(item) { return item.CapacitadorID === id; });
    try {
      updateRow(sheet, row, { Nombre: data.nombre, Identificacion: data.identificacion,
        TipoIdentificacion: data.tipoIdentificacion, Resumen: data.resumen,
        Activo: input.activo === undefined ? row.Activo : input.activo,
        ActualizadoPor: user.Username, ActualizadoEn: new Date().toISOString() });
      linked.forEach(function(item) { updateRow(serviceSheet, item, { Capacitador: data.nombre }); });
      registrarAuditoriaCertificado({ certificadoId: '', inscripcionId: '', usuario: user.Username, rol: user.Rol,
        accion: 'TRAINER_PROFILE_UPDATED', canal: 'panel', resultado: 'ok', metadatos: { capacitadorId: id, serviciosVinculados: linked.length } });
    } catch (error) {
      updateRow(sheet, row, previous);
      linked.forEach(function(item) { updateRow(serviceSheet, item, { Capacitador: item.Capacitador }); });
      throw error;
    }
    bustSheet('servicios');
    return { success: true };
  });
}

function perfilCapacitadorServicio_(servicio, fallbackId, fallbackName) {
  const id = String(servicio.capacitadorId === undefined ? fallbackId || '' : servicio.capacitadorId || '').trim();
  if (!id) return { id: '', nombre: String(servicio.capacitador === undefined ? fallbackName || '' : servicio.capacitador || '').trim() };
  const profile = sheetToObjects(getSheet('Capacitadores')).find(function(item) { return item.ID === id; });
  if (!profile || (profile.Activo !== true && String(profile.Activo).toUpperCase() !== 'TRUE' && id !== fallbackId)) {
    throw new Error('La ficha del capacitador no existe o está inactiva.');
  }
  return { id: id, nombre: profile.Nombre };
}

// Lectura solamente: un capacitador no es una inscripción y nunca debe pasar por
// emitirCertificado ni por el verificador/archivo privado de alumnos.
function preflightCertificadoCapacitador(user, { servicioId } = {}) {
  requireAdmin(user);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const serviceSheet = ss.getSheetByName('Servicios');
  const trainerSheet = ss.getSheetByName('Capacitadores');
  const services = serviceSheet ? sheetToObjects(serviceSheet).filter(function(item) { return item.ID === String(servicioId || ''); }) : [];
  if (services.length !== 1) return { success: false, error: 'Servicio no encontrado o duplicado.' };
  const service = services[0];
  const trainerId = String(service.CapacitadorID || '').trim();
  const trainers = trainerId && trainerSheet
    ? sheetToObjects(trainerSheet).filter(function(item) { return item.ID === trainerId; }) : [];
  const trainer = trainers.length === 1 ? trainers[0] : null;
  const blockers = [];
  if (!trainerId) blockers.push('Vincule una ficha de capacitador al servicio; el nombre escrito manualmente no acredita identidad.');
  else if (!trainer) blockers.push('La ficha de capacitador vinculada no existe o está duplicada.');
  if (trainer && !esVerdadero(trainer.Activo)) blockers.push('La ficha del capacitador está inactiva.');
  if (trainer && !String(trainer.Identificacion || '').trim()) blockers.push('Falta la identificación del capacitador.');
  if (trainer && trainer.Identificacion && trainer.TipoIdentificacion
      && validarIdentificacion_(trainer.TipoIdentificacion, String(trainer.Identificacion), {})) {
    blockers.push(validarIdentificacion_(trainer.TipoIdentificacion, String(trainer.Identificacion), {}));
  }
  if (trainer && !String(trainer.Resumen || '').trim()) blockers.push('Falta el resumen profesional del capacitador.');
  if (trainer && String(service.Capacitador || '').trim() !== String(trainer.Nombre || '').trim()) {
    blockers.push('El nombre mostrado en el servicio no coincide con la ficha vinculada.');
  }
  if (!String(service.Nombre || '').trim()) blockers.push('Falta el nombre del curso o evento.');
  const duration = String(service.Duracion || '').trim();
  if (!/^\d+(?:[.,]\d+)?(?:\s*(?:h|hrs?\.?|horas?))?$/i.test(duration) || Number(duration.replace(',', '.').match(/^\d+(?:\.\d+)?/)?.[0] || 0) <= 0) {
    blockers.push('Defina la duración académica en horas (por ejemplo, 40 o 40 horas).');
  }
  const start = fechaSolo(service.FechaEvento);
  const end = fechaSolo(service.FechaFinEvento || service.FechaEvento);
  if (!start || !end || end < start) {
    blockers.push('Defina fechas válidas de inicio y fin del curso.');
  }
  if (String(service.EstadoEvento || '').toLowerCase() === 'cancelado') blockers.push('El evento está cancelado.');
  if (String(service.EstadoEvento || '').toLowerCase() !== 'finalizado') blockers.push('Marque el evento como finalizado antes de certificar al capacitador.');
  const todayEcuador = Utilities.formatDate(new Date(), 'America/Guayaquil', 'yyyy-MM-dd');
  if (end && end > todayEcuador) blockers.push('El curso todavía no ha terminado.');
  const professionalSheet = ss.getSheetByName('CertificadosProfesionales');
  const previous = professionalSheet ? sheetToObjects(professionalSheet).filter(function(item) {
    return item.ServicioID === service.ID && item.CapacitadorID === trainerId && item.Rol === 'capacitador';
  }) : [];
  const current = previous.find(function(item) { return ['emitido', 'enviado'].indexOf(estadoNormalizadoCertificado(item)) !== -1; });
  const templateReady = PropertiesService.getScriptProperties().getProperty(CERTIFICATE_V2_ACTIVE_PROPERTY) === 'ON';
  return { success: true, data: {
    tipo: 'capacitador', servicioId: service.ID, capacitadorId: trainerId,
    nombre: trainer ? trainer.Nombre : '', identificacion: trainer ? trainer.Identificacion : '',
    tipoIdentificacion: trainer ? (trainer.TipoIdentificacion || TIPOS_IDENTIFICACION.NO_ESPECIFICADO) : '',
    resumen: trainer ? trainer.Resumen : '', curso: service.Nombre || '',
    duracion: duration, modalidad: service.Modalidad || '', fechaInicio: start, fechaFin: end,
    datosCompletos: blockers.length === 0, bloqueosDatos: blockers,
    certificadoId: current ? current.ID : '', codigoCertificado: current ? current.CodigoCertificado : '',
    historial: previous.map(function(item) { return { id: item.ID, codigo: item.CodigoCertificado,
      version: Number(item.CertificateVersion) || 1, estado: estadoNormalizadoCertificado(item),
      fecha: item.IssuedAt || item.CertificatePreparedAt || '', actor: item.IssuedBy || '',
      motivo: item.ReissueReason || item.VoidReason || '', plantilla: item.TemplateVersion || '',
      snapshotVerificado: Boolean(leerSnapshotDocumentalCertificado_(item)),
      pdfArchivado: Boolean(item.PdfHash && /^[a-f0-9]{64}$/i.test(String(item.PdfHash))
        && String(item.PdfStorageReference || '').indexOf('certificate-drive:') === 0) }; }),
    emisionHabilitada: blockers.length === 0 && templateReady && previous.length === 0,
    bloqueoEmision: previous.length && !current ? 'Ya existe una versión histórica; utilice reemisión en vez de crear otro certificado.'
      : templateReady ? (blockers.length ? 'Complete las condiciones del evento.' : '')
      : 'La plantilla de seguridad requiere las firmas auténticas y activación administrativa.',
  } };
}

function buscarCertificadoProfesional_(identifier) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('CertificadosProfesionales');
  if (!sheet) return null;
  const matches = sheetToObjects(sheet).filter(function(item) {
    return item.ID === identifier || item.CodigoCertificado === identifier;
  });
  return matches.length === 1 ? matches[0] : null;
}

function certificadoProfesionalParaCliente_(row) {
  return {
    ID: row.ID, CertificatePublicId: row.ID, CertificateSubject: 'professional', ProfessionalRole: row.Rol,
    ClienteNombre: row.Nombre, ClienteID: row.Identificacion, ClienteTipoIdentificacion: row.TipoIdentificacion || TIPOS_IDENTIFICACION.NO_ESPECIFICADO,
    ServicioNombre: row.ServicioNombre,
    Duracion: row.Duracion, Modalidad: row.Modalidad, FechaInicio: row.FechaInicio, FechaFin: row.FechaFin,
    CodigoCertificado: row.CodigoCertificado, CertificateVersion: Number(row.CertificateVersion) || 1,
    TemplateVersion: row.TemplateVersion, CertificateStatus: row.CertificateStatus,
    EstadoCertificado: row.CertificateStatus, FechaEmisionCertificado: row.IssuedAt,
    PdfHash: row.PdfHash || '', PdfStorageReference: row.PdfStorageReference || '',
    IssuedBy: row.IssuedBy || '', ReissueReason: row.ReissueReason || '',
    OriginalCertificateId: row.OriginalCertificateId || '', ReplacesCertificateId: row.ReplacesCertificateId || '',
    ReissuedCertificateId: row.ReissuedCertificateId || '', CertificatePreparedAt: row.CertificatePreparedAt || '',
  };
}

function emitirCertificadoCapacitador(user, { servicioId } = {}) {
  requireCertificateAdmin(user, 'TRAINER_CERTIFICATE_ISSUE', { canal: 'api' });
  return conBloqueoCertificados(function() {
    const preflight = preflightCertificadoCapacitador(user, { servicioId: servicioId });
    if (!preflight.success) return preflight;
    const info = preflight.data;
    if (info.certificadoId) {
      const current = buscarCertificadoProfesional_(info.certificadoId);
      return { success: true, alreadyIssued: true, data: certificadoProfesionalParaCliente_(current) };
    }
    if (!info.emisionHabilitada) return { success: false, error: info.bloqueosDatos.concat(info.bloqueoEmision).filter(Boolean).join(' ') };
    const templateVersion = plantillaActivaCertificado_();
    if ([CERTIFICATE_SECURITY_TEMPLATE_VERSION, CERTIFICATE_SECURITY_TEMPLATE_V3_VERSION].indexOf(templateVersion) === -1) return { success: false, error: 'La plantilla profesional todavía no está activa.' };
    const id = generateId('CPR');
    const now = new Date().toISOString();
    const code = generarCodigoCertificadoUnico({ ID: id, FechaEmisionCertificado: now }, id, '');
    const sheet = getSheet('CertificadosProfesionales');
    const record = {
      ID: id, CapacitadorID: info.capacitadorId, ServicioID: info.servicioId, Rol: 'capacitador',
      Nombre: info.nombre, Identificacion: info.identificacion, TipoIdentificacion: info.tipoIdentificacion, Resumen: info.resumen,
      ServicioNombre: info.curso, Duracion: info.duracion, Modalidad: info.modalidad,
      FechaInicio: info.fechaInicio, FechaFin: info.fechaFin, Lugar: '',
      CodigoCertificado: code, CertificateVersion: 1, TemplateVersion: templateVersion,
      CertificateStatus: 'emitido', IssuedAt: now, IssuedBy: user.Username, CreatedAt: now,
    };
    Object.assign(record, snapshotDocumentalCertificado_('profesional', {
      Nombre: record.Nombre, Identificacion: record.Identificacion, TipoIdentificacion: record.TipoIdentificacion,
      Resumen: record.Resumen, ServicioNombre: record.ServicioNombre, Duracion: record.Duracion,
      Modalidad: record.Modalidad, FechaInicio: record.FechaInicio, FechaFin: record.FechaFin,
      CodigoCertificado: record.CodigoCertificado, CertificateVersion: record.CertificateVersion,
      TemplateVersion: record.TemplateVersion, IssuedAt: now, IssuedBy: user.Username,
      SignatureHashes: huellasFirmasOficialesCertificado_(),
    }));
    const certificateRowNumber = appendObjectBySheetHeaders_(sheet, record);
    try {
      registrarAuditoriaCertificado({ certificadoId: code, inscripcionId: '', usuario: user.Username, rol: user.Rol,
        accion: 'TRAINER_CERTIFICATE_ISSUED', canal: 'panel', resultado: 'ok', metadatos: { certificateId: id, servicioId: info.servicioId, capacitadorId: info.capacitadorId } });
    } catch (error) { sheet.deleteRow(certificateRowNumber); throw error; }
    return { success: true, data: certificadoProfesionalParaCliente_(buscarCertificadoProfesional_(id)) };
  });
}

function getCertificadoCapacitadorParaDescarga(user, { id } = {}) {
  requireCertificateAdmin(user, 'TRAINER_CERTIFICATE_DOWNLOAD', { canal: 'api' });
  const row = buscarCertificadoProfesional_(String(id || ''));
  const status = estadoNormalizadoCertificado(row || {});
  if (!row || ['emitido', 'enviado', 'reemitido', 'anulado'].indexOf(status) === -1) {
    return { success: false, error: 'No existe una versión de certificado profesional descargable con ese identificador.' };
  }
  if (!String(row.PdfStorageReference || '').startsWith('certificate-drive:') || !/^[a-f0-9]{64}$/i.test(String(row.PdfHash || ''))) {
    return { success: false, error: 'Esta versión no tiene un PDF histórico íntegro archivado; no se regeneró con la plantilla actual.' };
  }
  return { success: true, data: certificadoProfesionalParaCliente_(row) };
}

function anularCertificadoCapacitador(user, { id, motivo, confirmacion } = {}) {
  requireCertificateAdmin(user, 'TRAINER_CERTIFICATE_VOID', { canal: 'api' });
  if (confirmacion !== 'ANULAR' || String(motivo || '').trim().length < 5) return { success: false, error: 'Confirme la anulación y explique el motivo.' };
  return conBloqueoCertificados(function() {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('CertificadosProfesionales');
    const row = buscarCertificadoProfesional_(String(id || ''));
    if (!sheet || !row || estadoNormalizadoCertificado(row) !== 'emitido') return { success: false, error: 'Solo puede anularse un certificado profesional vigente.' };
    const now = new Date().toISOString();
    updateRow(sheet, row, { CertificateStatus: 'anulado', VoidedAt: now, VoidedBy: user.Username, VoidReason: String(motivo).trim() });
    try {
      registrarAuditoriaCertificado({ certificadoId: row.CodigoCertificado, inscripcionId: '', usuario: user.Username, rol: user.Rol,
        accion: 'TRAINER_CERTIFICATE_VOIDED', estadoAnterior: 'emitido', estadoNuevo: 'anulado', canal: 'panel', resultado: 'ok', motivo: String(motivo).trim() });
    } catch (error) {
      updateRow(sheet, row, { CertificateStatus: row.CertificateStatus, VoidedAt: row.VoidedAt, VoidedBy: row.VoidedBy, VoidReason: row.VoidReason });
      throw error;
    }
    return { success: true };
  });
}

function reemitirCertificadoCapacitador(user, { id, motivo, confirmacion } = {}) {
  requireCertificateAdmin(user, 'TRAINER_CERTIFICATE_REISSUE', { canal: 'api' });
  if (confirmacion !== 'REEMITIR' || String(motivo || '').trim().length < 5) return { success: false, error: 'Confirme la reemisión y explique el motivo.' };
  return conBloqueoCertificados(function() {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('CertificadosProfesionales');
    const original = buscarCertificadoProfesional_(String(id || ''));
    if (!sheet || !original) {
      return { success: false, error: 'La versión profesional no se puede reemitir.' };
    }
    const allVersions = sheetToObjects(sheet).filter(function(item) {
      return item.CapacitadorID === original.CapacitadorID && item.ServicioID === original.ServicioID && item.Rol === original.Rol;
    });
    const pending = allVersions.find(function(item) {
      return item.ReplacesCertificateId === original.ID && estadoNormalizadoCertificado(item) === 'pendiente_pdf';
    });
    if (pending) {
      if (String(pending.ReissueReason || '') !== String(motivo).trim()) {
        return { success: false, error: 'Ya existe una reemisión pendiente. Reintente con el mismo motivo para completar esa versión.' };
      }
      return { success: true, alreadyPrepared: true, data: certificadoProfesionalParaCliente_(pending) };
    }
    if (['emitido', 'enviado', 'anulado'].indexOf(estadoNormalizadoCertificado(original)) === -1) {
      return { success: false, error: 'Solo una versión vigente o anulada puede reemitirse.' };
    }
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const trainers = sheetToObjects(ss.getSheetByName('Capacitadores')).filter(function(item) { return item.ID === original.CapacitadorID; });
    const services = sheetToObjects(ss.getSheetByName('Servicios')).filter(function(item) { return item.ID === original.ServicioID; });
    if (trainers.length !== 1 || services.length !== 1 || String(services[0].CapacitadorID || '') !== String(trainers[0].ID || '')) {
      return { success: false, error: 'No se pudo vincular de forma inequívoca la ficha vigente del capacitador y el servicio.' };
    }
    const trainer = trainers[0];
    const service = services[0];
    const newId = generateId('CPR');
    const now = new Date().toISOString();
    const version = allVersions.reduce(function(max, item) { return Math.max(max, Number(item.CertificateVersion) || 1); }, 0) + 1;
    const code = generarCodigoCertificadoUnico({ ID: newId, FechaEmisionCertificado: now }, newId, '');
    const next = Object.assign({}, original, {
      ID: newId, CodigoCertificado: code,
      Nombre: trainer.Nombre, Identificacion: trainer.Identificacion, TipoIdentificacion: trainer.TipoIdentificacion || TIPOS_IDENTIFICACION.NO_ESPECIFICADO,
      Resumen: trainer.Resumen, ServicioNombre: service.Nombre, Duracion: service.Duracion,
      Modalidad: service.Modalidad || '', FechaInicio: fechaSolo(service.FechaEvento), FechaFin: fechaSolo(service.FechaFinEvento || service.FechaEvento),
      CertificateVersion: version, TemplateVersion: plantillaActivaCertificado_(),
      PdfHash: '', PdfStorageReference: '', OriginalCertificateId: original.OriginalCertificateId || original.ID,
      ReplacesCertificateId: original.ID, ReissuedCertificateId: '', CertificateStatus: 'pendiente_pdf',
      CertificatePreparedAt: now, IssuedAt: '', IssuedBy: user.Username,
      VoidedAt: '', VoidedBy: '', VoidReason: '', ReissueReason: String(motivo).trim(), CreatedAt: now,
    });
    Object.assign(next, snapshotDocumentalCertificado_('profesional', {
      Nombre: next.Nombre, Identificacion: next.Identificacion, TipoIdentificacion: next.TipoIdentificacion,
      Resumen: next.Resumen, ServicioNombre: next.ServicioNombre, Duracion: next.Duracion,
      Modalidad: next.Modalidad, FechaInicio: next.FechaInicio, FechaFin: next.FechaFin,
      CodigoCertificado: next.CodigoCertificado, CertificateVersion: next.CertificateVersion,
      TemplateVersion: next.TemplateVersion, IssuedAt: next.CertificatePreparedAt, IssuedBy: user.Username,
      SignatureHashes: huellasFirmasOficialesCertificado_(),
    }));
    const certificateRowNumber = appendObjectBySheetHeaders_(sheet, next);
    try {
      registrarAuditoriaCertificado({ certificadoId: next.CodigoCertificado, inscripcionId: '', usuario: user.Username, rol: user.Rol,
        accion: 'TRAINER_CERTIFICATE_REISSUE_STARTED', estadoAnterior: original.CertificateStatus, estadoNuevo: 'pendiente_pdf', canal: 'panel', resultado: 'pendiente', motivo: String(motivo).trim(),
        metadatos: { originalCertificateId: original.ID, newCertificateId: newId, version: version, templateVersion: next.TemplateVersion } });
    } catch (error) {
      sheet.deleteRow(certificateRowNumber);
      throw error;
    }
    return { success: true, data: certificadoProfesionalParaCliente_(buscarCertificadoProfesional_(newId)) };
  });
}

function getServicios(user, params) {
  // No usar cache aqui: el administrador edita fechas/capacitador y necesita
  // ver el dato persistido inmediatamente. Con cache de 180s parecia que no
  // guardaba aunque Sheets si aceptara la escritura.
  return { success: true, data: sheetToObjects(getSheet('Servicios')) };
}

function servicioRequiereDuracion(tipo) {
  const normalized = String(tipo || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return ['curso', 'certificacion', 'taller', 'certificado lms', 'capacitacion'].indexOf(normalized) !== -1;
}

function tipoCertificadoServicio_(value) {
  const normalized = String(value || 'aprobacion').trim().toLowerCase();
  if (['aprobacion', 'asistencia', 'participacion', 'capacitacion'].indexOf(normalized) === -1) {
    throw new Error('Tipo de certificado inválido. Seleccione aprobación, asistencia, participación o capacitación.');
  }
  return normalized;
}

function addServicio(user, { servicio }) {
  requireAdmin(user);
  if (servicioRequiereDuracion(servicio.tipo) && !String(servicio.duracion || '').trim()) {
    return { success: false, error: 'La duración académica es obligatoria para este tipo de servicio.' };
  }
  const sheet = getSheet('Servicios');
  const perfil = perfilCapacitadorServicio_(servicio, '');
  const id    = generateId('SRV');
  const now   = new Date().toISOString();
  sheet.appendRow([
    id, servicio.nombre, servicio.tipo, servicio.modalidad || 'N/A',
    Number(servicio.precio) || 0, servicio.duracion || '',
    servicio.descripcion || '', true, now,
    servicio.fechaEvento || '', servicio.fechaFinEvento || '', servicio.lugarEvento || '',
    perfil.nombre, servicio.estadoEvento || 'programado',
    tipoCertificadoServicio_(servicio.tipoCertificado), perfil.id,
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
  function pick(field, fallback) {
    return servicio[field] === undefined ? fallback : servicio[field];
  }
  const tipo = servicio.tipo === undefined ? row.Tipo : servicio.tipo;
  const duracion = servicio.duracion === undefined ? row.Duracion : servicio.duracion;
  const perfil = perfilCapacitadorServicio_(servicio, row.CapacitadorID, row.Capacitador);
  if (servicioRequiereDuracion(tipo) && !String(duracion || '').trim()) {
    return { success: false, error: 'La duración académica es obligatoria para este tipo de servicio.' };
  }
  updateRow(sheet, row, {
    Nombre: pick('nombre', row.Nombre), Tipo: pick('tipo', row.Tipo), Modalidad: pick('modalidad', row.Modalidad),
    Precio: servicio.precio === undefined ? row.Precio : (Number(servicio.precio) || 0),
    Duracion: pick('duracion', row.Duracion),
    Descripcion: pick('descripcion', row.Descripcion),
    Activo: pick('activo', row.Activo),
    FechaEvento: pick('fechaEvento', row.FechaEvento || ''),
    FechaFinEvento: pick('fechaFinEvento', row.FechaFinEvento || ''),
    LugarEvento: pick('lugarEvento', row.LugarEvento || ''),
    Capacitador: perfil.nombre,
    EstadoEvento: pick('estadoEvento', row.EstadoEvento || 'programado'),
    TipoCertificado: tipoCertificadoServicio_(pick('tipoCertificado', row.TipoCertificado || 'aprobacion')),
    CapacitadorID: perfil.id,
  });
  SpreadsheetApp.flush();
  bustSheet('servicios');
  bustSheet('inscripciones');
  bustSheet('calendario');
  return { success: true };
}

function getCalendario(user, { year, month } = {}) {
  const now   = new Date();
  const yr    = year  || now.getFullYear();
  const mn    = month || null; // null = todo el año

  function parseDateOnly(dateStr) {
    if (!dateStr) return null;
    const d = new Date(ds(dateStr) + 'T12:00:00Z');
    return isNaN(d) ? null : d;
  }

  function rangeOverlaps(startStr, endStr) {
    const start = parseDateOnly(startStr);
    if (!start) return false;
    const end = parseDateOnly(endStr || startStr) || start;
    const rangeStart = mn === null ? new Date(yr, 0, 1, 12) : new Date(yr, mn - 1, 1, 12);
    const rangeEnd = mn === null ? new Date(yr, 11, 31, 12) : new Date(yr, mn, 0, 12);
    return start <= rangeEnd && end >= rangeStart;
  }

  const eventos = [];
  const servicioEventos = {};

  // Servicios con fechaEvento programada
  const servicios = sheetToObjects(getSheet('Servicios'));
  servicios.forEach(function(s) {
    const estadoEvento = String(s.EstadoEvento || 'programado').toLowerCase();
    if (['finalizado','oculto','cancelado'].indexOf(estadoEvento) !== -1) return;
    if (!rangeOverlaps(s.FechaEvento, s.FechaFinEvento)) return;
    const detalle = [];
    if (s.Tipo) detalle.push(s.Tipo);
    if (s.Capacitador) detalle.push('Capacitador: ' + s.Capacitador);
    if (s.LugarEvento) detalle.push(s.LugarEvento);
    const evento = {
      id:     s.ID,
      fecha:  s.FechaEvento,
      fechaFin: s.FechaFinEvento || s.FechaEvento,
      titulo: s.Nombre,
      tipo:   'Servicio',
      sub:    detalle.join(' · '),
      capacitador: s.Capacitador || '',
      estadoEvento: estadoEvento,
      cursoActivo: s.Activo === true || s.Activo === 'TRUE',
      color:  'blue',
      inscritos: 0,
    };
    eventos.push(evento);
    servicioEventos[String(s.ID || '')] = evento;
  });

  // Inscripciones: no se muestran una por una para evitar saturar el calendario.
  // Se agregan como conteo por curso/fecha, visible en el evento del servicio o
  // como resumen si la inscripción no tiene un servicio fechado asociado.
  const inscripciones = sheetToObjects(getSheet('Inscripciones'));
  const resumenInscripciones = {};
  inscripciones.forEach(function(i) {
    if (!rangeOverlaps(i.FechaInicio, i.FechaInicio)) return;
    const servicioId = String(i.ServicioID || '');
    const servicioEvento = servicioEventos[servicioId];
    if (servicioEvento) {
      servicioEvento.inscritos = (Number(servicioEvento.inscritos) || 0) + 1;
      return;
    }
    const fecha = ds(i.FechaInicio);
    const nombre = String(i.ServicioNombre || i.ServicioID || 'Curso sin nombre');
    const key = fecha + '|' + nombre;
    if (!resumenInscripciones[key]) {
      resumenInscripciones[key] = {
        id:     'INS_RESUMEN_' + key,
        fecha:  fecha,
        fechaFin: fecha,
        titulo: nombre,
        tipo:   'ResumenInscripciones',
        sub:    '0 inscritos',
        inscritos: 0,
        color:  'green',
      };
    }
    resumenInscripciones[key].inscritos += 1;
    resumenInscripciones[key].sub = resumenInscripciones[key].inscritos + ' inscritos';
  });
  Object.keys(resumenInscripciones).forEach(function(key) {
    eventos.push(resumenInscripciones[key]);
  });

  // Proyecciones futuras
  const proyecciones = sheetToObjects(getSheet('Proyecciones'));
  proyecciones.forEach(function(p) {
    if (!rangeOverlaps(p.FechaEstimada, p.FechaEstimada)) return;
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
  // Las credenciales del aula son datos operativos sensibles: el vendedor
  // puede seguir viendo su inscripción, pero nunca recibe usuario/contraseña,
  // URL privada ni metadatos de carga. Solo administración y el rol Moodle
  // obtienen esos campos mediante getInscripciones.
  ['MoodleUsername','MoodlePassword','MoodleUrl','MoodleStatus','MoodleLoadedBy',
    'MoodleLoadedAt','MoodleLastSentAt','MoodleNotes'].forEach(function(field) {
    delete resumen[field];
  });
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

function validarDatosInscripcion(inscripcion, options) {
  options = options || {};
  if (!inscripcion) return 'Los datos de la inscripción son obligatorios.';
  if (!inscripcion.servicioId && !inscripcion.servicioNombre) return 'Seleccione un servicio.';
  if (!String(inscripcion.clienteNombre || '').trim()) return 'Ingrese el nombre del participante.';
  const identityError = validarIdentificacion_(inscripcion.clienteTipoIdentificacion, inscripcion.clienteID, {
    allowLegacyUnchanged: !!options.allowLegacyIdentityUnchanged,
    legacyOriginal: options.legacyIdentityOriginal,
    allowUnspecified: !!options.allowUnspecifiedIdentity,
  });
  if (identityError) return identityError;
  const rawTaxIdentity = inscripcion.ruc;
  const unchangedLegacyTaxIdentity = options.allowLegacyTaxIdentityUnchanged
    && String(rawTaxIdentity === undefined || rawTaxIdentity === null ? '' : rawTaxIdentity)
      === String(options.legacyTaxIdentityOriginal === undefined || options.legacyTaxIdentityOriginal === null ? '' : options.legacyTaxIdentityOriginal);
  if (rawTaxIdentity !== undefined && rawTaxIdentity !== null && rawTaxIdentity !== ''
      && typeof rawTaxIdentity !== 'string' && !unchangedLegacyTaxIdentity) {
    return 'La identificación fiscal debe enviarse como texto para preservar sus ceros iniciales.';
  }
  if (rawTaxIdentity !== undefined && rawTaxIdentity !== null && String(rawTaxIdentity).trim()) {
    const sameAsParticipant = typeof inscripcion.clienteID === 'string'
      && String(rawTaxIdentity).trim() === inscripcion.clienteID.trim();
    const billingType = normalizarTipoIdentificacion_(inscripcion.tipoIdentificacionFactura)
      || (sameAsParticipant ? normalizarTipoIdentificacion_(inscripcion.clienteTipoIdentificacion) : '');
    const unchangedLegacyBillingType = options.allowLegacyBillingTypeUnchanged
      && unchangedLegacyTaxIdentity
      && (!billingType || billingType === TIPOS_IDENTIFICACION.NO_ESPECIFICADO);
    if (!billingType && !unchangedLegacyBillingType) {
      return 'Seleccione el tipo de identificación fiscal para los datos de facturación.';
    }
    if (!unchangedLegacyBillingType) {
      const billingIdentityError = validarIdentificacion_(billingType, rawTaxIdentity, {
        allowConsumerFinal: true,
        allowLegacyUnchanged: unchangedLegacyTaxIdentity && billingType === TIPOS_IDENTIFICACION.NO_ESPECIFICADO,
        legacyOriginal: options.legacyTaxIdentityOriginal,
      });
      if (billingIdentityError) return 'Identificación fiscal: ' + billingIdentityError;
    }
  }
  const monto = Number(inscripcion.monto);
  if (String(inscripcion.monto === undefined ? '' : inscripcion.monto).trim() === '' || !isFinite(monto) || monto < 0) return 'Ingrese un monto válido.';
  if (!options.permitirMetodoPagoPendiente && !String(inscripcion.metodoPago || '').trim()) return 'Seleccione el método de pago.';
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

/** Normaliza para búsqueda libre: minúsculas, sin espacios sobrantes. No quita
 * acentos (no se pidió) para no producir falsos positivos entre nombres distintos. */
function normalizarBusquedaInscripcion_(value) {
  return String(value === undefined || value === null ? '' : value).toLowerCase().trim().replace(/\s+/g, ' ');
}

/** Buscador libre de Inscripciones (filtros.q): case-insensitive y tolerante a
 * espacios sobre nombre, cédula/RUC, email, comprobante e IDs de CRM. El
 * comprobante usa el mismo fallback a Notas que NumeroComprobanteMostrado
 * (ver inscripcionEnriquecida) solo para registros legacy sin comprobante
 * estructurado -- nunca sustituye NumeroComprobante como fuente principal. */
function coincideBusquedaInscripcion_(row, q) {
  const numeroComprobante = row.NumeroComprobante || row.Notas || '';
  const campos = [
    row.ClienteNombre, row.ClienteID, row.ClienteEmail, numeroComprobante,
    row.CRMEnrollmentID, row.CRMContactID, row.RazonSocial,
  ];
  return campos.some(function(campo) { return normalizarBusquedaInscripcion_(campo).indexOf(q) !== -1; });
}

/** Índice InscripcionID -> factura mínima, UNA sola lectura de FacturasFiscales
 * para toda la lista de Inscripciones (evita N+1: sin esto, cada fila dispararía
 * su propia lectura de la hoja fiscal). No copia la factura completa, solo lo
 * mínimo que Inscripciones necesita mostrar.
 *
 * `environment` es OBLIGATORIO y filtra estrictamente por Factura.Environment: sin
 * esto, un DRAFT de prueba (Environment='test') podía indexarse junto a facturas
 * production del mismo InscripcionID y hacer aparecer una inscripción productiva
 * como "ya facturada" cuando en realidad solo existe un borrador de prueba (bug real
 * de QA). Nunca se une por nombre/cédula/monto, solo InscripcionID + Environment. */
function indiceFacturasPorInscripcion_(environment) {
  const indice = {};
  sheetToObjects(getSheet('FacturasFiscales')).forEach(function(f) {
    if (!f.InscripcionID) return;
    if (f.Environment !== environment) return;
    const existente = indice[f.InscripcionID];
    // from-inscripcion.js es idempotente por InscripcionID+environment (una sola
    // factura por inscripción dentro de cada ambiente); si alguna vez hubiera más de
    // una fila histórica, se conserva la más reciente por CreatedAt en vez de fallar.
    if (!existente || new Date(f.CreatedAt || 0) >= new Date(existente.CreatedAt || 0)) {
      indice[f.InscripcionID] = f;
    }
  });
  return indice;
}

function facturaResumenParaInscripcion_(factura) {
  if (!factura) return { FacturaID: '', FacturaStatus: '', FacturaNumero: '', FacturaReviewFlag: '', FacturaEnvironment: '' };
  return {
    FacturaID: factura.ID || '',
    FacturaStatus: factura.Status || '',
    FacturaNumero: factura.DocumentNumber || '',
    FacturaReviewFlag: factura.ReviewFlag || '',
    FacturaEnvironment: factura.Environment || '',
  };
}

function getInscripciones(user, { filtros = {} } = {}) {
  if (!isVendedor(user) && !isMoodle(user)) throw new Error('Acceso denegado.');
  const existingSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Inscripciones');
  let data = existingSheet ? filasInscripcionesDecoradas(existingSheet).rows : [];
  // El encargado Moodle necesita localizar cualquier estudiante; no puede
  // crear/editar inscripciones generales, solo usar las acciones Moodle.
  if (!isAdmin(user) && !isMoodle(user)) data = data.filter(i => i.CreadoPor === user.Username);
  if (filtros.vendedor && isAdmin(user)) data = data.filter(i => i.CreadoPor === filtros.vendedor);
  if (filtros.q && normalizarBusquedaInscripcion_(filtros.q)) {
    const q = normalizarBusquedaInscripcion_(filtros.q);
    data = data.filter(i => coincideBusquedaInscripcion_(i, q));
  }
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
  const agreements = sheetToObjects(getSheet('Convenios'));
  const services = sheetToObjects(getSheet('Servicios'));
  const agreementById = {};
  agreements.forEach(function(item) { agreementById[String(item.ID || '')] = item; });
  const usuarios = mapaUsuariosPorUsername();
  // Default seguro para la vista administrativa productiva: si no se pide
  // explícitamente 'test', el estado fiscal mostrado en Inscripciones es SIEMPRE de
  // production, para que un DRAFT de prueba nunca aparente ser una factura real.
  const fiscalEnvironment = filtros.fiscalEnvironment === 'test' ? 'test' : 'production';
  const facturaIndice = indiceFacturasPorInscripcion_(fiscalEnvironment);
  data = data.map(function(i) {
    var enriched = Object.assign(
      inscripcionEnriquecida(inscripcionSinMetadatosInternos(i), duracionDe, usuarios),
      facturaResumenParaInscripcion_(facturaIndice[i.ID]),
    );
    return isAdmin(user) || isMoodle(user) ? enriched : resumenCertificadoParaVendedor(enriched);
  });
  return { success: true, data };
}

function requireMoodleEditor_(user) {
  if (!isAdmin(user) && !isMoodle(user)) {
    throw new Error('Acceso denegado: se requiere administración o el rol Moodle.');
  }
}

function registrarAuditoriaMoodle_(evento) {
  const metadata = evento.metadatos && typeof evento.metadatos === 'object'
    ? JSON.stringify(evento.metadatos).slice(0, 1500)
    : '';
  getSheet('AuditoriaMoodle').appendRow([
    generateId('AUDM'),
    String(evento.inscripcionId || ''),
    String(evento.usuario || ''),
    String(evento.rol || ''),
    String(evento.accion || ''),
    new Date().toISOString(),
    String(evento.resultado || 'ok'),
    metadata,
  ]);
}

function updateMoodleCredentials(user, { id, moodle } = {}) {
  requireMoodleEditor_(user);
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Inscripciones');
  if (!sheet) return { success: false, error: 'No existe la hoja Inscripciones.' };
  const row = sheetToObjects(sheet).find(function(item) { return String(item.ID || '') === String(id || ''); });
  if (!row) return { success: false, error: 'Inscripción no encontrada.' };
  moodle = moodle && typeof moodle === 'object' ? moodle : {};

  const username = Object.prototype.hasOwnProperty.call(moodle, 'username')
    ? String(moodle.username || '').trim()
    : String(row.MoodleUsername || '').trim();
  // El formulario deja la contraseña en blanco para conservarla. Nunca se
  // escribe ni se registra en auditoría salvo en la celda protegida de la fila.
  const submittedPassword = Object.prototype.hasOwnProperty.call(moodle, 'password')
    ? String(moodle.password || '').trim()
    : '';
  const password = submittedPassword || String(row.MoodlePassword || '').trim();
  const url = Object.prototype.hasOwnProperty.call(moodle, 'url')
    ? String(moodle.url || '').trim()
    : String(row.MoodleUrl || '').trim();
  const notes = Object.prototype.hasOwnProperty.call(moodle, 'notes')
    ? String(moodle.notes || '').trim()
    : String(row.MoodleNotes || '').trim();

  if (username && !password) return { success: false, error: 'Ingrese la contraseña Moodle para guardar el acceso.' };
  if (password && !username) return { success: false, error: 'Ingrese el usuario Moodle para guardar el acceso.' };
  if ((username || password) && !url) return { success: false, error: 'Ingrese la URL del aula virtual para guardar el acceso completo.' };
  if (url && !/^https?:\/\//i.test(url)) return { success: false, error: 'La URL del aula virtual debe comenzar con http:// o https://.' };

  const status = username && password ? 'cargado' : 'pendiente';
  const fields = {
    MoodleUsername: username,
    MoodleUrl: url,
    MoodleStatus: status,
    MoodleLoadedBy: user.Username,
    MoodleLoadedAt: new Date().toISOString(),
    MoodleNotes: notes,
  };
  if (submittedPassword) fields.MoodlePassword = submittedPassword;
  actualizarFilaInscripcionFisica(sheet, row._row, fields);
  SpreadsheetApp.flush();
  const updated = filaInscripcionPorNumero(sheet, row._row);
  const expected = {
    MoodleUsername: username,
    MoodleUrl: url,
    MoodleStatus: status,
    MoodleNotes: notes,
  };
  if (!updated || !camposPersistidosCoinciden(updated, expected)
      || (submittedPassword && String(updated.MoodlePassword || '') !== submittedPassword)) {
    throw new Error('No se pudo verificar el guardado de las credenciales Moodle.');
  }
  registrarAuditoriaMoodle_({
    inscripcionId: row.ID,
    usuario: user.Username,
    rol: user.Rol,
    accion: 'MOODLE_CREDENTIALS_UPDATED',
    resultado: 'ok',
    metadatos: { status: status, hasUsername: !!username, hasUrl: !!url },
  });
  return { success: true, data: inscripcionSinMetadatosInternos(updated), status: status };
}

function registrarEnvioMoodle(user, { id } = {}) {
  requireAdmin(user);
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Inscripciones');
  if (!sheet) return { success: false, error: 'No existe la hoja Inscripciones.' };
  const row = sheetToObjects(sheet).find(function(item) { return String(item.ID || '') === String(id || ''); });
  if (!row) return { success: false, error: 'Inscripción no encontrada.' };
  if (!String(row.MoodleUsername || '').trim() || !String(row.MoodlePassword || '').trim()) {
    return { success: false, error: 'Cargue usuario y contraseña Moodle antes de preparar el envío.' };
  }
  if (!String(row.MoodleUrl || '').trim()) {
    return { success: false, error: 'Registre la URL del aula virtual antes de preparar el envío.' };
  }
  const sentAt = new Date().toISOString();
  // La acción abre WhatsApp con el mensaje listo; el envío real lo confirma
  // manualmente el administrador en WhatsApp. No marcar como entregado aún.
  actualizarFilaInscripcionFisica(sheet, row._row, { MoodleStatus: 'preparado', MoodleLastSentAt: sentAt });
  SpreadsheetApp.flush();
  const updated = filaInscripcionPorNumero(sheet, row._row);
  if (!updated || String(updated.MoodleStatus || '') !== 'preparado' || String(updated.MoodleLastSentAt || '') !== sentAt) {
    throw new Error('No se pudo verificar el registro del envío Moodle.');
  }
  registrarAuditoriaMoodle_({
    inscripcionId: row.ID,
    usuario: user.Username,
    rol: user.Rol,
    accion: 'MOODLE_WHATSAPP_PREPARED',
    resultado: 'ok',
    metadatos: { hasPhone: !!String(row.ClienteTelefono || '').replace(/\D/g, '') },
  });
  return { success: true, data: inscripcionSinMetadatosInternos(updated), status: 'preparado' };
}

function esSolicitudImportacionCrm(params) {
  const inscripcion = params && params.inscripcion;
  return Boolean(inscripcion && (
    tienePropiedad(params, 'idempotencyKey')
    || tienePropiedad(inscripcion, 'crmEnrollmentId')
  ));
}

function valorCrmPreferido(preferido, fallback) {
  if (preferido !== undefined && preferido !== null && String(preferido).trim() !== '') return preferido;
  return fallback;
}

function normalizarNombreServicioCrm(value) {
  return String(value || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function resolverServicioImportacionCrm(nombreSolicitado) {
  const normalized = normalizarNombreServicioCrm(nombreSolicitado);
  if (!normalized) return null;
  const matches = sheetToObjects(getSheet('Servicios')).filter(function(servicio) {
    return esVerdadero(servicio.Activo) && normalizarNombreServicioCrm(servicio.Nombre) === normalized;
  });
  return matches.length === 1 ? matches[0] : null;
}

// Vínculo estable CRM -> Finance (Course.financeServiceId). A diferencia del
// emparejamiento por nombre, un ID que no resuelve a un Servicio Activo NO
// cae al nombre: el vínculo está roto y debe arreglarse, no enmascararse con
// una coincidencia por nombre que podría ser el servicio equivocado.
function resolverServicioPorIdImportacionCrm(servicioId) {
  const id = String(servicioId || '').trim();
  if (!id) return null;
  const matches = sheetToObjects(getSheet('Servicios')).filter(function(servicio) {
    return esVerdadero(servicio.Activo) && String(servicio.ID || '').trim() === id;
  });
  return matches.length === 1 ? matches[0] : null;
}

function eliminarFilaCreadaPorId(sheet, id) {
  const row = sheetToObjects(sheet).find(function(item) { return String(item.ID || '') === String(id || ''); });
  if (row) sheet.deleteRow(row._row);
}

function importCrmEnrollment(user, { idempotencyKey, inscripcion } = {}) {
  if (!isVendedor(user)) throw new Error('Acceso denegado.');
  inscripcion = inscripcion || {};
  const crmEnrollmentId = String(inscripcion.crmEnrollmentId || '').trim();
  const requestedKey = String(idempotencyKey || '').trim();
  if (!crmEnrollmentId) return { success: false, error: 'El identificador de inscripción CRM es obligatorio.' };
  if (!requestedKey || requestedKey !== crmEnrollmentId) {
    return { success: false, error: 'El identificador idempotente de CRM no coincide.' };
  }

  return conBloqueoCertificados(function() {
    const sheet = getSheet('Inscripciones');
    asegurarColumnasInscripcion(sheet, ['CRMEnrollmentID','CRMContactID','CRMCourseID','Origen']);
    const existing = filasInscripcionesDecoradas(sheet).rows.filter(function(row) {
      return String(row.CRMEnrollmentID || '').trim() === crmEnrollmentId;
    });
    if (existing.length > 1) {
      return { success: false, error: 'El identificador CRM tiene múltiples registros en Finance.' };
    }
    if (existing.length === 1) {
      const existingId = String(existing[0].ID || '').trim();
      return existingId
        ? { success: true, id: existingId }
        : { success: false, error: 'La inscripción CRM existente no tiene un ID válido.' };
    }

    const participant = inscripcion.participant && typeof inscripcion.participant === 'object'
      ? inscripcion.participant : {};
    const participantName = String(valorCrmPreferido(
      participant.fullName,
      [participant.firstName, participant.lastName].filter(Boolean).join(' ') || inscripcion.clienteNombre,
    ) || '').trim();
    if (!participantName) return { success: false, error: 'El participante de CRM es obligatorio.' };
    const participantEmail = String(valorCrmPreferido(participant.email, inscripcion.clienteEmail) || '').trim();
    if (participantEmail && !emailValido(participantEmail)) {
      return { success: false, error: 'El correo del participante no es válido.' };
    }
    const participantPhone = String(valorCrmPreferido(participant.phone, inscripcion.clienteTelefono) || '').trim();
    const rawIdentification = valorCrmPreferido(participant.identification, inscripcion.clienteID);
    const rawIdentificationType = valorCrmPreferido(
      participant.identificationType,
      valorCrmPreferido(participant.identification_type,
        valorCrmPreferido(inscripcion.identificationType, inscripcion.clienteTipoIdentificacion)),
    );
    const identificationType = rawIdentificationType === undefined || rawIdentificationType === null || rawIdentificationType === ''
      ? TIPOS_IDENTIFICACION.NO_ESPECIFICADO
      : normalizarTipoIdentificacion_(rawIdentificationType);
    const identificationError = validarIdentificacion_(identificationType, rawIdentification, { allowUnspecified: true });
    if (identificationError) return { success: false, error: 'La identificación enviada por CRM no es válida: ' + identificationError };
    const identification = rawIdentification === undefined || rawIdentification === null ? '' : String(rawIdentification).trim();
    const requestedServiceId = String(valorCrmPreferido(inscripcion.financeServiceId, inscripcion.serviceId) || '').trim();
    const requestedCourse = valorCrmPreferido(inscripcion.courseTitle, inscripcion.servicioNombre);
    const service = requestedServiceId
      ? resolverServicioPorIdImportacionCrm(requestedServiceId)
      : resolverServicioImportacionCrm(requestedCourse);
    if (!service) return { success: false, error: 'Servicio de Finance no configurado para este curso.' };

    const amountValue = valorCrmPreferido(inscripcion.amount, inscripcion.monto);
    const amount = Number(amountValue);
    if (String(amountValue === undefined || amountValue === null ? '' : amountValue).trim() === ''
        || !isFinite(amount) || amount < 0) {
      return { success: false, error: 'El monto enviado por CRM no es válido.' };
    }
    const modality = String(valorCrmPreferido(
      inscripcion.modality,
      valorCrmPreferido(inscripcion.modalidad, service.Modalidad),
    ) || '').trim();
    if (!modality) return { success: false, error: 'La modalidad enviada por CRM es obligatoria.' };
    const startRaw = valorCrmPreferido(inscripcion.startDate, inscripcion.fechaInicio);
    const endRaw = valorCrmPreferido(inscripcion.endDate, inscripcion.fechaFin);
    const startDate = startRaw ? fechaSolo(startRaw) : '';
    const endDate = endRaw ? fechaSolo(endRaw) : '';
    if (startRaw && !startDate) return { success: false, error: 'La fecha de inicio enviada por CRM no es válida.' };
    if (endRaw && !endDate) return { success: false, error: 'La fecha de fin enviada por CRM no es válida.' };
    if (startDate && endDate && endDate < startDate) {
      return { success: false, error: 'La fecha de fin enviada por CRM no puede ser anterior a la fecha de inicio.' };
    }

    const id = generateId('INS');
    const ingresoId = generateId('ING');
    const now = new Date().toISOString();
    const values = {
      ID: id,
      ClienteNombre: participantName,
      ClienteID: identification,
      ClienteTipoIdentificacion: identificationType,
      ClienteEmail: participantEmail,
      ClienteTelefono: participantPhone,
      ServicioID: service.ID,
      ServicioNombre: service.Nombre,
      Modalidad: modality,
      FechaInicio: startDate,
      FechaFin: endDate,
      Monto: amount,
      MetodoPago: '',
      RazonSocial: '',
      RUC: '',
      TipoIdentificacionFactura: '',
      DireccionFactura: '',
      EstadoPago: 'pendiente',
      EstadoCertificado: 'pendiente',
      IngresoID: ingresoId,
      Notas: String(inscripcion.notas || '').trim(),
      CreadoPor: user.Username,
      FechaCreacion: now,
      FechaEmisionCertificado: '',
      RequiereAvalExterno: false,
      EstadoAval: '',
      AvalReferencia: '',
      FechaAval: '',
      ValorAval: 0,
      NumeroComprobante: '',
      FechaPago: '',
      FechaVerificacionPago: '',
      VerificadoPor: '',
      InstitucionAval: '',
      CodigoCertificado: '',
      EmitidoPor: '',
      EstadoEntrega: 'pendiente',
      FechaEntregaCertificado: '',
      EntregadoPor: '',
      AvalEnlaceExterno: '',
      AvalCodigoExterno: '',
      CRMEnrollmentID: crmEnrollmentId,
      CRMContactID: String(inscripcion.crmContactId || '').trim(),
      CRMCourseID: String(inscripcion.crmCourseId || '').trim(),
      Origen: 'CRM',
    };

    const incomeSheet = getSheet('Ingresos');
    let enrollmentCreated = false;
    let incomeCreated = false;
    try {
      appendInscripcionPorEncabezados(sheet, values);
      enrollmentCreated = true;
      incomeSheet.appendRow([
        ingresoId,
        now.slice(0, 10),
        tipoIngresoPorModalidad(modality),
        modality,
        'Inscripción: ' + participantName + ' — ' + service.Nombre,
        participantName,
        '',
        amount,
        '',
        'pendiente_verificacion',
        '',
        user.Username,
        now,
        participantPhone,
        '',
      ]);
      incomeCreated = true;
      registrarAuditoriaCertificado({
        inscripcionId: id,
        usuario: user.Username,
        rol: user.Rol,
        accion: 'INSCRIPTION_CREATED',
        estadoNuevo: 'INSCRIPTION_CREATED',
        canal: 'crm',
        resultado: 'ok',
        metadatos: { crmEnrollmentId: crmEnrollmentId, origen: 'CRM' },
      });
    } catch (error) {
      if (incomeCreated) eliminarFilaCreadaPorId(incomeSheet, ingresoId);
      if (enrollmentCreated) eliminarFilaCreadaPorId(sheet, id);
      throw new Error('No se pudo completar la importación desde CRM.');
    }
    return { success: true, id: id };
  });
}

function addInscripcion(user, params) {
  if (esSolicitudImportacionCrm(params)) return importCrmEnrollment(user, params);
  const inscripcion = params && params.inscripcion;
  if (!isVendedor(user)) throw new Error('Acceso denegado.');
  const requiereAval = !!(inscripcion && inscripcion.requiereAvalExterno);
  let institucionAval = '';
  let institucionAvalId = '';
  let convenioAvalId = '';
  let servicioAval = null;
  if (requiereAval) {
    institucionAvalId = String(inscripcion.institucionAvalId || '').trim();
    if (!institucionAvalId) return { success: false, error: 'Seleccione una institución de la ficha maestra para el aval.' };
    if (isAval(user) && !isAdmin(user)) {
      const assignedInstitutionId = institucionAvalIdDelUsuario_(user);
      if (!assignedInstitutionId || assignedInstitutionId !== institucionAvalId) {
        return { success: false, error: 'Su usuario institucional solo puede registrar avales para la institución que tiene asignada.' };
      }
    }
    const institutionResult = resolverInstitucionMaestra_(institucionAvalId, { permitirInactiva: false });
    if (!institutionResult.success) return institutionResult;
    institucionAval = institutionResult.data.Nombre;
    convenioAvalId = String(inscripcion.convenioId || '').trim();
    const agreementResult = resolverConvenioEconomicoAval_(convenioAvalId, institucionAvalId);
    if (!agreementResult.success) return agreementResult;
    const serviceId = String(inscripcion.servicioId || '').trim();
    servicioAval = serviceId && sheetToObjects(getSheet('Servicios')).find(function(item) { return String(item.ID || '') === serviceId; });
    if (!servicioAval || !esVerdadero(servicioAval.Activo)) {
      return { success: false, error: 'Seleccione un servicio activo de la lista para registrar un aval institucional.' };
    }
    if (String(inscripcion.servicioNombre || '').trim() !== String(servicioAval.Nombre || '').trim()) {
      return { success: false, error: 'El nombre del servicio no coincide con el servicio seleccionado. Vuelva a seleccionarlo.' };
    }
  }
  const validationError = validarDatosInscripcion(requiereAval
    ? Object.assign({}, inscripcion, { institucionAval: institucionAval })
    : inscripcion);
  if (validationError) return { success: false, error: validationError };
  const sheet    = getSheet('Inscripciones');
  const id       = generateId('INS');
  const now      = new Date().toISOString();
  const estadosPago = ['pendiente', 'pagado', 'verificado', 'cancelado'];
  const estadoSolicitado = estadosPago.indexOf(inscripcion.estadoPago) > -1 ? inscripcion.estadoPago : 'pendiente';
  const estadoPago = isAdmin(user) ? estadoSolicitado : 'pendiente';
  const numeroComprobante = String(inscripcion.numeroComprobante || '').trim();
  const fechaPago = fechaSolo(inscripcion.fechaPago);

  appendInscripcionPorEncabezados(sheet, {
    ID: id,
    ClienteNombre: inscripcion.clienteNombre,
    ClienteID: typeof inscripcion.clienteID === 'string' ? inscripcion.clienteID.trim() : (inscripcion.clienteID || ''),
    ClienteTipoIdentificacion: normalizarTipoIdentificacion_(inscripcion.clienteTipoIdentificacion || '') || '',
    ClienteEmail: inscripcion.clienteEmail || '',
    ClienteTelefono: inscripcion.clienteTelefono || '',
    ServicioID: servicioAval ? servicioAval.ID : (inscripcion.servicioId || ''),
    ServicioNombre: servicioAval ? servicioAval.Nombre : inscripcion.servicioNombre,
    Modalidad: inscripcion.modalidad || 'N/A',
    FechaInicio: fechaSolo(inscripcion.fechaInicio),
    FechaFin: fechaSolo(inscripcion.fechaFin),
    Monto: Number(inscripcion.monto) || 0,
    MetodoPago: inscripcion.metodoPago || '',
    RazonSocial: inscripcion.razonSocial || '',
    RUC: typeof inscripcion.ruc === 'string' ? inscripcion.ruc.trim() : (inscripcion.ruc || ''),
    TipoIdentificacionFactura: normalizarTipoIdentificacion_(inscripcion.tipoIdentificacionFactura)
      || (String(inscripcion.ruc || '').trim()
        && String(inscripcion.ruc).trim() === String(inscripcion.clienteID || '').trim()
        ? normalizarTipoIdentificacion_(inscripcion.clienteTipoIdentificacion) : ''),
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
    InstitucionAval: requiereAval ? institucionAval : '',
    InstitucionID: requiereAval ? institucionAvalId : '',
    ConvenioID: requiereAval ? convenioAvalId : '',
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

  const requiereAval = tienePropiedad(inscripcion, 'requiereAvalExterno')
    ? !!inscripcion.requiereAvalExterno
    : esVerdadero(row.RequiereAvalExterno);
  let institucionAval = requiereAval ? String(row.InstitucionAval || '').trim() : '';
  let institucionAvalId = requiereAval ? String(row.InstitucionID || '').trim() : '';
  const nombreInstitucionSolicitado = String(inscripcion.institucionAval || '').trim();
  const nombreInstitucionCambioSinId = requiereAval && tienePropiedad(inscripcion, 'institucionAval')
    && nombreInstitucionSolicitado !== String(row.InstitucionAval || '').trim()
    && !(tienePropiedad(inscripcion, 'institucionAvalId') && String(inscripcion.institucionAvalId || '').trim());
  if (nombreInstitucionCambioSinId) {
    const crmLegacySnapshot = String(row.Origen || '').trim().toUpperCase() === 'CRM' && !row.InstitucionID;
    if (!crmLegacySnapshot) {
      return { success: false, error: 'Seleccione una institución de la ficha maestra; no se puede cambiar solo el nombre.' };
    }
    // Compatibilidad con el endpoint comercial previo: el CRM aún envía un
    // snapshot textual y no recibe IDs internos de Finance. No se autoenlaza.
    institucionAval = nombreInstitucionSolicitado;
  }
  if (requiereAval && tienePropiedad(inscripcion, 'institucionAvalId')) {
    const requestedId = String(inscripcion.institucionAvalId || '').trim();
    if (requestedId) {
      const institutionResult = resolverInstitucionMaestra_(requestedId, {
        permitirInactiva: requestedId === String(row.InstitucionID || '').trim(),
      });
      if (!institutionResult.success) return institutionResult;
      institucionAvalId = requestedId;
      institucionAval = requestedId === String(row.InstitucionID || '').trim()
        ? String(row.InstitucionAval || institutionResult.data.Nombre).trim()
        : institutionResult.data.Nombre;
    } else if (row.InstitucionID) {
      // Mantener la relación existente si el formulario no cambia la institución.
      institucionAvalId = String(row.InstitucionID).trim();
      institucionAval = String(row.InstitucionAval || '').trim();
    } else if (String(inscripcion.institucionAval || '').trim() !== String(row.InstitucionAval || '').trim()
        && String(row.Origen || '').trim().toUpperCase() !== 'CRM') {
      return { success: false, error: 'Seleccione una institución de la ficha maestra; no se puede cambiar solo el nombre.' };
    }
  }
  if (requiereAval && !institucionAval && !institucionAvalId) {
    return { success: false, error: 'Seleccione una institución de la ficha maestra para el aval.' };
  }
  if (requiereAval && isAval(user) && !isAdmin(user)) {
    const assignedInstitutionId = institucionAvalIdDelUsuario_(user);
    if (!assignedInstitutionId || assignedInstitutionId !== institucionAvalId) {
      return { success: false, error: 'Su usuario institucional solo puede gestionar avales de la institución que tiene asignada.' };
    }
  }
  const convenioAvalId = requiereAval
    ? String(tienePropiedad(inscripcion, 'convenioId') ? inscripcion.convenioId || '' : row.ConvenioID || '').trim()
    : '';
  const convenioCambioSolicitado = requiereAval && tienePropiedad(inscripcion, 'convenioId')
    && convenioAvalId !== String(row.ConvenioID || '').trim();
  const institucionCambioSolicitado = requiereAval && institucionAvalId
    && institucionAvalId !== String(row.InstitucionID || '').trim();
  if (requiereAval && convenioAvalId && (convenioCambioSolicitado || institucionCambioSolicitado)) {
    const agreementResult = resolverConvenioEconomicoAval_(convenioAvalId, institucionAvalId);
    if (!agreementResult.success) return agreementResult;
  }
  if (requiereAval && !convenioAvalId && (convenioCambioSolicitado || institucionCambioSolicitado)) {
    return { success: false, error: 'Seleccione un convenio vigente asociado a la institución para el aval.' };
  }
  const merged = {
    clienteNombre: tienePropiedad(inscripcion, 'clienteNombre') ? inscripcion.clienteNombre : row.ClienteNombre,
    clienteID: tienePropiedad(inscripcion, 'clienteID') ? inscripcion.clienteID : row.ClienteID,
    clienteTipoIdentificacion: tienePropiedad(inscripcion, 'clienteTipoIdentificacion')
      ? inscripcion.clienteTipoIdentificacion
      : (row.ClienteTipoIdentificacion || TIPOS_IDENTIFICACION.NO_ESPECIFICADO),
    ruc: tienePropiedad(inscripcion, 'ruc') ? inscripcion.ruc : row.RUC,
    tipoIdentificacionFactura: tienePropiedad(inscripcion, 'tipoIdentificacionFactura')
      ? inscripcion.tipoIdentificacionFactura
      : (row.TipoIdentificacionFactura || (
        String(row.RUC === undefined || row.RUC === null ? '' : row.RUC).trim()
          && String(row.RUC === undefined || row.RUC === null ? '' : row.RUC).trim()
            === String(row.ClienteID === undefined || row.ClienteID === null ? '' : row.ClienteID).trim()
          ? (row.ClienteTipoIdentificacion || TIPOS_IDENTIFICACION.NO_ESPECIFICADO)
          : TIPOS_IDENTIFICACION.NO_ESPECIFICADO
      )),
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
    requiereAvalExterno: requiereAval,
    institucionAval: institucionAval,
    institucionAvalId: institucionAvalId,
    convenioId: convenioAvalId,
  };
  if (requiereAval && (tienePropiedad(inscripcion, 'servicioId') || tienePropiedad(inscripcion, 'servicioNombre'))) {
    const selectedServiceId = String(merged.servicioId || '').trim();
    if (selectedServiceId) {
      const selectedService = sheetToObjects(getSheet('Servicios')).find(function(item) { return String(item.ID || '') === selectedServiceId; });
      if (!selectedService) return { success: false, error: 'El servicio seleccionado ya no existe. Elija un servicio válido.' };
      const serviceChanged = selectedServiceId !== String(row.ServicioID || '').trim();
      if (serviceChanged && !esVerdadero(selectedService.Activo)) {
        return { success: false, error: 'No se puede asociar un aval nuevo a un servicio inactivo.' };
      }
      if (String(merged.servicioNombre || '').trim() !== String(selectedService.Nombre || '').trim()) {
        return { success: false, error: 'El nombre del servicio no coincide con el servicio seleccionado. Vuelva a seleccionarlo.' };
      }
    } else if (tienePropiedad(inscripcion, 'servicioId') && String(inscripcion.servicioId || '').trim() !== String(row.ServicioID || '').trim()) {
      return { success: false, error: 'Seleccione un servicio válido de la lista para cambiar el servicio asociado al aval.' };
    }
  }
  const validationError = validarDatosInscripcion(merged, {
    permitirMetodoPagoPendiente: String(row.Origen || '').trim().toUpperCase() === 'CRM'
      && String(row.EstadoPago || '').trim() !== 'verificado'
      && !String(merged.metodoPago || '').trim(),
    allowLegacyIdentityUnchanged: !row.ClienteTipoIdentificacion
      && normalizarTipoIdentificacion_(merged.clienteTipoIdentificacion) === TIPOS_IDENTIFICACION.NO_ESPECIFICADO
      && String(merged.clienteID === undefined || merged.clienteID === null ? '' : merged.clienteID) === String(row.ClienteID === undefined || row.ClienteID === null ? '' : row.ClienteID),
    legacyIdentityOriginal: row.ClienteID,
    allowUnspecifiedIdentity: String(row.Origen || '').trim().toUpperCase() === 'CRM' && !row.ClienteTipoIdentificacion,
    allowLegacyTaxIdentityUnchanged: String(merged.ruc === undefined || merged.ruc === null ? '' : merged.ruc)
      === String(row.RUC === undefined || row.RUC === null ? '' : row.RUC),
    legacyTaxIdentityOriginal: row.RUC,
    allowLegacyBillingTypeUnchanged: !row.TipoIdentificacionFactura
      && String(merged.ruc === undefined || merged.ruc === null ? '' : merged.ruc)
        === String(row.RUC === undefined || row.RUC === null ? '' : row.RUC),
  });
  if (validationError) return { success: false, error: validationError };

  const cambiaConfiguracionAval = requiereAval !== esVerdadero(row.RequiereAvalExterno)
    || (requiereAval && (!mismaInstitucionAval(institucionAval, row.InstitucionAval)
      || String(institucionAvalId || '') !== String(row.InstitucionID || '')
      || String(convenioAvalId || '') !== String(row.ConvenioID || '')));
  if (['emitido','enviado'].indexOf(estadoCertificado) !== -1 && cambiaConfiguracionAval) {
    return { success: false, error: 'No puede cambiar el tipo o la institución de aval de un certificado ya emitido.' };
  }
  if (row.EstadoAval === 'avalado') {
    const confirmedCriticalChanges = [
      ['ClienteNombre', merged.clienteNombre], ['ClienteID', merged.clienteID], ['ServicioID', merged.servicioId],
      ['ServicioNombre', merged.servicioNombre], ['Monto', merged.monto], ['InstitucionID', institucionAvalId],
      ['ConvenioID', convenioAvalId], ['RequiereAvalExterno', requiereAval],
    ].some(function(pair) { return campoInscripcionCambioReal(row, pair[0], pair[1]); });
    if (confirmedCriticalChanges) {
      return { success: false, error: 'El aval confirmado protege participante, servicio, institución, convenio y base económica. Solicite una corrección administrativa auditada.' };
    }
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
    clienteNombre: 'ClienteNombre', clienteID: 'ClienteID', clienteTipoIdentificacion: 'ClienteTipoIdentificacion', clienteEmail: 'ClienteEmail',
    clienteTelefono: 'ClienteTelefono', servicioId: 'ServicioID', servicioNombre: 'ServicioNombre',
    modalidad: 'Modalidad', metodoPago: 'MetodoPago', razonSocial: 'RazonSocial', ruc: 'RUC',
    tipoIdentificacionFactura: 'TipoIdentificacionFactura',
    direccionFactura: 'DireccionFactura', notas: 'Notas',
  };
  Object.keys(mappings).forEach(function(inputField) {
    if (tienePropiedad(inscripcion, inputField)) {
      const value = inscripcion[inputField];
      fieldMap[mappings[inputField]] = (inputField === 'clienteID' || inputField === 'ruc') && typeof value === 'string'
        ? value.trim()
        : value;
    }
  });
  if (tienePropiedad(inscripcion, 'fechaInicio')) fieldMap.FechaInicio = fechaInicioNueva;
  if (tienePropiedad(inscripcion, 'fechaFin')) fieldMap.FechaFin = fechaFinNueva;
  if (tienePropiedad(inscripcion, 'monto')) fieldMap.Monto = Number(inscripcion.monto);
  if (tienePropiedad(inscripcion, 'estadoPago')) fieldMap.EstadoPago = estadoPago;
  if (tienePropiedad(inscripcion, 'numeroComprobante')) fieldMap.NumeroComprobante = numeroComprobanteNuevo;
  if (tienePropiedad(inscripcion, 'fechaPago')) fieldMap.FechaPago = fechaPagoNueva;
  if (tienePropiedad(inscripcion, 'requiereAvalExterno') || tienePropiedad(inscripcion, 'institucionAval')
      || tienePropiedad(inscripcion, 'institucionAvalId') || tienePropiedad(inscripcion, 'convenioId')) {
    fieldMap.RequiereAvalExterno = requiereAval;
    fieldMap.InstitucionAval = institucionAval;
    fieldMap.InstitucionID = institucionAvalId;
    fieldMap.ConvenioID = convenioAvalId;
    fieldMap.EstadoAval = requiereAval ? (cambiaConfiguracionAval ? 'pendiente' : (row.EstadoAval || 'pendiente')) : '';
    fieldMap.AvalReferencia = cambiaConfiguracionAval ? '' : row.AvalReferencia;
    fieldMap.FechaAval = cambiaConfiguracionAval ? '' : row.FechaAval;
    fieldMap.ValorAval = cambiaConfiguracionAval ? 0 : row.ValorAval;
    fieldMap.AvalEnlaceExterno = cambiaConfiguracionAval ? '' : row.AvalEnlaceExterno;
    fieldMap.AvalCodigoExterno = cambiaConfiguracionAval ? '' : row.AvalCodigoExterno;
    if (cambiaConfiguracionAval) {
      fieldMap.AvalInstitucionID = '';
      fieldMap.AvalConvenioID = '';
      fieldMap.AvalBaseTipoAplicado = '';
      fieldMap.AvalMontoBase = '';
      fieldMap.AvalPorcentajeAplicado = '';
      fieldMap.AvalMontoCalculado = '';
      fieldMap.AvalConfirmadoPor = '';
    }
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
  const responseData = inscripcionEnriquecida(inscripcionSinMetadatosInternos(updated), duracionDe, usuarios);
  return {
    success: true,
    persistenceVerified: true,
    changedFields: changedFields,
    // Mantener la misma política de exposición que getInscripciones: los
    // vendedores pueden editar su registro, pero la respuesta nunca incluye
    // credenciales Moodle ya cargadas. Administración conserva la vista
    // completa; los roles Moodle no usan este endpoint de edición general.
    data: isAdmin(user) ? responseData : resumenCertificadoParaVendedor(responseData),
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
  const professionalSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('CertificadosProfesionales');
  if (professionalSheet && sheetToObjects(professionalSheet).some(function(item) {
    return String(item.CodigoCertificado || '').trim().toUpperCase() === normalized
      && String(item.ID || '') !== String(exceptCertificateId || '');
  })) return true;
  const avalSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('EntregablesAval');
  if (avalSheet && sheetToObjects(avalSheet).some(function(item) {
    return String(item.CodigoCertificado || '').trim().toUpperCase() === normalized
      && String(item.ID || '') !== String(exceptCertificateId || '');
  })) return true;
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
    CertificateType: row.CertificateType || 'aprobacion',
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
  const snapshot = leerSnapshotDocumentalCertificado_(certificado);
  const currentData = inscripcionEnriquecida(inscripcionSinMetadatosInternos(inscripcion), mapaDuracionServicios(), mapaUsuariosPorUsername());
  return Object.assign({}, currentData, snapshot && snapshot.tipo === 'participante' ? snapshot.datos : {}, {
    ID: certificado.ID,
    InscripcionID: inscripcion.ID,
    CertificatePublicId: certificado.ID,
    CodigoCertificado: certificado.CodigoCertificado,
    CertificateVersion: Number(certificado.CertificateVersion) || 1,
    TemplateVersion: certificado.TemplateVersion || 'legacy-v1',
    CertificateType: certificado.CertificateType || inscripcion.CertificateType || 'aprobacion',
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

function servicioParaCertificado_(row) {
  const servicios = sheetToObjects(getSheet('Servicios'));
  if (String(row.ServicioID || '').trim()) {
    return servicios.find(function(item) { return item.ID === row.ServicioID; }) || null;
  }
  const matches = servicios.filter(function(item) { return item.Nombre === row.ServicioNombre; });
  return matches.length === 1 ? matches[0] : null;
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

  if (row.CRMOfferType) {
    // Flujo comercial nuevo (FULL/INSTITUTIONAL): el certificado institucional se
    // emite con pago + curso completado, SIN esperar el aval externo -- el aval
    // habilita un segundo entregable separado (ver marcarAval/EntregablesAval), no
    // bloquea este. AVAL_UPGRADE no representa una certificación independiente.
    if (row.CRMOfferType === 'AVAL_UPGRADE') {
      return { success: false, error: 'Este registro es un upgrade de aval; el certificado se emite sobre la compra institucional original, no aquí.' };
    }
    if (row.CRMCompletionStatus !== CRM_COMPLETION_STATUS_COMPLETADO) {
      return { success: false, error: 'El curso debe estar completado/aprobado (confirmado por markCrmCourseCompleted) antes de emitir el certificado.' };
    }
    registrarAuditoriaCrm_({
      inscripcionId: row.ID, usuario: user.Username, rol: user.Rol,
      accion: 'CERTIFICATE_ELIGIBLE', resultado: 'ok',
      metadatos: { offerType: row.CRMOfferType },
    });
  } else if (esVerdadero(row.RequiereAvalExterno) && row.EstadoAval !== 'avalado') {
    // Comportamiento legacy INTACTO: registros importados por importCrmEnrollment o
    // manuales, sin CRMOfferType, siguen bloqueados hasta el aval, como hoy.
    return { success: false, error: 'El certificado requiere el aval institucional antes de poder emitirse.' };
  }
  const faltantes = datosFaltantesCertificado(row);
  if (faltantes.length) return { success: false, error: 'Faltan los siguientes datos para generar el certificado: ' + faltantes.join(', ') + '.' };

  const servicioCertificado = servicioParaCertificado_(row);
  if (!servicioCertificado) return { success: false, error: 'No se pudo vincular de forma inequívoca el servicio del certificado.' };
  const certificateType = tipoCertificadoServicio_(servicioCertificado.TipoCertificado);
  const activeTemplate = plantillaActivaCertificado_();
  if (certificateType !== 'aprobacion' && [CERTIFICATE_SECURITY_TEMPLATE_VERSION, CERTIFICATE_SECURITY_TEMPLATE_V3_VERSION].indexOf(activeTemplate) === -1) {
    return { success: false, error: 'El servicio requiere un certificado de ' + certificateType + ', pero la plantilla oficial sigue pendiente de firmas y activación. No se emitió un certificado incorrecto.' };
  }

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
    TemplateVersion: activeTemplate,
    CertificateType: certificateType,
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
  let certificado = asegurarRegistroCertificado(updated, user);
  if (!certificado.DocumentSnapshot) {
    const snapshot = snapshotDocumentalCertificado_('participante', datosSnapshotCertificadoParticipante_(updated, certificado));
    updateRow(getSheet('Certificados'), certificado, snapshot);
    certificado = sheetToObjects(getSheet('Certificados')).find(function(item) { return item.ID === certificado.ID; }) || Object.assign({}, certificado, snapshot);
  }
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
  const certificateSheet = getSheet('Certificados');
  const versions = sheetToObjects(certificateSheet).filter(function(item) { return item.InscripcionID === inscripcion.ID; });
  const pendingChildren = versions.filter(function(item) {
    return item.ReplacesCertificateId === original.ID && estadoNormalizadoCertificado(item) === 'pendiente_pdf';
  });
  if (pendingChildren.length) {
    const pending = pendingChildren[0];
    if (String(pending.ReissueReason || '') !== motivoSeguro) {
      return { success: false, error: 'Ya hay una reemisión pendiente de archivo. Reintente con el mismo motivo para completar esa versión.' };
    }
    return { success: true, alreadyPrepared: true, data: certificadoParaCliente(pending, inscripcion) };
  }
  if (estadoAnterior !== 'emitido' && estadoAnterior !== 'enviado' && estadoAnterior !== 'anulado') {
    return { success: false, error: 'Solo una versión vigente o anulada puede reemitirse.' };
  }
  const ahora = new Date().toISOString();
  const nuevoId = generateId('CRT');
  const nuevaVersion = versions.reduce(function(max, item) { return Math.max(max, Number(item.CertificateVersion) || 1); }, 0) + 1;
  const activeTemplate = plantillaActivaCertificado_();
  const certificateType = original.CertificateType || inscripcion.CertificateType || 'aprobacion';
  if (certificateType !== 'aprobacion' && [CERTIFICATE_SECURITY_TEMPLATE_VERSION, CERTIFICATE_SECURITY_TEMPLATE_V3_VERSION].indexOf(activeTemplate) === -1) {
    return { success: false, error: 'La plantilla oficial vigente no está lista para reemitir este tipo de certificado.' };
  }
  const nuevoCodigo = generarCodigoCertificadoUnico(
    { ID: nuevoId, FechaEmisionCertificado: ahora },
    nuevoId,
    inscripcion.ID
  );
  const nuevo = appendCertificado(Object.assign({
    ID: nuevoId,
    InscripcionID: inscripcion.ID,
    CodigoCertificado: nuevoCodigo,
    CertificateVersion: nuevaVersion,
    TemplateVersion: activeTemplate,
    CertificateType: certificateType,
    OriginalCertificateId: original.ID,
    ReplacesCertificateId: original.ID,
    CertificateStatus: 'pendiente_pdf',
    CertificatePreparedAt: ahora,
    IssuedAt: '',
    IssuedBy: user.Username,
    ReissueReason: motivoSeguro,
    CreatedAt: ahora,
  }, snapshotDocumentalCertificado_('participante', datosSnapshotCertificadoParticipante_(inscripcion, {
    ID: nuevoId, CodigoCertificado: nuevoCodigo, CertificateVersion: nuevaVersion,
    TemplateVersion: activeTemplate, CertificateType: certificateType,
    CertificatePreparedAt: ahora, IssuedBy: user.Username,
  }))));
  const newRowNumber = certificateSheet.getLastRow();
  try {
    registrarAuditoriaCertificado({
    certificadoId: nuevo.CodigoCertificado,
    inscripcionId: inscripcion.ID,
    usuario: user.Username,
    rol: user.Rol,
    accion: 'CERTIFICATE_REISSUE_STARTED',
    estadoAnterior: estadoAnterior,
    estadoNuevo: 'pendiente_pdf',
    canal: 'panel',
    resultado: 'pendiente',
    motivo: motivoSeguro,
    metadatos: {
      originalCertificateId: original.ID,
      newCertificateId: nuevo.ID,
      version: nuevaVersion,
      templateVersion: nuevo.TemplateVersion,
    },
  });
  } catch (error) {
    certificateSheet.deleteRow(newRowNumber);
    throw error;
  }
  return { success: true, data: certificadoParaCliente(nuevo, inscripcion) };
}

function resolverCertificadoVersionAdministrativo_(inscripcionId, certificateId) {
  const inscripcion = sheetToObjects(getSheet('Inscripciones')).find(function(item) { return item.ID === String(inscripcionId || ''); });
  if (!inscripcion) return null;
  const certificate = sheetToObjects(getSheet('Certificados')).find(function(item) { return item.ID === String(certificateId || ''); }) || null;
  if (certificate) {
    if (certificate.InscripcionID !== inscripcion.ID) return null;
    return { certificado: certificate, inscripcion: inscripcion };
  }
  if (String(certificateId || '') === inscripcion.ID || String(certificateId || '') === String(inscripcion.CodigoCertificado || '')) {
    return { certificado: certificadoHistoricoDesdeInscripcion(inscripcion), inscripcion: inscripcion };
  }
  return null;
}

function certificadoVersionParaDescarga_(resolved, allowHistorical) {
  if (!resolved) return { success: false, error: 'La versión solicitada no pertenece a esta inscripción.' };
  const certificate = resolved.certificado;
  const status = estadoNormalizadoCertificado(certificate);
  const allowed = allowHistorical ? ['emitido', 'enviado', 'reemitido', 'anulado'] : ['emitido', 'enviado'];
  if (allowed.indexOf(status) === -1) return { success: false, error: 'Esta versión no está disponible para descarga.' };
  if (!String(certificate.PdfStorageReference || '').trim() || !/^[a-f0-9]{64}$/i.test(String(certificate.PdfHash || ''))) {
    return { success: false, error: 'Esta versión no tiene un PDF original íntegro archivado. No se regeneró con la plantilla actual.' };
  }
  return { success: true, data: certificadoParaCliente(certificate, resolved.inscripcion) };
}

function getCertificadoParaDescarga(user, { id, certificateId } = {}) {
  requireCertificateAdmin(user, 'CERTIFICATE_DOWNLOAD_READ', { inscripcionId: id, canal: 'api' });
  if (certificateId) return certificadoVersionParaDescarga_(resolverCertificadoVersionAdministrativo_(id, certificateId), true);
  const resolved = resolverCertificadoAdministrativo(id, user);
  if (!resolved) return { success: false, error: 'Certificado no encontrado.' };
  const estado = estadoNormalizadoCertificado(resolved.certificado);
  if (estado === 'anulado') return { success: false, error: 'El certificado está anulado y no puede descargarse.' };
  if (['emitido', 'enviado'].indexOf(estado) === -1) {
    return { success: false, error: 'El certificado no está vigente para descarga.' };
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
    return { success: false, error: prefix + (fechaFinMissing ? 'falta FechaFin. ' : '') + 'Complete: ' + missing.join(', ') + '.' };
  }
  return { success: true, data: certificadoParaCliente(resolved.certificado, resolved.inscripcion) };
}

function getHistorialCertificados(user, { id } = {}) {
  requireCertificateAdmin(user, 'CERTIFICATE_HISTORY_READ', { inscripcionId: id, canal: 'api' });
  const inscripcion = sheetToObjects(getSheet('Inscripciones')).find(function(item) { return item.ID === String(id || ''); });
  if (!inscripcion) return { success: false, error: 'Inscripción no encontrada.' };
  let versions = sheetToObjects(getSheet('Certificados')).filter(function(item) { return item.InscripcionID === inscripcion.ID; });
  if (!versions.length && certificadoProtegidoContraEliminacion(inscripcion)) versions = [certificadoHistoricoDesdeInscripcion(inscripcion)];
  versions.sort(function(a, b) { return (Number(b.CertificateVersion) || 1) - (Number(a.CertificateVersion) || 1); });
  return { success: true, data: versions.map(function(item) { return {
    id: item.ID || '', codigo: item.CodigoCertificado || '', version: Number(item.CertificateVersion) || 1,
    estado: estadoNormalizadoCertificado(item), plantilla: item.TemplateVersion || '',
    fecha: item.IssuedAt || item.CertificatePreparedAt || '', actor: item.IssuedBy || '',
    motivo: item.ReissueReason || item.VoidReason || '',
    pdfArchivado: Boolean(item.PdfStorageReference && /^[a-f0-9]{64}$/i.test(String(item.PdfHash || ''))),
    snapshotVerificado: Boolean(leerSnapshotDocumentalCertificado_(item)),
  }; }) };
}

function getCertificadoVersionParaDescarga(user, { inscripcionId, certificateId } = {}) {
  requireCertificateAdmin(user, 'CERTIFICATE_DOWNLOAD_READ', { inscripcionId: inscripcionId, canal: 'api' });
  return certificadoVersionParaDescarga_(resolverCertificadoVersionAdministrativo_(inscripcionId, certificateId), true);
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

function sha256PdfCertificado_(bytes) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes)
    .map(function(byte) { return ('0' + (byte & 0xFF).toString(16)).slice(-2); }).join('');
}

function carpetaCertificadosPrivados_() {
  const properties = PropertiesService.getScriptProperties();
  const configuredId = String(properties.getProperty('CERTIFICATE_DRIVE_FOLDER_ID') || '').trim();
  if (configuredId) return DriveApp.getFolderById(configuredId);
  const folder = DriveApp.createFolder('R.A. Training Finance - Certificados privados');
  properties.setProperty('CERTIFICATE_DRIVE_FOLDER_ID', folder.getId());
  return folder;
}

function guardarPdfCertificadoPrivado(user, params) {
  const p = params || {};
  requireCertificateAdmin(user, 'CERTIFICATE_PRIVATE_PDF_STORE', { inscripcionId: p.id, canal: 'api' });
  if (buscarCertificadoProfesional_(String(p.id || ''))) return guardarPdfCertificadoProfesional_(user, p);
  const expectedHash = String(p.pdfHash || '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expectedHash)) return { success: false, error: 'La huella SHA-256 del certificado no es válida.' };
  if (!p.pdfBase64 || String(p.pdfBase64).length > 16000000) return { success: false, error: 'El PDF del certificado falta o excede el tamaño permitido.' };
  return conBloqueoCertificados(function() {
    const resolved = resolverCertificadoAdministrativo(p.id, user);
    if (!resolved) return { success: false, error: 'Certificado no encontrado.' };
    const certificado = resolved.certificado;
    const version = Number(certificado.CertificateVersion) || 1;
    if (Number(p.certificateVersion) !== version) return { success: false, error: 'La versión del PDF no corresponde al certificado.' };
    const templateVersion = String(p.templateVersion || '').trim();
    if (!templateVersion || (certificado.TemplateVersion && String(certificado.TemplateVersion) !== templateVersion)) {
      return { success: false, error: 'La plantilla del PDF no corresponde al certificado.' };
    }
    const currentRef = String(certificado.PdfStorageReference || '').trim();
    const currentHash = String(certificado.PdfHash || '').trim().toLowerCase();
    if (currentRef || currentHash) {
      if (currentRef.indexOf('certificate-drive:') === 0 && currentHash === expectedHash) {
        const existing = DriveApp.getFileById(currentRef.slice('certificate-drive:'.length));
        if (sha256PdfCertificado_(existing.getBlob().getBytes()) !== expectedHash) {
          throw new Error('El PDF privado existente no coincide con su huella registrada.');
        }
        return { success: true, reference: currentRef, hash: expectedHash, idempotent: true };
      }
      return { success: false, error: 'El certificado ya tiene un PDF oficial; no puede sustituirse.' };
    }
    let bytes;
    try { bytes = Utilities.base64Decode(String(p.pdfBase64)); }
    catch (err) { return { success: false, error: 'El PDF recibido no está codificado correctamente.' }; }
    if (bytes.length < 5 || String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4]) !== '%PDF-') {
      return { success: false, error: 'El archivo recibido no es un PDF válido.' };
    }
    if (sha256PdfCertificado_(bytes) !== expectedHash) return { success: false, error: 'El PDF recibido no coincide con su huella SHA-256.' };
    const folder = carpetaCertificadosPrivados_();
    const safeCode = String(certificado.CodigoCertificado || certificado.ID).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 90);
    const file = folder.createFile(Utilities.newBlob(bytes, 'application/pdf', 'CERT_' + safeCode + '_v' + version + '.pdf'));
    try { file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE); } catch (err) { /* Drive crea archivos privados. */ }
    const reference = 'certificate-drive:' + file.getId();
    try {
      const registered = registrarArtefactoCertificadoBajoBloqueo(user, {
        id: p.id,
        pdfHash: expectedHash,
        pdfStorageReference: reference,
        templateVersion: templateVersion,
        certificateVersion: version,
      });
      if (!registered.success) {
        file.setTrashed(true);
        return registered;
      }
    } catch (err) {
      file.setTrashed(true);
      throw err;
    }
    return { success: true, reference: reference, hash: expectedHash, idempotent: false };
  });
}

function leerPdfCertificadoPrivado(user, { id, certificateId } = {}) {
  requireCertificateAdmin(user, 'CERTIFICATE_PRIVATE_PDF_READ', { inscripcionId: id, canal: 'api' });
  const exactId = String(certificateId || id || '');
  const professional = buscarCertificadoProfesional_(exactId);
  if (professional) {
    if (['emitido', 'enviado', 'reemitido', 'anulado'].indexOf(estadoNormalizadoCertificado(professional)) === -1) {
      return { success: false, error: 'Esta versión profesional todavía no es descargable.' };
    }
    const professionalRef = String(professional.PdfStorageReference || '').trim();
    const professionalHash = String(professional.PdfHash || '').trim().toLowerCase();
    if (professionalRef.indexOf('certificate-drive:') !== 0 || !/^[a-f0-9]{64}$/.test(professionalHash)) {
      return { success: false, error: 'El certificado profesional no tiene PDF privado archivado.' };
    }
    const professionalFile = DriveApp.getFileById(professionalRef.slice('certificate-drive:'.length));
    const professionalBytes = professionalFile.getBlob().getBytes();
    if (sha256PdfCertificado_(professionalBytes) !== professionalHash) throw new Error('El PDF profesional no superó la comprobación SHA-256.');
    return { success: true, reference: professionalRef, hash: professionalHash,
      contentBase64: Utilities.base64Encode(professionalBytes), filename: professionalFile.getName() };
  }
  const exactCertificate = sheetToObjects(getSheet('Certificados')).find(function(item) { return item.ID === exactId; }) || null;
  let resolved = null;
  if (exactCertificate) {
    const linked = sheetToObjects(getSheet('Inscripciones')).find(function(item) { return item.ID === exactCertificate.InscripcionID; }) || null;
    if (!linked) return { success: false, error: 'La versión no tiene una inscripción asociada.' };
    resolved = { certificado: exactCertificate, inscripcion: linked };
  } else {
    resolved = resolverCertificadoAdministrativo(id, user);
  }
  if (!resolved) return { success: false, error: 'Certificado no encontrado.' };
  if (['emitido', 'enviado', 'reemitido', 'anulado'].indexOf(estadoNormalizadoCertificado(resolved.certificado)) === -1) {
    return { success: false, error: 'Esta versión todavía no es descargable.' };
  }
  const reference = String(resolved.certificado.PdfStorageReference || '').trim();
  const expectedHash = String(resolved.certificado.PdfHash || '').trim().toLowerCase();
  if (reference.indexOf('certificate-drive:') !== 0 || !/^[a-f0-9]{64}$/.test(expectedHash)) {
    return { success: false, error: 'Este certificado no tiene un PDF privado archivado.' };
  }
  const file = DriveApp.getFileById(reference.slice('certificate-drive:'.length));
  const bytes = file.getBlob().getBytes();
  if (sha256PdfCertificado_(bytes) !== expectedHash) throw new Error('La huella del PDF privado no coincide con el registro oficial.');
  return { success: true, reference: reference, hash: expectedHash, contentBase64: Utilities.base64Encode(bytes), filename: file.getName() };
}

function guardarPdfCertificadoProfesional_(user, p) {
  const hash = String(p.pdfHash || '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(hash) || !p.pdfBase64 || String(p.pdfBase64).length > 16000000) {
    return { success: false, error: 'El PDF profesional o su huella SHA-256 no son válidos.' };
  }
  return conBloqueoCertificados(function() {
    const sheet = getSheet('CertificadosProfesionales');
    const row = buscarCertificadoProfesional_(String(p.id || ''));
    const status = estadoNormalizadoCertificado(row || {});
    const isPendingReissue = status === 'pendiente_pdf' && String(row.ReplacesCertificateId || '').trim();
    if (!row || (status !== 'emitido' && !isPendingReissue)) return { success: false, error: 'El certificado profesional no está vigente ni pendiente de archivo.' };
    if (Number(p.certificateVersion) !== Number(row.CertificateVersion) || String(p.templateVersion || '') !== String(row.TemplateVersion || '')) {
      return { success: false, error: 'La versión del PDF profesional no corresponde al registro.' };
    }
    const reference = String(row.PdfStorageReference || '').trim();
    const existingHash = String(row.PdfHash || '').trim().toLowerCase();
    if (reference || existingHash) {
      if (reference.indexOf('certificate-drive:') === 0 && existingHash === hash) {
        const existingBytes = DriveApp.getFileById(reference.slice('certificate-drive:'.length)).getBlob().getBytes();
        if (sha256PdfCertificado_(existingBytes) === hash) return { success: true, reference: reference, hash: hash, idempotent: true };
      }
      return { success: false, error: 'El PDF profesional ya está fijado y no puede reemplazarse.' };
    }
    let bytes;
    try { bytes = Utilities.base64Decode(String(p.pdfBase64)); }
    catch (error) { return { success: false, error: 'El PDF profesional está mal codificado.' }; }
    if (bytes.length < 5 || String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4]) !== '%PDF-' || sha256PdfCertificado_(bytes) !== hash) {
      return { success: false, error: 'El PDF profesional no es válido o su SHA-256 no coincide.' };
    }
    const folder = carpetaCertificadosPrivados_();
    const file = folder.createFile(Utilities.newBlob(bytes, 'application/pdf', 'CERT_PRO_' + String(row.CodigoCertificado).replace(/[^a-zA-Z0-9._-]/g, '_') + '_v' + row.CertificateVersion + '.pdf'));
    try { file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE); } catch (error) { /* Drive crea archivos privados. */ }
    const savedRef = 'certificate-drive:' + file.getId();
    const previous = { PdfHash: row.PdfHash || '', PdfStorageReference: row.PdfStorageReference || '',
      CertificateStatus: row.CertificateStatus || '', IssuedAt: row.IssuedAt || '', IssuedBy: row.IssuedBy || '' };
    let parent = null;
    let previousParent = null;
    try {
      const update = { PdfHash: hash, PdfStorageReference: savedRef };
      if (isPendingReissue) {
        parent = sheetToObjects(sheet).find(function(item) { return item.ID === row.ReplacesCertificateId; }) || null;
        if (!parent || ['emitido', 'enviado', 'anulado'].indexOf(estadoNormalizadoCertificado(parent)) === -1) {
          file.setTrashed(true);
          return { success: false, error: 'La versión profesional anterior ya no es vigente; no se archivó la reemisión.' };
        }
        previousParent = { CertificateStatus: parent.CertificateStatus || '', ReissuedCertificateId: parent.ReissuedCertificateId || '', ReissueReason: parent.ReissueReason || '' };
        update.CertificateStatus = 'emitido';
        update.IssuedAt = row.CertificatePreparedAt || new Date().toISOString();
        update.IssuedBy = row.IssuedBy || user.Username;
      }
      updateRow(sheet, row, update);
      if (isPendingReissue) {
        updateRow(sheet, parent, { CertificateStatus: 'reemitido', ReissuedCertificateId: row.ID, ReissueReason: row.ReissueReason || '' });
      }
      registrarAuditoriaCertificado({ certificadoId: row.CodigoCertificado, inscripcionId: '', usuario: user.Username, rol: user.Rol,
        accion: isPendingReissue ? 'TRAINER_CERTIFICATE_REISSUE_COMPLETED' : 'TRAINER_CERTIFICATE_PDF_ARCHIVED',
        estadoAnterior: status, estadoNuevo: isPendingReissue ? 'emitido' : status, canal: 'api', resultado: 'ok',
        motivo: isPendingReissue ? String(row.ReissueReason || '') : '',
        metadatos: { certificateId: row.ID, replacesCertificateId: parent ? parent.ID : '', sha256: hash, version: Number(row.CertificateVersion) || 1 } });
    } catch (error) {
      updateRow(sheet, row, previous);
      if (parent && previousParent) updateRow(sheet, parent, previousParent);
      file.setTrashed(true);
      throw error;
    }
    return { success: true, reference: savedRef, hash: hash, idempotent: false };
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
  if (!/^(browser-indexeddb|private-drive|certificate-drive|test-memory):[a-zA-Z0-9._:-]+$/.test(storageReference)) {
    return { success: false, error: 'La referencia privada del PDF no es v\u00e1lida.' };
  }
  if (/^https?:\/\//i.test(storageReference)) {
    return { success: false, error: 'No se permiten enlaces p\u00fablicos como almacenamiento del certificado.' };
  }
  if (storageReference.indexOf('certificate-drive:') === 0) {
    const fileId = storageReference.slice('certificate-drive:'.length);
    let storedBytes;
    try { storedBytes = DriveApp.getFileById(fileId).getBlob().getBytes(); }
    catch (err) { return { success: false, error: 'El PDF privado referenciado no existe en Drive.' }; }
    if (sha256PdfCertificado_(storedBytes) !== hash) {
      return { success: false, error: 'La huella del PDF privado no coincide con la referencia de Drive.' };
    }
  }
  const resolved = resolverCertificadoAdministrativo(id, user);
  if (!resolved) return { success: false, error: 'Certificado no encontrado.' };
  const certificado = resolved.certificado;
  const inscripcion = resolved.inscripcion;
  const estado = estadoNormalizadoCertificado(certificado);
  const isPendingReissue = estado === 'pendiente_pdf' && String(certificado.ReplacesCertificateId || '').trim();
  if (estado !== 'emitido' && estado !== 'enviado' && !isPendingReissue) {
    return { success: false, error: 'Solo una versión vigente o una reemisión pendiente puede registrar un artefacto PDF.' };
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
    CertificateStatus: certificado.CertificateStatus || '',
    IssuedAt: certificado.IssuedAt || '',
    IssuedBy: certificado.IssuedBy || '',
  };
  const previousEnrollmentArtifact = {
    PdfHash: inscripcion.PdfHash || '',
    PdfStorageReference: inscripcion.PdfStorageReference || '',
    CertificateVersion: inscripcion.CertificateVersion || '',
    TemplateVersion: inscripcion.TemplateVersion || '',
    CertificateStatus: inscripcion.CertificateStatus || '',
    EstadoCertificado: inscripcion.EstadoCertificado || '',
    CodigoCertificado: inscripcion.CodigoCertificado || '',
    FechaEmisionCertificado: inscripcion.FechaEmisionCertificado || '',
    EmitidoPor: inscripcion.EmitidoPor || '',
    IssuedAt: inscripcion.IssuedAt || '',
    IssuedBy: inscripcion.IssuedBy || '',
    CertificateType: inscripcion.CertificateType || '',
    OriginalCertificateId: inscripcion.OriginalCertificateId || '',
    ReissuedCertificateId: inscripcion.ReissuedCertificateId || '',
    ReissueReason: inscripcion.ReissueReason || '',
    EstadoEntrega: inscripcion.EstadoEntrega || '',
    FechaEntregaCertificado: inscripcion.FechaEntregaCertificado || '',
    EntregadoPor: inscripcion.EntregadoPor || '',
  };
  const certificateSheet = getSheet('Certificados');
  const enrollmentSheet = getSheet('Inscripciones');
  let replacedCertificate = null;
  let previousReplacedState = null;
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
    if (!isPendingReissue) {
      enrollmentArtifactUpdate.CertificateVersion = expectedVersion;
      enrollmentArtifactUpdate.TemplateVersion = resolvedTemplate;
    }
  }
  if (isPendingReissue) {
    replacedCertificate = sheetToObjects(certificateSheet).find(function(item) {
      return item.ID === String(certificado.ReplacesCertificateId);
    }) || null;
    const replacedState = estadoNormalizadoCertificado(replacedCertificate || {});
    if (!replacedCertificate || ['emitido', 'enviado', 'anulado'].indexOf(replacedState) === -1) {
      return { success: false, error: 'La versión que se intenta reemplazar ya no es la vigente; no se archivó el PDF.' };
    }
    const expectedCurrentId = String(inscripcion.ReissuedCertificateId || '').trim() || String(inscripcion.ID || '');
    if (expectedCurrentId !== String(replacedCertificate.ID) && inscripcion.CodigoCertificado !== replacedCertificate.CodigoCertificado) {
      return { success: false, error: 'La inscripción cambió de versión durante la reemisión; no se modificó su certificado vigente.' };
    }
    previousReplacedState = {
      CertificateStatus: replacedCertificate.CertificateStatus || '',
      ReissuedCertificateId: replacedCertificate.ReissuedCertificateId || '',
      ReissueReason: replacedCertificate.ReissueReason || '',
    };
    certificateArtifactUpdate.CertificateStatus = 'emitido';
    certificateArtifactUpdate.IssuedAt = certificado.CertificatePreparedAt || new Date().toISOString();
    certificateArtifactUpdate.IssuedBy = certificado.IssuedBy || user.Username;
    Object.assign(enrollmentArtifactUpdate, {
      EstadoCertificado: 'emitido',
      CodigoCertificado: certificado.CodigoCertificado,
      FechaEmisionCertificado: certificateArtifactUpdate.IssuedAt,
      EmitidoPor: certificateArtifactUpdate.IssuedBy,
      CertificateStatus: 'emitido',
      IssuedAt: certificateArtifactUpdate.IssuedAt,
      IssuedBy: certificateArtifactUpdate.IssuedBy,
      CertificateVersion: expectedVersion,
      TemplateVersion: resolvedTemplate,
      CertificateType: certificado.CertificateType || inscripcion.CertificateType || 'aprobacion',
      OriginalCertificateId: certificado.OriginalCertificateId || replacedCertificate.ID,
      ReissuedCertificateId: certificado.ID,
      ReissueReason: certificado.ReissueReason || '',
      EstadoEntrega: 'pendiente',
      FechaEntregaCertificado: '',
      EntregadoPor: '',
    });
  }
  updateRow(certificateSheet, certificado, certificateArtifactUpdate);
  updateRow(enrollmentSheet, inscripcion, enrollmentArtifactUpdate);
  if (isPendingReissue) {
    updateRow(certificateSheet, replacedCertificate, {
      CertificateStatus: 'reemitido',
      ReissuedCertificateId: certificado.ID,
      ReissueReason: certificado.ReissueReason || '',
    });
  }
  try {
    registrarAuditoriaCertificado({
      certificadoId: certificado.CodigoCertificado,
      inscripcionId: inscripcion.ID,
      usuario: user.Username,
      rol: user.Rol,
      accion: isPendingReissue ? 'CERTIFICATE_REISSUE_COMPLETED' : historicalHashRebaseAuthorized
        ? 'CERTIFICATE_HISTORICAL_HASH_REBASED'
        : certificado.PdfHash ? 'CERTIFICATE_ARTIFACT_CONFIRMED' : 'CERTIFICATE_ARTIFACT_REGISTERED',
      estadoAnterior: estado,
      estadoNuevo: isPendingReissue ? 'emitido' : estado,
      canal: 'panel',
      resultado: 'ok',
      motivo: isPendingReissue ? String(certificado.ReissueReason || '') : historicalHashRebaseAuthorized ? rebaseReason : '',
      metadatos: {
        certificateId: certificado.ID,
        replacedCertificateId: replacedCertificate ? replacedCertificate.ID : '',
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
    updateRow(certificateSheet, certificado, previousCertificateArtifact);
    updateRow(enrollmentSheet, inscripcion, previousEnrollmentArtifact);
    if (replacedCertificate && previousReplacedState) {
      updateRow(certificateSheet, replacedCertificate, previousReplacedState);
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

function solicitarDescargaCertificado(user, { id, certificateId, pdfHash, pdfStorageReference } = {}) {
  requireCertificateAdmin(user, 'CERTIFICATE_DOWNLOAD_REQUEST', { inscripcionId: id, canal: 'api' });
  const resolved = certificateId
    ? resolverCertificadoVersionAdministrativo_(id, certificateId)
    : resolverCertificadoAdministrativo(id, user);
  if (!resolved) return { success: false, error: 'Certificado no encontrado.' };
  const certificado = resolved.certificado;
  const inscripcion = resolved.inscripcion;
  const estado = estadoNormalizadoCertificado(certificado);
  const historicalRequest = Boolean(certificateId);
  if (historicalRequest
    ? ['emitido', 'enviado', 'reemitido', 'anulado'].indexOf(estado) === -1
    : estado !== 'emitido' && estado !== 'enviado') {
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
      historicalVersion: historicalRequest,
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
    const current = resolverCertificadoAdministrativo(inscripcion.ID, user);
    if (current && current.certificado.ID === certificado.ID) {
      updateRow(getSheet('Inscripciones'), inscripcion, {
        EstadoEntrega: 'descargado',
        FechaEntregaCertificado: ahora,
        EntregadoPor: user.Username,
      });
    }
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

function enviarCertificadoEmail(user, { id, email } = {}) {
  requireCertificateAdmin(user, 'CERTIFICATE_EMAIL_SEND', { inscripcionId: id, canal: 'email' });
  const sheet = getSheet('Inscripciones');
  const row = sheetToObjects(sheet).find(function(r) { return r.ID === id; });
  if (!row) return { success: false, error: 'Inscripción no encontrada.' };
  if (['emitido', 'enviado'].indexOf(estadoNormalizadoCertificado(row)) === -1) return { success: false, error: 'El certificado todavía no ha sido emitido o no está vigente.' };
  const destinatario = String(email || row.ClienteEmail || '').trim();
  if (!emailValido(destinatario)) return { success: false, error: 'La inscripción no tiene un correo electrónico válido.' };
  const resolved = resolverCertificadoAdministrativo(id, user);
  if (!resolved) return { success: false, error: 'No se pudo identificar la versión vigente del certificado.' };
  const certificate = resolved.certificado;
  if (identificacionDocumentalDifiere_(certificate, row, 'participante')) {
    return { success: false, error: 'La identificación fue corregida después de emitir este PDF. Reemita y archive una versión normal nueva antes de enviarla.' };
  }
  const certificateStatus = estadoNormalizadoCertificado(certificate);
  if (['emitido', 'enviado'].indexOf(certificateStatus) === -1) {
    return { success: false, error: 'Solo se puede reenviar la versión vigente del certificado.' };
  }
  const expectedHash = String(certificate.PdfHash || '').trim().toLowerCase();
  const storageReference = String(certificate.PdfStorageReference || '').trim();
  if (!/^[a-f0-9]{64}$/.test(expectedHash) || storageReference.indexOf('certificate-drive:') !== 0) {
    return { success: false, error: 'El PDF original no está archivado en Finance. No se regeneró ni se envió otra versión.' };
  }
  let blob;
  try {
    const fileId = storageReference.slice('certificate-drive:'.length);
    const file = DriveApp.getFileById(fileId);
    blob = file.getBlob();
    const bytes = blob.getBytes();
    if (bytes.length < 5 || String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4]) !== '%PDF-'
        || sha256PdfCertificado_(bytes) !== expectedHash) {
      return { success: false, error: 'El PDF archivado no superó la verificación de integridad. No se envió.' };
    }
  } catch (err) {
    return { success: false, error: 'No se pudo leer el PDF original archivado en Finance. No se regeneró ni se envió otra versión.' };
  }
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
    metadatos: { certificateId: certificate.ID, certificateVersion: Number(certificate.CertificateVersion) || 1, pdfHash: expectedHash },
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

// ─────────────────────────────────────────────
// FICHA MAESTRA DE INSTITUCIONES — Bloque 3
// Entidades externas y sus autoridades/recursos se mantienen aparte de Finance
// (marca interna), de convenios y de strings históricos de aval.
// ─────────────────────────────────────────────

function normalizarClaveInstitucion_(value) {
  return String(value || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, ' ');
}

function institutionLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function institucionPorId_(id) {
  const target = String(id || '').trim();
  if (!target) return null;
  return sheetToObjects(getSheet('Instituciones')).find(function(row) { return row.ID === target; }) || null;
}

function autoridadPorId_(id) {
  const target = String(id || '').trim();
  if (!target) return null;
  return sheetToObjects(getSheet('AutoridadesInstitucion')).find(function(row) { return row.ID === target; }) || null;
}

function validarDatosInstitucion_(source, existingId) {
  const value = source || {};
  const name = String(value.nombre || '').trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 180) throw new Error('Ingrese el nombre institucional (2 a 180 caracteres).');
  const identification = String(value.identificacion || '').trim();
  const identificationType = normalizarTipoIdentificacion_(value.tipoIdentificacion || '');
  if (identification) {
    if (!identificationType) throw new Error('Seleccione el tipo de identificación o RUC institucional.');
    const identityError = validarIdentificacion_(identificationType, identification, { allowUnspecified: true });
    if (identityError) throw new Error(identityError);
  }
  const email = String(value.email || '').trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Ingrese un correo institucional válido.');
  const website = String(value.sitioWeb || '').trim();
  if (website && !/^https?:\/\//i.test(website)) throw new Error('El sitio web debe iniciar con http:// o https://.');

  const institutions = sheetToObjects(getSheet('Instituciones'));
  if (identification) {
    const duplicate = institutions.find(function(row) {
      return row.ID !== existingId && String(row.Identificacion || '').trim().toUpperCase() === identification.toUpperCase();
    });
    if (duplicate) throw new Error('Ya existe una institución con esa identificación: ' + duplicate.Nombre + '. Abra su ficha para actualizarla.');
  }
  const sameName = institutions.find(function(row) {
    return row.ID !== existingId && normalizarClaveInstitucion_(row.Nombre) === normalizarClaveInstitucion_(name);
  });
  if (sameName) {
    const oldId = String(sameName.Identificacion || '').trim();
    const newId = identification;
    const differentKnownIds = oldId && newId && oldId.toUpperCase() !== newId.toUpperCase();
    if (!differentKnownIds && value.confirmarDuplicadoNombre !== true) {
      throw new Error('Ya hay una ficha con ese nombre (' + sameName.ID + '). Revísela; si son entidades distintas, confirme explícitamente el nombre duplicado.');
    }
  }
  return {
    Nombre: name,
    NombreLegal: String(value.nombreLegal || '').trim().slice(0, 180),
    NombreComercial: String(value.nombreComercial || '').trim().slice(0, 180),
    Siglas: String(value.siglas || '').trim().slice(0, 40),
    Identificacion: identification,
    TipoIdentificacion: identification ? identificationType : '',
    Tipo: String(value.tipo || '').trim().slice(0, 80),
    Telefono: String(value.telefono || '').trim().slice(0, 40),
    Email: email,
    Direccion: String(value.direccion || '').trim().slice(0, 240),
    Ciudad: String(value.ciudad || '').trim().slice(0, 100),
    Provincia: String(value.provincia || '').trim().slice(0, 100),
    SitioWeb: website,
    Estado: value.estado === 'inactivo' ? 'inactivo' : 'activo',
    Notas: String(value.notas || '').trim().slice(0, 1500),
  };
}

function registrarAuditoriaInstitucion_(user, entityType, entityId, action, before, after) {
  const safeJson = function(value) {
    let json = JSON.stringify(value || {});
    if (json.length > 3500) json = json.slice(0, 3500);
    return json;
  };
  getSheet('AuditoriaInstituciones').appendRow([
    generateId('AUI'), entityType, entityId, action, user.Username || '', user.Rol || '', new Date().toISOString(),
    safeJson(before), safeJson(after), '',
  ]);
}

function appendRegistroInstitucionalAuditado_(sheet, headers, values, user, entityType, entityId, action, before, after) {
  const rowNumber = appendRowPreservandoTexto_(sheet, headers, values);
  try {
    registrarAuditoriaInstitucion_(user, entityType, entityId, action, before, after);
  } catch (auditError) {
    try { sheet.deleteRow(rowNumber); } catch (rollbackError) { /* la llamada devuelve error claro para revisión manual */ }
    throw new Error('No se pudo completar la auditoría institucional; el registro se revirtió. Inténtelo de nuevo.');
  }
  return rowNumber;
}

function actualizarRegistroInstitucionalAuditado_(sheet, current, fields, user, entityType, entityId, action, before, after) {
  const rollback = {};
  Object.keys(fields).forEach(function(field) {
    rollback[field] = current[field] === undefined || current[field] === null ? '' : current[field];
  });
  updateRow(sheet, current, fields);
  try {
    registrarAuditoriaInstitucion_(user, entityType, entityId, action, before, after);
  } catch (auditError) {
    try { updateRow(sheet, current, rollback); } catch (rollbackError) { /* reportar para reconciliación manual */ }
    throw new Error('No se pudo completar la auditoría institucional; el cambio se revirtió. Inténtelo de nuevo.');
  }
}

function readinessInstitucion_(institution, authorities, assets) {
  const activeSigners = authorities.filter(function(item) {
    return autoridadInstitucionVigente_(item) && esVerdadero(item.FirmaCertificados);
  });
  const signerWithSignature = activeSigners.some(function(item) {
    return assets.some(function(asset) {
      return asset.Estado === 'activo' && asset.Tipo === 'firma' && asset.AutoridadID === item.ID;
    });
  });
  const missing = [];
  if (institution.Estado !== 'activo') missing.push('La institución está inactiva.');
  if (!activeSigners.length) missing.push('Falta una autoridad activa habilitada para firmar certificados.');
  else if (!signerWithSignature) missing.push('Falta la firma de una autoridad habilitada para certificados.');
  return { listoParaCertificacionFutura: missing.length === 0, faltantes: missing };
}

function autoridadInstitucionVigente_(authority, date) {
  const today = date || hoyLocal();
  const start = fechaSolo(authority && authority.FechaInicio);
  const end = fechaSolo(authority && authority.FechaFin);
  return Boolean(authority && authority.Estado === 'activo'
    && (!start || start <= today) && (!end || end >= today));
}

function getInstitucionesMaestras(user, { filtros = {} } = {}) {
  requireAdmin(user);
  const authorities = sheetToObjects(getSheet('AutoridadesInstitucion'));
  const assets = sheetToObjects(getSheet('ActivosInstitucionales'));
  const agreements = sheetToObjects(getSheet('Convenios'));
  let data = sheetToObjects(getSheet('Instituciones'));
  if (filtros.estado) data = data.filter(function(item) { return item.Estado === filtros.estado; });
  if (filtros.tipo) data = data.filter(function(item) { return item.Tipo === filtros.tipo; });
  const query = normalizarClaveInstitucion_(filtros.q || '');
  if (query) data = data.filter(function(item) {
    return [item.Nombre, item.NombreLegal, item.NombreComercial, item.Siglas, item.Identificacion]
      .some(function(value) { return normalizarClaveInstitucion_(value).indexOf(query) !== -1; });
  });
  data = data.map(function(item) {
    const itemAuthorities = authorities.filter(function(authority) { return authority.InstitucionID === item.ID; });
    const activeAuthorities = itemAuthorities.filter(function(authority) { return authority.Estado === 'activo'; });
    const itemAssets = assets.filter(function(asset) { return asset.InstitucionID === item.ID; });
    const linkedAgreements = agreements.filter(function(agreement) { return agreement.InstitucionID === item.ID; });
    const readiness = readinessInstitucion_(item, itemAuthorities, itemAssets);
    return Object.assign({}, item, {
      AutoridadesActivas: activeAuthorities.length,
      ConveniosActivos: linkedAgreements.filter(function(agreement) { return agreement.Estado === 'activo'; }).length,
      TotalConvenios: linkedAgreements.length,
      CompletitudCertificacionFutura: readiness,
    });
  });
  data.sort(function(a, b) { return String(a.Nombre || '').localeCompare(String(b.Nombre || ''), 'es'); });
  return { success: true, data: data };
}

function getInstitucionMaestra(user, { id } = {}) {
  requireAdmin(user);
  const institution = institucionPorId_(id);
  if (!institution) return { success: false, error: 'Institución no encontrada.' };
  const authorities = sheetToObjects(getSheet('AutoridadesInstitucion'))
    .filter(function(item) { return item.InstitucionID === institution.ID; })
    .map(function(item) { return Object.assign({}, item, { VigenteAhora: autoridadInstitucionVigente_(item) }); });
  const assets = sheetToObjects(getSheet('ActivosInstitucionales'))
    .filter(function(item) { return item.InstitucionID === institution.ID; })
    .map(function(item) { return {
      ID: item.ID, InstitucionID: item.InstitucionID, AutoridadID: item.AutoridadID || '', Tipo: item.Tipo,
      NombreArchivo: item.NombreArchivo, MimeType: item.MimeType, Sha256: item.Sha256,
      TamanoBytes: Number(item.TamanoBytes) || 0, Version: Number(item.Version) || 1,
      Estado: item.Estado, CreadoEn: item.CreadoEn,
    }; });
  const documents = sheetToObjects(getSheet('DocumentosInstitucionales'))
    .filter(function(item) { return item.InstitucionID === institution.ID; })
    .map(function(item) { return {
      ID: item.ID, InstitucionID: item.InstitucionID, ConvenioID: item.ConvenioID || '', Tipo: item.Tipo,
      NombreArchivo: item.NombreArchivo, MimeType: item.MimeType, Sha256: item.Sha256,
      TamanoBytes: Number(item.TamanoBytes) || 0, FechaDocumento: item.FechaDocumento || '',
      Notas: item.Notas || '', Estado: item.Estado, CreadoEn: item.CreadoEn,
    }; });
  const agreements = sheetToObjects(getSheet('Convenios')).filter(function(item) { return item.InstitucionID === institution.ID; });
  return { success: true, data: {
    institucion: institution, autoridades: authorities, activos: assets, documentos: documents,
    convenios: agreements, completitudCertificacionFutura: readinessInstitucion_(institution, authorities, assets),
  } };
}

function getOpcionesInstitucionesMaestras(user) {
  if (!isAdmin(user) && !isAval(user) && !isVendedor(user)) throw new Error('Acceso denegado.');
  let institutions = sheetToObjects(getSheet('Instituciones')).filter(function(item) { return item.Estado === 'activo'; });
  if (isAval(user) && !isAdmin(user)) {
    const assignedId = institucionAvalIdDelUsuario_(user);
    const assignedName = institucionAvalDelUsuario(user);
    if (assignedId) institutions = institutions.filter(function(item) { return String(item.ID) === assignedId; });
    else if (assignedName) institutions = institutions.filter(function(item) {
      return normalizarClaveInstitucion_(item.Nombre) === normalizarClaveInstitucion_(assignedName)
        || normalizarClaveInstitucion_(item.Siglas) === normalizarClaveInstitucion_(assignedName);
    });
    else return { success: true, data: [] };
  }
  return { success: true, data: institutions.map(function(item) {
    return { ID: item.ID, Nombre: item.Nombre, Siglas: item.Siglas || '', Identificacion: item.Identificacion || '', Estado: item.Estado };
  }) };
}

function resolverInstitucionMaestra_(id, options) {
  options = options || {};
  const institutionId = String(id || '').trim();
  if (!institutionId) return { success: false, error: 'Seleccione una institución de la ficha maestra.' };
  const institution = sheetToObjects(getSheet('Instituciones')).find(function(item) { return item.ID === institutionId; });
  if (!institution) return { success: false, error: 'La institución seleccionada no existe en la ficha maestra.' };
  if (!options.permitirInactiva && institution.Estado !== 'activo') {
    return { success: false, error: 'La institución seleccionada está inactiva. Elija una institución activa.' };
  }
  return { success: true, data: institution };
}

function addInstitucionMaestra(user, { institucion, confirmarDuplicadoNombre } = {}) {
  requireAdmin(user);
  return institutionLock_(function() {
    const input = Object.assign({}, institucion || {}, { confirmarDuplicadoNombre: confirmarDuplicadoNombre === true });
    const fields = validarDatosInstitucion_(input, '');
    const id = generateId('INS');
    const now = new Date().toISOString();
    const sheet = getSheet('Instituciones');
    const row = Object.assign({ ID: id }, fields, { CreadoPor: user.Username, CreadoEn: now,
      ActualizadoPor: user.Username, ActualizadoEn: now, ArchivadoPor: '', ArchivadoEn: '' });
    appendRegistroInstitucionalAuditado_(sheet, SHEET_HEADERS.Instituciones,
      SHEET_HEADERS.Instituciones.map(function(header) { return row[header] || ''; }),
      user, 'institucion', id, 'creada', {}, { nombre: row.Nombre, estado: row.Estado });
    bustSheet('convenios', 'institutionOptions', 'getInstitucionesAval');
    return { success: true, id: id };
  });
}

function updateInstitucionMaestra(user, { id, institucion, confirmarDuplicadoNombre } = {}) {
  requireAdmin(user);
  return institutionLock_(function() {
    const sheet = getSheet('Instituciones');
    const current = sheetToObjects(sheet).find(function(item) { return item.ID === id; });
    if (!current) return { success: false, error: 'Institución no encontrada.' };
    const input = Object.assign({}, institucion || {}, { confirmarDuplicadoNombre: confirmarDuplicadoNombre === true });
    const fields = validarDatosInstitucion_(input, id);
    const now = new Date().toISOString();
    const before = { Nombre: current.Nombre, Identificacion: current.Identificacion, Estado: current.Estado };
    const updates = Object.assign({}, fields, { ActualizadoPor: user.Username, ActualizadoEn: now,
      ...(fields.Estado === 'activo' ? { ArchivadoPor: '', ArchivadoEn: '' } : {}) });
    actualizarRegistroInstitucionalAuditado_(sheet, current, updates, user, 'institucion', id, 'actualizada', before,
      { Nombre: fields.Nombre, Identificacion: fields.Identificacion, Estado: fields.Estado });
    bustSheet('convenios', 'institutionOptions', 'getInstitucionesAval');
    return { success: true };
  });
}

function archivarInstitucionMaestra(user, { id, confirmacion } = {}) {
  requireAdmin(user);
  if (confirmacion !== 'ARCHIVAR_INSTITUCION') return { success: false, error: 'Confirme el archivado de la institución.' };
  return institutionLock_(function() {
    const sheet = getSheet('Instituciones');
    const current = sheetToObjects(sheet).find(function(item) { return item.ID === id; });
    if (!current) return { success: false, error: 'Institución no encontrada.' };
    if (current.Estado === 'inactivo') return { success: true, alreadyArchived: true };
    const now = new Date().toISOString();
    actualizarRegistroInstitucionalAuditado_(sheet, current, { Estado: 'inactivo', ArchivadoPor: user.Username, ArchivadoEn: now,
      ActualizadoPor: user.Username, ActualizadoEn: now }, user, 'institucion', id, 'archivada',
      { Estado: current.Estado }, { Estado: 'inactivo' });
    bustSheet('convenios', 'institutionOptions', 'getInstitucionesAval');
    return { success: true };
  });
}

function validarAutoridadInstitucion_(authority) {
  const data = authority || {};
  const name = String(data.nombre || '').trim().replace(/\s+/g, ' ');
  const title = String(data.cargo || '').trim();
  if (name.length < 3 || name.length > 160) throw new Error('Ingrese el nombre de la autoridad (3 a 160 caracteres).');
  if (title.length < 2 || title.length > 100) throw new Error('Ingrese el cargo de la autoridad (2 a 100 caracteres).');
  const identification = String(data.identificacion || '').trim();
  const identificationType = normalizarTipoIdentificacion_(data.tipoIdentificacion || '');
  if (identification && (!identificationType || validarIdentificacion_(identificationType, identification, { allowUnspecified: true }))) {
    throw new Error('Revise el tipo y formato de identificación de la autoridad.');
  }
  const rawStart = String(data.fechaInicio || '').trim();
  const rawEnd = String(data.fechaFin || '').trim();
  const start = rawStart ? fechaSolo(rawStart) : '';
  const end = rawEnd ? fechaSolo(rawEnd) : '';
  if (rawStart && !start) throw new Error('La fecha de inicio no es válida.');
  if (rawEnd && !end) throw new Error('La fecha de fin no es válida.');
  if (start && end && end < start) throw new Error('La fecha de fin no puede ser anterior a la fecha de inicio.');
  return {
    Nombre: name, Identificacion: identification, TipoIdentificacion: identification ? identificationType : '',
    Cargo: title, Funcion: String(data.funcion || '').trim().slice(0, 100),
    EsRepresentanteLegal: data.esRepresentanteLegal === true,
    FirmaConvenios: data.firmaConvenios === true, FirmaCertificados: data.firmaCertificados === true,
    FechaInicio: start, FechaFin: end, Estado: data.estado === 'inactivo' ? 'inactivo' : 'activo',
    Notas: String(data.notas || '').trim().slice(0, 1000),
  };
}

function addAutoridadInstitucion(user, { institucionId, autoridad } = {}) {
  requireAdmin(user);
  return institutionLock_(function() {
    const institution = institucionPorId_(institucionId);
    if (!institution) return { success: false, error: 'Institución no encontrada.' };
    const fields = validarAutoridadInstitucion_(autoridad);
    const id = generateId('AUT'); const now = new Date().toISOString();
    const record = Object.assign({ ID: id, InstitucionID: institution.ID }, fields, {
      CreadoPor: user.Username, CreadoEn: now, ActualizadoPor: user.Username, ActualizadoEn: now, ArchivadoPor: '', ArchivadoEn: '',
    });
    const sheet = getSheet('AutoridadesInstitucion');
    appendRegistroInstitucionalAuditado_(sheet, SHEET_HEADERS.AutoridadesInstitucion,
      SHEET_HEADERS.AutoridadesInstitucion.map(function(header) { return record[header] || ''; }),
      user, 'autoridad', id, 'creada', {}, { institucionId: institution.ID, cargo: record.Cargo, nombre: record.Nombre });
    return { success: true, id: id };
  });
}

function updateAutoridadInstitucion(user, { id, autoridad } = {}) {
  requireAdmin(user);
  return institutionLock_(function() {
    const sheet = getSheet('AutoridadesInstitucion');
    const current = sheetToObjects(sheet).find(function(item) { return item.ID === id; });
    if (!current) return { success: false, error: 'Autoridad no encontrada.' };
    const fields = validarAutoridadInstitucion_(autoridad);
    const before = { Nombre: current.Nombre, Cargo: current.Cargo, Estado: current.Estado,
      FirmaConvenios: current.FirmaConvenios, FirmaCertificados: current.FirmaCertificados };
    const now = new Date().toISOString();
    const updates = Object.assign({}, fields, { ActualizadoPor: user.Username, ActualizadoEn: now,
      ...(fields.Estado === 'activo' ? { ArchivadoPor: '', ArchivadoEn: '' } : {}) });
    actualizarRegistroInstitucionalAuditado_(sheet, current, updates, user, 'autoridad', id, 'actualizada', before,
      { Nombre: fields.Nombre, Cargo: fields.Cargo, Estado: fields.Estado,
        FirmaConvenios: fields.FirmaConvenios, FirmaCertificados: fields.FirmaCertificados });
    return { success: true };
  });
}

function archivarAutoridadInstitucion(user, { id, confirmacion } = {}) {
  requireAdmin(user);
  if (confirmacion !== 'ARCHIVAR_AUTORIDAD') return { success: false, error: 'Confirme el archivado de la autoridad.' };
  return institutionLock_(function() {
    const sheet = getSheet('AutoridadesInstitucion');
    const current = sheetToObjects(sheet).find(function(item) { return item.ID === id; });
    if (!current) return { success: false, error: 'Autoridad no encontrada.' };
    const now = new Date().toISOString();
    actualizarRegistroInstitucionalAuditado_(sheet, current, { Estado: 'inactivo', ArchivadoPor: user.Username, ArchivadoEn: now,
      ActualizadoPor: user.Username, ActualizadoEn: now }, user, 'autoridad', id, 'archivada',
      { Estado: current.Estado }, { Estado: 'inactivo' });
    return { success: true };
  });
}

function carpetaArchivosInstitucionales_() {
  const properties = PropertiesService.getScriptProperties();
  const configuredId = String(properties.getProperty('INSTITUTIONAL_FILES_FOLDER_ID') || '').trim();
  if (configuredId) return DriveApp.getFolderById(configuredId);
  const folder = DriveApp.createFolder('R.A. Training Finance - Archivos institucionales privados');
  properties.setProperty('INSTITUTIONAL_FILES_FOLDER_ID', folder.getId());
  return folder;
}

function byteInstitucion_(bytes, index) { return (bytes[index] || 0) & 255; }

function dimensionesImagenInstitucion_(bytes, mime) {
  if (mime === 'image/png' && bytes.length >= 24
      && [137,80,78,71,13,10,26,10].every(function(value, index) { return byteInstitucion_(bytes, index) === value; })) {
    const read = function(start) { return byteInstitucion_(bytes, start) * 16777216 + byteInstitucion_(bytes, start + 1) * 65536 + byteInstitucion_(bytes, start + 2) * 256 + byteInstitucion_(bytes, start + 3); };
    if (String.fromCharCode(byteInstitucion_(bytes, 12), byteInstitucion_(bytes, 13), byteInstitucion_(bytes, 14), byteInstitucion_(bytes, 15)) !== 'IHDR') return null;
    return { width: read(16), height: read(20) };
  }
  if (mime !== 'image/jpeg' || byteInstitucion_(bytes, 0) !== 255 || byteInstitucion_(bytes, 1) !== 216) return null;
  const sof = { 192: true, 193: true, 194: true, 195: true, 197: true, 198: true, 199: true, 201: true, 202: true, 203: true, 205: true, 206: true, 207: true };
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (byteInstitucion_(bytes, offset) !== 255) { offset += 1; continue; }
    while (offset < bytes.length && byteInstitucion_(bytes, offset) === 255) offset += 1;
    const marker = byteInstitucion_(bytes, offset++);
    if (marker === 217 || marker === 218) break;
    const length = byteInstitucion_(bytes, offset) * 256 + byteInstitucion_(bytes, offset + 1);
    if (length < 2 || offset + length > bytes.length) return null;
    if (sof[marker]) return { height: byteInstitucion_(bytes, offset + 3) * 256 + byteInstitucion_(bytes, offset + 4),
      width: byteInstitucion_(bytes, offset + 5) * 256 + byteInstitucion_(bytes, offset + 6) };
    offset += length;
  }
  return null;
}

function decodificarArchivoInstitucional_(file, purpose) {
  const source = file || {};
  const mime = String(source.mimeType || '').trim().toLowerCase();
  let base64 = String(source.base64 || '').trim();
  const dataUrl = base64.match(/^data:([^;,]+);base64,([A-Za-z0-9+/]+=*)$/i);
  if (dataUrl) { base64 = dataUrl[2]; if (!mime) source.mimeType = dataUrl[1].toLowerCase(); }
  const resolvedMime = String(source.mimeType || mime).toLowerCase();
  if (!base64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new Error('El archivo no tiene contenido Base64 válido.');
  const image = purpose === 'asset' || purpose === 'signature';
  const allowed = image ? ['image/png', 'image/jpeg'] : ['application/pdf'];
  if (allowed.indexOf(resolvedMime) === -1) throw new Error(image ? 'Use una imagen PNG o JPG. No se admiten SVG ni archivos ejecutables.' : 'El documento debe ser PDF.');
  const maxBytes = image ? 8 * 1024 * 1024 : 15 * 1024 * 1024;
  if (base64.length > Math.ceil(maxBytes * 4 / 3) + 8) throw new Error(image ? 'La imagen supera el límite de 8 MB.' : 'El PDF supera el límite de 15 MB.');
  const bytes = Utilities.base64Decode(base64);
  if (!bytes.length || bytes.length > maxBytes) throw new Error(image ? 'La imagen supera el límite de 8 MB.' : 'El PDF supera el límite de 15 MB.');
  if (image) {
    const dimensions = dimensionesImagenInstitucion_(bytes, resolvedMime);
    if (!dimensions || dimensions.width < 1 || dimensions.height < 1 || dimensions.width > 12000 || dimensions.height > 12000
        || dimensions.width * dimensions.height > 60000000) throw new Error('La imagen está dañada o sus dimensiones exceden el límite permitido (12 000 px por lado, 60 MP).');
    if (purpose === 'signature' && (dimensions.width < 100 || dimensions.height < 25)) {
      throw new Error('La imagen de firma debe tener al menos 100 × 25 píxeles.');
    }
  } else if (String.fromCharCode(byteInstitucion_(bytes, 0), byteInstitucion_(bytes, 1), byteInstitucion_(bytes, 2), byteInstitucion_(bytes, 3), byteInstitucion_(bytes, 4)) !== '%PDF-') {
    throw new Error('El contenido no corresponde a un PDF válido.');
  }
  const safeName = String(source.nombreArchivo || (image ? 'recurso-institucional' : 'documento-institucional'))
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 140);
  return { bytes: bytes, base64: base64, mime: resolvedMime, name: safeName, size: bytes.length };
}

function cargarArchivoInstitucional_(file, purpose, institutionId, authorityId, linkId) {
  const decoded = decodificarArchivoInstitucional_(file, purpose);
  const hash = sha256BytesCertificado_(decoded.bytes);
  const blob = Utilities.newBlob(decoded.bytes, decoded.mime, decoded.name);
  const driveFile = carpetaArchivosInstitucionales_().createFile(blob);
  try { driveFile.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE); } catch (err) { /* privado por defecto */ }
  return { decoded: decoded, sha256: hash, driveFile: driveFile, linkId: linkId || '' };
}

function addActivoInstitucion(user, { institucionId, autoridadId, tipo, archivo } = {}) {
  requireAdmin(user);
  return institutionLock_(function() {
    const institution = institucionPorId_(institucionId);
    if (!institution) return { success: false, error: 'Institución no encontrada.' };
    const assetType = String(tipo || '').trim().toLowerCase();
    if (['firma', 'logo', 'sello'].indexOf(assetType) === -1) throw new Error('Seleccione firma, logotipo o sello.');
    let authority = null;
    if (assetType === 'firma') {
      authority = autoridadPorId_(autoridadId);
      if (!authority || authority.InstitucionID !== institution.ID || authority.Estado !== 'activo') {
        throw new Error('Seleccione una autoridad activa de esta institución para asociar la firma.');
      }
    } else if (autoridadId) throw new Error('El logotipo y el sello pertenecen a la institución, no a una autoridad.');
    const stored = cargarArchivoInstitucional_(archivo, assetType === 'firma' ? 'signature' : 'asset', institution.ID, autoridadId, '');
    try {
      const sheet = getSheet('ActivosInstitucionales');
      const rows = sheetToObjects(sheet);
      const same = rows.filter(function(item) {
        return item.InstitucionID === institution.ID && item.Tipo === assetType
          && String(item.AutoridadID || '') === String(autoridadId || '');
      });
      const version = same.reduce(function(max, item) { return Math.max(max, Number(item.Version) || 0); }, 0) + 1;
      same.filter(function(item) { return item.Estado === 'activo'; }).forEach(function(item) {
        updateRow(sheet, item, { Estado: 'reemplazado' });
      });
      const id = generateId('AST'); const now = new Date().toISOString();
      const record = { ID: id, InstitucionID: institution.ID, AutoridadID: autoridadId || '', Tipo: assetType,
        NombreArchivo: stored.decoded.name, MimeType: stored.decoded.mime, DriveFileID: stored.driveFile.getId(),
        Sha256: stored.sha256, TamanoBytes: stored.decoded.size, Version: version, Estado: 'activo',
        CreadoPor: user.Username, CreadoEn: now };
      appendRowPreservandoTexto_(sheet, SHEET_HEADERS.ActivosInstitucionales,
        SHEET_HEADERS.ActivosInstitucionales.map(function(header) { return record[header] || ''; }));
      try {
        registrarAuditoriaInstitucion_(user, 'activo', id, 'cargado', {}, { institucionId: institution.ID, tipo: assetType, autoridadId: autoridadId || '', sha256: stored.sha256, version: version });
      } catch (auditError) {
        const current = sheetToObjects(sheet).find(function(item) { return item.ID === id; });
        if (current) sheet.deleteRow(current._row);
        same.filter(function(item) { return item.Estado === 'activo'; }).forEach(function(item) { updateRow(sheet, item, { Estado: 'activo' }); });
        stored.driveFile.setTrashed(true);
        throw auditError;
      }
      return { success: true, id: id, version: version, sha256: stored.sha256 };
    } catch (err) {
      try { stored.driveFile.setTrashed(true); } catch (cleanupError) { /* preserve original error */ }
      throw err;
    }
  });
}

function addDocumentoInstitucion(user, { institucionId, convenioId, tipo, fechaDocumento, notas, archivo } = {}) {
  requireAdmin(user);
  return institutionLock_(function() {
    const institution = institucionPorId_(institucionId);
    if (!institution) return { success: false, error: 'Institución no encontrada.' };
    const documentType = String(tipo || '').trim().toLowerCase();
    if (['convenio', 'resolucion', 'aval', 'anexo', 'otro'].indexOf(documentType) === -1) throw new Error('Seleccione el tipo de documento.');
    const linkedAgreementId = String(convenioId || '').trim();
    if (linkedAgreementId) {
      const agreement = sheetToObjects(getSheet('Convenios')).find(function(item) { return item.ID === linkedAgreementId; });
      if (!agreement || agreement.InstitucionID !== institution.ID) throw new Error('El convenio no pertenece a la institución seleccionada.');
    }
    const documentDate = String(fechaDocumento || '').trim();
    if (documentDate && !/^\d{4}-\d{2}-\d{2}$/.test(documentDate)) throw new Error('La fecha del documento no es válida.');
    const stored = cargarArchivoInstitucional_(archivo, 'document', institution.ID, '', linkedAgreementId);
    try {
      const id = generateId('DOC'); const now = new Date().toISOString();
      const record = { ID: id, InstitucionID: institution.ID, ConvenioID: linkedAgreementId, Tipo: documentType,
        NombreArchivo: stored.decoded.name, MimeType: stored.decoded.mime, DriveFileID: stored.driveFile.getId(),
        Sha256: stored.sha256, TamanoBytes: stored.decoded.size, FechaDocumento: documentDate,
        Notas: String(notas || '').trim().slice(0, 1000), Estado: 'activo', CreadoPor: user.Username, CreadoEn: now };
      const sheet = getSheet('DocumentosInstitucionales');
      appendRowPreservandoTexto_(sheet, SHEET_HEADERS.DocumentosInstitucionales,
        SHEET_HEADERS.DocumentosInstitucionales.map(function(header) { return record[header] || ''; }));
      try {
        registrarAuditoriaInstitucion_(user, 'documento', id, 'cargado', {}, { institucionId: institution.ID, convenioId: linkedAgreementId, tipo: documentType, sha256: stored.sha256 });
      } catch (auditError) {
        const current = sheetToObjects(sheet).find(function(item) { return item.ID === id; });
        if (current) sheet.deleteRow(current._row);
        stored.driveFile.setTrashed(true);
        throw auditError;
      }
      return { success: true, id: id, sha256: stored.sha256 };
    } catch (err) {
      try { stored.driveFile.setTrashed(true); } catch (cleanupError) { /* preserve original error */ }
      throw err;
    }
  });
}

function getArchivoInstitucionPrivado(user, { id } = {}) {
  requireAdmin(user);
  const target = String(id || '').trim();
  const asset = sheetToObjects(getSheet('ActivosInstitucionales')).find(function(item) { return item.ID === target; });
  const document = asset ? null : sheetToObjects(getSheet('DocumentosInstitucionales')).find(function(item) { return item.ID === target; });
  const record = asset || document;
  if (!record || !record.DriveFileID) return { success: false, error: 'Archivo institucional no encontrado.' };
  try {
    const blob = DriveApp.getFileById(record.DriveFileID).getBlob();
    const bytes = blob.getBytes();
    if (sha256BytesCertificado_(bytes) !== record.Sha256) throw new Error('La huella del archivo no coincide.');
    return { success: true, data: { base64: Utilities.base64Encode(bytes), mimeType: record.MimeType,
      nombreArchivo: record.NombreArchivo, sha256: record.Sha256 } };
  } catch (err) { return { success: false, error: 'No se pudo leer el archivo privado o validar su integridad.' }; }
}

function getInstitucionesAval(user) {
  if (!isVendedor(user)) throw new Error('Acceso denegado.');
  if (isAval(user) && !isAdmin(user)) {
    const ownOptions = getOpcionesInstitucionesMaestras(user);
    return { success: true, data: (ownOptions.data || []).map(function(item) { return item.Nombre; }) };
  }
  const instituciones = [];
  sheetToObjects(getSheet('Instituciones')).forEach(function(row) {
    if (row.Estado === 'activo' && String(row.Nombre || '').trim()) instituciones.push(String(row.Nombre).trim());
  });
  sheetToObjects(getSheet('Usuarios')).forEach(function(u) {
    if (u.Rol === 'aval' && esVerdadero(u.Activo) && String(u.InstitucionAval || '').trim()) instituciones.push(String(u.InstitucionAval).trim());
  });
  sheetToObjects(getSheet('Inscripciones')).forEach(function(i) {
    if (esVerdadero(i.RequiereAvalExterno) && String(i.InstitucionAval || '').trim()) instituciones.push(String(i.InstitucionAval).trim());
  });
  const unicas = [];
  instituciones.sort().forEach(function(nombre) {
    if (!unicas.some(function(actual) { return normalizarClaveInstitucion_(actual) === normalizarClaveInstitucion_(nombre); })) unicas.push(nombre);
  });
  return { success: true, data: unicas };
}

function entregableAvalActual_(inscripcionId, rows) {
  const data = rows || sheetToObjects(getSheet('EntregablesAval'));
  return data.filter(function(item) { return item.InscripcionID === inscripcionId; })
    .sort(function(a, b) {
      return (Number(b.CertificateVersion) || 0) - (Number(a.CertificateVersion) || 0)
        || new Date(b.CreatedAt || 0) - new Date(a.CreatedAt || 0);
    })[0] || null;
}

/**
 * Valida el pago adicional AVAL_UPGRADE contra la compra institucional padre y
 * la misma raíz académica. No confía en flags enviados desde el navegador.
 */
function validarUpgradeAvalVerificadoParaInscripcion_(inscripcion) {
  const purchases = sheetToObjects(getSheet('CRMCompras'));
  const inscriptionId = String(inscripcion && inscripcion.ID || '');
  const upgrades = purchases.filter(function(item) {
    return String(item.FinanceInscripcionID || '') === inscriptionId && item.OfferType === 'AVAL_UPGRADE';
  });
  if (!upgrades.length) return { exists: false, success: false, error: 'No existe una compra AVAL_UPGRADE vinculada a esta inscripción.' };

  const compatible = upgrades.filter(function(upgrade) {
    if (upgrade.PaymentStatus !== 'verificado' || !upgrade.ParentCRMOrderID) return false;
    const parent = purchases.find(function(item) { return String(item.CRMOrderID || '') === String(upgrade.ParentCRMOrderID); });
    if (!parent || parent.OfferType !== 'INSTITUTIONAL' || parent.PaymentStatus !== 'verificado'
        || String(parent.FinanceInscripcionID || '') !== inscriptionId
        || String(upgrade.FinanceInscripcionID || '') !== String(parent.FinanceInscripcionID || '')
        || String(upgrade.CRMEnrollmentID || '') !== String(parent.CRMEnrollmentID || '')
        || String(upgrade.CRMContactID || '') !== String(parent.CRMContactID || '')
        || String(upgrade.CRMCourseID || '') !== String(parent.CRMCourseID || '')) return false;
    return ['CRMEnrollmentID', 'CRMContactID', 'CRMCourseID'].every(function(field) {
      return !String(inscripcion[field] || '').trim()
        || String(inscripcion[field]) === String(upgrade[field] || '');
    });
  }).sort(function(a, b) { return String(b.FechaVerificacionPago || '').localeCompare(String(a.FechaVerificacionPago || '')); });

  if (!compatible.length) {
    return { exists: true, success: false, error: 'El pago del upgrade de aval debe estar verificado y vinculado a la compra institucional y a la misma inscripción.' };
  }
  const upgrade = compatible[0];
  const parent = purchases.find(function(item) { return String(item.CRMOrderID || '') === String(upgrade.ParentCRMOrderID); });
  return { exists: true, success: true, data: { upgrade: upgrade, parent: parent } };
}

function resumenCertificadoNormalParaAval_(inscripcion, user) {
  if (!inscripcion || !inscripcion.ID) return null;
  const resolved = resolverCertificadoAdministrativo(inscripcion.ID, user);
  if (!resolved) return null;
  const status = estadoNormalizadoCertificado(resolved.certificado);
  if (['emitido', 'enviado'].indexOf(status) === -1) return null;
  let versions = sheetToObjects(getSheet('Certificados')).filter(function(item) {
    return String(item.InscripcionID || '') === String(inscripcion.ID);
  });
  if (!versions.length && certificadoProtegidoContraEliminacion(inscripcion)) {
    versions = [certificadoHistoricoDesdeInscripcion(inscripcion)];
  }
  versions.sort(function(a, b) { return (Number(b.CertificateVersion) || 1) - (Number(a.CertificateVersion) || 1); });
  return {
    ID: resolved.certificado.ID || inscripcion.ID,
    CodigoCertificado: resolved.certificado.CodigoCertificado || inscripcion.CodigoCertificado || '',
    CertificateStatus: status,
    CertificateVersion: Number(resolved.certificado.CertificateVersion) || 1,
    IssuedAt: resolved.certificado.IssuedAt || inscripcion.FechaEmisionCertificado || '',
    PdfArchived: Boolean(resolved.certificado.PdfHash && resolved.certificado.PdfStorageReference),
    VersionHistory: versions.map(function(item) {
      return {
        id: item.ID || inscripcion.ID,
        codigo: item.CodigoCertificado || '',
        version: Number(item.CertificateVersion) || 1,
        estado: estadoNormalizadoCertificado(item),
        issuedAt: item.IssuedAt || item.CertificatePreparedAt || '',
        issuedBy: item.IssuedBy || '',
        reason: item.ReissueReason || item.VoidReason || '',
        pdfArchived: Boolean(item.PdfHash && item.PdfStorageReference),
      };
    }),
  };
}

function getCertificadosAval(user, { filtros = {} } = {}) {
  if (!isAval(user) && !isAdmin(user)) throw new Error('Acceso denegado.');
  const entregables = isAdmin(user) ? sheetToObjects(getSheet('EntregablesAval')) : [];
  let data = sheetToObjects(getSheet('Inscripciones'))
    .filter(function(i) { return esVerdadero(i.RequiereAvalExterno); });
  if (isAval(user) && !isAdmin(user)) {
    const assignedId = institucionAvalIdDelUsuario_(user);
    const assignedName = institucionAvalDelUsuario(user);
    if (!assignedId && !assignedName) {
      return { success: false, error: 'Su usuario de aval no tiene una institución asignada. Solicite la configuración al administrador.' };
    }
    data = data.filter(function(i) {
      if (assignedId) return String(i.InstitucionID || '') === assignedId;
      // Legacy fallback is deliberately limited to records without canonical IDs.
      return !String(i.InstitucionID || '').trim() && mismaInstitucionAval(i.InstitucionAval, assignedName);
    });
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
  // Esta función se ejecuta de forma independiente de getInscripciones: cargar
  // sus propios mapas evita depender de variables locales de otros endpoints.
  const agreements = sheetToObjects(getSheet('Convenios'));
  const agreementById = {};
  agreements.forEach(function(item) { agreementById[String(item.ID || '')] = item; });
  const services = sheetToObjects(getSheet('Servicios'));
  // Whitelist explicito — a pedido, incluye cédula y correo del participante;
  // sigue sin exponer monto, RUC, teléfono ni datos de facturación a este rol.
  const out = data.map(function(i) {
    const entrega = isAdmin(user) ? entregableAvalActual_(i.ID, entregables) : null;
    const normalCertificate = isAdmin(user) ? resumenCertificadoNormalParaAval_(i, user) : null;
    const upgradeValidation = isAdmin(user) ? validarUpgradeAvalVerificadoParaInscripcion_(i) : null;
    const agreement = agreementById[String(i.ConvenioID || '')];
    let estimate = null;
    if (i.EstadoAval !== 'avalado' && agreement) {
      const economicRule = resolverConvenioEconomicoAval_(i.ConvenioID, i.InstitucionID);
      if (economicRule.success) {
        try { estimate = calcularSnapshotEconomicoAval_(i, agreement, economicRule.data.regla, services); }
        catch (e) { estimate = null; }
      }
    }
    return {
      ID: i.ID,
      ClienteNombre: i.ClienteNombre,
      ClienteID: i.ClienteID || '',
      ClienteTipoIdentificacion: i.ClienteTipoIdentificacion || '',
      ClienteEmail: i.ClienteEmail || '',
      ServicioNombre: i.ServicioNombre,
      Modalidad: i.Modalidad,
      FechaInicio: i.FechaInicio,
      FechaFin: i.FechaFin || '',
      Duracion: duracionDe(i),
      InstitucionAval: i.InstitucionAval || '',
      InstitucionID: i.InstitucionID || '',
      ConvenioID: i.ConvenioID || '',
      ConvenioObjeto: agreement ? agreement.Objeto || '' : '',
      AvalConvenioID: i.AvalConvenioID || '',
      AvalEstimacion: estimate,
      EstadoAval: i.EstadoAval || 'pendiente',
      AvalReferencia: i.AvalReferencia || '',
      AvalEnlaceExterno: i.AvalEnlaceExterno || '',
      AvalCodigoExterno: i.AvalCodigoExterno || '',
      FechaAval: i.FechaAval || '',
      AvalBaseTipoAplicado: i.AvalBaseTipoAplicado || '',
      AvalMontoBase: i.AvalMontoBase === '' || i.AvalMontoBase === undefined ? '' : Number(i.AvalMontoBase),
      AvalPorcentajeAplicado: i.AvalPorcentajeAplicado === '' || i.AvalPorcentajeAplicado === undefined ? '' : Number(i.AvalPorcentajeAplicado),
      AvalMontoCalculado: i.AvalMontoCalculado === '' || i.AvalMontoCalculado === undefined ? '' : Number(i.AvalMontoCalculado),
      AvalConfirmadoPor: i.AvalConfirmadoPor || '',
      // Do not reconstruct economics for old confirmations; keep the old recorded amount and label it.
      AvalLegacy: i.EstadoAval === 'avalado' && (!i.AvalBaseTipoAplicado || i.AvalMontoBase === ''
        || i.AvalMontoBase === undefined || i.AvalPorcentajeAplicado === '' || i.AvalPorcentajeAplicado === undefined
        || i.AvalMontoCalculado === '' || i.AvalMontoCalculado === undefined),
      ValorAval: i.EstadoAval === 'avalado'
        ? (i.AvalMontoCalculado !== '' && i.AvalMontoCalculado !== undefined
          ? Number(i.AvalMontoCalculado) || 0 : Number(i.ValorAval) || 0)
        : 0,
      // Contexto comercial CRM -- no sensible, ayuda al revisor de aval. Vacio para
      // registros sin oferta comercial (legacy o CRM sin compra asociada).
      CRMOfferType: i.CRMOfferType || '',
      CRMCompletionStatus: i.CRMCompletionStatus || '',
      CertificadoNormal: normalCertificate,
      AvalUpgradeVerificado: Boolean(upgradeValidation && upgradeValidation.success),
      AvalUpgradeCRMOrderID: upgradeValidation && upgradeValidation.success
        ? String(upgradeValidation.data.upgrade.CRMOrderID || '') : '',
      PuedeConfigurarAvalPosterior: Boolean(isAdmin(user) && normalCertificate
        && upgradeValidation && upgradeValidation.success && esVerdadero(i.RequiereAvalExterno)
        && i.EstadoAval !== 'avalado' && !i.InstitucionID && !i.ConvenioID
        && !i.AvalInstitucionID && !i.AvalConvenioID && !entrega),
      EntregableAval: entrega ? {
        ID: entrega.ID || '', CodigoCertificado: entrega.CodigoCertificado || '',
        CertificateStatus: entrega.CertificateStatus || '', EstadoEntregaFinal: entrega.EstadoEntregaFinal || '',
        PdfHash: entrega.PdfHash || '', IssuedAt: entrega.IssuedAt || '',
        CertificateVersion: Number(entrega.CertificateVersion) || 1,
        TemplateVersion: entrega.TemplateVersion || '',
        RequiereReemisionIdentificacion: identificacionDocumentalDifiere_(entrega, i, 'aval_institucional'),
        VersionHistory: isAdmin(user) ? entregables.filter(function(item) { return item.InscripcionID === i.ID; })
          .sort(function(a, b) { return (Number(b.CertificateVersion) || 0) - (Number(a.CertificateVersion) || 0); })
          .map(function(item) { return { id: item.ID, version: Number(item.CertificateVersion) || 1,
            codigo: item.CodigoCertificado || '', estado: estadoNormalizadoCertificado(item),
            templateVersion: item.TemplateVersion || '', issuedAt: item.IssuedAt || item.CertificatePreparedAt || '',
            issuedBy: item.IssuedBy || '', reason: item.ReissueReason || '',
            pdfArchived: Boolean(item.PdfHash && String(item.PdfStorageReference || '').indexOf('certificate-drive:') === 0) }; }) : [],
      } : null,
    };
  });
  return { success: true, data: out };
}

/**
 * Vincula, una sola vez, un upgrade CRM pagado con la institución/convenio que
 * gestionará el aval posterior a un certificado normal ya emitido. La edición
 * genérica del certificado emitido sigue bloqueada; este flujo no toca el PDF,
 * código, firma, estado ni snapshot del documento normal.
 */
function configurarAvalPosteriorCertificado(user, { id, institucionId, convenioId, confirmacion } = {}) {
  requireCertificateAdmin(user, 'POST_ISSUE_AVAL_CONFIGURED', { inscripcionId: id, canal: 'panel_aval' });
  if (confirmacion !== 'CONFIGURAR_AVAL_POSTERIOR') {
    return { success: false, error: 'Confirme explícitamente la configuración del aval posterior.' };
  }
  return conBloqueoCertificados(function() {
    const idInscripcion = String(id || '').trim();
    const sheet = getSheet('Inscripciones');
    const row = sheetToObjects(sheet).find(function(item) { return String(item.ID || '') === idInscripcion; });
    if (!row) return { success: false, error: 'No se encontró la inscripción vinculada.' };
    if (!esVerdadero(row.RequiereAvalExterno) || row.EstadoAval === 'avalado') {
      return { success: false, error: 'Esta inscripción no tiene un aval posterior pendiente de configuración.' };
    }
    const upgrade = validarUpgradeAvalVerificadoParaInscripcion_(row);
    if (!upgrade.success) return { success: false, error: upgrade.error };
    const normalCertificate = resumenCertificadoNormalParaAval_(row, user);
    if (!normalCertificate) return { success: false, error: 'Primero debe existir un certificado normal emitido y vigente.' };
    if (String(row.AvalInstitucionID || '').trim() || String(row.AvalConvenioID || '').trim()) {
      return { success: false, error: 'Ya existe un aval confirmado vinculado; su institución no puede cambiarse desde esta acción.' };
    }
    if (String(row.AvalReferencia || '').trim() || String(row.AvalEnlaceExterno || '').trim()
        || String(row.AvalCodigoExterno || '').trim() || Number(row.ValorAval || 0) !== 0) {
      return { success: false, error: 'El registro conserva datos previos de aval pendientes de revisión. No se sobrescribieron.' };
    }
    const existingDeliverable = sheetToObjects(getSheet('EntregablesAval')).filter(function(item) {
      return String(item.InscripcionID || '') === idInscripcion;
    });
    if (existingDeliverable.length) {
      return { success: false, error: 'Ya existe un documento de aval asociado. Revise su historial; no se creó ni reemplazó otro.' };
    }

    const institutionResult = resolverInstitucionMaestra_(institucionId);
    if (!institutionResult.success) return institutionResult;
    const agreementResult = resolverConvenioEconomicoAval_(convenioId, institutionResult.data.ID);
    if (!agreementResult.success) return agreementResult;
    try {
      calcularSnapshotEconomicoAval_(row, agreementResult.data.convenio, agreementResult.data.regla, sheetToObjects(getSheet('Servicios')));
    } catch (error) {
      return { success: false, error: error.message || 'No se pudo validar la regla económica del convenio.' };
    }

    const institution = institutionResult.data;
    const fields = {
      RequiereAvalExterno: true,
      EstadoAval: 'pendiente',
      InstitucionID: institution.ID,
      ConvenioID: agreementResult.data.convenio.ID,
      InstitucionAval: String(institution.Nombre || '').trim(),
    };
    const sameConfiguration = String(row.InstitucionID || '') === String(fields.InstitucionID)
      && String(row.ConvenioID || '') === String(fields.ConvenioID)
      && String(row.InstitucionAval || '') === String(fields.InstitucionAval)
      && esVerdadero(row.RequiereAvalExterno) && row.EstadoAval === 'pendiente';
    if (sameConfiguration) return { success: true, alreadyConfigured: true, data: { institutionName: fields.InstitucionAval } };
    if (String(row.InstitucionID || '').trim() || String(row.ConvenioID || '').trim()) {
      return { success: false, error: 'El aval ya tiene una institución/convenio asignado. No se cambió su configuración.' };
    }

    const before = {};
    Object.keys(fields).forEach(function(field) {
      before[field] = row._raw && tienePropiedad(row._raw, field) ? row._raw[field] : row[field];
    });
    updateRow(sheet, row, fields);
    const updated = sheetToObjects(sheet).find(function(item) { return String(item.ID || '') === idInscripcion; });
    if (!updated || !camposPersistidosCoinciden(updated, fields)) {
      updateRow(sheet, updated || row, before);
      return { success: false, error: 'No se pudo verificar el vínculo de institución y convenio. Se restauraron los datos anteriores.' };
    }
    try {
      registrarAuditoriaCertificado({
        certificadoId: normalCertificate.CodigoCertificado,
        inscripcionId: idInscripcion,
        usuario: user.Username,
        rol: user.Rol,
        accion: 'POST_ISSUE_AVAL_CONFIGURED',
        estadoAnterior: 'certificado_normal_emitido / aval_sin_configurar',
        estadoNuevo: 'certificado_normal_conservado / aval_pendiente',
        canal: 'panel_aval',
        resultado: 'ok',
        metadatos: {
          normalDocumentId: normalCertificate.ID,
          normalCertificateCode: normalCertificate.CodigoCertificado,
          normalVersion: normalCertificate.CertificateVersion,
          upgradeCrmOrderId: upgrade.data.upgrade.CRMOrderID,
          parentCrmOrderId: upgrade.data.parent.CRMOrderID,
          institutionId: institution.ID,
          agreementId: agreementResult.data.convenio.ID,
        },
      });
    } catch (error) {
      updateRow(sheet, updated, before);
      throw error;
    }
    return { success: true, alreadyConfigured: false, data: { institutionName: fields.InstitucionAval } };
  });
}

function marcarAval(user, { id, avalReferencia, valorAval, avalEnlaceExterno, avalCodigoExterno } = {}) {
  if (!isAval(user) && !isAdmin(user)) throw new Error('Acceso denegado.');
  return conBloqueoCertificados(function() {
    if (valorAval !== undefined) return { success: false, error: 'El valor del aval se calcula en el servidor; no envíe un monto manual.' };
    const sheet = getSheet('Inscripciones');
    const row = sheetToObjects(sheet).find(function(r) { return r.ID === id; });
    if (!row) return { success: false, error: 'Registro no encontrado.' };
    if (!esVerdadero(row.RequiereAvalExterno)) return { success: false, error: 'Este registro no requiere aval externo.' };
    if (!usuarioPuedeGestionarAvalDeInscripcion_(user, row)) {
      return { success: false, error: 'No está autorizado para gestionar certificados de otra institución.' };
    }
    const referencia = avalReferencia !== undefined ? String(avalReferencia || '').trim() : String(row.AvalReferencia || '').trim();
    const enlace = avalEnlaceExterno !== undefined ? String(avalEnlaceExterno || '').trim() : String(row.AvalEnlaceExterno || '').trim();
    const codigo = avalCodigoExterno !== undefined ? String(avalCodigoExterno || '').trim() : String(row.AvalCodigoExterno || '').trim();
    if (codigo.length > 64 || /[\x00-\x1f\x7f]/.test(codigo)) {
      return { success: false, error: 'El código externo debe tener hasta 64 caracteres y no contener saltos de línea.' };
    }
    if (!referencia && !enlace && !codigo) {
      return { success: false, error: 'Ingrese al menos una referencia, un código externo o un enlace de validación.' };
    }
    if (enlace && !/^https?:\/\//i.test(enlace)) {
      return { success: false, error: 'El enlace externo debe comenzar con http:// o https://.' };
    }
    if (row.EstadoAval === 'avalado') {
      const same = String(row.AvalReferencia || '').trim() === referencia
        && String(row.AvalEnlaceExterno || '').trim() === enlace
        && String(row.AvalCodigoExterno || '').trim() === codigo;
      if (same) {
        const legacy = !row.AvalBaseTipoAplicado || row.AvalMontoBase === '' || row.AvalMontoBase === undefined
          || row.AvalPorcentajeAplicado === '' || row.AvalPorcentajeAplicado === undefined
          || row.AvalMontoCalculado === '' || row.AvalMontoCalculado === undefined;
        return { success: true, alreadyConfirmed: true, legacy: legacy, data: {
          valorAval: !legacy ? Number(row.AvalMontoCalculado) || 0 : Number(row.ValorAval) || 0,
          baseMonto: legacy ? null : Number(row.AvalMontoBase),
          porcentajeAplicado: legacy ? null : Number(row.AvalPorcentajeAplicado),
          baseTipo: legacy ? '' : row.AvalBaseTipoAplicado,
        } };
      }
      return { success: false, error: 'El aval ya está confirmado y sus datos están bloqueados. Solicite a administración una corrección auditada.' };
    }
    if (row.EstadoAval && row.EstadoAval !== 'pendiente') {
      return { success: false, error: 'El estado actual del aval no permite confirmarlo. Solicite revisión administrativa.' };
    }
    const institutionId = String(row.InstitucionID || '').trim();
    const agreementId = String(row.ConvenioID || '').trim();
    if (!institutionId || !agreementId) {
      return { success: false, error: 'La inscripción antigua no tiene institución y convenio maestros vinculados. Administración debe revisarla; no se inferirán relaciones históricas.' };
    }
    const agreementResult = resolverConvenioEconomicoAval_(agreementId, institutionId);
    if (!agreementResult.success) return agreementResult;
    const snapshot = calcularSnapshotEconomicoAval_(row, agreementResult.data.convenio, agreementResult.data.regla);
    const now = new Date().toISOString();
    const fields = {
      EstadoAval: 'avalado', AvalReferencia: referencia, FechaAval: now,
      ValorAval: snapshot.monto, AvalEnlaceExterno: enlace, AvalCodigoExterno: codigo,
      AvalInstitucionID: institutionId, AvalConvenioID: agreementId,
      AvalBaseTipoAplicado: snapshot.baseTipo, AvalMontoBase: snapshot.baseMonto,
      AvalPorcentajeAplicado: snapshot.porcentaje, AvalMontoCalculado: snapshot.monto,
      AvalConfirmadoPor: user.Username,
    };
    const before = {};
    Object.keys(fields).forEach(function(field) { before[field] = row._raw && tienePropiedad(row._raw, field) ? row._raw[field] : row[field]; });
    updateRow(sheet, row, fields);
    const updated = sheetToObjects(sheet).find(function(item) { return item.ID === id; });
    if (!updated || !camposPersistidosCoinciden(updated, fields)) {
      updateRow(sheet, updated || row, before);
      return { success: false, error: 'No se verificó el registro económico del aval. No se confirmó la operación.' };
    }
    try {
      registrarAuditoriaCertificado({
        certificadoId: row.CodigoCertificado, inscripcionId: id, usuario: user.Username, rol: user.Rol,
        accion: 'AVAL_CONFIRMED', estadoAnterior: row.EstadoAval || 'pendiente', estadoNuevo: 'avalado',
        canal: 'panel_aval', resultado: 'ok', metadatos: {
          institucionId: institutionId, convenioId: agreementId, baseTipo: snapshot.baseTipo,
          baseMonto: snapshot.baseMonto, porcentajeAplicado: snapshot.porcentaje,
          montoCalculado: snapshot.monto, codigoExterno: codigo, confirmadoPor: user.Username, confirmadoEn: now,
        },
      });
    } catch (error) {
      updateRow(sheet, updated, before);
      throw error;
    }
    // Preparar el registro documental es idempotente y no altera el certificado estándar.
    let preparationWarning = '';
    try { prepararEntregableAvalTrasConfirmacion_(updated, user); }
    catch (error) { preparationWarning = 'El aval y su snapshot quedaron confirmados, pero no se pudo preparar el documento relacionado. Administración debe reintentar la preparación.'; }
    return { success: true, data: { valorAval: snapshot.monto, baseMonto: snapshot.baseMonto,
      porcentajeAplicado: snapshot.porcentaje, baseTipo: snapshot.baseTipo }, warning: preparationWarning };
  });
}

function corregirAvalConfirmado(user, { id, avalReferencia, avalEnlaceExterno, avalCodigoExterno, motivo, confirmacion } = {}) {
  requireAdmin(user);
  if (confirmacion !== 'CORREGIR_AVAL_CONFIRMADO') return { success: false, error: 'Confirme explícitamente la corrección del aval.' };
  const reason = String(motivo || '').trim();
  if (reason.length < 10) return { success: false, error: 'Explique el motivo de la corrección (mínimo 10 caracteres).' };
  return conBloqueoCertificados(function() {
    const sheet = getSheet('Inscripciones');
    const row = sheetToObjects(sheet).find(function(item) { return item.ID === id; });
    if (!row) return { success: false, error: 'Registro no encontrado.' };
    if (row.EstadoAval !== 'avalado') return { success: false, error: 'Solo se puede corregir un aval ya confirmado.' };
    const reference = avalReferencia !== undefined ? String(avalReferencia || '').trim() : String(row.AvalReferencia || '').trim();
    const link = avalEnlaceExterno !== undefined ? String(avalEnlaceExterno || '').trim() : String(row.AvalEnlaceExterno || '').trim();
    const code = avalCodigoExterno !== undefined ? String(avalCodigoExterno || '').trim() : String(row.AvalCodigoExterno || '').trim();
    if (code.length > 64 || /[\x00-\x1f\x7f]/.test(code)) return { success: false, error: 'El código externo debe tener hasta 64 caracteres y no contener saltos de línea.' };
    if (link && !/^https?:\/\//i.test(link)) return { success: false, error: 'El enlace externo debe comenzar con http:// o https://.' };
    if (!reference && !link && !code) return { success: false, error: 'Conserve al menos una referencia, código o enlace de validación.' };
    if (reference === String(row.AvalReferencia || '').trim() && link === String(row.AvalEnlaceExterno || '').trim()
        && code === String(row.AvalCodigoExterno || '').trim()) return { success: false, error: 'No hay cambios que registrar.' };
    const deliverableSheet = getSheet('EntregablesAval');
    const deliverable = entregableAvalActual_(id);
    if (deliverable && (deliverable.CertificateStatus === 'emitido' || deliverable.EstadoEntregaFinal === 'enviado'
        || deliverable.EstadoEntregaFinal === 'enviando' || String(deliverable.PdfHash || '').trim()
        || String(deliverable.PdfStorageReference || '').trim())) {
      return { success: false, error: 'El PDF oficial del aval ya fue emitido o archivado. No se puede alterar su información histórica.' };
    }
    const oldEnrollment = { AvalReferencia: row.AvalReferencia || '', AvalEnlaceExterno: row.AvalEnlaceExterno || '', AvalCodigoExterno: row.AvalCodigoExterno || '' };
    const newEnrollment = { AvalReferencia: reference, AvalEnlaceExterno: link, AvalCodigoExterno: code };
    updateRow(sheet, row, newEnrollment);
    let oldDeliverable = null;
    let newDeliverable = null;
    if (deliverable) {
      oldDeliverable = { ReferenciaExterna: deliverable.ReferenciaExterna || '', EnlaceExterno: deliverable.EnlaceExterno || '',
        CodigoExterno: deliverable.CodigoExterno || '', UpdatedAt: deliverable.UpdatedAt || '' };
      newDeliverable = { ReferenciaExterna: reference, EnlaceExterno: link, CodigoExterno: code, UpdatedAt: new Date().toISOString() };
      updateRow(deliverableSheet, deliverable, newDeliverable);
    }
    const updated = sheetToObjects(sheet).find(function(item) { return item.ID === id; });
    const updatedDeliverable = deliverable ? entregableAvalActual_(id) : null;
    if (!updated || !camposPersistidosCoinciden(updated, newEnrollment)
        || (deliverable && (!updatedDeliverable || !camposPersistidosCoinciden(updatedDeliverable, newDeliverable)))) {
      updateRow(sheet, updated || row, oldEnrollment);
      if (deliverable && oldDeliverable) updateRow(deliverableSheet, updatedDeliverable || deliverable, oldDeliverable);
      return { success: false, error: 'No se pudo verificar la corrección. Se restauró la información anterior y no se registró el cambio.' };
    }
    try {
      registrarAuditoriaCertificado({
        certificadoId: row.CodigoCertificado, inscripcionId: id, usuario: user.Username, rol: user.Rol,
        accion: 'AVAL_CONFIRMED_DATA_CORRECTED', estadoAnterior: 'avalado', estadoNuevo: 'avalado',
        canal: 'admin_correction', resultado: 'ok', metadatos: { motivo: reason, anterior: oldEnrollment, nuevo: newEnrollment },
      });
    } catch (error) {
      updateRow(sheet, updated || row, oldEnrollment);
      if (deliverable && oldDeliverable) updateRow(deliverableSheet, updatedDeliverable || deliverable, oldDeliverable);
      throw error;
    }
    return { success: true };
  });
}

/** Corrige solo el dato fuente de futuras versiones; nunca modifica PDFs ni facturas ya emitidos. */
function corregirIdentificacionAvalConfirmado(user, { id, identificacionAnterior, identificacionNueva, tipoIdentificacion,
  motivo, confirmacion } = {}) {
  requireCertificateAdmin(user, 'AVAL_PARTICIPANT_ID_CORRECTION', { inscripcionId: id, canal: 'api' });
  if (confirmacion !== 'CORREGIR_IDENTIFICACION_AVAL') {
    return { success: false, error: 'Confirme explícitamente la corrección de identificación.' };
  }
  const reason = String(motivo || '').trim();
  if (reason.length < 10) return { success: false, error: 'Explique el motivo de la corrección (mínimo 10 caracteres).' };
  if (typeof identificacionAnterior !== 'string' || typeof identificacionNueva !== 'string') {
    return { success: false, error: 'Las identificaciones deben enviarse como texto para conservar sus ceros iniciales.' };
  }
  const nextId = identificacionNueva.trim();
  const nextType = normalizarTipoIdentificacion_(tipoIdentificacion);
  const identityError = validarIdentificacion_(nextType, nextId, { required: true });
  if (identityError) return { success: false, error: identityError };
  return conBloqueoCertificados(function() {
    const sheet = getSheet('Inscripciones');
    const row = sheetToObjects(sheet).find(function(item) { return item.ID === id; });
    if (!row) return { success: false, error: 'Inscripción no encontrada.' };
    if (row.EstadoAval !== 'avalado') return { success: false, error: 'Esta corrección excepcional requiere un aval confirmado.' };
    if (String(row.ClienteID || '') !== identificacionAnterior) {
      return { success: false, error: 'La identificación cambió desde que abrió el formulario. Actualice la lista antes de continuar.' };
    }
    const actual = entregableAvalActual_(id);
    if (!actual || !['emitido', 'anulado'].includes(estadoNormalizadoCertificado(actual))
        || !/^[a-f0-9]{64}$/i.test(String(actual.PdfHash || ''))
        || !String(actual.PdfStorageReference || '').startsWith('certificate-drive:')) {
      return { success: false, error: 'Primero debe existir una versión avalada oficial e íntegra; no se modificará un PDF pendiente.' };
    }
    const normal = sheetToObjects(getSheet('Certificados')).filter(function(item) { return item.InscripcionID === id; })
      .sort(function(a, b) { return (Number(b.CertificateVersion) || 1) - (Number(a.CertificateVersion) || 1); })[0];
    if (normal && estadoNormalizadoCertificado(normal) === 'pendiente_pdf') {
      return { success: false, error: 'Complete o revise la versión normal pendiente antes de corregir la identificación.' };
    }
    if (nextId === String(row.ClienteID || '') && nextType === normalizarTipoIdentificacion_(row.ClienteTipoIdentificacion)) {
      return { success: false, error: 'La identificación y su tipo no cambiaron.' };
    }
    const before = { ClienteID: row.ClienteID || '', ClienteTipoIdentificacion: row.ClienteTipoIdentificacion || '' };
    const after = { ClienteID: nextId, ClienteTipoIdentificacion: nextType };
    updateRow(sheet, row, after);
    const persisted = sheetToObjects(sheet).find(function(item) { return item.ID === id; });
    if (!persisted || !camposPersistidosCoinciden(persisted, after)) {
      updateRow(sheet, persisted || row, before);
      return { success: false, error: 'No se pudo verificar la corrección. Se restauraron los datos anteriores.' };
    }
    try {
      registrarAuditoriaCertificado({ certificadoId: actual.CodigoCertificado, inscripcionId: id,
        usuario: user.Username, rol: user.Rol, accion: 'AVAL_PARTICIPANT_ID_CORRECTED',
        estadoAnterior: String(before.ClienteID), estadoNuevo: nextId, canal: 'admin_correction',
        resultado: 'ok', motivo: reason, metadatos: { tipoAnterior: before.ClienteTipoIdentificacion,
          tipoNuevo: nextType, avalVersionId: actual.ID, normalVersionId: normal ? normal.ID : '' } });
    } catch (error) {
      updateRow(sheet, persisted, before);
      throw error;
    }
    return { success: true, data: { identificacion: nextId, tipoIdentificacion: nextType,
      requiereReemisionNormal: Boolean(normal), requiereReemisionAval: true,
      advertencia: 'Los PDFs y las facturas previas no cambian. Reemita las versiones necesarias antes de enviarlas.' } };
  });
}

// ─────────────────────────────────────────────
// MODULO COMERCIAL CRM (aditivo)
//
// Identidad de COMPRA = CRMOrderID (hoja CRMCompras, idempotencia). CRMEnrollmentID
// sigue siendo la identidad ACADEMICA: existe UNA SOLA Inscripcion por
// CRMEnrollmentID (creada por importCrmEnrollment o por la primera compra
// FULL/INSTITUTIONAL, lo que ocurra primero) -- AVAL_UPGRADE nunca crea una
// Inscripcion nueva, siempre reutiliza la de su compra INSTITUTIONAL padre. No
// reemplaza importCrmEnrollment (intacto) ni addInscripcion (intacto).
// ─────────────────────────────────────────────

const CRM_OFFER_TYPES = ['FULL', 'INSTITUTIONAL', 'AVAL_UPGRADE'];
const CRM_COMPLETION_STATUS_COMPLETADO = 'completado';
const CRM_STATUS_BATCH_LIMIT = 50;

const CRM_SERVICE_ACTIONS_ = [
  'importCrmPurchase',
  'verificarPagoCompraCrm',
  'getCrmPurchaseStatus',
  'getCrmPurchaseStatuses',
  'markCrmCourseCompleted',
  'getCrmEnrollmentCommerceState',
  'getCrmEnrollmentCommerceStates',
];

function isCrmServiceAction_(action) {
  return CRM_SERVICE_ACTIONS_.indexOf(action) !== -1;
}

/** Igual patron que validateFiscalServiceToken_: secreto propio (CRM_SERVICE_TOKEN,
 * Script Property), usuario sintetico admin. */
function validateCrmServiceToken_(serviceToken) {
  const expected = PropertiesService.getScriptProperties().getProperty('CRM_SERVICE_TOKEN');
  if (!expected || String(serviceToken) !== expected) return null;
  return { Username: 'crm-service', Rol: 'admin', UserID: 'SERVICE-CRM' };
}

function registrarAuditoriaCrm_(evento) {
  registrarAuditoriaCertificado(Object.assign({ canal: 'crm_service' }, evento));
}

function crmPaymentStatusLabel_(estadoPago) {
  const map = { pendiente: 'PAYMENT_PENDING', pagado: 'PAYMENT_REPORTED', verificado: 'PAYMENT_VERIFIED', cancelado: 'PAYMENT_CANCELLED' };
  return map[estadoPago] || 'PAYMENT_PENDING';
}

/** Whitelist explicito de lo que el CRM puede ver -- nunca RUC, direccion fiscal,
 * telefono ni ningun otro dato de facturacion. Une la compra (CRMCompras) con el
 * estado academico/certificado de su Inscripcion. */
function crmPurchaseParaCliente_(compra) {
  const inscripcion = sheetToObjects(getSheet('Inscripciones')).find(function (r) { return r.ID === compra.FinanceInscripcionID; }) || {};
  return {
    crmOrderId: compra.CRMOrderID || '',
    crmEnrollmentId: compra.CRMEnrollmentID || '',
    crmContactId: compra.CRMContactID || '',
    crmCourseId: compra.CRMCourseID || '',
    financeInscripcionId: compra.FinanceInscripcionID || '',
    offerType: compra.OfferType || '',
    parentCrmOrderId: compra.ParentCRMOrderID || '',
    amount: Number(compra.Amount) || 0,
    paymentStatus: crmPaymentStatusLabel_(compra.PaymentStatus),
    paymentVerifiedAt: compra.PaymentStatus === 'verificado' ? (compra.FechaVerificacionPago || '') : '',
    requiresExternalAval: esVerdadero(inscripcion.RequiereAvalExterno),
    avalStatus: inscripcion.EstadoAval || '',
    certificateStatus: inscripcion.ID ? estadoNormalizadoCertificado(inscripcion) : '',
    completionStatus: inscripcion.CRMCompletionStatus || '',
    completedAt: inscripcion.CRMCompletedAt || '',
  };
}

/**
 * Devuelve el ID de la UNICA Inscripcion academica del enrollment, creandola si no
 * existe todavia (mismo mapeo de campos que importCrmEnrollment: resuelve el
 * Servicio por nombre, nunca lo crea). Si ya existe (creada por importCrmEnrollment,
 * o por una compra anterior), la reutiliza -- nunca crea una segunda.
 */
function obtenerOCrearInscripcionParaCompra_(p, user) {
  const sheet = getSheet('Inscripciones');
  const existente = filasInscripcionesDecoradas(sheet).rows.find(function (r) { return String(r.CRMEnrollmentID || '').trim() === p.crmEnrollmentId; });
  if (existente) {
    const cambios = {};
    if (p.offerType === 'FULL' && !esVerdadero(existente.RequiereAvalExterno)) {
      cambios.RequiereAvalExterno = true;
      cambios.EstadoAval = existente.EstadoAval || 'pendiente';
    }
    if (!existente.CRMOfferType) cambios.CRMOfferType = p.offerType;
    if (Object.keys(cambios).length) updateRow(sheet, existente, cambios);
    return { id: existente.ID, created: false };
  }

  const participant = p.participant || {};
  const fullName = String(participant.fullName || [participant.firstName, participant.lastName].filter(Boolean).join(' ')).trim();
  if (!fullName) throw new Error('participant.fullName (o firstName/lastName) es obligatorio.');
  const email = String(participant.email || '').trim();
  if (email && !emailValido(email)) throw new Error('El correo del participante no es válido.');
  const service = resolverServicioImportacionCrm(p.courseTitle);
  if (!service) throw new Error('Servicio de Finance no configurado para este curso.');
  const startDate = p.startDate ? fechaSolo(p.startDate) : '';
  const endDate = p.endDate ? fechaSolo(p.endDate) : '';
  const modality = String(p.modality || service.Modalidad || '').trim();

  const id = generateId('INS');
  const ingresoId = generateId('ING');
  const now = new Date().toISOString();
  appendInscripcionPorEncabezados(sheet, {
    ID: id, ClienteNombre: fullName, ClienteID: String(participant.identification || '').trim(),
    ClienteEmail: email, ClienteTelefono: String(participant.phone || '').trim(),
    ServicioID: service.ID, ServicioNombre: service.Nombre, Modalidad: modality,
    FechaInicio: startDate, FechaFin: endDate, Monto: Number(p.amount) || 0, MetodoPago: '',
    RazonSocial: '', RUC: '', DireccionFactura: '',
    EstadoPago: 'pendiente', EstadoCertificado: 'pendiente', IngresoID: ingresoId, Notas: '',
    CreadoPor: user.Username, FechaCreacion: now, FechaEmisionCertificado: '',
    RequiereAvalExterno: p.offerType === 'FULL', EstadoAval: p.offerType === 'FULL' ? 'pendiente' : '',
    AvalReferencia: '', FechaAval: '', ValorAval: 0,
    NumeroComprobante: '', FechaPago: '', FechaVerificacionPago: '', VerificadoPor: '',
    InstitucionAval: String(p.institucionAval || '').trim(),
    CodigoCertificado: '', EmitidoPor: '', EstadoEntrega: 'pendiente', FechaEntregaCertificado: '', EntregadoPor: '',
    AvalEnlaceExterno: '', AvalCodigoExterno: '',
    CRMEnrollmentID: p.crmEnrollmentId, CRMContactID: p.crmContactId, CRMCourseID: p.crmCourseId, Origen: 'CRM',
    CRMOfferType: p.offerType, CRMParentOrderID: '', CRMCompletionStatus: '', CRMCompletedAt: '',
  });
  getSheet('Ingresos').appendRow([
    ingresoId, now.slice(0, 10), tipoIngresoPorModalidad(modality), modality,
    'Compra CRM (' + p.offerType + '): ' + fullName + ' — ' + service.Nombre,
    fullName, '', Number(p.amount) || 0, '', 'pendiente_verificacion', '', user.Username, now,
    String(participant.phone || '').trim(), '',
  ]);
  return { id: id, created: true };
}

/**
 * Contrato comercial CRM -> Finance. Idempotente por crmOrderId: repetir la misma
 * compra devuelve el MISMO registro, nunca un duplicado. No deriva offerType del
 * monto (viene explicito). AVAL_UPGRADE nunca crea Inscripcion: reutiliza la de su
 * compra INSTITUTIONAL padre -- por eso nunca hay "dos inscripciones falsas" para
 * el mismo alumno/curso.
 */
function importCrmPurchase(user, params) {
  const p = params || {};
  requireAdmin(user);
  if (!p.crmOrderId) throw new Error('crmOrderId es obligatorio.');
  if (!p.crmEnrollmentId) throw new Error('crmEnrollmentId es obligatorio.');
  if (!p.crmContactId) throw new Error('crmContactId es obligatorio.');
  if (!p.crmCourseId) throw new Error('crmCourseId es obligatorio.');
  if (CRM_OFFER_TYPES.indexOf(p.offerType) === -1) {
    throw new Error('offerType debe ser uno de: ' + CRM_OFFER_TYPES.join(', ') + '.');
  }
  const amountValue = p.amount;
  const amount = Number(amountValue);
  if (String(amountValue === undefined || amountValue === null ? '' : amountValue).trim() === '' || !isFinite(amount) || amount < 0) {
    throw new Error('amount debe ser un número no negativo.');
  }

  return conBloqueoCertificados(function () {
    const comprasSheet = getSheet('CRMCompras');
    const existente = sheetToObjects(comprasSheet).find(function (r) { return r.CRMOrderID === p.crmOrderId; });
    if (existente) {
      registrarAuditoriaCrm_({ inscripcionId: existente.FinanceInscripcionID, usuario: user.Username, rol: user.Rol, accion: 'CRM_PURCHASE_REUSED', resultado: 'ok', metadatos: { crmOrderId: p.crmOrderId } });
      return { success: true, data: crmPurchaseParaCliente_(existente), idempotent: true };
    }

    let parentCompra = null;
    if (p.offerType === 'AVAL_UPGRADE') {
      if (!p.parentCrmOrderId) throw new Error('parentCrmOrderId es obligatorio para AVAL_UPGRADE.');
      parentCompra = sheetToObjects(comprasSheet).find(function (r) { return r.CRMOrderID === p.parentCrmOrderId; });
      if (!parentCompra) throw new Error('parentCrmOrderId no corresponde a ninguna compra existente en Finance.');
      if (parentCompra.OfferType !== 'INSTITUTIONAL') throw new Error('AVAL_UPGRADE solo puede vincularse a una compra INSTITUTIONAL.');
      if (parentCompra.CRMEnrollmentID !== p.crmEnrollmentId || parentCompra.CRMContactID !== p.crmContactId || parentCompra.CRMCourseID !== p.crmCourseId) {
        throw new Error('parentCrmOrderId no coincide con el mismo enrollment/contact/course de este upgrade.');
      }
    } else if (p.parentCrmOrderId) {
      throw new Error('parentCrmOrderId debe estar vacío para offerType ' + p.offerType + '.');
    }

    if (p.offerType === 'FULL' || p.offerType === 'INSTITUTIONAL') {
      const conflicto = sheetToObjects(comprasSheet).find(function (r) {
        return r.CRMEnrollmentID === p.crmEnrollmentId && (r.OfferType === 'FULL' || r.OfferType === 'INSTITUTIONAL') && r.OfferType !== p.offerType && r.PaymentStatus === 'verificado';
      });
      if (conflicto) throw new Error('El enrollment ya tiene una compra ' + conflicto.OfferType + ' verificada; no se puede registrar ' + p.offerType + ' sin una regla de transición explícita.');
    }

    let financeInscripcionId, inscripcionCreada;
    if (p.offerType === 'AVAL_UPGRADE') {
      financeInscripcionId = parentCompra.FinanceInscripcionID; // SIEMPRE la del padre, nunca otra
      inscripcionCreada = false;
      const ingresoId = generateId('ING');
      const now0 = new Date().toISOString();
      getSheet('Ingresos').appendRow([
        ingresoId, now0.slice(0, 10), 'Curso', '', 'Upgrade de aval CRM: orden ' + p.crmOrderId,
        '', '', amount, '', 'pendiente_verificacion', '', user.Username, now0, '', '',
      ]);
    } else {
      const resultado = obtenerOCrearInscripcionParaCompra_(p, user);
      financeInscripcionId = resultado.id;
      inscripcionCreada = resultado.created;
    }

    const id = generateId('CRC');
    const now = new Date().toISOString();
    comprasSheet.appendRow(SHEET_HEADERS.CRMCompras.map(function (header) {
      const map = {
        ID: id, CRMOrderID: p.crmOrderId, CRMEnrollmentID: p.crmEnrollmentId,
        FinanceInscripcionID: financeInscripcionId, CRMContactID: p.crmContactId, CRMCourseID: p.crmCourseId,
        OfferType: p.offerType, ParentCRMOrderID: p.offerType === 'AVAL_UPGRADE' ? p.parentCrmOrderId : '',
        Amount: amount, PaymentStatus: 'pendiente',
        NumeroComprobante: '', FechaPago: '', FechaVerificacionPago: '', VerificadoPor: '',
        CreatedAt: now, UpdatedAt: now,
      };
      return map[header] !== undefined ? map[header] : '';
    }));
    const compraCreada = sheetToObjects(comprasSheet).find(function (r) { return r.ID === id; });

    registrarAuditoriaCrm_({
      inscripcionId: financeInscripcionId, usuario: user.Username, rol: user.Rol,
      accion: 'CRM_PURCHASE_IMPORTED', resultado: 'ok',
      metadatos: { crmOrderId: p.crmOrderId, offerType: p.offerType, crmEnrollmentId: p.crmEnrollmentId, parentCrmOrderId: p.parentCrmOrderId || null, inscripcionReutilizada: !inscripcionCreada },
    });

    return { success: true, data: crmPurchaseParaCliente_(compraCreada), idempotent: false };
  });
}

/**
 * Verifica el pago de UNA compra especifica (identidad CRMOrderID) -- Finance sigue
 * siendo la unica autoridad de pago. Distinto de verificarPagoInscripcion: una
 * Inscripcion puede tener mas de una compra (INSTITUTIONAL + AVAL_UPGRADE), cada una
 * con su propio pago, por lo que el estado de pago vive en CRMCompras, no en
 * Inscripciones.EstadoPago para el flujo comercial nuevo. Si la compra es la que
 * otorga el acceso base (FULL/INSTITUTIONAL), sincroniza Inscripciones.EstadoPago;
 * si es un AVAL_UPGRADE, habilita el aval en la compra/Inscripcion padre.
 */
function verificarPagoCompraCrm(user, { crmOrderId, numeroComprobante, fechaPago } = {}) {
  requireAdmin(user);
  if (!crmOrderId) throw new Error('crmOrderId es obligatorio.');
  return conBloqueoCertificados(function () {
    const comprasSheet = getSheet('CRMCompras');
    const compra = sheetToObjects(comprasSheet).find(function (r) { return r.CRMOrderID === crmOrderId; });
    if (!compra) return { success: false, error: 'crmOrderId no encontrado.' };
    if (compra.PaymentStatus === 'verificado') {
      return { success: true, data: crmPurchaseParaCliente_(compra), alreadyVerified: true };
    }
    const now = new Date().toISOString();
    updateRow(comprasSheet, compra, {
      PaymentStatus: 'verificado',
      NumeroComprobante: String(numeroComprobante || '').trim(),
      FechaPago: fechaPago ? fechaSolo(fechaPago) : compra.FechaPago,
      FechaVerificacionPago: now,
      VerificadoPor: user.Username,
      UpdatedAt: now,
    });
    registrarAuditoriaCrm_({
      inscripcionId: compra.FinanceInscripcionID, usuario: user.Username, rol: user.Rol,
      accion: 'PAYMENT_VERIFIED', estadoAnterior: compra.PaymentStatus || 'pendiente', estadoNuevo: 'verificado',
      resultado: 'ok', metadatos: { crmOrderId: crmOrderId, offerType: compra.OfferType },
    });

    if (compra.OfferType === 'FULL' || compra.OfferType === 'INSTITUTIONAL') {
      const insSheet = getSheet('Inscripciones');
      const inscripcion = sheetToObjects(insSheet).find(function (r) { return r.ID === compra.FinanceInscripcionID; });
      if (inscripcion && inscripcion.EstadoPago !== 'verificado') {
        updateRow(insSheet, inscripcion, {
          EstadoPago: 'verificado',
          FechaVerificacionPago: inscripcion.FechaVerificacionPago || now,
          VerificadoPor: inscripcion.VerificadoPor || user.Username,
        });
      }
    } else if (compra.OfferType === 'AVAL_UPGRADE') {
      aplicarAvalUpgradeAlPadre_(compra, user);
    }

    const compraActualizada = sheetToObjects(comprasSheet).find(function (r) { return r.CRMOrderID === crmOrderId; });
    return { success: true, data: crmPurchaseParaCliente_(compraActualizada), alreadyVerified: false };
  });
}

/**
 * Efecto de un AVAL_UPGRADE con pago verificado: habilita el proceso de aval en la
 * Inscripcion (compartida) de la compra INSTITUTIONAL padre. Idempotente. Nunca
 * duplica el certificado institucional ni crea una inscripcion nueva.
 */
function aplicarAvalUpgradeAlPadre_(compraUpgrade, user) {
  const insSheet = getSheet('Inscripciones');
  const padre = sheetToObjects(insSheet).find(function (r) { return r.ID === compraUpgrade.FinanceInscripcionID; });
  if (!padre) return;
  if (esVerdadero(padre.RequiereAvalExterno)) return; // ya aplicado, idempotente
  updateRow(insSheet, padre, {
    RequiereAvalExterno: true,
    EstadoAval: padre.EstadoAval || 'pendiente',
    InstitucionAval: padre.InstitucionAval || '',
  });
  registrarAuditoriaCrm_({
    inscripcionId: padre.ID, usuario: user.Username, rol: user.Rol,
    accion: 'AVAL_UPGRADE_APPLIED', estadoAnterior: 'sin_aval', estadoNuevo: 'aval_habilitado',
    resultado: 'ok', metadatos: { crmOrderId: compraUpgrade.ParentCRMOrderID, upgradeCrmOrderId: compraUpgrade.CRMOrderID },
  });
}

/**
 * Enums estables del estado comercial EFECTIVO de un enrollment (no de una compra
 * individual). FULL PAYMENT_VERIFIED tiene prioridad maxima; una compra CANCELLED
 * nunca cuenta para entitlement; nunca se infiere offerType por amount -- el estado
 * sale exclusivamente de OfferType + PaymentStatus, campos explicitos guardados por
 * importCrmPurchase/verificarPagoCompraCrm.
 */
const CRM_COMMERCIAL_STATES = Object.freeze({
  NO_PURCHASE: 'NO_PURCHASE',
  FULL_PENDING: 'FULL_PENDING',
  FULL_VERIFIED: 'FULL_VERIFIED',
  INSTITUTIONAL_PENDING: 'INSTITUTIONAL_PENDING',
  INSTITUTIONAL_VERIFIED: 'INSTITUTIONAL_VERIFIED',
  UPGRADE_PENDING: 'UPGRADE_PENDING',
  FULL_UPGRADED: 'FULL_UPGRADED',
  CANCELLED: 'CANCELLED',
  LEGACY_UNCLASSIFIED: 'LEGACY_UNCLASSIFIED',
});

/**
 * Lee CRMCompras + Inscripciones UNA sola vez y arma indices por CRMEnrollmentID --
 * evita releer las hojas completas por cada enrollment en un batch (con esto, 100
 * enrollments en un batch cuestan lo mismo en lecturas de Sheets que 1: el costo
 * fijo son las 2 lecturas completas, el resto es filtrado en memoria).
 */
function construirIndiceComercialCrm_() {
  const comprasPorEnrollment = {};
  sheetToObjects(getSheet('CRMCompras')).forEach(function (c) {
    const key = c.CRMEnrollmentID;
    if (!comprasPorEnrollment[key]) comprasPorEnrollment[key] = [];
    comprasPorEnrollment[key].push(c);
  });
  const inscripcionPorEnrollment = {};
  sheetToObjects(getSheet('Inscripciones')).forEach(function (r) {
    if (r.CRMEnrollmentID) inscripcionPorEnrollment[r.CRMEnrollmentID] = r;
  });
  return { comprasPorEnrollment: comprasPorEnrollment, inscripcionPorEnrollment: inscripcionPorEnrollment };
}

function calcularEstadoComercialCrm_(crmEnrollmentId, indice) {
  const compras = indice.comprasPorEnrollment[crmEnrollmentId] || [];
  const inscripcion = indice.inscripcionPorEnrollment[crmEnrollmentId] || null;

  // CANCELLED nunca genera derechos: se excluye de la detección de FULL/INSTITUTIONAL/UPGRADE.
  const activas = compras.filter(function (c) { return c.PaymentStatus !== 'cancelado'; });
  const fullCompra = activas.find(function (c) { return c.OfferType === 'FULL'; });
  const instCompra = activas.find(function (c) { return c.OfferType === 'INSTITUTIONAL'; });
  const upgradeCompra = activas.find(function (c) { return c.OfferType === 'AVAL_UPGRADE'; });

  let commercialState;
  if (fullCompra && fullCompra.PaymentStatus === 'verificado') {
    commercialState = CRM_COMMERCIAL_STATES.FULL_VERIFIED;
  } else if (instCompra && instCompra.PaymentStatus === 'verificado') {
    if (upgradeCompra && upgradeCompra.PaymentStatus === 'verificado') commercialState = CRM_COMMERCIAL_STATES.FULL_UPGRADED;
    else if (upgradeCompra) commercialState = CRM_COMMERCIAL_STATES.UPGRADE_PENDING;
    else commercialState = CRM_COMMERCIAL_STATES.INSTITUTIONAL_VERIFIED;
  } else if (fullCompra) {
    commercialState = CRM_COMMERCIAL_STATES.FULL_PENDING;
  } else if (instCompra) {
    commercialState = CRM_COMMERCIAL_STATES.INSTITUTIONAL_PENDING;
  } else if (compras.length > 0) {
    // Hubo compras para este enrollment, pero ninguna activa (todas canceladas).
    commercialState = CRM_COMMERCIAL_STATES.CANCELLED;
  } else if (inscripcion) {
    // Inscripcion existente (ej. importCrmEnrollment legacy) sin ninguna compra
    // vinculada -- FAIL CLOSED explicito: nunca se infiere FULL/INSTITUTIONAL por
    // el monto historico de la Inscripcion.
    commercialState = CRM_COMMERCIAL_STATES.LEGACY_UNCLASSIFIED;
  } else {
    commercialState = CRM_COMMERCIAL_STATES.NO_PURCHASE;
  }

  const effectiveEntitlement =
    (commercialState === CRM_COMMERCIAL_STATES.FULL_VERIFIED || commercialState === CRM_COMMERCIAL_STATES.FULL_UPGRADED) ? 'FULL'
    : (commercialState === CRM_COMMERCIAL_STATES.INSTITUTIONAL_VERIFIED || commercialState === CRM_COMMERCIAL_STATES.UPGRADE_PENDING) ? 'INSTITUTIONAL'
    : 'NONE';

  return {
    crmEnrollmentId: crmEnrollmentId,
    financeInscripcionId: inscripcion ? inscripcion.ID : '',
    commercialState: commercialState,
    effectiveEntitlement: effectiveEntitlement,
    purchases: compras.map(function (c) {
      return {
        crmOrderId: c.CRMOrderID || '',
        offerType: c.OfferType || '',
        parentCrmOrderId: c.ParentCRMOrderID || '',
        amount: Number(c.Amount) || 0,
        paymentStatus: crmPaymentStatusLabel_(c.PaymentStatus),
        paymentVerifiedAt: c.PaymentStatus === 'verificado' ? (c.FechaVerificacionPago || '') : '',
      };
    }),
    requiresExternalAval: inscripcion ? esVerdadero(inscripcion.RequiereAvalExterno) : false,
    avalStatus: inscripcion ? (inscripcion.EstadoAval || '') : '',
    completionStatus: inscripcion ? (inscripcion.CRMCompletionStatus || '') : '',
    completedAt: inscripcion ? (inscripcion.CRMCompletedAt || '') : '',
  };
}

function getCrmEnrollmentCommerceState(user, params) {
  const p = params || {};
  if (!p.crmEnrollmentId) throw new Error('crmEnrollmentId es obligatorio.');
  const indice = construirIndiceComercialCrm_();
  return { success: true, data: calcularEstadoComercialCrm_(p.crmEnrollmentId, indice) };
}

// 100 es seguro: construirIndiceComercialCrm_ lee CRMCompras/Inscripciones UNA sola
// vez para todo el batch (ver comentario ahi); el costo no crece con el tamano del
// batch salvo el mapeo final, que es filtrado en memoria.
const CRM_ENROLLMENT_STATE_BATCH_LIMIT = 100;

function getCrmEnrollmentCommerceStates(user, params) {
  const p = params || {};
  const ids = Array.isArray(p.crmEnrollmentIds) ? p.crmEnrollmentIds.filter(Boolean).slice(0, CRM_ENROLLMENT_STATE_BATCH_LIMIT) : [];
  if (ids.length === 0) throw new Error('crmEnrollmentIds debe ser un arreglo no vacío (máximo ' + CRM_ENROLLMENT_STATE_BATCH_LIMIT + ').');
  const indice = construirIndiceComercialCrm_();
  return { success: true, data: ids.map(function (id) { return calcularEstadoComercialCrm_(id, indice); }) };
}

function getCrmPurchaseStatus(user, params) {
  const p = params || {};
  if (!p.crmOrderId) throw new Error('crmOrderId es obligatorio.');
  const compra = sheetToObjects(getSheet('CRMCompras')).find(function (r) { return r.CRMOrderID === p.crmOrderId; });
  if (!compra) return { success: false, error: 'crmOrderId no encontrado.' };
  return { success: true, data: crmPurchaseParaCliente_(compra) };
}

function getCrmPurchaseStatuses(user, params) {
  const p = params || {};
  const ids = Array.isArray(p.crmOrderIds) ? p.crmOrderIds.filter(Boolean).slice(0, CRM_STATUS_BATCH_LIMIT) : [];
  if (ids.length === 0) throw new Error('crmOrderIds debe ser un arreglo no vacío (máximo ' + CRM_STATUS_BATCH_LIMIT + ').');
  const idsSet = {};
  ids.forEach(function (i) { idsSet[i] = true; });
  const compras = sheetToObjects(getSheet('CRMCompras')).filter(function (r) { return idsSet[r.CRMOrderID]; });
  return { success: true, data: compras.map(crmPurchaseParaCliente_) };
}

/**
 * Confirma que el CRM/Moodle marco el curso completado/aprobado para un enrollment.
 * Actualiza la UNICA Inscripcion academica de ese enrollment. Idempotente.
 */
function markCrmCourseCompleted(user, params) {
  const p = params || {};
  if (!p.crmEnrollmentId) throw new Error('crmEnrollmentId es obligatorio.');
  const completionStatus = p.completionStatus || CRM_COMPLETION_STATUS_COMPLETADO;
  return conBloqueoCertificados(function () {
    const sheet = getSheet('Inscripciones');
    const row = sheetToObjects(sheet).find(function (r) { return r.CRMEnrollmentID === p.crmEnrollmentId; });
    if (!row) throw new Error('crmEnrollmentId no tiene ninguna inscripción registrada en Finance.');
    if (row.CRMCompletionStatus === completionStatus) {
      return { success: true, data: { crmEnrollmentId: p.crmEnrollmentId, completionStatus: completionStatus, inscripcionId: row.ID }, idempotent: true };
    }
    const now = new Date().toISOString();
    updateRow(sheet, row, { CRMCompletionStatus: completionStatus, CRMCompletedAt: row.CRMCompletedAt || now });
    registrarAuditoriaCrm_({
      inscripcionId: row.ID, usuario: user.Username, rol: user.Rol,
      accion: 'CRM_COMPLETION_CONFIRMED', estadoAnterior: row.CRMCompletionStatus || '', estadoNuevo: completionStatus,
      resultado: 'ok', metadatos: { crmEnrollmentId: p.crmEnrollmentId, source: p.source || '' },
    });
    return { success: true, data: { crmEnrollmentId: p.crmEnrollmentId, completionStatus: completionStatus, inscripcionId: row.ID }, idempotent: false };
  });
}

/**
 * Tras marcarAval confirmar el aval institucional de una compra FULL comercial,
 * prepara/actualiza el segundo entregable (certificado avalado) en la hoja
 * SEPARADA EntregablesAval -- nunca una segunda fila en Certificados. Idempotente.
 * Deja EstadoEntregaFinal='pendiente_envio' -- el envio automatico real esta
 * bloqueado por una limitacion arquitectonica real (ver enviarEntregableAvalEmail),
 * documentada, nunca simulada.
 */
function prepararEntregableAvalTrasConfirmacion_(inscripcionRow, user) {
  const sheet = getSheet('EntregablesAval');
  const existente = entregableAvalActual_(inscripcionRow.ID, sheetToObjects(sheet));
  const now = new Date().toISOString();
  if (existente) {
    updateRow(sheet, existente, {
      EstadoValidacionExterna: 'avalado',
      ReferenciaExterna: inscripcionRow.AvalReferencia || '',
      EnlaceExterno: inscripcionRow.AvalEnlaceExterno || '',
      CodigoExterno: inscripcionRow.AvalCodigoExterno || '',
      EstadoEntregaFinal: existente.EstadoEntregaFinal === 'enviado' ? existente.EstadoEntregaFinal : 'pendiente_envio',
      UpdatedAt: now,
    });
  } else {
    sheet.appendRow(SHEET_HEADERS.EntregablesAval.map(function (header) {
      const map = {
        ID: generateId('AVAL'), InscripcionID: inscripcionRow.ID,
        EstadoValidacionExterna: 'avalado',
        ReferenciaExterna: inscripcionRow.AvalReferencia || '', EnlaceExterno: inscripcionRow.AvalEnlaceExterno || '', CodigoExterno: inscripcionRow.AvalCodigoExterno || '',
        PdfHash: '', PdfStorageReference: '', EstadoEntregaFinal: 'pendiente_envio', FechaEntregaFinal: '',
        CreatedAt: now, UpdatedAt: now,
      };
      return map[header] !== undefined ? map[header] : '';
    }));
  }
  registrarAuditoriaCrm_({
    inscripcionId: inscripcionRow.ID, usuario: user.Username, rol: user.Rol,
    accion: 'FINAL_DELIVERY_PENDING', resultado: 'ok',
    metadatos: { motivo: 'aval confirmado; PDF final pendiente de generación/envío (bloqueo arquitectónico documentado)' },
  });
}

const CERTIFICATE_ITSAL_TEMPLATE_VERSION = 'ra-itsal-security-2026-v1';

function datosEntregableAval_(entregable, inscripcion) {
  const servicio = servicioParaCertificado_(inscripcion);
  const snapshot = leerSnapshotDocumentalCertificado_(entregable);
  const participant = snapshot && snapshot.tipo === 'aval_institucional' ? snapshot.datos.participante || {} : {};
  const dato = function(key, fallback) {
    return Object.prototype.hasOwnProperty.call(participant, key) ? participant[key] : fallback;
  };
  return {
    ID: entregable.ID, CertificatePublicId: entregable.ID,
    InscripcionID: inscripcion.ID, ClienteNombre: dato('ClienteNombre', inscripcion.ClienteNombre),
    ClienteID: dato('ClienteID', inscripcion.ClienteID),
    ClienteTipoIdentificacion: dato('ClienteTipoIdentificacion', inscripcion.ClienteTipoIdentificacion || ''),
    ServicioNombre: dato('ServicioNombre', inscripcion.ServicioNombre),
    Duracion: dato('Duracion', mapaDuracionServicios()(inscripcion)), Modalidad: dato('Modalidad', inscripcion.Modalidad),
    FechaInicio: dato('FechaInicio', inscripcion.FechaInicio), FechaFin: dato('FechaFin', inscripcion.FechaFin),
    Capacitador: dato('Capacitador', (servicio && servicio.Capacitador) || ''),
    ResumenCapacitador: dato('ResumenCapacitador', (servicio && servicio.ResumenCapacitador) || ''),
    Lugar: dato('Lugar', (servicio && (servicio.LugarEvento || servicio.Lugar)) || ''),
    EstadoPago: inscripcion.EstadoPago, EstadoAval: inscripcion.EstadoAval,
    InstitucionAval: inscripcion.InstitucionAval,
    AvalReferencia: entregable.ReferenciaExterna || '',
    AvalEnlaceExterno: entregable.EnlaceExterno || '',
    AvalCodigoExterno: entregable.CodigoExterno || '',
    CertificateType: dato('CertificateType', servicio ? tipoCertificadoServicio_(servicio.TipoCertificado) : 'aprobacion'),
    CertificateSubject: 'institutional_aval', CertificateStatus: entregable.CertificateStatus,
    CodigoCertificado: entregable.CodigoCertificado, CertificateVersion: Number(entregable.CertificateVersion) || 1,
    TemplateVersion: entregable.TemplateVersion, FechaEmisionCertificado: entregable.IssuedAt || entregable.CertificatePreparedAt || '',
    PdfHash: entregable.PdfHash || '', PdfStorageReference: entregable.PdfStorageReference || '',
    InstitutionData: datosInstitucionalesCertificadoAval_(entregable),
  };
}

function datosInstitucionalesCertificadoAval_(entregable) {
  if (!entregable || !entregable.CertificateInstitutionId) return null;
  return {
    institutionId: entregable.CertificateInstitutionId,
    agreementId: entregable.CertificateAgreementId || '',
    name: entregable.CertificateInstitutionName || '',
    legalName: entregable.CertificateInstitutionLegalName || '',
    siglas: entregable.CertificateInstitutionSiglas || '',
    identification: entregable.CertificateInstitutionIdentification || '',
    identificationType: entregable.CertificateInstitutionIdentificationType || '',
    city: entregable.CertificateInstitutionCity || '',
    province: entregable.CertificateInstitutionProvince || '',
    address: entregable.CertificateInstitutionAddress || '',
    website: entregable.CertificateInstitutionWebsite || '',
    authorityId: entregable.CertificateAuthorityId || '',
    authorityName: entregable.CertificateAuthorityName || '',
    authorityIdentification: entregable.CertificateAuthorityIdentification || '',
    authorityIdentificationType: entregable.CertificateAuthorityIdentificationType || '',
    authorityRole: entregable.CertificateAuthorityRole || '',
    authorityFunction: entregable.CertificateAuthorityFunction || '',
    authoritySignatureAssetId: entregable.CertificateAuthoritySignatureAssetId || '',
    authoritySignatureSha256: entregable.CertificateAuthoritySignatureSha256 || '',
    logoAssetId: entregable.CertificateInstitutionLogoAssetId || '',
    logoSha256: entregable.CertificateInstitutionLogoSha256 || '',
    sealAssetId: entregable.CertificateInstitutionSealAssetId || '',
    sealSha256: entregable.CertificateInstitutionSealSha256 || '',
    agreementObject: entregable.CertificateAgreementObject || '',
    agreementSignedAt: entregable.CertificateAgreementSignedAt || '',
    resolutionDocumentId: entregable.CertificateResolutionDocumentId || '',
    resolutionName: entregable.CertificateResolutionName || '',
    resolutionDate: entregable.CertificateResolutionDate || '',
    resolutionNotes: entregable.CertificateResolutionNotes || '',
    managerName: entregable.CertificateManagerName || '',
    managerTitle: entregable.CertificateManagerTitle || '',
    managerSignatureSha256: entregable.CertificateManagerSignatureSha256 || '',
  };
}

function activoInstitucionalVerificableParaCertificado_(asset) {
  if (!asset || !asset.DriveFileID || !/^[a-f0-9]{64}$/i.test(String(asset.Sha256 || ''))
    || ['image/png', 'image/jpeg'].indexOf(String(asset.MimeType || '').toLowerCase()) === -1) return false;
  try {
    const blob = DriveApp.getFileById(asset.DriveFileID).getBlob();
    const bytes = blob.getBytes();
    return sha256BytesCertificado_(bytes) === String(asset.Sha256 || '').toLowerCase()
      && String(blob.getContentType() || asset.MimeType).toLowerCase() === String(asset.MimeType).toLowerCase();
  } catch (error) { return false; }
}

function resolverSnapshotInstitucionalCertificadoAval_(inscripcion) {
  const institutionId = String(inscripcion.AvalInstitucionID || '').trim();
  const agreementId = String(inscripcion.AvalConvenioID || '').trim();
  if (!institutionId || !agreementId) return { success: false, error: 'El aval confirmado no conserva la institución y el convenio maestros. Administración debe revisar la inscripción; no se inferirán relaciones.' };
  const institutions = sheetToObjects(getSheet('Instituciones'));
  const institution = institutions.find(function(item) { return String(item.ID || '') === institutionId; });
  if (!institution || institution.Estado !== 'activo') return { success: false, error: 'La institución del aval no existe o está inactiva en la ficha maestra.' };
  const agreement = sheetToObjects(getSheet('Convenios')).find(function(item) {
    return String(item.ID || '') === agreementId && String(item.InstitucionID || '') === institutionId;
  });
  if (!agreement) return { success: false, error: 'El convenio confirmado ya no está disponible o no pertenece a la institución registrada.' };

  const authorities = sheetToObjects(getSheet('AutoridadesInstitucion')).filter(function(item) {
    return String(item.InstitucionID || '') === institutionId && autoridadInstitucionVigente_(item) && esVerdadero(item.FirmaCertificados);
  });
  if (!authorities.length) return { success: false, error: 'No se puede emitir: registre una autoridad institucional vigente y habilítela para firmar certificados.' };
  if (authorities.length > 1) return { success: false, error: 'Hay más de una autoridad habilitada para firmar. Deje marcada únicamente la autoridad que debe firmar este certificado.' };
  const authority = authorities[0];
  if (!String(authority.Nombre || '').trim() || !String(authority.Cargo || '').trim()) {
    return { success: false, error: 'Complete el nombre y cargo de la autoridad seleccionada en la ficha institucional.' };
  }
  const assets = sheetToObjects(getSheet('ActivosInstitucionales')).filter(function(item) {
    return String(item.InstitucionID || '') === institutionId && item.Estado === 'activo';
  });
  const signatureMatches = assets.filter(function(item) {
    return item.Tipo === 'firma' && String(item.AutoridadID || '') === String(authority.ID || '');
  });
  if (signatureMatches.length !== 1 || !signatureMatches[0].DriveFileID || !/^[a-f0-9]{64}$/i.test(String(signatureMatches[0].Sha256 || ''))) {
    return { success: false, error: 'La autoridad elegida necesita exactamente una firma privada activa y verificable.' };
  }
  if (!activoInstitucionalVerificableParaCertificado_(signatureMatches[0])) {
    return { success: false, error: 'No se pudo comprobar la firma privada de la autoridad. Vuelva a cargarla desde la ficha institucional antes de emitir.' };
  }
  const uniqueAsset = function(type) {
    const matches = assets.filter(function(item) { return item.Tipo === type && !String(item.AutoridadID || '').trim(); });
    return matches.length === 1 ? matches[0] : null;
  };
  const logos = assets.filter(function(item) { return item.Tipo === 'logo' && !String(item.AutoridadID || '').trim(); });
  const seals = assets.filter(function(item) { return item.Tipo === 'sello' && !String(item.AutoridadID || '').trim(); });
  if (logos.length > 1 || seals.length > 1) return { success: false, error: 'La ficha tiene más de un logotipo o sello activo del mismo tipo. Deje solo uno vigente para evitar una selección ambigua.' };
  const logo = uniqueAsset('logo');
  const seal = uniqueAsset('sello');
  if (logo && !activoInstitucionalVerificableParaCertificado_(logo)) return { success: false, error: 'El logotipo institucional configurado no está disponible o no superó la verificación de integridad.' };
  if (seal && !activoInstitucionalVerificableParaCertificado_(seal)) return { success: false, error: 'El sello institucional configurado no está disponible o no superó la verificación de integridad.' };
  const resolutionDocuments = sheetToObjects(getSheet('DocumentosInstitucionales')).filter(function(item) {
    return String(item.InstitucionID || '') === institutionId && item.Estado === 'activo'
      && ['resolucion', 'aval'].indexOf(String(item.Tipo || '').toLowerCase()) !== -1
      && (!String(item.ConvenioID || '').trim() || String(item.ConvenioID) === agreementId);
  }).sort(function(a, b) {
    const linkedA = String(a.ConvenioID || '') === agreementId ? 1 : 0;
    const linkedB = String(b.ConvenioID || '') === agreementId ? 1 : 0;
    if (linkedA !== linkedB) return linkedB - linkedA;
    return String(b.FechaDocumento || b.CreadoEn || '').localeCompare(String(a.FechaDocumento || a.CreadoEn || ''));
  });
  const resolution = resolutionDocuments[0] || null;
  return { success: true, data: {
    CertificateInstitutionId: institution.ID,
    CertificateAgreementId: agreement.ID,
    CertificateInstitutionName: String(institution.Nombre || '').trim(),
    CertificateInstitutionLegalName: String(institution.NombreLegal || '').trim(),
    CertificateInstitutionSiglas: String(institution.Siglas || '').trim(),
    CertificateInstitutionIdentification: String(institution.Identificacion || '').trim(),
    CertificateInstitutionIdentificationType: String(institution.TipoIdentificacion || '').trim(),
    CertificateInstitutionCity: String(institution.Ciudad || '').trim(),
    CertificateInstitutionProvince: String(institution.Provincia || '').trim(),
    CertificateInstitutionAddress: String(institution.Direccion || '').trim(),
    CertificateInstitutionWebsite: String(institution.SitioWeb || '').trim(),
    CertificateAuthorityId: authority.ID,
    CertificateAuthorityName: String(authority.Nombre || '').trim(),
    CertificateAuthorityIdentification: String(authority.Identificacion || '').trim(),
    CertificateAuthorityIdentificationType: String(authority.TipoIdentificacion || '').trim(),
    CertificateAuthorityRole: String(authority.Cargo || '').trim(),
    CertificateAuthorityFunction: String(authority.Funcion || '').trim(),
    CertificateAuthoritySignatureAssetId: signatureMatches[0].ID,
    CertificateAuthoritySignatureSha256: String(signatureMatches[0].Sha256 || '').toLowerCase(),
    CertificateInstitutionLogoAssetId: logo ? logo.ID : '',
    CertificateInstitutionLogoSha256: logo ? String(logo.Sha256 || '').toLowerCase() : '',
    CertificateInstitutionSealAssetId: seal ? seal.ID : '',
    CertificateInstitutionSealSha256: seal ? String(seal.Sha256 || '').toLowerCase() : '',
    CertificateAgreementObject: String(agreement.Objeto || '').trim(),
    CertificateAgreementSignedAt: String(agreement.FechaFirma || '').trim(),
    CertificateResolutionDocumentId: resolution ? String(resolution.ID || '') : '',
    CertificateResolutionName: resolution ? String(resolution.NombreArchivo || '') : '',
    CertificateResolutionDate: resolution ? String(resolution.FechaDocumento || '') : '',
    CertificateResolutionNotes: resolution ? String(resolution.Notas || '') : '',
  } };
}

function emitirEntregableAval(user, { id } = {}) {
  requireCertificateAdmin(user, 'AVAL_CERTIFICATE_ISSUE', { inscripcionId: id, canal: 'api' });
  return conBloqueoCertificados(function() {
    const sheet = getSheet('EntregablesAval');
    const entregable = entregableAvalActual_(id, sheetToObjects(sheet));
    const inscripcion = sheetToObjects(getSheet('Inscripciones')).find(function(item) { return item.ID === id; });
    if (!entregable || !inscripcion) return { success: false, error: 'No existe un aval confirmado para esta inscripción.' };
    if (entregable.CertificateStatus === 'emitido') return { success: true, alreadyIssued: true, data: datosEntregableAval_(entregable, inscripcion) };
    if (entregable.CertificateStatus === 'pendiente_pdf') return { success: true, alreadyPrepared: true, data: datosEntregableAval_(entregable, inscripcion) };
    if (entregable.CertificateStatus) return { success: false, error: 'El entregable ya tiene un estado oficial que requiere revisión administrativa.' };
    if ([CERTIFICATE_SECURITY_TEMPLATE_VERSION, CERTIFICATE_SECURITY_TEMPLATE_V3_VERSION].indexOf(plantillaActivaCertificado_()) === -1) {
      return { success: false, error: 'Faltan las firmas auténticas y la activación de la plantilla de seguridad.' };
    }
    if (inscripcion.EstadoAval !== 'avalado' || entregable.EstadoValidacionExterna !== 'avalado') {
      return { success: false, error: 'La institución aún no confirmó el aval.' };
    }
    if (!String(entregable.CodigoExterno || '').trim() || String(entregable.CodigoExterno).length > 64) {
      return { success: false, error: 'La institución debe registrar el código externo del aval antes de emitir el certificado.' };
    }
    const signerProperties = PropertiesService.getScriptProperties();
    const managerName = String(signerProperties.getProperty(CERTIFICATE_MANAGER_NAME_PROPERTY) || '').trim();
    const managerTitle = String(signerProperties.getProperty(CERTIFICATE_MANAGER_TITLE_PROPERTY) || '').trim();
    if (!managerName || !managerTitle) return { success: false, error: 'Configure el nombre completo y cargo oficial del gerente firmante en Ajustes de certificados.' };
    if (inscripcion.EstadoPago !== 'verificado') return { success: false, error: 'El pago debe estar verificado.' };
    const avalUpgrade = validarUpgradeAvalVerificadoParaInscripcion_(inscripcion);
    if (avalUpgrade.exists && !avalUpgrade.success) return { success: false, error: avalUpgrade.error };
    if (inscripcion.CRMOfferType && inscripcion.CRMCompletionStatus !== CRM_COMPLETION_STATUS_COMPLETADO) {
      return { success: false, error: 'El curso debe estar completado antes de emitir el aval.' };
    }
    const faltantes = datosFaltantesCertificado(inscripcion);
    if (faltantes.length) return { success: false, error: 'Faltan datos del certificado: ' + faltantes.join(', ') + '.' };
    if (!servicioParaCertificado_(inscripcion)) return { success: false, error: 'No se encontró el servicio vinculado de forma inequívoca.' };
    const institutionalSnapshot = resolverSnapshotInstitucionalCertificadoAval_(inscripcion);
    if (!institutionalSnapshot.success) return institutionalSnapshot;
    institutionalSnapshot.data.CertificateManagerName = managerName;
    institutionalSnapshot.data.CertificateManagerTitle = managerTitle;
    // El aval institucional conserva el hash de la edición activa al prepararse.
    // No usar siempre v2: tras activar v3, el frontend debe recuperar exactamente
    // la firma que quedó congelada en este snapshot.
    institutionalSnapshot.data.CertificateManagerSignatureSha256 = huellasFirmasOficialesCertificado_().managerSignatureSha256;
    const codigo = generarCodigoCertificadoUnico({ ID: entregable.ID, FechaEmisionCertificado: new Date().toISOString() }, entregable.ID, id);
    const now = new Date().toISOString();
    const preparedFields = Object.assign({}, institutionalSnapshot.data, { CodigoCertificado: codigo, CertificateVersion: 1,
      TemplateVersion: CERTIFICATE_INSTITUTIONAL_AVAL_TEMPLATE, CertificateStatus: 'pendiente_pdf', CertificatePreparedAt: now,
      IssuedAt: '', IssuedBy: user.Username, UpdatedAt: now });
    const avalSnapshot = snapshotDocumentalCertificado_('aval_institucional', {
      participante: datosSnapshotCertificadoParticipante_(inscripcion, {
        CodigoCertificado: codigo, CertificateVersion: 1, TemplateVersion: CERTIFICATE_INSTITUTIONAL_AVAL_TEMPLATE,
        CertificatePreparedAt: now, IssuedBy: user.Username,
        CertificateType: tipoCertificadoServicio_((servicioParaCertificado_(inscripcion) || {}).TipoCertificado),
      }),
      institutionData: datosInstitucionalesCertificadoAval_(Object.assign({}, entregable, preparedFields)),
      codigoExterno: entregable.CodigoExterno || '', certificateVersion: 1,
      templateVersion: CERTIFICATE_INSTITUTIONAL_AVAL_TEMPLATE, preparedAt: now,
      managerName: managerName, managerTitle: managerTitle,
      managerSignatureSha256: preparedFields.CertificateManagerSignatureSha256 || '',
    });
    Object.assign(preparedFields, avalSnapshot);
    const previousFields = {};
    Object.keys(preparedFields).forEach(function(key) {
      previousFields[key] = entregable[key] === undefined ? '' : entregable[key];
    });
    updateRow(sheet, entregable, preparedFields);
    try {
      registrarAuditoriaCertificado({ certificadoId: codigo, inscripcionId: id, usuario: user.Username, rol: user.Rol,
        accion: 'AVAL_CERTIFICATE_PREPARED', estadoAnterior: 'pendiente', estadoNuevo: 'pendiente_pdf', canal: 'panel', resultado: 'ok',
        metadatos: { externalCode: entregable.CodigoExterno, institutionId: institutionalSnapshot.data.CertificateInstitutionId,
          authorityId: institutionalSnapshot.data.CertificateAuthorityId } });
    } catch (error) {
      const current = sheetToObjects(sheet).find(function(item) { return item.ID === entregable.ID; });
      if (current) updateRow(sheet, current, previousFields);
      throw error;
    }
    const actualizado = sheetToObjects(sheet).find(function(item) { return item.ID === entregable.ID; });
    return { success: true, data: datosEntregableAval_(actualizado, inscripcion) };
  });
}

function anularEntregableAval(user, { id, motivo, confirmacion } = {}) {
  requireCertificateAdmin(user, 'AVAL_CERTIFICATE_VOID', { inscripcionId: id, canal: 'api' });
  if (confirmacion !== 'ANULAR' || String(motivo || '').trim().length < 5) {
    return { success: false, error: 'Confirme la anulación e indique un motivo de al menos 5 caracteres.' };
  }
  return conBloqueoCertificados(function() {
    const sheet = getSheet('EntregablesAval');
    const actual = entregableAvalActual_(id, sheetToObjects(sheet));
    if (!actual || actual.CertificateStatus !== 'emitido' || !actual.PdfHash) {
      return { success: false, error: 'Solo se puede anular un certificado avalado vigente y archivado.' };
    }
    registrarAuditoriaCertificado({ certificadoId: actual.CodigoCertificado, inscripcionId: id,
      usuario: user.Username, rol: user.Rol, accion: 'AVAL_CERTIFICATE_VOIDED', estadoAnterior: 'emitido',
      estadoNuevo: 'anulado', canal: 'panel', resultado: 'ok', motivo: String(motivo).trim() });
    updateRow(sheet, actual, { CertificateStatus: 'anulado', VoidedAt: new Date().toISOString(),
      VoidedBy: user.Username, VoidReason: String(motivo).trim(), UpdatedAt: new Date().toISOString() });
    return { success: true };
  });
}

function reemitirEntregableAval(user, { id, motivo, confirmacion } = {}) {
  requireCertificateAdmin(user, 'AVAL_CERTIFICATE_REISSUE', { inscripcionId: id, canal: 'api' });
  if (confirmacion !== 'REEMITIR' || String(motivo || '').trim().length < 5) {
    return { success: false, error: 'Confirme la reemisión e indique un motivo de al menos 5 caracteres.' };
  }
  return conBloqueoCertificados(function() {
    const sheet = getSheet('EntregablesAval');
    const actual = entregableAvalActual_(id, sheetToObjects(sheet));
    const inscripcion = sheetToObjects(getSheet('Inscripciones')).find(function(item) { return item.ID === id; });
    if (!actual || !inscripcion) return { success: false, error: 'No existe el certificado avalado.' };
    if (actual.CertificateStatus === 'pendiente_pdf' && actual.ReplacesCertificateId) {
      if (String(actual.ReissueReason || '') !== String(motivo).trim()) {
        return { success: false, error: 'Ya existe una reemisión pendiente. Reintente con el mismo motivo para completar esa versión.' };
      }
      return { success: true, alreadyPrepared: true, data: datosEntregableAval_(actual, inscripcion) };
    }
    if ([CERTIFICATE_INSTITUTIONAL_AVAL_TEMPLATE, CERTIFICATE_ITSAL_TEMPLATE_VERSION].indexOf(String(actual.TemplateVersion || '')) === -1) {
      return { success: false, error: 'Esta versión avalada no tiene una plantilla compatible para conservar sus datos en una reemisión.' };
    }
    if (!['emitido', 'anulado'].includes(estadoNormalizadoCertificado(actual))
      || !/^[a-f0-9]{64}$/i.test(String(actual.PdfHash || ''))
      || !String(actual.PdfStorageReference || '').startsWith('certificate-drive:')) {
      return { success: false, error: 'Solo se puede reemitir una versión avalada con PDF oficial archivado e íntegro.' };
    }
    if ([CERTIFICATE_SECURITY_TEMPLATE_VERSION, CERTIFICATE_SECURITY_TEMPLATE_V3_VERSION].indexOf(plantillaActivaCertificado_()) === -1) {
      return { success: false, error: 'Active primero las firmas auténticas y la plantilla de seguridad vigente.' };
    }
    const signerProperties = PropertiesService.getScriptProperties();
    const managerName = String(signerProperties.getProperty(CERTIFICATE_MANAGER_NAME_PROPERTY) || '').trim();
    const managerTitle = String(signerProperties.getProperty(CERTIFICATE_MANAGER_TITLE_PROPERTY) || '').trim();
    if (!managerName || !managerTitle) return { success: false, error: 'Configure el firmante vigente de R.A. Training.' };
    const institutionalSnapshot = resolverSnapshotInstitucionalCertificadoAval_(inscripcion);
    if (!institutionalSnapshot.success) return institutionalSnapshot;
    institutionalSnapshot.data.CertificateManagerName = managerName;
    institutionalSnapshot.data.CertificateManagerTitle = managerTitle;
    institutionalSnapshot.data.CertificateManagerSignatureSha256 = huellasFirmasOficialesCertificado_().managerSignatureSha256;
    if (!/^[a-f0-9]{64}$/i.test(institutionalSnapshot.data.CertificateManagerSignatureSha256 || '')) {
      return { success: false, error: 'La firma vigente de Gerencia General no es verificable.' };
    }
    const missing = datosFaltantesCertificado(inscripcion);
    if (missing.length) return { success: false, error: 'Faltan datos para la nueva versión: ' + missing.join(', ') + '.' };
    const versions = sheetToObjects(sheet).filter(function(item) { return item.InscripcionID === id; });
    const newId = generateId('AVAL');
    const now = new Date().toISOString();
    const newVersion = versions.reduce(function(max, item) { return Math.max(max, Number(item.CertificateVersion) || 1); }, 0) + 1;
    const codigo = generarCodigoCertificadoUnico({ ID: newId, FechaEmisionCertificado: now }, newId, id);
    const next = Object.assign({}, actual, institutionalSnapshot.data, {
      ID: newId, InscripcionID: id, PdfHash: '', PdfStorageReference: '',
      EstadoEntregaFinal: 'pendiente_envio', FechaEntregaFinal: '', CreatedAt: now, UpdatedAt: now,
      CodigoCertificado: codigo,
      OriginalCertificateId: actual.OriginalCertificateId || actual.ID,
      ReplacesCertificateId: actual.ID,
      ReissuedCertificateId: '', VoidedAt: '', VoidedBy: '', VoidReason: '',
      CertificateVersion: newVersion, TemplateVersion: CERTIFICATE_INSTITUTIONAL_AVAL_TEMPLATE,
      CertificateStatus: 'pendiente_pdf', CertificatePreparedAt: now, IssuedAt: '', IssuedBy: user.Username,
      ReissueReason: String(motivo).trim(),
    });
    if (versions.some(function(item) { return item.CodigoCertificado === next.CodigoCertificado; })
      || codigoCertificadoEnUso(next.CodigoCertificado, next.ID, id)) {
      return { success: false, error: 'El código nuevo entró en conflicto con otro certificado.' };
    }
    const rendered = datosEntregableAval_(next, inscripcion);
    Object.assign(next, snapshotDocumentalCertificado_('aval_institucional', {
      participante: datosSnapshotCertificadoParticipante_(inscripcion, {
        CodigoCertificado: next.CodigoCertificado, CertificateVersion: newVersion,
        TemplateVersion: next.TemplateVersion, CertificatePreparedAt: now, IssuedBy: user.Username,
        CertificateType: rendered.CertificateType,
      }),
      certificateType: rendered.CertificateType,
      codigoExterno: next.CodigoExterno || '',
      institutionData: datosInstitucionalesCertificadoAval_(next),
      originalCertificateId: next.OriginalCertificateId,
      replacesCertificateId: actual.ID,
      version: newVersion,
      templateVersion: next.TemplateVersion,
      preparedAt: now,
      managerName: managerName, managerTitle: managerTitle,
      managerSignatureSha256: next.CertificateManagerSignatureSha256,
    }));
    const newRow = sheet.getLastRow() + 1;
    sheet.appendRow(SHEET_HEADERS.EntregablesAval.map(function(header) { return next[header] !== undefined ? next[header] : ''; }));
    try {
      registrarAuditoriaCertificado({ certificadoId: next.CodigoCertificado, inscripcionId: id,
        usuario: user.Username, rol: user.Rol, accion: 'AVAL_CERTIFICATE_REISSUE_STARTED',
        estadoAnterior: estadoNormalizadoCertificado(actual), estadoNuevo: 'pendiente_pdf', canal: 'panel', resultado: 'pendiente',
        motivo: String(motivo).trim(), metadatos: { replaces: actual.ID, version: newVersion, templateVersion: next.TemplateVersion } });
    } catch (error) {
      sheet.deleteRow(newRow);
      throw error;
    }
    return { success: true, data: datosEntregableAval_(next, inscripcion) };
  });
}

function guardarPdfEntregableAvalPrivado(user, { id, pdfBase64, pdfHash, templateVersion } = {}) {
  requireCertificateAdmin(user, 'AVAL_CERTIFICATE_PDF_STORE', { inscripcionId: id, canal: 'api' });
  const hash = String(pdfHash || '').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(hash) || !pdfBase64 || String(pdfBase64).length > 16000000) {
    return { success: false, error: 'El PDF o su huella SHA-256 no son válidos.' };
  }
  return conBloqueoCertificados(function() {
    const sheet = getSheet('EntregablesAval');
    const entregable = entregableAvalActual_(id, sheetToObjects(sheet));
    if (!entregable || ['emitido', 'pendiente_pdf'].indexOf(entregable.CertificateStatus) === -1 || entregable.TemplateVersion !== templateVersion) {
      return { success: false, error: 'No existe una versión de certificado institucional archivada con esta plantilla.' };
    }
    if (entregable.PdfHash || entregable.PdfStorageReference) {
      if (entregable.PdfHash === hash && String(entregable.PdfStorageReference).indexOf('certificate-drive:') === 0) {
        const archived = DriveApp.getFileById(entregable.PdfStorageReference.slice('certificate-drive:'.length));
        if (sha256PdfCertificado_(archived.getBlob().getBytes()) === hash) {
          return { success: true, reference: entregable.PdfStorageReference, hash: hash, idempotent: true };
        }
      }
      return { success: false, error: 'El PDF oficial ya quedó fijado; no se puede sustituir.' };
    }
    let bytes;
    try { bytes = Utilities.base64Decode(String(pdfBase64)); }
    catch (error) { return { success: false, error: 'El PDF no está codificado correctamente.' }; }
    if (bytes.length < 5 || String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4]) !== '%PDF-'
      || sha256PdfCertificado_(bytes) !== hash) return { success: false, error: 'El PDF no coincide con su huella SHA-256.' };
    const file = carpetaCertificadosPrivados_().createFile(Utilities.newBlob(bytes, 'application/pdf',
      'CERT_AVAL_' + String(entregable.CodigoCertificado).replace(/[^A-Za-z0-9._-]/g, '_') + '_v' + (Number(entregable.CertificateVersion) || 1) + '.pdf'));
    try { file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE); } catch (error) { /* Privado por defecto. */ }
    const reference = 'certificate-drive:' + file.getId();
    const now = new Date().toISOString();
    const wasPending = entregable.CertificateStatus === 'pendiente_pdf';
    const isPendingReissue = wasPending && String(entregable.ReplacesCertificateId || '').trim();
    const previous = { PdfHash: entregable.PdfHash || '', PdfStorageReference: entregable.PdfStorageReference || '',
      CertificateStatus: entregable.CertificateStatus || '', IssuedAt: entregable.IssuedAt || '',
      EstadoEntregaFinal: entregable.EstadoEntregaFinal || '', UpdatedAt: entregable.UpdatedAt || '' };
    let parent = null;
    let previousParent = null;
    try {
      const update = { PdfHash: hash, PdfStorageReference: reference, EstadoEntregaFinal: 'pendiente_envio', UpdatedAt: now };
      if (wasPending) {
        update.CertificateStatus = 'emitido';
        update.IssuedAt = String(entregable.CertificatePreparedAt || now);
      }
      if (isPendingReissue) {
        parent = sheetToObjects(sheet).find(function(item) { return item.ID === entregable.ReplacesCertificateId; }) || null;
        if (!parent || ['emitido', 'anulado'].indexOf(estadoNormalizadoCertificado(parent)) === -1
          || !String(parent.PdfStorageReference || '').startsWith('certificate-drive:')
          || !/^[a-f0-9]{64}$/i.test(String(parent.PdfHash || ''))) {
          file.setTrashed(true);
          return { success: false, error: 'La versión avalada que se intenta corregir ya no está vigente o no tiene PDF íntegro.' };
        }
        previousParent = { CertificateStatus: parent.CertificateStatus || '', ReissuedCertificateId: parent.ReissuedCertificateId || '', UpdatedAt: parent.UpdatedAt || '' };
      }
      updateRow(sheet, entregable, update);
      if (isPendingReissue) {
        updateRow(sheet, parent, { CertificateStatus: 'reemitido', ReissuedCertificateId: entregable.ID, UpdatedAt: now });
      }
      registrarAuditoriaCertificado({ certificadoId: entregable.CodigoCertificado, inscripcionId: id,
        usuario: user.Username, rol: user.Rol,
        accion: isPendingReissue ? 'AVAL_CERTIFICATE_REISSUE_COMPLETED' : 'AVAL_CERTIFICATE_PDF_ARCHIVED',
        estadoAnterior: wasPending ? 'pendiente_pdf' : 'emitido', estadoNuevo: 'emitido', canal: 'api', resultado: 'ok',
        motivo: isPendingReissue ? String(entregable.ReissueReason || '') : '',
        metadatos: { sha256: hash, externalCode: entregable.CodigoExterno, institutionId: entregable.CertificateInstitutionId,
          replacesCertificateId: parent ? parent.ID : '', version: Number(entregable.CertificateVersion) || 1,
          templateVersion: entregable.TemplateVersion } });
    } catch (error) {
      updateRow(sheet, entregable, previous);
      if (parent && previousParent) updateRow(sheet, parent, previousParent);
      file.setTrashed(true);
      throw error;
    }
    return { success: true, reference: reference, hash: hash, idempotent: false };
  });
}

function leerPdfEntregableAvalPrivado(user, { id, versionId } = {}) {
  requireCertificateAdmin(user, 'AVAL_CERTIFICATE_PDF_READ', { inscripcionId: id, canal: 'api' });
  const versions = sheetToObjects(getSheet('EntregablesAval')).filter(function(item) { return item.InscripcionID === id; });
  const entregable = String(versionId || '').trim()
    ? versions.find(function(item) { return item.ID === String(versionId); }) || null
    : entregableAvalActual_(id, versions);
  if (entregable && entregable.InscripcionID !== id) return { success: false, error: 'La versión solicitada no pertenece a esta inscripción.' };
  if (!entregable || ['emitido', 'reemitido', 'anulado'].indexOf(estadoNormalizadoCertificado(entregable)) === -1 || !/^[a-f0-9]{64}$/.test(String(entregable.PdfHash || ''))
    || String(entregable.PdfStorageReference || '').indexOf('certificate-drive:') !== 0) {
    return { success: false, error: 'Esta versión avalada no tiene un PDF oficial archivado; no se regeneró con la plantilla actual.' };
  }
  const file = DriveApp.getFileById(entregable.PdfStorageReference.slice('certificate-drive:'.length));
  const bytes = file.getBlob().getBytes();
  if (sha256PdfCertificado_(bytes) !== entregable.PdfHash) throw new Error('El PDF avalado no superó la verificación SHA-256.');
  return { success: true, reference: entregable.PdfStorageReference, hash: entregable.PdfHash,
    contentBase64: Utilities.base64Encode(bytes), filename: file.getName() };
}

/** Envía exclusivamente el PDF oficial fijado en Drive; jamás acepta otro PDF del cliente. */
function enviarEntregableAvalEmail(user, { id, email } = {}) {
  requireCertificateAdmin(user, 'FINAL_DELIVERY_SEND', { inscripcionId: id, canal: 'email' });
  return conBloqueoCertificados(function() {
  const entregablesSheet = getSheet('EntregablesAval');
  const entregable = entregableAvalActual_(id, sheetToObjects(entregablesSheet));
  if (!entregable) return { success: false, error: 'No hay un entregable de aval preparado para esta inscripción.' };
  if (entregable.EstadoValidacionExterna !== 'avalado') return { success: false, error: 'El aval externo todavía no está confirmado.' };
  if (entregable.EstadoEntregaFinal === 'enviado') return { success: true, alreadySent: true };
  if (entregable.EstadoEntregaFinal === 'enviando' || entregable.EstadoEntregaFinal === 'requiere_revision') {
    return { success: false, error: 'El envío quedó en revisión. Confirme en el correo saliente antes de cualquier reintento para evitar duplicados.' };
  }
  if (entregable.CertificateStatus !== 'emitido' || !entregable.PdfHash || !entregable.PdfStorageReference) {
    return { success: false, error: 'Primero emita y archive el certificado avalado oficial.' };
  }

  const inscSheet = getSheet('Inscripciones');
  const row = sheetToObjects(inscSheet).find(function (r) { return r.ID === id; });
  if (!row) return { success: false, error: 'Inscripción no encontrada.' };
  if (identificacionDocumentalDifiere_(entregable, row, 'aval_institucional')) {
    return { success: false, error: 'La identificación fue corregida después de emitir este PDF. Reemita y archive una versión avalada nueva antes de enviarla.' };
  }
  const destinatario = String(email || row.ClienteEmail || '').trim();
  if (!emailValido(destinatario)) return { success: false, error: 'La inscripción no tiene un correo electrónico válido.' };
  const official = leerPdfEntregableAvalPrivado(user, { id: id });
  if (!official.success) return official;
  const blob = Utilities.newBlob(Utilities.base64Decode(official.contentBase64), 'application/pdf', official.filename);
  const institutionName = String(entregable.CertificateInstitutionName || row.InstitucionAval || '').trim() || 'la institución avaladora';
  registrarAuditoriaCrm_({ inscripcionId: id, usuario: user.Username, rol: user.Rol,
    accion: 'FINAL_DELIVERY_STARTED', resultado: 'ok', metadatos: { certificateCode: entregable.CodigoCertificado } });
  updateRow(entregablesSheet, entregable, { EstadoEntregaFinal: 'enviando', UpdatedAt: new Date().toISOString() });
  try {
    MailApp.sendEmail({
      to: destinatario,
      subject: 'Certificado avalado - R.A. Training',
      body: 'Estimado/a ' + row.ClienteNombre + ',\n\n¡Felicitaciones por este logro! Adjuntamos su certificado del curso ' + row.ServicioNombre + ', emitido por R.A. Training con aval institucional de ' + institutionName + '.\n\nCódigo de certificado R.A.: ' + entregable.CodigoCertificado + '\nCódigo externo del aval: ' + entregable.CodigoExterno + '\n\nPuede verificar su autenticidad mediante el QR del documento.\n\nAtentamente,\nR.A. Training',
      name: 'R.A. Training',
      attachments: [blob],
    });
  } catch (err) {
    updateRow(entregablesSheet, entregable, { EstadoEntregaFinal: 'requiere_revision', UpdatedAt: new Date().toISOString() });
    registrarAuditoriaCrm_({
      inscripcionId: id, usuario: user.Username, rol: user.Rol,
      accion: 'FINAL_DELIVERY_FAILED', resultado: 'error', motivo: 'MailApp no pudo completar el envío.',
    });
    return { success: false, error: 'No se pudo confirmar el envío. Revise el correo saliente antes de reintentar para evitar duplicados.' };
  }
  const now = new Date().toISOString();
  updateRow(entregablesSheet, entregable, { EstadoEntregaFinal: 'enviado', FechaEntregaFinal: now, UpdatedAt: now });
  registrarAuditoriaCrm_({
    inscripcionId: id, usuario: user.Username, rol: user.Rol,
    accion: 'FINAL_DELIVERY_SENT', resultado: 'ok', metadatos: { crmOrderId: row.CRMOrderID || '' },
  });
  return { success: true };
  });
}

function resolverEnvioEntregableAval(user, { id, resultado, motivo, confirmacion } = {}) {
  requireCertificateAdmin(user, 'AVAL_DELIVERY_RECONCILE', { inscripcionId: id, canal: 'api' });
  if (confirmacion !== 'RECONCILIAR_ENVIO_AVAL' || ['enviado', 'no_enviado'].indexOf(resultado) === -1
    || String(motivo || '').trim().length < 5) {
    return { success: false, error: 'Confirme el resultado tras revisar el correo saliente e indique un motivo de al menos 5 caracteres.' };
  }
  return conBloqueoCertificados(function() {
    const sheet = getSheet('EntregablesAval');
    const entregable = entregableAvalActual_(id, sheetToObjects(sheet));
    if (!entregable || ['enviando', 'requiere_revision'].indexOf(entregable.EstadoEntregaFinal) === -1) {
      return { success: false, error: 'Este envío no está pendiente de reconciliación.' };
    }
    const newStatus = resultado === 'enviado' ? 'enviado' : 'pendiente_envio';
    registrarAuditoriaCertificado({ certificadoId: entregable.CodigoCertificado, inscripcionId: id,
      usuario: user.Username, rol: user.Rol, accion: 'AVAL_DELIVERY_RECONCILED',
      estadoAnterior: entregable.EstadoEntregaFinal, estadoNuevo: newStatus,
      canal: 'panel', resultado: 'ok', motivo: String(motivo).trim() });
    updateRow(sheet, entregable, { EstadoEntregaFinal: newStatus,
      FechaEntregaFinal: resultado === 'enviado' ? new Date().toISOString() : '', UpdatedAt: new Date().toISOString() });
    return { success: true, data: { estado: newStatus } };
  });
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

const AVAL_BASE_CALCULO_TIPOS_ = ['precio_servicio', 'monto_inscripcion'];

function dineroCentavosAval_(value) {
  const text = String(value === undefined || value === null ? '' : value).trim().replace(',', '.');
  const match = text.match(/^(\d+)(?:\.(\d+))?$/);
  if (!match) return NaN;
  const fraction = match[2] || '';
  const whole = Number(match[1]);
  if (!Number.isSafeInteger(whole)) return NaN;
  const firstTwo = Number((fraction + '00').slice(0, 2));
  const third = Number(fraction.charAt(2) || '0');
  let cents = whole * 100 + firstTwo + (third >= 5 ? 1 : 0);
  if (!Number.isSafeInteger(cents)) return NaN;
  return cents;
}

function reglaEconomicaAvalConvenio_(porcentajeInput, baseInput) {
  const rawPercentage = String(porcentajeInput === undefined || porcentajeInput === null ? '' : porcentajeInput).trim();
  const base = String(baseInput || '').trim();
  if (!rawPercentage && !base) return { configurada: false, porcentaje: '', base: '' };
  if (!rawPercentage || !base) throw new Error('Configure juntos el porcentaje y la base económica del aval.');
  const normalized = rawPercentage.replace(',', '.');
  if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(normalized)) {
    throw new Error('El porcentaje del aval debe ser un número entre 0 y 100, con hasta dos decimales.');
  }
  const percentage = Number(normalized);
  if (!isFinite(percentage) || percentage < 0 || percentage > 100) {
    throw new Error('El porcentaje del aval debe estar entre 0 y 100.');
  }
  if (AVAL_BASE_CALCULO_TIPOS_.indexOf(base) === -1) {
    throw new Error('Seleccione una base económica válida para el aval.');
  }
  return { configurada: true, porcentaje: Math.round(percentage * 100) / 100, base: base };
}

function convenioVigenteParaAval_(agreement, date) {
  if (!agreement || agreement.Estado !== 'activo') return false;
  const today = date || hoyLocal();
  const start = ds(agreement.FechaInicio);
  const end = ds(agreement.FechaFin);
  return (!start || start <= today) && (!end || end >= today);
}

function resolverConvenioEconomicoAval_(convenioId, institucionId, options) {
  options = options || {};
  const id = String(convenioId || '').trim();
  if (!id) return { success: false, error: 'La inscripción no tiene un convenio vinculado. Seleccione un convenio vigente antes de confirmar el aval.' };
  const agreement = sheetToObjects(getSheet('Convenios')).find(function(item) { return String(item.ID) === id; });
  if (!agreement) return { success: false, error: 'El convenio vinculado al aval ya no existe.' };
  if (!institucionId || String(agreement.InstitucionID || '') !== String(institucionId)) {
    return { success: false, error: 'El convenio seleccionado no pertenece a la institución asignada a esta inscripción.' };
  }
  if (options.requireVigente !== false && !convenioVigenteParaAval_(agreement)) {
    return { success: false, error: 'El convenio debe estar activo y dentro de su vigencia para confirmar avales nuevos.' };
  }
  let rule;
  try { rule = reglaEconomicaAvalConvenio_(agreement.PorcentajeAval, agreement.BaseCalculoAval); }
  catch (error) { return { success: false, error: error.message }; }
  if (!rule.configurada) {
    return { success: false, error: 'El convenio todavía no tiene una regla económica configurada. Administración debe registrar porcentaje y base de cálculo.' };
  }
  return { success: true, data: { convenio: agreement, regla: rule } };
}

function calcularSnapshotEconomicoAval_(inscripcion, agreement, rule, servicesCache) {
  rule = rule || reglaEconomicaAvalConvenio_(agreement.PorcentajeAval, agreement.BaseCalculoAval);
  if (!rule.configurada) throw new Error('El convenio no tiene una regla económica configurada.');
  let rawBase;
  if (rule.base === 'precio_servicio') {
    const services = servicesCache || sheetToObjects(getSheet('Servicios'));
    const service = services.find(function(item) {
      return String(item.ID || '') === String(inscripcion.ServicioID || '')
        || (!inscripcion.ServicioID && String(item.Nombre || '') === String(inscripcion.ServicioNombre || ''));
    });
    if (!service) throw new Error('No se pudo resolver el precio del servicio para calcular el aval.');
    rawBase = service.Precio;
  } else if (rule.base === 'monto_inscripcion') {
    rawBase = inscripcion.Monto;
  } else {
    throw new Error('La base económica del convenio no es compatible con este aval.');
  }
  const baseCents = dineroCentavosAval_(rawBase);
  if (!Number.isSafeInteger(baseCents) || baseCents < 0) throw new Error('El valor base del aval no es válido. Revise el servicio o la inscripción.');
  const percentageBasisPoints = Math.round(Number(rule.porcentaje) * 100);
  const product = baseCents * percentageBasisPoints;
  if (!Number.isSafeInteger(product)) {
    throw new Error('El valor excede el rango seguro para calcular el aval con precisión monetaria.');
  }
  const amountCents = Math.round(product / 10000);
  return {
    baseTipo: rule.base,
    baseCents: baseCents,
    baseMonto: baseCents / 100,
    porcentaje: Number(rule.porcentaje),
    porcentajeBasisPoints: percentageBasisPoints,
    montoCents: amountCents,
    monto: amountCents / 100,
  };
}

function getConveniosParaAval(user, { institucionId, convenioActualId } = {}) {
  if (!isAdmin(user) && !isVendedor(user)) throw new Error('Acceso denegado.');
  const institutionId = String(institucionId || '').trim();
  if (!institutionId) return { success: true, data: [] };
  if (isAval(user) && !isAdmin(user)) {
    const assignedId = institucionAvalIdDelUsuario_(user);
    if (!assignedId || assignedId !== institutionId) return { success: false, error: 'No está autorizado para consultar convenios de otra institución.' };
  }
  const institution = institucionPorId_(institutionId);
  if (!institution || institution.Estado !== 'activo') return { success: true, data: [] };
  const data = sheetToObjects(getSheet('Convenios')).filter(function(item) {
    if (String(item.InstitucionID || '') !== institutionId) return false;
    const current = String(item.ID || '') === String(convenioActualId || '');
    let ruleReady = false;
    try { ruleReady = reglaEconomicaAvalConvenio_(item.PorcentajeAval, item.BaseCalculoAval).configurada; } catch (e) {}
    return (convenioVigenteParaAval_(item) && ruleReady) || current;
  }).map(function(item) {
    let ruleReady = false;
    try { ruleReady = reglaEconomicaAvalConvenio_(item.PorcentajeAval, item.BaseCalculoAval).configurada; } catch (e) {}
    return {
      ID: item.ID, InstitucionID: item.InstitucionID, InstitucionNombre: institution.Nombre,
      Objeto: item.Objeto || '', Estado: item.Estado || '', FechaInicio: item.FechaInicio || '', FechaFin: item.FechaFin || '',
      PorcentajeAval: item.PorcentajeAval === '' || item.PorcentajeAval === undefined ? '' : Number(item.PorcentajeAval),
      BaseCalculoAval: item.BaseCalculoAval || '', DisponibleParaAval: convenioVigenteParaAval_(item) && ruleReady,
    };
  });
  return { success: true, data: data };
}

function getConvenios(user, { filtros = {} } = {}) {
  requireAdmin(user);
  let data = sheetCache('convenios', 120, function() {
    return sheetToObjects(getSheet('Convenios'));
  });
  if (filtros.estado) data = data.filter(c => c.Estado === filtros.estado);
  if (filtros.desde)  data = data.filter(c => new Date(c.FechaInicio) >= new Date(filtros.desde));
  if (filtros.hasta)  data = data.filter(c => new Date(c.FechaInicio) <= new Date(filtros.hasta));
  if (filtros.institucionId) data = data.filter(c => c.InstitucionID === filtros.institucionId);
  const institutionNames = {};
  sheetToObjects(getSheet('Instituciones')).forEach(function(item) { institutionNames[item.ID] = item.Nombre; });
  return { success: true, data: data.map(function(item) {
    return Object.assign({}, item, { InstitucionNombre: institutionNames[item.InstitucionID] || '' });
  }) };
}

function addConvenio(user, { convenio }) {
  requireAdmin(user);
  return institutionLock_(function() {
    const input = convenio || {};
    const institution = institucionPorId_(input.institucionId);
    if (!institution) throw new Error('Seleccione una institución registrada para el nuevo convenio.');
    if (institution.Estado !== 'activo') throw new Error('No se puede asociar un convenio nuevo a una institución inactiva.');
    const object = String(input.objeto || '').trim();
    if (object.length < 3 || object.length > 3000) throw new Error('Describa el objeto del convenio (3 a 3000 caracteres).');
    const start = String(input.fechaInicio || '').trim(); const end = String(input.fechaFin || '').trim();
    const signed = String(input.fechaFirma || '').trim();
    if (start && !/^\d{4}-\d{2}-\d{2}$/.test(start)) throw new Error('La fecha de inicio no es válida.');
    if (end && !/^\d{4}-\d{2}-\d{2}$/.test(end)) throw new Error('La fecha de fin no es válida.');
    if (signed && !/^\d{4}-\d{2}-\d{2}$/.test(signed)) throw new Error('La fecha de firma no es válida.');
    if (start && end && end < start) throw new Error('La fecha de fin del convenio no puede ser anterior a su inicio.');
    const state = ['activo', 'pendiente', 'vencido', 'suspendido'].indexOf(input.estado) !== -1 ? input.estado : 'pendiente';
    const economicRule = reglaEconomicaAvalConvenio_(input.porcentajeAval, input.baseCalculoAval);
    const sheet = getSheet('Convenios'); const id = generateId('CVN'); const now = new Date().toISOString();
    const record = { ID: id, Organizacion: institution.Nombre, Representante: String(input.representante || '').trim(),
      Cargo: String(input.cargo || '').trim(), Objeto: object, ObligacionesRA: String(input.obligacionesRA || '').trim(),
      ObligacionesAliado: String(input.obligacionesAliado || '').trim(), Vigencia: String(input.vigencia || '').trim(),
      FechaInicio: start, FechaFin: end, Estado: state, Notas: String(input.notas || '').trim(),
      CreadoPor: user.Username, FechaCreacion: now, InstitucionID: institution.ID, FechaFirma: signed,
      ArchivadoPor: '', ArchivadoEn: '', PorcentajeAval: economicRule.configurada ? economicRule.porcentaje : '',
      BaseCalculoAval: economicRule.configurada ? economicRule.base : '' };
    appendRegistroInstitucionalAuditado_(sheet, SHEET_HEADERS.Convenios,
      SHEET_HEADERS.Convenios.map(function(header) { return record[header] || ''; }),
      user, 'convenio', id, 'creado', {},
      { institucionId: institution.ID, objeto: record.Objeto, estado: record.Estado,
        porcentajeAval: record.PorcentajeAval, baseCalculoAval: record.BaseCalculoAval });
    bustSheet('convenios');
    return { success: true, id: id };
  });
}

function updateConvenio(user, { id, convenio }) {
  requireAdmin(user);
  return institutionLock_(function() {
    const sheet = getSheet('Convenios'); const row = sheetToObjects(sheet).find(function(item) { return item.ID === id; });
    if (!row) return { success: false, error: 'Convenio no encontrado.' };
    if (row.Estado === 'archivado') return { success: false, error: 'Un convenio archivado se conserva como histórico y no se puede editar.' };
    const input = convenio || {}; const institutionId = input.institucionId || row.InstitucionID || '';
    const institution = institutionId ? institucionPorId_(institutionId) : null;
    if (institutionId && !institution) throw new Error('La institución del convenio no existe.');
    if (institutionId && institution.Estado !== 'activo' && institutionId !== row.InstitucionID) {
      throw new Error('No se puede mover el convenio a una institución inactiva.');
    }
    const object = String(input.objeto || '').trim();
    if (object.length < 3 || object.length > 3000) throw new Error('Describa el objeto del convenio (3 a 3000 caracteres).');
    const start = String(input.fechaInicio || '').trim(); const end = String(input.fechaFin || '').trim();
    const signed = String(input.fechaFirma || '').trim();
    if (start && !/^\d{4}-\d{2}-\d{2}$/.test(start)) throw new Error('La fecha de inicio no es válida.');
    if (end && !/^\d{4}-\d{2}-\d{2}$/.test(end)) throw new Error('La fecha de fin no es válida.');
    if (signed && !/^\d{4}-\d{2}-\d{2}$/.test(signed)) throw new Error('La fecha de firma no es válida.');
    if (start && end && end < start) throw new Error('La fecha de fin del convenio no puede ser anterior a su inicio.');
    const state = ['activo', 'pendiente', 'vencido', 'suspendido'].indexOf(input.estado) !== -1 ? input.estado : row.Estado;
    const economicRule = reglaEconomicaAvalConvenio_(input.porcentajeAval, input.baseCalculoAval);
    const fields = { Organizacion: institution ? institution.Nombre : row.Organizacion,
      Representante: String(input.representante || '').trim(), Cargo: String(input.cargo || '').trim(), Objeto: object,
      ObligacionesRA: String(input.obligacionesRA || '').trim(), ObligacionesAliado: String(input.obligacionesAliado || '').trim(),
      Vigencia: String(input.vigencia || '').trim(), FechaInicio: start, FechaFin: end, FechaFirma: signed,
      Estado: state, Notas: String(input.notas || '').trim(), InstitucionID: institutionId,
      PorcentajeAval: economicRule.configurada ? economicRule.porcentaje : '',
      BaseCalculoAval: economicRule.configurada ? economicRule.base : '' };
    const before = { InstitucionID: row.InstitucionID || '', Estado: row.Estado, FechaInicio: row.FechaInicio, FechaFin: row.FechaFin,
      PorcentajeAval: row.PorcentajeAval === undefined ? '' : row.PorcentajeAval, BaseCalculoAval: row.BaseCalculoAval || '' };
    actualizarRegistroInstitucionalAuditado_(sheet, row, fields, user, 'convenio', id, 'actualizado', before,
      { InstitucionID: fields.InstitucionID, Estado: fields.Estado, FechaInicio: fields.FechaInicio, FechaFin: fields.FechaFin,
        PorcentajeAval: fields.PorcentajeAval, BaseCalculoAval: fields.BaseCalculoAval });
    bustSheet('convenios');
    return { success: true };
  });
}

function archivarConvenio(user, { id, confirmacion } = {}) {
  requireAdmin(user);
  if (confirmacion !== 'ARCHIVAR_CONVENIO') return { success: false, error: 'Confirme el archivado del convenio.' };
  return institutionLock_(function() {
    const sheet = getSheet('Convenios'); const row = sheetToObjects(sheet).find(function(item) { return item.ID === id; });
    if (!row) return { success: false, error: 'Convenio no encontrado.' };
    if (row.Estado === 'archivado') return { success: true, alreadyArchived: true };
    const now = new Date().toISOString();
    actualizarRegistroInstitucionalAuditado_(sheet, row, { Estado: 'archivado', ArchivadoPor: user.Username, ArchivadoEn: now },
      user, 'convenio', id, 'archivado', { Estado: row.Estado }, { Estado: 'archivado' });
    bustSheet('convenios');
    return { success: true };
  });
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

/** Estadística documental; no usa ingresos ni duplica personas por dos variantes. */
function getResumenCertificaciones(user, { desde, hasta } = {}) {
  requireAdmin(user);
  const from = String(desde || '').trim();
  const to = String(hasta || '').trim();
  if ((from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) || (to && !/^\d{4}-\d{2}-\d{2}$/.test(to)) || (from && to && from > to)) {
    return { success: false, error: 'Seleccione un rango de fechas válido.' };
  }
  const persons = {};
  const counts = { personasCertificadas: 0, documentosNormales: 0, documentosAvalados: 0,
    reemisionesNormales: 0, reemisionesAvaladas: 0, documentosAnulados: 0, documentosSinFecha: 0 };
  const add = function(row, variant) {
    const status = estadoNormalizadoCertificado(row);
    if (['emitido', 'enviado', 'reemitido', 'anulado'].indexOf(status) === -1
        || !/^[a-f0-9]{64}$/i.test(String(row.PdfHash || ''))
        || !String(row.PdfStorageReference || '').startsWith('certificate-drive:')) return;
    const date = ds(row.IssuedAt || row.FechaEmisionCertificado || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { counts.documentosSinFecha += 1; return; }
    if ((from && date < from) || (to && date > to)) return;
    const enrollmentId = String(row.InscripcionID || '').trim();
    if (enrollmentId) persons[enrollmentId] = true;
    if (variant === 'normal') {
      counts.documentosNormales += 1;
      if (Number(row.CertificateVersion) > 1 || String(row.ReplacesCertificateId || '').trim()) counts.reemisionesNormales += 1;
    } else {
      counts.documentosAvalados += 1;
      if (Number(row.CertificateVersion) > 1 || String(row.ReplacesCertificateId || '').trim()) counts.reemisionesAvaladas += 1;
    }
    if (status === 'anulado') counts.documentosAnulados += 1;
  };
  sheetToObjects(getSheet('Certificados')).forEach(function(row) { add(row, 'normal'); });
  sheetToObjects(getSheet('EntregablesAval')).forEach(function(row) { add(row, 'avalado'); });
  counts.personasCertificadas = Object.keys(persons).length;
  counts.documentosTotales = counts.documentosNormales + counts.documentosAvalados;
  counts.reemisionesTotales = counts.reemisionesNormales + counts.reemisionesAvaladas;
  return { success: true, data: { desde: from, hasta: to, ...counts,
    criterio: 'PDF oficial archivado con fecha de emisión; personas únicas por inscripción.' } };
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

function usuariosObjetivoReporteInterno(user, username) {
  if (!isVendedor(user) && !isContador(user)) throw new Error('Acceso denegado.');
  if (!isAdmin(user) && !isContador(user)) {
    return [{ Username: user.Username, Nombre: user.Nombre || user.Username }];
  }
  const usuarios = sheetToObjects(getSheet('Usuarios'))
    .filter(function(u) { return u.Activo === true || u.Activo === 'TRUE'; });
  if (username) {
    return usuarios.filter(function(u) { return u.Username === username; });
  }
  return usuarios;
}

function getReporteFlujosTrabajo(user, { username, desde, hasta } = {}) {
  const inicio = ds(desde) || '1900-01-01';
  const fin = ds(hasta) || '2999-12-31';
  const objetivos = usuariosObjetivoReporteInterno(user, username);
  const usuariosPermitidos = {};
  objetivos.forEach(function(u) { usuariosPermitidos[u.Username] = u.Nombre || u.Username; });
  const flujos = sheetToObjects(getSheet('FlujosSemanales'))
    .filter(function(f) {
      if (!usuariosPermitidos[f.Username]) return false;
      const fInicio = ds(f.FechaInicio || f.Semana);
      const fFin = ds(f.FechaFin || fInicio);
      return fInicio <= fin && fFin >= inicio;
    });
  const ids = {};
  flujos.forEach(function(f) { ids[f.ID] = true; });
  const actividadesPorFlujo = {};
  sheetToObjects(getSheet('ActividadesFlujo')).forEach(function(a) {
    if (!ids[a.FlujoID]) return;
    if (!actividadesPorFlujo[a.FlujoID]) actividadesPorFlujo[a.FlujoID] = [];
    actividadesPorFlujo[a.FlujoID].push(a);
  });
  const DIAS = ['Lunes','Martes','Miércoles','Jueves','Viernes'];
  const data = flujos.map(function(f) {
    const acts = (actividadesPorFlujo[f.ID] || [])
      .sort(function(a, b) { return DIAS.indexOf(a.DiaSemana) - DIAS.indexOf(b.DiaSemana); });
    return Object.assign({}, f, {
      Semana: ds(f.Semana),
      FechaInicio: ds(f.FechaInicio),
      FechaFin: ds(f.FechaFin),
      NombreUsuario: f.NombreUsuario || usuariosPermitidos[f.Username] || f.Username,
      actividades: acts,
    });
  });
  data.sort(function(a, b) {
    return String(a.Username).localeCompare(String(b.Username)) || String(a.Semana).localeCompare(String(b.Semana));
  });
  return { success: true, data: data, usuarios: objetivos.length };
}

function calcularResumenAsistenciaPorUsuarioSemana_(timbradas) {
  const grupos = {};
  timbradas.forEach(function(r) {
    const semana = getMondayOf(ds(r.Fecha));
    const key = r.Username + '|' + semana;
    if (!grupos[key]) grupos[key] = { username: r.Nombre || r.Username, semana: semana, totalHoras: 0, registros: [] };
    grupos[key].registros.push(r);
  });
  return Object.keys(grupos).sort().map(function(key) {
    const grupo = grupos[key];
    const porDia = {};
    grupo.registros
      .sort(function(a, b) { return new Date(a.Timestamp) - new Date(b.Timestamp); })
      .forEach(function(r) {
        const fecha = ds(r.Fecha);
        if (!porDia[fecha]) porDia[fecha] = [];
        porDia[fecha].push(r);
      });
    let totalMin = 0;
    Object.keys(porDia).forEach(function(fecha) {
      let entrada = null;
      porDia[fecha].forEach(function(r) {
        if (r.Tipo === 'entrada') entrada = new Date(r.Timestamp);
        if (r.Tipo === 'salida' && entrada) {
          totalMin += (new Date(r.Timestamp) - entrada) / 60000;
          entrada = null;
        }
      });
    });
    grupo.totalHoras = Math.round(totalMin / 60 * 100) / 100;
    delete grupo.registros;
    return grupo;
  });
}

function getReporteAsistencia(user, { username, desde, hasta } = {}) {
  const inicio = ds(desde) || '1900-01-01';
  const fin = ds(hasta) || '2999-12-31';
  const objetivos = usuariosObjetivoReporteInterno(user, username);
  const usuariosPermitidos = {};
  objetivos.forEach(function(u) { usuariosPermitidos[u.Username] = u.Nombre || u.Username; });
  const registros = sheetToObjects(getSheet('Asistencia'))
    .filter(function(r) {
      const fecha = ds(r.Fecha);
      return usuariosPermitidos[r.Username] && fecha >= inicio && fecha <= fin;
    })
    .map(function(r) {
      return Object.assign({}, r, { Fecha: ds(r.Fecha), Nombre: r.Nombre || usuariosPermitidos[r.Username] || r.Username });
    })
    .sort(function(a, b) {
      return String(a.Username).localeCompare(String(b.Username)) || new Date(a.Timestamp) - new Date(b.Timestamp);
    });
  return {
    success: true,
    data: {
      registros: registros,
      resumenes: calcularResumenAsistenciaPorUsuarioSemana_(registros),
      usuarios: objetivos.length,
    },
  };
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
  const registro = {
    ID: id,
    FlujoID: actividad.flujoId,
    Username: flujo ? flujo.Username : '',
    Titulo: actividad.titulo,
    Descripcion: actividad.descripcion || '',
    DescripcionFormato: actividad.descripcionFormato || 'texto_enriquecido_v1',
    DiaSemana: normalizarDiaSemanaFlujo_(actividad.diaSemana || 'Lunes'),
    HorasEstimadas: Number(actividad.horasEstimadas) || 1,
    Estado: 'pendiente',
    HorasReales: 0,
    Notas: '',
    Checklist: actividad.checklist || '[]',
    Evidencia: '',
    Imagenes: actividad.imagenes || '[]',
    EstadoRevision: 'pendiente_revision',
    HorasAprobadas: 0,
    FeedbackRevision: '',
    EvidenciaRevision: '',
    ImagenesRevision: '[]',
    RevisadoPor: '',
    RevisadoEn: '',
    ReprogramadoDesde: '',
    ReprogramadoPara: '',
    CompletadoEn: '',
    FechaCreacion: now,
  };
  appendObjectBySheetHeaders_(sheet, registro);
  return { success: true, id: id };
}

function normalizarDiaSemanaFlujo_(dia) {
  var raw = String(dia || '').trim().toLowerCase();
  var normalized = raw
    .normalize ? raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : raw;
  var map = {
    lunes: 'Lunes',
    martes: 'Martes',
    miercoles: 'Miércoles',
    jueves: 'Jueves',
    viernes: 'Viernes',
  };
  if (!map[normalized]) throw new Error('Día de actividad inválido.');
  return map[normalized];
}

function normalizarDiaSemanaFlujoSeguro_(dia) {
  try {
    return normalizarDiaSemanaFlujo_(dia);
  } catch (error) {
    return '';
  }
}

function migrarActividadesFlujoV2(user, { confirmacion } = {}) {
  requireAdmin(user);
  if (confirmacion !== 'APLICAR_ACTIVIDADES_FLUJO_V2') {
    throw new Error('Confirmación inválida para migrar ActividadesFlujo V2.');
  }
  const sheet = getSheet('ActividadesFlujo');
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow <= 1 || lastCol === 0) {
    return { success: true, migrated: 0, message: 'No hay actividades para migrar.' };
  }

  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const expected = SHEET_HEADERS.ActividadesFlujo;
  let migrated = 0;
  for (let rowNumber = 2; rowNumber <= lastRow; rowNumber++) {
    const rowValues = sheet.getRange(rowNumber, 1, 1, lastCol).getValues()[0];
    const byCurrentHeaders = {};
    headers.forEach(function(header, index) {
      byCurrentHeaders[header] = rowValues[index];
    });
    const visibleDay = normalizarDiaSemanaFlujoSeguro_(byCurrentHeaders.DiaSemana);
    if (visibleDay) continue;

    const byCanonicalOrder = {};
    expected.forEach(function(header, index) {
      byCanonicalOrder[header] = rowValues[index];
    });
    const recoveredDay = normalizarDiaSemanaFlujoSeguro_(byCanonicalOrder.DiaSemana);
    if (!recoveredDay) continue;
    if (!String(byCanonicalOrder.ID || '').trim() || !String(byCanonicalOrder.FlujoID || '').trim()) continue;

    byCanonicalOrder.DiaSemana = recoveredDay;
    if (byCanonicalOrder.ReprogramadoPara) {
      byCanonicalOrder.ReprogramadoPara = normalizarDiaSemanaFlujoSeguro_(byCanonicalOrder.ReprogramadoPara)
        || byCanonicalOrder.ReprogramadoPara;
    }
    updateRow(sheet, { _row: rowNumber }, byCanonicalOrder);
    migrated += 1;
  }

  Logger.log('migrarActividadesFlujoV2: filas reparadas=' + migrated);
  bustSheet('flujosSemana');
  return { success: true, migrated: migrated };
}

function migrarActividadesFlujoV2_MANUAL() {
  const result = migrarActividadesFlujoV2(
    { Username: 'apps-script-manual', Rol: 'admin', Nombre: 'Apps Script Manual' },
    { confirmacion: 'APLICAR_ACTIVIDADES_FLUJO_V2' }
  );
  Logger.log(JSON.stringify(result));
  return result;
}

function parseChecklistFlujo_(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    var parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function assertSoloMarcaChecklistAsignado_(actual, siguiente) {
  var before = parseChecklistFlujo_(actual);
  var after = parseChecklistFlujo_(siguiente);
  if (before.length !== after.length) {
    throw new Error('Solo administración puede agregar o quitar puntos del checklist.');
  }
  for (var i = 0; i < before.length; i++) {
    if (String(before[i].id || '') !== String(after[i].id || '')
      || String(before[i].text || '') !== String(after[i].text || '')) {
      throw new Error('Solo administración puede cambiar los puntos del checklist.');
    }
  }
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
  if (!isAdmin(user) && row.Username !== user.Username) throw new Error('Solo puedes actualizar tus propias actividades asignadas.');
  var fields = {};
  if (isAdmin(user)) {
    if (actividad.titulo        !== undefined) fields.Titulo          = actividad.titulo;
    if (actividad.descripcion   !== undefined) fields.Descripcion     = actividad.descripcion;
    if (actividad.descripcionFormato !== undefined) fields.DescripcionFormato = actividad.descripcionFormato;
    if (actividad.diaSemana     !== undefined) fields.DiaSemana       = normalizarDiaSemanaFlujo_(actividad.diaSemana);
    if (actividad.horasEstimadas !== undefined) fields.HorasEstimadas = Number(actividad.horasEstimadas) || 0;
    if (actividad.estadoRevision !== undefined) {
      var revision = String(actividad.estadoRevision || '').trim();
      if (['pendiente_revision','aprobado','rechazado'].indexOf(revision) === -1) {
        throw new Error('Estado de revisión inválido.');
      }
      if (revision === 'rechazado' && !String(actividad.feedbackRevision || '').trim()) {
        throw new Error('Para no aprobar una actividad se debe registrar una observación.');
      }
      fields.EstadoRevision = revision;
      fields.HorasAprobadas = revision === 'aprobado'
        ? (Number(actividad.horasAprobadas !== undefined ? actividad.horasAprobadas : row.HorasReales) || 0)
        : 0;
      fields.FeedbackRevision = actividad.feedbackRevision !== undefined
        ? String(actividad.feedbackRevision || '')
        : row.FeedbackRevision || '';
      if (actividad.evidenciaRevision !== undefined) fields.EvidenciaRevision = String(actividad.evidenciaRevision || '');
      if (actividad.imagenesRevision !== undefined) fields.ImagenesRevision = actividad.imagenesRevision || '[]';
      fields.RevisadoPor = user.Username;
      fields.RevisadoEn = new Date().toISOString();
      if (actividad.reprogramadoPara !== undefined) {
        fields.ReprogramadoDesde = row.DiaSemana || '';
        fields.ReprogramadoPara = actividad.reprogramadoPara
          ? normalizarDiaSemanaFlujo_(actividad.reprogramadoPara)
          : '';
        if (actividad.reprogramadoPara) fields.DiaSemana = fields.ReprogramadoPara;
      }
    } else if (actividad.feedbackRevision !== undefined) {
      fields.FeedbackRevision = String(actividad.feedbackRevision || '');
    }
    if (actividad.evidenciaRevision !== undefined) fields.EvidenciaRevision = String(actividad.evidenciaRevision || '');
    if (actividad.imagenesRevision !== undefined) fields.ImagenesRevision = actividad.imagenesRevision || '[]';
  }
  if (actividad.estado      !== undefined) {
    fields.Estado = actividad.estado;
    if (actividad.estado === 'completado' && !row.CompletadoEn)
      fields.CompletadoEn = new Date().toISOString();
  }
  if (actividad.horasReales !== undefined) fields.HorasReales = Number(actividad.horasReales) || 0;
  if (actividad.notas       !== undefined) fields.Notas     = actividad.notas;
  if (actividad.checklist   !== undefined) {
    if (!isAdmin(user)) assertSoloMarcaChecklistAsignado_(row.Checklist, actividad.checklist);
    fields.Checklist = actividad.checklist;
  }
  if (actividad.evidencia   !== undefined) fields.Evidencia = actividad.evidencia;
  if (actividad.imagenes    !== undefined) fields.Imagenes  = actividad.imagenes;
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
