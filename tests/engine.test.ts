import { describe, expect, it } from 'vitest'
import { catalogue, heroes, initialBuild, itemById } from '../src/domain/catalogue'
import {
  buildCurve,
  compareAddition,
  evaluate,
  inventoryAt,
  personalCore,
  purchase,
  validateBuild,
} from '../src/domain/engine'
import { importPlayerData, personalModel } from '../src/domain/player'
import { bundle } from './fixtures'

const hero = heroes[0]
const scenario = { accuracy: 1, resistance: 0, duration: 10, spiritApplied: false }
const emptyModel = personalModel([], hero.id)
const get = (id: string) => itemById.get(id)!

describe('versioned catalogue and purchase order', () => {
  it('has unique IDs, valid component graphs and costs covering their components', () => {
    expect(new Set(catalogue.map((i) => i.apiId)).size).toBe(catalogue.length)
    for (const item of catalogue) {
      for (const component of item.components) expect(itemById.has(component), component).toBe(true)
      expect(item.components.reduce((n, id) => n + get(id).cost, 0)).toBeLessThanOrEqual(item.cost)
    }
    expect(get('upgrade_high_velocity_mag').apiId).toBe(3077079169)
  })
  it('consumes components and charges only the remaining standalone price', () => {
    const base = get('upgrade_high_velocity_mag'),
      upgrade = get('upgrade_pristine_emblem')
    const result = purchase(upgrade, [base])
    expect(result.cost).toBe(upgrade.cost - base.cost)
    expect(result.owned).toEqual([upgrade])
    expect(purchase(base, result.owned).cost).toBe(0)
    expect(purchase(base, result.owned).owned).toEqual([upgrade])
  })
  it('keeps situational items outside the core calculation', () => {
    const build = initialBuild()
    build.entries = build.entries.map((e) => ({ ...e, situational: true }))
    const points = buildCurve(build, hero, scenario, emptyModel, 900)
    expect(points).toHaveLength(1)
    expect(points[0].budget).toBe(0)
  })
  it('rejects unknown, duplicate and invalid build imports', () => {
    const build = initialBuild()
    expect(validateBuild(build)).not.toBeNull()
    expect(validateBuild({ ...build, entries: [...build.entries, build.entries[0]] })).toBeNull()
    expect(
      validateBuild({ ...build, entries: [{ ...build.entries[0], itemId: 'invented' }] }),
    ).toBeNull()
  })
  it('reconstructs purchases, consumed components and later sales in chronological order', () => {
    const match = importPlayerData(bundle).matches[0]
    expect(inventoryAt(match, 120).items.map((i) => i.id)).toEqual(['upgrade_high_velocity_mag'])
    expect(inventoryAt(match, 600).items.map((i) => i.id)).toEqual(['upgrade_pristine_emblem'])
    expect(inventoryAt(match, 1500).items).toHaveLength(0)
  })
  it('builds a descriptive starting point from the player’s own recognised purchases', () => {
    const profile = importPlayerData(bundle)
    const result = personalCore(profile.matches, 1)
    expect(result.map((e) => e.itemId)).toEqual([
      'upgrade_high_velocity_mag',
      'upgrade_pristine_emblem',
    ])
    expect(personalCore(profile.matches, 13)).toEqual([])
  })
})

describe('exploratory weapon model', () => {
  it('includes reloading in sustained DPS', () => {
    const result = evaluate(hero, [], scenario),
      w = hero.weapon
    const expected =
      (w.m_flBulletDamage * w.m_iBullets * w.m_iClipSize) /
      (w.m_iClipSize * w.m_flCycleTime + w.m_reloadDuration)
    expect(result.sustained).toBeCloseTo(expected)
    expect(result.sustained).toBeLessThan(w.m_flBulletDamage / w.m_flCycleTime)
  })
  it('uses personal accuracy and target resistance in the actual results', () => {
    const full = evaluate(hero, [], scenario)
    const reduced = evaluate(hero, [], { ...scenario, accuracy: 0.5, resistance: 0.2 })
    expect(reduced.sustained).toBeCloseTo(full.sustained * 0.4)
    const personal = personalModel(importPlayerData(bundle).matches, hero.id)
    const actual = evaluate(hero, [], { ...scenario, accuracy: personal.accuracy! })
    expect(actual.sustained).toBeCloseTo(full.sustained * 0.7)
  })
  it('shows interactions between magazine capacity and fire rate', () => {
    const a = get('upgrade_clip_size'),
      b = get('upgrade_rapid_rounds')
    const base = evaluate(hero, [], scenario).sustained
    const separate =
      evaluate(hero, [a], scenario).sustained + evaluate(hero, [b], scenario).sustained - 2 * base
    expect(evaluate(hero, [a, b], scenario).sustained - base).toBeGreaterThan(separate)
  })
  it('does not silently apply a conditional resistance debuff', () => {
    const item = get('upgrade_bullet_resist_shredder')
    const inactive = evaluate(hero, [item], { ...scenario, resistance: 0.3 })
    const active = evaluate(hero, [item], { ...scenario, resistance: 0.3, spiritApplied: true })
    expect(active.sustained / inactive.sustained).toBeCloseTo(0.8 / 0.7)
  })
  it('includes reloads in finite sequences, and excludes shots at the exact end', () => {
    const testHero = {
      ...hero,
      weapon: {
        m_flBulletDamage: 10,
        m_flCycleTime: 0.5,
        m_iClipSize: 2,
        m_reloadDuration: 1,
        m_iBullets: 1,
      },
    }
    expect(evaluate(testHero, [], { ...scenario, duration: 2 }).burst).toBe(20)
    expect(evaluate(testHero, [], { ...scenario, duration: 2.1 }).burst).toBe(30)
    expect(evaluate(testHero, [], { ...scenario, duration: 0 }).burst).toBe(0)
  })
  it('keeps the declared health drawback of Glass Cannon visible in the projection', () => {
    const glass = get('upgrade_glass_cannon')
    expect(evaluate(hero, [glass], scenario).health).toBeCloseTo(hero.health * 0.87)
  })
  it('compares replacements without counting a component twice', () => {
    const base = get('upgrade_high_velocity_mag'),
      upgrade = get('upgrade_pristine_emblem')
    const result = compareAddition(hero, [base], upgrade, scenario)
    expect(result.cost).toBe(800)
    expect(result.after.sustained).toBeCloseTo(evaluate(hero, [upgrade], scenario).sustained)
  })
})
