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

  it('permite combinar vendedor y moodle sin perder permisos al iniciar sesion', () => {
    const harness = createHarness()

    const create = harness.context.processRequest({
      action: 'addUsuario',
      token: 'admin-token',
      usuario: {
        nombre: 'Angel Espinoza',
        username: 'angel',
        password: 'Temporal123*',
        roles: ['vendedor', 'moodle'],
      },
    })
    const login = harness.context.processRequest({
      action: 'login',
      username: 'angel',
      password: 'Temporal123*',
    })

    expect(create.success).toBe(true)
    expect(login.success).toBe(true)
    expect(login.user.rol).toBe('vendedor')
    expect(login.user.roles).toEqual(['vendedor', 'moodle'])
    expect(harness.objects('Sesiones')[2].Roles).toBe('["vendedor","moodle"]')
  })

  it('invalida todas las sesiones al cambiar permisos y conserva la sesión del administrador que realiza el cambio', () => {
    const harness = createHarness()
    harness.seed('Sesiones', [
      { Token: 'admin-token', Username: 'admin', UserID: 'USR-A', Rol: 'admin', Nombre: 'Admin', Expira: '2099-01-01T00:00:00.000Z' },
      { Token: 'contador-token', Username: 'contador', UserID: 'USR-C', Rol: 'contador', Nombre: 'Contador', Expira: '2099-01-01T00:00:00.000Z' },
      { Token: 'contador-secundario', Username: 'contador', UserID: 'USR-C', Rol: 'contador', Nombre: 'Contador', Expira: '2099-01-01T00:00:00.000Z' },
    ])

    const update = harness.context.processRequest({
      action: 'updateUsuario', token: 'admin-token', id: 'USR-C',
      usuario: { nombre: 'Contador', username: 'contador', email: '', roles: ['vendedor'], activo: true },
    })
    const oldSessionRequest = harness.context.processRequest({ action: 'getUsuarios', token: 'contador-token' })
    const adminRequest = harness.context.processRequest({ action: 'getUsuarios', token: 'admin-token' })

    expect(update.success).toBe(true)
    expect(oldSessionRequest).toEqual({ success: false, error: 'Sesión inválida o expirada. Por favor inicia sesión de nuevo.' })
    expect(adminRequest.success).toBe(true)
    const remainingTokens = harness.objects('Sesiones').map(session => session.Token)
    expect(remainingTokens).toContain('admin-token')
    expect(remainingTokens).not.toContain('contador-token')
    expect(remainingTokens).not.toContain('contador-secundario')
  })

  it('falla cerrado si no puede revocar sesiones antes de cambiar permisos', () => {
    const harness = createHarness()
    const sessions = harness.ensureSheet('Sesiones')
    sessions.deleteRow = () => { throw new Error('fallo simulado de almacenamiento') }

    const update = harness.context.processRequest({
      action: 'updateUsuario', token: 'admin-token', id: 'USR-C',
      usuario: { nombre: 'Contador', username: 'contador', email: '', roles: ['vendedor'], activo: true },
    })

    expect(update.success).toBe(false)
    expect(update.error).toMatch(/no se pudieron invalidar/i)
    expect(harness.objects('Usuarios').find(user => user.ID === 'USR-C').Rol).toBe('contador')
    expect(harness.context.processRequest({ action: 'getUsuarios', token: 'contador-token' }).success).toBe(true)
  })

  it('no elimina una cuenta si no puede revocar primero sus sesiones', () => {
    const harness = createHarness()
    const sessions = harness.ensureSheet('Sesiones')
    sessions.deleteRow = () => { throw new Error('fallo simulado de almacenamiento') }

    const result = harness.context.processRequest({ action: 'deleteUsuario', token: 'admin-token', id: 'USR-C' })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/no se pudieron invalidar/i)
    expect(harness.objects('Usuarios').some(user => user.ID === 'USR-C')).toBe(true)
    expect(harness.context.processRequest({ action: 'getUsuarios', token: 'contador-token' }).success).toBe(true)
  })

  it('no invalida sesiones al editar únicamente datos de perfil', () => {
    const harness = createHarness()
    const result = harness.context.processRequest({
      action: 'updateUsuario', token: 'admin-token', id: 'USR-C',
      usuario: { nombre: 'Contador actualizado', username: 'contador', email: 'contador@example.com', roles: ['contador'], activo: true },
    })

    expect(result.success).toBe(true)
    expect(harness.context.processRequest({ action: 'getUsuarios', token: 'contador-token' }).success).toBe(true)
  })

  it.each([
    ['desactivar cuenta', { nombre: 'Contador', username: 'contador', email: '', roles: ['contador'], activo: false }],
    ['cambiar contraseña', { nombre: 'Contador', username: 'contador', email: '', roles: ['contador'], activo: true, password: 'NuevaClaveSegura123!' }],
    ['cambiar nombre de usuario', { nombre: 'Contador', username: 'contador.nuevo', email: '', roles: ['contador'], activo: true }],
  ])('invalida la sesión al %s', (_change, usuario) => {
    const harness = createHarness()
    const update = harness.context.processRequest({ action: 'updateUsuario', token: 'admin-token', id: 'USR-C', usuario })
    const staleSession = harness.context.processRequest({ action: 'getUsuarios', token: 'contador-token' })

    expect(update.success).toBe(true)
    expect(staleSession).toEqual({ success: false, error: 'Sesión inválida o expirada. Por favor inicia sesión de nuevo.' })
  })
})
