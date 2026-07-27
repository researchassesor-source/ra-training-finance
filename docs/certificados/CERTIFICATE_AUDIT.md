# Auditoría de certificados

Apps Script incorpora la hoja `AuditoriaCertificados` con los campos:

`ID`, `CertificadoID`, `InscripcionID`, `Usuario`, `Rol`, `Accion`, `FechaHora`, `EstadoAnterior`, `EstadoNuevo`, `Canal`, `Resultado`, `Motivo`, `Metadatos`.

## Eventos implementados

- `INSCRIPTION_CREATED`
- `ENROLLMENT_UPDATED`
- `PAYMENT_VERIFIED`
- `AVAL_CONFIRMED`
- `CERTIFICATE_ISSUED`
- `CERTIFICATE_GENERATED`
- `CERTIFICATE_DOWNLOADED`
- `CERTIFICATE_SHARED`
- `CERTIFICATE_SENT`
- `CERTIFICATE_RESENT`
- `CERTIFICATE_DELIVERY_FAILED`
- intentos administrativos rechazados con la acción solicitada y resultado `rechazado`

## Seguridad

- La consulta está limitada a administradores y se muestra en modo de solo lectura.
- Se limita el tamaño de motivo y metadatos.
- No se guardan contraseñas, tokens, PDF, firmas, secretos ni contenido del correo.
- Los errores públicos permanecen genéricos y no filtran datos internos.
- No se implementaron edición ni eliminación de eventos.

La hoja se creará o completará mediante el mecanismo de encabezados existente cuando este Apps Script sea aprobado y desplegado posteriormente. No se modificó ninguna hoja real durante esta fase.
