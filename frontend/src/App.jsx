import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import Join from './pages/Join'
import Dashboard from './pages/Dashboard'
import EnvelopeDetail from './pages/EnvelopeDetail'
import Import from './pages/Import'
import { lazy, Suspense } from 'react'
import Recurring from './pages/Recurring'
import IncomePage from './pages/IncomePage'
import Settings from './pages/Settings'
import DataManagement from './pages/DataManagement'
import Payees from './pages/Payees'
const Reports = lazy(() => import('./pages/Reports'))

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/join/:token" element={<Join />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/households/:householdId/envelopes/:envelopeId" element={<EnvelopeDetail />} />
          <Route path="/import" element={<Import />} />
          <Route path="/recurring" element={<Recurring />} />
          <Route path="/income" element={<IncomePage />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/data" element={<DataManagement />} />
          <Route path="/payees" element={<Payees />} />
          <Route path="/reports" element={<Suspense fallback={null}><Reports /></Suspense>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}
