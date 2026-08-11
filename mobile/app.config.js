const fs = require('fs')
const path = require('path')

/**
 * Dynamic Expo config so we can attach google-services.json only when present.
 * Keep static fields in app.json; this file merges FCM wiring for EAS builds.
 */
module.exports = ({ config }) => {
  const appJsonPath = path.join(__dirname, 'app.json')
  const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'))
  const expo = { ...(appJson.expo || config) }

  const googleServices = path.join(__dirname, 'google-services.json')
  if (fs.existsSync(googleServices)) {
    expo.android = {
      ...(expo.android || {}),
      googleServicesFile: './google-services.json',
    }
  }

  return { expo }
}
