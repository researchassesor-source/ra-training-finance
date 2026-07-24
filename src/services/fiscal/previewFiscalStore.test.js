import { describe, expect, it } from 'vitest'
import { PREVIEW_STORE_KEY, PREVIEW_STORE_VERSION } from './previewFiscalSeed'
import { createPreviewFiscalStore } from './previewFiscalStore'

function memoryStorage(entries = {}) {
  const data = new Map(Object.entries(entries))
  return { data, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: (key) => data.delete(key) }
}

describe('almacén fiscal de Preview', () => {
  it('crea una semilla versionada y la conserva entre instancias', () => {
    const storage = memoryStorage(); const first = createPreviewFiscalStore({ storage })
    const seeded = first.read(); expect(seeded.version).toBe(PREVIEW_STORE_VERSION); expect(seeded.documents).toHaveLength(2)
    first.mutate((state) => { state.counters.document += 1 })
    expect(createPreviewFiscalStore({ storage }).read().counters.document).toBe(3)
  })
  it('recupera JSON corrupto o incompatible sin propagar el daño', () => {
    const storage = memoryStorage({ [PREVIEW_STORE_KEY]: '{mal-json' })
    expect(createPreviewFiscalStore({ storage }).read().documents).toHaveLength(2)
    storage.setItem(PREVIEW_STORE_KEY, JSON.stringify({ version: 999 }))
    expect(createPreviewFiscalStore({ storage }).read().version).toBe(PREVIEW_STORE_VERSION)
  })
  it('reinicia solo la clave fiscal de Preview', () => {
    const storage = memoryStorage({ rat_user: '{"rol":"admin"}', otro: 'conservar' }); const store = createPreviewFiscalStore({ storage })
    store.read(); store.mutate((state) => { state.documents = [] }); store.reset()
    expect(store.read().documents).toHaveLength(2); expect(storage.getItem('rat_user')).toContain('admin'); expect(storage.getItem('otro')).toBe('conservar')
  })
})
