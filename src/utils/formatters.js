// Normaliza una fecha que puede venir como ISO datetime completo (Google Sheets
// guarda 'Fecha' como objeto Date y el backend lo serializa a ISO), Date object
// o ya como YYYY-MM-DD, al formato que exige <input type="date">. Sin esto, un
// input type=date required recibe un valor que no puede parsear, lo deja vacío
// silenciosamente y el navegador bloquea el submit sin mostrar ningún error.
export function toDateInput(val) {
  if (!val) return ''
  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    const year = val.getFullYear()
    const month = String(val.getMonth() + 1).padStart(2, '0')
    const day = String(val.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  const source = String(val).trim()
  const normalizedDate = (year, month, day) => {
    const candidate = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
    if (candidate.getUTCFullYear() !== Number(year)
      || candidate.getUTCMonth() !== Number(month) - 1
      || candidate.getUTCDate() !== Number(day)) return ''
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }
  let match = source.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/)
  if (match) return normalizedDate(match[1], match[2], match[3])
  match = source.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (match) return normalizedDate(match[3], match[2], match[1])
  return ''
}

export const fmt = {
  usd: (v) =>
    new Intl.NumberFormat('es-US', { style: 'currency', currency: 'USD' }).format(Number(v) || 0),

  date: (v) => {
    if (!v) return '—'
    const s = String(v)
    // Strings de solo fecha (YYYY-MM-DD) se parsean como UTC medianoche.
    // En Ecuador (UTC-5) eso retrocede al día anterior. Usamos mediodía UTC
    // para que toLocaleDateString devuelva el día correcto en cualquier zona.
    const d = s.length >= 10 && s[4] === '-' && s[7] === '-' && s.length === 10
      ? new Date(s + 'T12:00:00Z')
      : new Date(s)
    if (isNaN(d)) return v
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
  },

  datetime: (v) => {
    if (!v) return '—'
    const s = String(v)
    const d = s.length === 10 && s[4] === '-' && s[7] === '-'
      ? new Date(s + 'T12:00:00Z')
      : new Date(s)
    if (isNaN(d)) return v
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  },

  time: (v) => {
    if (!v) return ''
    const d = new Date(v)
    if (isNaN(d)) return ''
    return d.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit', hour12: false })
  },
}

export const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

export const TIPOS_INGRESO = [
  'Curso presencial','Curso virtual','Curso híbrido',
  'Certificación','Taller','Evento','Podcast',
  'Suscripción LMS','Certificado LMS','Contrato corporativo','Otro',
]

export const MODALIDADES = ['Presencial','Virtual','Híbrida','N/A']

export const TIPOS_PAGO = [
  'Transferencia bancaria','Pago a proveedor','Pago de factura','Otro',
]

export const METODOS_PAGO = ['Transferencia','Tarjeta','Efectivo','Cheque','Otro']

export const TIPOS_CONTRATO = ['cliente','proveedor']

export const TIPOS_PROYECCION = [
  'Curso','Certificación','Taller','Evento','Podcast','Suscripción','Otro',
]

export const ESTADOS_EGRESO = {
  pendiente: { label: 'Pendiente', css: 'badge-yellow' },
  aprobado:  { label: 'Aprobado',  css: 'badge-green'  },
  rechazado: { label: 'Rechazado', css: 'badge-red'    },
  pagado:    { label: 'Pagado',    css: 'badge-blue'   },
}

export const ESTADOS_INGRESO = {
  confirmado:              { label: 'Confirmado',    css: 'badge-green'  },
  pendiente:               { label: 'Pendiente',     css: 'badge-yellow' },
  pendiente_verificacion:  { label: 'Por verificar', css: 'badge-blue'   },
  cancelado:               { label: 'Cancelado',     css: 'badge-red'    },
}

export const ESTADOS_CERTIFICADO = {
  pendiente:   { label: 'Pendiente',   css: 'badge-yellow' },
  en_proceso:  { label: 'En proceso',  css: 'badge-blue'   },
  emitido:     { label: 'Emitido',     css: 'badge-green'  },
  enviado:     { label: 'Enviado',     css: 'badge-green'  },
  anulado:     { label: 'Anulado',     css: 'badge-red'    },
  reemitido:   { label: 'Reemitido',   css: 'badge-blue'   },
  cancelado:   { label: 'Cancelado',   css: 'badge-red'    },
}

export const ESTADOS_PAGO_INS = {
  pendiente:  { label: 'Pendiente',  css: 'badge-yellow' },
  pagado:     { label: 'Pagado',     css: 'badge-green'  },
  verificado: { label: 'Verificado', css: 'badge-blue'   },
  cancelado:  { label: 'Cancelado',  css: 'badge-red'    },
}

export const TIPOS_SERVICIO = [
  'Curso','Certificación','Taller','Evento','Podcast',
  'Suscripción LMS','Certificado LMS','Consultoría','Capacitación','Otro',
]

export const ESTADOS_CONTRATO = {
  activo:    { label: 'Activo',    css: 'badge-green'  },
  vencido:   { label: 'Vencido',   css: 'badge-red'    },
  pendiente: { label: 'Pendiente', css: 'badge-yellow' },
  cancelado: { label: 'Cancelado', css: 'badge-gray'   },
}

export const ESTADOS_PROYECCION = {
  proyectado: { label: 'Proyectado', css: 'badge-blue'   },
  confirmado: { label: 'Confirmado', css: 'badge-green'  },
  realizado:  { label: 'Realizado',  css: 'badge-gray'   },
  cancelado:  { label: 'Cancelado',  css: 'badge-red'    },
}
