import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'

const TITLES = {
  '/dashboard':    'Dashboard',
  '/ingresos':     'Ingresos',
  '/egresos':      'Egresos',
  '/inscripciones':'Inscripciones y Certificados',
  '/aval-externo': 'Avales Institucionales',
  '/servicios':    'Servicios de Capacitación',
  '/pagos':        'Pagos',
  '/contratos':    'Contratos',
  '/proyecciones': 'Proyecciones de Ingreso',
  '/reportes':     'Reportes',
  '/usuarios':     'Gestión de Usuarios',
  '/mis-egresos':  'Reportar Gasto',
  '/mis-reportes': 'Mis Reportes',
}

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { pathname } = useLocation()
  const title = TITLES[pathname] || 'R.A. Training'

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header onMenuClick={() => setSidebarOpen(true)} title={title} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
