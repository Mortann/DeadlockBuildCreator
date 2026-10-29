import type {
  Match,
  StatPoint,
  Profile,
  PersonalModel,
  Purchase,
  Peer,
  WorldPosition,
  PositionSample,
  DeathEvent,
  ObjectiveEvent,
  CombatSeries,
} from './types'
import { shopPurchases } from './purchaseRows'

type Dict = Record<string, unknown>
type Warn = (code: string) => void
const quiet: Warn = () => {}
function bounded(value: unknown, limit: number, warn: Warn, code: string): unknown[] {
  const values = list(value)
  if (values.length > limit) warn(`${code}-truncated`)
  return values.slice(0, limit)
}
const object = (v: unknown): Dict =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Dict) : {}
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const finite = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined
const number = (v: unknown, fallback = 0) => finite(v) ?? fallback
const integer = (v: unknown, max = 4294967295): number | undefined => {
  const n = finite(v)
  return n !== undefined && Number.isInteger(n) && n <= max ? n : undefined
}
const teamOf = (v: unknown): number | undefined => (v === 0 || v === 1 ? v : undefined)
const slotOf = (v: unknown) => integer(v, 63)
const coordinate = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 1e6 ? v : undefined
const identifier = (v: unknown) => {
  if (typeof v === 'string' && /^[1-9]\d{0,19}$/.test(v)) return v
  return typeof v === 'number' && Number.isSafeInteger(v) && v > 0 ? String(v) : ''
}
const gameTime = (v: unknown, duration: number) => {
  const t = finite(v)
  return t !== undefined && t <= duration ? t : undefined
}
const counter = (v: unknown) => {
  const n = finite(v)
  return n !== undefined && n <= 1e12 ? n : undefined
}
const optionalMetrics = {
  shotsHit: 'shots_hit',
  shotsMissed: 'shots_missed',
  damage: 'player_damage',
  deaths: 'deaths',
  kills: 'kills',
  assists: 'assists',
  damageTaken: 'player_damage_taken',
  healing: 'player_healing',
  selfHealing: 'self_healing',
  objectiveDamage: 'boss_damage',
  creepDamage: 'creep_damage',
  neutralDamage: 'neutral_damage',
  creepKills: 'creep_kills',
  neutralKills: 'neutral_kills',
  goldLane: 'gold_lane_creep',
  goldLaneOrbs: 'gold_lane_creep_orbs',
  goldNeutral: 'gold_neutral_creep',
  goldNeutralOrbs: 'gold_neutral_creep_orbs',
  goldPlayers: 'gold_player',
  goldPlayerOrbs: 'gold_player_orbs',
  goldObjectives: 'gold_boss',
  goldObjectiveOrbs: 'gold_boss_orb',
  goldDeathLoss: 'gold_death_loss',
  level: 'level',
  maxHealth: 'max_health',
  weaponPower: 'weapon_power',
  spiritPower: 'tech_power',
  heroShotsHit: 'hero_bullets_hit',
  heroCritShotsHit: 'hero_bullets_hit_crit',
  healingPrevented: 'heal_prevented',
  healingLost: 'heal_lost',
  damageMitigated: 'damage_mitigated',
  damageAbsorbed: 'damage_absorbed',
  teammateHealing: 'teammate_healing',
  teammateBarriering: 'teammate_barriering',
} satisfies Record<Exclude<keyof StatPoint, 'time' | 'netWorth'>, string>

export function accountIdFromInput(value: string): number {
  const clean = value
    .trim()
    .replace(/^https:\/\/steamcommunity\.com\/profiles\/(\d+)\/?(?:\?.*)?$/i, '$1')
  if (!/^\d+$/.test(clean)) throw new Error('Saisissez un account_id ou un SteamID64 numérique.')
  let id = BigInt(clean)
  if (id >= 76561197960265728n) id -= 76561197960265728n
  if (id <= 0 || id > 4294967295n)
    throw new Error('Cet identifiant Steam est hors de la plage attendue.')
  return Number(id)
}

function worldPosition(value: unknown): WorldPosition | undefined {
  const v = object(value),
    x = coordinate(v.x),
    y = coordinate(v.y),
    z = coordinate(v.z)
  if (x === undefined || y === undefined) return undefined
  return z === undefined ? { x, y } : { x, y, z }
}

