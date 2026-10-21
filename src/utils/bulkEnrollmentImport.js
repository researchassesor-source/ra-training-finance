import { identificationError, IDENTIFICATION_TYPE, normalizeIdentificationType } from './identification'

export const BULK_IMPORT_COLUMNS = Object.freeze([
  'Tipo de identificación',
  'Identificación',
  'Nombres',
  'Apellidos',
  'Correo electrónico',
  'Celular',
])

const HEADER_ALIASES = Object.freeze({
  tipo: ['tipo de identificacion', 'tipo identificacion', 'tipo documento', 'identification type', 'document type'],
  identificacion: ['identificacion', 'cedula', 'n cedula', 'no cedula', 'numero cedula', 'numero de cedula', 'cedula ruc', 'ruc', 'n ruc', 'numero ruc', 'numero de ruc', 'documento', 'numero de documento', 'dni', 'document number'],
  nombres: ['nombres', 'nombre', 'first name', 'given names'],
  apellidos: ['apellidos', 'apellido', 'last name', 'surname'],
  email: ['correo electronico', 'correo', 'email', 'e mail'],
  celular: ['celular', 'telefono celular', 'telefono', 'mobile', 'phone'],
})

const TYPE_ALIASES = Object.freeze({
  cedula: IDENTIFICATION_TYPE.ECUADORIAN_ID,
  'cedula ecuatoriana': IDENTIFICATION_TYPE.ECUADORIAN_ID,
  ruc: IDENTIFICATION_TYPE.ECUADORIAN_RUC,
  pasaporte: IDENTIFICATION_TYPE.PASSPORT,
  passport: IDENTIFICATION_TYPE.PASSPORT,
  dni: IDENTIFICATION_TYPE.OTHER,
  otro: IDENTIFICATION_TYPE.OTHER,
  extranjero: IDENTIFICATION_TYPE.OTHER,
  'documento extranjero': IDENTIFICATION_TYPE.OTHER,
})

const normalizeHeader = value => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()

function columnIndexes(headers) {
  const normalized = headers.map(normalizeHeader)
  return Object.fromEntries(Object.entries(HEADER_ALIASES).map(([field, aliases]) => {
    const matches = normalized.map((header, index) => aliases.includes(header) ? index : -1).filter(index => index >= 0)
    return [field, matches.length === 1 ? matches[0] : -1]
  }))
}

function identityType(value, identification) {
  const label = normalizeHeader(value)
  if (label) return TYPE_ALIASES[label] || normalizeIdentificationType(value)
  if (/^\d{10}$/.test(identification)) return IDENTIFICATION_TYPE.ECUADORIAN_ID
  if (/^\d{13}$/.test(identification) && identification !== '9999999999999') return IDENTIFICATION_TYPE.ECUADORIAN_RUC
  return IDENTIFICATION_TYPE.UNSPECIFIED
}

function hasSafeNumericIdentifier(cell, value) {
  if (cell?.t !== 'n' || !Number.isSafeInteger(cell.v) || cell.v < 0) return false
  const text = String(value ?? '').trim()
  if (!/^\d{10}$|^\d{13}$/.test(text)) return false

  const format = String(cell.z || '').trim()
  const zeroPadded = (format === '0'.repeat(text.length)) && text.length === format.length
  const exactWidth = text === String(cell.v)
  return zeroPadded || exactWidth
}

function hasSafeNumericPhone(cell, value) {
  if (cell?.t !== 'n' || !Number.isSafeInteger(cell.v) || cell.v < 0) return false
  const text = String(value ?? '').trim()
  const format = String(cell.z || '').trim()
  return /^0{7,15}$/.test(format) && text.length === format.length && new RegExp(`^\\d{${format.length}}$`).test(text)
}

function identityKey(serviceId, type, identification) {
  return `${String(serviceId || '')}|${normalizeIdentificationType(type)}|${String(identification || '').trim().toUpperCase()}`
}

