import { getFiscalFeatureState } from '../../utils/fiscalFeature'
import { createHttpFiscalApi } from './httpFiscalApi'
import { createPreviewFiscalApi } from './previewFiscalApi'

function disabledPreviewApi() {
  const fail = async () => { throw new Error('La demostración fiscal fue bloqueada porque este entorno no es un Preview autorizado') }
  return new Proxy({ runtime: 'preview-blocked' }, { get: (target, key) => key in target ? target[key] : fail })
}

export function createFiscalApi({ env = import.meta.env, hostname = globalThis.location?.hostname || '', previewOptions, httpOptions } = {}) {
  const state = getFiscalFeatureState({ env, hostname })
  if (state.previewEnvironmentAllowed) return Object.assign(createPreviewFiscalApi(previewOptions), { runtime: 'browser-preview' })
  if (state.previewRequested) return disabledPreviewApi()
  return createHttpFiscalApi(httpOptions)
}
