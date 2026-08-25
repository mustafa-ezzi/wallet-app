import { Platform, AppRegistry } from 'react-native'

if (Platform.OS === 'android') {
  // Native Android only — Expo Go won't show widgets; needs an EAS APK.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { registerWidgetTaskHandler } = require('react-native-android-widget')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { widgetTaskHandler } = require('./src/widgets/widgetTaskHandler')
  registerWidgetTaskHandler(widgetTaskHandler)

  // Bank SMS headless ingest (expo-sms-listener) — EAS / dev client only
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { handleSmsHeadlessTask } = require('./src/bankSms/headlessTask')
    AppRegistry.registerHeadlessTask('ExpoSmsListenerBackground', () => handleSmsHeadlessTask)
  } catch {
    /* module missing in Expo Go */
  }
}

import 'expo-router/entry'
