# Evidencia visual v3

Fecha de validación: 2026-07-24.

Todas las capturas fueron generadas contra un servicio local temporal en memoria, con emisor, participantes, identificaciones, direcciones y correos ficticios. No se consultó Google Sheets, Apps Script, Vercel, correo real ni SRI.

| Archivo | Validación |
| --- | --- |
| `ui-resumen-1440x900.png` | Resumen separado, métricas, bloqueadores, documentos recientes y acciones rápidas. |
| `ui-documentos-filtros-1440x900.png` | Historial completo, filtros en dos filas y documento ficticio. |
| `ui-configuracion-fiscal-900x900.png` | Perfil enmascarado, firma de demostración y conexión deshabilitada. |
| `ui-numeracion-comprobantes-900x900.png` | Persistencia pendiente y numeración limitada a validación de prueba. |
| `ui-checklist-preparacion-900x900.png` | Grupos obligatorios para certificación y antes de producción. |
| `ui-checklist-infraestructura-900x900.png` | Infraestructura recomendada separada de requisitos tributarios. |
| `ui-documentos-mobile-390x844.png` | Navegación y entrada al historial en móvil. |
| `ui-filtros-mobile-390x844.png` | Búsqueda, estado, tipo y fechas apilados sin desplazamiento horizontal. |

Resultados observados:

- 1440 px: `scrollWidth = innerWidth = 1440`.
- 900 px: `mainScrollWidth = mainClientWidth = 895`.
- 390 px: `mainScrollWidth = mainClientWidth = 386`.
- Consola del navegador: cero errores y cero advertencias.
- Filtro “Emisión desde” probado con fecha ficticia y botón “Limpiar filtros” verificado.
- Se creó un único borrador ficticio en memoria para comprobar la lista; se descartó al detener el servicio temporal.
