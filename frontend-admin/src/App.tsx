import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './AuthContext'
import { AppShell } from './AppShell'
import { AdsConfigPage } from './pages/AdsConfigPage'
import { AuditPage } from './pages/AuditPage'
import { CampaignDetailPage } from './pages/CampaignDetailPage'
import { CampaignsPage } from './pages/CampaignsPage'
import { DashboardPage } from './pages/DashboardPage'
import { LoginPage } from './pages/LoginPage'
import { PremiumPage } from './pages/PremiumPage'
import { PromosPage } from './pages/PromosPage'
import { SupportDetailPage } from './pages/SupportDetailPage'
import { SupportPage } from './pages/SupportPage'
import { UserDetailPage } from './pages/UserDetailPage'
import { UsersPage } from './pages/UsersPage'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<AppShell />}>
            <Route index element={<DashboardPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="users/:id" element={<UserDetailPage />} />
            <Route path="premium" element={<PremiumPage />} />
            <Route path="promos" element={<PromosPage />} />
            <Route path="campaigns" element={<CampaignsPage />} />
            <Route path="campaigns/:id" element={<CampaignDetailPage />} />
            <Route path="ads" element={<AdsConfigPage />} />
            <Route path="support" element={<SupportPage />} />
            <Route path="support/:id" element={<SupportDetailPage />} />
            <Route path="audit" element={<AuditPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
