import { Menu, LogOut, User } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'

export default function Header({ onMenuClick, title }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 sticky top-0 z-10">
      <div className="flex items-center gap-3">
        <button onClick={onMenuClick} className="lg:hidden p-2 rounded-lg hover:bg-gray-100 text-gray-600">
          <Menu size={20} />
        </button>
        <h1 className="font-semibold text-gray-900 text-base">{title}</h1>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden sm:flex items-center gap-2 text-sm text-gray-600">
          <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center">
            <User size={14} className="text-brand-700" />
          </div>
          <span className="font-medium">{user?.nombre}</span>
          <span className="text-xs badge-blue">{user?.rol === 'admin' ? 'Admin' : 'Usuario'}</span>
        </div>
        <button onClick={handleLogout}
          className="p-2 rounded-lg hover:bg-red-50 text-gray-500 hover:text-red-600 transition-colors"
          title="Cerrar sesión">
          <LogOut size={18} />
        </button>
      </div>
    </header>
  )
}