function statPoints(value: unknown, duration: number, warn: Warn = quiet): StatPoint[] {
  const points = new Map<number, StatPoint>()
  for (const raw of bounded(value, 1000, warn, 'stats')) {
    const s = object(raw),
      time = gameTime(s.time_stamp_s, duration),
      netWorth = finite(s.net_worth)
    // The legacy economic series requires an observed net worth; never manufacture zero.
    if (time === undefined || netWorth === undefined || netWorth > 1e7) {
      warn('stats-invalid')
      continue
    }
    if (points.has(time)) warn('stats-duplicate-time')
    const metrics: Partial<Record<keyof StatPoint, number>> = {}
    for (const [target, key] of Object.entries(optionalMetrics)) {
      const n = counter(s[key])
      if (n !== undefined) metrics[target as keyof StatPoint] = n
      else if (s[key] !== undefined && s[key] !== null) warn('stats-invalid-counter')
    }
    points.set(time, { ...points.get(time), ...metrics, time, netWorth })
  }
  return [...points.values()].sort((a, b) => a.time - b.time)
}

function purchasesOf(value: unknown, duration: number, warn: Warn = quiet): Purchase[] | undefined {
  if (!Array.isArray(value)) return undefined
  return bounded(value, 1000, warn, 'inventory')
    .flatMap((raw) => {
      const v = object(raw),
        itemId = identifier(v.item_id),
        time = gameTime(v.game_time_s, duration)
      if (!itemId || time === undefined) {
        warn('inventory-invalid')
        return []
      }
      const sold = gameTime(v.sold_time_s, duration)
      if (v.sold_time_s !== undefined && v.sold_time_s !== 0 && (sold === undefined || sold < time))
        warn('inventory-invalid-sale')
      return [
        {
          itemId,
          time,
          soldTime: sold !== undefined && sold > 0 && sold >= time ? sold : undefined,
          upgradeInfo: integer(v.upgrade_info),
        },
      ]
    })
    .sort((a, b) => a.time - b.time)
}

function deathsOf(value: unknown, duration: number, warn: Warn = quiet): DeathEvent[] | undefined {
  if (!Array.isArray(value)) return undefined
  const seen = new Set<number>()
  return bounded(value, 500, warn, 'deaths')
    .flatMap((raw) => {
      const v = object(raw),
        time = gameTime(v.game_time_s, duration)
      if (time === undefined) {
        warn('deaths-invalid')
        return []
      }
      if (seen.has(time)) {
        warn('deaths-duplicate-time')
        return []
      }
      seen.add(time)
      const respawn = finite(v.death_duration_s),
        ttk = finite(v.time_to_kill_s)
      if (v.death_duration_s !== undefined && (respawn === undefined || respawn > 600))
        warn('deaths-invalid-respawn')
      if (
        v.time_to_kill_s !== undefined &&
        v.time_to_kill_s !== -1 &&
        (ttk === undefined || ttk > 600)
      )
        warn('deaths-invalid-time-to-kill')
      return [
        {
          time,
          position: worldPosition(v.death_pos),
          killerPosition: worldPosition(v.killer_pos),
          killerSlot: slotOf(v.killer_player_slot),
          respawnDuration: respawn !== undefined && respawn <= 600 ? respawn : undefined,
          timeToKill: ttk !== undefined && ttk <= 600 ? ttk : undefined,
        },
      ]
    })
    .sort((a, b) => a.time - b.time)
}

