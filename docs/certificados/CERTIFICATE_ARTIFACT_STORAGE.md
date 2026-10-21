# Contrato de almacenamiento de artefactos de certificado

`CertificateArtifactStore` define `save`, `get`, `exists`, `calculateHash` y `verifyHash`. `CertificatePdfRepository` coordina la generación única y reutilización del PDF oficial.

## Invariantes

- La clave combina identificador público y versión.
- Un mismo identificador/versión no puede cambiar de hash.
- SHA-256 se verifica antes de cada descarga reutilizada.
- El archivo oficial de nuevas emisiones se archiva en Drive privado; IndexedDB es una copia de trabajo local, no la ubicación institucional de recuperación.
- Si existe un registro antiguo con hash y referencia `browser-indexeddb:`, encontrar el original local provoca una migración idempotente a Drive, sin modificar código, versión, plantilla, contenido o estado.
- Si el navegador no tiene el PDF antiguo, un administrador puede cargarlo desde el panel. Apps Script vuelve a verificar estado, versión, plantilla y SHA-256 antes de cambiar solo la referencia de almacenamiento. Si no coincide, no cambia nada.
- Toda migración registra `CERTIFICATE_ARTIFACT_MIGRATED_TO_DRIVE`. Si falla la auditoría o la actualización de la hoja, la referencia se revierte y el archivo nuevo se envía a la papelera.
- Si el backend ya registra hash pero el navegador no posee el blob, se bloquea la regeneración automática; solo se puede migrar el PDF original que coincida con la huella registrada. Si no se conserva ese archivo, la alternativa es una reemisión institucional controlada.
- Un histórico identificado como `legacy-*` y sin artefacto se bloquea hasta recuperar/importar el PDF original; nunca se reconstruye con la plantilla vigente.
- `PdfStorageReference` contiene una referencia opaca, nunca una URL pública ni permisos de Drive.
- Una reemisión crea identificador, versión, referencia y artefacto nuevos; conserva el original.

La recuperación directa de una referencia `certificate-drive:` pasa por Apps Script autorizado y verifica la huella antes de entregar el PDF. El traslado de archivos grandes usa fragmentos temporales privados, ligados a una sesión, inscripción y versión; las cargas incompletas vencen y se limpian.

## Límites de seguridad

El backend limita escritura y lectura de PDFs oficiales a administradores, mantiene los archivos privados (`certificate-drive:<id>` opaco) y rechaza sobrescrituras. El ID o URL de Drive no se incluye en QR ni verificación pública. El administrador nunca debe seleccionar una versión regenerada como si fuera el original: el SHA-256 debe ser idéntico.
