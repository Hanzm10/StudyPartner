import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { handleApiChat } from './forward.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.resolve(__dirname, '..', 'dist')
const port = Number(process.env.PORT) || 4173

const MIME_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

function contentTypeFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  return MIME_TYPES[ext] ?? 'application/octet-stream'
}

function resolveStaticPath(pathname: string): string | null {
  const decoded = decodeURIComponent(pathname)
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '')
  const candidate = path.resolve(distDir, relative)
  if (
    candidate !== distDir &&
    !candidate.startsWith(distDir + path.sep)
  ) {
    return null
  }
  return candidate
}

function sendFile(res: http.ServerResponse, filePath: string): void {
  const stream = fs.createReadStream(filePath)
  res.writeHead(200, { 'Content-Type': contentTypeFor(filePath) })
  stream.pipe(res)
  stream.on('error', () => {
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
    }
    res.end('Failed to read file')
  })
}

function serveStatic(res: http.ServerResponse, pathname: string): void {
  const resolved = resolveStaticPath(pathname)
  if (!resolved) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Forbidden')
    return
  }

  let filePath = resolved
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(distDir, 'index.html')
  }

  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Not found')
    return
  }

  sendFile(res, filePath)
}

const server = http.createServer((req, res) => {
  const host = req.headers.host ?? `localhost:${port}`
  const url = new URL(req.url ?? '/', `http://${host}`)

  if (url.pathname === '/api/chat') {
    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Method not allowed' }))
      return
    }
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

  if (req.method === 'GET' || req.method === 'HEAD') {
    serveStatic(res, url.pathname)
    return
  }

  res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' })
  res.end('Method not allowed')
})

server.listen(port, () => {
  console.log(`StudyPartner listening on http://localhost:${port}`)
})