/** Preserve the source clock. Zero-health samples invalidate older positions; their coordinates are not a death location. */
function decodePaths(
  value: unknown,
  duration: number,
  warn: Warn = quiet,
): { interval?: number; bySlot: Map<number, PositionSample[]> } {
  const raw = object(value),
    interval = finite(raw.interval_s)
  const xResolution = integer(raw.x_resolution, 1e8),
    yResolution = integer(raw.y_resolution, 1e8)
  const bySlot = new Map<number, PositionSample[]>()
  if (value === undefined || value === null) return { bySlot }
  if (interval === undefined || interval < 0.05 || interval > 300 || !xResolution || !yResolution) {
    warn('paths-invalid-header')
    return { bySlot }
  }
  const duplicates = new Set<number>()
  for (const value of bounded(raw.paths, 64, warn, 'paths')) {
    const p = object(value),
      slot = slotOf(p.player_slot)
    const xMin = coordinate(p.x_min),
      yMin = coordinate(p.y_min),
      xMax = coordinate(p.x_max),
      yMax = coordinate(p.y_max)
    if (
      slot === undefined ||
      xMin === undefined ||
      yMin === undefined ||
      xMax === undefined ||
      yMax === undefined ||
      xMin > xMax ||
      yMin > yMax
    ) {
      warn('paths-invalid-player')
      continue
    }
    if (bySlot.has(slot) || duplicates.has(slot)) {
      warn('paths-duplicate-slot')
      bySlot.delete(slot)
      duplicates.add(slot)
      continue
    }
    const xs = list(p.x_pos),
      ys = list(p.y_pos),
      health = list(p.health),
      combat = list(p.combat_type),
      move = list(p.move_type)
    const count = Math.min(xs.length, ys.length, 21601, Math.floor(duration / interval) + 1)
    if (xs.length !== ys.length) warn('paths-length-mismatch')
    if (Math.min(xs.length, ys.length) > 21601) warn('paths-samples-truncated')
    const samples: PositionSample[] = []
    for (let i = 0; i < count; i++) {
      const x = integer(xs[i], xResolution),
        y = integer(ys[i], yResolution)
      if (x === undefined || y === undefined) {
        warn('paths-invalid-sample')
        continue
      }
      const hp = integer(health[i], 100)
      if (i < health.length && hp === undefined) {
        warn('paths-invalid-health')
        continue
      }
      const point: PositionSample = {
        time: i * interval,
        x: xMin + (x / xResolution) * (xMax - xMin),
        y: yMin + (y / yResolution) * (yMax - yMin),
      }
      if (hp !== undefined) {
        point.health = hp
        point.alive = hp > 0
      }
      const combatType = integer(combat[i], 3),
        moveType = integer(move[i], 8)
      if (combatType !== undefined) point.combatType = combatType
      if (moveType !== undefined) point.moveType = moveType
      samples.push(point)
    }
    const existing = bySlot.get(slot)
    if (!existing || samples.length > existing.length) bySlot.set(slot, samples)
  }
  return { interval, bySlot }
}

function objectiveKind(id: number | undefined): Pick<ObjectiveEvent, 'type' | 'lane'> {
  if (id === undefined) return { type: 'unknown' }
  if (id === 0) return { type: 'core' }
  if (id >= 1 && id <= 4) return { type: 'guardian', lane: id }
  if (id >= 5 && id <= 8) return { type: 'walker', lane: id - 4 }
  if (id === 9) return { type: 'titan' }
  if (id === 10 || id === 11) return { type: 'shrine' }
  if (id >= 12 && id <= 15) return { type: 'barracks', lane: id - 11 }
  return { type: 'unknown' }
}

function objectivesOf(
  value: unknown,
  midBoss: unknown,
  duration: number,
  warn: Warn = quiet,
): ObjectiveEvent[] | undefined {
  if (!Array.isArray(value) && !Array.isArray(midBoss)) return undefined
  const result: ObjectiveEvent[] = []
  for (const [i, raw] of bounded(value, 100, warn, 'objectives').entries()) {
    const v = object(raw),
      destroyedTime = gameTime(v.destroyed_time_s, duration)
    if (destroyedTime === undefined) {
      warn('objectives-invalid-time')
      continue
    }
    if (destroyedTime === 0) continue
    const legacyId = integer(v.legacy_objective_id, 32),
      teamObjectiveId = integer(v.team_objective_id, 15)
    if (legacyId === undefined && teamObjectiveId === undefined) {
      warn('objectives-invalid-id')
      continue
    }
    const explicitTeam = teamOf(v.team),
      legacyTeam = legacyId !== undefined && legacyId < 32 ? Math.floor(legacyId / 16) : undefined
    // A contradictory team is unknown rather than a confidently wrong attribution.
    const team =
      legacyId === 32 ||
      (explicitTeam !== undefined && legacyTeam !== undefined && explicitTeam !== legacyTeam)
        ? undefined
        : (explicitTeam ?? legacyTeam)
    if (explicitTeam !== undefined && legacyTeam !== undefined && explicitTeam !== legacyTeam)
      warn('objectives-conflicting-team')
    if (
      legacyId !== undefined &&
      legacyId < 32 &&
      teamObjectiveId !== undefined &&
      teamObjectiveId !== legacyId % 16
    ) {
      warn('objectives-conflicting-id')
      continue
    }
    const baseId =
      teamObjectiveId ?? (legacyId !== undefined && legacyId < 32 ? legacyId % 16 : undefined)
    const first = gameTime(v.first_damage_time_s, destroyedTime)
    if (v.first_damage_time_s !== undefined && first === undefined)
      warn('objectives-invalid-first-damage')
    result.push({
      id: `objective-${team ?? 'unknown'}-${baseId ?? legacyId}-${i}`,
      destroyedTime,
      team,
      legacyId,
      teamObjectiveId,
      firstDamageTime: first,
      ...(legacyId === 32 ? { type: 'midboss' as const } : objectiveKind(baseId)),
    })
  }
  for (const [i, raw] of bounded(midBoss, 50, warn, 'midboss').entries()) {
    const v = object(raw),
      destroyedTime = gameTime(v.destroyed_time_s, duration)
    if (destroyedTime === undefined || destroyedTime === 0) continue
    // Team is ownership for buildings. A neutral midboss's killer/claimant isn't ownership.
    result.push({ id: `midboss-${i}`, destroyedTime, type: 'midboss' })
  }
  return result.sort((a, b) => a.destroyedTime - b.destroyedTime)
}

