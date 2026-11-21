import { ensureAndroidChannel } from '@/src/notifications/schedule'
import { notifyDetectedTransaction } from '@/src/notifications/detectedTransaction'
import { shouldPostDetectedTxBanner } from '@/src/notifications/detectedTransactionCopy'
import { getBankSmsEnabled } from './storage'
import { ingestBankSmsBody } from './ingest'

/**
 * Headless task for expo-sms-listener when the app is fully closed.
 * Registered from mobile/index.js (Android only).
 *
 * The native service allows about 10 seconds and shows its own low
 * "Processing SMS" line. This task only saves the draft and posts the
 * approve banner. It does not open the app.
 */
export async function handleSmsHeadlessTask(data: {
  body?: string
  originatingAddress?: string
  timestamp?: number
}): Promise<void> {
  const body = (data?.body || '').trim()
  if (!body) return
  try {
    await ensureAndroidChannel()
  } catch {
    /* notify will try the channel again */
  }
  try {
    const smsEnabled = await getBankSmsEnabled()
    const result = await ingestBankSmsBody(body, 'android_sms', undefined, { notify: false })
    if (!result.ok) return
    if (!shouldPostDetectedTxBanner({
      smsEnabled,
      created: result.created,
      pending: result.pending,
    })) {
      return
    }
    await notifyDetectedTransaction(
      {
        id: result.id,
        kind: result.kind,
        amount: result.amount,
        pendingCount: result.pendingCount,
        source: 'android_sms',
      },
      { headless: true },
    )
  } catch {
    /* ignore — next app open still shows the Home card if the draft saved */
  }
}
