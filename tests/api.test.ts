import { afterEach, describe, expect, it, vi } from 'vitest'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'

const realFetch = globalThis.fetch
const servers: ReturnType<typeof createServer>[] = []
afterEach(async () => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  )
})
async function serverForTest() {
  vi.resetModules()
  // @ts-expect-error The proxy is intentionally plain Node JavaScript.
  const { apiMiddleware } = await import('../server/api.mjs')
  const server = createServer((req, res) => {
    void apiMiddleware(req, res, () => {
      res.statusCode = 404
      res.end()
    })
  })
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

describe('server-side upstream boundary', () => {
  it('rejects unsupported routes and account IDs before making an upstream request', async () => {
    const upstream = vi.fn()
    vi.stubGlobal('fetch', upstream)
    const base = await serverForTest()
    for (const path of [
      '/api/players/0/history',
      '/api/players/4294967296/history',
      '/api/proxy/https://example.com',
    ])
      expect((await realFetch(base + path)).status).toBe(404)
    expect(upstream).not.toHaveBeenCalled()
  })
  it('uses a fixed HTTPS destination, ignores arbitrary query destinations and caches successful results', async () => {
    const upstream = vi.fn(
      async (_url: string, _options?: RequestInit) =>
        new Response(JSON.stringify([{ match_id: 1 }]), { status: 200 }),
    )
    vi.stubGlobal('fetch', upstream)
    const base = await serverForTest()
    expect(
      await (await realFetch(base + '/api/players/42/history?target=https://example.com')).json(),
    ).toEqual([{ match_id: 1 }])
    await realFetch(base + '/api/players/42/history')
    expect(upstream).toHaveBeenCalledTimes(1)
    expect(upstream.mock.calls[0][0]).toBe(
      'https://api.deadlock-api.com/v1/players/42/match-history',
    )
  })
  it('avoids a Steam refetch and reports absent cached metadata', async () => {
    const upstream = vi.fn(
      async (_url: string, _options?: RequestInit) => new Response('', { status: 404 }),
    )
    vi.stubGlobal('fetch', upstream)
    const base = await serverForTest()
    const response = await realFetch(base + '/api/matches/123456')
    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({ code: 'metadata_missing', recoverable: true })
    expect(upstream.mock.calls[0][0]).toBe(
      'https://api.deadlock-api.com/v1/matches/123456/metadata?disable_steam=true',
    )
  })
  it('surfaces denied access instead of inventing player data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 403 })),
    )
    const base = await serverForTest(),
      response = await realFetch(base + '/api/players/43/history')
    expect(response.status).toBe(502)
    expect((await response.json()).error).toMatch(/import JSON/)
  })
  it('accepts rich metadata above the former 10 MB limit', async () => {
    const text = `{"match_id":123456}${' '.repeat(11 * 1024 * 1024)}`
    const upstream = vi.fn(async () => new Response(text))
    vi.stubGlobal('fetch', upstream)
    const base = await serverForTest()
    const response = await realFetch(base + '/api/matches/123456')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ match_id: 123456 })
    expect(upstream).toHaveBeenCalledTimes(1)
  })
  it('cancels an oversized declared response before reading and never caches it', async () => {
    const cancel = vi.fn()
    const upstream = vi.fn(
      async () =>
        new Response(new ReadableStream({ cancel }), {
          headers: { 'Content-Length': String(32 * 1024 * 1024 + 1) },
        }),
    )
    vi.stubGlobal('fetch', upstream)
    const base = await serverForTest()
    for (let i = 0; i < 2; i++) {
      const response = await realFetch(base + '/api/matches/123456')
      expect(response.status).toBe(502)
      expect((await response.json()).error).toMatch(/32 Mo/)
    }
    expect(cancel).toHaveBeenCalledTimes(2)
    expect(upstream).toHaveBeenCalledTimes(2)
  })
  it('bounds chunked responses by bytes even without a content length', async () => {
    const cancel = vi.fn()
    let chunks = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            new ReadableStream({
              pull(controller) {
                chunks++
                controller.enqueue(new Uint8Array(8 * 1024 * 1024))
              },
              cancel,
            }),
          ),
      ),
    )
    const base = await serverForTest()
    const response = await realFetch(base + '/api/matches/123456')
    expect(response.status).toBe(502)
    expect((await response.json()).error).toMatch(/32 Mo/)
    expect(cancel).toHaveBeenCalledOnce()
    expect(chunks).toBeLessThanOrEqual(6)
  })
  it('evicts the oldest payload once the entry cap is reached', async () => {
    const upstream = vi.fn(async () => new Response('[]'))
    vi.stubGlobal('fetch', upstream)
    const base = await serverForTest()
    for (let id = 1; id <= 101; id++)
      expect((await realFetch(base + `/api/players/${id}/history`)).status).toBe(200)
    await realFetch(base + '/api/players/101/history')
    expect(upstream).toHaveBeenCalledTimes(101)
    await realFetch(base + '/api/players/1/history')
    expect(upstream).toHaveBeenCalledTimes(102)
  })
})

