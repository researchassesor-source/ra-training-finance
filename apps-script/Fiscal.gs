// ============================================================
// R.A. Training Finance — Módulo fiscal SRI (Apps Script)
// Ver docs/fiscal/architecture.md y docs/fiscal/DATA_MODEL.md
//
// Este archivo NO firma XML, NO llama al SRI y NO decide montos: solo persiste el
// modelo fiscal en Sheets con las mismas garantías (LockService + auditoría
// obligatoria + confirmación explícita) que ya usa el módulo de certificados. El
// cómputo monetario en centavos (lib/fiscal/money.js) y la clave de acceso
// (lib/fiscal/claveAcceso.js) viven en Node/Vercel, donde ya están probados con
// vitest — Apps Script no tiene import de módulos, así que no se duplica esa
// aritmética aquí. Este archivo revalida estructura y política (catálogo, enteros
// no negativos, transiciones de estado permitidas), no vuelve a derivar el cálculo.
// ============================================================

const FISCAL_CATALOG_VERSION = 1;
const FISCAL_MIGRATION_PARAM_CONFIRMATION = 'APLICAR_MODULO_FISCAL';
const FISCAL_MIGRATION_PROPERTY_VALUE = 'APPLY_SRI_MIGRATION_ONCE';

// IMPORTANTE: el 0% de IVA es la tarifa declarada por Jefatura para cursos/capacitación,
// pero NO está tributariamente confirmado todavía que la actividad económica registrada
// de Research Assessor Training S.A.S. califique exactamente para ese tratamiento. Por
// eso el catálogo nace en ValidacionTributaria='pendiente' y crearBorradorFactura
// bloquea cualquier borrador en environment='production' hasta que un admin lo confirme
// explícitamente vía confirmarValidacionTributariaFiscal. En 'test' sí se puede usar
// (sin efecto tributario real) para no bloquear el desarrollo y las pruebas SRI.
const FISCAL_VALIDACION_PENDIENTE = 'pendiente';
const FISCAL_VALIDACION_CONFIRMADA = 'confirmado';

const FISCAL_CATALOG_INICIAL = [
  { CodigoInterno: 'CAPACITACION', Descripcion: 'Curso o capacitación', TaxRateBasisPoints: 0 },
  { CodigoInterno: 'CAPACITACION_CERTIFICADO', Descripcion: 'Curso o capacitación con certificado incluido', TaxRateBasisPoints: 0 },
  // Ítem exclusivo para la prueba técnica de certificación SRI (Fase 6, endurecimiento).
  // TestOnly=true: validarItemFiscal_ lo bloquea de forma absoluta en
  // environment='production', sin excepción de admin — a diferencia del gate de
  // ValidacionTributaria (que un admin puede confirmar), este nunca se habilita
  // para producción porque no representa un concepto de negocio real. Usarlo no
  // confirma ni modifica el tratamiento tributario de CAPACITACION/
  // CAPACITACION_CERTIFICADO, que sigue pendiente de validación por separado.
  { CodigoInterno: 'PRUEBA_TECNICA_SRI', Descripcion: 'Prueba técnica de certificación — Ambiente de Pruebas SRI', TaxRateBasisPoints: 0, TestOnly: true },
];

// Estados tomados de la Ficha Maestra v2.0, sección 5, con dos ajustes hechos en
// Fase 6 a partir del vocabulario real del SRI confirmado en Fase 5
// (lib/fiscal/sri/estados.js):
//
// 1. SIGNED -> RETURNED (no "NOT_AUTHORIZED"): DEVUELTA es una respuesta de
//    RECEPCIÓN, no de autorización. El valor anterior era un error de la Fase 2,
//    escrito antes de tener el vocabulario SOAP real verificado.
// 2. Se agrega SUBMITTING como paso intermedio SIGNED -> SUBMITTING -> RECEIVED.
//    No es cosmético: es el mecanismo de exclusión mutua para el envío a Recepción.
//    Enviar un comprobante al SRI es una llamada de red con efecto externo que NO
//    se puede repetir de forma segura (a diferencia de generar o firmar, que son
//    puro cómputo y toleran una segunda ejecución descartada). El orquestador
//    (lib/fiscal/orchestration/facturaOrchestrator.js) primero intenta la
//    transición SIGNED -> SUBMITTING; si dos llamadas concurrentes lo intentan, el
//    LockService + la revalidación de estado bajo el lock (ver
//    transicionEstadoFactura) garantiza que solo una gane esa transición — la otra
//    la ve rechazada y no llega a llamar al SRI. Si el envío falla de forma
//    transitoria (timeout/red/SOAP fault), el orquestador libera el claim
//    volviendo a SIGNED para permitir un reintento posterior.
// 3. PROCESSING tiene auto-bucle: una consulta de autorización que sigue
//    devolviendo "en procesamiento" actualiza RetryCount/NextPollAt sin cambiar de
//    estado.
//
// AUTHORIZED sigue siendo inmutable: desde ahí solo se avanza hacia la entrega.
const FISCAL_TRANSICIONES_VALIDAS = {
  DRAFT: ['SEQUENCE_RESERVED'],
  SEQUENCE_RESERVED: ['GENERATED'],
  GENERATED: ['SIGNED'],
  // Auto-bucle SIGNED->SIGNED: permite re-firmar (nueva SigningTime, nuevo hash) al
  // reanudar tras un reinicio del proceso sin haber llegado a enviar todavía —
  // seguro porque, mientras siga en SIGNED, nunca se llamó al SRI (ver SUBMITTING).
  SIGNED: ['SUBMITTING', 'SIGNED'],
  // SIN auto-bucle en SUBMITTING a propósito: SIGNED->SUBMITTING es el CLAIM
  // (mutex) que impide un envío duplicado al SRI. Si se permitiera SUBMITTING->
  // SUBMITTING, un segundo llamador "reclamaría" con éxito un claim que ya tiene
  // otro, rompiendo la exclusión mutua. La reconciliación de un claim envejecido
  // que sigue ambigua (ver reconciliarSubmittingEnvejecido) NO escribe nada en
  // este estado — deliberado, para no resetear UpdatedAt (con el que se mide la
  // antigüedad del claim).
  SUBMITTING: ['RECEIVED', 'RETURNED', 'SIGNED'],
  RECEIVED: ['PROCESSING', 'RETURNED'],
  PROCESSING: ['AUTHORIZED', 'NOT_AUTHORIZED', 'RETURNED', 'PROCESSING'],
  RETURNED: ['GENERATED'],
  AUTHORIZED: ['DELIVERY_PENDING'],
  DELIVERY_PENDING: ['DELIVERED', 'DELIVERY_PENDING'],
  DELIVERED: [],
  NOT_AUTHORIZED: [],
};

