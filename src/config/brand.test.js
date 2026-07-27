import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { BRAND } from './brand'

const root = process.cwd()

describe('identidad corporativa', () => {
  it('expone el nombre y subtítulo aprobados', () => {
    expect(BRAND.fullName).toBe('R.A. Training Finance')
    expect(BRAND.subtitle).toBe('Sistema de gestión financiera y certificación')
  })

  it('declara tokens y recursos principales', () => {
    const css = fs.readFileSync(path.join(root, 'src/index.css'), 'utf8')
    expect(css).toContain('--brand-primary: #114899')
    expect(css).toContain('--brand-secondary: #f1871a')
    expect(fs.existsSync(path.join(root, 'src/assets/brand/logo-ra-training.webp'))).toBe(true)
    expect(fs.existsSync(path.join(root, 'src/assets/brand/mascot-ra-training.webp'))).toBe(true)
    expect(fs.existsSync(path.join(root, 'public/favicon.png'))).toBe(true)
  })

  it('incluye metadatos públicos coherentes', () => {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
    expect(html).toContain('<title>R.A. Training Finance</title>')
    expect(html).toContain('Sistema de gestión financiera y certificación')
    expect(html).toContain('/favicon.png')
  })
})
