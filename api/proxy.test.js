import { describe, expect, it } from 'vitest'
import { corsOriginForRequest } from './proxy'

describe('allowlist CORS del proxy', () => {
  it('permite solicitudes sin Origin y del mismo host', () => {
    expect(corsOriginForRequest({ headers: { host: 'preview.example.test' } }, '')).toBe('')
    expect(corsOriginForRequest({ headers: { host: 'preview.example.test', origin: 'https://preview.example.test' } }, ''))
      .toBe('https://preview.example.test')
  })

  it('permite solo orígenes externos configurados', () => {
    const request = { headers: { host: 'app.example.test', origin: 'https://admin.example.test' } }
    expect(corsOriginForRequest(request, 'https://admin.example.test,https://otro.example.test'))
      .toBe('https://admin.example.test')
    expect(corsOriginForRequest(request, 'https://otro.example.test')).toBeNull()
  })
})
