# Fuentes oficiales consultadas

Fecha de consulta: **24 de julio de 2026**. Para requisitos tributarios se usaron únicamente páginas y archivos publicados por el Servicio de Rentas Internas del Ecuador (SRI).

## Control de versión y discrepancia

El brief de esta etapa identifica como referencia pública la ficha **2.32, actualizada a noviembre de 2025**. Sin embargo, la consulta directa del portal oficial realizada el 24 de julio de 2026 muestra la ficha **2.33, actualizada a julio de 2026**, y enlaza el PDF conservado en este repositorio. Por seguridad:

- no se elimina ni altera el recurso 2.33;
- se conserva procedencia y SHA-256;
- no se confunde la versión de la ficha con la versión de los XSD;
- la implementación local continúa usando factura XSD 1.1.0 y nota de crédito XSD 1.1.0;
- la discrepancia **requiere verificación directa con el SRI** inmediatamente antes de certificación.

## Inventario

| Recurso | Observación oficial al 2026-07-24 | Uso local | Enlace |
|---|---|---|---|
| Facturación electrónica | Portal técnico y descargas oficiales | Fuente primaria | https://www.sri.gob.ec/facturacion-electronica |
| Facturador SRI | Perfil/firma, productos/servicios, emisión y correo | Referencia funcional, sin copiar código o diseño | https://www.sri.gob.ec/facturador-sri |
| Ficha técnica offline 2.33 | El portal la muestra actualizada a julio de 2026 | Referencia archivada; discrepancia frente al brief 2.32 | URL y hash en `manifest.json` |
| XML/XSD Factura | Paquete oficial con 1.0.0, 1.1.0, 2.0.0 y 2.1.0 | Se valida con 1.1.0 | URL y hash en `manifest.json` |
| XML/XSD Nota de Crédito | Paquete oficial con 1.0.0 y 1.1.0 | Se valida con 1.1.0 | URL y hash en `manifest.json` |
| Guía de anulación | Actualizada a marzo de 2025 | Análisis, sin integración oficial | URL y hash en `manifest.json` |

## Reglas verificadas

- Clave de acceso de 49 dígitos y módulo 11.
- Recepción offline: `RECIBIDA` o `DEVUELTA`; autorización asíncrona con autorizada, no autorizada y procesamiento.
- Endpoints de certificación y producción extraídos de la ficha archivada; el código los conserva, pero la red está doblemente bloqueada.
- Formas de pago 01, 15, 16, 17, 18, 19, 20 y 21 con descripciones visibles.
- El portal oficial exige firma electrónica y autorización antes de operar en producción.

Los hashes completos están en `fiscal-service/resources/sri/manifest.json`. Ningún recurso ni prueba acredita certificación.
