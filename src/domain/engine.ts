import { catalogue, itemById, itemByApiId, phases } from './catalogue'
import { projectedTime } from './player'
import { hasUnsupportedItemUpgrade, isAbilityRow } from './purchaseRows'
import type { Build, BuildEntry, Hero, Item, Match, PersonalModel, Scenario } from './types'

export const modelLimitations =
  'Projection exploratoire de l’arme au niveau de base : compétences, passifs du héros, bonus d’investissement, distance, actifs et la plupart des procs exclus. Les règles d’empilement restent à vérifier en jeu.'

export function sortedEntries(build: Build): BuildEntry[] {
  return phases.flatMap((phase) => build.entries.filter((e) => e.phase === phase && !e.situational))
}

/** Price convention: cost is the total standalone price, including components. */
export function totalCost(item: Item): number {
  // snapshot cost is populated with the standalone total by the extraction script.
  return item.cost
}

export function purchase(item: Item, owned: Item[]): { cost: number; owned: Item[] } {
  const includes = (candidate: Item, id: string, seen = new Set<string>()): boolean => {
    if (seen.has(candidate.id)) return false
    seen.add(candidate.id)
    return (
      candidate.id === id ||
      candidate.components.some(
        (c) => c === id || (itemById.has(c) && includes(itemById.get(c)!, id, seen)),
      )
    )
  }
  if (owned.some((i) => includes(i, item.id))) return { cost: 0, owned }
  const components = new Set<string>()
  const walk = (current: Item, seen = new Set<string>()) => {
    if (seen.has(current.id)) return
    seen.add(current.id)
    for (const id of current.components) {
      components.add(id)
      const child = itemById.get(id)
      if (child) walk(child, seen)
    }
  }
  walk(item)
  const consumed = owned.filter((i) => components.has(i.id))
  const credit = consumed.reduce((n, i) => n + totalCost(i), 0)
  return {
    cost: Math.max(0, totalCost(item) - credit),
    owned: [...owned.filter((i) => !components.has(i.id)), item],
  }
}

export type WeaponResult = {
  damage: number
  sustained: number
  burst: number
  health: number
  spirit: number
  clip: number
  reload: number
  cadence: number
  unsupported: number
}
/** Shared finite firing sequence; a shot exactly at the end is excluded. */
export function firingSequence(
  weapon: Pick<WeaponResult, 'damage' | 'cadence' | 'clip' | 'reload'>,
  requestedDuration: number,
) {
  const duration = Math.max(0, Math.min(60, requestedDuration))
  const shots: { time: number; damage: number }[] = []
  const reloads: { start: number; end: number }[] = []
  if (
    ![duration, weapon.damage, weapon.cadence, weapon.clip, weapon.reload].every(Number.isFinite) ||
    weapon.cadence <= 0 ||
    weapon.clip < 1 ||
    weapon.reload < 0
  )
    return { shots, reloads }
  let t = 0,
    inClip = 0
  while (t < duration && shots.length < 10000) {
    shots.push({ time: t, damage: weapon.damage * (shots.length + 1) })
    inClip++
    if (inClip === weapon.clip) {
      const start = t + 1 / weapon.cadence,
        end = start + weapon.reload
      if (start < duration && weapon.reload > 0)
        reloads.push({ start, end: Math.min(duration, end) })
      t = end
      inClip = 0
    } else t += 1 / weapon.cadence
  }
  return { shots, reloads }
}
export function evaluate(hero: Hero, items: Item[], scenario: Scenario): WeaponResult {
  const sum = (key: string) => items.reduce((n, i) => n + (i.properties[key] ?? 0), 0)
  const accuracy = Math.max(0, Math.min(1, scenario.accuracy))
  let resistance = Math.max(-0.5, Math.min(0.9, scenario.resistance))
  // This single source-defined debuff is opt-in, never assumed to be applied.
  if (scenario.spiritApplied && items.some((i) => i.id === 'upgrade_bullet_resist_shredder'))
    resistance -= 0.1
  const damage =
    hero.weapon.m_flBulletDamage *
    hero.weapon.m_iBullets *
    Math.max(0, 1 + sum('BaseAttackDamagePercent') / 100) *
    (1 - resistance) *
    accuracy
  const cadence = (1 / hero.weapon.m_flCycleTime) * Math.max(0.1, 1 + sum('BonusFireRate') / 100)
  const clip = Math.max(
    1,
    Math.floor(hero.weapon.m_iClipSize * (1 + sum('BonusClipSizePercent') / 100)),
  )
  const reload = hero.weapon.m_reloadDuration
  const sustained = (damage * clip) / (clip / cadence + reload)
  const sequence = firingSequence({ damage, cadence, clip, reload }, scenario.duration)
  const support = new Set([
    'BaseAttackDamagePercent',
    'BonusFireRate',
    'BonusClipSizePercent',
    'BonusHealth',
    'TechPower',
    'MaxHealthLossPercent',
  ])
  return {
    damage,
    sustained,
    burst: sequence.shots.at(-1)?.damage ?? 0,
    health: Math.max(
      1,
      (hero.health + sum('BonusHealth')) * (1 + sum('MaxHealthLossPercent') / 100),
    ),
    spirit: sum('TechPower'),
    clip,
    reload,
    cadence,
    unsupported: items.filter(
      (i) =>
        i.active ||
        Object.keys(i.properties).some(
          (k) =>
            !support.has(k) &&
            ![
              'AbilityUnitTargetLimit',
              'AbilityCooldownBetweenCharge',
              'ChannelMoveSpeed',
              'AbilityDuration',
              'AbilityCooldown',
              'AbilityCastRange',
            ].includes(k),
        ),
    ).length,
  }
}

