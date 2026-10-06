import { describe, expect, it } from 'vitest'
import { createAppsScriptHarness } from './appsScriptHarness'

describe('compatibilidad de DNI en Apps Script', () => {
  it('acepta DNI como etiqueta nueva sin cambiar el valor OTRO de registros históricos', () => {
    const app = createAppsScriptHarness()
    expect(app.context.normalizarTipoIdentificacion_('DNI')).toBe('OTRO')
    expect(app.context.normalizarTipoIdentificacion_('OTRO')).toBe('OTRO')
  })
})
