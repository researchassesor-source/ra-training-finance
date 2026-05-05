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
import InscripcionesList from './components/Inscripciones/InscripcionesList'
import ServiciosView from './components/Servicios/ServiciosView'

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

function RequireVendedor({ children }) {
  const { user, isVendedor } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (!isVendedor) return <Navigate to="/mis-egresos" replace />
  return children
}

function HomeRedirect() {
  const { user, isAdmin, isVendedor } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (isAdmin)    return <Navigate to="/dashboard" replace />
  if (isVendedor) return <Navigate to="/mis-ingresos" replace />
  return <Navigate to="/mis-egresos" replace />
}

function AppRoutes() {
  const { user, isAdmin, isVendedor } = useAuth()

  return (
    <Routes>
      <Route path="/login" element={
        user
          ? <Navigate to={isAdmin ? '/dashboard' : isVendedor ? '/mis-ingresos' : '/mis-egresos'} replace />
          : <Login />
      } />

      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        {/* Admin routes */}
        <Route path="/dashboard"     element={<RequireAdmin><AdminDashboard /></RequireAdmin>} />
        <Route path="/ingresos"      element={<RequireAdmin><IngresosList /></RequireAdmin>} />
        <Route path="/egresos"       element={<RequireAdmin><EgresosList /></RequireAdmin>} />
        <Route path="/pagos"         element={<RequireAdmin><PagosList /></RequireAdmin>} />
        <Route path="/contratos"     element={<RequireAdmin><ContratosList /></RequireAdmin>} />
        <Route path="/proyecciones"  element={<RequireAdmin><ProyeccionesView /></RequireAdmin>} />
        <Route path="/reportes"      element={<RequireAdmin><ReportesView /></RequireAdmin>} />
        <Route path="/usuarios"      element={<RequireAdmin><UsuariosView /></RequireAdmin>} />

        {/* Vendedor + Admin routes */}
        <Route path="/mis-ingresos"  element={<RequireVendedor><IngresosList soloMios /></RequireVendedor>} />
        <Route path="/inscripciones" element={<RequireVendedor><InscripcionesList /></RequireVendedor>} />
        <Route path="/servicios"     element={<RequireVendedor><ServiciosView /></RequireVendedor>} />

        {/* All authenticated users */}
        <Route path="/mis-egresos"   element={<EgresosList />} />
        <Route path="/mis-reportes"  element={<UserDashboard />} />
      </Route>

      <Route path="/" element={<RequireAuth><HomeRedirect /></RequireAuth>} />
      <Route path="*" element={<RequireAuth><HomeRedirect /></RequireAuth>} />
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
