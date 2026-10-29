import { afterEach, describe, expect, it, vi } from 'vitest'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
const realFetch = globalThis.fetch
const servers: ReturnType<typeof createServer>[] = []
afterEach(async () => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))))
})
async function setup() {
  vi.resetModules()
  // @ts-expect-error Shared middleware deliberately has no runtime TS dependency.
  const { steamMiddleware } = await import('../server/steam.mjs')
  const server = createServer(
    (req, res) =>
      void steamMiddleware(req, res, () => {
        res.statusCode = 404
        res.end()
      }),
  )
  servers.push(server)
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const start = await realFetch(base + '/api/auth/steam/start', { redirect: 'manual' })
  const target = new URL(start.headers.get('location')!)
  const returnTo = target.searchParams.get('openid.return_to')!
  const cookie = start.headers.get('set-cookie')!.split(';')[0]
  const callback = new URL(returnTo)
  const signed = [
    'op_endpoint',
    'claimed_id',
    'identity',
    'return_to',
    'response_nonce',
    'assoc_handle',
  ]
  const claims: Record<string, string> = {
    ns: 'http://specs.openid.net/auth/2.0',
    mode: 'id_res',
    op_endpoint: 'https://steamcommunity.com/openid/login',
    claimed_id: 'https://steamcommunity.com/openid/id/76561197960265770',
    identity: 'https://steamcommunity.com/openid/id/76561197960265770',
    return_to: returnTo,
    response_nonce: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z') + 'random',
    assoc_handle: 'test-only-handle',
    signed: signed.join(','),
    sig: 'test-only-signature',
  }
  for (const [k, v] of Object.entries(claims)) callback.searchParams.set('openid.' + k, v)
  return { base, start, target, cookie, callback }
}
describe('verified Steam OpenID handoff', () => {
  it('verifies the signed identity at Steam, binds it to this browser and consumes the callback once', async () => {
    const upstream = vi.fn(
      async () => new Response('ns:http://specs.openid.net/auth/2.0\nis_valid:true\n'),
    )
    vi.stubGlobal('fetch', upstream)
    const { base, start, target, cookie, callback } = await setup()
    expect(target.origin + target.pathname).toBe('https://steamcommunity.com/openid/login')
    expect(target.searchParams.get('openid.realm')).toBe(base + '/')
    expect(start.headers.get('set-cookie')).toContain('HttpOnly; SameSite=Lax')
    expect(upstream).not.toHaveBeenCalled()
    const response = await realFetch(callback, { headers: { cookie }, redirect: 'manual' })
    expect(response.headers.get('location')).toBe(base + '/?steam=connected')
    expect(upstream).toHaveBeenCalledOnce()
    const [endpoint, options] = upstream.mock.calls[0] as unknown as [string, RequestInit]
    expect(endpoint).toBe('https://steamcommunity.com/openid/login')
    expect((options.body as URLSearchParams).get('openid.mode')).toBe('check_authentication')
    const resultCookie = response.headers.get('set-cookie')!.split(';')[0]
    const data = await (
      await realFetch(base + '/api/auth/steam/result', { headers: { cookie: resultCookie } })
    ).json()
    expect(data).toEqual({ accountId: 42, steamId64: '76561197960265770' })
    expect(
      (await realFetch(callback, { headers: { cookie }, redirect: 'manual' })).headers.get(
        'location',
      ),
    ).toBe(base + '/?steam=expired')
    expect((await realFetch(base + '/api/auth/steam/result')).status).toBe(401)
  })
  it.each([
    'return_to',
    'op_endpoint',
    'identity',
    'response_nonce',
    'signed',
    'duplicate',
    'cookie',
  ])('rejects an invalid %s before checking with Steam', async (field) => {
    const upstream = vi.fn()
    vi.stubGlobal('fetch', upstream)
    const { base, callback, cookie } = await setup()
    if (field === 'return_to') callback.searchParams.set('openid.return_to', 'https://example.com/')
    if (field === 'op_endpoint')
      callback.searchParams.set('openid.op_endpoint', 'https://example.com/')
    if (field === 'identity')
      callback.searchParams.set(
        'openid.identity',
        'https://steamcommunity.com/openid/id/76561197960265771',
      )
    if (field === 'response_nonce')
      callback.searchParams.set('openid.response_nonce', '2020-01-01T00:00:00Zold')
    if (field === 'signed') callback.searchParams.set('openid.signed', 'identity')
    if (field === 'duplicate')
      callback.searchParams.append(
        'openid.claimed_id',
        'https://steamcommunity.com/openid/id/76561197960265771',
      )
    const res = await realFetch(callback, {
      headers: { cookie: field === 'cookie' ? 'deadlock_steam=invalid' : cookie },
      redirect: 'manual',
    })
    expect(res.headers.get('location')).toBe(
      base + '/?steam=' + (field === 'cookie' ? 'expired' : 'failed'),
    )
    expect(upstream).not.toHaveBeenCalled()
  })
  it('does not accept forged identities even when the callback has every required parameter', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('is_valid:false\n')),
    )
    const { base, callback, cookie } = await setup()
    const res = await realFetch(callback, { headers: { cookie }, redirect: 'manual' })
    expect(res.headers.get('location')).toBe(base + '/?steam=failed')
    expect((await realFetch(base + '/api/auth/steam/result', { headers: { cookie } })).status).toBe(
      401,
    )
  })
  it('uses a configured HTTPS deployment origin and secure cookie, never an arbitrary host', async () => {
    vi.stubEnv('APP_ORIGIN', 'https://atelier.example.com')
    const { start, target } = await setup()
    expect(target.searchParams.get('openid.realm')).toBe('https://atelier.example.com/')
    expect(start.headers.get('set-cookie')).toContain('; Secure')
  })
})
