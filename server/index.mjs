import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { apiMiddleware } from './api.mjs'

const root = fileURLToPath(new URL('../dist/', import.meta.url))
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
}
const server = createServer((req, res) => {
  apiMiddleware(req, res, async () => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405)
      return res.end()
    }
    try {
      const pathname = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname)
      const path = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`)
      if (path !== root && !path.startsWith(root + (root.endsWith(sep) ? '' : sep))) {
        res.writeHead(403)
        return res.end()
      }
      let data,
        selected = path
      try {
        data = await readFile(path)
      } catch {
        if (extname(path)) {
          res.writeHead(404)
          return res.end()
        }
        selected = resolve(root, 'index.html')
        data = await readFile(selected)
      }
      res.setHeader('Content-Type', mime[extname(selected)] || 'application/octet-stream')
      res.setHeader('X-Content-Type-Options', 'nosniff')
      res.setHeader('Referrer-Policy', 'same-origin')
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self'; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'",
      )
      res.end(req.method === 'HEAD' ? undefined : data)
    } catch {
      res.writeHead(400)
      res.end('Requête invalide.')
    }
  }).catch(() => {
    if (!res.headersSent) res.writeHead(500)
    res.end()
  })
})
server.listen(Number(process.env.PORT || 4173), '0.0.0.0', () =>
  console.log('Deadlock Atelier : serveur prêt sur le port ' + (process.env.PORT || 4173)),
)
