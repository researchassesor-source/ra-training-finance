import { describe, expect, it } from 'vitest'
import { toDateInput } from './formatters'

describe('toDateInput', () => {
  it('acepta YYYY-MM-DD e ISO sin desplazar el día', () => {
    expect(toDateInput('2024-07-21')).toBe('2024-07-21')
    expect(toDateInput('2024-07-21T00:00:00.000Z')).toBe('2024-07-21')
  })

  it('convierte dd/mm/yyyy sin invertir día y mes', () => {
    expect(toDateInput('03/02/2024')).toBe('2024-02-03')
  })

  it('rechaza una cadena no reconocida en lugar de truncarla', () => {
    expect(toDateInput('fecha inválida')).toBe('')
    expect(toDateInput('31/02/2024')).toBe('')
  })
})
