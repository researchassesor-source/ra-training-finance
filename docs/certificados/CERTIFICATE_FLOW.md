# Flujo de certificados

La base existente mantiene sus valores persistidos. Esta fase no ejecuta una migración destructiva; documenta sus equivalencias funcionales.

| Estado formal | Valores actuales / condición |
|---|---|
| `INSCRIPTION_CREATED` | Inscripción creada; `EstadoCertificado=pendiente` |
| `PAYMENT_PENDING` | `EstadoPago=pendiente`, `pagado` o `pendiente_verificacion` |
| `PAYMENT_VERIFIED` | `EstadoPago=verificado` |
| `DATA_REVIEWED` | Datos mínimos validados antes de emitir |
| `AVAL_PENDING` | Requiere aval y `EstadoAval!=avalado` |
| `AVAL_CONFIRMED` | `EstadoAval=avalado` |
| `READY_TO_ISSUE` | Pago verificado, datos completos y aval listo cuando aplica |
| `CERTIFICATE_ISSUED` | `EstadoCertificado=emitido` |
| `CERTIFICATE_SENT` | `EstadoEntrega=compartido` o `enviado_email` |
| `DELIVERY_FAILED` | Evento de auditoría; se conserva el último estado de entrega válido |
| `REQUIRES_CORRECTION` | Validación rechazada antes de emitir; no se persiste un valor nuevo |
| `VOIDED` | Pendiente de diseño institucional; no implementado |
| `REISSUED` | Pendiente de diseño institucional; no implementado |

## Reglas aplicadas

1. El vendedor crea y corrige sus inscripciones dentro de las reglas existentes.
2. Solo administración verifica el pago.
3. Si el certificado requiere aval, no puede emitirse hasta que el rol autorizado confirme la referencia, código o enlace.
4. El backend valida participante, identificación, curso, duración, fechas y modalidad.
5. El backend asigna el código estable; no confía en un código propuesto por el cliente.
6. Una segunda solicitud de emisión devuelve el registro ya emitido y no crea un duplicado.
7. Solo administración genera, descarga o entrega el PDF oficial.
8. Cada descarga o entrega actualiza trazabilidad y auditoría.
9. Los certificados históricos `emitido` siguen verificándose con su ID y código existente.

La anulación y reemisión no se añadieron porque el modelo actual no conserva versiones históricas suficientes para hacerlo de forma segura. Deben diseñarse con historial inmutable antes de habilitarse.
