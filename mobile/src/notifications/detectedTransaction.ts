import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import * as SecureStore from 'expo-secure-store'
import { fmt, toMoney } from '@/src/utils/format'
import { track } from '@/src/lib/analytics'
import { getPrivacyEnabled } from '@/src/privacy/storage'
import { ensureAndroidChannel, getPermissionStatus } from './schedule'
import {
  buildDetectedTransactionContent,
  DETECTED_TX_ACTION_APPROVE,
  DETECTED_TX_ACTION_LATER,
  DETECTED_TX_CATEGORY,
  DETECTED_TX_CHANNEL_ID,
  DETECTED_TX_NOTIFICATION_ID,
  DETECTED_TX_TYPE,
} from './detectedTransactionCopy'

const ALERTS_ENABLED = 'wallettrails_detected_tx_alerts'
const HANDLED_RESPONSE = 'wallettrails_detected_tx_response'

let memoryHandled: string | null = null
let actionsReady: Promise<void> | null = null

/** Approve opens the draft. Not now dismisses the banner and leaves the draft pending. */
export function ensureDetectedTxActions(): Promise<void> {
  if (Platform.OS === 'web') return Promise.resolve()
  if (!actionsReady) {
    actionsReady = Notifications.setNotificationCategoryAsync(DETECTED_TX_CATEGORY, [
      {
        identifier: DETECTED_TX_ACTION_APPROVE,
        buttonTitle: 'Approve',
        options: { opensAppToForeground: true },
      },
      {
        identifier: DETECTED_TX_ACTION_LATER,
        buttonTitle: 'Not now',
        options: { opensAppToForeground: false },
      },
    ])
      .then(() => undefined)
      .catch((err) => {
        actionsReady = null
        throw err
      })
  }
  return actionsReady
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
  try {
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') localStorage.setItem(key, value)
      return
    }
    await SecureStore.setItemAsync(key, value)
  } catch {
    /* ignore */
  }
}

/** Default on until the user turns it off. Missing key means on. */
export async function getDetectedTxAlertsEnabled(): Promise<boolean> {
  return (await getItem(ALERTS_ENABLED)) !== '0'
}

export async function setDetectedTxAlertsEnabled(on: boolean): Promise<void> {
  await setItem(ALERTS_ENABLED, on ? '1' : '0')
}

/**
 * First observer of this notification response wins.
 * Tap delivery can arrive twice (listener + last-response on launch).
 */
export async function claimDetectedTxResponse(identifier: string): Promise<boolean> {
  if (!identifier) return false
  if (memoryHandled === identifier) return false
  const prev = await getItem(HANDLED_RESPONSE)
  if (prev === identifier) {
    memoryHandled = identifier
    return false
  }
  memoryHandled = identifier
  await setItem(HANDLED_RESPONSE, identifier)
  return true
}

type PresentedData = {
  type?: string
  importId?: number | string
}

function isDetected(data: PresentedData | undefined): boolean {
  return data?.type === DETECTED_TX_TYPE
}

/**
 * Remove the detected-transaction banner.
 * With an id, keep a banner that points at a different single draft.
 * A collapsed banner (no id) is removed, because its count is now stale.
 */
export async function dismissDetectedTransactionBanner(handledId?: number): Promise<void> {
  if (Platform.OS === 'web') return
  try {
    const presented = await Notifications.getPresentedNotificationsAsync()
    await Promise.all(
      presented.map(async (n) => {
        const data = n.request.content.data as PresentedData | undefined
        if (!isDetected(data)) return
        const nid = Number(data?.importId)
        const hasId = Number.isFinite(nid) && nid > 0
        if (handledId == null || !hasId || nid === handledId) {
          await Notifications.dismissNotificationAsync(n.request.identifier)
        }
      }),
    )
    const scheduled = await Notifications.getAllScheduledNotificationsAsync()
    await Promise.all(
      scheduled.map(async (n) => {
        const data = n.content.data as PresentedData | undefined
        if (isDetected(data)) await Notifications.cancelScheduledNotificationAsync(n.identifier)
      }),
    )
  } catch {
    /* shade access is best-effort */
  }
}

/**
 * Post one banner for a newly created pending draft.
 * Replaces any previous detected-transaction banner so several detections
 * collapse into "N transactions to book".
 * Returns false when the platform, toggle, or permission blocks it.
 */
export async function notifyDetectedTransaction(
  input: {
    id: number
    kind: string
    amount: number | string | null
    pendingCount: number
    source: string
  },
  opts?: { headless?: boolean; stableId?: boolean },
): Promise<boolean> {
  if (Platform.OS !== 'android') return false
  if (!(await getDetectedTxAlertsEnabled())) return false
  if ((await getPermissionStatus()) !== 'granted') return false

  await ensureAndroidChannel()
  try {
    await ensureDetectedTxActions()
  } catch {
    /* the banner still posts if the buttons could not be registered */
  }
  const privacyOn = await getPrivacyEnabled()
  const money = toMoney(input.amount)
  const content = buildDetectedTransactionContent({
    id: input.id,
    kind: input.kind,
    amountLabel: privacyOn || money <= 0 ? null : fmt(input.amount),
    pendingCount: input.pendingCount,
    source: input.source,
  })
  const postedAt = Date.now()

  // Closed-app SMS has about 10 seconds. Querying the shade can stall that
  // window, so a fixed id replaces the previous banner instead.
  if (!opts?.headless) {
    await dismissDetectedTransactionBanner()
  }
  const useStableId = Boolean(opts?.headless || opts?.stableId)
  await Notifications.scheduleNotificationAsync({
    ...(useStableId ? { identifier: DETECTED_TX_NOTIFICATION_ID } : {}),
    content: {
      title: content.title,
      body: content.body,
      data: { ...content.data, postedAt },
      categoryIdentifier: DETECTED_TX_CATEGORY,
      autoDismiss: true,
      sound: 'default',
      priority: Notifications.AndroidNotificationPriority.HIGH,
    },
    // Immediate delivery on the transaction-alerts channel.
    trigger: { channelId: DETECTED_TX_CHANNEL_ID },
  })
  track('detected_tx_notification_posted', {
    kind: content.data.kind,
    source: content.data.source,
  })
  return true
}
