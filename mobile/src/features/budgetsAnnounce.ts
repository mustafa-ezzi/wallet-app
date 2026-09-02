import * as SecureStore from 'expo-secure-store'

const SEEN_KEY = 'cashtrail_seen_feature_budgets_v1'

export async function hasSeenBudgetsFeature(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(SEEN_KEY)) === '1'
  } catch {
    return true
  }
}

export async function markBudgetsFeatureSeen(): Promise<void> {
  try {
    await SecureStore.setItemAsync(SEEN_KEY, '1')
  } catch {
    /* ignore */
  }
}

export async function shouldShowBudgetsWhatsNew(): Promise<boolean> {
  return !(await hasSeenBudgetsFeature())
}