export function validateBulkEnrollmentRows(rows, { serviceId = '', existing = [] } = {}) {
  const seen = new Set()
  const existingKeys = new Set(existing
    .filter(item => String(item.ServicioID || '') === String(serviceId))
    .map(item => identityKey(serviceId, item.ClienteTipoIdentificacion, item.ClienteID)))

  return rows.map((source, index) => {
    const participante = { ...source }
    const errores = []
    participante.clienteTipoIdentificacion = identityType(
      participante.clienteTipoIdentificacion,
      String(participante.clienteID || '').trim(),
    )
    participante.clienteID = String(participante.clienteID || '').trim()
    participante.clienteNombre = String(participante.clienteNombre || '').trim().replace(/\s+/g, ' ')
    participante.clienteEmail = String(participante.clienteEmail || '').trim().toLowerCase()
    participante.clienteTelefono = String(participante.clienteTelefono || '').trim()

    if (participante._formula) errores.push('No se permiten fórmulas en las celdas del participante; reemplace la fórmula por el valor revisado.')
    if (participante._numericPhone) errores.push('El celular está guardado como número; convierta la columna a Texto para conservar el cero inicial.')
    if (participante._unsafeNumericId) errores.push('La identificación está guardada como número y puede haber perdido ceros iniciales; convierta la columna a Texto.')
    if (!participante.clienteNombre) errores.push('Falta el nombre completo.')
    const idError = identificationError(participante.clienteID, participante.clienteTipoIdentificacion, { required: true })
    if (idError) errores.push(idError)
    if (!participante.clienteEmail) errores.push('Falta el correo electrónico.')
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(participante.clienteEmail)) errores.push('El correo electrónico no es válido.')
    if (!participante.clienteTelefono) errores.push('Falta el celular.')
    else if (!/^\+?[0-9().\s-]{7,20}$/.test(participante.clienteTelefono)) errores.push('El celular debe tener entre 7 y 20 caracteres numéricos.')

    const key = identityKey(serviceId, participante.clienteTipoIdentificacion, participante.clienteID)
    const duplicate = Boolean(serviceId && participante.clienteID && (
      seen.has(key) || existingKeys.has(key)
      || existing.some(item => String(item.ServicioID || '') === String(serviceId)
        && String(item.ClienteID || '').trim().toUpperCase() === participante.clienteID.toUpperCase()
        && (!item.ClienteTipoIdentificacion || !participante.clienteTipoIdentificacion
          || normalizeIdentificationType(item.ClienteTipoIdentificacion) === normalizeIdentificationType(participante.clienteTipoIdentificacion)))
    ))
    if (participante.clienteID) seen.add(key)
    if (duplicate) errores.push('Ya existe una inscripción para esta persona en el servicio seleccionado.')

    return {
      ...participante,
      rowNumber: Number(participante.rowNumber) || index + 2,
      duplicate,
      errors: errores,
      valid: errores.length === 0,
    }
  })
}

