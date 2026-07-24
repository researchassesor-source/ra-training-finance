# ADR-007: no eliminar comprobantes fiscales

## Contexto
Eliminar documentos rompe trazabilidad, secuencias y evidencia de corrección.
## Decisión
No exponer `DELETE`; usar estados, eventos y notas de crédito/anulación futura.
## Alternativas
Borrado lógico genérico u operación destructiva administrativa.
## Consecuencias
Mayor conservación; políticas legales y de privacidad deberán definir accesos y plazos.
## Estado
Aceptado e implementado en la API.
