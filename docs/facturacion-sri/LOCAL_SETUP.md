# Ejecución local

Requisitos: Node.js 20.19 o superior. Docker no es necesario ni debe instalarse para esta etapa.

## Preparación

```powershell
cd "C:\Users\David\Desktop\R.A. Training\Repositorio GitHub\ra-training-finance"
npm install
npm --prefix fiscal-service install
```

Copiar solo como referencia las plantillas `.env.local.example` y `fiscal-service/.env.example`. Los datos institucionales se guardan en `fiscal-service/.env.local`, que debe permanecer ignorado. No imprimir su contenido.

## Levantar

Terminal 1:

```powershell
cd "C:\Users\David\Desktop\R.A. Training\Repositorio GitHub\ra-training-finance"
npm run fiscal:dev
```

Terminal 2:

```powershell
cd "C:\Users\David\Desktop\R.A. Training\Repositorio GitHub\ra-training-finance"
$env:VITE_ENABLE_SRI_BILLING="true"
$env:VITE_FISCAL_API_URL="http://127.0.0.1:4010"
$env:VITE_LOCAL_FISCAL_DEMO_AUTH="true"
$env:VITE_FISCAL_USE_EXISTING_APP_DATA="false"
npm run dev -- --host 127.0.0.1
```

Abrir `http://127.0.0.1:5173/facturacion`.

## Validación

```powershell
npm run build
npm test
npm --prefix fiscal-service run build
npm --prefix fiscal-service run typecheck
npm --prefix fiscal-service run lint
npm --prefix fiscal-service test
npm --prefix fiscal-service run test:postgres-memory
```

El backend se reinicia en memoria; los documentos se pierden. La red oficial, correo y datos remotos permanecen deshabilitados.
