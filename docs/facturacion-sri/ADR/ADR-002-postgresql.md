# ADR-002: PostgreSQL como persistencia fiscal

## Contexto
Los secuenciales y estados requieren transacciones, restricciones y consultas auditables.
## Decisión
Usar memoria solo para demostración efímera y mantener PostgreSQL como opción técnica recomendada mediante un adaptador sustituible.
## Alternativas
Sheets carece de las garantías necesarias; SQLite simplifica local pero no representa el objetivo operacional.
## Consecuencias
Se incorpora migración, pool y Compose; queda pendiente la decisión institucional. PostgreSQL no se considera un requisito legal o tributario y puede sustituirse por una alternativa que cumpla integridad, concurrencia, auditoría, idempotencia y respaldos.
## Estado
Aceptado; adaptador implementado, prueba de infraestructura pendiente.