const matrixTypes: CombatSeries['statType'][] = [
  'damage',
  'healing',
  'healingPrevented',
  'damageMitigated',
  'lethalDamage',
  'regen',
  'crowdControl',
  'damageMitigatedBySource',
]
function damageMatrixOf(
  value: unknown,
  duration: number,
  warn: Warn = quiet,
): CombatSeries[] | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const matrix = object(value),
    times = bounded(matrix.sample_time_s, 5000, warn, 'combat-times')
  const details = object(matrix.source_details),
    names = list(details.source_name),
    types = list(details.stat_type)
  if (!Array.isArray(matrix.sample_time_s) || !Array.isArray(matrix.damage_dealers)) {
    warn('combat-invalid-header')
    return undefined
  }
  if (!times.length) return []
  const result: CombatSeries[] = []
  const counts = new Map<string, number>()
  for (const raw of bounded(matrix.damage_dealers, 64, warn, 'combat-dealers')) {
    const dealer = object(raw),
      dealerSlot = slotOf(dealer.dealer_player_slot)
    if (dealerSlot === undefined) {
      warn('combat-invalid-dealer')
      continue
    }
    for (const rawSource of bounded(dealer.damage_sources, 500, warn, 'combat-sources')) {
      const source = object(rawSource),
        sourceIndex = integer(source.source_details_index, 10000)
      if (sourceIndex === undefined) {
        warn('combat-invalid-source')
        continue
      }
      const typeIndex = integer(types[sourceIndex], matrixTypes.length - 1)
      if (typeIndex === undefined) {
        warn('combat-invalid-type')
        continue
      }
      const name = names[sourceIndex],
        sourceName =
          typeof name === 'string' && name.length <= 256 && name.length ? name : undefined
      for (const rawTarget of bounded(source.damage_to_players, 64, warn, 'combat-targets')) {
        const target = object(rawTarget),
          targetSlot = slotOf(target.target_player_slot),
          values = list(target.damage)
        if (targetSlot === undefined) {
          warn('combat-invalid-target')
          continue
        }
        // Valve emits shorter cumulative arrays. Their final total is useful, but
        // the temporal alignment is not documented: do not invent timestamps.
        const complete = values.length === list(matrix.sample_time_s).length
        if (values.length > list(matrix.sample_time_s).length) {
          warn('combat-length-mismatch')
          continue
        }
        if (
          values.some(
            (v, i) =>
              counter(v) === undefined || (i > 0 && (v as number) < (values[i - 1] as number)),
          )
        ) {
          warn('combat-invalid-series')
          continue
        }
        if (!complete) {
          if (values.length) {
            const key = `${dealerSlot}:${targetSlot}:${typeIndex}:${sourceName ?? ''}`
            counts.set(key, (counts.get(key) ?? 0) + 1)
            if (counts.get(key)! > 1) warn('combat-duplicate-series')
            result.push({
              dealerSlot,
              targetSlot,
              sourceName,
              statType: matrixTypes[typeIndex],
              samples: [],
              total: values.at(-1) as number,
              timing: 'sparse',
            })
          }
          continue
        }
        const samples: CombatSeries['samples'] = []
        let invalid = false
        for (let i = 0; i < Math.min(times.length, values.length); i++) {
          const time = gameTime(times[i], duration),
            value = counter(values[i])
          if (time === undefined || value === undefined) {
            invalid = true
            break
          }
          const previous = samples.at(-1)
          if (previous && (time <= previous.time || value < previous.value)) {
            invalid = true
            break
          }
          samples.push({ time, value })
        }
        if (invalid) warn('combat-invalid-series')
        if (!invalid && samples.length) {
          const key = `${dealerSlot}:${targetSlot}:${typeIndex}:${sourceName ?? ''}`
          counts.set(key, (counts.get(key) ?? 0) + 1)
          if (counts.get(key)! > 1) warn('combat-duplicate-series')
          result.push({
            dealerSlot,
            targetSlot,
            sourceName,
            statType: matrixTypes[typeIndex],
            samples,
          })
        }
      }
    }
  }
  return result.filter(
    (s) =>
      counts.get(
        `${s.dealerSlot}:${s.targetSlot}:${matrixTypes.indexOf(s.statType)}:${s.sourceName ?? ''}`,
      ) === 1,
  )
}

