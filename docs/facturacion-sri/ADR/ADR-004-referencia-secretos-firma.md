# ADR-004: proteger firma mediante referencia a secretos

## Contexto
Una clave privada en Git, variables visibles o base de datos comprometería todos los comprobantes.
## Decisión
El dominio solo admite metadatos y `keyReference`; la firma real deberá ejecutarse en gestor/HSM/servicio aislado.
## Alternativas
Guardar P12 cifrado en disco o base sigue ampliando exposición y gestión de contraseñas.
## Consecuencias
La integración es más compleja, pero permite mínimo privilegio, rotación y auditoría.
## Estado
Contrato aceptado; firma real bloqueada.
