import { describe, expect, it } from 'vitest'
import {
  accountIdFromInput,
  analyseMatch,
  importPlayerData,
  interpolate,
  mergeMatches,
  personalModel,
  projectedTime,
} from '../src/domain/player'
import { bundle, metadata, summary } from './fixtures'

describe('identity and API imports', () => {
  it('allows an empty API history without manufacturing matches and supports histories above 500 entries', () => {
    expect(importPlayerData([], 42, 'api').matches).toEqual([])
    expect(() => importPlayerData([], 42)).toThrow()
    const matches = Array.from({ length: 620 }, (_, i) =>
      summary({ match_id: 123000 + i, start_time: 1792497600 + i * 3600 }),
    )
    expect(importPlayerData(matches, 42, 'api').matches).toHaveLength(620)
  })
  it('converts SteamID64 without floating point precision loss', () => {
    expect(accountIdFromInput('76561197960265770')).toBe(42)
    expect(accountIdFromInput('42')).toBe(42)
    expect(accountIdFromInput('https://steamcommunity.com/profiles/76561197960265770/')).toBe(42)
    expect(() => accountIdFromInput('https://steamcommunity.com/id/someone')).toThrow()
    expect(() => accountIdFromInput('4294967296')).toThrow()
  })
  it('selects the actual account from metadata instead of picking the first player', () => {
    const p = importPlayerData(metadata(), 44)
    expect(p.matches[0].heroId).toBe(7)
    expect(p.matches[0].outcome).toBe('loss')
    expect(p.matches[0].netWorth).toBe(32000)
    expect(() => importPlayerData(metadata())).toThrow(/compte/)
    expect(() => importPlayerData(metadata(), 999)).toThrow(/Aucune partie/)
  })
  it('does not confuse the winning team with player_match_outcome', () => {
    expect(importPlayerData([summary({ player_match_outcome: 2 })], 42).matches[0].outcome).toBe(
      'loss',
    )
    expect(importPlayerData([summary({ player_match_outcome: 0 })], 42).matches[0].outcome).toBe(
      'unknown',
    )
  })
  it('rejects mismatched accounts and malformed files', () => {
    expect(() => importPlayerData(bundle, 43)).toThrow(/autre compte/)
    expect(() => importPlayerData({ matches: ['garbage'] }, 42)).toThrow()
    expect(() => importPlayerData([summary({ match_duration_s: Infinity })], 42)).toThrow()
  })
  it('merges history with details and keeps details after refreshing summaries', () => {
    const imported = importPlayerData(bundle)
    expect(imported.matches).toHaveLength(1)
    expect(imported.matches[0].stats).toHaveLength(4)
    expect(imported.matches[0].purchases[1].soldTime).toBe(1200)
    const merged = mergeMatches(imported.matches, importPlayerData([summary()], 42).matches)
    expect(merged).toHaveLength(1)
    expect(merged[0].stats).toHaveLength(4)
    expect(merged[0].peers).toHaveLength(2)
  })
})

describe('personal data as model inputs', () => {
  it('does not invent a lane curve or accuracy from a final match summary', () => {
    const model = personalModel(importPlayerData([summary()], 42).matches, 1)
    expect(model.source).toBe('summary')
    expect(model.rate).toBe(900)
    expect(model.accuracy).toBeNull()
    expect(model.curve).toHaveLength(0)
  })
  it('uses cumulative shot counters once per match and observed economic samples', () => {
    const model = personalModel(importPlayerData(bundle).matches, 1)
    expect(model.source).toBe('observed')
    expect(model.accuracy).toBeCloseTo(0.7)
    expect(model.curve.find((p) => p.time === 600)?.netWorth).toBe(8000)
    expect(projectedTime(8000, model, 100)).toBe(600)
    expect(projectedTime(28000, model, 100)).toBeNull()
  })
  it('keeps other heroes, modes and abandoned games out of the calibration', () => {
    const records = [
      summary(),
      summary({ match_id: 2, hero_id: 13 }),
      summary({ match_id: 3, game_mode: 2 }),
      summary({ match_id: 4, abandoned_time_s: 30 }),
    ]
    expect(personalModel(importPlayerData(records, 42).matches, 1).matches).toBe(1)
  })
  it('interpolates within coverage and does not extrapolate', () => {
    const points = [
      { time: 60, netWorth: 1000 },
      { time: 120, netWorth: 2000 },
    ]
    expect(interpolate(points, 90)).toBe(1500)
    expect(interpolate(points, 0)).toBeNull()
    expect(interpolate(points, 180)).toBeNull()
  })
  it('separates missing data from diagnostic conclusions', () => {
    const p = importPlayerData([summary()], 42)
    const findings = analyseMatch(p.matches[0], p.matches)
    expect(findings).toHaveLength(1)
    expect(findings[0].kind).toBe('coverage')
    expect(findings[0].interpretation).toMatch(/ne contient pas/)
  })
  it('provides contextual observations without attributing clustered deaths to a build', () => {
    const p = importPlayerData(bundle)
    const findings = analyseMatch(p.matches[0], p.matches)
    expect(findings.some((f) => f.title === 'Le contexte collectif')).toBe(true)
    expect(findings.find((f) => f.title === 'Une séquence à revoir')?.interpretation).toMatch(
      /ne permettent pas/,
    )
    expect(findings.some((f) => f.title === 'Application des dégâts')).toBe(false)
  })
})
