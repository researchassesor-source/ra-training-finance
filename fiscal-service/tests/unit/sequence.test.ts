import { describe, expect, it } from 'vitest'
import { InMemoryFiscalRepository } from '../../src/infrastructure/in-memory-repository.js'

describe('secuenciales', () => {
  it('reserva concurrentemente sin duplicados', async () => {
    const repository = new InMemoryFiscalRepository()
    const values = await Promise.all(Array.from({ length: 100 }, () => repository.reserveSequential('INVOICE', '001', '001')))
    expect(new Set(values).size).toBe(100)
    expect(values).toContain('000000001')
    expect(values).toContain('000000100')
  })
})
