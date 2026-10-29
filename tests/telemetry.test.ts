import { describe, expect, it } from 'vitest'
import { importPlayerData, mergeMatches } from '../src/domain/player'
import { metadata, summary } from './fixtures'

const player = (overrides: Record<string, unknown> = {}) => ({
  account_id: 42,
  hero_id: 1,
  team: 0,
  player_slot: 0,
  stats: [
    { time_stamp_s: 0, net_worth: 0 },
    { time_stamp_s: 1800, net_worth: 20000 },
  ],
  ...overrides,
})
const paths = (overrides: Record<string, unknown> = {}) => ({
  interval_s: 10,
  x_resolution: 100,
  y_resolution: 200,
  paths: [
    {
      player_slot: 0,
      x_min: -1000,
      x_max: 1000,
      y_min: -2000,
      y_max: 2000,
      x_pos: [0, 50, 100, 75],
      y_pos: [0, 100, 200, 150],
      health: [100, 80, 0, 60],
    },
  ],
  ...overrides,
})
const matrix = (overrides: Record<string, unknown> = {}) => ({
  sample_time_s: [0, 10, 20],
  source_details: { source_name: ['weapon_infernus'], stat_type: [0] },
  damage_dealers: [
    {
      dealer_player_slot: 6,
      damage_sources: [
        {
          source_details_index: 0,
          damage_to_players: [{ target_player_slot: 0, damage: [0, 100, 250] }],
        },
      ],
    },
  ],
  ...overrides,
})
const read = (fields: Record<string, unknown> = {}, players = [player()]) =>
  importPlayerData(metadata({ players, ...fields }), 42).matches[0]

