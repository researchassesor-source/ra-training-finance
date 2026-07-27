# Informe de pruebas: identidad, certificados y permisos

Fecha: 27 de julio de 2026

Entorno local aislado en la rama `feature/identidad-certificados-permisos`, creada desde `b8d1ec4`. No se usaron datos reales ni se enviaron comunicaciones.

## Automatización

- Vitest: 6 archivos, 24 pruebas aprobadas.
- Cobertura funcional: identidad, assets, metadatos, permisos por rol, visibilidad real en Inscripciones, protección estática de Apps Script, plantilla, dos firmas y QR únicos.
- Build de Vite: aprobado tras los cambios de identidad y seguridad.
- Sintaxis de `apps-script/Code.gs`: aprobada mediante compilación de JavaScript local.
- PDF real de una página generado con nombre y curso largos; Poppler confirmó formato horizontal de 1080 × 720 pt y 397.280 bytes.
- Render de impresión simulado a 300 dpi: 4500 × 3001 px; el QR siguió decodificando a la URL ficticia esperada.
- Extracción de texto confirmó nombre, identificación, curso, duración, fechas, modalidad y fecha de emisión.
- Lint: no disponible en el proyecto.
- Typecheck: no disponible; el proyecto no utiliza TypeScript.

## Roles probados con mocks

- Administrador: ve emisión/descarga/QR/entrega/auditoría.
- Vendedor: conserva el estado resumido y no ve acciones oficiales.
- Aval y usuario normal: la matriz de capacidades devuelve todos los permisos administrativos en falso.
- Público: solo usa `/verificar/:id`; la respuesta no contiene montos, pagos, RUC, teléfono ni usuarios internos.

## Diseño y responsive

- Login validado sin desplazamiento horizontal en 1440, 1280, 900, 768, 390 y 360 px.
- Todos los botones del login tienen nombre accesible y los dos campos conservan su `label`.
- Se habilitaron los indicadores de compatibilidad futura de React Router para eliminar sus advertencias de consola.
- Una sesión nueva del navegador local quedó sin errores ni advertencias de consola; el foco visible usa contorno sólido.
- Las capturas usan datos ficticios o pantallas sin datos de negocio.

## Limitaciones

- No se hicieron pruebas contra Apps Script ni Google Sheets de producción.
- No se enviaron correos ni WhatsApp reales.
- No se implementaron anulación o reemisión porque requieren versionado histórico.
- Se actualizaron localmente `jsPDF` 4.2.1, `jspdf-autotable` 5.0.8 y `react-router-dom` 7.18.1. Las pruebas, el build, el login y la generación/renderización del PDF siguieron aprobados.
- `npm audit --omit=dev` conserva dos alertas altas de React Router asociadas a RSC; Finance es una SPA de Vite y no utiliza RSC. El audit completo conserva además alertas del servidor de desarrollo de Vite. No se forzó el salto a Vite 8.
- El build mantiene una advertencia no bloqueante por el tamaño del chunk principal; se recomienda dividir módulos pesados de exportación en una fase posterior.
