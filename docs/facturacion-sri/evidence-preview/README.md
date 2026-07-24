# Evidencias — demostración fiscal de Preview

Fecha de validación: 24 de julio de 2026.

## Entorno

Se levantó únicamente el frontend Vite con las cuatro variables de Preview. `fiscal-service` permaneció apagado y no se configuró un URL fiscal. La sesión utilizada fue la sesión normal existente de administrador; no se creó autenticación automática.

## Recorrido validado

1. Menú Facturación, banner triple y resumen con semilla ficticia.
2. Lista, filtros y adaptación de documentos a tarjetas móviles.
3. Seis inscripciones ficticias con elegibilidad diferenciada.
4. Creación de una factura desde una inscripción elegible.
5. Flujo completo simulado, XML, auditoría, transmisiones y descargas XML/RIDE.
6. Nota de crédito con referencia, saldo propio, secuencial independiente, XML y RIDE.
7. Configuración ficticia, información técnica y botón de reinicio aislado.
8. Recarga con persistencia; luego reinicio de la demo y recuperación de los dos documentos de semilla sin cerrar sesión.

## Resultados visuales

- 1440 × 900: diseño completo sin desplazamiento horizontal.
- 900 × 900: navegación compacta, dos columnas de indicadores y tarjetas de documentos; ancho de documento igual a ancho de viewport.
- 390 × 844: navegación y documentos móviles; tabla de escritorio oculta, tarjetas visibles y ancho de documento igual a 390 px.
- Consola: cero errores o advertencias nuevos durante el recorrido.
- Tráfico fiscal: el adaptador de Preview no ejecuta `fetch`; la prueba automatizada lo verifica y el recorrido funcionó con el puerto 4010 apagado. No existe ruta de código de Preview hacia SRI o Apps Script fiscal.

## Capturas

- `01-preview-resumen.png`
- `02-preview-documentos.png`
- `03-preview-inscripciones.png`
- `04-preview-factura.png`
- `05-preview-factura-procesada.png`
- `06-preview-nota-credito.png`
- `07-preview-configuracion.png`
- `08-preview-movil.png`

Todas las capturas contienen solo personas, identificaciones, correos, direcciones, números y documentos ficticios.
