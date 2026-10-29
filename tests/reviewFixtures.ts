import type { CombatSeries, Match, Peer, Profile, StatPoint } from '../src/domain/types'
import snapshot from '../src/data/snapshot.json' with { type: 'json' }

const itemById = new Map(snapshot.items.map((item) => [item.id, item]))
const source = { version: snapshot.clientVersion }

/** Synthetic test records. These are never imported by application code. */
export const testPurchase = (id: string, time: number) => ({
  itemId: String(itemById.get(id)!.apiId),
  time,
})

export function syntheticStats(multiplier = 1, duration = 1800): StatPoint[] {
  return Array.from({ length: Math.floor(duration / 60) + 1 }, (_, i) => ({
    time: i * 60,
    netWorth: i * 900 * multiplier,
    damage: i * 1200 * multiplier,
    objectiveDamage: i * 200 * multiplier,
    teammateHealing: i * 100 * multiplier,
    deaths: Math.floor(i / 6),
    neutralKills: Math.floor(i / 3),
    selfHealing: i * 200,
    shotsHit: i * 7,
    shotsMissed: i * 3,
  }))
}

export function syntheticPeers(): Peer[] {
  return Array.from({ length: 11 }, (_, i) => {
    const slot = i + 1
    const team = slot < 6 ? 0 : 1
    const stats = syntheticStats(team === 0 ? 1 : 1.15)
    return {
      accountId: 42 + slot,
      heroId: [13, 2, 7][i % 3],
      playerSlot: slot,
      team,
      netWorth: stats.at(-1)!.netWorth,
      stats,
      purchases: slot === 6 ? [testPurchase('upgrade_vampire', 720)] : [],
      positions: [876, 882, 888, 894, 900, 906, 912, 918, 924, 930].map((time, j) => ({
        time,
        x: slot < 6 ? 3000 + slot * 120 : 100 + (slot - 6) * 160 + j * 20,
        y: slot < 6 ? 4000 + slot * 100 : 200 + (slot - 6) * 90,
        health: 70,
        alive: true,
      })),
      deathDetails: [],
      deathTimes: [],
      kills: 5,
      deaths: 3,
      assists: 9,
    }
  })
}

export function damageSeries(overrides: Partial<CombatSeries> = {}): CombatSeries {
  return {
    dealerSlot: 6,
    targetSlot: 0,
    sourceName: 'test_ability',
    statType: 'damage',
    samples: [
      { time: 840, value: 100 },
      { time: 870, value: 300 },
      { time: 900, value: 900 },
    ],
    ...overrides,
  }
}

export function syntheticMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: '123456',
    accountId: 42,
    heroId: 1,
    playerSlot: 0,
    startTime: 1792497600,
    duration: 1800,
    outcome: 'loss',
    netWorth: 27000,
    kills: 9,
    deaths: 5,
    assists: 7,
    stats: syntheticStats(),
    purchases: [
      testPurchase('upgrade_high_velocity_mag', 60),
      testPurchase('upgrade_rapid_rounds', 600),
      testPurchase('upgrade_clip_size', 1000),
    ],
    inventoryRecorded: true,
    deathTimes: [900, 1020],
    deathDetails: [
      {
        time: 900,
        position: { x: 0, y: 0 },
        killerSlot: 6,
        killerPosition: { x: 150, y: 200 },
        respawnDuration: 60,
      },
      { time: 1020, position: { x: 300, y: 300 }, respawnDuration: 60 },
    ],
    positions: [876, 882, 888, 894].map((time, i) => ({
      time,
      x: -500 + i * 125,
      y: -200 + i * 50,
      health: 90 - i * 20,
      alive: true,
    })),
    positionInterval: 6,
    objectives: [
      {
        id: 'own-walker',
        destroyedTime: 930,
        firstDamageTime: 910,
        team: 0,
        type: 'walker',
        lane: 1,
      },
    ],
    damageMatrix: [damageSeries()],
    team: 0,
    peers: syntheticPeers(),
    mode: 1,
    abandoned: false,
    clientVersion: source.version,
    source: 'import',
    ...overrides,
  }
}

export function syntheticHistory(count = 6): Match[] {
  return Array.from({ length: count }, (_, i) => {
    const multiplier = 0.7 + i * 0.1
    return syntheticMatch({
      id: String(123455 - i),
      startTime: 1792497600 - (i + 1) * 86400,
      netWorth: 27000 * multiplier,
      deaths: 2 + i,
      stats: syntheticStats(multiplier).map((p) => ({
        ...p,
        deaths: Math.floor((p.time / 1800) * (2 + i)),
      })),
    })
  })
}

export function syntheticProfile(): Profile {
  return {
    accountId: 42,
    matches: [syntheticMatch(), ...syntheticHistory()],
    updatedAt: '2026-10-29T00:00:00Z',
  }
}
