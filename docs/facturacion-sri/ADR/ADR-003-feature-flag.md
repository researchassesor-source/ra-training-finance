# ADR-003: feature flag

## Contexto
El módulo no debe aparecer ni afectar producción antes de certificación.
## Decisión
Controlar ruta, menú e integración mínima con `VITE_ENABLE_SRI_BILLING`; valor predeterminado `false`.
## Alternativas
Mantener código en otra aplicación o exponer siempre una pantalla deshabilitada.
## Consecuencias
Permite validar localmente y conservar el comportamiento previo; la bandera no sustituye autorización del servidor.
## Estado
Aceptado e implementado.
