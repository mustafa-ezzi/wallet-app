import { ingestBankSmsBody } from './ingest'

/**
 * Headless task for expo-sms-listener when the app is fully closed.
 * Registered from mobile/index.js (Android only).
 */
export async function handleSmsHeadlessTask(data: {
  body?: string
  originatingAddress?: string
  timestamp?: number
}): Promise<void> {
  const body = (data?.body || '').trim()
  if (!body) return
  try {
    await ingestBankSmsBody(body, 'android_sms')
  } catch {
    /* ignore — next app open will still allow paste */
  }
}