describe('account completion and explicit metadata recovery', () => {
  it('retains usable history returned with a 429 and exposes its source and quota status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('[{"match_id":123}]', {
            status: 429,
            headers: { 'Called-Steam': 'false', 'Retry-After': '120' },
          }),
      ),
    )
    const base = await serverForTest(),
      response = await realFetch(base + '/api/players/42/history')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([{ match_id: 123 }])
    expect(response.headers.get('x-deadlock-history-source')).toBe('stored')
    expect(response.headers.get('x-deadlock-history-limited')).toBe('true')
    expect(response.headers.get('retry-after')).toBe('120')
    expect(response.headers.get('x-deadlock-fetched-at')).toBeTruthy()
  })
  it('does not mistake a 429 error object for match history', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"error":"limited"}', { status: 429 })),
    )
    const base = await serverForTest()
    expect((await realFetch(base + '/api/players/42/history')).status).toBe(429)
  })
  it('expires local history after 30 seconds instead of serving it for ten minutes', async () => {
    const upstream = vi.fn(async () => new Response('[]', { headers: { 'Called-Steam': 'true' } }))
    vi.stubGlobal('fetch', upstream)
    const base = await serverForTest(),
      now = Date.now()
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
    try {
      await realFetch(base + '/api/players/42/history')
      clock.mockReturnValue(now + 31000)
      const response = await realFetch(base + '/api/players/42/history')
      expect(response.headers.get('x-deadlock-history-source')).toBe('steam')
      expect(upstream).toHaveBeenCalledTimes(2)
    } finally {
      clock.mockRestore()
    }
  })
  it('recovers on demand and makes the recovered metadata available to ordinary cached reads', async () => {
    const upstream = vi.fn(async (url: string) =>
      url.endsWith('disable_steam=false')
        ? new Response('{"match_info":{"match_id":123}}')
        : new Response('', { status: 404 }),
    )
    vi.stubGlobal('fetch', upstream)
    const base = await serverForTest()
    expect((await realFetch(base + '/api/matches/123')).status).toBe(404)
    expect((await realFetch(base + '/api/matches/123/recover')).status).toBe(405)
    expect((await realFetch(base + '/api/matches/123/recover', { method: 'POST' })).status).toBe(
      200,
    )
    expect((await realFetch(base + '/api/matches/123')).status).toBe(200)
    expect(upstream).toHaveBeenCalledTimes(2)
    expect(upstream.mock.calls[1][0]).toBe(
      'https://api.deadlock-api.com/v1/matches/123/metadata?disable_steam=false',
    )
  })
  it('preserves Retry-After and bounds Steam recovery attempts', async () => {
    const upstream = vi.fn(
      async () => new Response('', { status: 429, headers: { 'Retry-After': '120' } }),
    )
    vi.stubGlobal('fetch', upstream)
    const base = await serverForTest()
    const first = await realFetch(base + '/api/matches/123/recover', { method: 'POST' })
    expect(first.status).toBe(429)
    expect(first.headers.get('retry-after')).toBe('120')
    await realFetch(base + '/api/matches/124/recover', { method: 'POST' })
    await realFetch(base + '/api/matches/125/recover', { method: 'POST' })
    expect((await realFetch(base + '/api/matches/126/recover', { method: 'POST' })).status).toBe(
      429,
    )
    expect(upstream).toHaveBeenCalledTimes(3)
  })
  it('keeps available account data when one provider endpoint fails and omits unrelated Steam friends', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/steam?'))
          return new Response(
            JSON.stringify([
              { account_id: 42, personaname: 'Test', friends: [123], realname: 'Not required' },
            ]),
          )
        if (url.includes('/hero-stats?'))
          return new Response('[{"account_id":42,"hero_id":81,"matches_played":10,"wins":6}]')
        if (url.endsWith('/rank')) return new Response('', { status: 503 })
        return new Response('{"active":false}')
      }),
    )
    const base = await serverForTest(),
      response = await realFetch(base + '/api/players/42/profile')
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.steam).toEqual([{ account_id: 42, personaname: 'Test' }])
    expect(data.unavailable).toEqual(['rank'])
    expect(data.heroes).toHaveLength(1)
  })
  it('uses a server-only API key and allows forced history refresh only through POST', async () => {
    vi.stubEnv('DEADLOCK_API_KEY', 'test-only-key')
    const upstream = vi.fn(async (_url: string, _options?: RequestInit) => new Response('[]'))
    vi.stubGlobal('fetch', upstream)
    const base = await serverForTest()
    expect((await realFetch(base + '/api/players/42/refresh')).status).toBe(405)
    expect((await realFetch(base + '/api/players/42/refresh', { method: 'POST' })).status).toBe(200)
    expect(upstream.mock.calls[0][0]).toMatch(/force_refetch=true$/)
    expect(upstream.mock.calls[0][1]?.headers).toMatchObject({ 'X-API-Key': 'test-only-key' })
    expect((await realFetch(base + '/api/players/42/refresh', { method: 'POST' })).status).toBe(429)
  })
})