function parseHistory(raw: unknown, accountId: number, source: Match['source']): Match | null {
  const h = object(raw),
    id = identifier(h.match_id),
    heroId = integer(h.hero_id),
    duration = finite(h.match_duration_s)
  if (!id || h.account_id !== accountId || !heroId || !duration || duration > 21600) return null
  return {
    id,
    accountId,
    heroId,
    startTime: number(h.start_time),
    duration,
    netWorth: number(h.net_worth),
    kills: number(h.player_kills),
    deaths: number(h.player_deaths),
    assists: number(h.player_assists),
    outcome:
      h.player_match_outcome === 1 ? 'win' : h.player_match_outcome === 2 ? 'loss' : 'unknown',
    stats: [],
    purchases: [],
    deathTimes: [],
    peers: [],
    team: teamOf(h.player_team),
    mode: number(h.game_mode),
    abandoned: number(h.abandoned_time_s) > 0,
    source,
  }
}

function parseMetadata(raw: unknown, accountId: number, source: Match['source']): Match | null {
  const root = object(raw),
    info = object(root.match_info ?? object(root.match_metadata).match_info)
  const id = identifier(info.match_id),
    warnings = new Set<string>(),
    warn: Warn = (code) => {
      warnings.add(code)
    },
    seenAccounts = new Set<number>(),
    players = bounded(info.players, 64, warn, 'players')
      .map(object)
      .filter((p) => {
        const id = integer(p.account_id)
        if (!id) {
          warn('players-invalid-account')
          return false
        }
        if (seenAccounts.has(id)) {
          warn('players-duplicate-account')
          return false
        }
        seenAccounts.add(id)
        return true
      })
  const self = players.find((p) => p.account_id === accountId),
    duration = finite(info.duration_s),
    heroId = self && integer(self.hero_id)
  if (!id || !self || !heroId || !duration || duration > 21600) return null
  const slotCounts = new Map<number, number>()
  for (const p of players) {
    const slot = slotOf(p.player_slot)
    if (slot !== undefined) slotCounts.set(slot, (slotCounts.get(slot) ?? 0) + 1)
  }
  const uniqueSlot = (value: unknown) => {
    const slot = slotOf(value)
    if (slot !== undefined && slotCounts.get(slot)! > 1) {
      warn('players-duplicate-slot')
      return undefined
    }
    return slot
  }
  const paths = decodePaths(info.match_paths, duration, warn)
  const playerSlot = uniqueSlot(self.player_slot),
    purchases = purchasesOf(self.items, duration, warn),
    deathDetails = deathsOf(self.death_details, duration, warn)
  const peers: Peer[] = players
    .filter((p) => p.account_id !== accountId)
    .flatMap((p) => {
      const peerId = integer(p.account_id),
        heroId = integer(p.hero_id)
      if (!peerId || !heroId) return []
      const slot = uniqueSlot(p.player_slot),
        deaths = deathsOf(p.death_details, duration, warn)
      return [
        {
          accountId: peerId,
          team: teamOf(p.team),
          heroId,
          netWorth: number(p.net_worth),
          stats: statPoints(p.stats, duration, warn),
          playerSlot: slot,
          assignedLane: integer(p.assigned_lane, 64),
          positions: slot === undefined ? undefined : paths.bySlot.get(slot),
          purchases: purchasesOf(p.items, duration, warn),
          deathTimes: deaths?.map((d) => d.time),
          deathDetails: deaths,
          kills: counter(p.kills),
          deaths: counter(p.deaths),
          assists: counter(p.assists),
        },
      ]
    })
  const team = teamOf(self.team),
    winner = teamOf(info.winning_team)
  const outcome =
    info.not_scored === true
      ? 'unknown'
      : self.player_match_outcome === 1
        ? 'win'
        : self.player_match_outcome === 2
          ? 'loss'
          : info.match_outcome === 0 && team !== undefined && winner !== undefined
            ? team === winner
              ? 'win'
              : 'loss'
            : 'unknown'
  const clientVersion = integer(info.client_version ?? root.client_version)
  return {
    id,
    accountId,
    heroId,
    startTime: number(info.start_time),
    duration,
    outcome,
    netWorth: number(self.net_worth),
    kills: number(self.kills),
    deaths: number(self.deaths),
    assists: number(self.assists),
    stats: statPoints(self.stats, duration, warn),
    purchases: purchases ?? [],
    inventoryRecorded: purchases !== undefined ? true : undefined,
    deathTimes: deathDetails?.map((d) => d.time) ?? [],
    deathDetails,
    peers,
    team,
    mode: number(info.game_mode),
    abandoned: number(self.abandon_match_time_s) > 0,
    source,
    playerSlot,
    assignedLane: integer(self.assigned_lane, 64),
    clientVersion: clientVersion && clientVersion > 0 ? clientVersion : undefined,
    positions: playerSlot === undefined ? undefined : paths.bySlot.get(playerSlot),
    positionInterval: paths.interval,
    objectives: objectivesOf(info.objectives, info.mid_boss, duration, warn),
    damageMatrix: damageMatrixOf(info.damage_matrix, duration, warn),
    telemetryWarnings: [...warnings].sort(),
    telemetryVersion: 2,
  }
}

