# R.A. Training Fiscal Service - local

> AMBIENTE LOCAL DE DESARROLLO · SIN VALIDEZ TRIBUTARIA · NO CONECTADO AL SRI

Servicio aislado Fastify/TypeScript para factura y nota de crédito, cálculos decimales, secuencias, XML/XSD 1.1.0, XAdES de prueba, PKCS#12 preparado, SOAP oficial bloqueado, simulador, RIDE, catálogo, readiness, PostgreSQL y auditoría.

## Inicio

```powershell
cd "C:\Users\David\Desktop\R.A. Training\Repositorio GitHub\ra-training-finance\fiscal-service"
npm install
npm run dev
```

Carga `fiscal-service/.env.local` si existe; ese archivo es privado e ignorado. API: `http://127.0.0.1:4010`; OpenAPI: `/docs`. Las rutas requieren `x-fiscal-local-role: admin` y loopback.

## Calidad

```powershell
npm run typecheck
npm run lint
npm test
npm run test:postgres-memory
npm run build
```

Docker no está instalado ni es necesario: `pg-mem` prueba migraciones, transacciones, idempotencia y concurrencia. `docker-compose.fiscal.yml` queda preparado para una fase posterior.

## Seguridad

- Firma mock por defecto; XAdES efímero solo para prueba.
- PKCS#12 exige ruta/contraseña de entorno y valida contenedor, vigencia y llave.
- Gateway oficial exige dos confirmaciones; ambas permanecen false.
- Correo es preview; archivos están en `var/`, fuera de Git.
- Configuración real se enmascara en evidencia.

Consulte `docs/facturacion-sri/PRODUCTION_READINESS.md`. Este servicio no está certificado ni habilitado para emisión oficial.
