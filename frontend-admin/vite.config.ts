import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Proxy /api → Railway (or local) so the browser stays same-origin and avoids CORS.
  const proxyTarget = (
    env.VITE_API_PROXY
    || env.VITE_API_URL
    || 'http://127.0.0.1:8000'
  ).replace(/\/$/, '')

  return {
    plugins: [react()],
    server: {
      port: 5174,
      strictPort: false,
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
          secure: true,
        },
        '/admin': {
          target: proxyTarget,
          changeOrigin: true,
          secure: true,
        },
      },
    },
  }
})
