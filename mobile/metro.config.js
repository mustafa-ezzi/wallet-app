const path = require('path')
const { getDefaultConfig } = require('expo/metro-config')

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname)

const projectRoot = __dirname
const parserRoot = path.resolve(projectRoot, '../packages/bank-sms-parser')
const parserEntry = path.resolve(parserRoot, 'src/index.ts')

// Ensure local monorepo package is watched (EAS uploads repo root → sibling packages/).
config.watchFolders = [...new Set([...(config.watchFolders || []), parserRoot])]

const upstreamResolveRequest = config.resolver.resolveRequest
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@cashtrail/bank-sms-parser') {
    return { type: 'sourceFile', filePath: parserEntry }
  }
  if (typeof upstreamResolveRequest === 'function') {
    return upstreamResolveRequest(context, moduleName, platform)
  }
  return context.resolveRequest(context, moduleName, platform)
}

module.exports = config
