const fs = require('fs')
const path = require('path')

function googleServicesScore(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8')
    if (!raw.includes('com.wallettrails.android')) return 0
    let score = 1
    if (raw.includes('"client_type": 3')) score += 1
    if (raw.includes('"client_type": 1')) score += 2
    return score
  } catch {
    return 0
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

  const preferred = candidates.reduce((best, current) => {
    if (googleServicesScore(current) === 0) return best
    if (!best || googleServicesScore(current) > googleServicesScore(best)) return current
    return best
  }, null)

  if (preferred) {
    try {
      if (path.resolve(preferred) !== path.resolve(localPath)) {
        fs.copyFileSync(preferred, localPath)
      }
    } catch (err) {
      console.warn('[WalletTrails] could not stage google-services.json', err)
    }
  }

  const googleServicesFile =
    fs.existsSync(localPath) && googleServicesScore(localPath) > 0
      ? './google-services.json'
      : undefined

  if (googleServicesFile) {
    expo.android = {
      ...(expo.android || {}),
      googleServicesFile,
    }
  } else {
    console.warn(
      '[WalletTrails] google-services.json is missing the package com.wallettrails.android — replace it from Firebase before building.',
    )
  }

  const googleWebClientId = (
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
    || expo.extra?.googleWebClientId
    || ''
  ).trim()
  expo.extra = {
    ...(expo.extra || {}),
    googleWebClientId,
  }

  return { expo }
}
