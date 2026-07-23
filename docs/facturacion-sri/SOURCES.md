# Fuentes oficiales consultadas

Fecha de consulta: **23 de julio de 2026**. Para requisitos tributarios se usaron únicamente fuentes del Servicio de Rentas Internas del Ecuador. El W3C se usa solo como procedencia técnica de la dependencia XMLDSig importada por los XSD.

| Nombre | Organismo | Versión | Actualización | Propósito | Enlace oficial | Archivo local |
|---|---|---:|---:|---|---|---|
| Facturación electrónica | SRI | Página vigente | Consultada 2026-07-23 | Portal, ambientes, comprobantes y descargas oficiales | https://www.sri.gob.ec/facturacion-electronica | — |
| Ficha técnica de comprobantes electrónicos, esquema offline | SRI | 2.33 | julio de 2026; control de versión 2026-07-13 | Clave de acceso, tablas, XAdES, transmisión, estados y límites | https://www.sri.gob.ec/o/sri-portlet-biblioteca-alfresco-internet/descargar/5a547488-80f3-4966-a2a4-841f2e951986/FICHA%20TE%CC%81CNICA%20COMPROBANTES%20ELECTRO%CC%81NICOS%20ESQUEMA%20OFFLINE%20Versio%CC%81n%202.33.pdf | `original-downloads/Ficha-Tecnica-Comprobantes-Electronicos-Offline-v2.33.pdf` |
| XML y XSD Factura | SRI | XSD 1.0.0, 1.1.0, 2.0.0, 2.1.0 | Publicación vigente al 2026-07-23 | Esquemas y muestras oficiales de factura | https://www.sri.gob.ec/o/sri-portlet-biblioteca-alfresco-internet/descargar/05546998-6f29-4870-be3b-62650f312a6c/XML%20y%20XSD%20Factura.zip | `original-downloads/XML-y-XSD-Factura.zip`, `xsd/`, `samples/` |
| XML y XSD Nota de Crédito | SRI | XSD 1.0.0, 1.1.0 | Publicación vigente al 2026-07-23 | Esquemas y muestras oficiales de nota de crédito | https://www.sri.gob.ec/o/sri-portlet-biblioteca-alfresco-internet/descargar/dfc944cd-5f18-4433-a626-3cc64cfc4549/XML%20y%20XSD%20Nota%20de%20Cr%c3%a9dito.zip | `original-downloads/XML-y-XSD-Nota-Credito.zip`, `xsd/`, `samples/` |
| Guía para contribuyentes de anulación de comprobantes electrónicos | SRI | marzo de 2025 | marzo de 2025 | Estados y proceso de anulación; solo análisis, no implementación | https://www.sri.gob.ec/o/sri-portlet-biblioteca-alfresco-internet/descargar/c97242e6-c271-4eb8-8f6a-f687313118ba/Guia%20para%20contribuyentes%20de%20anulaci%C3%B3n%20de%20comprobantes%20electr%C3%B3nicos.pdf | `original-downloads/Guia-anulacion-comprobantes-electronicos-marzo-2025.pdf` |
| XML Signature Schema | W3C | XMLDSig Core | Esquema publicado por W3C | Dependencia técnica importada por los XSD, no fuente tributaria | https://www.w3.org/TR/xmldsig-core/xmldsig-core-schema.xsd | `xsd/xmldsig-core-schema.xsd` |

## Reglas confirmadas y alcance

- La clave tiene 49 dígitos: fecha `ddMMyyyy` (8), tipo (2), RUC (13), ambiente (1), serie (6), secuencial (9), código numérico (8), tipo de emisión (1) y dígito módulo 11 (1).
- La ficha 2.33 documenta firma XAdES-BES 1.3.2 y el esquema offline. La prueba no implementa esa firma: solo conserva su contrato futuro.
- Recepción usa estados como `RECIBIDA`/`DEVUELTA`; autorización es asíncrona y contempla procesamiento, autorizado y no autorizado.
- La ficha establece límites y reglas de transmisión, incluido el tamaño individual máximo de 320 KB y emisión/transmisión dentro del plazo documentado de 24 horas. Son controles pendientes de certificación.
- Los ambientes de prueba no confieren validez tributaria; producción requiere autorización.
- La tabla 17 identifica códigos de IVA y la tabla 24 códigos de formas de pago. El catálogo se muestra como referencia; su aplicabilidad necesita decisión contable.
- La guía de anulación se documentó, pero el proceso oficial de anulación no está implementado.

Las direcciones de servicios web de recepción y autorización de pruebas/producción aparecen solo en esta documentación técnica. No fueron configuradas ni llamadas por el código. La integridad exacta de todos los archivos está en `fiscal-service/resources/sri/manifest.json`.
