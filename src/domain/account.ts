import type { AccountData, HeroAccountStats } from './types'
const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined)
/** Aggregated server statistics stay separate from observed individual matches. */
export function readAccountData(value: unknown, accountId: number): AccountData {
  const raw = record(value)
  if (raw.account_id !== accountId) throw new Error('Profil reçu pour un autre compte.')
  const steam = Array.isArray(raw.steam)
    ? raw.steam.map(record).find((p) => p.account_id === accountId)
    : undefined
  const rank = record(raw.rank),
    ingest = record(raw.ingest)
  const heroStats: HeroAccountStats[] = Array.isArray(raw.heroes)
    ? raw.heroes
        .map(record)
        .flatMap((h) => {
          const heroId = n(h.hero_id),
            matches = n(h.matches_played),
            wins = n(h.wins)
          if (
            h.account_id !== accountId ||
            !heroId ||
            matches === undefined ||
            wins === undefined ||
            wins > matches
          )
            return []
          return [
            {
              heroId,
              matches,
              wins,
              kills: n(h.kills),
              deaths: n(h.deaths),
              assists: n(h.assists),
              accuracy: n(h.accuracy),
              netWorthPerMinute: n(h.networth_per_min),
            },
          ]
        })
        .sort((a, b) => b.matches - a.matches)
    : []
  return {
    name: typeof steam?.personaname === 'string' ? steam.personaname.slice(0, 80) : undefined,
    profileUrl:
      typeof steam?.profileurl === 'string' &&
      /^https:\/\/steamcommunity\.com\/(profiles|id)\/[a-z0-9_-]+\/?$/i.test(steam.profileurl)
        ? steam.profileurl
        : undefined,
    rank:
      n(rank.badge) !== undefined && n(rank.rank) !== undefined && n(rank.subrank) !== undefined
        ? {
            badge: rank.badge as number,
            rank: rank.rank as number,
            subrank: rank.subrank as number,
          }
        : undefined,
    heroStats,
    ingestActive: typeof ingest.active === 'boolean' ? ingest.active : undefined,
    unavailable: Array.isArray(raw.unavailable)
      ? raw.unavailable.filter((v): v is string => typeof v === 'string')
      : [],
    syncedAt: new Date().toISOString(),
  }
}

export function mergeAccountData(
  previous: AccountData | undefined,
  incoming: AccountData | undefined,
): AccountData | undefined {
  if (!incoming) return previous
  if (!previous) return incoming
  return {
    ...previous,
    ...incoming,
    name: incoming.name ?? previous.name,
    profileUrl: incoming.profileUrl ?? previous.profileUrl,
    rank: incoming.rank ?? previous.rank,
    ingestActive: incoming.ingestActive ?? previous.ingestActive,
    heroStats: incoming.unavailable.includes('heroes') ? previous.heroStats : incoming.heroStats,
  }
}
