import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'out',
    emptyOutDir: true,
  },
  cacheDir: '/tmp/vite-cache',
  server: {
    // Allow serving files from the NIWA project root (for iteration JSON + photos)
    fs: {
      allow: [
        '.',
        path.resolve(__dirname, '../../'),
      ],
    },
  },
})
