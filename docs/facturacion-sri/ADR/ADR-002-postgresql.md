# ADR-002: PostgreSQL como persistencia fiscal

## Contexto
Los secuenciales y estados requieren transacciones, restricciones y consultas auditables.
## Decisión
Usar PostgreSQL como objetivo y memoria solo para demostración efímera.
## Alternativas
Sheets carece de las garantías necesarias; SQLite simplifica local pero no representa el objetivo operacional.
## Consecuencias
Se incorpora migración, pool y Compose; queda pendiente ejecutar Docker/PostgreSQL.
## Estado
Aceptado; adaptador implementado, prueba de infraestructura pendiente.
