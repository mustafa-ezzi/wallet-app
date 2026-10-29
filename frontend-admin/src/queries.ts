import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  cancelCampaign,
  createCampaign,
  createPromo,
  deleteCampaign,
  deleteOpsUser,
  estimateCampaignAudience,
  fetchAnalyticsReport,
  fetchAuditLog,
  fetchCampaign,
  fetchCampaigns,
  fetchDashboardSummary,
  disconnectIntegration,
  fetchEntitlements,
  fetchIntegrations,
  fetchTeam,
  fetchOpsConfig,
  fetchOpsDashboard,
  fetchOpsUser,
  fetchOpsUsers,
  fetchPremiumStats,
  fetchPromos,
  fetchPurchaseQueue,
  fetchSupportThread,
  fetchSupportThreads,
  grantPremium,
  patchOpsConfig,
  patchPromo,
  refreshInactivityFlags,
  revokeTeamMember,
  replySupportThread,
  revokePremium,
  saveTeamMember,
  sendCampaign,
  setTeamRole,
  syncIntegration,
  uploadLinkedInRows,
  setSupportStatus,
  suspendOpsUser,
  unsuspendOpsUser,
  type OpsUser,
} from './api'
import { rangeParams, type DateRange } from './lib/dateRange'

type Params = Record<string, string | number | undefined>

/** Drops empty values so `{ q: '' }` and `{}` share one cache entry. */
function clean(params: Params): Params {
  return Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== ''),
  )
}

export const queryKeys = {
  dashboard: ['dashboard'] as const,
  dashboardSummary: (params: Params) => ['dashboard', 'summary', clean(params)] as const,
  analyticsReport: ['analytics-report'] as const,
  users: (params: Params) => ['users', clean(params)] as const,
  usersAll: ['users'] as const,
  user: (id: number) => ['user', id] as const,
  campaigns: (params: Params) => ['campaigns', clean(params)] as const,
  campaignsAll: ['campaigns'] as const,
  campaign: (id: number) => ['campaign', id] as const,
  campaignEstimate: (audience: string) => ['campaign-estimate', audience] as const,
  supportThreads: (params: Params) => ['support', clean(params)] as const,
  supportAll: ['support'] as const,
  supportThread: (id: number) => ['support-thread', id] as const,
  premiumAll: ['premium'] as const,
  premiumStats: ['premium', 'stats'] as const,
  entitlements: (params: Params) => ['premium', 'entitlements', clean(params)] as const,
  purchaseQueue: (params: Params) => ['premium', 'queue', clean(params)] as const,
  config: ['config'] as const,
  promosAll: ['promos'] as const,
  promos: (params: Params) => ['promos', clean(params)] as const,
  audit: (params: Params) => ['audit', clean(params)] as const,
  team: ['team'] as const,
  integrations: ['integrations'] as const,
}

// Dashboard

export function useDashboard() {
  return useQuery({ queryKey: queryKeys.dashboard, queryFn: fetchOpsDashboard })
}

export function useDashboardSummary(range: DateRange) {
  const params = rangeParams(range)
  return useQuery({
    queryKey: queryKeys.dashboardSummary(params),
    queryFn: () => fetchDashboardSummary(params),
    placeholderData: keepPreviousData,
  })
}

export function useAnalyticsReport() {
  return useQuery({ queryKey: queryKeys.analyticsReport, queryFn: fetchAnalyticsReport, staleTime: 5 * 60_000 })
}

export function useRefreshInactivity() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: refreshInactivityFlags,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.dashboard })
      void qc.invalidateQueries({ queryKey: queryKeys.usersAll })
    },
  })
}

// Users

export function useUsers(params: Params) {
  return useQuery({
    queryKey: queryKeys.users(params),
    queryFn: () => fetchOpsUsers(clean(params)),
    placeholderData: keepPreviousData,
  })
}

export function useUser(id: number) {
  return useQuery({
    queryKey: queryKeys.user(id),
    queryFn: () => fetchOpsUser(id),
    enabled: Number.isFinite(id),
  })
}

export function useSetSuspended() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ user, suspend }: { user: OpsUser; suspend: boolean }) =>
      suspend ? suspendOpsUser(user.id) : unsuspendOpsUser(user.id),
    onSuccess: (next, { user }) => {
      qc.setQueryData<OpsUser>(queryKeys.user(user.id), (prev) => ({ ...(prev ?? user), ...next }))
      void qc.invalidateQueries({ queryKey: queryKeys.usersAll })
      void qc.invalidateQueries({ queryKey: queryKeys.dashboard })
    },
  })
}

export function useDeleteUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, confirmUsername }: { id: number; confirmUsername: string }) =>
      deleteOpsUser(id, confirmUsername),
    onSuccess: (_data, { id }) => {
      qc.removeQueries({ queryKey: queryKeys.user(id) })
      void qc.invalidateQueries({ queryKey: queryKeys.usersAll })
      void qc.invalidateQueries({ queryKey: queryKeys.dashboard })
    },
  })
}

// Campaigns

export function useCampaigns(params: Params) {
  return useQuery({ queryKey: queryKeys.campaigns(params), queryFn: () => fetchCampaigns(clean(params)) })
}

export function useCampaign(id: number) {
  return useQuery({
    queryKey: queryKeys.campaign(id),
    queryFn: () => fetchCampaign(id),
    enabled: Number.isFinite(id),
  })
}

