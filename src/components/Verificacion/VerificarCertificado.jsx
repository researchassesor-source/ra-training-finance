import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../../services/api'
import { fmt } from '../../utils/formatters'
import Spinner from '../UI/Spinner'
import { TrendingUp, CheckCircle2, ExternalLink, XCircle } from 'lucide-react'

export default function VerificarCertificado() {
  const { id } = useParams()
  const [loading, setLoading] = useState(true)
  const [resultado, setResultado] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.verificarCertificado(id)
      .then(r => setResultado(r))
      .catch(e => setError(e.message || 'No se pudo verificar el certificado.'))
      .finally(() => setLoading(false))
  }, [id])

  const valido = resultado?.valido === true

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-brand-800 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <TrendingUp size={28} className="text-amber-400" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">R.A. Training</h1>
          <p className="text-gray-500 text-sm">Verificación de Certificados</p>
        </div>

        <div className="card shadow-lg">
          {loading ? (
            <Spinner text="Verificando certificado..." />
          ) : error ? (
            <EstadoInvalido mensaje={error} />
          ) : valido ? (
            <EstadoValido data={resultado.data} />
          ) : (
            <EstadoInvalido />
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          R.A. Training &copy; {new Date().getFullYear()} — Sistema de Gestión Financiera
        </p>
      </div>
    </div>
  )
}

function EstadoValido({ data }) {
  return (
    <div className="text-center space-y-4">
      <CheckCircle2 size={48} className="text-emerald-500 mx-auto" />
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Certificado Válido</h2>
        <p className="text-sm text-gray-500 mt-1">Emitido y verificado por R.A. Training</p>
      </div>
      <div className="text-left bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-2 text-sm">
        <Campo label="Código" valor={data.codigo} mono />
        <Campo label="Participante" valor={data.nombre} />
        <Campo label="Servicio / Curso" valor={data.servicio} />
        <Campo label="Duración" valor={data.duracion} />
        <Campo label="Modalidad" valor={data.modalidad} />
        {data.fechaInicio && <Campo label="Fecha de inicio" valor={fmt.date(data.fechaInicio)} />}
        {data.fechaFin && <Campo label="Fecha de fin" valor={fmt.date(data.fechaFin)} />}
        {data.fechaEmision && <Campo label="Fecha de emisión" valor={fmt.date(data.fechaEmision)} />}
        {data.institucionAval && <Campo label="Institución avaladora" valor={data.institucionAval} />}
        {data.estadoAval && <Campo label="Estado del aval" valor={data.estadoAval === 'avalado' ? 'Avalado' : 'Pendiente'} />}
        {data.avalReferencia && <Campo label="Referencia del aval" valor={data.avalReferencia} mono />}
        {data.avalCodigoExterno && <Campo label="Código externo" valor={data.avalCodigoExterno} mono />}
        {data.avalEnlaceExterno && (
          <div className="flex justify-between gap-3">
            <span className="text-gray-500">Validación externa</span>
            <a href={data.avalEnlaceExterno} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline">
              Abrir enlace <ExternalLink size={13} />
            </a>
          </div>
        )}
      </div>
    </div>
  )
}

function EstadoInvalido({ mensaje }) {
  return (
    <div className="text-center space-y-4">
      <XCircle size={48} className="text-red-500 mx-auto" />
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Certificado no válido</h2>
        <p className="text-sm text-gray-500 mt-1">
          {mensaje || 'No se encontró un certificado emitido con este código. Si crees que esto es un error, contacta a R.A. Training.'}
        </p>
      </div>
    </div>
  )
}

function Campo({ label, valor, mono = false }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-gray-500">{label}</span>
      <span className={`font-medium text-gray-900 text-right ${mono ? 'font-mono' : ''}`}>{valor || '—'}</span>
    </div>
  )
}
