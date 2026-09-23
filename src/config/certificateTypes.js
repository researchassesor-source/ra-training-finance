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

export function participantCertificateType(value) {
  const type = PARTICIPANT_CERTIFICATE_TYPES[String(value || 'aprobacion').trim().toLowerCase()]
  if (!type) throw new Error('El tipo de certificado no está configurado para esta plantilla.')
  return type
}
