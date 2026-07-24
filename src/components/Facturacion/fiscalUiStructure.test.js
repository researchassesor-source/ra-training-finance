import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('estructura visual del módulo fiscal', () => {
  it('mantiene las siete secciones y acciones oficiales bloqueadas', async () => {
    const source = await readFile(new URL('./InvoiceFormModal.jsx', import.meta.url), 'utf8')
    for (const title of ['Datos de emisión', 'Adquirente', 'Detalle', 'Formas de pago', 'Campos adicionales', 'Totales', 'Acciones']) expect(source).toContain(title)
    expect(source).toContain('Firmar y enviar'); expect(source).toContain('disabled')
    expect(source).toContain('Agregar línea manual'); expect(source).toContain('Agregar forma de pago')
  })
  it('incluye catálogo, configuración, readiness y modo local explícito', async () => {
    const view = await readFile(new URL('./FacturacionView.jsx', import.meta.url), 'utf8')
    const banner = await readFile(new URL('./FiscalBanner.jsx', import.meta.url), 'utf8')
    expect(view).toContain('Catálogo fiscal'); expect(view).toContain('Configuración local')
    expect(banner).toContain('AMBIENTE LOCAL'); expect(banner).toContain('NO CONECTADO AL SRI')
  })
})