describe('explicit sanitized replay reference upload', () => {
  it('accepts numeric references only, uses a fixed destination and never forwards cache files or user metadata', async () => {
    const upstream = vi.fn(async () => new Response('{"status":"success","salts_ingested":1}'))
    vi.stubGlobal('fetch', upstream)
    const base = await serverForTest()
    const response = await realFetch(base + '/api/matches/cache', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([{ match_id: 123, cluster_id: 404, metadata_salt: 456 }]),
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ accepted: 1 })
    expect((upstream.mock.calls[0] as unknown as [string])[0]).toBe(
      'https://api.deadlock-api.com/v1/matches/salts',
    )
    const options = (upstream.mock.calls[0] as unknown as [string, RequestInit])[1]
    expect(JSON.parse(options.body as string)).toEqual([
      { match_id: 123, cluster_id: 404, metadata_salt: 456, username: 'Deadlock Atelier' },
    ])
  })
  it('blocks cross-site requests, files, arbitrary URLs, extra properties and oversized uploads before fetching', async () => {
    const upstream = vi.fn()
    vi.stubGlobal('fetch', upstream)
    const base = await serverForTest()
    for (const body of [
      [],
      [{ match_id: 123, cluster_id: 404, metadata_salt: 456, url: 'https://example.com' }],
      [{ match_id: 123, cluster_id: 404, metadata_salt: 4294967296 }],
      { file: 'secret' },
    ])
      expect(
        (
          await realFetch(base + '/api/matches/cache', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
        ).status,
      ).toBe(400)
    expect(
      (
        await realFetch(base + '/api/matches/cache', {
          method: 'POST',
          headers: { Origin: 'https://example.com', 'Content-Type': 'application/json' },
          body: '[]',
        })
      ).status,
    ).toBe(403)
    expect(
      (
        await realFetch(base + '/api/matches/cache', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: ' '.repeat(65537),
        })
      ).status,
    ).toBe(413)
    expect(upstream).not.toHaveBeenCalled()
  })
})
