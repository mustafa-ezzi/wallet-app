const fs = require('fs')
const path = require('path')

function hasWalletTrailsPackage(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8').includes('com.wallettrails.app')
  } catch {
    return false
  }
}

/**
 * Dynamic Expo config:
 * - Prefer google-services-wallettrails.json (new Android package)
 * - Else local google-services.json / GOOGLE_SERVICES_JSON env
 * - Never let a stale CashTrail-only env file overwrite a WalletTrails config
 */
module.exports = ({ config }) => {
  const appJsonPath = path.join(__dirname, 'app.json')
  const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'))
  const expo = { ...(appJson.expo || config) }

  const localPath = path.join(__dirname, 'google-services.json')
  const walletTrailsPath = path.join(__dirname, 'google-services-wallettrails.json')
  const fromEnv = process.env.GOOGLE_SERVICES_JSON

  const candidates = [walletTrailsPath, localPath, fromEnv].filter(
    (p) => p && fs.existsSync(p),
  )

  // Prefer any file that already lists com.wallettrails.app
  const preferred =
    candidates.find((p) => hasWalletTrailsPackage(p))
    || candidates[0]

  if (preferred) {
    try {
      if (path.resolve(preferred) !== path.resolve(localPath)) {
        fs.copyFileSync(preferred, localPath)
      }
    } catch (err) {
      console.warn('[WalletTrails] could not stage google-services.json', err)
    }
  }

  const googleServicesFile = fs.existsSync(localPath)
    ? './google-services.json'
    : undefined

  if (googleServicesFile) {
    expo.android = {
      ...(expo.android || {}),
      googleServicesFile,
    }
  } else {
    console.warn(
      '[WalletTrails] google-services.json missing — Android push will fail until FCM is wired (see PUSH_SETUP.md).',
    )
  }

  return { expo }
}
