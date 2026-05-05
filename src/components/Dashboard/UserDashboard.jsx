import { useAuth } from '../../context/AuthContext'
import { TrendingDown, FileText, Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export default function UserDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="max-w-xl mx-auto space-y-6 pt-4">
      <div className="card text-center">
        <div className="w-14 h-14 bg-brand-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
          <TrendingDown size={28} className="text-brand-700" />
        </div>
        <h2 className="text-xl font-bold text-gray-900">Bienvenido, {user?.nombre}</h2>
        <p className="text-gray-500 text-sm mt-1">Desde aquí puedes reportar gastos y revisar tus reportes anteriores.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button onClick={() => navigate('/mis-egresos')}
          className="card hover:shadow-md transition-shadow text-left group">
          <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center mb-3 group-hover:bg-red-200 transition-colors">
            <Plus size={20} className="text-red-600" />
          </div>
          <p className="font-semibold text-gray-900">Reportar Gasto</p>
          <p className="text-xs text-gray-500 mt-1">Registra un nuevo egreso para aprobación</p>
        </button>

        <button onClick={() => navigate('/mis-reportes')}
          className="card hover:shadow-md transition-shadow text-left group">
          <div className="w-10 h-10 bg-brand-100 rounded-xl flex items-center justify-center mb-3 group-hover:bg-brand-200 transition-colors">
            <FileText size={20} className="text-brand-600" />
          </div>
          <p className="font-semibold text-gray-900">Mis Reportes</p>
          <p className="text-xs text-gray-500 mt-1">Revisa el estado de tus gastos reportados</p>
        </button>
      </div>
    </div>
  )
}
