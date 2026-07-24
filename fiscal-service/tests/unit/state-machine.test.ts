import { describe, expect, it } from 'vitest'
import { assertTransition, canTransition } from '../../src/domain/state-machine.js'

describe('máquina de estados', () => {
  it('permite el avance esperado', () => expect(canTransition('DRAFT', 'READY_TO_SIGN')).toBe(true))
  it('impide volver una autorización a borrador', () => expect(() => assertTransition('AUTHORIZED', 'DRAFT')).toThrow('inválida'))
})
