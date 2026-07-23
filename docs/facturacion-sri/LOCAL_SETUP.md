# Guía local paso a paso

Todos los comandos parten de:

```powershell
cd "C:\Users\David\Desktop\R.A. Training\Repositorio GitHub\ra-training-finance"
```

## Opción recomendada ahora: memoria, sin Docker

Abra PowerShell 1:

```powershell
cd .\fiscal-service
npm install
Copy-Item .env.example .env -ErrorAction SilentlyContinue
$env:NODE_ENV="development"
$env:FISCAL_LOCAL_DEV_MODE="true"
$env:FISCAL_STORAGE="inmemory"
$env:FISCAL_SRI_REAL_CONNECTION_ENABLED="false"
$env:FISCAL_HOST="127.0.0.1"
$env:FISCAL_PORT="4010"
npm run dev
```

Abra PowerShell 2:

```powershell
cd "C:\Users\David\Desktop\R.A. Training\Repositorio GitHub\ra-training-finance"
npm install
Copy-Item .env.local.example .env.local -ErrorAction SilentlyContinue
$env:VITE_ENABLE_SRI_BILLING="true"
$env:VITE_FISCAL_API_URL="http://127.0.0.1:4010"
$env:VITE_LOCAL_FISCAL_DEMO_AUTH="true"
npm run dev -- --host 127.0.0.1
```

Abra `http://127.0.0.1:5173/facturacion`. El usuario administrativo ficticio solo aparece en el build de desarrollo y cuando las dos banderas locales están activas.

## Verificar la API

```powershell
Invoke-RestMethod http://127.0.0.1:4010/api/v1/health
Invoke-RestMethod http://127.0.0.1:4010/api/v1/readiness
Start-Process http://127.0.0.1:4010/docs
```

## PostgreSQL con Docker, cuando esté disponible

```powershell
docker --version
docker compose -f .\docker-compose.fiscal.yml up -d fiscal-postgres
cd .\fiscal-service
npm install
Copy-Item .env.example .env -ErrorAction SilentlyContinue
$env:FISCAL_STORAGE="postgres"
$env:DATABASE_URL="postgresql://fiscal_local:fiscal_local@127.0.0.1:5434/ra_training_fiscal"
npm run migrate
npm run seed
npm run dev
```

Las credenciales anteriores son exclusivamente locales y están en el ejemplo versionado; no se deben reutilizar. La prueba actual no pudo ejecutar Docker porque el comando no estaba instalado.

## Pruebas

```powershell
cd "C:\Users\David\Desktop\R.A. Training\Repositorio GitHub\ra-training-finance"
npm test
npm run build
npm --prefix fiscal-service run typecheck
npm --prefix fiscal-service run lint
npm --prefix fiscal-service test
npm --prefix fiscal-service run build
```

## Detener

En cada PowerShell que ejecuta un servidor, presione `Ctrl+C`. Para PostgreSQL:

```powershell
cd "C:\Users\David\Desktop\R.A. Training\Repositorio GitHub\ra-training-finance"
docker compose -f .\docker-compose.fiscal.yml down
```

## Limpiar únicamente datos ficticios

Confirme primero la ruta exacta:

```powershell
$fiscalDemoPath = Resolve-Path .\fiscal-service\var -ErrorAction SilentlyContinue
$fiscalDemoPath
```

Si muestra exactamente la carpeta `fiscal-service\var`, cierre el servicio y elimínela manualmente desde el Explorador. Para PostgreSQL local, `docker compose -f .\docker-compose.fiscal.yml down -v` elimina el volumen ficticio; ejecútelo solo después de verificar que es este Compose y que no necesita conservar la demo.

## Puerto ocupado

```powershell
Get-NetTCPConnection -LocalPort 4010 -ErrorAction SilentlyContinue |
  Select-Object LocalAddress,LocalPort,State,OwningProcess
Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue |
  Select-Object LocalAddress,LocalPort,State,OwningProcess
```

Detenga el proceso que usted inició o cambie `FISCAL_PORT` y `VITE_FISCAL_API_URL` de forma consistente. No finalice procesos desconocidos.

## Problemas comunes

- `xmllint no está disponible`: instale/agregue una distribución confiable de libxml2 al `PATH`; no omita la validación.
- `403`: use la interfaz local o el encabezado `x-fiscal-local-role: admin` desde loopback.
- `409`: la inscripción ya tiene factura o la transición no es válida; use reintento, no cree un duplicado.
- Datos desaparecen al reiniciar: es lo esperado con `FISCAL_STORAGE=inmemory`.
- Nunca active `FISCAL_SRI_REAL_CONNECTION_ENABLED`; la configuración lo rechaza.
