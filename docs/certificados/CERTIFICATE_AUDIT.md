# Auditoría de certificados

`AuditoriaCertificados` registra ID, certificado, inscripción, usuario, rol, acción, fecha/hora, estados, canal, resultado, motivo y metadatos limitados. `DescargasCertificados` conserva la reconciliación `AUDIT_PENDING`, `AUDIT_CONFIRMED` o `AUDIT_FAILED`.

Eventos principales:

- `INSCRIPTION_CREATED`, `ENROLLMENT_UPDATED`, `PAYMENT_REPORTED`, `PAYMENT_VERIFIED`;
- `AVAL_CONFIRMED`;
- `CERTIFICATE_ISSUED`, `CERTIFICATE_METADATA_BACKFILLED`, `CERTIFICATE_ARTIFACT_REGISTERED`;
- `CERTIFICATE_DOWNLOAD_REQUESTED`, `CERTIFICATE_DOWNLOAD_COMPLETED`, `CERTIFICATE_DOWNLOAD_FAILED`;
- `CERTIFICATE_SENT`, `CERTIFICATE_RESENT`, `CERTIFICATE_SHARED`, `CERTIFICATE_DELIVERY_FAILED`;
- `CERTIFICATE_VOIDED`, `CERTIFICATE_REISSUED`;
- `CERTIFICATE_DELETE_REJECTED`, `CERTIFICATE_CODE_CONFLICT`;
- intentos administrativos rechazados con resultado `rechazado`.

Las excepciones de escritura de auditoría ya no se silencian. Una descarga no se inicia sin una solicitud auditada; si su confirmación posterior falla, permanece pendiente y el panel ofrece reintento. Los eventos no almacenan contraseñas, tokens, blobs PDF, firmas ni secretos y no tienen edición/eliminación desde la aplicación.