/**
 * Normaliza un código fiscal de ancho fijo (Establishment/EmissionPoint/Sequential)
 * a la forma canónica con ceros a la izquierda. Existe porque Google Sheets, en una
 * celda con formato "Automático", convierte un valor numérico-parecido escrito como
 * texto (p. ej. "001") al NÚMERO 1 — perdiendo los ceros a la izquierda tanto al
 * escribir como, sobre todo, al leer con sheetToObjects (que devuelve el tipo crudo
 * de la celda). La reconstrucción aquí es exacta y sin ambigüedad porque Sheets
 * preserva el valor numérico real, solo pierde el padding — nunca oculta un dato
 * corrupto: si el valor no es puramente numérico o excede el ancho esperado, lanza
 * en vez de adivinar.
 */
function normalizarCodigoFiscal_(valor, ancho, etiqueta) {
  if (valor === null || valor === undefined || valor === '') return '';
  var str = String(valor).trim();
  if (!/^\d+$/.test(str)) {
    throw new Error('Código fiscal corrupto en ' + etiqueta + ': "' + valor + '" no es puramente numérico.');
  }
  if (str.length > ancho) {
    throw new Error('Código fiscal corrupto en ' + etiqueta + ': "' + valor + '" excede ' + ancho + ' dígitos.');
  }
  while (str.length < ancho) str = '0' + str;
  return str;
}

/** Aplica normalizarCodigoFiscal_ a los 3 códigos de ancho fijo de una fila de
 * FacturasFiscales ya leída de Sheets — el punto único por el que pasan
 * prácticamente todos los consumidores (facturaFiscalPorId_, getFacturasFiscales,
 * listarFacturasPendientesDePolling). */
function normalizarCodigosFacturaFiscal_(row) {
  if (!row) return row;
  row.Establishment = normalizarCodigoFiscal_(row.Establishment, 3, 'FacturasFiscales.Establishment (ID ' + row.ID + ')');
  row.EmissionPoint = normalizarCodigoFiscal_(row.EmissionPoint, 3, 'FacturasFiscales.EmissionPoint (ID ' + row.ID + ')');
  row.Sequential = normalizarCodigoFiscal_(row.Sequential, 9, 'FacturasFiscales.Sequential (ID ' + row.ID + ')');
  return row;
}

/**
 * Fuerza formato de celda Texto ANTES de escribir un código fiscal de ancho fijo —
 * en ese orden, porque reformatear una celda que ya tiene un número guardado no
 * restituye los ceros perdidos; hay que fijar el formato Texto y luego reescribir el
 * valor. Acotado a las columnas de código fiscal en FacturasFiscales/SecuenciaFiscal
 * (no se toca el helper genérico updateRow, usado por el resto de la app con
 * columnas donde SÍ se quiere un número real, p. ej. montos).
 */
function forzarTextoEnCelda_(sheet, rowIndex, columnName, valor) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const idx = headers.indexOf(columnName) + 1;
  if (idx <= 0) return;
  const range = sheet.getRange(rowIndex, idx);
  range.setNumberFormat('@');
  range.setValue(valor);
}

function conBloqueoFiscal(callback) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}

