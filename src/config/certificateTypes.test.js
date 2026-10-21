import { describe, expect, it } from 'vitest'
import { PARTICIPANT_CERTIFICATE_TYPES, participantCertificateType } from './certificateTypes.js'

describe('participantCertificateType', () => {
  it.each(Object.keys(PARTICIPANT_CERTIFICATE_TYPES))('resuelve el tipo canónico %s', value => {
    expect(participantCertificateType(value)).toBe(PARTICIPANT_CERTIFICATE_TYPES[value])
  })

  it.each([
    ['Aprobación', 'aprobacion'],
    ['DE APROBACIÓN', 'aprobacion'],
    ['Certificado de Aprobación', 'aprobacion'],
    ['Asistencia', 'asistencia'],
    ['Certificado de Asistencia', 'asistencia'],
    ['Participación académica', 'participacion'],
    ['Certificado de Participación', 'participacion'],
    ['Capacitación', 'capacitacion'],
    ['Certificado de Capacitación', 'capacitacion'],
  ])('acepta la etiqueta heredada %s como %s', (value, expected) => {
    expect(participantCertificateType(value)).toBe(PARTICIPANT_CERTIFICATE_TYPES[expected])
  })

  it('conserva el valor predeterminado para registros antiguos sin tipo', () => {
    expect(participantCertificateType('')).toBe(PARTICIPANT_CERTIFICATE_TYPES.aprobacion)
  })

  it('rechaza tipos que no corresponden a certificados de participantes', () => {
    expect(() => participantCertificateType('ponente')).toThrow('tipo de certificado')
    expect(() => participantCertificateType('constructor')).toThrow('tipo de certificado')
  })
})
