import { createPreviewSeed, PREVIEW_STORE_KEY, PREVIEW_STORE_VERSION } from './previewFiscalSeed'

const memoryData = new Map()

const memoryStorage = {
  getItem: (key) => memoryData.get(key) ?? null,
  setItem: (key, value) => memoryData.set(key, String(value)),
  removeItem: (key) => memoryData.delete(key),
}

const clone = (value) => structuredClone(value)

export function isValidPreviewState(value) {
  return Boolean(value
    && value.version === PREVIEW_STORE_VERSION
    && Number.isInteger(value.revision)
    && Array.isArray(value.sources)
    && Array.isArray(value.catalog)
    && Array.isArray(value.paymentMethods)
    && Array.isArray(value.documents)
    && value.config && typeof value.config === 'object'
    && value.readiness && typeof value.readiness === 'object'
    && value.events && typeof value.events === 'object' && !Array.isArray(value.events)
    && value.transmissions && typeof value.transmissions === 'object' && !Array.isArray(value.transmissions)
    && value.counters && Object.values(value.counters).every(Number.isInteger))
}

function resolveStorage(storage) {
  if (storage) return storage
  try {
    const candidate = globalThis.localStorage
    if (!candidate) return memoryStorage
    const probe = `${PREVIEW_STORE_KEY}:probe`
    candidate.setItem(probe, '1'); candidate.removeItem(probe)
    return candidate
  } catch { return memoryStorage }
}

export function createPreviewFiscalStore({ storage } = {}) {
  const target = resolveStorage(storage)

  function persist(state) {
    target.setItem(PREVIEW_STORE_KEY, JSON.stringify(state))
    return clone(state)
  }

  function seed() {
    return persist(createPreviewSeed())
  }

  function read() {
    try {
      const raw = target.getItem(PREVIEW_STORE_KEY)
      if (!raw) return seed()
      const parsed = JSON.parse(raw)
      return isValidPreviewState(parsed) ? clone(parsed) : seed()
    } catch { return seed() }
  }

  function mutate(mutator) {
    // localStorage serializa cada escritura. La revisión reduce pérdidas accidentales
    // entre pestañas, pero este mecanismo es deliberadamente solo para demostración.
    const current = read()
    const draft = clone(current)
    const result = mutator(draft)
    draft.version = PREVIEW_STORE_VERSION
    draft.revision = current.revision + 1
    if (!isValidPreviewState(draft)) throw new Error('La operación produjo un estado de Preview inválido')
    persist(draft)
    return clone(result === undefined ? draft : result)
  }

  function reset() {
    target.removeItem(PREVIEW_STORE_KEY)
    return seed()
  }

  return { key: PREVIEW_STORE_KEY, read, mutate, reset }
}
