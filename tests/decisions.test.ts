import { describe, it, expect } from 'vitest'
import {
  accuracyBefore,
  initialAlternative,
  compareDecision,
  decisionAt,
  decisionCandidates,
  decisionContext,
  purchaseDecisions,
} from '../src/domain/decisions'
import { firingSequence } from '../src/domain/engine'
import { itemById } from '../src/domain/catalogue'
import { syntheticMatch, testPurchase } from './reviewFixtures'
import type { BuildCase } from '../src/domain/review'
const scenario = { accuracy: 1, resistance: 0, duration: 10, spiritApplied: false }
describe('purchase reconstruction and alternatives', () => {
  it('replaces the purchased upgrade from the same prior inventory, credits components and excludes future purchases', () => {
    const match = syntheticMatch({
      purchases: [
        testPurchase('upgrade_high_velocity_mag', 60),
        testPurchase('upgrade_pristine_emblem', 600),
        testPurchase('upgrade_glass_cannon', 900),
      ],
    })
    const decision = decisionAt(purchaseDecisions(match), 700)!
    const comparison = compareDecision(match, decision, 'upgrade_health', scenario)!
    expect(comparison.before.map((i) => i.id)).toEqual(['upgrade_high_velocity_mag'])
    expect(comparison.actual.cost).toBe(800)
    expect(comparison.alternative.cost).toBe(800)
    expect(comparison.difference).toBe(0)
    expect(comparison.actual.consumed.map((i) => i.id)).toEqual(['upgrade_high_velocity_mag'])
    expect(comparison.actual.items.map((i) => i.id)).toEqual(['upgrade_pristine_emblem'])
    expect(comparison.alternative.items.map((i) => i.id)).toEqual([
      'upgrade_high_velocity_mag',
      'upgrade_health',
    ])
    expect(comparison.alternative.result!.health - comparison.actual.result!.health).toBe(210)
    expect(comparison.actual.result!.spirit).toBe(7)
    expect(comparison.alternative.result!.spirit).toBe(0)
  })
  it('recognizes a consumed component ending at its upgrade time instead of treating that as an unrelated sale', () => {
    const match = syntheticMatch({
      purchases: [
        { ...testPurchase('upgrade_high_velocity_mag', 60), soldTime: 300 },
        testPurchase('upgrade_pristine_emblem', 300),
      ],
    })
    const decision = decisionAt(purchaseDecisions(match), 300)!
    expect(decisionContext(match, decision).reason).toBeUndefined()
    const comparison = compareDecision(match, decision, 'upgrade_health', scenario)!
    expect(comparison.actual.cost).toBe(800)
    expect(comparison.alternative.items.map((i) => i.id)).toEqual([
      'upgrade_high_velocity_mag',
      'upgrade_health',
    ])
  })
  it('uses a genuinely empty prefix at time zero and blocks ambiguous simultaneous events', () => {
    const first = syntheticMatch({ purchases: [testPurchase('upgrade_rapid_rounds', 0)] })
    expect(decisionContext(first, purchaseDecisions(first)[0]).before.items).toEqual([])
    expect(
      compareDecision(first, purchaseDecisions(first)[0], 'upgrade_health', scenario),
    ).toBeDefined()
    const simultaneous = {
      ...first,
      purchases: [...first.purchases, testPurchase('upgrade_clip_size', 0)],
    }
    expect(decisionContext(simultaneous, purchaseDecisions(simultaneous)[0]).reason).toBe(
      'simultaneous',
    )
    expect(
      compareDecision(simultaneous, purchaseDecisions(simultaneous)[0], 'upgrade_health', scenario),
    ).toBeUndefined()
    const sale = syntheticMatch({
      purchases: [
        { ...testPurchase('upgrade_rapid_rounds', 0), soldTime: 600 },
        testPurchase('upgrade_clip_size', 600),
      ],
    })
    expect(decisionContext(sale, purchaseDecisions(sale)[1]).reason).toBe('simultaneous')
  })
  it('blocks incomplete, unrecognised and variant inventories without treating the missing items as zero', () => {
    for (const match of [
      syntheticMatch({ inventoryRecorded: false }),
      syntheticMatch({ telemetryWarnings: ['inventory-truncated'] }),
      syntheticMatch({
        purchases: [
          { itemId: 'unrecognised', time: 10 },
          testPurchase('upgrade_rapid_rounds', 600),
        ],
      }),
      syntheticMatch({
        purchases: [{ ...testPurchase('upgrade_rapid_rounds', 600), upgradeInfo: 1 }],
      }),
    ]) {
      const decision = decisionAt(purchaseDecisions(match), 600)!
      expect(decisionContext(match, decision).reason).toBeTruthy()
      expect(compareDecision(match, decision, 'upgrade_health', scenario)).toBeUndefined()
    }
  })
  it('keeps cost and raw item comparisons for unsupported heroes without borrowing another hero’s weapon', () => {
    const match = syntheticMatch({ heroId: 81 }),
      decision = decisionAt(purchaseDecisions(match), 600)!
    const comparison = compareDecision(match, decision, 'upgrade_health', scenario)!
    expect(comparison.actual.result).toBeUndefined()
    expect(comparison.alternativeSequence).toBeUndefined()
    expect(comparison.contributions.find((p) => p.key === 'BonusHealth')).toMatchObject({
      actual: 0,
      alternative: 210,
    })
    expect(comparison.priceBasis).toBe('same')
  })
  it('does not promote future recommendations or suggest an already-owned item', () => {
    const match = syntheticMatch(),
      decision = decisionAt(purchaseDecisions(match), 600)!
    const future = { time: 1000, options: [{ itemId: 'upgrade_healbane' }] } as BuildCase
    const ordinary = decisionCandidates(match, decision, [])
    expect(decisionCandidates(match, decision, [future]).map((i) => i.id)).toEqual(
      ordinary.map((i) => i.id),
    )
    expect(ordinary.some((i) => i.id === 'upgrade_high_velocity_mag')).toBe(false)
    expect(decisionCandidates(match, decision, [{ ...future, time: 600 }])[0].id).toBe(
      'upgrade_healbane',
    )
  })
  it('does not carry a future suggestion backwards when the player rewinds to an earlier purchase', () => {
    const health = itemById.get('upgrade_health')!,
      healbane = itemById.get('upgrade_healbane')!
    expect(
      initialAlternative([health, healbane], { itemId: healbane.id, knownAt: 1000 }, 600),
    ).toBe(health)
    expect(
      initialAlternative([health, healbane], { itemId: healbane.id, knownAt: 1000 }, 1000),
    ).toBe(healbane)
  })
  it('retains the health drawback of a more expensive alternative and does not claim it is affordable', () => {
    const match = syntheticMatch(),
      decision = decisionAt(purchaseDecisions(match), 600)!
    const comparison = compareDecision(match, decision, 'upgrade_glass_cannon', scenario)!
    expect(comparison.difference).toBe(itemById.get('upgrade_glass_cannon')!.cost - 800)
    expect(comparison.alternative.result!.health).toBeLessThan(comparison.actual.result!.health)
    expect(comparison).not.toHaveProperty('affordable')
  })
})
describe('personal accuracy available at decision time', () => {
  it('uses the latest prior cumulative counters, ignores same-instant and future statistics and rejects resets', () => {
    const match = syntheticMatch({
      stats: [
        { time: 0, netWorth: 0, shotsHit: 0, shotsMissed: 0 },
        { time: 120, netWorth: 1800, shotsHit: 8, shotsMissed: 2 },
        { time: 600, netWorth: 9000, shotsHit: 800, shotsMissed: 2 },
      ],
    })
    expect(accuracyBefore(match, 600)).toEqual({ value: 0.8, shots: 10, at: 120 })
    expect(accuracyBefore(match, 0)).toBeUndefined()
    expect(
      accuracyBefore(
        {
          ...match,
          stats: [...match.stats, { time: 200, netWorth: 3000, shotsHit: 1, shotsMissed: 1 }],
        },
        600,
      ),
    ).toBeUndefined()
  })
})
describe('shared finite firing sequence', () => {
  it('exposes reload plateaus, excludes the endpoint and gives zero damage at zero accuracy', () => {
    const weapon = { damage: 10, cadence: 2, clip: 2, reload: 1 }
    expect(firingSequence(weapon, 2)).toEqual({
      shots: [
        { time: 0, damage: 10 },
        { time: 0.5, damage: 20 },
      ],
      reloads: [{ start: 1, end: 2 }],
    })
    expect(firingSequence(weapon, 2.1).shots.at(-1)).toEqual({ time: 2, damage: 30 })
    expect(firingSequence({ ...weapon, damage: 0 }, 2).shots.at(-1)?.damage).toBe(0)
    expect(firingSequence(weapon, 0).shots).toEqual([])
  })
})
