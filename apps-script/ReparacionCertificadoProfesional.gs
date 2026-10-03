/** Reparación acotada de las dos reemisiones incompletas del capacitador Danny.
 * Requiere un respaldo previo de la hoja. No emite ni sustituye ningún PDF.
 * Una vez ejecutada, completar la versión 2 desde Finance y comprobar el archivo.
 */
function repararCertificadoProfesionalDanny20261002() {
  return conBloqueoCertificados(function() {
    const sheet = getSheet('CertificadosProfesionales');
    const versions = sheetToObjects(sheet);
    const original = versions.find(function(row) { return row.ID === 'CPR_1790799966329_ZFXUV'; });
    const prepared = versions.find(function(row) { return row.ID === 'CPR_1790978739114_D95ET'; });
    const duplicate = versions.find(function(row) { return row.ID === 'CPR_1790978768542_STPGL'; });
    if (!original || !prepared || !duplicate) throw new Error('No coinciden las tres versiones esperadas; no se modificó ningún certificado.');
    if (original.CodigoCertificado !== 'RA-2026-66329ZFXUV' || estadoNormalizadoCertificado(original) !== 'emitido'
        || prepared.CodigoCertificado !== 'RA-2026-39114D95ET' || duplicate.CodigoCertificado !== 'RA-2026-68542STPGL'
        || original.ServicioID !== prepared.ServicioID || original.ServicioID !== duplicate.ServicioID
        || original.CapacitadorID !== prepared.CapacitadorID || original.CapacitadorID !== duplicate.CapacitadorID
        || prepared.Identificacion !== '0604509968' || duplicate.Identificacion !== '0604509968'
        || prepared.TemplateVersion !== 'ra-security-2026-v3' || duplicate.TemplateVersion !== 'ra-security-2026-v3'
        || prepared.PdfHash || prepared.PdfStorageReference || duplicate.PdfHash || duplicate.PdfStorageReference) {
      throw new Error('Cambió el estado o la identidad; no se modificó ningún certificado.');
    }
    if (estadoNormalizadoCertificado(prepared) === 'pendiente_pdf'
        && prepared.ReplacesCertificateId === original.ID
        && prepared.CertificatePreparedAt
        && estadoNormalizadoCertificado(duplicate) === 'cancelado') {
      return { success: true, idempotent: true, preparedId: prepared.ID, duplicateId: duplicate.ID };
    }
    if (estadoNormalizadoCertificado(prepared) !== 'pendiente_pdf'
        || estadoNormalizadoCertificado(duplicate) !== 'pendiente_pdf'
        || prepared.ReplacesCertificateId || duplicate.ReplacesCertificateId) {
      throw new Error('Las versiones pendientes ya cambiaron; revisión manual obligatoria.');
    }
    const preparedAt = new Date(1790978739114).toISOString();
    const duplicateAt = new Date(1790978768542).toISOString();
    const snapshot = snapshotDocumentalCertificado_('profesional', {
      Nombre: prepared.Nombre, Identificacion: prepared.Identificacion, TipoIdentificacion: 'CEDULA_EC',
      Resumen: prepared.Resumen, ServicioNombre: prepared.ServicioNombre, Duracion: prepared.Duracion,
      Modalidad: prepared.Modalidad, FechaInicio: prepared.FechaInicio, FechaFin: prepared.FechaFin,
      CodigoCertificado: prepared.CodigoCertificado, CertificateVersion: prepared.CertificateVersion,
      TemplateVersion: prepared.TemplateVersion, IssuedAt: preparedAt, IssuedBy: prepared.IssuedBy,
      SignatureHashes: huellasFirmasOficialesCertificado_(),
    });
    const repaired = Object.assign({
      TipoIdentificacion: 'CEDULA_EC', ReplacesCertificateId: original.ID,
      CertificatePreparedAt: preparedAt, ReissueReason: 'Nuevo Certificado', CreatedAt: preparedAt,
    }, snapshot);
    const canceled = {
      TipoIdentificacion: 'CEDULA_EC', ReplacesCertificateId: original.ID,
      CertificatePreparedAt: duplicateAt, ReissueReason: 'Nuevo Certificado', CreatedAt: duplicateAt,
      CertificateStatus: 'cancelado', VoidedAt: new Date().toISOString(),
      VoidedBy: 'reparacion-administrativa', VoidReason: 'Preparación duplicada por fallo técnico antes de generar el PDF. Nunca se emitió.',
    };
    const rollbackPrepared = {};
    const rollbackDuplicate = {};
    Object.keys(repaired).forEach(function(key) { rollbackPrepared[key] = prepared[key] || ''; });
    Object.keys(canceled).forEach(function(key) { rollbackDuplicate[key] = duplicate[key] || ''; });
    try {
      updateRow(sheet, prepared, repaired);
      updateRow(sheet, duplicate, canceled);
      registrarAuditoriaCertificado({
        certificadoId: prepared.CodigoCertificado, usuario: 'reparacion-administrativa', rol: 'admin',
        accion: 'TRAINER_CERTIFICATE_PENDING_RECOVERED', estadoAnterior: 'pendiente_pdf',
        estadoNuevo: 'pendiente_pdf', canal: 'migracion', resultado: 'ok',
        motivo: 'Recuperación de metadatos omitidos y cancelación de preparación duplicada no emitida.',
        metadatos: { originalCertificateId: original.ID, preparedCertificateId: prepared.ID,
          canceledDuplicateId: duplicate.ID, canceledDuplicateCode: duplicate.CodigoCertificado,
          backup: 'RESPALDO Finance antes de corregir certificado Danny — 2026-10-02' },
      });
    } catch (error) {
      updateRow(sheet, prepared, rollbackPrepared);
      updateRow(sheet, duplicate, rollbackDuplicate);
      throw error;
    }
    return { success: true, preparedId: prepared.ID, preparedCode: prepared.CodigoCertificado,
      duplicateId: duplicate.ID, duplicateStatus: 'cancelado', snapshotVerified: Boolean(leerSnapshotDocumentalCertificado_(buscarCertificadoProfesional_(prepared.ID))) };
  });
}
