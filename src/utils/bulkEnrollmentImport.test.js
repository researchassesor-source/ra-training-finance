import { describe, expect, it } from 'vitest'
import { IDENTIFICATION_TYPE } from './identification'
import { BULK_IMPORT_COLUMNS, validateBulkEnrollmentRows, readBulkEnrollmentFile } from './bulkEnrollmentImport'

const participant = overrides => ({
  rowNumber: 2,
  clienteTipoIdentificacion: IDENTIFICATION_TYPE.ECUADORIAN_ID,
  clienteID: '0601234560',
  clienteNombre: 'Ana Pérez',
  clienteEmail: 'ana@example.com',
  clienteTelefono: '0999999999',
  ...overrides,
})

describe('validación de importación masiva de participantes', () => {
  it('acepta filas completas y normaliza correo/espacios', () => {
    const [row] = validateBulkEnrollmentRows([participant({ clienteNombre: '  Ana   Pérez ', clienteEmail: ' ANA@EXAMPLE.COM ' })], { serviceId: 'SRV-1' })
    expect(row).toMatchObject({ valid: true, clienteNombre: 'Ana Pérez', clienteEmail: 'ana@example.com', rowNumber: 2 })
  })

  it('marca errores de identificación, correo, celular y duplicados locales/remotos', () => {
    const rows = validateBulkEnrollmentRows([
      participant(),
      participant({ rowNumber: 3 }),
      participant({ rowNumber: 4, clienteID: '0601234561', clienteEmail: 'no-es-correo', clienteTelefono: '123' }),
    ], { serviceId: 'SRV-1', existing: [{ ServicioID: 'SRV-1', ClienteID: '0601234560', ClienteTipoIdentificacion: 'CEDULA_EC' }] })

    expect(rows[0].duplicate).toBe(true)
    expect(rows[1].duplicate).toBe(true)
    expect(rows[0].valid).toBe(false)
    expect(rows[2].errors.join(' ')).toMatch(/correo electrónico no es válido/)
    expect(rows[2].errors.join(' ')).toMatch(/celular/)
  })

  it('no clasifica como duplicado un mismo documento en otro servicio', () => {
    const [row] = validateBulkEnrollmentRows([participant()], {
      serviceId: 'SRV-2',
      existing: [{ ServicioID: 'SRV-1', ClienteID: '0601234560', ClienteTipoIdentificacion: 'CEDULA_EC' }],
    })
    expect(row.valid).toBe(true)
    expect(row.duplicate).toBe(false)
  })

  it('lee una plantilla XLSX real preservando cédula y celular como texto', async () => {
    const XLSX = await import('xlsx')
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      BULK_IMPORT_COLUMNS,
      ['CEDULA_EC', '0601234560', 'Ana', 'Pérez', 'ana@example.com', '0999999999'],
    ]), 'Participantes')
    const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })
    const file = { name: 'participantes.xlsx', size: bytes.byteLength, arrayBuffer: async () => bytes }

    await expect(readBulkEnrollmentFile(file)).resolves.toMatchObject([
      { rowNumber: 2, clienteID: '0601234560', clienteTelefono: '0999999999', clienteNombre: 'Ana Pérez' },
    ])
  })

  it('lee el ArrayBuffer que entrega File.arrayBuffer() en navegador', async () => {
    const XLSX = await import('xlsx')
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      BULK_IMPORT_COLUMNS,
      ['CEDULA_EC', '0601234560', 'Ana', 'Pérez', 'ana@example.com', '0999999999'],
    ]), 'Participantes')
    const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })
    const byteView = new Uint8Array(bytes)
    const arrayBuffer = byteView.buffer.slice(byteView.byteOffset, byteView.byteOffset + byteView.byteLength)
    const file = { name: 'participantes.xlsx', size: arrayBuffer.byteLength, arrayBuffer: async () => arrayBuffer }
    const [row] = await readBulkEnrollmentFile(file)

    expect(row).toMatchObject({ clienteID: '0601234560', clienteTelefono: '0999999999', _unsafeNumericId: false, _numericPhone: false })
  })

  it('reconoce el encabezado N° CEDULA y recupera el cero inicial con una máscara Excel explícita', async () => {
    const XLSX = await import('xlsx')
    const workbook = XLSX.utils.book_new()
    const sheet = XLSX.utils.aoa_to_sheet([
      ['N°', 'N° CEDULA', 'APELLIDOS', 'NOMBRES', 'CORREO', 'CELULAR'],
      [1, 601234560, 'Pérez', 'Ana', 'ana@example.com', '0999999999'],
    ])
    sheet.B2.z = '0000000000'
    XLSX.utils.book_append_sheet(workbook, sheet, 'Hoja1')
    const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })
    const file = { name: 'nomina.xlsx', size: bytes.byteLength, arrayBuffer: async () => bytes }
    const [row] = await readBulkEnrollmentFile(file)

    expect(row).toMatchObject({
      clienteID: '0601234560',
      clienteTipoIdentificacion: IDENTIFICATION_TYPE.ECUADORIAN_ID,
      clienteNombre: 'Ana Pérez',
      _unsafeNumericId: false,
    })
    expect(validateBulkEnrollmentRows([row], { serviceId: 'SRV-1' })[0].valid).toBe(true)
  })

  it('mantiene bloqueada una identificación numérica si el archivo no conserva su ancho de forma explícita', async () => {
    const XLSX = await import('xlsx')
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      BULK_IMPORT_COLUMNS,
      ['CEDULA_EC', 601234560, 'Ana', 'Pérez', 'ana@example.com', '0999999999'],
    ]), 'Participantes')
    const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })
    const file = { name: 'participantes.xlsx', size: bytes.byteLength, arrayBuffer: async () => bytes }
    const [row] = await readBulkEnrollmentFile(file)

    expect(row._unsafeNumericId).toBe(true)
    expect(validateBulkEnrollmentRows([row], { serviceId: 'SRV-1' })[0].valid).toBe(false)
  })

  it('reconoce un RUC de 13 dígitos desde su encabezado aunque no exista columna de tipo', async () => {
    const XLSX = await import('xlsx')
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ['Número RUC', 'APELLIDOS', 'NOMBRES', 'CORREO', 'CELULAR'],
      ['0504336967001', 'Mora', 'Luis', 'luis@example.com', '0999999999'],
    ]), 'Hoja1')
    const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })
    const file = { name: 'participantes.xlsx', size: bytes.byteLength, arrayBuffer: async () => bytes }
    const [row] = await readBulkEnrollmentFile(file)

    expect(row.clienteTipoIdentificacion).toBe(IDENTIFICATION_TYPE.ECUADORIAN_RUC)
    expect(validateBulkEnrollmentRows([row], { serviceId: 'SRV-1' })[0].valid).toBe(true)
  })

  it('marca celulares cargados como número para que no pasen inadvertidos los ceros perdidos', async () => {
    const XLSX = await import('xlsx')
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      BULK_IMPORT_COLUMNS,
      ['CEDULA_EC', '0601234560', 'Ana', 'Pérez', 'ana@example.com', 999999999],
    ]), 'Participantes')
    const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })
    const file = { name: 'participantes.xlsx', size: bytes.byteLength, arrayBuffer: async () => bytes }
    const [row] = await readBulkEnrollmentFile(file)

    expect(row._numericPhone).toBe(true)
    expect(validateBulkEnrollmentRows([row], { serviceId: 'SRV-1' })[0].valid).toBe(false)
  })

  it('preserva la fila física del Excel y marca fórmulas como inválidas', async () => {
    const XLSX = await import('xlsx')
    const workbook = XLSX.utils.book_new()
    const sheet = XLSX.utils.aoa_to_sheet([
      BULK_IMPORT_COLUMNS,
      ['CEDULA_EC', '0601234560', 'Ana', 'Pérez', 'ana@example.com', '0999999999'],
      [],
      ['CEDULA_EC', '0601234560', 'Luis', 'Mora', 'luis@example.com', '0999999998'],
    ])
    sheet['C4'] = { t: 's', v: 'Luis', f: '"Luis"' }
    XLSX.utils.book_append_sheet(workbook, sheet, 'Participantes')
    const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })
    const file = { name: 'participantes.xlsx', size: bytes.byteLength, arrayBuffer: async () => bytes }
    const rows = await readBulkEnrollmentFile(file)

    expect(rows.map(row => row.rowNumber)).toEqual([2, 4])
    expect(rows[1]._formula).toBe(true)
    expect(validateBulkEnrollmentRows(rows, { serviceId: 'SRV-1' })[1].valid).toBe(false)
  })
})
