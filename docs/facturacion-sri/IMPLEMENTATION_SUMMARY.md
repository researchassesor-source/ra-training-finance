# Resumen de implementación - etapa 2

## Implementado localmente

- Configuración institucional privada desde `fiscal-service/.env.local`, ignorada por Git, con enmascarado de evidencia.
- Formulario organizado por datos de emisión, adquirente, detalles, pagos, campos adicionales, totales y acciones.
- Múltiples líneas, tarifas, descuentos, propina, múltiples pagos y validación exacta de su suma.
- Participante, adquirente y receptor de correo separados.
- Catálogo fiscal con proveedores mock, aplicación existente y futuro server-side; todo servicio queda en revisión tributaria por defecto.
- Importación JSON/CSV en memoria local con validación; toda entrada importada se fuerza a revisión tributaria e inactiva para emisión oficial.
- `FiscalReadinessService` con bloqueadores dinámicos y checklist visible.
- Firmador criptográfico XAdES-BES efímero verificable, contrato PKCS#12 y futuro gestor de secretos. El mock continúa por defecto.
- `OfficialSriGateway` con solicitudes SOAP, Base64, parsers, múltiples autorizaciones, reintentos controlados, correlación, timeout y doble bloqueo previo a red.
- Fixtures SOAP para recibida, devuelta, autorizada, no autorizada, mensajes y respuestas inválidas.
- RIDE mejorado para factura/nota de crédito, múltiples páginas, impuestos, pagos descriptivos, campos adicionales y marca local.
- Notas de crédito parciales múltiples con total original, créditos previos y saldo restante.
- Migración de catálogo/secuencial y pruebas PostgreSQL mediante `pg-mem`.
- 100 reservas concurrentes sin duplicados en memoria y PostgreSQL emulado.
- Preview de correo con destinatario, asunto, mensaje, XML, RIDE, número, clave y estado; envío, reenvío y error simulados con auditoría, sin proveedor ni salida de red.
- Evidencias visuales ficticias en 1440/900/390 y RIDE A4 validado en una sola página.

## Estado correcto

El módulo está avanzado localmente y preparado para configuración institucional, no para producción. El firmador necesita el certificado institucional; PostgreSQL real, autenticación, almacenamiento, correo y certificación SRI continúan pendientes. La conexión oficial permanece deshabilitada.

## Referencia técnica

El brief cita ficha 2.32/noviembre de 2025, pero el portal oficial observado el 24 de julio de 2026 publica 2.33/julio de 2026. La discrepancia está documentada y requiere confirmación directa antes de certificación. Los XSD locales continúan en versión 1.1.0.
