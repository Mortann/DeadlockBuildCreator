const MAX_BODY = 65536
let uploading = false
let lastUpload = 0
const uint = (v) => Number.isSafeInteger(v) && v > 0 && v <= 4294967295

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let bytes = 0,
      parts = []
    const cleanup = () => {
      clearTimeout(timer)
      req.off('data', data)
      req.off('end', end)
      req.off('error', fail)
      req.off('aborted', fail)
    }
    const fail = () => {
      cleanup()
      req.resume()
      reject(
        Object.assign(new Error('Requête incomplète ou trop volumineuse.'), {
          status: bytes > MAX_BODY ? 413 : 400,
        }),
      )
    }
    const data = (chunk) => {
      bytes += chunk.length
      if (bytes > MAX_BODY) return fail()
      parts.push(chunk)
    }
    const end = () => {
      cleanup()
      try {
        resolve(JSON.parse(Buffer.concat(parts).toString('utf8')))
      } catch {
        reject(Object.assign(new Error('JSON invalide.'), { status: 400 }))
      }
    }
    const timer = setTimeout(fail, 10000)
    req.on('data', data)
    req.on('end', end)
    req.on('error', fail)
    req.on('aborted', fail)
  })
}

/** Only small numeric replay references cross this boundary; never files or arbitrary URLs. */
export async function cacheUploadMiddleware(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  const reply = (status, body) => {
    res.statusCode = status
    res.end(JSON.stringify(body))
  }
  if (req.method !== 'POST') return reply(405, { error: 'Méthode non autorisée.' })
  if (
    req.headers['sec-fetch-site'] === 'cross-site' ||
    (req.headers.origin &&
      ![
        process.env.APP_ORIGIN,
        `http://${req.headers.host}`,
        `https://${req.headers.host}`,
      ].includes(req.headers.origin))
  )
    return reply(403, { error: 'Origine non autorisée.' })
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] ?? ''))
    return reply(415, { error: 'JSON requis.' })
  if (Number(req.headers['content-length']) > MAX_BODY) {
    req.resume()
    return reply(413, { error: '64 Ko maximum.' })
  }
  try {
    const raw = await readBody(req)
    if (!Array.isArray(raw) || raw.length === 0 || raw.length > 100)
      return reply(400, { error: 'Sélectionnez de 1 à 100 références.' })
    const salts = []
    for (const row of raw) {
      if (
        !row ||
        typeof row !== 'object' ||
        Object.keys(row).some(
          (key) => !['match_id', 'cluster_id', 'metadata_salt', 'replay_salt'].includes(key),
        ) ||
        !Number.isSafeInteger(row.match_id) ||
        row.match_id <= 0 ||
        !uint(row.cluster_id) ||
        !uint(row.metadata_salt) ||
        (row.replay_salt !== undefined && !uint(row.replay_salt))
      )
        return reply(400, { error: 'Référence de replay invalide.' })
      salts.push({ ...row, username: 'Deadlock Atelier' })
    }
    if (uploading || Date.now() - lastUpload < 10000) {
      res.setHeader('Retry-After', '10')
      return reply(429, { error: 'Patientez quelques secondes avant un nouvel envoi.' })
    }
    uploading = true
    try {
      const response = await fetch('https://api.deadlock-api.com/v1/matches/salts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(process.env.DEADLOCK_API_KEY ? { 'X-API-Key': process.env.DEADLOCK_API_KEY } : {}),
        },
        body: JSON.stringify(salts),
        signal: AbortSignal.timeout(30000),
        redirect: 'error',
      })
      if (!response.ok) {
        const retry = Number(response.headers.get('retry-after'))
        if (Number.isFinite(retry) && retry > 0)
          res.setHeader('Retry-After', String(Math.min(86400, retry)))
        await response.body?.cancel()
        return reply(response.status === 429 ? 429 : 502, {
          error:
            response.status === 429
              ? 'Quota API atteint. Réessayez plus tard.'
              : 'Deadlock API a refusé les références. Réessayez plus tard.',
        })
      }
      // Acceptance queues work upstream; it does not prove that metadata is already available.
      await response.body?.cancel()
      lastUpload = Date.now()
      return reply(200, { accepted: salts.length })
    } finally {
      uploading = false
    }
  } catch (error) {
    return reply(error.status ?? 502, {
      error: error.status
        ? error.message
        : 'Synchronisation impossible. Les fichiers sont restés sur cet ordinateur.',
    })
  }
}