function mergePeer(previous: Peer, incoming: Peer): Peer {
  const supplied = Object.fromEntries(Object.entries(incoming).filter(([, v]) => v !== undefined))
  return {
    ...previous,
    ...supplied,
    stats: incoming.stats.length ? incoming.stats : previous.stats,
    positions: incoming.positions?.length ? incoming.positions : previous.positions,
    purchases: incoming.purchases ?? previous.purchases,
    deathTimes: incoming.deathTimes ?? previous.deathTimes,
    deathDetails: incoming.deathDetails ?? previous.deathDetails,
  } as Peer
}

export function mergeMatches(existing: Match[], incoming: Match[]): Match[] {
  const map = new Map(existing.map((m) => [m.id, m]))
  for (const m of incoming) {
    const old = map.get(m.id)
    if (!old || old.accountId !== m.accountId) {
      map.set(m.id, m)
      continue
    }
    const peers = new Map(old.peers.map((p) => [p.accountId, p]))
    for (const peer of m.peers)
      peers.set(
        peer.accountId,
        peers.has(peer.accountId) ? mergePeer(peers.get(peer.accountId)!, peer) : peer,
      )
    const supplied = Object.fromEntries(Object.entries(m).filter(([, v]) => v !== undefined))
    const ambiguousActors = m.telemetryWarnings?.some(
      (code) => code === 'players-duplicate-slot' || code === 'players-duplicate-account',
    )
    map.set(m.id, {
      ...old,
      ...supplied,
      stats: m.stats.length ? m.stats : old.stats,
      purchases: m.inventoryRecorded
        ? m.purchases
        : m.purchases.length
          ? m.purchases
          : old.purchases,
      inventoryRecorded: m.inventoryRecorded ?? old.inventoryRecorded,
      deathTimes:
        m.deathDetails !== undefined
          ? m.deathTimes
          : m.deathTimes.length
            ? m.deathTimes
            : old.deathTimes,
      playerSlot: ambiguousActors ? undefined : (m.playerSlot ?? old.playerSlot),
      positions: ambiguousActors ? undefined : m.positions?.length ? m.positions : old.positions,
      peers: [...peers.values()].map((peer) =>
        ambiguousActors ? { ...peer, playerSlot: undefined, positions: undefined } : peer,
      ),
      // A merge retains old telemetry whenever the refresh omits it, so its warnings
      // must survive too. A clean replacement profile can discard the old snapshot.
      telemetryWarnings: [
        ...new Set([
          ...(old.telemetryWarnings ?? []).filter(
            (w) =>
              !(
                m.telemetryVersion === 2 &&
                m.damageMatrix !== undefined &&
                w === 'combat-length-mismatch'
              ) &&
              !(
                m.telemetryVersion === 2 &&
                m.deathDetails !== undefined &&
                w === 'deaths-invalid-time-to-kill'
              ),
          ),
          ...(m.telemetryWarnings ?? []),
        ]),
      ],
    } as Match)
  }
  return [...map.values()].sort((a, b) => b.startTime - a.startTime).slice(0, 5000)
}

