# ADR-001: separar el servicio fiscal de Apps Script

## Contexto
Apps Script sostiene operaciones actuales, pero firma, secuencias, trazabilidad y reintentos exigen otro límite transaccional y de seguridad.
## Decisión
Crear `fiscal-service/` como API independiente; React solo consume su contrato detrás de una bandera.
## Alternativas
Añadir lógica a Apps Script o al frontend; ambas mezclan responsabilidades y exponen controles sensibles.
## Consecuencias
Despliegue y operación adicionales, a cambio de aislamiento, auditabilidad y evolución segura.
## Estado
Aceptado; implementación local.
