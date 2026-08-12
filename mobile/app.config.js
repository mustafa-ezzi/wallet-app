const fs = require('fs')
const path = require('path')

/**
 * Dynamic Expo config:
 * - Local: use ./google-services.json when present
 * - EAS: prefer GOOGLE_SERVICES_JSON file env (path on builder), and copy into project
 *   so prebuild always finds it. Also rely on repo-root .easignore to upload the local file.
 */
module.exports = ({ config }) => {
  const appJsonPath = path.join(__dirname, 'app.json')
  const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'))
  const expo = { ...(appJson.expo || config) }

  const localPath = path.join(__dirname, 'google-services.json')
  const fromEnv = process.env.GOOGLE_SERVICES_JSON

  if (fromEnv && fs.existsSync(fromEnv)) {
    try {
      if (path.resolve(fromEnv) !== path.resolve(localPath)) {
        fs.copyFileSync(fromEnv, localPath)
      }
    } catch (err) {
      console.warn('[CashTrail] could not copy GOOGLE_SERVICES_JSON → google-services.json', err)
    }
  }

  const googleServicesFile = fs.existsSync(localPath)
    ? './google-services.json'
    : (fromEnv && fs.existsSync(fromEnv) ? fromEnv : undefined)

  if (googleServicesFile) {
    expo.android = {
      ...(expo.android || {}),
      googleServicesFile,
    }
  } else {
    console.warn(
      '[CashTrail] google-services.json missing — Android push will fail until FCM is wired (see PUSH_SETUP.md).',
    )
  }

  return { expo }
}
