# Arquitectura fiscal local

```text
React administrativo (feature flag + sesión admin)
  -> Fiscal API localhost
    -> FiscalDocumentService
      -> dominio decimal / estados / clave / secuencias
      -> OperationalServicesProvider + FiscalCatalogService
      -> FiscalReadinessService
      -> XML builders + XSD 1.1.0
      -> XmlSigner (mock | XAdES efímero | PKCS#12 futuro)
      -> SriGateway (mock | oficial doblemente bloqueado)
      -> RIDE + almacenamiento + preview de correo
      -> Repository (inmemory | PostgreSQL)
```

## Límites

- El frontend no maneja la llave privada ni llama al SRI.
- `fiscal-service` escucha únicamente en `127.0.0.1` durante esta etapa.
- Apps Script, Google Sheets, proxy y Vercel quedan fuera del flujo fiscal local.
- La configuración privada se carga desde un archivo ignorado por Git.
- La conexión oficial exige dos banderas; la configuración local rechaza que cualquiera se active.

## Adaptadores

| Puerto | Local | Preparado |
|---|---|---|
| Repositorio | memoria / `pg-mem` | PostgreSQL real |
| Servicios | `MockOperationalServicesProvider` | aplicación existente / server-side |
| Firma | mock y XAdES efímero | PKCS#12 / gestor de secretos |
| SRI | simulador | SOAP oficial bloqueado |
| Correo | preview en archivo | proveedor privado |

Los comprobantes son inmutables después de autorización simulada; las correcciones se representan con notas de crédito relacionadas.
