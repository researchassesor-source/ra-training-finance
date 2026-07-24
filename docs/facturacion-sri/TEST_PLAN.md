# Plan de pruebas

## Automatizadas

- UI/feature flags: admin, vendedor, producción, host externo, secciones A-G y botón oficial bloqueado.
- Dominio: varias líneas/tarifas, descuento, redondeo, pagos, campos, comprador/participante y readiness.
- Firma: XAdES efímero, verificación, alteración, PKCS#12, contraseña, archivo, extensión, vencimiento y secreto.
- SRI: construcción SOAP, Base64, recibida, devuelta, autorizada, no autorizada, procesamiento, mensajes, inválida y bloqueo de red.
- PostgreSQL emulado: migraciones, restricciones, transacciones, idempotencia, factura, auditoría y 100 reservas.
- Archivos: XML/RIDE por documento y path traversal.
- Nota de crédito: varias parciales y límite por saldo.

## Visuales

Probar Resumen, Documentos de prueba, Inscripciones de prueba, Catálogo fiscal, Configuración fiscal, Nueva factura, detalle, pagos, XML, RIDE, nota, auditoría y preparación en 1440, 900 y 390 px. Cero scroll horizontal en tareas comunes, errores nuevos de consola o llamadas externas.

Las evidencias deben usar perfil ficticio o datos enmascarados.