export type CurvePoint = {
  budget: number
  result: WeaponResult
  item?: Item
  time: number | null
  owned: Item[]
  entry?: BuildEntry
  cost: number
}
export function buildCurve(
  build: Build,
  hero: Hero,
  scenario: Scenario,
  personal: PersonalModel,
  rate: number,
): CurvePoint[] {
  let budget = 0,
    owned: Item[] = []
  const out: CurvePoint[] = [
    { budget, result: evaluate(hero, owned, scenario), time: 0, owned, cost: 0 },
  ]
  for (const entry of sortedEntries(build)) {
    const item = itemById.get(entry.itemId)
    if (!item) continue
    const bought = purchase(item, owned)
    owned = bought.owned
    budget += bought.cost
    out.push({
      budget,
      item,
      entry,
      owned,
      cost: bought.cost,
      result: evaluate(hero, owned, scenario),
      time: projectedTime(budget, personal, rate),
    })
  }
  return out
}

export function compareAddition(hero: Hero, owned: Item[], item: Item, scenario: Scenario) {
  const next = purchase(item, owned)
  const before = evaluate(hero, owned, scenario),
    after = evaluate(hero, next.owned, scenario)
  return { before, after, cost: next.cost, delta: after.sustained - before.sustained }
}

export function synergyNotes(items: Item[]): { title: string; detail: string }[] {
  const ids = new Set(items.map((i) => i.id)),
    notes: { title: string; detail: string }[] = []
  if (
    items.some((i) => (i.properties.BonusFireRate ?? 0) > 0) &&
    items.some((i) => (i.properties.BonusClipSizePercent ?? 0) > 0)
  )
    notes.push({
      title: 'Cadence × chargeur',
      detail:
        'Le chargeur prolonge la séquence de tir accélérée. Comparez le gain sur une courte fenêtre et sur plusieurs rechargements.',
    })
  if (ids.has('upgrade_bullet_resist_shredder'))
    notes.push({
      title: 'Spirit → résistance balle → tirs',
      detail:
        'La réduction de résistance nécessite d’abord des dégâts Spirit. Le scénario permet d’activer cette hypothèse ; l’application réelle n’est pas garantie.',
    })
  if (ids.has('upgrade_healbane'))
    notes.push({
      title: 'Contre-soins à appliquer',
      detail:
        'Healbane exige des dégâts Spirit. Son effet sur les soins et le soin à l’élimination restent hors de la courbe de dégâts.',
    })
  if (items.some((i) => (i.properties.TechPower ?? 0) > 0))
    notes.push({
      title: 'Puissance spirituelle à exploiter',
      detail:
        'Les gains dépendent des coefficients des capacités. Ils sont affichés, mais leurs dégâts ne sont pas encore modélisés.',
    })
  if (!notes.length)
    notes.push({
      title: 'Commencez par une interaction',
      detail:
        'Ajoutez des objets, puis comparez leur contribution et les conditions nécessaires pour en profiter.',
    })
  return notes
}

