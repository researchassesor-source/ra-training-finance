# Resumen de implementación

## Qué se hizo

Se creó un servicio fiscal local aislado, modelo transaccional, migración PostgreSQL, modo memoria, cálculo decimal, secuencias, clave de acceso, factura y nota de crédito XML, validación XSD oficial, firma mock, simulador, RIDE, almacenamiento, auditoría, entrega simulada, API y documentación OpenAPI. React recibió un módulo administrativo completo detrás de banderas desactivadas por defecto y seis inscripciones ficticias para casos válidos/negativos.

## Qué funciona localmente

- Factura ficticia desde pago verificado, sin tocar la inscripción.
- Cálculos backend, validación, secuencia, clave, XML y XSD.
- Flujo paso a paso o completo, eventos, transmisiones y reintentos.
- Autorización simulada, XML autorizado simulado y RIDE descargable.
- Nota de crédito parcial enlazada a factura autorizada.
- Filtros, estados, responsive y acceso administrativo local.
- Persistencia en memoria demostrada; adaptador/migración PostgreSQL preparados.

## Qué es simulado

Emisor y participantes, firma, respuestas del SRI, número/fecha de autorización, correo y datos del RIDE. La palabra “simulado” y la ausencia de validez aparecen en interfaz, XML, PDF y respuestas.

## Qué falta

Datos institucionales, criterio contable, firma XAdES real, gestor de secretos, pruebas PostgreSQL, autenticación productiva, almacenamiento, correo, monitoreo, respaldo, pruebas/certificación con SRI y aprobación legal/tributaria.

## Cómo ejecutar y probar

Siga `LOCAL_SETUP.md`. En resumen: iniciar `fiscal-service` con almacenamiento `inmemory`, iniciar Vite con las tres variables locales y abrir `/facturacion`. Ejecute además los comandos de `TEST_REPORT.md`.

## Riesgos

El mock puede ser malinterpretado si se ocultan los banners; por eso producción rechaza el modo local y el gateway oficial está deshabilitado. La tarifa de ejemplo no debe asumirse aplicable. Memoria pierde datos al reiniciar. El adaptador PostgreSQL todavía no se ejecutó en esta máquina. El frontend conserva vulnerabilidades heredadas que requieren tarea separada.

## Próxima fase

Obtener y aprobar `PENDING_BUSINESS_DATA.md`; ejecutar PostgreSQL en CI/local; seleccionar custodia/firmador; validar XML/RIDE con contador; implementar autenticación y almacenamiento; luego solicitar ambiente de pruebas y certificar sin reutilizar el mock como código productivo.
