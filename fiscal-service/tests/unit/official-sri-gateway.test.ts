import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { buildAuthorizationSoapRequest, buildReceptionSoapRequest, OfficialSriGateway, parseAuthorizationSoap, parseReceptionSoap } from '../../src/modules/sri/gateway.js'
import { fakeDocument } from '../fixtures/document.js'

const fixture = (name: string) => readFile(resolve(process.cwd(), 'tests/fixtures/sri', name), 'utf8')

describe('adaptador oficial SRI sin red', () => {
  it('construye solicitudes SOAP con XML Base64 y clave escapada', () => {
    expect(buildReceptionSoapRequest('<factura/>')).toContain(Buffer.from('<factura/>').toString('base64'))
    expect(buildAuthorizationSoapRequest('123&amp;')).toContain('123&amp;amp;')
  })
  it('parsea recepción recibida y devuelta con mensajes', async () => {
    expect(parseReceptionSoap(await fixture('reception-received.xml')).status).toBe('RECIBIDA')
    const returned = parseReceptionSoap(await fixture('reception-returned.xml'))
    expect(returned.status).toBe('DEVUELTA'); expect(returned.message).toContain('DOCUMENTO INVÁLIDO')
  })
  it('parsea autorización y múltiples mensajes', async () => {
    const authorized = parseAuthorizationSoap(await fixture('authorization-authorized.xml'))
    expect(authorized.status).toBe('AUTORIZADO'); expect(authorized.authorizationNumber).toHaveLength(49)
    const denied = parseAuthorizationSoap(await fixture('authorization-not-authorized.xml'))
    expect(denied.status).toBe('NO AUTORIZADO'); expect(denied.message).toContain('MENSAJE DE PRUEBA')
    expect(parseAuthorizationSoap('<malformado>').status).toBe('RESPUESTA INVALIDA')
    expect(parseReceptionSoap('').status).toBe('RESPUESTA INVALIDA')
  })
  it('selecciona la autorización válida cuando la respuesta contiene múltiples autorizaciones', async () => {
    const result = parseAuthorizationSoap(await fixture('authorization-multiple.xml'))
    expect(result.status).toBe('AUTORIZADO')
    expect(result.authorizationNumber).toBe('2407202601999999999900110010010000000011234567811')
  })
  it('bloquea antes de invocar fetch si falta cualquiera de las dos confirmaciones', async () => {
    const fetchImpl = vi.fn()
    const gateway = new OfficialSriGateway({ environment: 'CERTIFICATION', realConnectionEnabled: false, confirmRealCall: false, fetchImpl })
    await expect(gateway.submitDocument(fakeDocument(), '<factura/>')).rejects.toThrow('BLOQUEADA')
    expect(fetchImpl).not.toHaveBeenCalled()
  })
  it('reintenta solo contra un fetch inyectado y conserva el correlation ID', async () => {
    const soap = await fixture('reception-received.xml')
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response(soap, { status: 200 }))
    const gateway = new OfficialSriGateway({ environment: 'CERTIFICATION', realConnectionEnabled: true, confirmRealCall: true, maxRetries: 1, fetchImpl })
    const result = await gateway.submitDocument(fakeDocument(), '<factura/>')
    expect(result.status).toBe('RECIBIDA')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    const firstHeaders = fetchImpl.mock.calls[0]?.[1]?.headers as Record<string, string>
    const secondHeaders = fetchImpl.mock.calls[1]?.[1]?.headers as Record<string, string>
    expect(secondHeaders['x-correlation-id']).toBe(firstHeaders['x-correlation-id'])
  })
})
