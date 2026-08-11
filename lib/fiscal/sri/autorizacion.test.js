import { describe, expect, it } from 'vitest'
import { consultarAutorizacion } from './autorizacion.js'
import { SriConfigError } from './errors.js'
import {
  AUTORIZACION_FIXTURES,
  FIXTURE_SOAP_FAULT,
  FIXTURE_MALFORMED,
  fakeFetch,
  fakeFetchTimeout,
  fakeFetchNetworkError,
} from './sri.fixtures.js'

const CLAVE = '1'.repeat(48) + '9'

describe('consultarAutorizacion', () => {
  it('autorización inmediata: AUTORIZADO, con número de autorización y XML autorizado', async () => {
    const result = await consultarAutorizacion(CLAVE, {
      environment: 'test',
      fetchImpl: fakeFetch(AUTORIZACION_FIXTURES.autorizado({ claveAcceso: CLAVE })),
    })
    expect(result.outcome).toBe('AUTORIZADO')
    expect(result.numeroAutorizacion).toBeTruthy()
    expect(result.xmlAutorizado).toContain('<factura')
    expect(result.claveAccesoConsultada).toBe(CLAVE)
  })

  it('autorización pendiente: EN_PROCESO cuando no hay ninguna decisión todavía (autorizaciones vacío)', async () => {
    const result = await consultarAutorizacion(CLAVE, {
      environment: 'test',
      fetchImpl: fakeFetch(AUTORIZACION_FIXTURES.enProceso({ claveAcceso: CLAVE })),
    })
    expect(result.outcome).toBe('EN_PROCESO')
  })

  it('no autorizado (RECHAZADO en la respuesta real del SRI) se clasifica como NO_AUTORIZADO', async () => {
    const result = await consultarAutorizacion(CLAVE, {
      environment: 'test',
      fetchImpl: fakeFetch(AUTORIZACION_FIXTURES.noAutorizado({ claveAcceso: CLAVE })),
    })
    expect(result.outcome).toBe('NO_AUTORIZADO')
    expect(result.mensajes[0].mensaje).toMatch(/RUC no existe/i)
  })

  it('con múltiples <autorizacion>, se queda con la ÚLTIMA (regla 5.11 de la ficha)', async () => {
    const result = await consultarAutorizacion(CLAVE, {
      environment: 'test',
      fetchImpl: fakeFetch(AUTORIZACION_FIXTURES.dosAutorizacionesUltimaGana({ claveAcceso: CLAVE })),
    })
    expect(result.outcome).toBe('AUTORIZADO') // la última entrada del fixture es AUTORIZADO, la primera era RECHAZADO
  })

  it('SOAP Fault se reporta como tal', async () => {
    const result = await consultarAutorizacion(CLAVE, { environment: 'test', fetchImpl: fakeFetch(FIXTURE_SOAP_FAULT, { status: 500, ok: false, statusText: 'Error' }) })
    expect(result.outcome).toBe('SOAP_FAULT')
  })

  it('timeout no lanza, se reporta como TIMEOUT', async () => {
    const result = await consultarAutorizacion(CLAVE, { environment: 'test', fetchImpl: fakeFetchTimeout() })
    expect(result.outcome).toBe('TIMEOUT')
  })

  it('error de red no lanza, se reporta como NETWORK_ERROR', async () => {
    const result = await consultarAutorizacion(CLAVE, { environment: 'test', fetchImpl: fakeFetchNetworkError() })
    expect(result.outcome).toBe('NETWORK_ERROR')
  })

  it('respuesta malformada no lanza, se reporta', async () => {
    const result = await consultarAutorizacion(CLAVE, { environment: 'test', fetchImpl: fakeFetch(FIXTURE_MALFORMED) })
    expect(result.outcome).toBe('MALFORMED_RESPONSE')
  })

  it('idempotencia: consultar la misma clave dos veces con la misma respuesta produce el mismo resultado, sin efectos de estado ocultos', async () => {
    const fetchImpl = fakeFetch(AUTORIZACION_FIXTURES.autorizado({ claveAcceso: CLAVE }))
    const first = await consultarAutorizacion(CLAVE, { environment: 'test', fetchImpl })
    const second = await consultarAutorizacion(CLAVE, { environment: 'test', fetchImpl })
    expect(second).toEqual(first)
  })

  it('reintento posterior: EN_PROCESO y luego, en una llamada posterior, AUTORIZADO (simula el polling real)', async () => {
    let call = 0
    const fetchImpl = async () => {
      call += 1
      const body = call === 1 ? AUTORIZACION_FIXTURES.enProceso({ claveAcceso: CLAVE }) : AUTORIZACION_FIXTURES.autorizado({ claveAcceso: CLAVE })
      return { ok: true, status: 200, statusText: 'OK', text: async () => body }
    }
    const first = await consultarAutorizacion(CLAVE, { environment: 'test', fetchImpl })
    expect(first.outcome).toBe('EN_PROCESO')
    const second = await consultarAutorizacion(CLAVE, { environment: 'test', fetchImpl })
    expect(second.outcome).toBe('AUTORIZADO')
  })

  it('envía la consulta al endpoint de Pruebas (celcer), nunca a Producción, cuando environment=test', async () => {
    let calledUrl = null
    const fetchImpl = async (url) => { calledUrl = url; return { ok: true, status: 200, statusText: 'OK', text: async () => AUTORIZACION_FIXTURES.enProceso({ claveAcceso: CLAVE }) } }
    await consultarAutorizacion(CLAVE, { environment: 'test', fetchImpl })
    expect(calledUrl).toContain('celcer.sri.gob.ec')
  })

  it('protección: consultar con environment=production sin SRI_ALLOW_PRODUCTION lanza y NUNCA llega a hacer fetch', async () => {
    delete process.env.SRI_ALLOW_PRODUCTION
    let fetchCalled = false
    const fetchImpl = async () => { fetchCalled = true; return { ok: true, status: 200, statusText: 'OK', text: async () => '' } }
    await expect(consultarAutorizacion(CLAVE, { environment: 'production', fetchImpl })).rejects.toThrow(SriConfigError)
    expect(fetchCalled).toBe(false)
  })

  it('rechaza una clave de acceso que no tenga 49 dígitos, sin llegar a la red', async () => {
    let fetchCalled = false
    const fetchImpl = async () => { fetchCalled = true; return { ok: true, status: 200, statusText: 'OK', text: async () => '' } }
    await expect(consultarAutorizacion('123', { environment: 'test', fetchImpl })).rejects.toThrow()
    expect(fetchCalled).toBe(false)
  })
})
