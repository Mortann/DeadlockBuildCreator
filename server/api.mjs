import { steamMiddleware } from './steam.mjs'
import { cacheUploadMiddleware } from './cache-upload.mjs'

const cache = new Map()
const inflight = new Map()
const recoveryAttempts = []
let historyRefreshAt = 0
const integer = /^[1-9]\d{0,15}$/
const RESPONSE_LIMIT = 32 * 1024 * 1024
const CACHE_LIMIT = 128 * 1024 * 1024
let cacheBytes = 0

async function readBounded(response) {
  if (Number(response.headers.get('content-length')) > RESPONSE_LIMIT) {
    await response.body?.cancel()
    throw Object.assign(new Error('Réponse trop volumineuse.'), { tooLarge: true })
  }
  const reader = response.body?.getReader()
  if (!reader) return { text: '', bytes: 0 }
  const decoder = new TextDecoder()
  const parts = []
  let bytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > RESPONSE_LIMIT) {
        await reader.cancel()
        throw Object.assign(new Error('Réponse trop volumineuse.'), { tooLarge: true })
      }
      parts.push(decoder.decode(value, { stream: true }))
    }
    parts.push(decoder.decode())
    return { text: parts.join(''), bytes }
  } finally {
    reader.releaseLock()
  }
}

function deleteCached(key) {
  const entry = cache.get(key)
  if (entry) cacheBytes -= entry.bytes
  cache.delete(key)
}

function remember(key, payload) {
  for (const [entryKey, entry] of cache) if (entry.until <= Date.now()) deleteCached(entryKey)
  deleteCached(key)
  while (cache.size >= 100 || cacheBytes + payload.bytes > CACHE_LIMIT)
    deleteCached(cache.keys().next().value)
  cache.set(key, {
    ...payload,
    until: Date.now() + (key.includes('/match-history') ? 30000 : 600000),
  })
  cacheBytes += payload.bytes
}

async function upstreamJson(path, timeout = 30000, refresh = false) {
  const hit = cache.get(path)
  if (!refresh && hit && hit.until > Date.now()) return hit
  const key = refresh ? `refresh:${path}` : path
  if (inflight.has(key)) return inflight.get(key)
  const job = (async () => {
    const response = await fetch(`https://api.deadlock-api.com${path}`, {
      signal: AbortSignal.timeout(timeout),
      headers: {
        Accept: 'application/json',
        ...(process.env.DEADLOCK_API_KEY ? { 'X-API-Key': process.env.DEADLOCK_API_KEY } : {}),
      },
    })
    const historyFallback =
      response.status === 429 && path.includes('/match-history') && !path.includes('force_refetch')
    if (!response.ok && !historyFallback) {
      const retryAfter = Number(response.headers.get('retry-after'))
      await response.body?.cancel()
      throw Object.assign(new Error('upstream'), {
        status: response.status,
        retryAfter:
          Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(86400, retryAfter) : undefined,
      })
    }
    const payload = await readBounded(response)
    const parsed = JSON.parse(payload.text)
    if (historyFallback && !Array.isArray(parsed))
      throw Object.assign(new Error('upstream'), {
        status: 429,
        retryAfter: Number(response.headers.get('retry-after')) || undefined,
      })
    payload.fetchedAt = new Date().toISOString()
    const called = response.headers.get('called-steam')
    payload.historySource = called === 'true' ? 'steam' : called === 'false' ? 'stored' : 'unknown'
    payload.limited = historyFallback
    payload.retryAfter = Number(response.headers.get('retry-after')) || undefined
    remember(path, payload)
    return payload
  })()
  inflight.set(key, job)
  try {
    return await job
  } finally {
    inflight.delete(key)
  }
}

