# ADR-005: idempotencia y máquina de estados

## Contexto
Reintentos de red o clics repetidos no deben duplicar facturas, secuencias ni transmisiones.
## Decisión
Exigir Idempotency-Key en creaciones, restricciones únicas y transiciones explícitas auditadas.
## Alternativas
Deduplicar por horario o confiar en la interfaz es frágil ante concurrencia.
## Consecuencias
Cada operación debe declarar precondiciones; los conflictos son visibles y recuperables.
## Estado
Aceptado e implementado localmente.
