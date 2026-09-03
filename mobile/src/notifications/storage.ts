import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'

const ENABLED = 'wallettrails_reminders_enabled'
const LEAD_3 = 'wallettrails_reminders_lead_3'
const LEAD_1 = 'wallettrails_reminders_lead_1'
const LEAD_0 = 'wallettrails_reminders_lead_0'
const PROMPTED = 'wallettrails_reminders_prompted'

export type ReminderPrefs = {
  enabled: boolean
  /** Remind 3 days before due */
  lead3: boolean
  /** Remind 1 day before due */
  lead1: boolean
  /** Remind on due day morning */
  leadDue: boolean
  /** Default Asia/Karachi (UTC+5, no DST) */
  timeZone: 'Asia/Karachi'
}

const DEFAULTS: ReminderPrefs = {
  enabled: false,
  lead3: true,
  lead1: true,
  leadDue: true,
  timeZone: 'Asia/Karachi',
}

async function getItem(key: string): Promise<string | null> {
  try {
    if (Platform.OS === 'web') {
      if (typeof localStorage === 'undefined') return null
      return localStorage.getItem(key)
    }
    return await SecureStore.getItemAsync(key)
  } catch {
    return null
  }
}

async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value)
    return
  }
  await SecureStore.setItemAsync(key, value)
}

export async function getReminderPrefs(): Promise<ReminderPrefs> {
  const [en, l3, l1, l0] = await Promise.all([
    getItem(ENABLED),
    getItem(LEAD_3),
    getItem(LEAD_1),
    getItem(LEAD_0),
  ])
  return {
    enabled: en === '1',
    lead3: l3 !== '0',
    lead1: l1 !== '0',
    leadDue: l0 !== '0',
    timeZone: 'Asia/Karachi',
  }
}

export async function setReminderPrefs(patch: Partial<ReminderPrefs>): Promise<ReminderPrefs> {
  const cur = await getReminderPrefs()
  const next: ReminderPrefs = { ...cur, ...patch, timeZone: 'Asia/Karachi' }
  await Promise.all([
    setItem(ENABLED, next.enabled ? '1' : '0'),
    setItem(LEAD_3, next.lead3 ? '1' : '0'),
    setItem(LEAD_1, next.lead1 ? '1' : '0'),
    setItem(LEAD_0, next.leadDue ? '1' : '0'),
  ])
  return next
}

export async function getReminderPromptSeen(): Promise<boolean> {
  return (await getItem(PROMPTED)) === '1'
}

export async function setReminderPromptSeen(): Promise<void> {
  await setItem(PROMPTED, '1')
}

export function leadDaysFromPrefs(prefs: ReminderPrefs): number[] {
  const days: number[] = []
  if (prefs.lead3) days.push(3)
  if (prefs.lead1) days.push(1)
  if (prefs.leadDue) days.push(0)
  return days
}

export { DEFAULTS as REMINDER_DEFAULTS }
