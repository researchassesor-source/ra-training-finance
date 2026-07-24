import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('estructura visual del módulo fiscal', () => {
  it('mantiene las siete secciones y acciones oficiales bloqueadas', async () => {
    const source = await readFile(new URL('./InvoiceFormModal.jsx', import.meta.url), 'utf8')
    for (const title of ['Datos de emisión', 'Adquirente', 'Detalle', 'Formas de pago', 'Campos adicionales', 'Totales', 'Acciones']) expect(source).toContain(title)
    expect(source).toContain('Firmar y enviar'); expect(source).toContain('disabled')
    expect(source).toContain('Agregar línea manual'); expect(source).toContain('Agregar forma de pago')
  })
  it('separa resumen, documentos, filtros y configuración fiscal', async () => {
    const view = await readFile(new URL('./FacturacionView.jsx', import.meta.url), 'utf8')
    const banner = await readFile(new URL('./FiscalBanner.jsx', import.meta.url), 'utf8')
    const runtime = await readFile(new URL('../../utils/fiscalRuntimeContext.js', import.meta.url), 'utf8')
    expect(view).toContain('Resumen'); expect(view).toContain('Documentos de prueba')
    expect(view).toContain('Emisión desde'); expect(view).toContain('Emisión hasta'); expect(view).toContain('Limpiar filtros')
    expect(view).toContain('Configuración fiscal'); expect(banner).toContain('resolveFiscalRuntimeContext')
    expect(view).toContain('Datos fiscales ficticios guardados temporalmente en este navegador')
    expect(view).toContain('onResetDemo={resetPreviewDemo}')
    expect(runtime).toContain('ENTORNO LOCAL DE DESARROLLO'); expect(runtime).toContain('NO CONECTADO AL SRI')
  })
  it('mantiene menú y ruta fiscal dentro del contrato exclusivo de administrador', async () => {
    const app = await readFile(new URL('../../App.jsx', import.meta.url), 'utf8')
    const sidebar = await readFile(new URL('../../layout/Sidebar.jsx', import.meta.url), 'utf8')
    expect(app).toContain('path="/facturacion" element={<RequireAdmin>')
    expect(sidebar).toContain('...(fiscalModuleAvailable ?')
    expect(sidebar).not.toContain("vendedorLinks ? [{ to: '/facturacion'")
    expect(sidebar).not.toContain("avalLinks ? [{ to: '/facturacion'")
  })
})
