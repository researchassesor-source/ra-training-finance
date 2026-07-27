# Contrato de almacenamiento de artefactos de certificado

`CertificateArtifactStore` define `save`, `get`, `exists`, `calculateHash` y `verifyHash`. `CertificatePdfRepository` coordina la generación única y reutilización del PDF oficial.

## Invariantes

- La clave combina identificador público y versión.
- Un mismo identificador/versión no puede cambiar de hash.
- SHA-256 se verifica antes de cada descarga reutilizada.
- Si el backend ya registra hash pero el proveedor local no posee el blob, la aplicación bloquea la regeneración automática.
- Un histórico identificado como `legacy-*` y sin artefacto se bloquea hasta recuperar/importar el PDF original; nunca se reconstruye con la plantilla vigente.
- `PdfStorageReference` contiene una referencia opaca, nunca una URL pública ni permisos de Drive.
- Una reemisión crea identificador, versión, referencia y artefacto nuevos; conserva el original.

Preview usa `BrowserIndexedDbCertificateArtifactStore`; las pruebas unitarias usan memoria. Esto evita tocar Drive productivo, pero no sustituye almacenamiento institucional centralizado.

## Adaptador futuro de Drive privado

El proveedor deberá guardar en una carpeta no pública, devolver una referencia opaca `private-drive:<id>`, verificar hash después de subir/leer, negar sobrescrituras, aplicar permisos de mínimo privilegio y mantener versionado/retención. La descarga debe pasar por backend autorizado; el ID o URL de Drive no se incluirá en QR, verificación pública ni frontend sin autorización temporal.
