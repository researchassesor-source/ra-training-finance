# R.A. Training Fiscal Service — prueba local

> AMBIENTE LOCAL DE DESARROLLO · SIN VALIDEZ TRIBUTARIA · NO CONECTADO AL SRI

Servicio fiscal aislado en Node.js, TypeScript estricto y Fastify. Implementa una demostración con datos ficticios para factura y nota de crédito, cálculos decimales, secuenciales, clave de acceso, XML 1.1.0, validación contra XSD oficial, firma **mock no criptográfica**, simulador SRI, RIDE con marca de agua y auditoría.

No usa Apps Script, Google Sheets, credenciales institucionales, certificados reales, correo real ni servicios del SRI. `FISCAL_STORAGE=inmemory` es efímero; PostgreSQL es la persistencia objetivo local y todavía requiere validación con Docker.

## Inicio rápido sin Docker

```powershell
cd "C:\Users\David\Desktop\R.A. Training\Repositorio GitHub\ra-training-finance\fiscal-service"
npm install
Copy-Item .env.example .env
$env:FISCAL_STORAGE="inmemory"
$env:FISCAL_LOCAL_DEV_MODE="true"
$env:FISCAL_SRI_REAL_CONNECTION_ENABLED="false"
npm run dev
```

API: `http://127.0.0.1:4010`; health: `/api/v1/health`; documentación OpenAPI: `/docs`.

Las rutas fiscales protegidas requieren el encabezado local `x-fiscal-local-role: admin`. Este adaptador falla si el proceso usa `NODE_ENV=production`, si no está en modo local o si la solicitud no es loopback.

## PostgreSQL local objetivo

Desde la raíz del repositorio:

```powershell
docker compose -f docker-compose.fiscal.yml up -d fiscal-postgres
cd .\fiscal-service
Copy-Item .env.example .env
npm install
npm run migrate
npm run seed
npm run dev
```

Para detenerlo: `docker compose -f docker-compose.fiscal.yml down`. Docker no se instala automáticamente.

## Calidad

```powershell
npm run typecheck
npm run lint
npm run test
npm run build
```

La validación XSD usa `xmllint` disponible en `PATH`; sin esa herramienta el servicio falla de forma explícita. Los archivos producidos se escriben bajo `var/` y están excluidos de Git.

## Adaptadores y límites

- `FiscalRepository`: memoria para demo y PostgreSQL para persistencia local.
- `XmlSigner`: `MockXmlSigner` inserta solo un comentario de advertencia; `SriCompatibleSigner` define el contrato futuro que exige XAdES-BES y referencia a secretos.
- `SriGateway`: `MockSriGateway` cubre autorizado, devuelto, procesando, no autorizado, error temporal, timeout, respuesta inválida y duplicada; `FutureOfficialSriGateway` falla siempre y jamás abre red.
- `FiscalStorage`: almacenamiento local confinado; interfaz preparada para un almacén productivo futuro.
- `FiscalMailer`: crea una vista previa local; no envía mensajes.

## Advertencia tributaria

El catálogo, XSD y algoritmo estudiados provienen de documentación oficial, pero esta prueba **no está certificada**, no contiene una firma XAdES-BES real y no debe desplegarse ni usarse con datos reales. Consulte `docs/facturacion-sri/PRODUCTION_READINESS.md` antes de cualquier fase posterior.
