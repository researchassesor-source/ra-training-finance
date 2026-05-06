import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  LayoutDashboard, TrendingUp, TrendingDown, CreditCard,
  FileText, BarChart2, BookOpen, Users, X, TrendingUp as Logo,
  GraduationCap, Briefcase, Settings, HeartHandshake, CalendarDays,
} from 'lucide-react'

const adminLinks = [
  { to: '/dashboard',      icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/calendario',     icon: CalendarDays,    label: 'Calendario' },
  { to: '/ingresos',       icon: TrendingUp,      label: 'Ingresos' },
  { to: '/egresos',        icon: TrendingDown,    label: 'Egresos' },
  { to: '/inscripciones',  icon: GraduationCap,   label: 'Inscripciones' },
  { to: '/servicios',      icon: Briefcase,       label: 'Servicios' },
  { to: '/pagos',          icon: CreditCard,      label: 'Pagos' },
  { to: '/contratos',      icon: FileText,        label: 'Contratos' },
  { to: '/convenios',      icon: HeartHandshake,  label: 'Convenios' },
  { to: '/proyecciones',   icon: BarChart2,       label: 'Proyecciones' },
  { to: '/reportes',       icon: BookOpen,        label: 'Reportes' },
  { to: '/usuarios',       icon: Users,           label: 'Usuarios' },
  { to: '/config-pagos',   icon: Settings,        label: 'Cuentas de Pago' },
]

const vendedorLinks = [
  { to: '/mis-ingresos',   icon: TrendingUp,      label: 'Reportar Ingreso' },
  { to: '/mis-egresos',    icon: TrendingDown,    label: 'Reportar Gasto' },
  { to: '/inscripciones',  icon: GraduationCap,   label: 'Inscripciones' },
  { to: '/servicios',      icon: Briefcase,       label: 'Catálogo Servicios' },
  { to: '/calendario',     icon: CalendarDays,    label: 'Calendario' },
  { to: '/mis-reportes',   icon: BookOpen,        label: 'Mis Reportes' },
]

const userLinks = [
  { to: '/mis-egresos',    icon: TrendingDown,    label: 'Reportar Gasto' },
  { to: '/mis-reportes',   icon: BookOpen,        label: 'Mis Reportes' },
]

export default function Sidebar({ open, onClose }) {
  const { isAdmin, isVendedor, user } = useAuth()
  const links = isAdmin ? adminLinks : isVendedor ? vendedorLinks : userLinks

  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-black/30 z-20 lg:hidden" onClick={onClose} />
      )}
      <aside className={`
        fixed top-0 left-0 h-full w-64 bg-brand-900 text-white z-30 flex flex-col
        transform transition-transform duration-200
        ${open ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0 lg:static lg:z-auto
      `}>
        <div className="flex items-center justify-between px-5 py-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-amber-400 rounded-lg flex items-center justify-center">
              <Logo size={20} className="text-brand-900" />
            </div>
            <div>
              <p className="font-bold text-sm leading-tight">R.A. Training</p>
              <p className="text-[10px] text-brand-200">Finanzas</p>
            </div>
          </div>
          <button onClick={onClose} className="lg:hidden p-1 hover:bg-white/10 rounded-lg">
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {links.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-amber-400 text-brand-900'
                    : 'text-brand-100 hover:bg-white/10 hover:text-white'
                }`
              }>
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="px-3 pb-4 text-[10px] text-brand-300 text-center">
          v1.1 &copy; {new Date().getFullYear()} R.A. Training
        </div>
      </aside>
    </>
  )
}
