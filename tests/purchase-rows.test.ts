import { describe, it, expect } from 'vitest'
import { isAbilityRow, hasUnsupportedItemUpgrade, shopPurchases } from '../src/domain/purchaseRows'
import { inventoryAt, personalCore } from '../src/domain/engine'
import { importPlayerData } from '../src/domain/player'
import { decisionAt, purchaseDecisions, decisionContext } from '../src/domain/decisions'
import { reviewBuild, reviewMoments } from '../src/domain/review'
import { metadata } from './fixtures'
import { syntheticMatch, testPurchase } from './reviewFixtures'
describe('packed item levels and signature rows in the real metadata format', () => {
  it('recognizes the standard TRAINED bit and preserves corruption or unknown flags as unsupported', () => {
    for (const value of [undefined, 0, 65536])
      expect(hasUnsupportedItemUpgrade({ upgradeInfo: value })).toBe(false)
    for (const value of [1, 65537, 196608, 8454144])
      expect(hasUnsupportedItemUpgrade({ upgradeInfo: value })).toBe(true)
    expect(isAbilityRow({ itemId: '1065103387' })).toBe(true)
    expect(isAbilityRow({ itemId: '3077079169' })).toBe(false)
  })
  it('keeps raw ability unlocks for future use but excludes them from inventory, comparisons and personal core', () => {
    const raw = metadata()
    const rows = [
      { game_time_s: 10, item_id: 1065103387, sold_time_s: 0, upgrade_info: 65536 },
      { game_time_s: 20, item_id: 3077079169, sold_time_s: 0, upgrade_info: 65536 },
      { game_time_s: 20, item_id: 1065103387, sold_time_s: 0, upgrade_info: 196608 },
      { game_time_s: 60, item_id: 2064029594, sold_time_s: 0, upgrade_info: 65536 },
    ]
    raw.match_info.players[0].items = rows
    const match = importPlayerData(raw, 42).matches[0]
    expect(match.purchases).toHaveLength(4)
    expect(shopPurchases(match.purchases)).toHaveLength(2)
    expect(inventoryAt(match, 15)).toEqual({ items: [], unknown: 0 })
    expect(inventoryAt(match, 30).items.map((i) => i.id)).toEqual(['upgrade_high_velocity_mag'])
    expect(inventoryAt(match, 70)).toMatchObject({ unknown: 0 })
    expect(inventoryAt(match, 70).items.map((i) => i.id)).toEqual(['upgrade_pristine_emblem'])
    expect(purchaseDecisions(match)).toHaveLength(2)
    expect(decisionContext(match, decisionAt(purchaseDecisions(match), 20)!).reason).toBeUndefined()
    expect(personalCore([match], match.heroId).map((e) => e.itemId)).toEqual([
      'upgrade_high_velocity_mag',
      'upgrade_pristine_emblem',
    ])
  })
  it('keeps actual unknown shop items and corrupted variants out of the simulation instead of discarding their coverage', () => {
    const match = syntheticMatch({
      purchases: [
        { ...testPurchase('upgrade_health', 10), upgradeInfo: 8454144 },
        { itemId: '999999999', time: 20, upgradeInfo: 65536 },
      ],
    })
    expect(inventoryAt(match, 30)).toEqual({ items: [], unknown: 2 })
    expect(shopPurchases(match.purchases)).toHaveLength(2)
  })
  it('restores build cases for persisted profiles whose normal items carry the packed TRAINED bit', () => {
    const match = syntheticMatch()
    match.purchases = [
      { itemId: '1065103387', time: 15, upgradeInfo: 65536 },
      ...match.purchases.map((p) => ({ ...p, upgradeInfo: 65536 })),
    ]
    match.peers = match.peers.map((p) => ({
      ...p,
      purchases: p.purchases?.map((row) => ({ ...row, upgradeInfo: 65536 })),
    }))
    expect(inventoryAt(match, 1000).unknown).toBe(0)
    expect(reviewBuild(match, reviewMoments(match, [])).some((c) => c.kind === 'healing')).toBe(
      true,
    )
  })
})