export function validateBuild(raw: unknown): Build | null {
  if (!raw || typeof raw !== 'object') return null
  const b = raw as Build
  if (
    typeof b.name !== 'string' ||
    !Number.isInteger(b.heroId) ||
    !Array.isArray(b.entries) ||
    b.entries.length > 40
  )
    return null
  if (
    !b.entries.every(
      (e) =>
        e &&
        typeof e.id === 'string' &&
        itemById.has(e.itemId) &&
        phases.includes(e.phase) &&
        typeof e.situational === 'boolean' &&
        typeof e.note === 'string',
    )
  )
    return null
  if (new Set(b.entries.map((e) => e.itemId)).size !== b.entries.length) return null
  return {
    name: b.name.slice(0, 100),
    heroId: b.heroId,
    entries: b.entries.map((e) => ({ ...e, note: e.note.slice(0, 500) })),
  }
}

export function findItem(id: string) {
  return catalogue.find((i) => i.id === id)
}

export function inventoryAt(match: Match, time: number): { items: Item[]; unknown: number } {
  let owned: Item[] = []
  const unknown = new Set<string>()
  const events = match.purchases
    .filter((p) => !isAbilityRow(p))
    .flatMap((p) => [
      { time: p.time, sold: false, purchase: p },
      ...(p.soldTime !== undefined ? [{ time: p.soldTime, sold: true, purchase: p }] : []),
    ])
    .filter((e) => e.time <= time)
    .sort((a, b) => a.time - b.time || Number(b.sold) - Number(a.sold))
  for (const event of events) {
    const p = event.purchase,
      item = itemByApiId.get(p.itemId)
    if (event.sold) {
      unknown.delete(p.itemId)
      if (item) owned = owned.filter((i) => i.id !== item.id)
    } else if (!item || hasUnsupportedItemUpgrade(p)) {
      unknown.add(p.itemId)
      if (item) owned = owned.filter((i) => i.id !== item.id)
    } else {
      owned = purchase(item, owned).owned
    }
  }
  return { items: owned, unknown: unknown.size }
}

/** Descriptive starting point from actual purchases, never ranked by winrate. */
export function personalCore(matches: Match[], heroId: number): BuildEntry[] {
  const candidates = new Map<
    string,
    { item: Item; phase: BuildEntry['phase']; count: number; times: number[] }
  >()
  for (const match of matches.filter((m) => m.heroId === heroId && m.mode === 1 && !m.abandoned)) {
    const counted = new Set<string>()
    for (const p of match.purchases) {
      const item = itemByApiId.get(p.itemId)
      if (
        !item ||
        isAbilityRow(p) ||
        hasUnsupportedItemUpgrade(p) ||
        counted.has(item.id) ||
        p.time > match.duration
      )
        continue
      counted.add(item.id)
      const phase = p.time < 480 ? 'lane' : p.time < 1200 ? 'mid' : 'late'
      const key = `${phase}:${item.id}`,
        old = candidates.get(key)
      candidates.set(key, {
        item,
        phase,
        count: (old?.count ?? 0) + 1,
        times: [...(old?.times ?? []), p.time],
      })
    }
  }
  const chosen: BuildEntry[] = []
  for (const phase of phases) {
    const picks = [...candidates.values()]
      .filter((c) => c.phase === phase)
      .sort(
        (a, b) =>
          b.count - a.count ||
          a.times.reduce((n, t) => n + t, 0) / a.times.length -
            b.times.reduce((n, t) => n + t, 0) / b.times.length,
      )
    const used = new Set(chosen.map((e) => e.itemId))
    let added = 0
    for (const c of picks) {
      if (used.has(c.item.id)) continue
      chosen.push({
        id: `observed-${phase}-${c.item.id}`,
        itemId: c.item.id,
        phase,
        situational: false,
        note: `Achat observé dans ${c.count} partie(s). Repères de phase : avant 8 min, 8–20 min, après 20 min ; à ajuster selon votre plan.`,
      })
      used.add(c.item.id)
      added++
      if (added >= (phase === 'late' ? 2 : 3)) break
    }
  }
  return chosen
}
