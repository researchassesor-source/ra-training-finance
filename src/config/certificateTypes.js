// Tipos que pueden acreditarse desde una inscripción de participante.
// Capacitador, ponente, organizador y aval institucional requieren sus propios
// expedientes y pruebas; no deben seleccionarse como si fueran alumnos.
export const PARTICIPANT_CERTIFICATE_TYPES = Object.freeze({
  aprobacion: Object.freeze({
    label: 'Aprobación',
    description: 'Cursos evaluados',
    heading: 'DE APROBACIÓN',
    intro: 'Ha aprobado satisfactoriamente el curso:',
  }),
  asistencia: Object.freeze({
    label: 'Asistencia',
    description: 'Seminarios, congresos y webinars',
    heading: 'DE ASISTENCIA',
    intro: 'Ha asistido al evento académico:',
  }),
  participacion: Object.freeze({
    label: 'Participación',
    description: 'Actividades académicas',
    heading: 'DE PARTICIPACIÓN',
    intro: 'Ha participado en la actividad académica:',
  }),
  capacitacion: Object.freeze({
    label: 'Capacitación',
    description: 'Formación recibida',
    heading: 'DE CAPACITACIÓN',
    intro: 'Ha recibido capacitación en:',
  }),
})

const PARTICIPANT_CERTIFICATE_TYPE_ALIASES = Object.freeze({
  'de aprobacion': 'aprobacion',
  'certificado de aprobacion': 'aprobacion',
  'de asistencia': 'asistencia',
  'certificado de asistencia': 'asistencia',
  'de participacion': 'participacion',
  'participacion academica': 'participacion',
  'certificado de participacion': 'participacion',
  'de capacitacion': 'capacitacion',
  'certificado de capacitacion': 'capacitacion',
})

export function participantCertificateType(value) {
  const normalized = String(value || 'aprobacion')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
  const key = Object.hasOwn(PARTICIPANT_CERTIFICATE_TYPE_ALIASES, normalized)
    ? PARTICIPANT_CERTIFICATE_TYPE_ALIASES[normalized]
    : normalized
  if (!Object.hasOwn(PARTICIPANT_CERTIFICATE_TYPES, key)) {
    throw new Error('El tipo de certificado no está configurado para esta plantilla.')
  }
  return PARTICIPANT_CERTIFICATE_TYPES[key]
}
