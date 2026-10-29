import { describe, it, expect } from 'vitest'
import { mergeAccountData, readAccountData } from '../src/domain/account'
import { heroIdentity } from '../src/domain/heroRoster'
describe('account aggregate data stays separate from match evidence', () => {
  it('reads identity, rank and standard hero statistics without inventing match records', () => {
    const a = readAccountData(
      {
        account_id: 42,
        steam: [
          {
            account_id: 42,
            personaname: 'Test',
            profileurl: 'https://steamcommunity.com/profiles/76561197960265770/',
          },
        ],
        heroes: [{ account_id: 42, hero_id: 81, matches_played: 10, wins: 6 }],
        rank: { badge: 35, rank: 3, subrank: 5 },
        ingest: { active: false },
        unavailable: [],
      },
      42,
    )
    expect(a.name).toBe('Test')
    expect(a.rank?.badge).toBe(35)
    expect(a.heroStats[0]).toMatchObject({ heroId: 81, matches: 10, wins: 6 })
    expect(a.ingestActive).toBe(false)
    expect(heroIdentity(81)?.name).toBe('Celeste')
    expect(heroIdentity(67)?.name).toBe('Paige')
  })
  it('rejects cross-account data and impossible statistics', () => {
    expect(() => readAccountData({ account_id: 43 }, 42)).toThrow()
    expect(
      readAccountData(
        {
          account_id: 42,
          heroes: [
            { account_id: 42, hero_id: 81, matches_played: 4, wins: 5 },
            { account_id: 43, hero_id: 81, matches_played: 10, wins: 5 },
          ],
        },
        42,
      ).heroStats,
    ).toEqual([])
  })
})

describe('partial profile synchronization', () => {
  it('keeps previously observed profile fields and hero totals if those providers fail', () => {
    const previous = readAccountData(
      {
        account_id: 42,
        steam: [{ account_id: 42, personaname: 'Test' }],
        heroes: [{ account_id: 42, hero_id: 81, matches_played: 10, wins: 6 }],
        rank: { badge: 35, rank: 3, subrank: 5 },
      },
      42,
    )
    const partial = readAccountData(
      { account_id: 42, unavailable: ['steam', 'heroes', 'rank'] },
      42,
    )
    const merged = mergeAccountData(previous, partial)
    expect(merged?.name).toBe('Test')
    expect(merged?.rank?.badge).toBe(35)
    expect(merged?.heroStats).toEqual(previous.heroStats)
  })
})
