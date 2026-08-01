import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import { useRouter } from 'expo-router'
import { useAuth } from '@/src/context/AuthContext'
import { track } from '@/src/lib/analytics'
import type { Payable, Receivable, RecurringExpense } from '@/src/api/types'
import {
  getPermissionStatus,
  requestReminderPermission,
  rescheduleDueReminders,
  sendTestNotification,
  type ReminderData,
} from './schedule'
import {
  getReminderPrefs,
  getReminderPromptSeen,
  setReminderPrefs,
  setReminderPromptSeen,
  type ReminderPrefs,
} from './storage'
import { registerDeviceToken, revokeDeviceToken } from './pushRegistration'
import api from '@/src/api/client'

type RemindersValue = {
  ready: boolean
  prefs: ReminderPrefs
  permission: 'granted' | 'denied' | 'undetermined'
  lastScheduled: number
  showPromptBanner: boolean
  refreshPrefs: () => Promise<void>
  updatePrefs: (patch: Partial<ReminderPrefs>) => Promise<void>
  enableWithPermission: () => Promise<boolean>
  dismissPrompt: () => Promise<void>
  sendTest: () => Promise<boolean>
  reschedule: (input: {
    payables: Payable[]
    receivables: Receivable[]
    expenses?: RecurringExpense[]
  }) => Promise<number>
}

const RemindersContext = createContext<RemindersValue | null>(null)

export function RemindersProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [prefs, setPrefs] = useState<ReminderPrefs>({
    enabled: false,
    lead3: true,
    lead1: true,
    leadDue: true,
    timeZone: 'Asia/Karachi',
  })
  const [permission, setPermission] = useState<'granted' | 'denied' | 'undetermined'>('undetermined')
  const [lastScheduled, setLastScheduled] = useState(0)
  const [showPromptBanner, setShowPromptBanner] = useState(false)
  const lastPayload = useRef<{
    payables: Payable[]
    receivables: Receivable[]
    expenses?: RecurringExpense[]
  } | null>(null)

  const refreshPrefs = useCallback(async () => {
    const [p, perm, prompted] = await Promise.all([
      getReminderPrefs(),
      getPermissionStatus(),
      getReminderPromptSeen(),
    ])
    setPrefs(p)
    setPermission(perm)
    setShowPromptBanner(Boolean(user) && !prompted && perm !== 'granted')
  }, [user])

  useEffect(() => {
    void (async () => {
      await refreshPrefs()
      setReady(true)
    })()
  }, [refreshPrefs])

  useEffect(() => {
    if (Platform.OS === 'web') return

    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as
        | (ReminderData & { type?: string; route?: string; screen?: string; thread_id?: number })
        | undefined
      track('reminder_tapped', { kind: data?.kind ?? data?.type ?? 'unknown' })

      const route = (data?.route || data?.screen || '').toLowerCase()
      if (data?.type === 'campaign' || route) {
        const map: Record<string, string> = {
          home: '/(tabs)',
          settings: '/(tabs)/settings',
          bills: '/(tabs)/bills',
          wallets: '/(tabs)/wallets',
          income: '/(tabs)/income',
          reports: '/(tabs)/reports',
          family: '/(tabs)/household',
          household: '/(tabs)/household',
          support: '/support',
        }
        const path = map[route]
        if (path) {
          if (route === 'support' && data?.thread_id) {
            router.push(`/support?threadId=${data.thread_id}` as never)
            return
          }
          router.push(path as never)
          return
        }
      }

      if (data?.screen === 'bills') {
        const q = data.kind && data.id
          ? `?focus=${data.kind}&id=${data.id}`
          : ''
        router.push(`/(tabs)/bills${q}` as never)
      }
    })
    return () => sub.remove()
  }, [router])

  // Keep Expo push token registered whenever the user is logged in and OS permission is on.
  // (Ops campaigns need DeviceToken rows — do not gate on due-reminder prefs alone.)
  useEffect(() => {
    if (!user) {
      lastPayload.current = null
      setLastScheduled(0)
      void revokeDeviceToken()
      if (Platform.OS === 'web') return
      void (async () => {
        const scheduled = await Notifications.getAllScheduledNotificationsAsync()
        await Promise.all(
          scheduled
            .filter((n) => (n.content.data as ReminderData | undefined)?.screen === 'bills')
            .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
        )
      })()
      return
    }
    if (Platform.OS === 'web') return
    if (permission === 'granted') {
      void registerDeviceToken()
    }
  }, [user, permission])

  const reschedule = useCallback(async (input: {
    payables: Payable[]
    receivables: Receivable[]
    expenses?: RecurringExpense[]
  }) => {
    lastPayload.current = input
    const n = await rescheduleDueReminders(input)
    setLastScheduled(n)
    return n
  }, [])

  const updatePrefs = useCallback(async (patch: Partial<ReminderPrefs>) => {
    const next = await setReminderPrefs(patch)
    setPrefs(next)
    if (lastPayload.current) {
      const n = await rescheduleDueReminders(lastPayload.current)
      setLastScheduled(n)
    }
  }, [])

  const enableWithPermission = useCallback(async () => {
    const ok = await requestReminderPermission()
    setPermission(ok ? 'granted' : await getPermissionStatus())
    await setReminderPromptSeen()
    setShowPromptBanner(false)
    if (ok) {
      await updatePrefs({ enabled: true })
      void registerDeviceToken()
      void api.patch('/notification-preferences/', {
        enabled: true,
        lead_3: prefs.lead3,
        lead_1: prefs.lead1,
        lead_due: prefs.leadDue,
      }).catch(() => undefined)
    }
    return ok
  }, [updatePrefs, prefs.lead3, prefs.lead1, prefs.leadDue])

  const dismissPrompt = useCallback(async () => {
    await setReminderPromptSeen()
    setShowPromptBanner(false)
  }, [])

  const sendTest = useCallback(async () => sendTestNotification(), [])

  const value = useMemo(
    () => ({
      ready,
      prefs,
      permission,
      lastScheduled,
      showPromptBanner,
      refreshPrefs,
      updatePrefs,
      enableWithPermission,
      dismissPrompt,
      sendTest,
      reschedule,
    }),
    [
      ready,
      prefs,
      permission,
      lastScheduled,
      showPromptBanner,
      refreshPrefs,
      updatePrefs,
      enableWithPermission,
      dismissPrompt,
      sendTest,
      reschedule,
    ],
  )

  return <RemindersContext.Provider value={value}>{children}</RemindersContext.Provider>
}

export function useReminders(): RemindersValue {
  const ctx = useContext(RemindersContext)
  if (!ctx) throw new Error('useReminders must be used within RemindersProvider')
  return ctx
}

export function useRemindersOptional(): RemindersValue | null {
  return useContext(RemindersContext)
}
