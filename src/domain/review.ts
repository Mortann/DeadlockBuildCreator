import { itemByApiId, itemById, source } from './catalogue'
import { inventoryAt, purchase } from './engine'
import { interpolate, median, personalModel } from './player'
import { shopPurchases, hasUnsupportedItemUpgrade } from './purchaseRows'
import type {
  CombatSeries,
  Item,
  Match,
  ObjectiveEvent,
  Peer,
  PositionSample,
  StatPoint,
  WorldPosition,
} from './types'

export const REVIEW_VERSION = 'review-1.1'
export const MIN_REFERENCE_MATCHES = 5
export const POSITION_AGE = 8
export const PROXIMITY_RADIUS = 1400 // world units, a 2-D observation radius, not weapon range.
function hasWarning(match: Match, ...prefixes: string[]) {
  return match.telemetryWarnings?.some((w) => prefixes.some((p) => w.startsWith(p))) ?? false
}
const AGGREGATE_SOURCES = new Set(['Ability', 'Bullet', 'Melee', 'Misc', 'UnknownAbility'])
export type Proof = 'observed' | 'signal'
export type Evidence = {
  label: string
  value: number
  unit?: string
  at?: number
  tone?: 'negative' | 'positive' | 'neutral'
}
export type ScoreAxis = {
  id: string
  label: string
  value: number
  reference: number
  percentile: number | null
  count: number
  unit: string
  inverse: boolean
}
export type ReviewOverview = {
  referenceCount: number
  axes: ScoreAxis[]
  grade: 'A' | 'B' | 'C' | 'D' | null
  percentile: number | null
  gradeReason: 'ready' | 'references' | 'dimensions' | 'telemetry' | 'mode'
  coverage: { key: string; label: string; available: boolean; count: number }[]
  alliesRecorded: number
  opponentsRecorded: number
}
export type DamageWindow = {
  start: number
  end: number
  total: number
  actors: {
    slot: number
    accountId?: number
    heroId?: number
    damage: number
    sources: { name: string; value: number }[]
  }[]
}
export type ReviewMoment = {
  id: string
  kind: 'death' | 'availability' | 'economy' | 'priority'
  title: string
  time: number
  start: number
  end: number
  proof: Proof
  priority: number
  deathTimes: number[]
  objective?: ObjectiveEvent
  damage?: DamageWindow
  evidence: Evidence[]
  signals: string[]
  focus: string
  question: string
  local?: { allies: number; enemies: number; radius: number; at: number }
  economy?: { actual: number; reference: number; gap: number }
}
export type BuildCase = {
  id: string
  kind: 'healing' | 'control' | 'pressure'
  time: number
  title: string
  targetId: number
  targetHero: number
  evidence: Evidence[]
  enemyItems: string[]
  responseItems: string[]
  teamResponse: 'equipped' | 'unknown' | 'not-recorded'
  holderId?: number
  actualPurchase?: { itemId: string; cost: number; time: number }
  options: {
    itemId: string
    cost: number
    difference: number | null
    effect: number
    unit: string
    condition: string
  }[]
  priceVersion: 'same' | 'unknown' | 'different'
}
export type AdvantagePoint = { time: number; share: number; own: number; enemy: number }
export type ReviewReport = {
  version: string
  matchId: string
  overview: ReviewOverview
  moments: ReviewMoment[]
  build: BuildCase[]
  advantage: AdvantagePoint[]
}

