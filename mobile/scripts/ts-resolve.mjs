// Lets `node --test` load app TypeScript that uses extension-less relative imports (Metro style).
import { registerHooks } from 'node:module'

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context)
    } catch (err) {
      if (!specifier.startsWith('.') || /\.[cm]?[jt]s$/.test(specifier)) throw err
      for (const candidate of [`${specifier}.ts`, `${specifier}/index.ts`]) {
        try {
          return nextResolve(candidate, context)
        } catch {
          // try the next candidate
        }
      }
      throw err
    }
  },
})
