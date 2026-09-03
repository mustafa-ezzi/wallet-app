import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import type { Payable, Receivable, RecurringExpense } from '@/src/api/types'
import { fmt, toMoney } from '@/src/utils/format'
import { track } from '@/src/lib/analytics'
import { getPrivacyEnabled } from '@/src/privacy/storage'
import { getReminderPrefs, leadDaysFromPrefs } from './storage'

const CHANNEL_ID = 'WalletTrails-due-reminders'
export const REMINDER_CATEGORY = 'WalletTrails_due'

export type ReminderData = {
  kind: 'payable' | 'receivable' | 'expense'
  id: number
  screen: 'bills'
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
})

/** 09:00 Asia/Karachi = 04:00 UTC (no DST). */
function atKarachiMorning(year: number, monthIndex0: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex0, day, 4, 0, 0))
}

function daysInMonth(year: number, monthIndex0: number): number {
  return new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate()
}

function clampDueDay(year: number, monthIndex0: number, dueDay: number): number {
  const dim = daysInMonth(year, monthIndex0)
  return Math.min(Math.max(1, dueDay), dim)
}

/** Next `monthsAhead` due mornings in Karachi, then subtract lead days. */
export function upcomingFireDates(dueDay: number, leadDays: number[], monthsAhead = 4): Date[] {
  const now = Date.now()
  const fires: Date[] = []
  const base = new Date()
  // Interpret "now" month in Karachi
  const karachiNow = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(base)
  let year = Number(karachiNow.find((p) => p.type === 'year')?.value)
  let month = Number(karachiNow.find((p) => p.type === 'month')?.value) - 1

  for (let i = 0; i < monthsAhead; i += 1) {
    const y = year + Math.floor((month + i) / 12)
    const m = (month + i) % 12
    const day = clampDueDay(y, m, dueDay)
    const due = atKarachiMorning(y, m, day)
    for (const lead of leadDays) {
      const fire = new Date(due.getTime() - lead * 24 * 60 * 60 * 1000)
      if (fire.getTime() > now + 60_000) fires.push(fire)
    }
  }
  return fires
}

function dueDayFromStartDate(startDate: string): number {
  const parts = startDate.split('-')
  const d = Number(parts[2])
  return Number.isFinite(d) && d >= 1 ? d : 1
}

export async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Due date reminders',
    importance: Notifications.AndroidImportance.DEFAULT,
    description: 'Loan and money-owed due reminders',
  })
  await Notifications.setNotificationChannelAsync('WalletTrails-updates', {
    name: 'Product updates',
    importance: Notifications.AndroidImportance.DEFAULT,
    description: 'WalletTrails news and product updates',
  })
}

export async function getPermissionStatus(): Promise<'granted' | 'denied' | 'undetermined'> {
  if (Platform.OS === 'web') return 'denied'
  const cur = await Notifications.getPermissionsAsync()
  if (cur.granted) return 'granted'
  if (cur.canAskAgain === false) return 'denied'
  if (cur.status === 'undetermined') return 'undetermined'
  return cur.granted ? 'granted' : 'denied'
}

export async function requestReminderPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false
  await ensureAndroidChannel()
  const cur = await Notifications.getPermissionsAsync()
  if (cur.granted) return true
  const next = await Notifications.requestPermissionsAsync()
  return Boolean(next.granted)
}

/**
 * Fire a local test notification so the user can confirm banners work.
 * Asks for permission if needed. Returns false if denied / web.
 */
export async function sendTestNotification(): Promise<boolean> {
  if (Platform.OS === 'web') return false
  const ok = await requestReminderPermission()
  if (!ok) return false

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'WalletTrails test',
      body: 'Notifications are working. You’ll get reminders like this for loans and bills.',
      data: { screen: 'bills', kind: 'payable', id: 0, test: true },
      sound: true,
      ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {}),
    },
    // Slight delay so you can leave Settings / background the app
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 3,
    },
  })
  track('test_notification_sent')
  return true
}

async function cancelWalletTrailsReminders(): Promise<void> {
  if (Platform.OS === 'web') return
  const scheduled = await Notifications.getAllScheduledNotificationsAsync()
  await Promise.all(
    scheduled
      .filter((n) => (n.content.data as ReminderData | undefined)?.screen === 'bills')
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  )
}

function leadLabel(lead: number): string {
  if (lead === 0) return 'due today'
  if (lead === 1) return 'due tomorrow'
  return `due in ${lead} days`
}

