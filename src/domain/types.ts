export type Category = 'weapon' | 'vitality' | 'spirit'
export type Phase = 'lane' | 'mid' | 'late'
export type Item = {
  id: string
  apiId: number
  name: string
  category: Category
  tier: number
  cost: number
  properties: Record<string, number>
  components: string[]
  active: boolean
}
export type HeroIdentity = { id: number; name: string; className: string; portrait?: string }
export type Hero = HeroIdentity & {
  id: number
  name: string
  className: string
  health: number
  moveSpeed: number
  weapon: {
    m_flBulletDamage: number
    m_flCycleTime: number
    m_iClipSize: number
    m_reloadDuration: number
    m_iBullets: number
  }
}
export type BuildEntry = {
  id: string
  itemId: string
  phase: Phase
  situational: boolean
  note: string
}
export type Build = { name: string; heroId: number; entries: BuildEntry[] }
export type Scenario = {
  accuracy: number
  resistance: number
  duration: number
  spiritApplied: boolean
}
export type StatPoint = {
  time: number
  netWorth: number
  shotsHit?: number
  shotsMissed?: number
  damage?: number
  deaths?: number
  kills?: number
  assists?: number
  damageTaken?: number
  healing?: number
  selfHealing?: number
  objectiveDamage?: number
  creepDamage?: number
  neutralDamage?: number
  creepKills?: number
  neutralKills?: number
  goldLane?: number
  goldLaneOrbs?: number
  goldNeutral?: number
  goldNeutralOrbs?: number
  goldPlayers?: number
  goldPlayerOrbs?: number
  goldObjectives?: number
  goldObjectiveOrbs?: number
  goldDeathLoss?: number
  level?: number
  maxHealth?: number
  weaponPower?: number
  spiritPower?: number
  heroShotsHit?: number
  heroCritShotsHit?: number
  healingPrevented?: number
  healingLost?: number
  damageMitigated?: number
  damageAbsorbed?: number
  teammateHealing?: number
  teammateBarriering?: number
}
export type Purchase = { itemId: string; time: number; soldTime?: number; upgradeInfo?: number }
export type WorldPosition = { x: number; y: number; z?: number }
/** Raw observed samples in world units. No interpolation or forward fill. */
export type PositionSample = WorldPosition & {
  time: number
  health?: number
  alive?: boolean
  combatType?: number
  moveType?: number
}
export type DeathEvent = {
  time: number
  position?: WorldPosition
  killerPosition?: WorldPosition
  killerSlot?: number
  respawnDuration?: number
  timeToKill?: number
}
export type ObjectiveEvent = {
  id: string
  destroyedTime: number
  team?: number
  legacyId?: number
  teamObjectiveId?: number
  firstDamageTime?: number
  type?: 'core' | 'guardian' | 'walker' | 'titan' | 'shrine' | 'barracks' | 'midboss' | 'unknown'
  lane?: number
}
/** Values are cumulative at the recorded timestamps; a source name is not a damage type. */
export type CombatSeries = {
  dealerSlot: number
  targetSlot: number
  sourceName?: string
  statType:
    | 'damage'
    | 'healing'
    | 'healingPrevented'
    | 'damageMitigated'
    | 'lethalDamage'
    | 'regen'
    | 'crowdControl'
    | 'damageMitigatedBySource'
  samples: { time: number; value: number }[]
  total?: number
  timing?: 'complete' | 'sparse'
}
export type Peer = {
  accountId: number
  team?: number
  heroId: number
  netWorth: number
  stats: StatPoint[]
  playerSlot?: number
  assignedLane?: number
  positions?: PositionSample[]
  purchases?: Purchase[]
  deathTimes?: number[]
  deathDetails?: DeathEvent[]
  kills?: number
  deaths?: number
  assists?: number
}
export type Match = {
  id: string
  accountId: number
  heroId: number
  startTime: number
  duration: number
  outcome: 'win' | 'loss' | 'unknown'
  netWorth: number
  kills: number
  deaths: number
  assists: number
  stats: StatPoint[]
  purchases: Purchase[]
  deathTimes: number[]
  team?: number
  peers: Peer[]
  mode: number
  abandoned: boolean
  source: 'api' | 'import'
  playerSlot?: number
  assignedLane?: number
  clientVersion?: number
  inventoryRecorded?: boolean
  positions?: PositionSample[]
  positionInterval?: number
  deathDetails?: DeathEvent[]
  objectives?: ObjectiveEvent[]
  damageMatrix?: CombatSeries[]
  /** Import coverage warnings; truncated or rejected telemetry must not yield a full diagnostic. */
  telemetryWarnings?: string[]
  telemetryVersion?: number
}
export type HeroAccountStats = {
  heroId: number
  matches: number
  wins: number
  kills?: number
  deaths?: number
  assists?: number
  accuracy?: number
  netWorthPerMinute?: number
}
export type AccountData = {
  name?: string
  profileUrl?: string
  rank?: { badge: number; rank: number; subrank: number }
  heroStats: HeroAccountStats[]
  ingestActive?: boolean
  unavailable: string[]
  syncedAt: string
}
export type Profile = {
  accountId: number
  matches: Match[]
  updatedAt: string
  account?: AccountData
}
export type PersonalModel = {
  matches: number
  detailed: number
  accuracy: number | null
  accuracyMatches: number
  rate: number | null
  curve: { time: number; netWorth: number; samples: number }[]
  source: 'observed' | 'summary' | 'none'
}