export function actorsOf(match: Match): Peer[] {
  return [
    {
      accountId: match.accountId,
      heroId: match.heroId,
      team: match.team,
      netWorth: match.netWorth,
      stats: match.stats,
      playerSlot: match.playerSlot,
      positions: match.positions,
      purchases: match.inventoryRecorded ? match.purchases : undefined,
      deathTimes: match.deathTimes,
      deathDetails: match.deathDetails,
    },
    ...match.peers,
  ]
}
export function positionAt(
  points: PositionSample[] | undefined,
  time: number,
  maxAge = POSITION_AGE,
): PositionSample | undefined {
  if (!points?.length || !Number.isFinite(time)) return undefined
  let low = 0,
    high = points.length - 1,
    found = -1
  while (low <= high) {
    const mid = (low + high) >> 1
    if (points[mid].time <= time) {
      found = mid
      low = mid + 1
    } else high = mid - 1
  }
  const p = points[found]
  return p &&
    Number.isFinite(p.x) &&
    Number.isFinite(p.y) &&
    Number.isFinite(p.time) &&
    time - p.time <= maxAge &&
    p.alive !== false &&
    p.health !== 0
    ? p
    : undefined
}
export function isDeadAt(actor: Pick<Peer, 'deathDetails'>, time: number): boolean {
  return (
    actor.deathDetails?.some(
      (d) =>
        d.respawnDuration !== undefined &&
        d.respawnDuration > 0 &&
        d.time <= time &&
        time < d.time + d.respawnDuration,
    ) ?? false
  )
}
export function comparableHistory(match: Match, history: Match[]): Match[] {
  return history.filter(
    (m) =>
      m.id !== match.id &&
      m.accountId === match.accountId &&
      m.startTime > 0 &&
      m.startTime < match.startTime &&
      m.heroId === match.heroId &&
      m.mode === match.mode &&
      m.mode === 1 &&
      !m.abandoned &&
      !hasWarning(m, 'stats-', 'players-') &&
      m.duration >= 180 &&
      Math.abs(m.duration - match.duration) <= Math.max(180, match.duration * 0.3) &&
      !(m.clientVersion && match.clientVersion && m.clientVersion !== match.clientVersion),
  )
}
function finalCounter(match: Match, key: keyof StatPoint): number | null {
  const p = [...match.stats].reverse().find((p) => typeof p[key] === 'number')
  return p &&
    Number.isFinite(p.time) &&
    p.time >= match.duration * 0.85 &&
    p.time <= match.duration &&
    typeof p[key] === 'number'
    ? (p[key] as number)
    : null
}
const axisDefs = [
  {
    id: 'economy',
    label: 'Économie',
    unit: '/ min',
    inverse: false,
    weight: 0.3,
    get: (m: Match) => (m.netWorth > 0 ? m.netWorth / (m.duration / 60) : null),
  },
  {
    id: 'survival',
    label: 'Survie',
    unit: 'morts / 10 min',
    inverse: true,
    weight: 0.25,
    get: (m: Match) => {
      const n = m.deaths > 0 ? m.deaths : finalCounter(m, 'deaths')
      return n === null ? null : n / (m.duration / 600)
    },
  },
  {
    id: 'damage',
    label: 'Dégâts héros',
    unit: '/ min',
    inverse: false,
    weight: 0.25,
    get: (m: Match) => {
      const n = finalCounter(m, 'damage')
      return n === null ? null : n / (m.duration / 60)
    },
  },
  {
    id: 'objectives',
    label: 'Objectifs',
    unit: '/ min',
    inverse: false,
    weight: 0.2,
    get: (m: Match) => {
      const n = finalCounter(m, 'objectiveDamage')
      return n === null ? null : n / (m.duration / 60)
    },
  },
  {
    id: 'healing',
    label: 'Soutien',
    unit: '/ min',
    inverse: false,
    weight: 0.2,
    get: (m: Match) => {
      const n = finalCounter(m, 'teammateHealing')
      return n === null ? null : n / (m.duration / 60)
    },
  },
]
export function reviewOverview(match: Match, history: Match[]): ReviewOverview {
  const refs = comparableHistory(match, history)
  const axes: ScoreAxis[] = []
  for (const def of axisDefs) {
    const value = def.get(match),
      values = refs.map(def.get).filter((v): v is number => v !== null && Number.isFinite(v))
    const ref = median(values)
    if (value === null || ref === null) continue
    const spread = Math.max(...values) - Math.min(...values)
    let percentile: number | null = null
    if (values.length >= MIN_REFERENCE_MATCHES && spread > Math.max(0.01, Math.abs(ref) * 0.01)) {
      const epsilon = Math.max(0.0001, Math.abs(ref) * 0.001)
      const below = values.filter((v) =>
        def.inverse ? v > value + epsilon : v < value - epsilon,
      ).length
      const tied = values.filter((v) => Math.abs(v - value) <= epsilon).length
      // Two neutral pseudo-observations at each end shrink small cohorts toward the median.
      percentile = (below + tied * 0.5 + 2) / (values.length + 4)
    }
    axes.push({
      id: def.id,
      label: def.label,
      value,
      reference: ref,
      percentile,
      count: values.length,
      unit: def.unit,
      inverse: def.inverse,
    })
  }
  const scored = axes.filter((a) => a.percentile !== null)
  const weight = scored.reduce((sum, a) => sum + axisDefs.find((d) => d.id === a.id)!.weight, 0)
  const percentile =
    scored.length >= 3
      ? scored.reduce(
          (sum, a) => sum + a.percentile! * axisDefs.find((d) => d.id === a.id)!.weight,
          0,
        ) / weight
      : null
  const warnings = hasWarning(match, 'stats-', 'players-')
  const gradeReason =
    match.mode !== 1 || match.abandoned
      ? 'mode'
      : warnings
        ? 'telemetry'
        : refs.length < MIN_REFERENCE_MATCHES
          ? 'references'
          : percentile === null
            ? 'dimensions'
            : 'ready'
  const finalPercentile = gradeReason === 'ready' ? percentile : null
  const actors = actorsOf(match)
  return {
    referenceCount: refs.length,
    axes,
    percentile: finalPercentile,
    grade:
      finalPercentile === null
        ? null
        : finalPercentile >= 0.75
          ? 'A'
          : finalPercentile >= 0.5
            ? 'B'
            : finalPercentile >= 0.25
              ? 'C'
              : 'D',
    gradeReason,
    coverage: [
      {
        key: 'economy',
        label: 'Économie',
        available: match.stats.length >= 2,
        count: match.stats.length,
      },
      {
        key: 'inventory',
        label: 'Achats',
        available: match.inventoryRecorded === true,
        count: shopPurchases(match.purchases).length,
      },
      {
        key: 'deaths',
        label: 'Décès',
        available: (match.deathDetails?.length ?? 0) > 0,
        count: match.deathDetails?.length ?? match.deathTimes.length,
      },
      {
        key: 'positions',
        label: 'Positions',
        available: actors.some((p) => (p.positions?.length ?? 0) >= 2),
        count: actors.filter((p) => (p.positions?.length ?? 0) >= 2).length,
      },
      {
        key: 'objectives',
        label: 'Objectifs',
        available: match.objectives !== undefined,
        count: match.objectives?.length ?? 0,
      },
      {
        key: 'combat',
        label: 'Combat',
        available: (match.damageMatrix?.length ?? 0) > 0,
        count: match.damageMatrix?.length ?? 0,
      },
    ],
    alliesRecorded: actors.filter((p) => match.team !== undefined && p.team === match.team).length,
    opponentsRecorded: actors.filter(
      (p) => match.team !== undefined && p.team !== undefined && p.team !== match.team,
    ).length,
  }
}

