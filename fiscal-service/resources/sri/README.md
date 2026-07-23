# Recursos técnicos oficiales

Consultados y descargados el 23 de julio de 2026 desde el portal oficial del Servicio de Rentas Internas (SRI) del Ecuador. Los archivos del SRI se conservan sin modificaciones. `xmldsig-core-schema.xsd` procede del W3C y es la dependencia importada por los XSD del SRI.

## Organización

- `original-downloads/`: paquetes ZIP y guías PDF tal como se descargaron.
- `xsd/`: esquemas extraídos de los paquetes oficiales; el servicio usa las versiones 1.1.0 para factura y nota de crédito.
- `samples/`: XML de ejemplo incluidos por el SRI.
- `manifest.json`: procedencia, URL y SHA-256 reproducible de cada archivo.

## Verificación

Desde la raíz del repositorio:

```powershell
Get-ChildItem .\fiscal-service\resources\sri -Recurse -File |
  Where-Object Name -NotIn @('README.md', 'manifest.json') |
  Get-FileHash -Algorithm SHA256
```

Un hash distinto al manifiesto implica que el archivo debe descartarse y descargarse nuevamente desde su fuente. Estos recursos no acreditan certificación ni habilitan una conexión real con el SRI.
