import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

function appsScriptLocalProxy(gasUrl) {
  return {
    name: 'apps-script-local-proxy',
    configureServer(server) {
      if (!gasUrl) return

      server.middlewares.use('/api/proxy', async (req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8')

        if (req.method === 'OPTIONS') {
          res.statusCode = 204
          res.end()
          return
        }

        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end(JSON.stringify({ success: false, error: 'Método no permitido' }))
          return
        }

        try {
          const chunks = []
          for await (const chunk of req) chunks.push(chunk)
          const body = Buffer.concat(chunks).toString('utf8')

          const response = await fetch(gasUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
            redirect: 'follow',
          })

          res.statusCode = response.ok ? 200 : 502
          res.end(await response.text())
        } catch {
          res.statusCode = 502
          res.end(JSON.stringify({ success: false, error: 'Error al conectar con el backend de pruebas' }))
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const vercelEnvironment = String(process.env.VERCEL_ENV || env.VERCEL_ENV || '').trim().toLowerCase()
  const deploymentEnvironment = ['development', 'preview', 'production'].includes(vercelEnvironment)
    ? vercelEnvironment
    : ''

  return {
    plugins: [react(), appsScriptLocalProxy(env.GAS_URL)],
    base: '/',
    // Vite no expone VERCEL_ENV al navegador. Se incorpora solo su valor no
    // sensible para distinguir de forma fiable Preview y Production.
    define: {
      'import.meta.env.VITE_VERCEL_ENV': JSON.stringify(deploymentEnvironment),
    },
  }
})
