# Modelo de dominio

- `IssuerConfig`: identidad, direcciones, contacto, establecimiento/punto y condición contable.
- `FiscalCustomer`: adquirente; no se confunde con participante ni receptor de correo.
- `FiscalDocument`: factura o nota de crédito, estado, numeración, totales, archivos y relación de origen.
- `FiscalDocumentItem`: código, cantidad, precio, descuento y estado de clasificación tributaria.
- `FiscalTaxLine`: código, porcentaje, tarifa, base y valor.
- `FiscalPaymentMethod`: código/descripcion, valor, plazo y unidad.
- `FiscalAdditionalField`: nombre/valor sin secretos ni etiquetas XML.
- `FiscalCatalogItem`: mapeo de Servicio operativo a dato fiscal; estado inicial `REQUIRES_TAX_REVIEW`.
- `CreditNoteReference` y `creditBalance`: factura original, motivo, créditos previos y saldo.
- `FiscalEvent` y `SriTransmission`: auditoría y trazabilidad.
- `Sequence`: reserva atómica por documento, establecimiento y punto.

## Invariantes

- Los cálculos se hacen con `Decimal`; pagos = total exacto.
- Una inscripción genera como máximo una factura, pero una factura puede tener varias notas parciales.
- Una nota no supera el saldo modificable.
- Un secuencial no retrocede ni se reutiliza.
- Un servicio sin clasificación validada bloquea el flujo oficial.
- La autorización local nunca se presenta como autorización tributaria.