/** Supports API history arrays, a raw metadata object, or {account_id, matches, metadata}. */
export function importPlayerData(
  raw: unknown,
  explicitAccount?: number,
  source: Match['source'] = 'import',
): Profile {
  const root = object(raw),
    history = Array.isArray(raw) ? raw : list(root.matches ?? root.history)
  const metadata =
    root.match_info || object(root.match_metadata).match_info
      ? [root]
      : Array.isArray(root.metadata)
        ? root.metadata
        : root.metadata
          ? [root.metadata]
          : []
  const declared = finite(root.account_id),
    ids = new Set(
      history.map((v) => finite(object(v).account_id)).filter((v): v is number => v !== undefined),
    )
  const accountId = explicitAccount ?? declared ?? (ids.size === 1 ? [...ids][0] : undefined)
  if (!accountId || !Number.isInteger(accountId) || accountId > 4294967295)
    throw new Error(
      'Indiquez le compte du joueur pour sélectionner ses données, notamment dans les métadonnées multi-joueurs.',
    )
  if (declared !== undefined && explicitAccount !== undefined && declared !== explicitAccount)
    throw new Error(
      'Ce fichier appartient à un autre compte. Changez le compte ou choisissez un autre fichier.',
    )
  if (history.length > 5000 || metadata.length > 100)
    throw new Error('Import limité à 5 000 matchs et 100 métadonnées par fichier.')
  const summaries = history
    .map((h) => parseHistory(h, accountId, source))
    .filter((m): m is Match => m !== null)
  const details = metadata
    .map((m) => parseMetadata(m, accountId, source))
    .filter((m): m is Match => m !== null)
  const matches = mergeMatches(summaries, details)
  if (!matches.length && !(source === 'api' && Array.isArray(raw) && raw.length === 0))
    throw new Error(
      'Aucune partie compatible pour ce compte. Utilisez un historique ou des métadonnées JSON de Deadlock API.',
    )
  return { accountId, matches, updatedAt: new Date().toISOString() }
}

export const median = (values: number[]): number | null => {
  const a = values.filter(Number.isFinite).sort((x, y) => x - y)
  return !a.length
    ? null
    : a.length % 2
      ? a[Math.floor(a.length / 2)]
      : (a[a.length / 2 - 1] + a[a.length / 2]) / 2
}
export function interpolate(points: StatPoint[], time: number): number | null {
  if (!points.length || time < points[0].time || time > points.at(-1)!.time) return null
  const right = points.findIndex((p) => p.time >= time)
  if (points[right].time === time || right === 0) return points[right].netWorth
  const a = points[right - 1],
    b = points[right]
  return a.netWorth + ((b.netWorth - a.netWorth) * (time - a.time)) / (b.time - a.time)
}

export function personalModel(matches: Match[], heroId: number): PersonalModel {
  const eligible = matches.filter(
    (m) => m.heroId === heroId && m.mode === 1 && !m.abandoned && m.duration >= 180,
  )
  const detailed = eligible.filter((m) => m.stats.length >= 2)
  const accuracySamples = eligible.flatMap((m) => {
    const s = [...m.stats]
      .reverse()
      .find(
        (s) =>
          s.shotsHit !== undefined && s.shotsMissed !== undefined && s.shotsHit + s.shotsMissed > 0,
      )
    return s ? [s] : []
  })
  const hit = accuracySamples.reduce((n, s) => n + s.shotsHit!, 0),
    missed = accuracySamples.reduce((n, s) => n + s.shotsMissed!, 0)
  const curve: PersonalModel['curve'] = []
  const last = Math.min(3600, Math.max(0, ...detailed.map((m) => m.stats.at(-1)!.time)))
  for (let time = 0; time <= last; time += 60) {
    const samples = detailed
      .map((m) => interpolate(m.stats, time))
      .filter((n): n is number => n !== null)
    const value = median(samples)
    if (value !== null) curve.push({ time, netWorth: value, samples: samples.length })
  }
  return {
    matches: eligible.length,
    detailed: detailed.length,
    accuracy: hit + missed > 0 ? hit / (hit + missed) : null,
    accuracyMatches: accuracySamples.length,
    rate: median(eligible.filter((m) => m.netWorth > 0).map((m) => m.netWorth / (m.duration / 60))),
    curve,
    source: curve.length >= 2 ? 'observed' : eligible.length ? 'summary' : 'none',
  }
}

export function projectedTime(
  budget: number,
  model: PersonalModel,
  theoreticalRate: number,
): number | null {
  if (budget <= 0) return 0
  if (model.source === 'observed') {
    // Earliest observed crossing; never extrapolate beyond the observed range.
    const i = model.curve.findIndex((p) => p.netWorth >= budget)
    if (i < 0) return null
    if (i === 0) return model.curve[0].time
    const a = model.curve[i - 1],
      b = model.curve[i]
    return (
      a.time + ((budget - a.netWorth) / Math.max(1, b.netWorth - a.netWorth)) * (b.time - a.time)
    )
  }
  const rate = model.rate ?? theoreticalRate
  return rate > 0 ? (budget / rate) * 60 : null
}