function registrarAuditoriaFiscal(evento) {
  try {
    var metadata = evento.metadatos && typeof evento.metadatos === 'object'
      ? JSON.stringify(evento.metadatos)
      : '';
    if (metadata.length > 1500) metadata = metadata.slice(0, 1500);
    getSheet('AuditoriaFiscal').appendRow([
      generateId('FAUD'),
      String(evento.facturaId || ''),
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
    throw new Error('No se pudo registrar la auditoría fiscal obligatoria. La operación no se completó y puede reintentarse.');
  }
}

function requireFiscalAdmin(user, action, context) {
  if (isAdmin(user)) return;
  context = context || {};
  registrarAuditoriaFiscal({
    facturaId: context.facturaId,
    usuario: user && user.Username,
    rol: user && user.Rol,
    accion: action,
    estadoAnterior: context.estadoAnterior,
    estadoNuevo: context.estadoNuevo,
    canal: context.canal || 'api',
    resultado: 'rechazado',
    motivo: 'Rol sin permiso administrativo para el módulo fiscal.',
  });
  throw new Error('Acceso denegado: solo un administrador puede gestionar el módulo fiscal.');
}

function facturaFiscalPorId_(id) {
  const sheet = getSheet('FacturasFiscales');
  const row = sheetToObjects(sheet).find(function (item) { return item.ID === id; });
  return { sheet: sheet, row: normalizarCodigosFacturaFiscal_(row) };
}

// ─────────────────────────────────────────────
// MIGRACIÓN IDEMPOTENTE
// ─────────────────────────────────────────────

function migrarModuloFiscal(user, params) {
  requireAdmin(user);
  const propiedadConfirmacion = PropertiesService.getScriptProperties().getProperty('SRI_MIGRATION_CONFIRMATION');
  const confirmacionParametro = params && params.confirmacion;
  if (confirmacionParametro !== FISCAL_MIGRATION_PARAM_CONFIRMATION || propiedadConfirmacion !== FISCAL_MIGRATION_PROPERTY_VALUE) {
    throw new Error(
      'Migración bloqueada: se requiere el parámetro confirmacion="' + FISCAL_MIGRATION_PARAM_CONFIRMATION +
      '" y la Script Property SRI_MIGRATION_CONFIRMATION="' + FISCAL_MIGRATION_PROPERTY_VALUE + '".'
    );
  }

  const hojasFiscales = ['FacturasFiscales', 'FacturaItems', 'SecuenciaFiscal', 'AuditoriaFiscal', 'ConfiguracionFiscal'];
  const hojasAseguradas = hojasFiscales.map(function (nombre) {
    getSheet(nombre); // getSheet ya crea la hoja y encabezados si faltan, o agrega columnas nuevas — es idempotente.
    return nombre;
  });

  const catalogoActual = sheetToObjects(getSheet('ConfiguracionFiscal'));
  const codigosExistentes = catalogoActual.map(function (item) { return item.CodigoInterno; });
  let catalogoSembrado = false;
  FISCAL_CATALOG_INICIAL.forEach(function (item) {
    if (codigosExistentes.indexOf(item.CodigoInterno) !== -1) return;
    getSheet('ConfiguracionFiscal').appendRow(SHEET_HEADERS.ConfiguracionFiscal.map(function (header) {
      const map = {
        ID: generateId('FCFG'),
        CodigoInterno: item.CodigoInterno,
        Descripcion: item.Descripcion,
        TaxRateBasisPoints: item.TaxRateBasisPoints,
        Activo: true,
        Version: FISCAL_CATALOG_VERSION,
        ActualizadoPor: user.Username,
        ActualizadoEn: new Date().toISOString(),
        ValidacionTributaria: FISCAL_VALIDACION_PENDIENTE,
        TestOnly: !!item.TestOnly,
      };
      return map[header] !== undefined ? map[header] : '';
    }));
    catalogoSembrado = true;
  });

  registrarAuditoriaFiscal({
    usuario: user.Username,
    rol: user.Rol,
    accion: 'FISCAL_MODULE_MIGRATED',
    canal: 'api',
    resultado: 'ok',
    metadatos: { hojasAseguradas: hojasAseguradas, catalogoSembrado: catalogoSembrado },
  });

  PropertiesService.getScriptProperties().deleteProperty('SRI_MIGRATION_CONFIRMATION');

  return { success: true, data: { hojasAseguradas: hojasAseguradas, catalogoSembrado: catalogoSembrado } };
}

// ─────────────────────────────────────────────
// CATÁLOGO FISCAL
// ─────────────────────────────────────────────

function obtenerConfiguracionFiscalActiva(user, params) {
  const catalogo = sheetToObjects(getSheet('ConfiguracionFiscal')).filter(function (item) {
    return esVerdadero(item.Activo);
  });
  return { success: true, data: catalogo };
}

function catalogoFiscalPorCodigo_(codigo) {
  return sheetToObjects(getSheet('ConfiguracionFiscal')).find(function (item) {
    return item.CodigoInterno === codigo && esVerdadero(item.Activo);
  });
}

// ─────────────────────────────────────────────
// CONFLICTO DE SERIE
// ─────────────────────────────────────────────

function verificarConflictoSerieFiscal(user, params) {
  requireFiscalAdmin(user, 'SERIES_CONFLICT_CHECK');
  const establishment = String((params && params.establishment) || '').padStart(3, '0');
  const emissionPoint = String((params && params.emissionPoint) || '').padStart(3, '0');
  const environment = params && params.environment;

  const facturasEnSerie = sheetToObjects(getSheet('FacturasFiscales')).filter(function (item) {
    return normalizarCodigoFiscal_(item.Establishment, 3, 'FacturasFiscales.Establishment') === establishment &&
      normalizarCodigoFiscal_(item.EmissionPoint, 3, 'FacturasFiscales.EmissionPoint') === emissionPoint;
  });
  const secuenciaEnSerie = sheetToObjects(getSheet('SecuenciaFiscal')).filter(function (item) {
    return normalizarCodigoFiscal_(item.Establishment, 3, 'SecuenciaFiscal.Establishment') === establishment &&
      normalizarCodigoFiscal_(item.EmissionPoint, 3, 'SecuenciaFiscal.EmissionPoint') === emissionPoint
      && (!environment || item.Environment === environment);
  });

  const conflicto = facturasEnSerie.length > 0 || secuenciaEnSerie.length > 0;
  registrarAuditoriaFiscal({
    usuario: user.Username,
    rol: user.Rol,
    accion: 'SERIES_CONFLICT_CHECK',
    canal: 'api',
    resultado: conflicto ? 'conflicto_detectado' : 'sin_conflicto',
    metadatos: { establishment: establishment, emissionPoint: emissionPoint, environment: environment || null, facturasEncontradas: facturasEnSerie.length, contadoresEncontrados: secuenciaEnSerie.length },
  });

  return {
    success: true,
    data: {
      conflict: conflicto,
      establishment: establishment,
      emissionPoint: emissionPoint,
      facturasEncontradas: facturasEnSerie.length,
      contadoresEncontrados: secuenciaEnSerie.length,
    },
  };
}

// ─────────────────────────────────────────────
// BORRADOR DE FACTURA
// ─────────────────────────────────────────────

function validarItemFiscal_(item, environment) {
  if (!item || typeof item !== 'object') throw new Error('Ítem de factura inválido.');
  const catalogo = catalogoFiscalPorCodigo_(item.codigo);
  if (!catalogo) throw new Error('El código de ítem "' + item.codigo + '" no existe en el catálogo fiscal activo.');
  if (Number(catalogo.TaxRateBasisPoints) !== Number(item.taxRateBasisPoints)) {
    throw new Error('La tarifa de impuesto del ítem "' + item.codigo + '" no coincide con el catálogo aprobado.');
  }
  // Bloqueo absoluto, sin excepción de administrador: un ítem TestOnly no
  // representa un concepto de negocio real, así que nunca es válido en
  // production — a diferencia de ValidacionTributaria (que un admin sí puede
  // confirmar), aquí no existe ningún camino de aprobación posible.
  if (environment === 'production' && esVerdadero(catalogo.TestOnly)) {
    throw new Error('El código "' + item.codigo + '" está marcado TEST_ONLY: nunca puede facturarse en producción.');
  }
  if (environment === 'production' && catalogo.ValidacionTributaria !== FISCAL_VALIDACION_CONFIRMADA) {
    throw new Error(
      'El concepto "' + item.codigo + '" todavía no tiene su tratamiento tributario confirmado ' +
      '(ValidacionTributaria=' + (catalogo.ValidacionTributaria || FISCAL_VALIDACION_PENDIENTE) + '). ' +
      'No se puede facturar en producción hasta que un administrador lo confirme con confirmarValidacionTributariaFiscal.'
    );
  }
  ['baseCents', 'totalCents', 'precioUnitarioCents'].forEach(function (campo) {
    var valor = item[campo];
    if (!Number.isInteger(valor) || valor < 0) {
      throw new Error('El campo "' + campo + '" del ítem "' + item.codigo + '" debe ser un entero no negativo (centavos).');
    }
  });
  return catalogo;
}

/**
 * Marca un código del catálogo como tributariamente confirmado (o lo revierte a
 * pendiente). Requiere admin y un motivo — deja rastro de quién y por qué autorizó
 * que ese concepto se facture en Producción. No decide la tarifa por sí misma: solo
 * registra que Jefatura/Contabilidad ya validó el tratamiento fuera del sistema.
 */
function confirmarValidacionTributariaFiscal(user, params) {
  const p = params || {};
  requireFiscalAdmin(user, 'TAX_VALIDATION_CONFIRM');
  if (!p.codigoInterno) throw new Error('codigoInterno es obligatorio.');
  if (!p.motivo || String(p.motivo).trim().length < 5) {
    throw new Error('motivo es obligatorio (mínimo 5 caracteres) para confirmar o revertir una validación tributaria.');
  }
  const nuevoEstado = p.confirmado === false ? FISCAL_VALIDACION_PENDIENTE : FISCAL_VALIDACION_CONFIRMADA;

  return conBloqueoFiscal(function () {
    const sheet = getSheet('ConfiguracionFiscal');
    const fila = sheetToObjects(sheet).find(function (item) { return item.CodigoInterno === p.codigoInterno; });
    if (!fila) throw new Error('Código de catálogo no encontrado: ' + p.codigoInterno);

    const estadoAnterior = fila.ValidacionTributaria || FISCAL_VALIDACION_PENDIENTE;
    updateRow(sheet, fila, {
      ValidacionTributaria: nuevoEstado,
      ValidadoPor: user.Username,
      ValidadoEn: new Date().toISOString(),
      MotivoValidacion: String(p.motivo).slice(0, 500),
    });

    registrarAuditoriaFiscal({
      usuario: user.Username,
      rol: user.Rol,
      accion: 'TAX_VALIDATION_CONFIRM',
      estadoAnterior: estadoAnterior,
      estadoNuevo: nuevoEstado,
      canal: 'api',
      resultado: 'ok',
      motivo: p.motivo,
      metadatos: { codigoInterno: p.codigoInterno },
    });

    return { success: true, data: { codigoInterno: p.codigoInterno, validacionTributaria: nuevoEstado } };
  });
}

function crearBorradorFactura(user, params) {
  requireFiscalAdmin(user, 'FACTURA_DRAFT_CREATE');
  const p = params || {};
  if (!p.idempotencyKey) throw new Error('idempotencyKey es obligatorio para crear un borrador de factura.');
  if (!Array.isArray(p.items) || p.items.length === 0) throw new Error('La factura requiere al menos un ítem.');
  if (p.environment !== 'test' && p.environment !== 'production') {
    throw new Error('environment debe ser "test" o "production".');
  }

  return conBloqueoFiscal(function () {
    const existentes = sheetToObjects(getSheet('FacturasFiscales'));
    const previa = existentes.find(function (item) { return item.IdempotencyKey === p.idempotencyKey; });
    if (previa) {
      // Idempotente: un reintento con la misma clave devuelve el borrador ya creado, no crea uno nuevo.
      return { success: true, data: previa, idempotent: true };
    }

    p.items.forEach(function (item) { validarItemFiscal_(item, p.environment); });

    const subtotalWithoutTax = p.items.reduce(function (acc, item) { return acc + item.baseCents; }, 0);
    const taxTotal = Number.isInteger(p.taxTotal) ? p.taxTotal : 0;
    const grandTotalEsperado = subtotalWithoutTax + taxTotal;
    if (Number.isInteger(p.grandTotal) && p.grandTotal !== grandTotalEsperado) {
      throw new Error('grandTotal (' + p.grandTotal + ') no coincide con subtotalWithoutTax + taxTotal (' + grandTotalEsperado + ').');
    }

    const id = generateId('FACT');
    const now = new Date().toISOString();
    const registro = {
      ID: id,
      Environment: p.environment,
      Status: 'DRAFT',
      InscripcionID: p.inscripcionId || '',
      IdempotencyKey: p.idempotencyKey,
      DocumentType: p.documentType || '01',
      IssuerRuc: p.issuerRuc || '',
      BuyerIdentificationType: p.buyerIdentificationType || '',
      BuyerIdentification: p.buyerIdentification || '',
      BuyerName: p.buyerName || '',
      BuyerEmail: p.buyerEmail || '',
      BuyerAddress: p.buyerAddress || '',
      SubtotalWithoutTax: subtotalWithoutTax,
      Subtotal0: p.items.filter(function (i) { return i.taxRateBasisPoints === 0; }).reduce(function (acc, i) { return acc + i.baseCents; }, 0),
      SubtotalTaxed: p.items.filter(function (i) { return i.taxRateBasisPoints !== 0; }).reduce(function (acc, i) { return acc + i.baseCents; }, 0),
      DiscountCents: Number.isInteger(p.discountCents) ? p.discountCents : 0,
      TaxTotal: taxTotal,
      GrandTotal: grandTotalEsperado,
      Currency: p.currency || 'USD',
      PaymentMethodInternal: p.paymentMethodInternal || '',
      CreatedBy: user.Username,
      CreatedAt: now,
      UpdatedAt: now,
    };

    getSheet('FacturasFiscales').appendRow(SHEET_HEADERS.FacturasFiscales.map(function (header) {
      return registro[header] !== undefined ? registro[header] : '';
    }));

    p.items.forEach(function (item) {
      getSheet('FacturaItems').appendRow(SHEET_HEADERS.FacturaItems.map(function (header) {
        const map = {
          ID: generateId('FITM'),
          FacturaID: id,
          Codigo: item.codigo,
          Descripcion: item.descripcion || '',
          Cantidad: item.cantidad,
          PrecioUnitarioCents: item.precioUnitarioCents,
          DescuentoCents: Number.isInteger(item.descuentoCents) ? item.descuentoCents : 0,
          TaxRateBasisPoints: item.taxRateBasisPoints,
          SriTaxCode: item.sriTaxCode || '',
          BaseCents: item.baseCents,
          TotalCents: item.totalCents,
          CatalogVersion: FISCAL_CATALOG_VERSION,
          ConfirmedBy: user.Username,
          CreatedAt: now,
        };
        return map[header] !== undefined ? map[header] : '';
      }));
    });

    registrarAuditoriaFiscal({
      facturaId: id,
      usuario: user.Username,
      rol: user.Rol,
      accion: 'FACTURA_DRAFT_CREATED',
      estadoAnterior: '',
      estadoNuevo: 'DRAFT',
      canal: 'api',
      resultado: 'ok',
      metadatos: { itemCount: p.items.length, grandTotal: grandTotalEsperado },
    });

    return { success: true, data: registro, idempotent: false };
  });
}

// ─────────────────────────────────────────────
// RESERVA ATÓMICA DE SECUENCIAL
// ─────────────────────────────────────────────

function reservarSecuencialFiscal(user, params) {
  const p = params || {};
  requireFiscalAdmin(user, 'SEQUENCE_RESERVE', { facturaId: p.facturaId });
  if (!p.facturaId) throw new Error('facturaId es obligatorio.');
  const establishment = String(p.establishment || '').padStart(3, '0');
  const emissionPoint = String(p.emissionPoint || '').padStart(3, '0');
  const documentType = p.documentType || '01';

  return conBloqueoFiscal(function () {
    const { row: factura } = facturaFiscalPorId_(p.facturaId);
    if (!factura) throw new Error('Factura no encontrada: ' + p.facturaId);
    if (factura.Status !== 'DRAFT') {
      throw new Error('Solo se puede reservar secuencial desde el estado DRAFT (actual: ' + factura.Status + ').');
    }

    const secuenciaSheet = getSheet('SecuenciaFiscal');
    // Los códigos leídos de Sheets pueden venir corruptos (ceros a la izquierda
    // perdidos si la celda no está en formato Texto) — se normalizan ANTES de
    // comparar contra establishment/emissionPoint (que ya son canónicos, recién
    // calculados arriba). Sin esto, un contador existente con "001" guardado como el
    // número 1 nunca se encontraría, y cada reserva creería erróneamente que es la
    // primera vez, reiniciando el secuencial en 1 en vez de continuar la serie.
    const contadores = sheetToObjects(secuenciaSheet);
    const claveContador = { Environment: factura.Environment, Establishment: establishment, EmissionPoint: emissionPoint, DocumentType: documentType };
    const contadorExistente = contadores.find(function (item) {
      return item.Environment === claveContador.Environment &&
        normalizarCodigoFiscal_(item.Establishment, 3, 'SecuenciaFiscal.Establishment') === claveContador.Establishment &&
        normalizarCodigoFiscal_(item.EmissionPoint, 3, 'SecuenciaFiscal.EmissionPoint') === claveContador.EmissionPoint &&
        item.DocumentType === claveContador.DocumentType;
    });

    if (!contadorExistente) {
      // Primer uso de esta serie en este ambiente: exigir verificación de conflicto explícita primero.
      const facturasPrevias = sheetToObjects(getSheet('FacturasFiscales')).filter(function (item) {
        return item.ID !== p.facturaId &&
          normalizarCodigoFiscal_(item.Establishment, 3, 'FacturasFiscales.Establishment') === establishment &&
          normalizarCodigoFiscal_(item.EmissionPoint, 3, 'FacturasFiscales.EmissionPoint') === emissionPoint;
      });
      if (facturasPrevias.length > 0) {
        throw new Error('Conflicto de serie: ya existen facturas con establecimiento ' + establishment + ' / punto ' + emissionPoint + '. Deteniendo, no se asigna secuencial automáticamente.');
      }
    }

    const ultimoSecuencial = contadorExistente ? Number(contadorExistente.LastSequential) : 0;
    const nuevoSecuencial = ultimoSecuencial + 1;
    const secuencialFormateado = String(nuevoSecuencial).padStart(9, '0');
    const now = new Date().toISOString();

    if (contadorExistente) {
      updateRow(secuenciaSheet, contadorExistente, { LastSequential: nuevoSecuencial, UpdatedAt: now });
      forzarTextoEnCelda_(secuenciaSheet, contadorExistente._row, 'Establishment', establishment);
      forzarTextoEnCelda_(secuenciaSheet, contadorExistente._row, 'EmissionPoint', emissionPoint);
      forzarTextoEnCelda_(secuenciaSheet, contadorExistente._row, 'LastSequential', String(nuevoSecuencial));
    } else {
      secuenciaSheet.appendRow(SHEET_HEADERS.SecuenciaFiscal.map(function (header) {
        const map = { ID: generateId('FSEQ'), Environment: claveContador.Environment, Establishment: establishment, EmissionPoint: emissionPoint, DocumentType: documentType, LastSequential: nuevoSecuencial, UpdatedAt: now };
        return map[header] !== undefined ? map[header] : '';
      }));
      const nuevaFila = secuenciaSheet.getLastRow();
      forzarTextoEnCelda_(secuenciaSheet, nuevaFila, 'Establishment', establishment);
      forzarTextoEnCelda_(secuenciaSheet, nuevaFila, 'EmissionPoint', emissionPoint);
      forzarTextoEnCelda_(secuenciaSheet, nuevaFila, 'LastSequential', String(nuevoSecuencial));
    }

    const facturaSheet = getSheet('FacturasFiscales');
    const { row: facturaActual } = facturaFiscalPorId_(p.facturaId);
    updateRow(facturaSheet, facturaActual, {
      Establishment: establishment,
      EmissionPoint: emissionPoint,
      Sequential: secuencialFormateado,
      DocumentNumber: establishment + '-' + emissionPoint + '-' + secuencialFormateado,
      Status: 'SEQUENCE_RESERVED',
      UpdatedAt: now,
    });
    // Refuerzo: forzar formato Texto en estas 3 columnas para que Sheets no vuelva a
    // convertir "001"/"002"/"000000001" en números y perder los ceros a la izquierda
    // (ver normalizarCodigoFiscal_ para la reconstrucción en lectura, que sigue
    // siendo la protección real; esto es defensa adicional para que el dato crudo en
    // la hoja también sea legible/correcto).
    forzarTextoEnCelda_(facturaSheet, facturaActual._row, 'Establishment', establishment);
    forzarTextoEnCelda_(facturaSheet, facturaActual._row, 'EmissionPoint', emissionPoint);
    forzarTextoEnCelda_(facturaSheet, facturaActual._row, 'Sequential', secuencialFormateado);

    registrarAuditoriaFiscal({
      facturaId: p.facturaId,
      usuario: user.Username,
      rol: user.Rol,
      accion: 'SEQUENCE_RESERVED',
      estadoAnterior: 'DRAFT',
      estadoNuevo: 'SEQUENCE_RESERVED',
      canal: 'api',
      resultado: 'ok',
      metadatos: { establishment: establishment, emissionPoint: emissionPoint, sequential: secuencialFormateado },
    });

    return {
      success: true,
      data: { establishment: establishment, emissionPoint: emissionPoint, sequential: secuencialFormateado, environment: factura.Environment, documentType: documentType },
    };
  });
}

// ─────────────────────────────────────────────
// TRANSICIÓN DE ESTADO GENÉRICA
// ─────────────────────────────────────────────

function transicionEstadoFactura(user, params) {
  const p = params || {};
  requireFiscalAdmin(user, 'FACTURA_STATE_TRANSITION', { facturaId: p.facturaId, estadoNuevo: p.nuevoEstado });
  if (!p.facturaId || !p.nuevoEstado) throw new Error('facturaId y nuevoEstado son obligatorios.');

  return conBloqueoFiscal(function () {
    const facturaSheet = getSheet('FacturasFiscales');
    const { row: factura } = facturaFiscalPorId_(p.facturaId);
    if (!factura) throw new Error('Factura no encontrada: ' + p.facturaId);

    const estadoActual = factura.Status;
    const permitidos = FISCAL_TRANSICIONES_VALIDAS[estadoActual] || [];
    if (permitidos.indexOf(p.nuevoEstado) === -1) {
      registrarAuditoriaFiscal({
        facturaId: p.facturaId,
        usuario: user.Username,
        rol: user.Rol,
        accion: 'FACTURA_STATE_TRANSITION',
        estadoAnterior: estadoActual,
        estadoNuevo: p.nuevoEstado,
        canal: 'api',
        resultado: 'rechazado',
        motivo: 'Transición no permitida.',
      });
      throw new Error('Transición no permitida: ' + estadoActual + ' -> ' + p.nuevoEstado + '.');
    }

    const now = new Date().toISOString();
    const campos = { Status: p.nuevoEstado, UpdatedAt: now };
    if (p.nuevoEstado === 'AUTHORIZED') campos.AuthorizedAt = now;
    if (p.nuevoEstado === 'DELIVERED') campos.DeliveredAt = now;
    if (p.camposAdicionales && typeof p.camposAdicionales === 'object') {
      Object.keys(p.camposAdicionales).forEach(function (key) {
        if (SHEET_HEADERS.FacturasFiscales.indexOf(key) !== -1) campos[key] = p.camposAdicionales[key];
      });
    }

    updateRow(facturaSheet, factura, campos);

    registrarAuditoriaFiscal({
      facturaId: p.facturaId,
      usuario: user.Username,
      rol: user.Rol,
      accion: 'FACTURA_STATE_TRANSITION',
      estadoAnterior: estadoActual,
      estadoNuevo: p.nuevoEstado,
      canal: 'api',
      resultado: 'ok',
      motivo: p.motivo || '',
    });

    const { row: facturaActualizada } = facturaFiscalPorId_(p.facturaId);
    return { success: true, data: facturaActualizada };
  });
}

// ─────────────────────────────────────────────
// LECTURA
// ─────────────────────────────────────────────

function getFacturasFiscales(user, params) {
  requireFiscalAdmin(user, 'FACTURAS_LIST');
  const p = params || {};
  let facturas = sheetToObjects(getSheet('FacturasFiscales')).map(normalizarCodigosFacturaFiscal_);
  if (p.environment) facturas = facturas.filter(function (item) { return item.Environment === p.environment; });
  if (p.status) facturas = facturas.filter(function (item) { return item.Status === p.status; });
  return { success: true, data: facturas };
}

function getAuditoriaFiscal(user, params) {
  requireFiscalAdmin(user, 'AUDITORIA_LIST');
  const p = params || {};
  let eventos = sheetToObjects(getSheet('AuditoriaFiscal'));
  if (p.facturaId) eventos = eventos.filter(function (item) { return item.FacturaID === p.facturaId; });
  return { success: true, data: eventos };
}

/** Factura + sus ítems, para que el orquestador Node arme el XML. Solo lectura. */
function getFacturaFiscalCompleta(user, params) {
  const p = params || {};
  requireFiscalAdmin(user, 'FACTURA_READ_FULL', { facturaId: p.facturaId });
  if (!p.facturaId) throw new Error('facturaId es obligatorio.');
  const { row: factura } = facturaFiscalPorId_(p.facturaId);
  if (!factura) throw new Error('Factura no encontrada: ' + p.facturaId);
  const items = sheetToObjects(getSheet('FacturaItems')).filter(function (item) {
    return item.FacturaID === p.facturaId;
  });
  return { success: true, data: { factura: factura, items: items } };
}

/**
 * Facturas elegibles para sondear autorización: en RECEIVED/PROCESSING y cuya
 * NextPollAt ya llegó (o nunca se sondearon). Filtra por ambiente de forma dura —
 * nunca mezcla filas de test y production en el mismo lote. Usado por
 * api/fiscal/poll a través del orquestador.
 */
function listarFacturasPendientesDePolling(user, params) {
  requireFiscalAdmin(user, 'FACTURAS_POLL_LIST');
  const p = params || {};
  if (p.environment !== 'test' && p.environment !== 'production') {
    throw new Error('environment debe ser "test" o "production".');
  }
  const limit = Number.isInteger(p.limit) && p.limit > 0 ? p.limit : 20;
  const nowIso = new Date().toISOString();
  const pendientes = sheetToObjects(getSheet('FacturasFiscales')).map(normalizarCodigosFacturaFiscal_).filter(function (item) {
    if (item.Environment !== p.environment) return false;
    if (item.Status !== 'RECEIVED' && item.Status !== 'PROCESSING') return false;
    // Suspendida para revisión manual: NUNCA se vuelve a sondear automáticamente,
    // sin importar NextPollAt — evitar polling infinito es justamente el propósito
    // de ReviewFlag. Solo reanudarPollingFactura (acción explícita de un admin) la
    // vuelve a hacer elegible.
    if (item.ReviewFlag === 'REQUIRES_REVIEW') return false;
    if (!item.NextPollAt) return true;
    return String(item.NextPollAt) <= nowIso;
  }).slice(0, limit);
  return { success: true, data: pendientes };
}

/**
 * Reanudación EXPLÍCITA por un administrador de una factura suspendida
 * (ReviewFlag='REQUIRES_REVIEW') tras exceder el límite de reintentos/antigüedad de
 * polling. Exige sesión de usuario real (NO acepta serviceToken — no está en
 * FISCAL_SERVICE_ACTIONS_ a propósito: reanudar es una decisión humana, nunca
 * automática) y un motivo. No cambia el Status fiscal (sigue siendo
 * RECEIVED/PROCESSING, el estado del SRI no cambió); solo limpia la bandera
 * operativa interna y agenda un nuevo intento inmediato.
 */
function reanudarPollingFactura(user, params) {
  const p = params || {};
  requireFiscalAdmin(user, 'FACTURA_POLLING_RESUMED', { facturaId: p.facturaId });
  if (!p.facturaId) throw new Error('facturaId es obligatorio.');
  if (!p.motivo || String(p.motivo).trim().length < 5) {
    throw new Error('motivo es obligatorio (mínimo 5 caracteres) para reanudar el polling de una factura.');
  }

  return conBloqueoFiscal(function () {
    const sheet = getSheet('FacturasFiscales');
    const { row: factura } = facturaFiscalPorId_(p.facturaId);
    if (!factura) throw new Error('Factura no encontrada: ' + p.facturaId);
    if (factura.ReviewFlag !== 'REQUIRES_REVIEW') {
      throw new Error('La factura no está marcada para revisión (ReviewFlag actual: "' + (factura.ReviewFlag || '') + '").');
    }

    const now = new Date().toISOString();
    updateRow(sheet, factura, {
      ReviewFlag: '',
      ReviewReason: '',
      NextPollAt: now,
      RetryCount: 0,
    });

    registrarAuditoriaFiscal({
      facturaId: p.facturaId,
      usuario: user.Username,
      rol: user.Rol,
      accion: 'FACTURA_POLLING_RESUMED',
      estadoAnterior: factura.Status,
      estadoNuevo: factura.Status,
      canal: 'api',
      resultado: 'ok',
      motivo: p.motivo,
    });

    const { row: facturaActualizada } = facturaFiscalPorId_(p.facturaId);
    return { success: true, data: facturaActualizada };
  });
}

/**
 * Reabre EXPLÍCITAMENTE una factura NOT_AUTHORIZED para corrección técnica y
 * reenvío (ej. tras corregir un bug de firma) — decisión humana, NUNCA automática:
 * NO está en FISCAL_SERVICE_ACTIONS_ a propósito (mismo motivo que
 * reanudarPollingFactura), y NOT_AUTHORIZED sigue sin salida en
 * FISCAL_TRANSICIONES_VALIDAS — la única puerta de salida es esta función, que hace
 * su propia validación de estado en vez de pasar por transicionEstadoFactura.
 * Conserva FacturaID/AccessKey/Establishment/EmissionPoint/Sequential intactos (no
 * los toca) y deja Status=GENERATED: generarYFirmarFactura reutiliza la MISMA clave
 * de acceso ya persistida para reconstruir y re-firmar, y el flujo normal
 * (SIGNED->SUBMITTING->...) retoma desde ahí sin ningún atajo. El rechazo anterior no
 * se borra: ya quedó en AuditoriaFiscal por la transición NOT_AUTHORIZED original, y
 * aquí además se copia a los metadatos de este evento para que quede autocontenido.
 */
function reabrirFacturaRechazadaParaCorreccion(user, params) {
  const p = params || {};
  requireFiscalAdmin(user, 'FACTURA_REOPEN_FOR_CORRECTION', { facturaId: p.facturaId });
  if (!p.facturaId) throw new Error('facturaId es obligatorio.');
  if (!p.motivo || String(p.motivo).trim().length < 5) {
    throw new Error('motivo es obligatorio (mínimo 5 caracteres) para reabrir una factura rechazada.');
  }

  return conBloqueoFiscal(function () {
    const sheet = getSheet('FacturasFiscales');
    const { row: factura } = facturaFiscalPorId_(p.facturaId);
    if (!factura) throw new Error('Factura no encontrada: ' + p.facturaId);
    if (factura.Status !== 'NOT_AUTHORIZED') {
      throw new Error('Solo se puede reabrir una factura en estado NOT_AUTHORIZED (actual: ' + factura.Status + ').');
    }

    const now = new Date().toISOString();
    const motivoRechazoAnterior = factura.LastSriMessage || '';
    const accessKeyPrevia = factura.AccessKey;
    const sequentialPrevio = factura.Sequential;

    updateRow(sheet, factura, {
      Status: 'GENERATED',
      UpdatedAt: now,
      ReviewFlag: '',
      ReviewReason: '',
    });

    registrarAuditoriaFiscal({
      facturaId: p.facturaId,
      usuario: user.Username,
      rol: user.Rol,
      accion: 'FACTURA_REOPEN_FOR_CORRECTION',
      estadoAnterior: 'NOT_AUTHORIZED',
      estadoNuevo: 'GENERATED',
      canal: 'api',
      resultado: 'ok',
      motivo: p.motivo,
      metadatos: { motivoRechazoAnterior: motivoRechazoAnterior, accessKey: accessKeyPrevia, sequential: sequentialPrevio },
    });

    const { row: facturaActualizada } = facturaFiscalPorId_(p.facturaId);
    // Nunca debe cambiar como resultado de reabrir — solo el Status se mueve.
    if (facturaActualizada.AccessKey !== accessKeyPrevia || facturaActualizada.Sequential !== sequentialPrevio) {
      throw new Error('Invariante violada: AccessKey/Sequential cambiaron al reabrir. Deteniendo.');
    }
    return { success: true, data: facturaActualizada };
  });
}

// ─────────────────────────────────────────────
// AUTENTICACIÓN SERVIDOR-A-SERVIDOR (orquestador Node -> Apps Script)
// ─────────────────────────────────────────────

// Allowlist explícito: solo estas acciones aceptan serviceToken en vez de una
// sesión de usuario. Todo lo demás (certificados, usuarios, etc.) sigue exigiendo
// login normal — este mecanismo no amplía privilegios de ninguna otra acción.
const FISCAL_SERVICE_ACTIONS_ = [
  'getFacturaFiscalCompleta',
  'listarFacturasPendientesDePolling',
  'transicionEstadoFactura',
  'reservarSecuencialFiscal',
  'crearBorradorFactura',
  'getConfiguracionFiscal',
];

function isFiscalServiceAction_(action) {
  return FISCAL_SERVICE_ACTIONS_.indexOf(action) !== -1;
}

/**
 * Valida el secreto servidor-a-servidor contra la Script Property
 * FISCAL_SERVICE_TOKEN (nunca hardcodeada, nunca logueada — ni aquí ni en el
 * llamador Node, ver lib/fiscal/orchestration/gasClient.js). Si coincide, se
 * construye un usuario sintético para que requireFiscalAdmin/registrarAuditoriaFiscal
 * sigan funcionando igual y la auditoría quede atribuida de forma identificable al
 * servicio automatizado, no a un usuario humano.
 */
function validateFiscalServiceToken_(serviceToken) {
  const expected = PropertiesService.getScriptProperties().getProperty('FISCAL_SERVICE_TOKEN');
  if (!expected || String(serviceToken) !== expected) return null;
  return { Username: 'fiscal-service', Rol: 'admin', UserID: 'SERVICE-FISCAL' };
}

// ─────────────────────────────────────────────
// TRIGGER DE POLLING (Apps Script -> /api/fiscal/poll)
// ─────────────────────────────────────────────
//
// Arquitectura elegida (ver docs/fiscal/architecture.md): un time-driven trigger de
// Apps Script llama periódicamente a /api/fiscal/poll en vez de usar Vercel Cron de
// pago. Nada de esto se ejecuta automáticamente todavía — instalarTriggerPollingFiscal
// debe correrla a mano un administrador desde el editor de Apps Script, después de
// haber cargado FISCAL_POLL_ENDPOINT_URL y FISCAL_POLL_SECRET como Script Properties
// (nunca hardcodeados aquí). No requiere el certificado P12 en absoluto: sondear
// autorización es una consulta de solo lectura al SRI.

/**
 * Función que el trigger ejecuta periódicamente. Llama a /api/fiscal/poll con el
 * secreto server-to-server en un header (nunca en la URL, para que no quede en
 * logs de acceso). Falla en silencio hacia el registro de ejecuciones de Apps
 * Script (Extensiones > Apps Script > Ejecuciones) si el endpoint no responde —
 * eso es exactamente "tolerar caída temporal del SRI/Vercel" en la práctica: el
 * próximo disparo del trigger, unos minutos después, simplemente lo vuelve a
 * intentar.
 */
function ejecutarPollingFiscal() {
  const properties = PropertiesService.getScriptProperties();
  const endpointUrl = properties.getProperty('FISCAL_POLL_ENDPOINT_URL');
  const secret = properties.getProperty('FISCAL_POLL_SECRET');
  if (!endpointUrl || !secret) {
    Logger.log('ejecutarPollingFiscal: faltan FISCAL_POLL_ENDPOINT_URL o FISCAL_POLL_SECRET, no se ejecuta.');
    return;
  }
  try {
    const response = UrlFetchApp.fetch(endpointUrl, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-fiscal-poll-secret': secret },
      payload: JSON.stringify({}),
      muteHttpExceptions: true,
    });
    // Se registra solo el código de estado y el conteo de procesadas -- nunca el
    // secreto, nunca el cuerpo completo de la respuesta (podría incluir mensajes
    // del SRI con datos de comprobantes).
    var procesadas = '?';
    try { procesadas = JSON.parse(response.getContentText()).data.procesadas; } catch (e) {}
    Logger.log('ejecutarPollingFiscal: HTTP ' + response.getResponseCode() + ', procesadas=' + procesadas);
  } catch (err) {
    Logger.log('ejecutarPollingFiscal: error de red al llamar al endpoint de polling.');
  }
}

/**
 * Instala el trigger de tiempo (cada 5 minutos). Idempotente: si ya existe un
 * trigger para ejecutarPollingFiscal, no crea uno duplicado. Debe correrse a mano
 * una sola vez desde el editor de Apps Script, nunca automáticamente.
 */
function instalarTriggerPollingFiscal() {
  const yaExiste = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === 'ejecutarPollingFiscal';
  });
  if (yaExiste) {
    Logger.log('instalarTriggerPollingFiscal: ya existe un trigger, no se crea otro.');
    return;
  }
  ScriptApp.newTrigger('ejecutarPollingFiscal')
    .timeBased()
    .everyMinutes(5)
    .create();
  Logger.log('instalarTriggerPollingFiscal: trigger creado (cada 5 minutos).');
}

/** Quita el/los trigger(s) de polling fiscal — para desactivar la automatización. */
function eliminarTriggerPollingFiscal() {
  var eliminados = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'ejecutarPollingFiscal') {
      ScriptApp.deleteTrigger(t);
      eliminados += 1;
    }
  });
  Logger.log('eliminarTriggerPollingFiscal: ' + eliminados + ' trigger(s) eliminado(s).');
}
