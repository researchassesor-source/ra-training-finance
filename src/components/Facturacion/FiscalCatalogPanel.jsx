import { useRef, useState } from 'react'
import { FileJson2, FileSpreadsheet, LockKeyhole, Search } from 'lucide-react'
import { importFiscalCatalogCsv, importFiscalCatalogJson } from '../../utils/fiscalCatalogImport'

export default function FiscalCatalogPanel({ catalog }) {
  const [importedItems, setImportedItems] = useState([])
  const [importMessage, setImportMessage] = useState('')
  const jsonInput = useRef(null)
  const csvInput = useRef(null)
  const items = importedItems.length ? importedItems : (catalog?.items || [])

  const importFile = async (event, parser) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const imported = parser(await file.text())
      setImportedItems(imported)
      setImportMessage(`${imported.length} servicio(s) importado(s) solo en memoria local; todos requieren revisión tributaria.`)
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : 'No se pudo importar el archivo')
    }
  }

  return <div className="space-y-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-semibold">Catálogo fiscal</h2><p className="text-sm text-gray-500">Mapeo local entre Servicios y la clasificación tributaria.</p></div><div className="flex flex-wrap gap-2"><input ref={jsonInput} className="hidden" type="file" accept="application/json,.json" onChange={(event) => importFile(event, importFiscalCatalogJson)} /><input ref={csvInput} className="hidden" type="file" accept="text/csv,.csv" onChange={(event) => importFile(event, importFiscalCatalogCsv)} /><button className="btn-secondary" type="button" onClick={() => jsonInput.current?.click()}><FileJson2 size={16} /> Importar JSON</button><button className="btn-secondary" type="button" onClick={() => csvInput.current?.click()}><FileSpreadsheet size={16} /> Importar CSV</button></div></div>{importMessage && <div role="status" className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">{importMessage}</div>}<div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><p className="flex items-center gap-2 font-semibold"><LockKeyhole size={17} /> Integración remota deshabilitada</p><p className="mt-1 text-xs">Proveedor: {catalog?.provider || 'MockOperationalServicesProvider'} · Datos remotos utilizados: {catalog?.remoteDataUsed ? 'sí' : 'no'} · `VITE_FISCAL_USE_EXISTING_APP_DATA=false`.</p></div><div className="card p-0 overflow-hidden"><div className="flex items-center gap-2 border-b px-4 py-3 text-sm font-semibold"><Search size={16} /> Servicios ficticios</div><div className="divide-y">{items.map((item) => <article key={item.operationalId} className="grid gap-3 p-4 text-sm md:grid-cols-[130px_1fr_150px_170px]"><div><p className="text-xs text-gray-500">ID operativo</p><p className="font-mono text-xs">{item.operationalId}</p><p className="mt-1 font-mono text-xs text-brand-700">{item.mainCode}</p></div><div><p className="font-semibold">{item.operationalName}</p><p className="mt-1 text-xs text-gray-500">{item.invoiceDescription}</p></div><div><p className="text-xs text-gray-500">Precio referencia</p><p className="font-semibold">${item.referencePrice}</p><p className="mt-1 text-xs text-gray-500">Impuesto: sin clasificar</p></div><div className="md:text-right"><span className="badge-yellow">REQUIERE REVISIÓN TRIBUTARIA</span><p className="mt-2 text-xs text-gray-500">Inactivo para facturación oficial</p></div></article>)}</div></div></div>
}
