import { describe, expect, it } from 'vitest'
import { resolveFiscalRuntimeContext } from './fiscalRuntimeContext'

describe('contexto visible del módulo fiscal', () => {
  it('detecta desarrollo local sin validez tributaria', () => {
    expect(resolveFiscalRuntimeContext({ configured: 'auto', hostname: '127.0.0.1' })).toMatchObject({
      context: 'local', environment: 'ENTORNO LOCAL DE DESARROLLO', connection: 'NO CONECTADO AL SRI',
    })
  })

  it('trata una URL vercel.app como preview y nunca como producción automática', () => {
    expect(resolveFiscalRuntimeContext({ configured: 'auto', hostname: 'proyecto.vercel.app' }).context).toBe('preview')
  })

  it('mantiene producción sin conexión mientras falte cualquier confirmación', () => {
    expect(resolveFiscalRuntimeContext({ configured: 'production', realSriConnectionEnabled: true, readinessReady: true, certificateConfigured: true }).connection).toBe('CONEXIÓN SRI NO CONFIRMADA')
  })
})
