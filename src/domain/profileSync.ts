import { jsonResponse, getJson } from './api'
import { readAccountData } from './account'
import { importPlayerData } from './player'
import type { Profile } from './types'

export async function syncProfile(
  accountId: number,
  force = false,
  signal?: AbortSignal,
): Promise<Profile> {
  const { data, headers } = await jsonResponse(
    `/api/players/${accountId}/${force ? 'refresh' : 'history'}`,
    { method: force ? 'POST' : 'GET', timeout: force ? 95000 : 35000, signal },
  )
  const imported = importPlayerData(data, accountId, 'api')
  const source = headers.get('x-deadlock-history-source')
  const fetchedAt = headers.get('x-deadlock-fetched-at')
  imported.historySync = {
    source: source === 'steam' || source === 'stored' ? source : 'unknown',
    fetchedAt:
      fetchedAt && Number.isFinite(Date.parse(fetchedAt)) ? fetchedAt : new Date().toISOString(),
    limited: headers.get('x-deadlock-history-limited') === 'true',
  }
  try {
    imported.account = readAccountData(
      await getJson(`/api/players/${accountId}/profile`, { timeout: 12000, signal }),
      accountId,
    )
  } catch {
    /* A missing public profile must not discard available matches. */
  }
  if (signal?.aborted) throw signal.reason
  return imported
}
