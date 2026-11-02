import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'
import { handleApiChat } from './server/forward.ts'

function chatApiPlugin(): Plugin {
  return {
    name: 'studypartner-chat-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathOnly = req.url?.split('?')[0]
        if (req.method === 'POST' && pathOnly === '/api/chat') {
          void handleApiChat(req, res).catch((err) => {
            const message =
              err instanceof Error ? err.message : 'Internal forwarder error'
            console.error('Chat forwarder error:', message)
            if (!res.headersSent) {
              res.writeHead(502, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: message }))
            } else {
              res.end()
            }
          })
          return
        }
        next()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), chatApiPlugin()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
