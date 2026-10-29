import { catalogue, heroes, itemByApiId, itemById, source } from './catalogue'
import { evaluate, firingSequence, inventoryAt, purchase, type WeaponResult } from './engine'
import type { BuildCase } from './review'
import type { Item, Match, Scenario } from './types'
import { isAbilityRow, hasUnsupportedItemUpgrade, shopPurchases } from './purchaseRows'

export type PurchaseDecision = {
  id: string
  index: number
  time: number
  item?: Item
  variant: boolean
}
export type ReplayDraft = {
  items: Item[]
  actualItemId: string
  alternativeItemId: string
  scenario: Scenario
}
export type DecisionPreference = { itemId: string; knownAt: number }
export function initialAlternative(
  candidates: Item[],
  preference: DecisionPreference | undefined,
  time: number,
): Item | undefined {
  return (
    candidates.find(
      (item) => preference && item.id === preference.itemId && preference.knownAt <= time,
    ) ?? candidates[0]
  )
}
export function purchaseDecisions(match: Match): PurchaseDecision[] {
  return match.purchases
    .map((p, index) => ({
      id: `${index}:${p.itemId}:${p.time}`,
      index,
      time: p.time,
      item: itemByApiId.get(p.itemId),
      variant: hasUnsupportedItemUpgrade(p),
    }))
    .filter((d) => !isAbilityRow(match.purchases[d.index]))
    .sort((a, b) => a.time - b.time || a.index - b.index)
}
export function decisionAt(decisions: PurchaseDecision[], time: number) {
  return [...decisions].reverse().find((d) => d.time <= time) ?? decisions[0]
}
export function decisionContext(match: Match, decision: PurchaseDecision) {
  // Strictly before t, including t=0: no purchase or sale from the same second is borrowed.
  const before = inventoryAt(match, decision.time - 0.001)
  const actual = decision.item ? purchase(decision.item, before.items) : undefined
  const consumed = new Set(
    before.items
      .filter((i) => !actual?.owned.some((after) => after.id === i.id))
      .map((i) => String(i.apiId)),
  )
  const rows = shopPurchases(match.purchases)
  const reason =
    match.mode !== 1
      ? 'mode'
      : match.inventoryRecorded !== true
        ? 'missing'
        : match.telemetryWarnings?.some((w) => w.startsWith('inventory-')) || before.unknown
          ? 'incomplete'
          : !decision.item || decision.variant
            ? 'variant'
            : rows.filter((p) => p.time === decision.time).length > 1 ||
                rows.some((p) => p.soldTime === decision.time && !consumed.has(p.itemId))
              ? 'simultaneous'
              : purchase(decision.item, before.items).cost === 0
                ? 'owned'
                : undefined
  return {
    before,
    reason,
    priceBasis:
      match.clientVersion === source.version
        ? 'same'
        : match.clientVersion === undefined
          ? 'unknown'
          : 'different',
  } as const
}
export function decisionCandidates(match: Match, decision: PurchaseDecision, cases: BuildCase[]) {
  const context = decisionContext(match, decision)
  if (context.reason || !decision.item) return []
  const actualCost = purchase(decision.item, context.before.items).cost
  const preferred = new Set(
    cases.filter((c) => c.time === decision.time).flatMap((c) => c.options.map((o) => o.itemId)),
  )
  return catalogue
    .filter(
      (item) => item.id !== decision.item!.id && purchase(item, context.before.items).cost > 0,
    )
    .sort(
      (a, b) =>
        Number(preferred.has(b.id)) - Number(preferred.has(a.id)) ||
        Math.abs(purchase(a, context.before.items).cost - actualCost) -
          Math.abs(purchase(b, context.before.items).cost - actualCost) ||
        Number(b.category === decision.item!.category) -
          Number(a.category === decision.item!.category) ||
        a.id.localeCompare(b.id),
    )
}
/** Accuracy is a prefix of the selected match, never its final counters or future matches. */
export function accuracyBefore(match: Match, time: number) {
  if (match.telemetryWarnings?.some((w) => w.startsWith('stats-'))) return undefined
  let previousHit = 0,
    previousMiss = 0
  let result: { value: number; shots: number; at: number } | undefined
  for (const p of match.stats.filter((p) => p.time < time).sort((a, b) => a.time - b.time)) {
    if (p.shotsHit === undefined || p.shotsMissed === undefined) continue
    if (
      ![p.shotsHit, p.shotsMissed].every((v) => Number.isFinite(v) && v >= 0) ||
      p.shotsHit < previousHit ||
      p.shotsMissed < previousMiss
    )
      return undefined
    previousHit = p.shotsHit
    previousMiss = p.shotsMissed
    const shots = p.shotsHit + p.shotsMissed
    if (shots > 0) result = { value: p.shotsHit / shots, shots, at: p.time }
  }
  return result
}
export function compareDecision(
  match: Match,
  decision: PurchaseDecision,
  alternativeId: string,
  scenario: Scenario,
) {
  const context = decisionContext(match, decision),
    alternative = itemById.get(alternativeId)
  if (context.reason || !decision.item || !alternative || alternative.id === decision.item.id)
    return undefined
  const a = purchase(decision.item, context.before.items),
    b = purchase(alternative, context.before.items)
  if (!b.cost) return undefined
  const hero = heroes.find((h) => h.id === match.heroId)
  const project = (items: Item[]) => (hero ? evaluate(hero, items, scenario) : undefined)
  const actual = project(a.owned),
    proposed = project(b.owned)
  const sum = (items: Item[], key: string) =>
    items.reduce((n, i) => n + (i.properties[key] ?? 0), 0)
  const contributions = [
    'BaseAttackDamagePercent',
    'BonusFireRate',
    'BonusClipSizePercent',
    'BonusHealth',
    'MaxHealthLossPercent',
    'TechPower',
  ]
    .map((key) => ({ key, actual: sum(a.owned, key), alternative: sum(b.owned, key) }))
    .filter((p) => p.actual !== 0 || p.alternative !== 0)
  const consumed = (items: Item[]) =>
    context.before.items.filter((old) => !items.some((i) => i.id === old.id))
  return {
    before: context.before.items,
    actual: {
      item: decision.item,
      cost: a.cost,
      items: a.owned,
      consumed: consumed(a.owned),
      result: actual,
    },
    alternative: {
      item: alternative,
      cost: b.cost,
      items: b.owned,
      consumed: consumed(b.owned),
      result: proposed,
    },
    difference: b.cost - a.cost,
    contributions,
    priceBasis: context.priceBasis,
    actualSequence: actual ? firingSequence(actual, scenario.duration) : undefined,
    alternativeSequence: proposed ? firingSequence(proposed, scenario.duration) : undefined,
    // Known active-slot rule only. Overall slot unlocks and all effects remain outside this model.
    activeLimit: b.owned.filter((i) => i.active).length > 4,
  }
}
export const decisionMetrics: {
  key: keyof Pick<WeaponResult, 'burst' | 'sustained' | 'health' | 'spirit'>
  label: string
  unit: string
}[] = [
  { key: 'burst', label: 'Dégâts de tirs', unit: '' },
  { key: 'sustained', label: 'DPS avec recharges', unit: '/s' },
  { key: 'health', label: 'PV · base + objets', unit: '' },
  { key: 'spirit', label: 'Spirit des objets', unit: '' },
]
