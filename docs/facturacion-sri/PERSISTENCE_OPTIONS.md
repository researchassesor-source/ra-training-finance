# Opciones de persistencia fiscal

## 1. Estado actual

El módulo utiliza `InMemoryFiscalRepository` y almacenamiento local exclusivamente para desarrollo y pruebas. La información se pierde al reiniciar y no puede considerarse persistencia productiva. Su estado es `REQUIRES_CONFIRMATION`.

El dominio depende de `FiscalRepository` y `FiscalStorageProvider`, no de un proveedor concreto. Los límites disponibles son `InMemoryFiscalRepository`, `PostgreSqlFiscalRepository` y `FutureInstitutionalFiscalRepository`; este último permanece deliberadamente sin implementación hasta aprobar la alternativa institucional.

## 2. Alternativa Google Sheets y Drive

Una integración futura podría usar Google Sheets únicamente para metadatos fiscales de bajo volumen y Google Drive privado para XML y RIDE. Exigiría bloqueo explícito al reservar secuenciales, permisos mínimos, auditoría inmutable o equivalente, control de idempotencia, respaldos y pruebas de recuperación. En esta etapa no existen llamadas a Sheets ni Drive.

## 3. Alternativa PostgreSQL

`PostgreSqlFiscalRepository` ofrece transacciones, restricciones e integridad bajo concurrencia. El proyecto ya contiene un adaptador y pruebas emuladas. Para utilizarlo institucionalmente todavía deben definirse alojamiento privado, operación, respaldos, restauración, acceso y monitoreo.

## 4. Ventajas y riesgos

Sheets y Drive pueden resultar familiares para operaciones de bajo volumen, pero requieren diseñar cuidadosamente el bloqueo de secuencias, la concurrencia, la auditoría y la separación entre metadatos y archivos privados. PostgreSQL ofrece controles transaccionales más directos y mejor concurrencia, pero incorpora responsabilidades de infraestructura, mantenimiento, seguridad y recuperación. Cualquier opción debe garantizar secuencias sin duplicados, idempotencia, trazabilidad, acceso restringido y respaldos verificables.

## 5. Costos de licencia frente a costos de infraestructura

La evaluación debe separar licenciamiento de los costos reales de infraestructura y operación: almacenamiento, cómputo, respaldos, monitoreo, administración, mantenimiento y recuperación. Una alternativa sin licencia adicional no implica costo operativo nulo, y una infraestructura dedicada debe justificarse por volumen, riesgo y nivel de servicio. Este análisis no incluye proveedores comerciales ni precios.

## 6. Criterios para decidir

La decisión debe considerar integridad y concurrencia de secuencias, volumen esperado, control de acceso, trazabilidad, recuperación ante fallos, operación institucional, mantenimiento y compatibilidad con políticas internas. Antes de activar un proveedor deben aprobarse arquitectura, migración, respaldos, restauración, permisos, observabilidad y pruebas concurrentes.

## 7. PostgreSQL no es obligatorio para el SRI

PostgreSQL es la opción técnica recomendada para mayor integridad y concurrencia, pero no es un requisito legal ni tributario del SRI. Puede sustituirse por una alternativa institucional que cumpla las mismas garantías fiscales y operativas. Este documento no activa conexiones ni modifica datos.
