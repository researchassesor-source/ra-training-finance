export const fmt = {
  usd: (v) =>
    new Intl.NumberFormat('es-US', { style: 'currency', currency: 'USD' }).format(Number(v) || 0),

  date: (v) => {
    if (!v) return '—'
    const d = new Date(v)
    if (isNaN(d)) return v
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
  },

  datetime: (v) => {
    if (!v) return '—'
    const d = new Date(v)
    if (isNaN(d)) return v
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
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
  confirmado: { label: 'Confirmado', css: 'badge-green'  },
  pendiente:  { label: 'Pendiente',  css: 'badge-yellow' },
  cancelado:  { label: 'Cancelado',  css: 'badge-red'    },
}

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