export async function readBulkEnrollmentFile(file) {
  if (!file) throw new Error('Seleccione un archivo Excel.')
  if (file.size > 8 * 1024 * 1024) throw new Error('El archivo supera el máximo de 8 MB.')
  if (!/\.(xlsx|xls|csv)$/i.test(file.name || '')) throw new Error('Use un archivo .xlsx, .xls o .csv.')

  const XLSX = await import('xlsx')
  const fileBytes = new Uint8Array(await file.arrayBuffer())
  const workbook = XLSX.read(fileBytes, { type: 'array', cellFormula: true, cellNF: true, raw: false })
  const sheetName = workbook.SheetNames?.[0]
  const sheet = sheetName && workbook.Sheets[sheetName]
  if (!sheet) throw new Error('El archivo no contiene una primera hoja para participantes.')
  const usedRange = sheet['!ref'] ? XLSX.utils.decode_range(sheet['!ref']) : null
  if (!usedRange) throw new Error('La hoja de participantes no contiene celdas utilizadas.')
  if (usedRange.e.r > 9999) throw new Error('La hoja supera las 10.000 filas permitidas. Quite las filas vacías del final y vuelva a intentarlo.')
  if (usedRange.e.c > 255) throw new Error('La hoja contiene más de 256 columnas. Use la plantilla de carga masiva.')
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '', blankrows: true })
  if (!matrix.length) throw new Error('La hoja de participantes está vacía.')

  const indexes = columnIndexes(matrix[0])
  const missing = Object.entries({ identificacion: 'Identificación', nombres: 'Nombres', apellidos: 'Apellidos', email: 'Correo electrónico', celular: 'Celular' })
    .filter(([field]) => indexes[field] < 0)
    .map(([, label]) => label)
  if (missing.length) throw new Error(`Faltan columnas obligatorias: ${missing.join(', ')}. Descargue la plantilla para ver el formato.`)

  const records = []
  matrix.slice(1).forEach((cells, index) => {
    const rowNumber = index + 2
    const value = field => indexes[field] < 0 ? '' : String(cells[indexes[field]] ?? '').trim()
    const participantFields = ['tipo', 'identificacion', 'nombres', 'apellidos', 'email', 'celular']
    const rawValues = participantFields.filter(field => indexes[field] >= 0).map(field => ({
      field,
      column: indexes[field],
      cell: sheet[XLSX.utils.encode_cell({ r: rowNumber - 1, c: indexes[field] })],
    }))
    if (rawValues.some(({ cell }) => cell?.f)) {
      records.push({ rowNumber, clienteNombre: `${value('nombres')} ${value('apellidos')}`.trim(), clienteID: value('identificacion'), clienteEmail: value('email'), clienteTelefono: value('celular'), clienteTipoIdentificacion: identityType(value('tipo'), value('identificacion')), _formula: true })
      return
    }
    const idCell = rawValues.find(item => item.field === 'identificacion')?.cell
    const phoneCell = rawValues.find(item => item.field === 'celular')?.cell
    const phoneIsUnsafeNumber = phoneCell?.t === 'n' && !hasSafeNumericPhone(phoneCell, value('celular'))
    const idIsUnsafeNumber = idCell?.t === 'n' && !hasSafeNumericIdentifier(idCell, value('identificacion'))
    records.push({
      rowNumber,
      clienteNombre: `${value('nombres')} ${value('apellidos')}`.trim(),
      clienteID: value('identificacion'),
      clienteEmail: value('email'),
      clienteTelefono: value('celular'),
      clienteTipoIdentificacion: identityType(value('tipo'), value('identificacion')),
      _numericPhone: phoneIsUnsafeNumber,
      _unsafeNumericId: idIsUnsafeNumber,
    })
  })

  const nonEmpty = records.filter(row => row.clienteNombre || row.clienteID || row.clienteEmail || row.clienteTelefono)
  if (!nonEmpty.length) throw new Error('No se encontraron participantes debajo de los encabezados.')
  if (nonEmpty.length > 100) throw new Error('La carga permite hasta 100 participantes por lote.')
  return nonEmpty
}

export async function downloadBulkEnrollmentTemplate() {
  const XLSX = await import('xlsx')
  const workbook = XLSX.utils.book_new()
  const participants = XLSX.utils.aoa_to_sheet([BULK_IMPORT_COLUMNS])
  participants['!cols'] = [{ wch: 26 }, { wch: 22 }, { wch: 25 }, { wch: 25 }, { wch: 34 }, { wch: 20 }]
  XLSX.utils.book_append_sheet(workbook, participants, 'Participantes')

  const instructions = XLSX.utils.aoa_to_sheet([
    ['Instrucciones para la carga masiva'],
    ['Complete una fila por participante. No agregue datos de pago ni indique que un pago está verificado.'],
    ['Identificación, nombres, apellidos, correo y celular son obligatorios.'],
    ['Use CEDULA_EC, RUC_EC, PASAPORTE u OTRO como tipo. Puede dejarlo vacío solo para una cédula de 10 dígitos, que se inferirá automáticamente.'],
    ['Antes de escribir identificaciones y celulares, configure esas columnas como Texto para conservar ceros iniciales.'],
    ['El archivo se procesa en este navegador y no se almacena ni se adjunta al servidor.'],
  ])
  instructions['!cols'] = [{ wch: 112 }]
  XLSX.utils.book_append_sheet(workbook, instructions, 'Instrucciones')
  XLSX.writeFileXLSX(workbook, 'plantilla_participantes_ra_training.xlsx')
}
