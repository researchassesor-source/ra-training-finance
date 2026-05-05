export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')

  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return
  }

  const { payload } = req.query
  if (!payload) {
    res.json({ success: false, error: 'payload requerido' })
    return
  }

  const GAS_URL = process.env.GAS_URL
  if (!GAS_URL) {
    res.json({ success: false, error: 'GAS_URL no configurada en Vercel' })
    return
  }

  try {
    const url = `${GAS_URL}?payload=${encodeURIComponent(payload)}`
    const response = await fetch(url)
    const data = await response.json()
    res.json(data)
  } catch (err) {
    res.json({ success: false, error: 'Error al conectar con el backend: ' + err.message })
  }
}
