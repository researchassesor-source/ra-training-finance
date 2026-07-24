# ADR-008: separar XML autorizado y RIDE

## Contexto
El XML es el artefacto estructurado/autorizado; el RIDE es su representación legible.
## Decisión
Guardar XML sin firma, firmado/mock, autorizado/simulado y PDF en rutas distintas con MIME propio.
## Alternativas
Regenerar siempre o guardar un único archivo dificulta integridad y auditoría.
## Consecuencias
Más almacenamiento y política de conservación, con descargas y verificaciones claras.
## Estado
Aceptado e implementado localmente.
