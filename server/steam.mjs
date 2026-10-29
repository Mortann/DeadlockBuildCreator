import { randomBytes, timingSafeEqual } from 'node:crypto'

const ENDPOINT = 'https://steamcommunity.com/openid/login'
const NS = 'http://specs.openid.net/auth/2.0'
const COOKIE = 'deadlock_steam'
const pending = new Map()
const results = new Map()
const MAX_AGE = 600000
const same = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const left = Buffer.from(a),
    right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

// Never infer the public callback from an arbitrary Host or forwarding header.
function appOrigin(req) {
  if (process.env.APP_ORIGIN) {
    const u = new URL(process.env.APP_ORIGIN)
    if (
      u.protocol !== 'https:' ||
      u.username ||
      u.password ||
      u.pathname !== '/' ||
      u.search ||
      u.hash
    )
      throw new Error('APP_ORIGIN doit être une origine HTTPS, sans chemin.')
    return u.origin
  }
  const host = req.headers.host ?? ''
  if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/.test(host))
    throw new Error('Configurez APP_ORIGIN pour la connexion Steam hors de localhost.')
  return new URL(`http://${host}`).origin
}
function cookie(req) {
  return (req.headers.cookie ?? '')
    .split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1)
}
function setCookie(res, value, origin, maxAge = 600) {
  res.setHeader(
    'Set-Cookie',
    `${COOKIE}=${value}; Path=/api/auth/steam; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${origin.startsWith('https:') ? '; Secure' : ''}`,
  )
}
function prune() {
  for (const map of [pending, results]) {
    for (const [key, value] of map) if (value.expires <= Date.now()) map.delete(key)
    while (map.size >= 500) map.delete(map.keys().next().value)
  }
}
function redirect(res, target) {
  res.statusCode = 303
  res.setHeader('Location', target)
  res.end()
}

/** OpenID identifies an account. It grants no game, replay or Steam session access. */
export async function steamMiddleware(req, res, next) {
  const url = new URL(req.url ?? '/', 'http://localhost')
  if (!url.pathname.startsWith('/api/auth/steam/')) return next()
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  if (req.method !== 'GET') {
    res.statusCode = 405
    return res.end(JSON.stringify({ error: 'Méthode non autorisée.' }))
  }
  let origin
  try {
    origin = appOrigin(req)
  } catch (error) {
    res.statusCode = 503
    return res.end(JSON.stringify({ error: error.message }))
  }
  prune()
  if (url.pathname === '/api/auth/steam/start') {
    const old = cookie(req)
    pending.delete(old)
    results.delete(old)
    const state = randomBytes(32).toString('hex')
    const returnTo = `${origin}/api/auth/steam/callback?state=${state}`
    pending.set(state, { returnTo, origin, expires: Date.now() + MAX_AGE })
    setCookie(res, state, origin)
    const target = new URL(ENDPOINT)
    target.search = new URLSearchParams({
      'openid.ns': NS,
      'openid.mode': 'checkid_setup',
      'openid.return_to': returnTo,
      'openid.realm': origin + '/',
      'openid.identity': `${NS}/identifier_select`,
      'openid.claimed_id': `${NS}/identifier_select`,
    }).toString()
    return redirect(res, target.href)
  }
  if (url.pathname === '/api/auth/steam/result') {
    // SameSite=Lax excludes subresource requests from other sites; also check Origin when present.
    if (req.headers.origin && req.headers.origin !== origin) {
      res.statusCode = 403
      return res.end('{}')
    }
    const key = cookie(req),
      result = results.get(key)
    if (!result || result.origin !== origin) {
      res.statusCode = 401
      return res.end(JSON.stringify({ error: 'Connexion Steam expirée. Réessayez.' }))
    }
    // A short-lived result is repeatable for React StrictMode and retrying network requests.
    return res.end(JSON.stringify({ accountId: result.accountId, steamId64: result.steamId64 }))
  }
  if (url.pathname !== '/api/auth/steam/callback') {
    res.statusCode = 404
    return res.end('{}')
  }
  const state = url.searchParams.get('state'),
    entry = pending.get(state)
  if (!entry || entry.origin !== origin || !same(state, cookie(req)))
    return redirect(res, `${origin}/?steam=expired`)
  pending.delete(state) // a callback can be checked only once, including failed checks
  const fail = (code) => {
    setCookie(res, '', origin, 0)
    return redirect(res, `${origin}/?steam=${code}`)
  }
  if (url.searchParams.get('openid.mode') === 'cancel') return fail('cancelled')
  try {
    const params = url.searchParams
    if ([...new Set(params.keys())].some((key) => params.getAll(key).length !== 1))
      throw new Error('duplicate')
    const signed = new Set((params.get('openid.signed') ?? '').split(','))
    if (
      ['op_endpoint', 'claimed_id', 'identity', 'return_to', 'response_nonce', 'assoc_handle'].some(
        (key) => !signed.has(key),
      )
    )
      throw new Error('unsigned')
    const identity = params.get('openid.claimed_id') ?? ''
    const steamId64 = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/.exec(identity)?.[1]
    const accountId = steamId64 ? BigInt(steamId64) - 76561197960265728n : 0n
    const nonce = params.get('openid.response_nonce') ?? '',
      nonceTime = Date.parse(nonce.slice(0, 20))
    if (
      !steamId64 ||
      accountId <= 0n ||
      accountId > 4294967295n ||
      params.get('openid.ns') !== NS ||
      params.get('openid.mode') !== 'id_res' ||
      params.get('openid.op_endpoint') !== ENDPOINT ||
      params.get('openid.identity') !== identity ||
      params.get('openid.return_to') !== entry.returnTo ||
      !params.get('openid.sig') ||
      !params.get('openid.assoc_handle') ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ.+$/.test(nonce) ||
      !Number.isFinite(nonceTime) ||
      nonceTime < Date.now() - MAX_AGE ||
      nonceTime > Date.now() + 60000
    )
      throw new Error('claims')
    const body = new URLSearchParams([...params].filter(([k]) => k.startsWith('openid.')))
    body.set('openid.mode', 'check_authentication')
    const check = await fetch(ENDPOINT, {
      method: 'POST',
      body,
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    })
    // Read a bounded response. Never accept the browser's identity without Steam verification.
    const reader = check.body?.getReader()
    let text = '',
      bytes = 0
    if (reader) {
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          bytes += value.byteLength
          if (bytes > 8192) {
            await reader.cancel()
            throw new Error('size')
          }
          text += new TextDecoder().decode(value)
        }
      } finally {
        reader.releaseLock()
      }
    }
    const valid = text.split(/\r?\n/).filter((line) => line.startsWith('is_valid:'))
    if (!check.ok || valid.length !== 1 || valid[0] !== 'is_valid:true')
      throw new Error('verification')
    const key = randomBytes(32).toString('hex')
    results.set(key, {
      accountId: Number(accountId),
      steamId64,
      origin,
      expires: Date.now() + MAX_AGE,
    })
    setCookie(res, key, origin)
    return redirect(res, `${origin}/?steam=connected`)
  } catch {
    return fail('failed')
  }
}
