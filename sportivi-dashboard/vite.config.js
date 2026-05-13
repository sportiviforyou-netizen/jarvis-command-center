import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages deploys to /jarvis-command-center/ sub-path.
// VITE_BASE_URL can override this for other deployment targets (e.g. '/' for Render/Netlify).
const base = process.env.VITE_BASE_URL ?? '/jarvis-command-center/'

export default defineConfig({
  base,
  plugins: [react()],
  server: {
    // Proxy AliExpress API calls to bypass browser CORS
    proxy: {
      '/ae-api': {
        target: 'https://api-sg.aliexpress.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ae-api/, ''),
      },
    },
  },
})
