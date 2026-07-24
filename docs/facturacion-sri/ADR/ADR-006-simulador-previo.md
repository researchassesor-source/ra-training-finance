# ADR-006: simulador antes de certificación

## Contexto
No hay datos, certificado ni autorización para interactuar con el SRI.
## Decisión
Probar el flujo con un gateway determinista local y dejar el oficial deshabilitado.
## Alternativas
Conectar prematuramente al ambiente oficial o limitarse a mocks de interfaz sin dominio.
## Consecuencias
Se cubren errores y UX sin riesgo; compatibilidad real seguirá requiriendo certificación.
## Estado
Aceptado e implementado.