function bodyFor(
  kind: ReminderData['kind'],
  name: string,
  amount: number | string,
  lead: number,
  privacyOn: boolean,
): { title: string; body: string } {
  const when = leadLabel(lead)
  if (privacyOn) {
    if (kind === 'payable') {
      return { title: 'Loan reminder', body: `An installment is ${when}. Open WalletTrails to review.` }
    }
    if (kind === 'receivable') {
      return { title: 'Money owed reminder', body: `A receipt is ${when}. Open WalletTrails to review.` }
    }
    return { title: 'Bill reminder', body: `A bill is ${when}. Open WalletTrails to review.` }
  }
  const money = fmt(toMoney(amount))
  if (kind === 'payable') {
    return { title: 'Loan reminder', body: `${name} is ${when} — ${money}` }
  }
  if (kind === 'receivable') {
    return { title: 'Money owed reminder', body: `${name} is ${when} — ${money}` }
  }
  return { title: 'Bill reminder', body: `${name} is ${when} — ${money}` }
}

async function scheduleOne(
  fire: Date,
  lead: number,
  kind: ReminderData['kind'],
  id: number,
  name: string,
  amount: number | string,
  privacyOn: boolean,
): Promise<void> {
  const { title, body } = bodyFor(kind, name, amount, lead, privacyOn)
  const data: ReminderData = { kind, id, screen: 'bills' }
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data,
      sound: true,
        ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {}),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: fire,
    },
  })
}

export type ScheduleInput = {
  payables: Payable[]
  receivables: Receivable[]
  expenses?: RecurringExpense[]
}

export async function rescheduleDueReminders(input: ScheduleInput): Promise<number> {
  if (Platform.OS === 'web') return 0

  const prefs = await getReminderPrefs()
  await cancelWalletTrailsReminders()

  if (!prefs.enabled) return 0
  const permission = await getPermissionStatus()
  if (permission !== 'granted') return 0

  const leads = leadDaysFromPrefs(prefs)
  if (leads.length === 0) return 0

  await ensureAndroidChannel()
  const privacyOn = await getPrivacyEnabled()
  let scheduled = 0

  for (const p of input.payables) {
    if (p.status === 'completed') continue
    if (p.paid_this_month) continue
    const dueDay = Number(p.due_day) || 1
    for (const lead of leads) {
      const fires = upcomingFireDates(dueDay, [lead])
      for (const fire of fires.slice(0, 3)) {
        await scheduleOne(fire, lead, 'payable', p.id, p.name, p.monthly_amount, privacyOn)
        scheduled += 1
      }
    }
  }

  for (const r of input.receivables) {
    if (r.status === 'completed') continue
    if (r.received_this_month) continue
    const dueDay = dueDayFromStartDate(r.start_date)
    const name = r.project_name || `Project #${r.linked_project}`
    for (const lead of leads) {
      const fires = upcomingFireDates(dueDay, [lead])
      for (const fire of fires.slice(0, 3)) {
        await scheduleOne(fire, lead, 'receivable', r.id, name, r.monthly_amount, privacyOn)
        scheduled += 1
      }
    }
  }

  for (const e of input.expenses ?? []) {
    if (!e.active) continue
    if (e.paid_this_month) continue
    const dueDay = Number(e.due_day) || 1
    for (const lead of leads) {
      const fires = upcomingFireDates(dueDay, [lead])
      for (const fire of fires.slice(0, 2)) {
        await scheduleOne(fire, lead, 'expense', e.id, e.name, e.amount, privacyOn)
        scheduled += 1
      }
    }
  }

  if (scheduled > 0) {
    track('reminder_scheduled', { count: scheduled })
  }
  return scheduled
}

/** In-app due badge helper (works even if notifications denied). */
export function isDueSoon(dueDay: number, withinDays = 3): boolean {
  const karachi = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const year = Number(karachi.find((p) => p.type === 'year')?.value)
  const month = Number(karachi.find((p) => p.type === 'month')?.value) - 1
  const day = Number(karachi.find((p) => p.type === 'day')?.value)
  const today = atKarachiMorning(year, month, day)
  const due = atKarachiMorning(year, month, clampDueDay(year, month, dueDay))
  let target = due
  if (due.getTime() < today.getTime()) {
    const nm = month === 11 ? 0 : month + 1
    const ny = month === 11 ? year + 1 : year
    target = atKarachiMorning(ny, nm, clampDueDay(ny, nm, dueDay))
  }
  const diff = (target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000)
  return diff >= 0 && diff <= withinDays
}