export async function apiMiddleware(req, res, next) {
  const url = new URL(req.url || '/', 'http://localhost')
  if (!url.pathname.startsWith('/api/')) return next()
  if (url.pathname.startsWith('/api/auth/steam/')) return steamMiddleware(req, res, next)
  if (url.pathname === '/api/matches/cache') return cacheUploadMiddleware(req, res)
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  const reply = (status, value) => {
    res.statusCode = status
    res.end(JSON.stringify(value))
  }
  const replyPayload = (payload) => {
    if (history) {
      res.setHeader('X-Deadlock-History-Source', payload.historySource ?? 'unknown')
      res.setHeader('X-Deadlock-Fetched-At', payload.fetchedAt)
      res.setHeader('X-Deadlock-History-Limited', String(!!payload.limited))
      if (payload.retryAfter) res.setHeader('Retry-After', String(payload.retryAfter))
    }
    res.statusCode = 200
    res.end(payload.text)
  }
  const history = url.pathname.match(/^\/api\/players\/([^/]+)\/(history|refresh)$/)
  const account = url.pathname.match(/^\/api\/players\/([^/]+)\/profile$/)
  const metadata = url.pathname.match(/^\/api\/matches\/([^/]+)(\/recover)?$/)
  const validAccount = (id) => integer.test(id) && BigInt(id) <= 4294967295n
  const mutation = !!metadata?.[2] || history?.[2] === 'refresh'
  if (
    mutation &&
    (req.headers['sec-fetch-site'] === 'cross-site' ||
      (req.headers.origin &&
        ![
          process.env.APP_ORIGIN,
          `http://${req.headers.host}`,
          `https://${req.headers.host}`,
        ].includes(req.headers.origin)))
  )
    return reply(403, { error: 'Origine non autorisée.' })
  if (req.method !== (mutation ? 'POST' : 'GET'))
    return reply(405, { error: 'Méthode non autorisée.' })
  let path
  if (history && validAccount(history[1]))
    path = `/v1/players/${history[1]}/match-history${history[2] === 'refresh' ? '?force_refetch=true' : ''}`
  else if (metadata && integer.test(metadata[1]))
    path = `/v1/matches/${metadata[1]}/metadata?disable_steam=${metadata[2] ? 'false' : 'true'}`
  else if (!(account && validAccount(account[1])))
    return reply(404, { error: 'Route API inconnue ou identifiant invalide.' })
  try {
    if (account) {
      const id = account[1]
      const entries = [
        ['steam', `/v1/players/steam?account_ids=${id}`],
        ['heroes', `/v1/players/hero-stats?account_ids=${id}&game_mode=normal`],
        ['rank', `/v1/players/${id}/rank`],
        ['ingest', `/v1/players/${id}/ingest-status`],
      ]
      const results = await Promise.allSettled(
        entries.map(async ([name, p]) => [name, JSON.parse((await upstreamJson(p)).text)]),
      )
      const body = { account_id: Number(id), unavailable: [] }
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') {
          const [name, value] = r.value
          if (name === 'steam')
            body.steam = Array.isArray(value)
              ? value
                  .filter((v) => v.account_id === Number(id))
                  .map((v) => ({
                    account_id: v.account_id,
                    personaname: v.personaname,
                    profileurl: v.profileurl,
                  }))
              : []
          else body[name] = value
        } else body.unavailable.push(entries[i][0])
      })
      return reply(200, body)
    }
    if (metadata?.[2]) {
      const cached = cache.get(`/v1/matches/${metadata[1]}/metadata?disable_steam=true`)
      if (cached && cached.until > Date.now()) return replyPayload(cached)
      // A manual retry can spend a scarce Steam quota. Deduplicate and bound it.
      const now = Date.now(),
        limit = process.env.DEADLOCK_API_KEY ? 50 : 3
      while (recoveryAttempts.length && recoveryAttempts[0] < now - 3600000)
        recoveryAttempts.shift()
      if (!inflight.has(`refresh:${path}`) && recoveryAttempts.length >= limit) {
        res.setHeader(
          'Retry-After',
          String(Math.ceil((recoveryAttempts[0] + 3600000 - now) / 1000)),
        )
        return reply(429, {
          code: 'quota',
          error: 'Quota de récupération atteint. Réessayez plus tard.',
        })
      }
      if (!inflight.has(`refresh:${path}`)) recoveryAttempts.push(now)
    }
    if (history?.[2] === 'refresh') {
      const wait = historyRefreshAt + 3600000 - Date.now()
      if (wait > 0) {
        res.setHeader('Retry-After', String(Math.ceil(wait / 1000)))
        return reply(429, {
          code: 'quota',
          error: 'Actualisation Steam disponible une fois par heure.',
        })
      }
      historyRefreshAt = Date.now()
    }
    const payload = await upstreamJson(path, mutation ? 90000 : 30000, mutation)
    if (metadata?.[2]) remember(`/v1/matches/${metadata[1]}/metadata?disable_steam=true`, payload)
    if (history?.[2] === 'refresh') remember(`/v1/players/${history[1]}/match-history`, payload)
    return replyPayload(payload)
  } catch (error) {
    if (error.retryAfter) res.setHeader('Retry-After', String(error.retryAfter))
    if (error.tooLarge)
      return reply(502, { error: 'Métadonnées trop volumineuses : 32 Mo maximum par partie.' })
    if (error.status === 404)
      return reply(404, {
        code: 'metadata_missing',
        recoverable: !metadata?.[2],
        error: metadata?.[2]
          ? 'Détails introuvables. Ouvrez la partie dans Deadlock, puis synchronisez votre cache Steam.'
          : 'Détails non disponibles dans le cache.',
        helpUrl: 'https://deadlock-api.com/ingest-cache',
      })
    if (error.status === 429)
      return reply(429, { code: 'quota', error: 'Quota de l’API atteint. Réessayez plus tard.' })
    if (error.status === 403)
      return reply(502, {
        code: 'access_denied',
        error: 'Accès refusé par Deadlock API. L’import JSON reste disponible.',
      })
    return reply(502, {
      code: 'unavailable',
      error:
        'Deadlock API est inaccessible. Vos données sont conservées ; l’import JSON reste disponible.',
    })
  }
}
