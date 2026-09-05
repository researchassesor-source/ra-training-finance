import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout from './layout/Layout'
import Login from './components/Auth/Login'
import AdminDashboard from './components/Dashboard/AdminDashboard'
import IngresosList from './components/Ingresos/IngresosList'
import FacturacionView from './components/Facturacion/FacturacionView'
import EgresosList from './components/Egresos/EgresosList'
import PagosList from './components/Pagos/PagosList'
import ContratosList from './components/Contratos/ContratosList'
import ProyeccionesView from './components/Proyecciones/ProyeccionesView'
import ReportesView from './components/Reportes/ReportesView'
import UsuariosView from './components/Usuarios/UsuariosView'
import InscripcionesList from './components/Inscripciones/InscripcionesList'
import ServiciosView from './components/Servicios/ServiciosView'
import ConfigPagosView from './components/ConfigPagos/ConfigPagosView'
import ConveniosList from './components/Convenios/ConveniosList'
import CalendarView from './components/Calendario/CalendarView'
import AsistenciaView from './components/Asistencia/AsistenciaView'
import FlujosView from './components/Flujos/FlujosView'
import VerificarCertificado from './components/Verificacion/VerificarCertificado'
import CertificadosAvalView from './components/Aval/CertificadosAvalView'

function RequireAuth({ children }) {
  const { user } = useAuth()
  return user ? children : <Navigate to="/login" replace />
}

function RequireAdmin({ children }) {
  const { user, isAdmin, isAval } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (!isAdmin) return <Navigate to={isAval ? '/aval-externo' : '/mis-egresos'} replace />
  return children
}

function RequireVendedor({ children }) {
  const { user, isVendedor, isAval } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (!isVendedor) return <Navigate to={isAval ? '/aval-externo' : '/mis-egresos'} replace />
  return children
}

function RequireInscripciones({ children }) {
  const { user, isVendedor, isMoodle, isAval } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (!isVendedor && !isMoodle) return <Navigate to={isAval ? '/aval-externo' : '/mis-egresos'} replace />
  return children
}

function RequireContador({ children }) {
  const { user, isAdmin, isContador, isAval } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (!isAdmin && !isContador) return <Navigate to={isAval ? '/aval-externo' : '/mis-egresos'} replace />
  return children
}

function RequireAval({ children }) {
  const { user, isAdmin, isAval } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (!isAdmin && !isAval) return <Navigate to="/mis-egresos" replace />
  return children
}

// Rutas "para cualquier autenticado" que no deben quedar visibles al rol
// restringido 'aval' (solo debe ver /aval-externo).
function RequireGeneral({ children }) {
  const { user, isAval, isMoodle } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (isAval) return <Navigate to="/aval-externo" replace />
  if (isMoodle) return <Navigate to="/inscripciones" replace />
  return children
}

function HomeRedirect() {
  const { user, isAdmin, isVendedor, isAval, isContador, isMoodle } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (isAdmin)    return <Navigate to="/dashboard" replace />
  if (isContador) return <Navigate to="/facturacion" replace />
  if (isMoodle)   return <Navigate to="/inscripciones" replace />
  if (isVendedor) return <Navigate to="/mis-ingresos" replace />
  if (isAval)     return <Navigate to="/aval-externo" replace />
  return <Navigate to="/mis-egresos" replace />
}

function AppRoutes() {
  const { user, isAdmin, isVendedor, isAval, isContador, isMoodle } = useAuth()

  return (
    <Routes>
      <Route path="/login" element={
        user
          ? <Navigate to={isAdmin ? '/dashboard' : isContador ? '/facturacion' : isMoodle ? '/inscripciones' : isVendedor ? '/mis-ingresos' : isAval ? '/aval-externo' : '/mis-egresos'} replace />
          : <Login />
      } />

      {/* Pública — sin sesión, para escanear el QR de un certificado */}
      <Route path="/verificar/:id" element={<VerificarCertificado />} />

      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        {/* Admin routes */}
        <Route path="/dashboard"     element={<RequireAdmin><AdminDashboard /></RequireAdmin>} />
        <Route path="/ingresos"      element={<RequireAdmin><IngresosList /></RequireAdmin>} />
        <Route path="/facturacion"   element={<RequireContador><FacturacionView /></RequireContador>} />
        <Route path="/egresos"       element={<RequireAdmin><EgresosList /></RequireAdmin>} />
        <Route path="/pagos"         element={<RequireAdmin><PagosList /></RequireAdmin>} />
        <Route path="/contratos"     element={<RequireAdmin><ContratosList /></RequireAdmin>} />
        <Route path="/proyecciones"  element={<RequireAdmin><ProyeccionesView /></RequireAdmin>} />
        <Route path="/reportes"      element={<RequireContador><ReportesView /></RequireContador>} />
        <Route path="/usuarios"      element={<RequireAdmin><UsuariosView /></RequireAdmin>} />
        <Route path="/config-pagos"  element={<RequireAdmin><ConfigPagosView /></RequireAdmin>} />
        <Route path="/convenios"     element={<RequireAdmin><ConveniosList /></RequireAdmin>} />
        <Route path="/calendario"    element={<RequireVendedor><CalendarView /></RequireVendedor>} />

        {/* Vendedor + Admin routes */}
        <Route path="/mis-ingresos"  element={<RequireVendedor><IngresosList soloMios /></RequireVendedor>} />
        <Route path="/inscripciones" element={<RequireInscripciones><InscripcionesList /></RequireInscripciones>} />
        <Route path="/servicios"     element={<RequireVendedor><ServiciosView /></RequireVendedor>} />
        <Route path="/asistencia"    element={<RequireVendedor><AsistenciaView /></RequireVendedor>} />
        <Route path="/flujos"        element={<RequireVendedor><FlujosView /></RequireVendedor>} />

        {/* Rol restringido: solo certificados con aval externo (admin también puede entrar) */}
        <Route path="/aval-externo"  element={<RequireAval><CertificadosAvalView /></RequireAval>} />

        {/* Cualquier autenticado, excepto el rol 'aval' */}
        <Route path="/mis-egresos"   element={<RequireGeneral><EgresosList /></RequireGeneral>} />
        <Route path="/mis-reportes"  element={<RequireGeneral><ReportesView /></RequireGeneral>} />
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
