# Guía del catálogo fiscal

Cada Servicio operativo se mapea a ID, códigos, nombre, descripción de factura, precio, indicador de impuesto incluido, impuesto, porcentaje, tarifa, exento/no objeto, categoría, activo, revisión, fecha y usuario validador.

Proveedores:

- `MockOperationalServicesProvider`: solo datos ficticios.
- `ExistingApplicationServicesProvider`: reutilizará el cliente existente únicamente con `VITE_FISCAL_USE_EXISTING_APP_DATA=true`; permanece false.
- `FutureServerSideServicesProvider`: contrato futuro sin conexión.

Toda entrada comienza `REQUIRES_TAX_REVIEW`, inactiva para facturación oficial. No se asigna IVA 15 % automáticamente. La interfaz importa archivos JSON o CSV solo en memoria del navegador; al importarlos descarta cualquier intento de marcar una fila como validada o activa. La plantilla CSV está en `templates/catalogo-fiscal-servicios.csv`. JSON/CSV no deben contener datos personales ni secretos.
