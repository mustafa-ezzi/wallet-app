const path = require('path')
const { getDefaultConfig } = require('expo/metro-config')

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname)

const parserRoot = path.resolve(__dirname, '../packages/bank-sms-parser')
config.watchFolders = [...(config.watchFolders || []), parserRoot]
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  '@cashtrail/bank-sms-parser': parserRoot,
}
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
  ...((config.resolver.nodeModulesPaths) || []),
]

module.exports = config
