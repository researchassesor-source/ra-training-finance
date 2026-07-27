# Paleta corporativa

La paleta se deriva del CSS calculado del sitio institucional y se contrasta con los recursos entregados. Los colores marcados como institucionales tienen una fuente explícita; los semánticos conservan convenciones accesibles de interfaz.

| Token | HEX | RGB | Función | Origen | Contraste principal |
|---|---:|---:|---|---|---:|
| `brand-primary` | `#114899` | 17, 72, 153 | Botones, enlaces, foco | CSS `--navy` / `--ink` | 8.71:1 sobre blanco |
| `brand-primary-hover` | `#0D3673` | 13, 54, 115 | Hover y sidebar | CSS `--navy-dark` | 11.72:1 sobre blanco |
| `brand-secondary` | `#F1871A` | 241, 135, 26 | Acentos corporativos | CSS `--amber` / `--orange` | 6.94:1 con texto `#111827` |
| `brand-accent` | `#E46113` | 228, 97, 19 | Acento intenso | CSS `--primarybtnbg` | 3.49:1 con blanco; no usar en texto normal blanco |
| `brand-background` | `#F8FAFC` | 248, 250, 252 | Fondo de aplicación | Derivado neutro de interfaz | 17.24:1 con `#111827` |
| `brand-surface` | `#FFFFFF` | 255, 255, 255 | Tarjetas y modales | Sitio `--bg` / `--nv-site-bg` | 17.74:1 con `#111827` |
| `brand-text` | `#111827` | 17, 24, 39 | Texto principal | CSS `--nv-text-color` | 17.74:1 sobre blanco |
| `brand-text-muted` | `#52606D` | 82, 96, 109 | Texto secundario | Color calculado frecuente | 6.46:1 sobre blanco |
| `brand-border` | `#E6EAF0` | 230, 234, 240 | Bordes y divisores | CSS `--line` | Uso no textual |
| `brand-success` | `#16A34A` | 22, 163, 74 | Éxito | Semántico | 3.30:1 sobre blanco; texto oscuro en fondos suaves |
| `brand-warning` | `#D97706` | 217, 119, 6 | Advertencia | Semántico | 3.19:1 sobre blanco; texto oscuro en fondos suaves |
| `brand-danger` | `#DC2626` | 220, 38, 38 | Error/peligro | Semántico | 4.83:1 sobre blanco |
| `brand-info` | `#2563EB` | 37, 99, 235 | Información | Semántico | 5.17:1 sobre blanco |

## Escalas

La escala `primary-50` a `primary-950` se centra en `#114899`; la escala `secondary-50` a `secondary-950` se centra en `#F1871A`. Ambas están declaradas en `tailwind.config.js` y expuestas también como variables CSS.

## Reglas de accesibilidad

- Usar blanco sobre azul primario u oscuro.
- Usar texto azul oscuro o `#111827` sobre naranja; evitar blanco pequeño sobre naranja.
- Los estados de éxito, advertencia y error siempre incluyen texto o icono, no solo color.
- El foco visible utiliza azul primario con halo claro.