export type Finding = {
  title: string
  observation: string
  interpretation: string
  kind: 'observation' | 'opportunity' | 'coverage'
}
export function analyseMatch(match: Match, allMatches: Match[]): Finding[] {
  const findings: Finding[] = []
  const baseline = personalModel(
    allMatches.filter((m) => m.id !== match.id && m.startTime < match.startTime),
    match.heroId,
  )
  const last = [...match.stats]
    .reverse()
    .find(
      (s) =>
        s.shotsHit !== undefined && s.shotsMissed !== undefined && s.shotsHit + s.shotsMissed > 0,
    )
  if (last && baseline.accuracy !== null && baseline.accuracyMatches >= 3) {
    const observed = last.shotsHit! / (last.shotsHit! + last.shotsMissed!)
    findings.push({
      title: 'Application des dégâts',
      kind: 'observation',
      observation: `${Math.round(observed * 100)} % de tirs touchés, contre ${Math.round(baseline.accuracy * 100)} % sur ${baseline.accuracyMatches} parties antérieures du même héros.`,
      interpretation:
        'Comparez le résultat à portée et rôle similaires. La précision globale inclut les cibles non héroïques ; elle ne suffit pas à juger votre visée en duel.',
    })
  }
  if (baseline.detailed >= 3 && match.stats.length >= 2) {
    const gaps = match.stats
      .filter((p) => p.time >= 300)
      .flatMap((p) => {
        const ref = baseline.curve.find((x) => Math.abs(x.time - p.time) <= 30 && x.samples >= 3)
        return ref && ref.netWorth > 0
          ? [{ time: p.time, gap: (p.netWorth - ref.netWorth) / ref.netWorth }]
          : []
      })
      .sort((a, b) => a.gap - b.gap)
    const worst = gaps[0]
    if (worst && worst.gap < -0.15)
      findings.push({
        title: 'Un palier économique retardé',
        kind: 'opportunity',
        observation: `À ${Math.round(worst.time / 60)} min, votre patrimoine était ${Math.round(-worst.gap * 100)} % sous votre référence observée.`,
        interpretation:
          'Revoir la séquence peut aider à adapter le budget du build. Cet écart ne prouve pas une erreur de farm : pression adverse, rôle et événements d’équipe restent à examiner.',
      })
  }
  const cluster = match.deathTimes.find((t, i) => i > 0 && t - match.deathTimes[i - 1] <= 180)
  if (cluster !== undefined)
    findings.push({
      title: 'Une séquence à revoir',
      kind: 'opportunity',
      observation: `Deux morts espacées de moins de trois minutes, autour de ${Math.round(cluster / 60)} min.`,
      interpretation:
        'Regardez les conditions des deux engagements et le prochain palier disponible. Les timestamps seuls ne permettent pas d’attribuer ces morts au build.',
    })
  if (match.team !== undefined) {
    const allies = match.peers.filter((p) => p.team === match.team && p.netWorth > 0)
    const enemies = match.peers.filter((p) => p.team !== match.team && p.netWorth > 0)
    const allyMedian = median(allies.map((p) => p.netWorth)),
      enemyMedian = median(enemies.map((p) => p.netWorth))
    if (allyMedian !== null && enemyMedian !== null)
      findings.push({
        title: 'Le contexte collectif',
        kind: 'observation',
        observation: `Patrimoine final médian : ${Math.round(allyMedian).toLocaleString('fr-FR')} chez vos coéquipiers et ${Math.round(enemyMedian).toLocaleString('fr-FR')} en face.`,
        interpretation:
          'Ce contexte aide à lire la fin de partie. Il ne décrit pas l’avantage au moment de chaque décision et ne permet pas d’évaluer la coordination.',
      })
  }
  findings.push({
    title: 'Couverture de cette analyse',
    kind: 'coverage',
    observation: `${match.stats.length} relevés économiques · ${shopPurchases(match.purchases).length} achats · ${match.deathTimes.length} morts horodatées.`,
    interpretation: match.stats.length
      ? 'Premiers constats descriptifs. Le diagnostic des contre-objets et les alternatives de combat attendent un modèle de capacités et de dégâts validé.'
      : 'Cet historique résumé ne contient pas la chronologie nécessaire pour diagnostiquer les décisions. Enrichissez la partie avec ses métadonnées.',
  })
  return findings
}
