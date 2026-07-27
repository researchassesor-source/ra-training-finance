# Recuperación local de certificados históricos

Los certificados emitidos antes del versionado de artefactos pueden reconstruir su PDF bajo demanda exclusivamente mediante el flujo administrativo. La recuperación conserva el identificador público, código, participante, identificación, curso, duración, modalidad, fechas, estado y QR persistidos.

El PDF recuperado usa la plantilla vigente, calcula SHA-256 y se almacena en IndexedDB con una referencia terminada en `:historical-recovery`. No crea inscripciones, no modifica datos del participante, no cambia el código y no marca el certificado como reemitido.

## Limitación temporal

IndexedDB pertenece al navegador y al dispositivo. Si otro equipo no tiene el artefacto local, el administrador puede reconstruirlo nuevamente. La generación fija de forma determinista el identificador y la fecha interna del PDF para poder comprobar la misma huella SHA-256.

Esta recuperación no reemplaza el almacenamiento institucional centralizado pendiente. La referencia local y el evento `CERTIFICATE_HISTORICAL_ARTIFACT_RECOVERED` quedan incluidos en el registro del artefacto del navegador; Apps Script conserva además sus auditorías existentes de registro del artefacto, solicitud y confirmación de descarga.
