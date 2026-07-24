# ADR-009: adaptadores para SRI, almacenamiento y correo

## Contexto
Proveedores, protocolos y ambientes cambiarán; el dominio no debe depender de ellos.
## Decisión
Definir puertos para gateway SRI, storage, firma y mailer, con implementaciones locales seguras.
## Alternativas
Llamadas directas dentro del servicio de aplicación reducen testabilidad y aumentan acoplamiento.
## Consecuencias
Más interfaces, pero sustitución, pruebas y bloqueo explícito de producción más simples.
## Estado
Aceptado; adaptadores productivos no implementados.