export function useCampaignEstimate(audience: string) {
  return useQuery({
    queryKey: queryKeys.campaignEstimate(audience),
    queryFn: () => estimateCampaignAudience(audience),
    placeholderData: keepPreviousData,
  })
}

function useInvalidateCampaigns() {
  const qc = useQueryClient()
  return (id?: number) => {
    void qc.invalidateQueries({ queryKey: queryKeys.campaignsAll })
    void qc.invalidateQueries({ queryKey: ['campaign-estimate'] })
    if (id !== undefined) void qc.invalidateQueries({ queryKey: queryKeys.campaign(id) })
  }
}

export function useCreateCampaign() {
  const invalidate = useInvalidateCampaigns()
  return useMutation({ mutationFn: createCampaign, onSuccess: () => invalidate() })
}

export function useSendCampaign() {
  const invalidate = useInvalidateCampaigns()
  return useMutation({
    mutationFn: ({ id, ...opts }: { id: number; confirm?: boolean; dry_run?: boolean }) => sendCampaign(id, opts),
    onSettled: (_data, _error, { id, dry_run }) => {
      if (!dry_run) invalidate(id)
    },
  })
}

export function useCancelCampaign() {
  const invalidate = useInvalidateCampaigns()
  return useMutation({ mutationFn: cancelCampaign, onSuccess: (_d, id) => invalidate(id) })
}

export function useDeleteCampaign() {
  const qc = useQueryClient()
  const invalidate = useInvalidateCampaigns()
  return useMutation({
    mutationFn: deleteCampaign,
    onSuccess: (_d, id) => {
      qc.removeQueries({ queryKey: queryKeys.campaign(id) })
      invalidate()
    },
  })
}

// Support

export function useSupportThreads(params: Params) {
  return useQuery({
    queryKey: queryKeys.supportThreads(params),
    queryFn: () => fetchSupportThreads(clean(params)),
    placeholderData: keepPreviousData,
  })
}

export function useSupportThread(id: number) {
  return useQuery({
    queryKey: queryKeys.supportThread(id),
    queryFn: () => fetchSupportThread(id),
    enabled: Number.isFinite(id),
  })
}

function useStoreThread() {
  const qc = useQueryClient()
  return (thread: Awaited<ReturnType<typeof fetchSupportThread>>) => {
    qc.setQueryData(queryKeys.supportThread(thread.id), thread)
    void qc.invalidateQueries({ queryKey: queryKeys.supportAll })
    void qc.invalidateQueries({ queryKey: queryKeys.dashboard })
  }
}

export function useReplySupport() {
  const store = useStoreThread()
  return useMutation({
    mutationFn: ({ id, body, close }: { id: number; body: string; close?: boolean }) =>
      replySupportThread(id, { body, close }),
    onSuccess: store,
  })
}

export function useSetSupportStatus() {
  const store = useStoreThread()
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => setSupportStatus(id, status),
    onSuccess: store,
  })
}

// Premium

export function usePremiumStats() {
  return useQuery({ queryKey: queryKeys.premiumStats, queryFn: fetchPremiumStats })
}

export function useEntitlements(params: Params) {
  return useQuery({
    queryKey: queryKeys.entitlements(params),
    queryFn: () => fetchEntitlements(clean(params)),
    placeholderData: keepPreviousData,
  })
}

export function usePurchaseQueue(params: Params) {
  return useQuery({ queryKey: queryKeys.purchaseQueue(params), queryFn: () => fetchPurchaseQueue(clean(params)) })
}

export function useGrantPremium() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: grantPremium,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.premiumAll })
      void qc.invalidateQueries({ queryKey: queryKeys.dashboard })
    },
  })
}

export function useRevokePremium() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: revokePremium,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.premiumAll })
      void qc.invalidateQueries({ queryKey: queryKeys.dashboard })
    },
  })
}

// Remote config

export function useOpsConfig() {
  return useQuery({ queryKey: queryKeys.config, queryFn: fetchOpsConfig })
}

export function usePatchOpsConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: patchOpsConfig,
    onSuccess: (data) => qc.setQueryData(queryKeys.config, data),
  })
}

// Promos

export function usePromos(params: Params) {
  return useQuery({ queryKey: queryKeys.promos(params), queryFn: () => fetchPromos(clean(params)) })
}

export function useCreatePromo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createPromo,
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.promosAll }),
  })
}

export function usePatchPromo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...payload }: { id: number } & Record<string, unknown>) => patchPromo(id, payload),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.promosAll }),
  })
}

// Audit

export function useTeam() {
  return useQuery({ queryKey: queryKeys.team, queryFn: fetchTeam })
}

export function useSaveTeamMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: saveTeamMember,
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.team }),
  })
}

export function useSetTeamRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, role }: { userId: number; role: Parameters<typeof setTeamRole>[1] }) => setTeamRole(userId, role),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.team }),
  })
}

export function useRevokeTeamMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: revokeTeamMember,
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.team }),
  })
}

export function useIntegrations() {
  return useQuery({ queryKey: queryKeys.integrations, queryFn: fetchIntegrations })
}

export function useSyncIntegration() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: syncIntegration,
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.integrations }),
  })
}

export function useDisconnectIntegration() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: disconnectIntegration,
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.integrations }),
  })
}

export function useUploadLinkedIn() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: uploadLinkedInRows,
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.integrations }),
  })
}

export function useAuditLog(params: Params) {
  return useQuery({
    queryKey: queryKeys.audit(params),
    queryFn: () => fetchAuditLog(clean(params)),
    placeholderData: keepPreviousData,
  })
}
