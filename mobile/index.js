import { Platform } from 'react-native'

if (Platform.OS === 'android') {
  // Native Android only — Expo Go won't show widgets; needs an EAS APK.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { registerWidgetTaskHandler } = require('react-native-android-widget')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { widgetTaskHandler } = require('./src/widgets/widgetTaskHandler')
  registerWidgetTaskHandler(widgetTaskHandler)
}

import 'expo-router/entry'
