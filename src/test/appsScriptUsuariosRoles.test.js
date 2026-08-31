import { describe, expect, it } from 'vitest'
import { createAppsScriptHarness } from './appsScriptHarness'

function createHarness() {
  const harness = createAppsScriptHarness()
  harness.seed('Sesiones', [
    { Token: 'admin-token', Username: 'admin', UserID: 'USR-A', Rol: 'admin', Nombre: 'Admin', Expira: '2099-01-01T00:00:00.000Z' },
    { Token: 'contador-token', Username: 'contador', UserID: 'USR-C', Rol: 'contador', Nombre: 'Contador', Expira: '2099-01-01T00:00:00.000Z' },
  ])
  harness.seed('Usuarios', [
    { ID: 'USR-A', Nombre: 'Admin', Username: 'admin', Rol: 'admin', Activo: true },
    { ID: 'USR-C', Nombre: 'Contador', Username: 'contador', Rol: 'contador', Activo: true },
  ])
  return harness
}

describe('usuarios y roles internos', () => {
  it('permite crear más de 10 usuarios sin el límite operativo anterior', () => {
    const harness = createHarness()
    const base = [{ ID: 'USR-A', Nombre: 'Admin', Username: 'admin', Rol: 'admin', Activo: true }]
    for (let i = 1; i <= 10; i += 1) {
      base.push({ ID: `USR-${i}`, Nombre: `Usuario ${i}`, Username: `usuario${i}`, Rol: 'vendedor', Activo: true })
    }
    harness.seed('Usuarios', base)

    const result = harness.context.processRequest({
      action: 'addUsuario',
      token: 'admin-token',
      usuario: {
        nombre: 'Usuario 11',
        username: 'usuario11',
        password: 'Temporal123*',
        rol: 'vendedor',
      },
    })

    expect(result.success).toBe(true)
    expect(harness.objects('Usuarios').some(u => u.Username === 'usuario11')).toBe(true)
  })

  it('contador puede consultar usuarios para reportes pero no crear usuarios', () => {
    const harness = createHarness()

    const list = harness.context.processRequest({ action: 'getUsuarios', token: 'contador-token' })
    const create = harness.context.processRequest({
      action: 'addUsuario',
      token: 'contador-token',
      usuario: { nombre: 'No Permitido', username: 'nopermitido', password: 'x', rol: 'usuario' },
    })

    expect(list.success).toBe(true)
    expect(list.data.map(u => u.Username)).toContain('contador')
    expect(create.success).toBe(false)
    expect(create.error).toMatch(/administrador/i)
  })
})
