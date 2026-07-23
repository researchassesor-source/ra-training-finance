# Plan de pruebas local

## Objetivos

Demostrar la vertical ficticia sin producción: exactitud monetaria, concurrencia, clave, XSD, estados, idempotencia, controles de seguridad, API, archivos, factura, nota de crédito, interfaz y ausencia de llamadas externas.

## Automatización

| Nivel | Casos |
|---|---|
| Dominio | sumas, descuentos, IVA, redondeo, entradas inválidas, módulo 11, clave de 49 dígitos, transición inválida |
| Repositorio | 50 reservas concurrentes únicas y monotónicas, idempotencia, fuente duplicada |
| Seguridad | rechazo de producción local/conexión real, rol vendedor, traversal, payload inválido |
| Simulador | autorizado, devuelto, procesando, no autorizado, temporal, timeout, inválido y duplicado |
| Integración | factura completa, XSD, firma mock, recepción/autorización, XML, PDF, eventos, nota de crédito y exceso rechazado |
| Frontend | feature flag desactivada por defecto, administración, ruta y elegibilidad |

## Pruebas manuales

1. Iniciar API en memoria y frontend con banderas locales.
2. Confirmar los tres avisos de ambiente.
3. Abrir inscripciones ficticias y verificar controles deshabilitados.
4. Crear factura de Valeria, revisar base 100, IVA 15 y total 115.
5. Completar el flujo; revisar secuencial, clave, siete etapas y estado simulado.
6. Abrir XML, auditoría y archivos; validar descargas por API.
7. Renderizar y revisar el RIDE con marca de agua.
8. Crear nota de crédito parcial y completar su flujo.
9. Repetir inspección a 1440, 900 y 390 px; medir `scrollWidth === clientWidth` en 900/390.
10. Revisar consola, logs del servidor y destinos de red.

## Criterios de aceptación

- Todos los comandos build/lint/typecheck/test terminan en 0.
- XML de factura y nota de crédito valida contra los XSD oficiales seleccionados.
- No existe `ds:Signature`; la firma lleva advertencia mock.
- PDF comienza con `%PDF`, abre/renderiza y muestra “SIN VALIDEZ TRIBUTARIA”.
- Ninguna prueba usa datos reales, correo real, Apps Script, Sheets o endpoints SRI.
- Los cambios en `apps-script/Code.gs`, certificados, QR, avales y pagos son cero.

## Casos pendientes

PostgreSQL/Docker, firma XAdES real, ambiente SRI, autenticación productiva, correo, almacenamiento remoto, carga/recuperación, compatibilidad de navegadores y certificación tributaria.
