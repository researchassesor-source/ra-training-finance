import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, Download, FileSpreadsheet, Loader2, Upload } from 'lucide-react'
import { api } from '../../services/api'
import { fmt } from '../../utils/formatters'
import { validateBulkEnrollmentRows, readBulkEnrollmentFile, downloadBulkEnrollmentTemplate } from '../../utils/bulkEnrollmentImport'

const activeService = service => service?.Activo === true || String(service?.Activo || '').toUpperCase() === 'TRUE'

function createBatchId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  if (!globalThis.crypto?.getRandomValues) throw new Error('Este navegador no permite crear un identificador seguro para el lote.')
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function maskIdentification(value) {
  const text = String(value || '')
  if (text.length < 6) return '••••'
  return `${'•'.repeat(Math.max(4, text.length - 4))}${text.slice(-4)}`
}

export default function ImportarInscripcionesMasivoModal({ servicios = [], onClose, onImported }) {
  const services = useMemo(() => servicios.filter(activeService), [servicios])
  const [serviceId, setServiceId] = useState('')
  const [fileName, setFileName] = useState('')
  const [sourceRows, setSourceRows] = useState([])
  const [existing, setExisting] = useState([])
  const [loadingExisting, setLoadingExisting] = useState(true)
  const [existingError, setExistingError] = useState('')
  const [readingFile, setReadingFile] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [batchId, setBatchId] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  useEffect(() => {
    let current = true
    api.getInscripciones({})
      .then(response => { if (current) setExisting(response.data || []) })
      .catch(err => { if (current) setExistingError(`No se pudieron revisar duplicados existentes: ${err.message}`) })
      .finally(() => { if (current) setLoadingExisting(false) })
    return () => { current = false }
  }, [])

  async function refreshExisting() {
    setLoadingExisting(true)
    setExistingError('')
    try {
      const response = await api.getInscripciones({})
      setExisting(response.data || [])
    } catch (err) {
      setExistingError(`No se pudieron revisar duplicados existentes: ${err.message}`)
    } finally {
      setLoadingExisting(false)
    }
  }

  const selectedService = services.find(service => String(service.ID) === serviceId)
  const preview = useMemo(() => validateBulkEnrollmentRows(sourceRows, { serviceId, existing }), [sourceRows, serviceId, existing])
  const validRows = preview.filter(row => row.valid)
  const skippedRows = preview.length - validRows.length
  const amount = Math.max(0, Number(selectedService?.Precio) || 0)
  const totalAmount = amount * validRows.length

  async function handleFile(file) {
    if (!file) return
    setError('')
    setResult(null)
    setConfirmed(false)
    setReadingFile(true)
    try {
      const rows = await readBulkEnrollmentFile(file)
      setFileName(file.name)
      setSourceRows(rows)
      setBatchId(createBatchId())
    } catch (err) {
      setFileName('')
      setSourceRows([])
      setBatchId('')
      setError(err.message || 'No se pudo leer el archivo.')
    } finally {
      setReadingFile(false)
    }
  }

  async function handleTemplate() {
    setError('')
    try { await downloadBulkEnrollmentTemplate() }
    catch (err) { setError(err.message || 'No se pudo generar la plantilla.') }
  }

  async function handleImport() {
    if (!selectedService) return setError('Seleccione un servicio activo.')
    if (loadingExisting) return setError('Espere a que termine la revisión de duplicados.')
    if (existingError) return setError('No se puede importar hasta completar la revisión de duplicados.')
    if (!sourceRows.length || !validRows.length) return setError('No hay filas válidas para importar.')
    if (!confirmed) return setError('Confirme el efecto financiero antes de continuar.')
    setSaving(true)
    setError('')
    try {
      const response = await api.importarInscripcionesMasivo({
        batchId: batchId || createBatchId(),
        servicioId: selectedService.ID,
        participantes: validRows.map(row => ({
          rowNumber: row.rowNumber,
          clienteTipoIdentificacion: row.clienteTipoIdentificacion,
          clienteID: row.clienteID,
          clienteNombre: row.clienteNombre,
          clienteEmail: row.clienteEmail,
          clienteTelefono: row.clienteTelefono,
        })),
      })
      setResult(response.data || null)
      if (!response.data?.errores) setConfirmed(false)
      await onImported?.()
    } catch (err) {
      setError(err.message || 'La carga no pudo completarse. Puede volver a intentar con el mismo archivo; el lote evita duplicados.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Carga masiva de participantes</h3>
          <p className="mt-1 text-sm text-gray-600">Revise el archivo y corrija los datos antes de crear las inscripciones.</p>
        </div>
        <button type="button" onClick={handleTemplate} className="btn-secondary text-sm">
          <Download size={15} /> Descargar plantilla
        </button>
      </div>

      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        El Excel se lee en este navegador y no se sube como archivo. Al importar, los datos de las filas válidas se envían a R.A. Training Finance para crear inscripciones e ingresos pendientes. La vista previa avisa si una identificación o celular puede haber perdido ceros iniciales.
      </div>

      <div className="grid gap-4 md:grid-cols-[1.1fr_1fr]">
        <label className="block">
          <span className="label">Servicio / curso *</span>
          <select className="input" value={serviceId} onChange={event => {
            setServiceId(event.target.value)
            setBatchId(createBatchId())
            setConfirmed(false)
            setResult(null)
          }}>
            <option value="">Seleccionar servicio...</option>
            {services.map(service => <option key={service.ID} value={service.ID}>{service.Nombre}</option>)}
          </select>
          {!services.length && <span className="mt-1 block text-xs text-amber-700">No hay servicios activos disponibles.</span>}
        </label>

        <div>
          <span className="label">Archivo Excel *</span>
          <label className={`flex min-h-[42px] cursor-pointer items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm hover:border-brand-500 ${readingFile ? 'opacity-60' : ''}`}>
            {readingFile ? <Loader2 size={17} className="animate-spin text-brand-700" /> : <FileSpreadsheet size={17} className="text-brand-700" />}
            <span className="min-w-0 flex-1 truncate">{readingFile ? 'Leyendo archivo…' : fileName || 'Seleccionar .xlsx, .xls o .csv'}</span>
            <Upload size={15} className="text-gray-500" />
            <input
              className="sr-only"
              type="file"
              accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
              disabled={readingFile || saving}
              onChange={event => { handleFile(event.target.files?.[0]); event.target.value = '' }}
            />
          </label>
        </div>
      </div>

      {sourceRows.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-gray-200 px-3 py-2"><div className="text-xl font-semibold text-gray-900">{preview.length}</div><div className="text-xs text-gray-600">Filas leídas</div></div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2"><div className="text-xl font-semibold text-emerald-800">{validRows.length}</div><div className="text-xs text-emerald-800">Listas para importar</div></div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2"><div className="text-xl font-semibold text-amber-800">{skippedRows}</div><div className="text-xs text-amber-800">Con error o duplicadas</div></div>
            <div className="rounded-lg border border-gray-200 px-3 py-2"><div className="text-xl font-semibold text-brand-700">{fmt.usd(totalAmount)}</div><div className="text-xs text-gray-600">Pendiente total a registrar</div></div>
          </div>

          <div className="overflow-hidden rounded-lg border border-gray-200">
            <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-3 py-2 text-sm">
              <span className="font-medium text-gray-800">Vista previa · {fileName}</span>
              <span className="text-xs text-gray-500">Se muestra la identificación parcialmente oculta</span>
            </div>
            <div className="max-h-72 overflow-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="sticky top-0 bg-white text-gray-500 shadow-sm">
                  <tr><th className="px-3 py-2">Fila</th><th className="px-3 py-2">Participante</th><th className="px-3 py-2">Identificación</th><th className="px-3 py-2">Correo</th><th className="px-3 py-2">Celular</th><th className="px-3 py-2">Revisión</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {preview.map(row => (
                    <tr key={`${row.rowNumber}-${row.clienteID}`} className={row.valid ? '' : 'bg-amber-50/60'}>
                      <td className="whitespace-nowrap px-3 py-2 text-gray-500">{row.rowNumber}</td>
                      <td className="min-w-40 px-3 py-2 font-medium text-gray-800">{row.clienteNombre || '—'}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-gray-600">{maskIdentification(row.clienteID)}</td>
                      <td className="min-w-44 px-3 py-2 text-gray-600">{row.clienteEmail || '—'}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-gray-600">{row.clienteTelefono || '—'}</td>
                      <td className="min-w-56 px-3 py-2">
                        {row.valid
                          ? <span className="inline-flex items-center gap-1 font-medium text-emerald-700"><Check size={13} /> Lista</span>
                          : <span className="text-amber-800">{row.errors.join(' ')}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {selectedService && (
            <label className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-950">
              <input className="mt-1" type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={saving || !validRows.length} />
              <span>
                Confirmo que se crearán {validRows.length} inscripción(es) y un ingreso <strong>pendiente de verificación</strong> por participante, a la tarifa actual de {fmt.usd(amount)} cada una ({fmt.usd(totalAmount)} en total). Ningún pago quedará verificado ni se emitirán o enviarán certificados automáticamente.
                {skippedRows > 0 && <span className="mt-1 block">Las {skippedRows} filas con errores o duplicados se omitirán; corrija el Excel y vuelva a cargarlo para incluirlas.</span>}
              </span>
            </label>
          )}
        </>
      )}

      {loadingExisting && <p className="text-xs text-gray-500">Revisando inscripciones existentes para detectar duplicados…</p>}
      {existingError && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"><span>{existingError} No se habilitará la importación hasta completar esta revisión.</span><button type="button" className="btn-secondary text-xs" onClick={refreshExisting} disabled={loadingExisting}>Reintentar revisión</button></div>}
      {error && <div role="alert" className="flex gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"><AlertTriangle size={17} className="mt-0.5 shrink-0" />{error}</div>}

      {result && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${result.errores ? 'border-amber-300 bg-amber-50 text-amber-950' : 'border-emerald-300 bg-emerald-50 text-emerald-950'}`}>
          <p className="font-semibold">{result.errores ? 'Lote aplicado parcialmente' : 'Lote procesado'}</p>
          <p className="mt-1">Nuevas: {result.creadas || 0} · Ya importadas: {result.yaImportadas || 0} · Duplicadas omitidas: {result.duplicadas || 0} · Filas con error: {result.errores || 0}.</p>
          <p className="mt-1 text-xs">Los pagos permanecen pendientes y los certificados conservan su flujo normal de emisión y entrega.</p>
          {result.results?.some(row => row.status === 'error') && <ul className="mt-2 list-inside list-disc text-xs">{result.results.filter(row => row.status === 'error').slice(0, 10).map(row => <li key={row.rowNumber}>Fila {row.rowNumber}: {row.error}</li>)}</ul>}
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-4">
        <button type="button" onClick={onClose} className="btn-secondary text-sm">{result ? 'Cerrar' : 'Cancelar'}</button>
        {(!result || result.errores > 0) && <button
          type="button"
          onClick={handleImport}
          disabled={saving || readingFile || loadingExisting || !!existingError || !selectedService || !validRows.length || !confirmed}
          className="btn-primary text-sm"
        >
          {saving ? <><Loader2 size={15} className="animate-spin" /> Importando…</> : <><Upload size={15} /> {result?.errores ? 'Reintentar filas pendientes' : `Importar ${validRows.length} participante${validRows.length === 1 ? '' : 's'}`}</>}
        </button>}
      </div>
    </div>
  )
}
