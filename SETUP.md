# R.A. Training Finance — Guía de Instalación

## Paso 1: Instalar Node.js (solo una vez)

1. Ir a https://nodejs.org y descargar la versión **LTS**
2. Instalar (siguiente, siguiente, finalizar)
3. Reiniciar el terminal / PowerShell

---

## Paso 2: Crear el Google Spreadsheet y Apps Script

### 2.1 Crear el Spreadsheet
1. Ir a https://sheets.google.com
2. Crear una hoja nueva → nombrarla `RATraining-Finanzas`
3. Copiar el ID de la URL: `https://docs.google.com/spreadsheets/d/**ID_AQUI**/edit`

### 2.2 Configurar el Apps Script
1. En Google Sheets: **Extensiones → Apps Script**
2. Borrar el código de ejemplo
3. Copiar y pegar todo el contenido de `apps-script/Code.gs`
4. Guardar (Ctrl+S)

### 2.3 Ejecutar el Setup Inicial
1. En Apps Script, en el menú superior seleccionar la función `setupInicial`
2. Hacer clic en **Ejecutar**
3. Aceptar los permisos cuando lo pida (es tu propia hoja)
4. Verificar en el Log que dice "Setup completado"

### 2.4 Desplegar como Web App
1. En Apps Script: **Desplegar → Nueva implementación**
2. Tipo: **Aplicación web**
3. Ejecutar como: **Yo** (tu cuenta de Google)
4. Quién tiene acceso: **Cualquier persona**
5. Hacer clic en **Desplegar**
6. Copiar la URL que aparece (empieza con `https://script.google.com/macros/s/...`)

---

## Paso 3: Configurar la app local

```bash
# Entrar a la carpeta del proyecto
cd "ra-training-finance"

# Instalar dependencias
npm install

# Crear archivo de configuración
cp .env.example .env
```

Editar `.env` y pegar la URL del Apps Script:
```
VITE_API_URL=https://script.google.com/macros/s/TU_SCRIPT_ID/exec
```

---

## Paso 4: Ejecutar localmente

```bash
npm run dev
```

Abrir http://localhost:5173/ra-training-finance

**Credenciales iniciales:**
- Usuario: `admin`
- Contraseña: `Admin2024!`

⚠️ Cambiar la contraseña del admin después del primer login desde Gestión de Usuarios.

---

## Paso 5: Publicar en GitHub Pages

### 5.1 Subir el código a GitHub
```bash
git init
git add .
git commit -m "Initial commit: R.A. Training Finance App"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/ra-training-finance.git
git push -u origin main
```

### 5.2 Configurar el Secret en GitHub
1. En GitHub: **Settings → Secrets and variables → Actions**
2. Crear secreto llamado `VITE_API_URL` con la URL del Apps Script

### 5.3 Habilitar GitHub Pages
1. **Settings → Pages**
2. Source: `gh-pages` branch
3. La app quedará en: `https://TU_USUARIO.github.io/ra-training-finance`

---

## Estructura del proyecto

```
ra-training-finance/
├── apps-script/Code.gs     → Backend (Google Apps Script)
├── src/
│   ├── components/         → Módulos de la app
│   ├── context/            → Auth state
│   ├── layout/             → Sidebar, Header
│   ├── services/api.js     → Cliente API
│   └── utils/              → Formateadores y exportadores
├── .github/workflows/      → Deploy automático
└── .env                    → URL del Apps Script (no subir a git)
```

## Roles del sistema

| Rol | Acceso |
|-----|--------|
| **admin** | Todo: dashboard, ingresos, egresos, pagos, contratos, proyecciones, reportes, usuarios |
| **usuario** | Solo reportar gastos propios y ver su historial |

## Notas importantes

- El archivo `.env` **nunca se sube a GitHub** (está en .gitignore)
- La URL del Apps Script sí se guarda como Secret en GitHub para el deploy automático
- Cada vez que hagas cambios y los subas a `main`, se redeploya automáticamente
- Máximo 10 usuarios simultáneos

## Comandos útiles

```bash
npm run dev      # Desarrollo local
npm run build    # Construir para producción
npm run preview  # Vista previa del build
```