describe('recorded telemetry normalization', () => {
  it('decodes signed coordinates from each axis resolution without changing the source clock', () => {
    const match = read({ match_paths: paths() })
    expect(match.positions?.map((p) => [p.time, p.x, p.y])).toEqual([
      [0, -1000, -2000],
      [10, 0, 0],
      [20, 1000, 2000],
      [30, 500, 1000],
    ])
    expect(match.positions?.[1].health).toBe(80)
    expect(match.positions?.[2]).toMatchObject({ health: 0, alive: false })
    expect(match.positionInterval).toBe(10)
    expect(match.telemetryWarnings).toEqual([])
  })
  it('does not invent health, an empty inventory, or optional damage when source fields are absent', () => {
    const sourcePaths = paths({
      paths: [
        {
          player_slot: 0,
          x_min: 0,
          x_max: 100,
          y_min: 0,
          y_max: 100,
          x_pos: [0, 20],
          y_pos: [0, 20],
        },
      ],
    })
    const match = read({ match_paths: sourcePaths })
    expect(match.positions?.[0].health).toBeUndefined()
    expect(match.positions?.[0].alive).toBeUndefined()
    expect(match.inventoryRecorded).toBeUndefined()
    expect(match.stats[0].damage).toBeUndefined()
    const knownEmpty = read({}, [
      player({ items: [], stats: [{ time_stamp_s: 0, net_worth: 0, player_damage: 0 }] }),
    ])
    expect(knownEmpty.inventoryRecorded).toBe(true)
    expect(knownEmpty.stats[0].damage).toBe(0)
  })
  it('joins paths by slot rather than metadata order', () => {
    const match = read({ match_paths: paths() }, [
      player({ account_id: 43, player_slot: 2, hero_id: 13 }),
      player(),
    ])
    expect(match.positions).toHaveLength(4)
    expect(match.peers[0].positions).toBeUndefined()
  })
  it('drops ambiguous duplicate path slots and flags rejected samples', () => {
    const raw = paths()
    const match = read({ match_paths: paths({ paths: [...raw.paths, ...raw.paths] }) })
    expect(match.positions).toBeUndefined()
    expect(match.telemetryWarnings).toContain('paths-duplicate-slot')
    const broken = read({
      match_paths: paths({ paths: [{ ...raw.paths[0], x_pos: [0, -1], y_pos: [0, 2] }] }),
    })
    expect(broken.positions).toHaveLength(1)
    expect(broken.telemetryWarnings).toContain('paths-invalid-sample')
  })
  it('deduplicates accounts and removes the slot join if two actors claim it', () => {
    const match = read({ match_paths: paths() }, [
      player(),
      player(),
      player({ account_id: 43, hero_id: 13 }),
    ])
    expect(match.peers).toHaveLength(1)
    expect(match.playerSlot).toBeUndefined()
    expect(match.peers[0].playerSlot).toBeUndefined()
    expect(match.positions).toBeUndefined()
    expect(match.telemetryWarnings).toEqual(
      expect.arrayContaining(['players-duplicate-account', 'players-duplicate-slot']),
    )
    const merged = mergeMatches([read({ match_paths: paths() })], [match])[0]
    expect(merged.playerSlot).toBeUndefined()
    expect(merged.positions).toBeUndefined()
    expect(merged.peers.every((p) => p.playerSlot === undefined && p.positions === undefined)).toBe(
      true,
    )
  })
  it('retains actual death positions, respawn duration and killer slot without inferring missing respawn', () => {
    const match = read({}, [
      player({
        death_details: [
          {
            game_time_s: 100,
            death_duration_s: 30,
            time_to_kill_s: 2.5,
            killer_player_slot: 6,
            death_pos: { x: -20, y: 30, z: 64 },
            killer_pos: { x: 10, y: 20 },
          },
          { game_time_s: 200 },
        ],
      }),
    ])
    expect(match.deathDetails?.[0]).toMatchObject({
      time: 100,
      respawnDuration: 30,
      killerSlot: 6,
      timeToKill: 2.5,
      position: { x: -20, y: 30, z: 64 },
    })
    expect(match.deathDetails?.[1].respawnDuration).toBeUndefined()
  })
  it('maps legacy and current objectives while keeping neutral ownership unknown', () => {
    const match = read({
      objectives: [
        { legacy_objective_id: 17, destroyed_time_s: 600, first_damage_time_s: 580 },
        { team_objective_id: 6, team: 0, destroyed_time_s: 900 },
        { legacy_objective_id: 32, team: 1, destroyed_time_s: 1000 },
      ],
      mid_boss: [{ destroyed_time_s: 1200, team_claimed: 0 }],
    })
    expect(match.objectives?.[0]).toMatchObject({
      team: 1,
      type: 'guardian',
      lane: 1,
      firstDamageTime: 580,
    })
    expect(match.objectives?.[1]).toMatchObject({ team: 0, type: 'walker', lane: 2 })
    expect(
      match.objectives?.slice(2).every((o) => o.type === 'midboss' && o.team === undefined),
    ).toBe(true)
  })
  it('does not guess ownership or overwrite contradictory objective identities', () => {
    const match = read({
      objectives: [
        { legacy_objective_id: 1, team: 1, destroyed_time_s: 600, first_damage_time_s: 700 },
        { legacy_objective_id: 1, team_objective_id: 6, destroyed_time_s: 700 },
      ],
    })
    expect(match.objectives).toHaveLength(1)
    expect(match.objectives?.[0].team).toBeUndefined()
    expect(match.objectives?.[0].firstDamageTime).toBeUndefined()
    expect(match.telemetryWarnings).toEqual(
      expect.arrayContaining([
        'objectives-conflicting-team',
        'objectives-conflicting-id',
        'objectives-invalid-first-damage',
      ]),
    )
  })
  it('retains cumulative matrix counters and their actual boundaries without converting them to events', () => {
    const match = read({ damage_matrix: matrix() })
    expect(match.damageMatrix).toEqual([
      {
        dealerSlot: 6,
        targetSlot: 0,
        sourceName: 'weapon_infernus',
        statType: 'damage',
        samples: [
          { time: 0, value: 0 },
          { time: 10, value: 100 },
          { time: 20, value: 250 },
        ],
      },
    ])
    expect(match.telemetryWarnings).toEqual([])
  })
  it('rejects reset, non-monotonic and malformed matrix series as whole series', () => {
    for (const damage of [
      [0, 200, 100],
      [0, -1, 200],
      [0, NaN, 200],
    ]) {
      const raw = matrix()
      raw.damage_dealers[0].damage_sources[0].damage_to_players[0].damage = damage
      const match = read({ damage_matrix: raw })
      expect(match.damageMatrix).toHaveLength(0)
      expect(match.telemetryWarnings).toContain('combat-invalid-series')
    }
    const match = read({ damage_matrix: matrix({ sample_time_s: [0, 10, 10] }) })
    expect(match.damageMatrix).toHaveLength(0)
    expect(match.telemetryWarnings).toContain('combat-invalid-series')
  })
  it('drops both copies of ambiguous duplicated matrix sources rather than counting twice', () => {
    const raw = matrix()
    raw.damage_dealers.push(raw.damage_dealers[0])
    const match = read({ damage_matrix: raw })
    expect(match.damageMatrix).toHaveLength(0)
    expect(match.telemetryWarnings).toContain('combat-duplicate-series')
  })
  it('flags truncation and rejected counters so incomplete imports cannot be graded as complete', () => {
    const stats = Array.from({ length: 1001 }, (_, time_stamp_s) => ({
      time_stamp_s,
      net_worth: time_stamp_s * 20,
    }))
    const match = read({}, [
      player({ stats, items: [{ item_id: 1, game_time_s: 900, sold_time_s: 700 }] }),
    ])
    expect(match.stats).toHaveLength(1000)
    expect(match.telemetryWarnings).toEqual(
      expect.arrayContaining(['stats-truncated', 'inventory-invalid-sale']),
    )
    expect(match.purchases[0].soldTime).toBeUndefined()
  })
  it('preserves rich telemetry, known empty inventory and warnings after history refresh', () => {
    const match = read({ client_version: 6821, damage_matrix: matrix(), match_paths: paths() }, [
      player({ items: [], stats: [{ time_stamp_s: 0, net_worth: 0, player_damage: -1 }] }),
    ])
    const refreshed = mergeMatches([match], importPlayerData([summary()], 42).matches)[0]
    expect(refreshed.positions).toEqual(match.positions)
    expect(refreshed.damageMatrix).toEqual(match.damageMatrix)
    expect(refreshed.clientVersion).toBe(6821)
    expect(refreshed.inventoryRecorded).toBe(true)
    expect(refreshed.telemetryWarnings).toContain('stats-invalid-counter')
    const repaired = mergeMatches([refreshed], [read()])[0]
    expect(repaired.telemetryWarnings).toContain('stats-invalid-counter')
  })
})

