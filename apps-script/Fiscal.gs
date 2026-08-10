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

const FISCAL_CATALOG_INICIAL = [
  { CodigoInterno: 'CAPACITACION', Descripcion: 'Curso o capacitación', TaxRateBasisPoints: 0 },
  { CodigoInterno: 'CAPACITACION_CERTIFICADO', Descripcion: 'Curso o capacitación con certificado incluido', TaxRateBasisPoints: 0 },
];

// Estados tomados de la Ficha Maestra v2.0 (más reciente que el prompt inicial),
// sección 5. AUTHORIZED es inmutable: desde ahí solo se avanza hacia la entrega.
const FISCAL_TRANSICIONES_VALIDAS = {
  DRAFT: ['SEQUENCE_RESERVED'],
  SEQUENCE_RESERVED: ['GENERATED'],
  GENERATED: ['SIGNED'],
  SIGNED: ['RECEIVED', 'NOT_AUTHORIZED'],
  RECEIVED: ['PROCESSING', 'RETURNED'],
  PROCESSING: ['AUTHORIZED', 'NOT_AUTHORIZED', 'RETURNED'],
  RETURNED: ['GENERATED'],
  AUTHORIZED: ['DELIVERY_PENDING'],
  DELIVERY_PENDING: ['DELIVERED', 'DELIVERY_PENDING'],
  DELIVERED: [],
  NOT_AUTHORIZED: [],
};

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
  return { sheet: sheet, row: row };
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
    getSheet('ConfiguracionFiscal').appendRow([
      generateId('FCFG'),
      item.CodigoInterno,
      item.Descripcion,
      item.TaxRateBasisPoints,
      true,
      FISCAL_CATALOG_VERSION,
      user.Username,
      new Date().toISOString(),
    ]);
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
    return item.Establishment === establishment && item.EmissionPoint === emissionPoint;
  });
  const secuenciaEnSerie = sheetToObjects(getSheet('SecuenciaFiscal')).filter(function (item) {
    return item.Establishment === establishment && item.EmissionPoint === emissionPoint
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

function validarItemFiscal_(item) {
  if (!item || typeof item !== 'object') throw new Error('Ítem de factura inválido.');
  const catalogo = catalogoFiscalPorCodigo_(item.codigo);
  if (!catalogo) throw new Error('El código de ítem "' + item.codigo + '" no existe en el catálogo fiscal activo.');
  if (Number(catalogo.TaxRateBasisPoints) !== Number(item.taxRateBasisPoints)) {
    throw new Error('La tarifa de impuesto del ítem "' + item.codigo + '" no coincide con el catálogo aprobado.');
  }
  ['baseCents', 'totalCents', 'precioUnitarioCents'].forEach(function (campo) {
    var valor = item[campo];
    if (!Number.isInteger(valor) || valor < 0) {
      throw new Error('El campo "' + campo + '" del ítem "' + item.codigo + '" debe ser un entero no negativo (centavos).');
    }
  });
  return catalogo;
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

    p.items.forEach(validarItemFiscal_);

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
    const contadores = sheetToObjects(secuenciaSheet);
    const claveContador = { Environment: factura.Environment, Establishment: establishment, EmissionPoint: emissionPoint, DocumentType: documentType };
    const contadorExistente = contadores.find(function (item) {
      return item.Environment === claveContador.Environment && item.Establishment === claveContador.Establishment &&
        item.EmissionPoint === claveContador.EmissionPoint && item.DocumentType === claveContador.DocumentType;
    });

    if (!contadorExistente) {
      // Primer uso de esta serie en este ambiente: exigir verificación de conflicto explícita primero.
      const facturasPrevias = sheetToObjects(getSheet('FacturasFiscales')).filter(function (item) {
        return item.Establishment === establishment && item.EmissionPoint === emissionPoint && item.ID !== p.facturaId;
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
    } else {
      secuenciaSheet.appendRow(SHEET_HEADERS.SecuenciaFiscal.map(function (header) {
        const map = { ID: generateId('FSEQ'), Environment: claveContador.Environment, Establishment: establishment, EmissionPoint: emissionPoint, DocumentType: documentType, LastSequential: nuevoSecuencial, UpdatedAt: now };
        return map[header] !== undefined ? map[header] : '';
      }));
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
  let facturas = sheetToObjects(getSheet('FacturasFiscales'));
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
