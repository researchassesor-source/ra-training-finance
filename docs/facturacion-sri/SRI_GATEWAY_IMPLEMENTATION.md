# Implementación del gateway SRI

`OfficialSriGateway` incluye:

- endpoints de recepción/autorización de certificación y producción extraídos de la ficha oficial archivada;
- solicitud SOAP de `validarComprobante` con XML en Base64;
- consulta SOAP por clave de acceso;
- parsers sin prefijos de namespace, mensajes múltiples y selección segura entre múltiples autorizaciones;
- normalización de recibida, devuelta, procesamiento, autorizada, no autorizada e inválida;
- timeout, respuesta temporal, reintentos limitados para HTTP 429/5xx, correlation ID estable e idempotencia de aplicación.

Antes de `fetch` se exigen simultáneamente `FISCAL_SRI_REAL_CONNECTION_ENABLED=true` y `FISCAL_SRI_CONFIRM_REAL_CALL=true`. La configuración local rechaza ambas, por lo que no ocurre DNS ni conexión. Los reintentos automatizados se comprobaron únicamente con un `fetch` inyectado y respuestas locales. Certificación/producción requieren confirmación de ficha/WSDL/endpoints, credenciales, certificado, observabilidad y pruebas formales.
