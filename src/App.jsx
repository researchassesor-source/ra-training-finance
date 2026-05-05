import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout from './layout/Layout'
import Login from './components/Auth/Login'
import AdminDashboard from './components/Dashboard/AdminDashboard'
import UserDashboard from './components/Dashboard/UserDashboard'
import IngresosList from './components/Ingresos/IngresosList'
import EgresosList from './components/Egresos/EgresosList'
import PagosList from './components/Pagos/PagosList'
import ContratosList from './components/Contratos/ContratosList'
import ProyeccionesView from './components/Proyecciones/ProyeccionesView'
import ReportesView from './components/Reportes/ReportesView'
import UsuariosView from './components/Usuarios/UsuariosView'

function RequireAuth({ children }) {
  const { user } = useAuth()
  return user ? children : <Navigate to="/login" replace />
}

function RequireAdmin({ children }) {
  const { user, isAdmin } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (!isAdmin) return <Navigate to="/mis-egresos" replace />
  return children
}

function AppRoutes() {
  const { user, isAdmin } = useAuth()

  return (
    <Routes>
      <Route path="/login" element={
        user ? <Navigate to={isAdmin ? '/dashboard' : '/mis-egresos'} replace /> : <Login />
      } />

      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        {/* Admin routes */}
        <Route path="/dashboard"    element={<RequireAdmin><AdminDashboard /></RequireAdmin>} />
        <Route path="/ingresos"     element={<RequireAdmin><IngresosList /></RequireAdmin>} />
        <Route path="/egresos"      element={<RequireAdmin><EgresosList /></RequireAdmin>} />
        <Route path="/pagos"        element={<RequireAdmin><PagosList /></RequireAdmin>} />
        <Route path="/contratos"    element={<RequireAdmin><ContratosList /></RequireAdmin>} />
        <Route path="/proyecciones" element={<RequireAdmin><ProyeccionesView /></RequireAdmin>} />
        <Route path="/reportes"     element={<RequireAdmin><ReportesView /></RequireAdmin>} />
        <Route path="/usuarios"     element={<RequireAdmin><UsuariosView /></RequireAdmin>} />

        {/* User routes */}
        <Route path="/mis-egresos"  element={<EgresosList />} />
        <Route path="/mis-reportes" element={<UserDashboard />} />
      </Route>

      <Route path="*" element={
        <Navigate to={user ? (isAdmin ? '/dashboard' : '/mis-egresos') : '/login'} replace />
      } />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}
