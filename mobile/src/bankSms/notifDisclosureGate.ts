import { Alert, Platform } from 'react-native'
import { BANK_SMS_UX } from '@/src/lib/bank-sms-parser'

type DisclosureGate = () => Promise<boolean>

let uiGate: DisclosureGate | null = null

/** Register a full-screen disclosure (e.g. AppSheet on Bank alerts). Falls back to Alert. */
export function registerNotifAccessDisclosureGate(gate: DisclosureGate | null) {
  uiGate = gate
}

export async function confirmNotificationAccessDisclosure(): Promise<boolean> {
  if (Platform.OS !== 'android') return true
  if (uiGate) return uiGate()
  return new Promise((resolve) => {
    Alert.alert(
      BANK_SMS_UX.notifAccessDisclosureTitle,
      BANK_SMS_UX.notifAccessDisclosureBody,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Continue to settings', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    )
  })
}
