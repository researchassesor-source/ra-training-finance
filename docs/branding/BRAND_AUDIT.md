# Auditoría de identidad de R.A. Training

Fecha de revisión: 27 de julio de 2026
Alcance: interfaz de Finance, sin cambios en el sitio institucional ni en datos legales.

## Fuentes revisadas

1. `logo.png` entregado por gerencia: imagen PNG de 272 × 293 px, con transparencia, blanco y coral/naranja. Es la fuente principal para el símbolo usado en la aplicación.
2. Sitio público `https://ra-training.com/`: usa de forma consistente la denominación visible **R.A Training**, presenta certificados verificables y publica una identidad azul/naranja.
3. CSS calculado del sitio institucional: contiene variables explícitas como `--navy: #114899`, `--navy-dark: #0D3673`, `--amber: #F1871A`, `--primarybtnbg: #E46113`, `--ink: #114899` y `--nv-text-color: #111827`.
4. `Mascota.png` entregada por gerencia: imagen de 268 × 378 px, sin canal transparente; conserva un fondo negro de origen.
5. Repositorio de Finance: antes de esta fase utilizaba una escala índigo genérica (`#4338CA` y variantes) y el texto “Finanzas”.
6. Certificado y enlace de Canva entregados: confirman el uso de azul marino, naranja y la firma visual “research assessor & training”.

## Decisión

- Marca matriz: **R.A. Training**.
- Aplicación: **Finance**.
- Nombre visible: **R.A. Training Finance**.
- Subtítulo: **Sistema de gestión financiera y certificación**.
- Azul institucional de interfaz: `#114899`, con `#0D3673` para superficies oscuras.
- Naranja institucional: `#F1871A`, reservado a acentos y superficies con texto oscuro.
- El símbolo adjunto se usa en login, navegación y favicon sin recolorearlo ni deformarlo.
- La mascota se usa solamente en login/bienvenida; no se incorpora en certificados ni documentos fiscales.

## Limitaciones y pendientes

- El logo adjunto es de resolución limitada y no es un archivo vectorial. Se mantiene el original y se generan derivados rasterizados prudentes; debe reemplazarse por un SVG oficial cuando la institución lo entregue.
- La mascota tiene fondo negro incorporado. No se eliminó ni se reconstruyó para evitar modificar su identidad sin aprobación.
- El sitio alterna `R.A Training`, `RA-Training` y `R.A. Training`; la aplicación adopta la puntuación ya utilizada históricamente en Finance.
- No se modificaron razón social, RUC, nombres legales, datos del aval ni textos históricos.

## Archivos preservados

Los originales recibidos se conservan sin cambios en `docs/branding/assets/`. Los derivados optimizados de interfaz viven en `src/assets/brand/` y `public/`.
