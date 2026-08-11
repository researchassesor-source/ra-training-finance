import { describe, expect, it } from 'vitest'
import { enviarRecepcion } from './recepcion.js'
import { SriConfigError } from './errors.js'
import {
  FIXTURE_RECIBIDA,
  FIXTURE_DEVUELTA_UN_MENSAJE,
  FIXTURE_DEVUELTA_MULTIPLES_MENSAJES,
  FIXTURE_SOAP_FAULT,
  FIXTURE_MALFORMED,
  FIXTURE_NOT_XML_AT_ALL,
  fakeFetch,
  fakeFetchTimeout,
  fakeFetchNetworkError,
} from './sri.fixtures.js'

const SIGNED_XML = '<factura id="comprobante" version="2.1.0"><ds:Signature>fixture, no es un XML firmado real</ds:Signature></factura>'

describe('enviarRecepcion', () => {
  it('recepción aceptada: RECIBIDA', async () => {
    const result = await enviarRecepcion(SIGNED_XML, { environment: 'test', fetchImpl: fakeFetch(FIXTURE_RECIBIDA) })
    expect(result).toEqual({ outcome: 'RECIBIDA', comprobantes: [] })
  })

  it('recepción devuelta con un mensaje', async () => {
    const result = await enviarRecepcion(SIGNED_XML, { environment: 'test', fetchImpl: fakeFetch(FIXTURE_DEVUELTA_UN_MENSAJE) })
    expect(result.outcome).toBe('DEVUELTA')
    expect(result.comprobantes).toHaveLength(1)
    expect(result.comprobantes[0].mensajes).toHaveLength(1)
    expect(result.comprobantes[0].mensajes[0]).toMatchObject({ identificador: '35', tipo: 'ERROR' })
  })

  it('recepción devuelta con múltiples mensajes del SRI', async () => {
    const result = await enviarRecepcion(SIGNED_XML, { environment: 'test', fetchImpl: fakeFetch(FIXTURE_DEVUELTA_MULTIPLES_MENSAJES) })
    expect(result.outcome).toBe('DEVUELTA')
    expect(result.comprobantes[0].mensajes).toHaveLength(3)
    expect(result.comprobantes[0].mensajes.map(m => m.identificador)).toEqual(['35', '43', '60'])
  })

  it('SOAP Fault se reporta como tal, sin intentar interpretarlo como recepción válida', async () => {
    const result = await enviarRecepcion(SIGNED_XML, {
      environment: 'test',
      fetchImpl: fakeFetch(FIXTURE_SOAP_FAULT, { status: 500, ok: false, statusText: 'Internal Server Error' }),
    })
    expect(result.outcome).toBe('SOAP_FAULT')
    expect(result.fault.message).toContain('fixture de prueba')
  })

  it('timeout no lanza excepción: se reporta como TIMEOUT para permitir reconsulta posterior', async () => {
    const result = await enviarRecepcion(SIGNED_XML, { environment: 'test', fetchImpl: fakeFetchTimeout() })
    expect(result.outcome).toBe('TIMEOUT')
  })

  it('error de red se reporta como NETWORK_ERROR, no lanza', async () => {
    const result = await enviarRecepcion(SIGNED_XML, { environment: 'test', fetchImpl: fakeFetchNetworkError() })
    expect(result.outcome).toBe('NETWORK_ERROR')
  })

  it('respuesta XML malformada (mal formada) se reporta, no lanza y no revienta el proceso', async () => {
    const result = await enviarRecepcion(SIGNED_XML, { environment: 'test', fetchImpl: fakeFetch(FIXTURE_MALFORMED) })
    expect(result.outcome).toBe('MALFORMED_RESPONSE')
  })

  it('una respuesta que no es XML en absoluto (p. ej. HTML de error de gateway) se reporta como malformada', async () => {
    const result = await enviarRecepcion(SIGNED_XML, { environment: 'test', fetchImpl: fakeFetch(FIXTURE_NOT_XML_AT_ALL, { status: 502, ok: false, statusText: 'Bad Gateway' }) })
    expect(['MALFORMED_RESPONSE', 'NETWORK_ERROR']).toContain(result.outcome)
  })

  it('nunca reporta un DEVUELTA/SOAP_FAULT/TIMEOUT como si fuera RECIBIDA (no marcar autorizada solo por ser recibida es una regla aparte, pero tampoco se puede confundir el estado base)', async () => {
    const devuelta = await enviarRecepcion(SIGNED_XML, { environment: 'test', fetchImpl: fakeFetch(FIXTURE_DEVUELTA_UN_MENSAJE) })
    expect(devuelta.outcome).not.toBe('RECIBIDA')
  })

  it('envía la petición al endpoint de Pruebas (celcer), nunca a Producción, cuando environment=test', async () => {
    let calledUrl = null
    const fetchImpl = async (url, init) => { calledUrl = url; return { ok: true, status: 200, statusText: 'OK', text: async () => FIXTURE_RECIBIDA } }
    await enviarRecepcion(SIGNED_XML, { environment: 'test', fetchImpl })
    expect(calledUrl).toContain('celcer.sri.gob.ec')
    expect(calledUrl).not.toContain('cel.sri.gob.ec/comprobantes') // celcer no debe confundirse con cel
  })

  it('protección: enviar con environment=production sin SRI_ALLOW_PRODUCTION lanza y NUNCA llega a hacer fetch', async () => {
    delete process.env.SRI_ALLOW_PRODUCTION
    let fetchCalled = false
    const fetchImpl = async () => { fetchCalled = true; return { ok: true, status: 200, statusText: 'OK', text: async () => FIXTURE_RECIBIDA } }
    await expect(enviarRecepcion(SIGNED_XML, { environment: 'production', fetchImpl })).rejects.toThrow(SriConfigError)
    expect(fetchCalled).toBe(false)
  })

  it('el XML se envía codificado en base64 dentro del sobre SOAP (contrato confirmado contra el WSDL real)', async () => {
    let capturedBody = null
    const fetchImpl = async (url, init) => { capturedBody = init.body; return { ok: true, status: 200, statusText: 'OK', text: async () => FIXTURE_RECIBIDA } }
    await enviarRecepcion(SIGNED_XML, { environment: 'test', fetchImpl })
    expect(capturedBody).toContain('<rec:validarComprobante>')
    expect(capturedBody).toContain(Buffer.from(SIGNED_XML, 'utf8').toString('base64'))
    expect(capturedBody).not.toContain(SIGNED_XML) // no va en texto plano, solo base64
  })
})
