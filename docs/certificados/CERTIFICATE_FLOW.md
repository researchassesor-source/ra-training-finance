# Flujo de certificados

La implementación V3 conserva valores históricos mediante un mapa de compatibilidad y no exige renombrarlos.

| Estado/evento formal | Persistencia compatible |
|---|---|
| `INSCRIPTION_CREATED` | `EstadoCertificado=pendiente` |
| `PAYMENT_REPORTED` | comprobante, fecha o estado de pago reportado |
| `PAYMENT_VERIFIED` | `EstadoPago=verificado` |
| `AVAL_PENDING` | requiere aval y `EstadoAval!=avalado` |
| `AVAL_CONFIRMED` | `EstadoAval=avalado` |
| `CERTIFICATE_ISSUED` | `emitido` o legado `issued` |
| `CERTIFICATE_SENT` | `enviado`, `sent`, `compartido` o `enviado_email` |
| `CERTIFICATE_VOIDED` | `anulado` o legado `voided` |
| `CERTIFICATE_REISSUED` | original `reemitido`/`reissued`; versión nueva `emitido` |

## Emisión y descarga

1. Administración verifica pago, datos académicos y aval cuando aplica.
2. Apps Script adquiere `LockService`, comprueba unicidad y asigna código dentro del bloqueo.
3. Se crea un registro versionado y se audita la emisión.
4. El repositorio genera una vez el PDF, calcula SHA-256 y guarda una referencia privada inmutable.
5. El frontend registra el artefacto en backend.
6. Backend crea una solicitud `AUDIT_PENDING` y registra `CERTIFICATE_DOWNLOAD_REQUESTED`.
7. Solo entonces se entrega el archivo.
8. Frontend confirma `CERTIFICATE_DOWNLOAD_COMPLETED` o `CERTIFICATE_DOWNLOAD_FAILED`; los pendientes quedan visibles para reconciliación.

## Anulación y reemisión

La anulación exige administrador, motivo y confirmación explícita. Conserva certificado/QR y la página pública muestra `CERTIFICADO ANULADO`. La reemisión conserva la versión original como `reemitido`, genera nuevo ID/código/versión y enlaza el QR histórico con el vigente.

Una inscripción con certificado emitido, enviado, anulado o reemitido, o con código/fecha de emisión, no puede eliminarse físicamente. Los históricos sin versión usan fallback 1. Un histórico `legacy-*` sin PDF original no se regenera con la plantilla actual.
