import { useRef, useState } from 'react'
import { FileJson2, FileSpreadsheet, Info, LockKeyhole, Search } from 'lucide-react'
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
      setImportMessage(`${imported.length} servicio(s) importado(s) temporalmente; todos requieren revisión tributaria.`)
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : 'No se pudo importar el archivo')
    }
  }

  return <div className="space-y-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-semibold">Catálogo fiscal</h2><p className="text-sm text-gray-500">Clasificación tributaria de los servicios que podrán facturarse.</p></div><div className="flex flex-wrap gap-2"><input ref={jsonInput} className="hidden" type="file" accept="application/json,.json" onChange={(event) => importFile(event, importFiscalCatalogJson)} /><input ref={csvInput} className="hidden" type="file" accept="text/csv,.csv" onChange={(event) => importFile(event, importFiscalCatalogCsv)} /><button className="btn-secondary" type="button" onClick={() => jsonInput.current?.click()}><FileJson2 size={16} /> Importar JSON</button><button className="btn-secondary" type="button" onClick={() => csvInput.current?.click()}><FileSpreadsheet size={16} /> Importar CSV</button></div></div>{importMessage && <div role="status" className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">{importMessage}</div>}<div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><p className="flex items-center gap-2 font-semibold"><LockKeyhole size={17} /> Catálogo institucional aún no conectado</p><p className="mt-1 text-xs">Actualmente se utilizan datos de prueba. La conexión con Servicios permanece deshabilitada.</p></div><div className="card p-0 overflow-hidden"><div className="flex items-center gap-2 border-b px-4 py-3 text-sm font-semibold"><Search size={16} /> Servicios de prueba</div><div className="divide-y">{items.map((item) => <article key={item.operationalId} className="grid gap-3 p-4 text-sm md:grid-cols-[130px_minmax(0,1fr)_150px_170px]"><div><p className="text-xs text-gray-500">ID operativo</p><p className="break-all font-mono text-xs">{item.operationalId}</p><p className="mt-1 font-mono text-xs text-brand-700">{item.mainCode}</p></div><div><p className="font-semibold">{item.operationalName}</p><p className="mt-1 text-xs text-gray-500">{item.invoiceDescription}</p></div><div><p className="text-xs text-gray-500">Precio referencia</p><p className="font-semibold">${item.referencePrice}</p><p className="mt-1 text-xs text-gray-500">Impuesto: sin clasificar</p></div><div className="md:text-right"><span className="badge-yellow">REQUIERE REVISIÓN TRIBUTARIA</span><p className="mt-2 text-xs text-gray-500">Inactivo para facturación oficial</p></div></article>)}</div></div><details className="card text-sm"><summary className="flex cursor-pointer items-center gap-2 font-semibold text-brand-900"><Info size={16} /> Información técnica</summary><dl className="mt-3 grid grid-cols-[150px_minmax(0,1fr)] gap-2 text-xs"><dt className="text-gray-500">Proveedor actual</dt><dd className="break-all font-mono">{catalog?.provider || 'MockOperationalServicesProvider'}</dd><dt className="text-gray-500">Datos remotos</dt><dd>{catalog?.remoteDataUsed ? 'Utilizados' : 'No utilizados'}</dd><dt className="text-gray-500">Integración existente</dt><dd>Deshabilitada por configuración</dd></dl></details></div>
}
