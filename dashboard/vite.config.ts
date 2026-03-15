import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import fs from 'fs'

// Serve NIWA data files (iteration JSON + photos) from project root
function niwaDataPlugin(): Plugin {
  const projectRoot = path.resolve(__dirname, '..')
  return {
    name: 'niwa-data',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.startsWith('/data/')) {
          const filePath = path.join(projectRoot, 'agents/coordinator/memory', req.url.replace('/data/', ''))
          if (fs.existsSync(filePath)) {
            res.setHeader('Content-Type', 'application/json')
            res.setHeader('Cache-Control', 'no-store')
            fs.createReadStream(filePath).pipe(res)
            return
          }
        }
        if (req.url?.startsWith('/photos/')) {
          const filePath = path.join(projectRoot, req.url)
          if (fs.existsSync(filePath)) {
            res.setHeader('Content-Type', 'image/jpeg')
            fs.createReadStream(filePath).pipe(res)
            return
          }
        }
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), niwaDataPlugin()],
  build: {
    outDir: 'out',
    emptyOutDir: true,
  },
  cacheDir: '/tmp/vite-cache',
  server: {
    fs: {
      allow: [
        '.',
        path.resolve(__dirname, '..'),
      ],
    },
  },
})
