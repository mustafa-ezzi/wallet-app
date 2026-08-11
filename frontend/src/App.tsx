import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { OfflineProvider } from './offline'
import Layout from './components/Layout'
import AppUpdateGate from './hooks/AppUpdateGate'
import { ThemeProvider } from './theme/ThemeProvider'
import { capturePageview } from './lib/analytics'
import Login from './pages/Login'
import Signup from './pages/Signup'
import ForgotPassword from './pages/ForgotPassword'
import { OnboardingAbout, OnboardingUserType } from './pages/Onboarding'
import Dashboard from './pages/Dashboard'
import Projects from './pages/Projects'
import Accounts from './pages/Accounts'
import Expenses from './pages/Expenses'
import Reports from './pages/Reports'
import Settings from './pages/Settings'
import HouseholdPage from './pages/Household'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner" style={{ width: '2rem', height: '2rem' }} />
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  if (user.onboarding_complete === false) return <Navigate to="/onboarding" replace />
  return <>{children}</>
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return null
  if (user && user.onboarding_complete === false) return <Navigate to="/onboarding" replace />
  if (user) return <Navigate to="/" replace />
  return <>{children}</>
}

function OnboardingRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner" style={{ width: '2rem', height: '2rem' }} />
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  if (user.onboarding_complete !== false) return <Navigate to="/" replace />
  return <>{children}</>
}

/** PostHog SPA pageviews — React Router does not reload the document. */
function PostHogPageviews() {
  const location = useLocation()
  useEffect(() => {
    capturePageview(window.location.href)
  }, [location.pathname, location.search])
  return null
}

function AppRoutes() {
  return (
    <>
      <PostHogPageviews />
      <Routes>
        <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
        <Route path="/signup" element={<PublicRoute><Signup /></PublicRoute>} />
        <Route path="/forgot-password" element={<PublicRoute><ForgotPassword /></PublicRoute>} />
        <Route path="/onboarding" element={<OnboardingRoute><OnboardingAbout /></OnboardingRoute>} />
        <Route path="/onboarding/user-type" element={<OnboardingRoute><OnboardingUserType /></OnboardingRoute>} />
        <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/income" element={<Projects />} />
          <Route path="/projects" element={<Navigate to="/income" replace />} />
          <Route path="/accounts" element={<Accounts />} />
          <Route path="/expenses" element={<Expenses />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/household" element={<HouseholdPage />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <OfflineProvider>
          <BrowserRouter>
            <AppUpdateGate>
              <AppRoutes />
            </AppUpdateGate>
          </BrowserRouter>
        </OfflineProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