/** Counter delta wholly inside a requested interval, using actual recorded endpoints. */
export function counterInterval(
  stats: StatPoint[],
  key: keyof StatPoint,
  start: number,
  end: number,
  tolerance = 15,
): { value: number; start: number; end: number } | null {
  const a = stats.find(
    (p) => p.time >= start && p.time <= start + tolerance && typeof p[key] === 'number',
  )
  const b = [...stats]
    .reverse()
    .find((p) => p.time <= end && p.time >= end - tolerance && typeof p[key] === 'number')
  if (!a || !b || b.time <= a.time) return null
  const first = a[key] as number,
    last = b[key] as number
  if (!Number.isFinite(first) || !Number.isFinite(last) || last < first) return null
  const samples = stats.filter(
    (p) => p.time >= a.time && p.time <= b.time && typeof p[key] === 'number',
  )
  if (
    samples.some(
      (p, i) =>
        !Number.isFinite(p[key]) ||
        (i > 0 &&
          (p.time <= samples[i - 1].time || (p[key] as number) < (samples[i - 1][key] as number))),
    )
  )
    return null
  return { value: last - first, start: a.time, end: b.time }
}
function matrixDelta(
  series: CombatSeries,
  start: number,
  end: number,
): { value: number; start: number; end: number } | null {
  if (
    series.samples.some(
      (s, i) =>
        !Number.isFinite(s.value) ||
        s.value < 0 ||
        !Number.isFinite(s.time) ||
        (i > 0 && (s.time <= series.samples[i - 1].time || s.value < series.samples[i - 1].value)),
    )
  )
    return null
  const a = series.samples.find((p) => p.time >= start && p.time <= start + 15)
  const b = [...series.samples].reverse().find((p) => p.time <= end && p.time >= end - 15)
  return a && b && b.time > a.time ? { value: b.value - a.value, start: a.time, end: b.time } : null
}
export function incomingDamage(match: Match, start: number, end: number): DamageWindow | null {
  if (
    hasWarning(match, 'combat-', 'players-') ||
    match.playerSlot === undefined ||
    !match.damageMatrix?.length
  )
    return null
  const counts = new Map<string, number>()
  const eligible = match.damageMatrix.filter(
    (s) =>
      s.statType === 'damage' &&
      s.targetSlot === match.playerSlot &&
      s.dealerSlot !== match.playerSlot &&
      s.sourceName,
  )
  for (const s of eligible) {
    const key = `${s.dealerSlot}:${s.sourceName}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const details = eligible.filter(
    (s) =>
      !AGGREGATE_SOURCES.has(s.sourceName!) && counts.get(`${s.dealerSlot}:${s.sourceName}`) === 1,
  )
  // Aggregate and blank rows are excluded: their families can overlap detailed sources.
  const chosen = details // Detailed sources only: aggregate families may overlap, so partial coverage is explicit.
  const windows = new Map<
    string,
    { start: number; end: number; rows: { series: CombatSeries; value: number }[] }
  >()
  for (const series of chosen) {
    const delta = matrixDelta(series, start, end)
    if (!delta || delta.value <= 0) continue
    const key = `${delta.start}:${delta.end}`,
      bucket = windows.get(key) ?? { start: delta.start, end: delta.end, rows: [] }
    bucket.rows.push({ series, value: delta.value })
    windows.set(key, bucket)
  }
  const best = [...windows.values()].sort((a, b) => b.rows.length - a.rows.length)[0]
  if (!best) return null
  const actors = new Map<number, DamageWindow['actors'][number]>()
  for (const row of best.rows) {
    const peer = match.peers.find((p) => p.playerSlot === row.series.dealerSlot)
    if (!peer || peer.team === undefined || match.team === undefined || peer.team === match.team)
      continue
    const actor = actors.get(row.series.dealerSlot) ?? {
      slot: row.series.dealerSlot,
      accountId: peer.accountId,
      heroId: peer.heroId,
      damage: 0,
      sources: [],
    }
    actor.damage += row.value
    actor.sources.push({ name: row.series.sourceName!, value: row.value })
    actors.set(actor.slot, actor)
  }
  const result = [...actors.values()].sort((a, b) => b.damage - a.damage),
    total = result.reduce((n, p) => n + p.damage, 0)
  return total > 0 ? { start: best.start, end: best.end, total, actors: result } : null
}
function nearbyContext(match: Match, time: number): ReviewMoment['local'] | undefined {
  if (
    hasWarning(match, 'players-', 'paths-') ||
    actorsOf(match).filter((a) => a.team === 0).length !== 6 ||
    actorsOf(match).filter((a) => a.team === 1).length !== 6 ||
    match.team === undefined ||
    match.peers.length !== 11 ||
    new Set(actorsOf(match).map((a) => a.accountId)).size !== 12
  )
    return undefined
  const self = actorPositionAt(match, time)
  if (!self) return undefined
  let allies = 1,
    enemies = 0
  for (const actor of match.peers) {
    if (actor.team === undefined) return undefined
    if (isDeadAt(actor, time)) continue
    const p = actorPositionAt(actor, time)
    if (!p || Math.abs(p.time - self.time) > 3) return undefined
    if (self.z !== undefined && p.z !== undefined && Math.abs(self.z - p.z) > 256) continue
    if (Math.hypot(p.x - self.x, p.y - self.y) > PROXIMITY_RADIUS) continue
    if (actor.team === match.team) allies++
    else enemies++
  }
  return enemies >= allies + 2 ? { allies, enemies, radius: PROXIMITY_RADIUS, at: time } : undefined
}
export function objectiveLabel(objective: ObjectiveEvent): string {
  return (
    {
      guardian: 'Gardien',
      walker: 'Walker',
      core: 'Patron',
      titan: 'Titan',
      shrine: 'Sanctuaire',
      barracks: 'Caserne',
      midboss: 'Mid Boss',
      unknown: 'Objectif',
    } as const
  )[objective.type ?? 'unknown']
}
export function reviewMoments(match: Match, history: Match[]): ReviewMoment[] {
  if (match.mode !== 1) return []
  const moments: ReviewMoment[] = []
  const details = new Map((match.deathDetails ?? []).map((d) => [d.time, d]))
  const times = [...new Set([...match.deathTimes, ...details.keys()])].sort((a, b) => a - b)
  const groups: number[][] = []
  for (const t of times) {
    const group = groups.at(-1)
    if (group && t - group.at(-1)! <= 180 && t - group[0] <= 300) group.push(t)
    else groups.push([t])
  }
  for (const group of groups) {
    const time = group[0],
      death = details.get(time),
      start = Math.max(0, time - 20)
    const overlapping = (match.objectives ?? []).filter(
      (o) =>
        match.team !== undefined &&
        o.team === match.team &&
        o.type !== 'midboss' &&
        group.some((t) => {
          const d = details.get(t)
          return (
            d?.respawnDuration !== undefined &&
            o.destroyedTime >= t &&
            o.destroyedTime < t + d.respawnDuration
          )
        }),
    )
    const objective = overlapping[0],
      local = nearbyContext(match, Math.max(0, time - 8)),
      damage = incomingDamage(match, Math.max(0, time - 60), time)
    const evidence: Evidence[] = [
      { label: 'Décès', value: group.length, unit: '', tone: 'negative' },
    ]
    if (death?.respawnDuration !== undefined)
      evidence.push({ label: 'Indisponible', value: death.respawnDuration, unit: 's' })
    if (damage) evidence.push({ label: 'Dégâts relevés', value: damage.total })
    if (objective)
      evidence.push({
        label: objectiveLabel(objective),
        value: objective.destroyedTime - time,
        unit: 's après',
      })
    if (local)
      evidence.push({
        label: 'Proximité 2D',
        at: local.at,
        value: local.enemies,
        unit: `contre ${local.allies}`,
      })
    moments.push({
      id: `death-${time}`,
      kind: objective ? 'availability' : 'death',
      title: objective
        ? 'Indisponible à la perte d’un objectif'
        : local
          ? 'Proximité adverse avant la mort'
          : group.length > 1
            ? 'Morts rapprochées'
            : 'Un décès à revoir',
      time,
      start,
      end: Math.min(
        match.duration,
        Math.max(
          group.at(-1)! + 20,
          objective?.destroyedTime ?? 0,
          ...group.map((t) => t + (details.get(t)?.respawnDuration ?? 20)),
        ),
      ),
      proof: local && !objective ? 'signal' : 'observed',
      priority: objective ? 90 : local ? 75 : group.length > 1 ? 65 : 40,
      deathTimes: group,
      objective,
      damage: damage ?? undefined,
      evidence,
      signals: [
        ...(group.length > 1 ? ['cluster'] : []),
        ...(objective ? ['objective'] : []),
        ...(local ? ['proximity'] : []),
      ],
      focus: objective
        ? 'Votre mort recoupe la perte de l’objectif.'
        : local
          ? 'L’avantage numérique est visible dans le voisinage 2D.'
          : 'Les événements enregistrés permettent de revoir cette séquence.',
      question: objective
        ? 'Quelle réponse préparer avant la prochaine fenêtre d’objectif ?'
        : local
          ? 'Quel soutien était réellement disponible avant l’engagement ?'
          : 'Quel palier ou repositionnement aurait changé vos options ?',
      local,
    })
  }
  const refs = comparableHistory(match, history)
  if (!hasWarning(match, 'stats-') && refs.length >= MIN_REFERENCE_MATCHES) {
    const model = personalModel(refs, match.heroId)
    const dips = match.stats
      .filter((p) => p.time >= 300)
      .flatMap((p) => {
        const r = model.curve.find((r) => r.time === p.time && r.samples >= MIN_REFERENCE_MATCHES)
        return r && r.netWorth > 0 && (p.netWorth - r.netWorth) / r.netWorth < -0.2
          ? [{ p, r, gap: (p.netWorth - r.netWorth) / r.netWorth }]
          : []
      })
      .sort((a, b) => a.gap - b.gap)
    for (const dip of dips.slice(0, 2)) {
      if (moments.some((m) => Math.abs(m.time - dip.p.time) <= 120)) {
        const m = moments.find((m) => Math.abs(m.time - dip.p.time) <= 120)!
        m.economy = { actual: dip.p.netWorth, reference: dip.r.netWorth, gap: dip.gap }
        m.evidence.push({ label: 'Écart personnel', value: Math.round(dip.gap * 100), unit: '%' })
        continue
      }
      moments.push({
        id: `economy-${dip.p.time}`,
        kind: 'economy',
        title: 'Un écart au rythme habituel',
        time: dip.p.time,
        start: Math.max(0, dip.p.time - 60),
        end: Math.min(match.duration, dip.p.time + 60),
        proof: 'signal',
        priority: 55,
        deathTimes: [],
        evidence: [
          { label: 'Écart personnel', value: Math.round(dip.gap * 100), unit: '%' },
          { label: 'Patrimoine', value: dip.p.netWorth },
          { label: 'Référence', value: dip.r.netWorth },
        ],
        signals: ['economy'],
        focus: 'Votre patrimoine est sous votre référence à cet instant.',
        question: 'Le plan d’achat restait-il adapté à cette économie ?',
        economy: { actual: dip.p.netWorth, reference: dip.r.netWorth, gap: dip.gap },
      })
    }
  }
  for (const objective of hasWarning(match, 'stats-', 'objectives-')
    ? []
    : (match.objectives ?? [])) {
    const first = objective.firstDamageTime
    if (
      match.team === undefined ||
      objective.team !== match.team ||
      objective.type === 'midboss' ||
      first === undefined ||
      first <= 0 ||
      objective.destroyedTime - first > 90 ||
      objective.destroyedTime - first < 10
    )
      continue
    if (moments.some((m) => m.objective?.id === objective.id) || isDeadAt(match, first)) continue
    const farm = counterInterval(match.stats, 'neutralKills', first, objective.destroyedTime)
    if (!farm || farm.value < 1) continue
    moments.push({
      id: `priority-${objective.id}`,
      kind: 'priority',
      title: 'Camps et objectif dans la même fenêtre',
      time: farm.start,
      start: first,
      end: objective.destroyedTime,
      proof: 'signal',
      priority: 60,
      deathTimes: [],
      objective,
      evidence: [
        { label: 'Neutres éliminés', value: farm.value },
        { label: 'Fenêtre', value: objective.destroyedTime - first, unit: 's' },
        { label: objectiveLabel(objective), value: 1 },
      ],
      signals: ['farm', 'objective'],
      focus:
        'Des éliminations de neutres sont enregistrées pendant la pression récente sur l’objectif.',
      question: 'Quelle priorité comparer dans le contexte de votre équipe ?',
    })
  }
  // Merge overlapping signals into an existing death episode; do not count a death three times.
  const sorted = moments.sort((a, b) => b.priority - a.priority || a.time - b.time),
    result: ReviewMoment[] = []
  for (const moment of sorted) {
    const existing = result.find((m) =>
      m.kind === 'death' || m.kind === 'availability'
        ? moment.kind === 'priority' && moment.time <= m.end && moment.end >= m.start
        : false,
    )
    if (existing) {
      existing.signals = [...new Set([...existing.signals, ...moment.signals])]
      existing.evidence.push(
        ...moment.evidence.filter((e) => !existing.evidence.some((x) => x.label === e.label)),
      )
      continue
    }
    result.push(moment)
  }
  return result.slice(0, 18)
}

function inventoryForPeer(
  match: Match,
  peer: Peer,
  time: number,
): { items: Item[]; unknown: number } | null {
  if (peer.purchases === undefined) return null
  return inventoryAt({ ...match, accountId: peer.accountId, purchases: peer.purchases }, time)
}
const ANTI_HEAL = new Set(['upgrade_healbane', 'upgrade_toxic_bullets'])
const SUSTAIN = new Set([
  'upgrade_vampire',
  'upgrade_health_stealing_magic',
  'upgrade_damage_recycler',
  'upgrade_healing_booster',
  'upgrade_resonant_healing',
  'upgrade_healbuff',
])
const CONTROL = new Set([
  'upgrade_target_stun',
  'upgrade_glitch',
  'upgrade_containment',
  'upgrade_greater_withering_whip',
  'upgrade_aoe_root',
])
function responseStatus(
  match: Match,
  time: number,
  itemIds: Set<string>,
): { status: BuildCase['teamResponse']; holderId?: number; items: string[] } {
  const own = inventoryAt(match, time),
    selfItems = own.items.filter((i) => itemIds.has(i.id))
  if (selfItems.length)
    return { status: 'equipped', holderId: match.accountId, items: selfItems.map((i) => i.id) }
  const allies = match.peers.filter((p) => match.team !== undefined && p.team === match.team)
  for (const peer of allies) {
    const inv = inventoryForPeer(match, peer, time),
      found = inv?.items.filter((i) => itemIds.has(i.id))
    if (found?.length)
      return { status: 'equipped', holderId: peer.accountId, items: found.map((i) => i.id) }
  }
  return {
    status:
      match.inventoryRecorded &&
      own.unknown === 0 &&
      allies.length === 5 &&
      allies.every(
        (p) => p.purchases !== undefined && inventoryForPeer(match, p, time)?.unknown === 0,
      )
        ? 'not-recorded'
        : 'unknown',
    items: [],
  }
}
function makeOptions(
  match: Match,
  time: number,
  candidates: string[],
  effectKey: string,
  condition: string,
  actualPurchase?: BuildCase['actualPurchase'],
): BuildCase['options'] {
  const owned = inventoryAt(match, time - 0.001)
  if (owned.unknown) return []
  return candidates
    .flatMap((id) => {
      const item = itemById.get(id)
      if (!item || owned.items.some((i) => i.id === id)) return []
      const cost = purchase(item, owned.items).cost
      return [
        {
          itemId: id,
          cost,
          difference: actualPurchase ? cost - actualPurchase.cost : null,
          effect: Math.abs(item.properties[effectKey] ?? 0),
          unit: effectKey === 'BonusHealth' ? 'PV' : '%',
          condition:
            id === 'upgrade_healbane'
              ? 'Dégâts Spirit sur la cible'
              : id === 'upgrade_toxic_bullets'
                ? 'Accumulation de tirs sur la cible'
                : condition,
        },
      ]
    })
    .sort((a, b) => a.cost - b.cost)
}
export function reviewBuild(match: Match, moments: ReviewMoment[]): BuildCase[] {
  if (
    hasWarning(match, 'inventory-', 'players-') ||
    match.mode !== 1 ||
    match.inventoryRecorded !== true
  )
    return []
  const cases: BuildCase[] = [],
    seen = new Set<string>()
  const times = [
    ...new Set([
      ...shopPurchases(match.purchases)
        .filter((p) => !hasUnsupportedItemUpgrade(p))
        .map((p) => p.time),
      ...moments.map((m) => m.time),
    ]),
  ].sort((a, b) => a - b)
  for (const time of times) {
    const owned = inventoryAt(match, time - 0.001)
    if (owned.unknown) continue
    const bought = shopPurchases(match.purchases).find(
        (p) => p.time === time && !hasUnsupportedItemUpgrade(p),
      ),
      actualItem = bought && itemByApiId.get(bought.itemId)
    const actualPurchase = actualItem
      ? { itemId: actualItem.id, cost: purchase(actualItem, owned.items).cost, time }
      : undefined
    const priceVersion =
      match.clientVersion === undefined
        ? 'unknown'
        : match.clientVersion === source.version
          ? 'same'
          : 'different'
    for (const peer of match.peers) {
      if (match.team === undefined || peer.team === undefined || peer.team === match.team) continue
      const inv = inventoryForPeer(match, peer, time - 0.001),
        recent = [...peer.stats].reverse().find((s) => s.time <= time && time - s.time <= 60)
      let healing: { value: number; start: number; end: number } | null = null
      if (recent)
        healing = counterInterval(
          peer.stats,
          'selfHealing',
          Math.max(0, recent.time - 120),
          recent.time,
        )
      const sustainItems = inv?.items.filter((i) => SUSTAIN.has(i.id)) ?? []
      const healingKey = `healing-${peer.accountId}`
      if (!seen.has(healingKey) && ((healing?.value ?? 0) >= 250 || sustainItems.length > 0)) {
        const response = responseStatus(match, time - 0.001, ANTI_HEAL),
          options = makeOptions(
            match,
            time,
            ['upgrade_healbane', 'upgrade_toxic_bullets'],
            'HealAmpReceivePenaltyPercent',
            'À appliquer sur la cible',
            actualPurchase,
          )
        cases.push({
          id: healingKey,
          kind: 'healing',
          title: 'Soins en face',
          time,
          targetId: peer.accountId,
          targetHero: peer.heroId,
          evidence:
            healing && healing.value >= 250
              ? [
                  { label: 'Auto-soins observés', value: healing.value },
                  { label: 'Fenêtre', value: healing.end - healing.start, unit: 's' },
                ]
              : [{ label: 'Objets de sustain', value: sustainItems.length }],
          enemyItems: sustainItems.map((i) => i.id),
          responseItems: response.items,
          teamResponse: response.status,
          holderId: response.holderId,
          actualPurchase,
          options,
          priceVersion,
        })
        seen.add(healingKey)
      }
      const controls = inv?.items.filter((i) => CONTROL.has(i.id)) ?? [],
        controlKey = `control-${peer.accountId}`
      if (controls.length && !seen.has(controlKey)) {
        const response = responseStatus(
          match,
          time - 0.001,
          new Set([
            'upgrade_debuff_reducer',
            'upgrade_unstoppable',
            'upgrade_reduce_debuff_duration',
          ]),
        )
        cases.push({
          id: controlKey,
          kind: 'control',
          title: 'Contrôle équipé',
          time,
          targetId: peer.accountId,
          targetHero: peer.heroId,
          evidence: [{ label: 'Actifs adverses', value: controls.length }],
          enemyItems: controls.map((i) => i.id),
          responseItems: response.items,
          teamResponse: response.status,
          holderId: response.holderId,
          actualPurchase,
          options: makeOptions(
            match,
            time,
            ['upgrade_debuff_reducer'],
            'StatusResistancePercent',
            'Selon l’effet de contrôle',
            actualPurchase,
          ),
          priceVersion,
        })
        seen.add(controlKey)
      }
    }
  }
  for (const moment of moments) {
    const dominant = moment.damage?.actors[0]
    if (
      !dominant ||
      !dominant.accountId ||
      dominant.damage < 400 ||
      dominant.damage / moment.damage!.total < 0.5
    )
      continue
    const key = `pressure-${dominant.accountId}`
    if (seen.has(key)) continue
    const peer = match.peers.find((p) => p.accountId === dominant.accountId)!
    const time = moment.time
    const inv = inventoryForPeer(match, peer, time - 0.001)
    cases.push({
      id: key,
      kind: 'pressure',
      title: 'Pression concentrée',
      time,
      targetId: peer.accountId,
      targetHero: peer.heroId,
      evidence: [
        { label: 'Dégâts reçus de cet adversaire', value: dominant.damage },
        {
          label: 'Part des sources relevées',
          value: Math.round((dominant.damage / moment.damage!.total) * 100),
          unit: '%',
        },
      ],
      enemyItems: inv?.items.map((i) => i.id) ?? [],
      responseItems: [],
      teamResponse: 'unknown',
      options: makeOptions(
        match,
        time,
        ['upgrade_health'],
        'BonusHealth',
        'Réserve de PV, dégâts non typés',
      ),
      priceVersion:
        match.clientVersion === source.version
          ? 'same'
          : match.clientVersion
            ? 'different'
            : 'unknown',
    })
    seen.add(key)
  }
  const involved = new Set(moments.flatMap((m) => m.damage?.actors.map((a) => a.accountId) ?? []))
  const priority = (c: BuildCase) =>
    (c.teamResponse === 'equipped' ? 0 : 100) +
    (involved.has(c.targetId) ? 50 : 0) +
    (c.kind === 'pressure' ? 0 : 10)
  const perKind = new Map<string, number>()
  return cases
    .sort((a, b) => priority(b) - priority(a) || a.time - b.time)
    .filter((c) => {
      const count = perKind.get(c.kind) ?? 0
      if (count >= 2) return false
      perKind.set(c.kind, count + 1)
      return true
    })
    .slice(0, 6)
}
function wealthAt(stats: StatPoint[], time: number): number | null {
  if (!stats.length) return null
  const i = stats.findIndex((p) => p.time >= time)
  if (i < 0 || time < stats[0].time) return null
  if (stats[i].time === time) return stats[i].netWorth
  const gaps = stats
    .slice(1)
    .map((p, j) => p.time - stats[j].time)
    .filter((n) => n > 0)
  const cadence = stats.length >= 3 ? median(gaps) : null
  const maxGap = Math.min(600, Math.max(120, (cadence ?? 0) * 1.5))
  if (i === 0 || stats[i].time - stats[i - 1].time > maxGap) return null
  return interpolate(stats, time)
}
export function teamAdvantage(match: Match): AdvantagePoint[] {
  if (hasWarning(match, 'players-', 'stats-') || match.mode !== 1 || match.team === undefined)
    return []
  const actors = actorsOf(match),
    ids = new Set(actors.map((a) => a.accountId))
  if (
    ids.size !== 12 ||
    actors.filter((a) => a.team === 0).length !== 6 ||
    actors.filter((a) => a.team === 1).length !== 6
  )
    return []
  const result: AdvantagePoint[] = []
  for (let time = 0; time <= match.duration; time += 30) {
    const values = actors.map((a) => ({ team: a.team, value: wealthAt(a.stats, time) }))
    if (values.some((v) => v.value === null)) continue
    const own = values.filter((v) => v.team === match.team).reduce((n, v) => n + v.value!, 0),
      enemy = values.filter((v) => v.team !== match.team).reduce((n, v) => n + v.value!, 0)
    if (own + enemy <= 0) continue
    result.push({ time, share: (own / (own + enemy)) * 100, own, enemy })
  }
  return result
}
export function createReview(match: Match, history: Match[]): ReviewReport {
  const overview = reviewOverview(match, history),
    moments = reviewMoments(match, history),
    build = reviewBuild(match, moments),
    advantage = teamAdvantage(match)
  return { version: REVIEW_VERSION, matchId: match.id, overview, moments, build, advantage }
}

export type ScenePlayer = {
  id: string
  label: string
  heroId: number
  team?: number
  x: number
  y: number
  observedAt: number
  health?: number
}
/** No future trajectories or death locations are borrowed to populate an earlier frame. */
export function actorPositionAt(
  actor: Pick<Peer, 'positions' | 'deathDetails' | 'deathTimes'>,
  time: number,
  maxAge = POSITION_AGE,
): PositionSample | undefined {
  if (isDeadAt(actor, time)) return undefined
  const p = positionAt(actor.positions, time, maxAge)
  if (!p) return undefined
  const deaths = [...(actor.deathTimes ?? []), ...(actor.deathDetails ?? []).map((d) => d.time)]
  return deaths.some((t) => t >= p.time && t <= time) ? undefined : p
}
export function sceneAt(match: Match, time: number) {
  if (hasWarning(match, 'players-')) return { players: [], trails: [], death: undefined }
  const actors = actorsOf(match),
    players: ScenePlayer[] = [],
    trails: { id: string; points: PositionSample[] }[] = []
  for (const actor of actors) {
    const points = actor.positions?.filter((p) => p.time <= time && p.time >= time - 24) ?? []
    let segment: PositionSample[] = []
    const flush = () => {
      if (segment.length) trails.push({ id: String(actor.accountId), points: segment })
      segment = []
    }
    const deaths = [...(actor.deathTimes ?? []), ...(actor.deathDetails ?? []).map((d) => d.time)]
    for (const point of points) {
      if (
        point.alive === false ||
        point.health === 0 ||
        !Number.isFinite(point.x) ||
        !Number.isFinite(point.y)
      ) {
        flush()
        continue
      }
      const prev = segment.at(-1)
      if (prev && deaths.some((t) => t >= prev.time && t <= point.time)) flush()
      segment.push(point)
    }
    flush()
    const p = actorPositionAt(actor, time, 12)
    if (p)
      players.push({
        id: String(actor.accountId),
        label: actor.accountId === match.accountId ? 'Vous' : `#${actor.heroId}`,
        heroId: actor.heroId,
        team: actor.team,
        x: p.x,
        y: p.y,
        observedAt: p.time,
        health: p.health,
      })
  }
  const exactDeath = match.deathDetails?.find(
    (d) => d.time <= time && Math.abs(d.time - time) < 0.01,
  )
  if (exactDeath?.killerPosition && exactDeath.killerSlot !== undefined) {
    const killer = actors.find((a) => a.playerSlot === exactDeath.killerSlot)
    if (killer) {
      const observation: ScenePlayer = {
        id: String(killer.accountId),
        label: `#${killer.heroId}`,
        heroId: killer.heroId,
        team: killer.team,
        x: exactDeath.killerPosition.x,
        y: exactDeath.killerPosition.y,
        observedAt: exactDeath.time,
      }
      const index = players.findIndex((p) => p.id === observation.id)
      if (index < 0) players.push(observation)
      else players[index] = observation
    }
  }
  return { players, trails, death: exactDeath?.position }
}
