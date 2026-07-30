import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'

const ENABLED = 'cashtrail_privacy_enabled'
const TIMEOUT = 'cashtrail_privacy_timeout'
const PIN_HASH = 'cashtrail_privacy_pin_hash'
const SCREENSHOT_BLOCK = 'cashtrail_privacy_block_screenshots'

export type PrivacyTimeout = 'immediate' | '1m' | '5m'

export const PRIVACY_TIMEOUT_MS: Record<PrivacyTimeout, number> = {
  immediate: 0,
  '1m': 60_000,
  '5m': 300_000,
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

async function deleteItem(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(key)
    return
  }
  await SecureStore.deleteItemAsync(key)
}

/** Lightweight local hash — PIN never leaves the device. */
export function hashPin(pin: string): string {
  const salt = 'cashtrail-privacy-v1'
  let h = 5381
  const s = `${salt}:${pin}`
  for (let i = 0; i < s.length; i += 1) {
    h = ((h << 5) + h) ^ s.charCodeAt(i)
  }
  return `v1:${(h >>> 0).toString(16)}`
}

export async function getPrivacyEnabled(): Promise<boolean> {
  return (await getItem(ENABLED)) === '1'
}

export async function setPrivacyEnabled(on: boolean): Promise<void> {
  await setItem(ENABLED, on ? '1' : '0')
}

export async function getPrivacyTimeout(): Promise<PrivacyTimeout> {
  const raw = await getItem(TIMEOUT)
  if (raw === '1m' || raw === '5m' || raw === 'immediate') return raw
  return 'immediate'
}

export async function setPrivacyTimeout(value: PrivacyTimeout): Promise<void> {
  await setItem(TIMEOUT, value)
}

export async function getPinHash(): Promise<string | null> {
  return getItem(PIN_HASH)
}

export async function setPinHash(pin: string): Promise<void> {
  await setItem(PIN_HASH, hashPin(pin))
}

export async function clearPinHash(): Promise<void> {
  await deleteItem(PIN_HASH)
}

export async function verifyPin(pin: string): Promise<boolean> {
  const stored = await getPinHash()
  if (!stored) return false
  return stored === hashPin(pin)
}

export async function hasAppPin(): Promise<boolean> {
  return Boolean(await getPinHash())
}

export async function getBlockScreenshots(): Promise<boolean> {
  const raw = await getItem(SCREENSHOT_BLOCK)
  // Default on when privacy is enabled — stored separately
  return raw !== '0'
}

export async function setBlockScreenshots(on: boolean): Promise<void> {
  await setItem(SCREENSHOT_BLOCK, on ? '1' : '0')
}
