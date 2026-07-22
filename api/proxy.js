export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return
  }

  if (!['GET', 'POST'].includes(req.method)) {
    res.status(405).json({ success: false, error: 'Método no permitido' })
    return
  }

  const gasUrl = process.env.GAS_URL
  if (!gasUrl) {
    res.json({ success: false, error: 'GAS_URL no configurada en Vercel' })
    return
  }

  try {
    let response
    if (req.method === 'POST') {
      let body = req.body
      if (typeof body === 'string') {
        try { body = JSON.parse(body) }
        catch { return res.status(400).json({ success: false, error: 'JSON inválido' }) }
      }
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return res.status(400).json({ success: false, error: 'JSON inválido' })
      }
      response = await fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    } else {
      const { payload } = req.query
      if (!payload) return res.status(400).json({ success: false, error: 'payload requerido' })
      response = await fetch(`${gasUrl}?payload=${encodeURIComponent(payload)}`)
    }
    const text = await response.text()
    let data
    try { data = JSON.parse(text) }
    catch { return res.status(502).json({ success: false, error: 'Respuesta inválida del backend' }) }
    res.json(data)
  } catch (err) {
    res.status(502).json({ success: false, error: 'Error al conectar con el backend' })
  }
}
