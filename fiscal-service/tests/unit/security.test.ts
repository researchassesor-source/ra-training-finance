import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadConfig } from '../../src/config/env.js'
import { LocalFileStorage } from '../../src/infrastructure/file-storage.js'

const paths: string[] = []
afterEach(async () => Promise.all(paths.splice(0).map((path) => rm(path, { recursive: true, force: true }))))

describe('controles locales', () => {
  it('rechaza modo local en producción', () => {
    expect(() => loadConfig({ NODE_ENV: 'production', FISCAL_LOCAL_DEV_MODE: 'true' })).toThrow('producción')
  })
  it('rechaza cualquier intento de conexión real al SRI', () => {
    expect(() => loadConfig({ NODE_ENV: 'development', FISCAL_SRI_REAL_CONNECTION_ENABLED: 'true' })).toThrow('deshabilitada')
  })
  it('previene path traversal e IDs arbitrarios', async () => {
    const root = await mkdtemp(join(tmpdir(), 'fiscal-storage-'))
    paths.push(root)
    const storage = new LocalFileStorage(root)
    await expect(storage.read('../../secreto.txt')).rejects.toThrow('inválida')
    await expect(storage.write('otro-id', 'INVOICE', '2026-07-23', 'x.xml', 'x')).rejects.toThrow('ID')
    await expect(storage.write(`FD-${crypto.randomUUID()}`, 'INVOICE', '2026-07-23', '../x.xml', 'x')).rejects.toThrow('Nombre')
  })
})
