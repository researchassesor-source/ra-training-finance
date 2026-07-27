# Contrato futuro: CRM y certificados

Estado: **documentado, no conectado**. Finance continúa siendo la única fuente de emisión oficial.

## Operaciones propuestas para `/v1`

### `GET /integrations/certificates/:verificationId`

Devuelve `id`, `estado`, `courseName`, `publicUrl`, `issuedAt`, `deliveryStatus` y, cuando corresponda, un resumen del aval.

### `GET /integrations/enrollments/:id/certificate-status`

Devuelve el estado formal y los requisitos pendientes, sin montos ni información de pago.

### `GET /integrations/courses`

Devuelve identificador, nombre, modalidad y duración de cursos activos autorizados para sincronización.

### `POST /integrations/certificates/:id/request-delivery`

Registra una solicitud idempotente para revisión administrativa. No envía el certificado directamente ni cambia el estado a enviado.

## Controles obligatorios antes de implementar

- Autenticación máquina a máquina con credenciales rotables y alcance mínimo.
- Autorización por operación; el CRM nunca recibe privilegios de administrador humano.
- `Idempotency-Key` en solicitudes de entrega.
- Auditoría de consumidor, resultado y correlación.
- Rate limiting y protección contra enumeración.
- Versionado de contrato y compatibilidad hacia atrás.
- CORS con lista explícita de orígenes; nunca `*` con credenciales.
- Revocación inmediata y fechas de expiración.
- Enlaces públicos canónicos construidos desde `VITE_PUBLIC_APP_URL`.

## Datos prohibidos

No exponer montos, pagos, RUC, teléfonos, observaciones privadas, auditoría completa, Google Sheets, tokens, `GAS_URL` ni rutas internas.
