import { QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense, type ComponentType, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './AuthContext'
import { Skeleton, Toaster, TooltipProvider } from './components/ui'
import { AppShell } from './layout/AppShell'
import { DateRangeProvider } from './lib/dateRange'
import { queryClient } from './lib/queryClient'
import { ThemeProvider } from './lib/theme'

function page<K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) {
  return lazy(() => load().then((module) => ({ default: module[name] })))
}

const LoginPage = page(() => import('./pages/LoginPage'), 'LoginPage')
const DashboardPage = page(() => import('./pages/DashboardPage'), 'DashboardPage')
const UsersPage = page(() => import('./pages/UsersPage'), 'UsersPage')
const UserDetailPage = page(() => import('./pages/UserDetailPage'), 'UserDetailPage')
const PremiumPage = page(() => import('./pages/PremiumPage'), 'PremiumPage')
const PromosPage = page(() => import('./pages/PromosPage'), 'PromosPage')
const CampaignsPage = page(() => import('./pages/CampaignsPage'), 'CampaignsPage')
const CampaignDetailPage = page(() => import('./pages/CampaignDetailPage'), 'CampaignDetailPage')
const AdsConfigPage = page(() => import('./pages/AdsConfigPage'), 'AdsConfigPage')
const SupportPage = page(() => import('./pages/SupportPage'), 'SupportPage')
const AuditPage = page(() => import('./pages/AuditPage'), 'AuditPage')
const AnalyticsReportPage = page(() => import('./pages/AnalyticsReportPage'), 'AnalyticsReportPage')
const UiKitPage = lazy(() => import('./pages/UiKitPage'))

function PageFallback() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-4 w-80" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
    </div>
  )
}

function Lazy({ children }: { children: ReactNode }) {
  return <Suspense fallback={<PageFallback />}>{children}</Suspense>
}

export default function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <DateRangeProvider>
            <TooltipProvider delayDuration={300}>
              <BrowserRouter>
                <Routes>
                  <Route
                    path="/login"
                    element={
                      <Suspense fallback={null}>
                        <LoginPage />
                      </Suspense>
                    }
                  />
                  <Route element={<AppShell />}>
                    <Route index element={<Lazy><DashboardPage /></Lazy>} />
                    <Route path="users" element={<Lazy><UsersPage /></Lazy>} />
                    <Route path="users/:id" element={<Lazy><UserDetailPage /></Lazy>} />
                    <Route path="premium" element={<Lazy><PremiumPage /></Lazy>} />
                    <Route path="promos" element={<Lazy><PromosPage /></Lazy>} />
                    <Route path="campaigns" element={<Lazy><CampaignsPage /></Lazy>} />
                    <Route path="campaigns/:id" element={<Lazy><CampaignDetailPage /></Lazy>} />
                    <Route path="ads" element={<Lazy><AdsConfigPage /></Lazy>} />
                    <Route path="support/:id?" element={<Lazy><SupportPage /></Lazy>} />
                    <Route path="audit" element={<Lazy><AuditPage /></Lazy>} />
                    <Route path="insights/report" element={<Lazy><AnalyticsReportPage /></Lazy>} />
                    <Route path="ui" element={<Lazy><UiKitPage /></Lazy>} />
                  </Route>
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </BrowserRouter>
              <Toaster />
            </TooltipProvider>
          </DateRangeProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
