import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Proxy /api → Railway (or local) so the browser stays same-origin and avoids CORS.
  const proxyTarget = (
    env.VITE_API_PROXY
    || env.VITE_API_URL
    || 'http://127.0.0.1:8000'
  ).replace(/\/$/, '')

  const apiOrigin = (env.VITE_API_URL || '').trim().replace(/\/$/, '')
  const connect = ["'self'", 'https://tranquil-radiance-production.up.railway.app']
  if (/^https?:\/\//i.test(apiOrigin)) connect.push(apiOrigin)
  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "img-src 'self' data:",
    "font-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self'",
    `connect-src ${[...new Set(connect)].join(' ')}`,
  ].join('; ')

  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'ops-csp',
        transformIndexHtml(html, ctx) {
          if (ctx.server) return html
          return html.replace(
            '<head>',
            `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`,
          )
        },
      },
    ],
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
