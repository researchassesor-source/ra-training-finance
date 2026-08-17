import { describe, expect, it } from 'vitest'
import { getFiscalUserToken } from './httpAuth.js'

describe('getFiscalUserToken', () => {
  it('prioriza Authorization: Bearer sobre body.token y query.token', () => {
    const req = {
      headers: { authorization: 'Bearer del-header' },
      body: { token: 'del-body' },
      query: { token: 'de-la-query' },
    }
    expect(getFiscalUserToken(req)).toBe('del-header')
  })

  it('acepta el header Authorization en mayúscula (algunos runtimes lo normalizan distinto)', () => {
    const req = { headers: { Authorization: 'Bearer del-header-mayus' } }
    expect(getFiscalUserToken(req)).toBe('del-header-mayus')
  })

  it('sin Authorization, usa body.token (POST)', () => {
    const req = { headers: {}, body: { token: 'del-body' }, query: { token: 'de-la-query' } }
    expect(getFiscalUserToken(req)).toBe('del-body')
  })

  it('sin Authorization ni body.token, cae al fallback de compatibilidad query.token', () => {
    const req = { headers: {}, query: { token: 'de-la-query' } }
    expect(getFiscalUserToken(req)).toBe('de-la-query')
  })

  it('acepta un body parseado explícitamente por el llamador (segundo parámetro) en vez de req.body', () => {
    const req = { headers: {}, body: '{"token":"crudo-sin-parsear"}' }
    expect(getFiscalUserToken(req, { token: 'del-body-parseado' })).toBe('del-body-parseado')
  })

  it('sin ninguna fuente de token, devuelve null', () => {
    expect(getFiscalUserToken({ headers: {}, query: {} })).toBeNull()
  })

  it('un header Authorization sin esquema Bearer se ignora (no es un token de sesión válido)', () => {
    const req = { headers: { authorization: 'Basic dXNlcjpwYXNz' }, body: { token: 'del-body' } }
    expect(getFiscalUserToken(req)).toBe('del-body')
  })

  it('un header Authorization "Bearer" vacío (solo espacios) se ignora y cae al siguiente nivel', () => {
    const req = { headers: { authorization: 'Bearer   ' }, body: { token: 'del-body' } }
    expect(getFiscalUserToken(req)).toBe('del-body')
  })

  it('req sin headers/body/query no lanza, devuelve null', () => {
    expect(getFiscalUserToken({})).toBeNull()
  })
})
