# Permisos de certificados

| Acción | Administrador | Vendedor | Aval | Público |
|---|:---:|:---:|:---:|:---:|
| Consultar estado resumido | Sí | Solo propios | Solo asignados | No |
| Verificación mediante QR | Sí | Sí, página pública | Sí, página pública | Sí |
| Emitir/generar PDF oficial | Sí | No | No | No |
| Descargar PDF auditado | Sí | No | No | No |
| Ver/descargar QR independiente | Sí | No | No | No |
| Anular o reemitir | Sí, con motivo y confirmación | No | No | No |
| Eliminar inscripción sin certificado | Según regla vigente | Solo propia | No | No |
| Eliminar inscripción protegida | No | No | No | No |
| Enviar/compartir certificado | Sí | No | No | No |
| Consultar auditoría | Sí, solo lectura | No | No | No |
| Gestionar aval | Sí | No | Solo su institución | No |

El frontend oculta o bloquea acciones según capacidades; Apps Script vuelve a validar cada operación con la sesión. El vendedor recibe un resumen sin código administrativo, hash, referencia privada ni datos de auditoría. La verificación pública nunca expone PDF, pagos, tokens, Google Sheets o rutas privadas.
