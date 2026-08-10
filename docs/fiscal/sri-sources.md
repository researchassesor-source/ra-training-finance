# Fuentes oficiales SRI verificadas — módulo fiscal

Verificación en vivo realizada el **10/08/2026**, por instrucción explícita del usuario
(no se implementó desde memoria ni se asumió una versión). Copias oficiales descargadas
y conservadas en este repo bajo `docs/fiscal/sri-official/` como evidencia reproducible.

## 1. Ficha Técnica

| Campo | Valor |
|---|---|
| Documento | Ficha Técnica de Comprobantes Electrónicos Esquema Off-line |
| Versión | **2.34** (actualizada a julio de 2026) |
| URL oficial | `https://www.sri.gob.ec/o/sri-portlet-biblioteca-alfresco-internet/descargar/f8d9bb36-5632-4f96-b463-b9265b55338c/FICHA%20TE%CC%81CNICA%20COMPROBANTES%20ELECTRO%CC%81NICOS%20ESQUEMA%20OFFLINE%20Versio%CC%81n%202.34.pdf` |
| Archivo conservado | `docs/fiscal/sri-official/ficha_tecnica_offline_2.34.pdf` |
| SHA-256 | `7333aebfbdf2cb3ba83f9fc67a7a7f0346ca59506480a260cc42f96dbdfc13c9` |
| Fecha de consulta | 2026-08-10 |

**Importante — no confundir versión de ficha con versión de XSD** (aclaración explícita
del usuario): la ficha 2.34 es el documento normativo/técnico general. El XSD de Factura
se versiona por separado (ver abajo). No existe un "XSD factura 2.34".

## 2. Paquete XSD/XML de Factura

| Campo | Valor |
|---|---|
| Documento | Esquemas XSD y XML — Tipo de documento Factura |
| URL oficial | `https://www.sri.gob.ec/o/sri-portlet-biblioteca-alfresco-internet/descargar/05546998-6f29-4870-be3b-62650f312a6c/XML%20y%20XSD%20Factura.zip` |
| Archivo conservado | `docs/fiscal/sri-official/XML_y_XSD_Factura.zip` |
| SHA-256 (zip completo) | `ba1ff0c4e329fe759c3f88dc75f2975780b315b6eb3d0069071b77c1f26fec03` |
| Versiones publicadas en el zip | 1.0.0, 1.1.0, 2.0.0, 2.1.0 |
| Fecha de consulta | 2026-08-10 |

### Versión elegida: **2.1.0**

| Campo | Valor |
|---|---|
| Archivo | `factura_V2.1.0.xsd` |
| Conservado en | `docs/fiscal/sri-official/schemas/factura_V2.1.0.xsd` |
| SHA-256 | `5f2c37bc1a58bb40e8bbbc366cabe05d5dc199598aeea1561137370f8bd4eace` |
| Ejemplo oficial | `docs/fiscal/sri-official/schemas/factura_V2.1.0_ejemplo_oficial.xml` (instancia de referencia del propio SRI, no es una factura real) |

**Razón técnica de elegir 2.1.0 (no 2.0.0):** se comparó `factura_V2.0.0.xsd` contra
`factura_V2.1.0.xsd` con `diff`. La diferencia relevante para nosotros: en 2.0.0 los
campos `<cantidad>`, `<precioUnitario>` y `<precioSinSubsidio>` solo admiten 2 decimales
(`totalDigits=14, fractionDigits=2`); en 2.1.0 admiten **6 decimales**
(`totalDigits=18, fractionDigits=6`). Esto coincide exactamente con la regla de negocio
de "cantidad y precio con decimales permitidos" (sección 43 del prompt maestro) y con
cómo ya está construido `lib/fiscal/money.js` (`toQuantityMicros`, precisión de 6
decimales). 2.1.0 es además estrictamente superset de 2.0.0 (agrega el bloque opcional
`retenciones`, que no usamos). Esto coincide con lo que ya indicaba la Ficha Maestra v2.0
del usuario ("Versión XML objetivo: Factura 2.1.0"), pero aquí queda verificado contra el
archivo XSD real, no solo citado de un documento de referencia.

## 3. Pendiente para fases posteriores (no bloquea Fase 3)

- **Endpoints SOAP de recepción/autorización** (Pruebas y Producción): la ficha técnica
  descargada es un PDF de 142 páginas mayormente compuesto de imágenes (no es texto
  plano extraíble de forma confiable). Los endpoints usados como referencia hasta ahora
  vienen de los documentos internos del usuario (Prompt Maestro §8 / Ficha Maestra §5).
  **Antes de construir el cliente SOAP (Fase 5) hay que re-verificar esas URLs
  directamente contra la ficha 2.34 o la documentación de servicios web del SRI**, no
  asumir que no cambiaron desde el documento interno.
- **Anexo 26 (RUC del proveedor de software)**: mencionado en el Prompt Maestro §8;
  requiere determinar si R.A. Training Finance es "software propio" o "de un tercero" y
  la fecha de vigencia de la resolución aplicable. No verificado todavía contra la fuente
  oficial — pendiente antes de Producción (ya bloqueado por diseño:
  `SRI_SOFTWARE_PROVIDER_MODE` sin definir bloquea la primera factura productiva).

## 4. Validación de XML contra XSD

`lib/fiscal/facturaXml.test.js` valida el XML generado con `xmllint --noout --schema`
(libxml2, motor de referencia) contra la copia oficial conservada en este repo. Es una
validación de **desarrollo/CI**, no la validación en el runtime de producción — qué
mecanismo de validación corre dentro de la función serverless de Vercel antes de firmar
(Fase 4/5) todavía no está decidido (no se asumió una librería nueva sin revisar
licencia/soporte, regla 34 del prompt maestro).
