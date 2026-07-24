import { describe, expect, it } from 'vitest'
import { FutureInstitutionalFiscalRepository } from '../../src/infrastructure/future-institutional-repository.js'
import { PostgresFiscalRepository, PostgreSqlFiscalRepository } from '../../src/infrastructure/postgres-repository.js'

describe('límites de persistencia fiscal', () => {
  it('mantiene el alias explícito del adaptador PostgreSQL', () => {
    expect(PostgreSqlFiscalRepository).toBe(PostgresFiscalRepository)
  })

  it('impide usar el proveedor institucional antes de configurarlo', async () => {
    const repository = new FutureInstitutionalFiscalRepository()
    await expect(repository.listDocuments()).rejects.toThrow('aún no está configurado')
  })
})
