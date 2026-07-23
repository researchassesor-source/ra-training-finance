const baseUrl = (import.meta.env.VITE_FISCAL_API_URL || 'http://127.0.0.1:4010').replace(/\/$/, '')

function localHeaders(extra = {}) {
  return { 'x-fiscal-local-role': 'admin', ...extra }
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}/api/v1${path}`, {
    ...options,
    headers: localHeaders({
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...options.headers,
    }),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.message || `Error fiscal local ${response.status}`)
  }
  const type = response.headers.get('content-type') || ''
  return type.includes('json') ? response.json() : response
}

const post = (path, body, idempotencyKey) => request(path, {
  method: 'POST',
  ...(body ? { body: JSON.stringify(body) } : {}),
  ...(idempotencyKey ? { headers: { 'idempotency-key': idempotencyKey } } : {}),
})

export const fiscalApi = {
  config: () => request('/config/status'),
  sources: () => request('/billing-sources'),
  invoices: () => request('/invoices'),
  creditNotes: () => request('/credit-notes'),
  createInvoice: (data) => post('/invoices', data, `ui-invoice-${crypto.randomUUID()}`),
  getInvoice: (id) => request(`/invoices/${id}`),
  getDocument: (id, type = 'invoices') => request(`/${type}/${id}`),
  step: (id, action, type = 'invoices') => post(`/${type}/${id}/${action}`),
  events: (id, type = 'invoices') => request(`/${type}/${id}/events`),
  transmissions: (id, type = 'invoices') => request(`/${type}/${id}/transmissions`),
  createCreditNote: (invoiceId, data) => post(`/invoices/${invoiceId}/credit-notes`, data, `ui-credit-${crypto.randomUUID()}`),
  async xmlText(id, type = 'invoices') {
    const response = await request(`/${type}/${id}/xml/unsigned`)
    return response.text()
  },
  async download(id, kind, type = 'invoices') {
    const response = await fetch(`${baseUrl}/api/v1/${type}/${id}/${kind}`, { headers: localHeaders() })
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      throw new Error(body.message || 'No se pudo descargar el archivo local')
    }
    const blob = await response.blob()
    const disposition = response.headers.get('content-disposition') || ''
    const match = /filename="([^"]+)"/.exec(disposition)
    const extension = kind === 'ride' ? 'pdf' : 'xml'
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = match?.[1] || `documento-local.${extension}`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(link.href)
  },
}