describe('valid Valve sentinel and sparse combat formats', () => {
  it('treats minus-one time-to-kill as unavailable without rejecting observed deaths', () => {
    const match = read({}, [
      player({ death_details: [{ game_time_s: 300, time_to_kill_s: -1, death_duration_s: 17 }] }),
    ])
    expect(match.telemetryWarnings).toEqual([])
    expect(match.deathDetails?.[0]).toMatchObject({ time: 300, respawnDuration: 17 })
    expect(match.deathDetails?.[0].timeToKill).toBeUndefined()
  })
  it('retains sparse final totals without fabricating alignment on the global clock', () => {
    const raw = matrix()
    raw.damage_dealers[0].damage_sources[0].damage_to_players[0].damage = [100, 250]
    const match = read({ damage_matrix: raw })
    expect(match.telemetryWarnings).toEqual([])
    expect(match.damageMatrix?.[0]).toMatchObject({ samples: [], total: 250, timing: 'sparse' })
  })
  it('clears obsolete import warnings when the corresponding metadata is reread successfully', () => {
    const match = read({ damage_matrix: matrix() }, [player({ death_details: [] })])
    const old = {
      ...match,
      telemetryVersion: undefined,
      telemetryWarnings: [
        'combat-length-mismatch',
        'deaths-invalid-time-to-kill',
        'inventory-invalid-sale',
      ],
    }
    const merged = mergeMatches([old], [match])[0]
    expect(merged.telemetryWarnings).toEqual(['inventory-invalid-sale'])
  })
})
