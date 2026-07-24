function downloadBlob(blob, filename, { documentRef = globalThis.document, urlRef = globalThis.URL } = {}) {
  const href = urlRef.createObjectURL(blob)
  try {
    const link = documentRef.createElement('a'); link.href = href; link.download = filename
    documentRef.body.appendChild(link); link.click(); link.remove()
  } finally { urlRef.revokeObjectURL(href) }
}

export function createHttpFiscalApi({
  baseUrl = (import.meta.env.VITE_FISCAL_API_URL || 'http://127.0.0.1:4010').replace(/\/$/, ''),
  fetchImpl = globalThis.fetch,
  documentRef = globalThis.document,
  urlRef = globalThis.URL,
  randomUUID = () => crypto.randomUUID(),
} = {}) {
  const localHeaders = (extra = {}) => ({ 'x-fiscal-local-role': 'admin', ...extra })

  async function request(path, options = {}) {
    const response = await fetchImpl(`${baseUrl}/api/v1${path}`, {
      ...options,
      headers: localHeaders({ ...(options.body ? { 'content-type': 'application/json' } : {}), ...options.headers }),
    })
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      throw new Error(body.message || `Error fiscal local ${response.status}`)
    }
    const type = response.headers.get('content-type') || ''
    return type.includes('json') ? response.json() : response
  }

  const post = (path, body, idempotencyKey) => request(path, {
    method: 'POST', ...(body ? { body: JSON.stringify(body) } : {}),
    ...(idempotencyKey ? { headers: { 'idempotency-key': idempotencyKey } } : {}),
  })

  return {
    runtime: 'http-local',
    config: () => request('/config/status'), readiness: () => request('/readiness/detail'), catalog: () => request('/fiscal-catalog'),
    paymentMethods: () => request('/payment-methods'), sources: () => request('/billing-sources'), invoices: () => request('/invoices'), creditNotes: () => request('/credit-notes'),
    createInvoice: (data) => post('/invoices', data, `ui-invoice-${randomUUID()}`), getInvoice: (id) => request(`/invoices/${id}`),
    getDocument: (id, type = 'invoices') => request(`/${type}/${id}`), step: (id, action, type = 'invoices') => post(`/${type}/${id}/${action}`),
    simulateDelivery: (id, action = 'simulate', type = 'invoices', outcome = 'SUCCESS') => post(`/${type}/${id}/delivery/${action}`, { outcome }),
    events: (id, type = 'invoices') => request(`/${type}/${id}/events`), transmissions: (id, type = 'invoices') => request(`/${type}/${id}/transmissions`),
    createCreditNote: (invoiceId, data) => post(`/invoices/${invoiceId}/credit-notes`, data, `ui-credit-${randomUUID()}`),
    async xmlText(id, type = 'invoices') { const response = await request(`/${type}/${id}/xml/unsigned`); return response.text() },
    async download(id, kind, type = 'invoices') {
      const response = await fetchImpl(`${baseUrl}/api/v1/${type}/${id}/${kind}`, { headers: localHeaders() })
      if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.message || 'No se pudo descargar el archivo local') }
      const blob = await response.blob(); const disposition = response.headers.get('content-disposition') || ''
      const match = /filename="([^"]+)"/.exec(disposition); const extension = kind === 'ride' ? 'pdf' : 'xml'
      downloadBlob(blob, match?.[1] || `documento-local.${extension}`, { documentRef, urlRef })
    },
  }
}
