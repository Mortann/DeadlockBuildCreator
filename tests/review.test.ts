import { describe, expect, it } from 'vitest'
import {
  comparableHistory,
  counterInterval,
  incomingDamage,
  positionAt,
  reviewBuild,
  reviewMoments,
  reviewOverview,
  sceneAt,
  teamAdvantage,
} from '../src/domain/review'
import { damageSeries, syntheticHistory, syntheticMatch, testPurchase } from './reviewFixtures'

describe('a personal reference with enough independent evidence', () => {
  it('withholds a letter without previous matches or with fewer than five references', () => {
    expect(reviewOverview(syntheticMatch(), []).grade).toBeNull()
    const result = reviewOverview(syntheticMatch(), syntheticHistory(4))
    expect(result.grade).toBeNull()
    expect(result.gradeReason).toBe('references')
  })

  it('scores varied comparable historical observations, independently from victory', () => {
    const match = syntheticMatch()
    const history = syntheticHistory()
    const result = reviewOverview(match, history)
    expect(result.gradeReason).toBe('ready')
    expect(result.grade).not.toBeNull()
    expect(result.axes.filter((a) => a.percentile !== null).length).toBeGreaterThanOrEqual(3)
    expect(result.referenceCount).toBe(6)
    const win = reviewOverview(
      { ...match, outcome: 'win' },
      history.map((m) => ({ ...m, outcome: 'win' })),
    )
    expect(win.percentile).toBe(result.percentile)
    expect(win.grade).toBe(result.grade)
  })

  it('withholds the score for constant reference counters instead of awarding an extreme rank', () => {
    const match = syntheticMatch()
    const history = syntheticHistory().map((m) => ({
      ...m,
      stats: match.stats,
      netWorth: match.netWorth,
      deaths: match.deaths,
    }))
    const result = reviewOverview(match, history)
    expect(result.grade).toBeNull()
    expect(result.gradeReason).toBe('dimensions')
    expect(result.axes.every((a) => a.percentile === null)).toBe(true)
  })

  it('excludes future games, other heroes, modes, versions, durations and abandoned matches', () => {
    const current = syntheticMatch()
    const good = syntheticHistory(1)[0]
    const candidates = [
      good,
      { ...good, id: 'future', startTime: current.startTime + 1 },
      { ...good, id: 'hero', heroId: 13 },
      { ...good, id: 'mode', mode: 2 },
      { ...good, id: 'version', clientVersion: current.clientVersion! + 1 },
      { ...good, id: 'duration', duration: 300 },
      { ...good, id: 'abandoned', abandoned: true },
    ]
    expect(comparableHistory(current, candidates).map((m) => m.id)).toEqual([good.id])
  })

  it('never turns rejected telemetry or an unsupported game mode into a letter', () => {
    expect(
      reviewOverview(
        syntheticMatch({ telemetryWarnings: ['stats-invalid-counter'] }),
        syntheticHistory(),
      ).gradeReason,
    ).toBe('telemetry')
    expect(reviewOverview(syntheticMatch({ mode: 2 }), syntheticHistory()).gradeReason).toBe('mode')
  })
})

describe('recorded moments and causal limits', () => {
  it('links an objective loss to a recorded respawn interval and merges the deaths into one episode', () => {
    const moments = reviewMoments(syntheticMatch(), [])
    expect(moments).toHaveLength(1)
    expect(moments[0].kind).toBe('availability')
    expect(moments[0].objective?.id).toBe('own-walker')
    expect(moments[0].deathTimes).toEqual([900, 1020])
    expect(moments[0].proof).toBe('observed')
  })

  it('does not infer objective unavailability from a death timestamp with no respawn interval', () => {
    const match = syntheticMatch({ deathDetails: [{ time: 900 }, { time: 1020 }] })
    const moments = reviewMoments(match, [])
    expect(moments.every((m) => m.kind !== 'availability')).toBe(true)
    expect(moments.every((m) => m.objective === undefined)).toBe(true)
  })

  it('does not equate an enemy or neutral objective loss with our unavailability', () => {
    const original = syntheticMatch()
    const match = { ...original, objectives: original.objectives!.map((o) => ({ ...o, team: 1 })) }
    expect(reviewMoments(match, []).some((m) => m.kind === 'availability')).toBe(false)
  })

  it('only reports farm coincidence with actual neutral-kill deltas inside a recent pressure window', () => {
    const match = syntheticMatch({
      deathTimes: [],
      deathDetails: [],
      stats: [
        { time: 900, netWorth: 12000, neutralKills: 4 },
        { time: 930, netWorth: 13000, neutralKills: 6 },
      ],
      objectives: [
        { id: 'walker', team: 0, type: 'walker', firstDamageTime: 900, destroyedTime: 930 },
      ],
    })
    const moments = reviewMoments(match, [])
    expect(moments).toHaveLength(1)
    expect(moments[0].kind).toBe('priority')
    expect(moments[0].proof).toBe('signal')
    expect(moments[0].evidence.find((e) => e.label === 'Neutres éliminés')?.value).toBe(2)
    expect(
      reviewMoments(
        { ...match, objectives: [{ ...match.objectives![0], firstDamageTime: 300 }] },
        [],
      ),
    ).toEqual([])
    expect(
      reviewMoments(
        { ...match, stats: match.stats.map((p) => ({ time: p.time, netWorth: p.netWorth })) },
        [],
      ),
    ).toEqual([])
  })

  it('rejects cumulative counter resets even when the end value exceeds the beginning', () => {
    expect(
      counterInterval(
        [
          { time: 900, netWorth: 1000, neutralKills: 4 },
          { time: 915, netWorth: 1050, neutralKills: 0 },
          { time: 930, netWorth: 1100, neutralKills: 6 },
        ],
        'neutralKills',
        900,
        930,
      ),
    ).toBeNull()
  })
})

describe('damage attribution without aggregate double counting', () => {
  it('uses detailed sources without adding their aggregate rows', () => {
    const match = syntheticMatch({
      damageMatrix: [
        damageSeries({ sourceName: 'Ability' }),
        damageSeries({ sourceName: 'test_ability' }),
        damageSeries({
          sourceName: 'test_ability_2',
          samples: [
            { time: 840, value: 0 },
            { time: 900, value: 200 },
          ],
        }),
      ],
    })
    const result = incomingDamage(match, 840, 900)
    expect(result?.total).toBe(1000)
    expect(result?.actors[0].sources.map((s) => s.name)).not.toContain('Ability')
    expect(result?.start).toBe(840)
    expect(result?.end).toBe(900)
  })

  it('rejects resets, ambiguous duplicate sources and friendly attribution', () => {
    const reset = damageSeries({
      samples: [
        { time: 840, value: 100 },
        { time: 870, value: 0 },
        { time: 900, value: 900 },
      ],
    })
    expect(incomingDamage(syntheticMatch({ damageMatrix: [reset] }), 840, 900)).toBeNull()
    expect(
      incomingDamage(syntheticMatch({ damageMatrix: [damageSeries(), damageSeries()] }), 840, 900),
    ).toBeNull()
    expect(
      incomingDamage(syntheticMatch({ damageMatrix: [damageSeries({ dealerSlot: 1 })] }), 840, 900),
    ).toBeNull()
  })

  it('does not interpolate a combat counter to manufacture a shorter fight window', () => {
    expect(incomingDamage(syntheticMatch(), 880, 900)).toBeNull()
  })
})

describe('historical information available to a build decision', () => {
  it('does not use an enemy purchase after the player decision', () => {
    const base = syntheticMatch({
      purchases: [testPurchase('upgrade_rapid_rounds', 600)],
      deathTimes: [],
      deathDetails: [],
    })
    base.peers = base.peers.map((p) => ({
      ...p,
      stats: [],
      purchases: p.playerSlot === 6 ? [testPurchase('upgrade_vampire', 720)] : [],
    }))
    expect(reviewBuild(base, [])).toEqual([])
    const later = {
      ...base,
      purchases: [...base.purchases, testPurchase('upgrade_clip_size', 1000)],
    }
    const cases = reviewBuild(later, [])
    expect(cases).toHaveLength(1)
    expect(cases[0].time).toBe(1000)
    expect(cases[0].kind).toBe('healing')
    expect(cases[0].enemyItems).toContain('upgrade_vampire')
    expect(
      cases[0].options.every((o) => o.difference === o.cost - cases[0].actualPurchase!.cost),
    ).toBe(true)
  })

  it('does not claim missing allied inventories prove no team response', () => {
    const match = syntheticMatch()
    match.peers = match.peers.map((p) => ({
      ...p,
      purchases: p.team === match.team ? undefined : p.purchases,
    }))
    const healing = reviewBuild(match, []).find((c) => c.kind === 'healing')
    expect(healing).toBeDefined()
    expect(healing?.teamResponse).toBe('unknown')
  })
})

describe('economic share needs the complete denominator', () => {
  it('uses all twelve actors and calculates a share of souls, independently from outcome', () => {
    const match = syntheticMatch()
    const points = teamAdvantage(match)
    expect(points.length).toBeGreaterThan(1)
    const point = points.find((p) => p.time === 600)!
    expect(point.share).toBeCloseTo(100 / 2.15)
    expect(point.share).toBeCloseTo((point.own / (point.own + point.enemy)) * 100)
    expect(teamAdvantage({ ...match, outcome: 'win' })).toEqual(points)
  })

  it('rejects incomplete teams, duplicate actors and unknown affiliations', () => {
    const match = syntheticMatch()
    expect(teamAdvantage({ ...match, peers: match.peers.slice(1) })).toEqual([])
    expect(
      teamAdvantage({ ...match, peers: [...match.peers.slice(0, 10), match.peers[0]] }),
    ).toEqual([])
    expect(teamAdvantage({ ...match, team: undefined })).toEqual([])
    expect(
      teamAdvantage({
        ...match,
        peers: match.peers.map((p, i) => (i === 0 ? { ...p, team: undefined } : p)),
      }),
    ).toEqual([])
  })

  it('does not bridge large observation gaps or extrapolate one missing actor', () => {
    const match = syntheticMatch()
    const sparse = {
      ...match,
      peers: match.peers.map((p, i) =>
        i === 0 ? { ...p, stats: [p.stats[0], p.stats.at(-1)!] } : p,
      ),
    }
    expect(teamAdvantage(sparse).map((p) => p.time)).toEqual([1800])
  })
})

describe('scene observations never borrow the future', () => {
  it('excludes future, stale and dead samples', () => {
    const points = [
      { time: 100, x: 0, y: 0 },
      { time: 120, x: 1, y: 1 },
    ]
    expect(positionAt(points, 99)).toBeUndefined()
    expect(positionAt(points, 109)).toBeUndefined()
    expect(positionAt(points, 105)?.time).toBe(100)
    expect(positionAt([{ ...points[0], health: 0 }], 100)).toBeUndefined()
  })

  it('shows death and killer positions only at the actual death timestamp', () => {
    const match = syntheticMatch({
      positions: [],
      peers: syntheticMatch().peers.map((p) => ({ ...p, positions: [] })),
    })
    const before = sceneAt(match, 899)
    expect(before.players).toEqual([])
    expect(before.death).toBeUndefined()
    const at = sceneAt(match, 900)
    expect(at.death).toEqual({ x: 0, y: 0 })
    expect(at.players.find((p) => p.id === '48')).toMatchObject({ x: 150, y: 200, observedAt: 900 })
    expect(sceneAt(match, 901).death).toBeUndefined()
  })

  it('keeps the recorded approach trail at death but excludes future path samples', () => {
    const match = syntheticMatch()
    match.positions = [...match.positions!, { time: 906, x: 999, y: 999 }]
    const scene = sceneAt(match, 900)
    const trail = scene.trails.find((t) => t.id === String(match.accountId))
    expect(trail).toBeDefined()
    expect(trail!.points.every((p) => p.time <= 900)).toBe(true)
    expect(scene.players.some((p) => p.x === 999)).toBe(false)
  })
})

describe('additional coverage guards from scene review', () => {
  it('invalidates the last live point after a death even without a respawn duration', () => {
    const match = syntheticMatch({
      deathTimes: [900],
      deathDetails: [{ time: 900 }],
      positions: [{ time: 898, x: 10, y: 20 }],
    })
    expect(sceneAt(match, 901).players.some((p) => p.id === '42')).toBe(false)
    expect(sceneAt(match, 899.999).death).toBeUndefined()
  })

  it('breaks short trails at dead sentinels rather than connecting through their coordinates', () => {
    const match = syntheticMatch({
      deathTimes: [],
      deathDetails: [],
      positions: [
        { time: 880, x: 0, y: 0 },
        { time: 884, x: 1, y: 1 },
        { time: 888, x: -10000, y: -10000, health: 0, alive: false },
        { time: 892, x: 2, y: 2 },
        { time: 896, x: 3, y: 3 },
      ],
    })
    const trails = sceneAt(match, 896).trails.filter((t) => t.id === '42')
    expect(trails.map((t) => t.points.map((p) => p.time))).toEqual([
      [880, 884],
      [892, 896],
    ])
    expect(positionAt(match.positions, 890)).toBeUndefined()
  })

  it('does not assemble an apparent numerical disadvantage from unsynchronized observations', () => {
    const match = syntheticMatch()
    match.peers[0] = { ...match.peers[0], positions: [{ time: 884, x: 4000, y: 4000 }] }
    expect(reviewMoments(match, []).every((m) => m.local === undefined)).toBe(true)
  })

  it('suppresses dependent calculations when their source telemetry was rejected', () => {
    expect(reviewBuild(syntheticMatch({ telemetryWarnings: ['inventory-truncated'] }), [])).toEqual(
      [],
    )
    expect(
      incomingDamage(syntheticMatch({ telemetryWarnings: ['combat-invalid-series'] }), 840, 900),
    ).toBeNull()
    expect(teamAdvantage(syntheticMatch({ telemetryWarnings: ['stats-truncated'] }))).toEqual([])
    expect(
      sceneAt(syntheticMatch({ telemetryWarnings: ['players-duplicate-slot'] }), 900).players,
    ).toEqual([])
  })

  it('does not treat aggregate-only combat rows as complete detailed attribution', () => {
    expect(
      incomingDamage(
        syntheticMatch({ damageMatrix: [damageSeries({ sourceName: 'Ability' })] }),
        840,
        900,
      ),
    ).toBeNull()
  })

  it('uses an observed death counter instead of a missing summary zero', () => {
    const match = syntheticMatch({ deaths: 0 })
    const overview = reviewOverview(match, syntheticHistory())
    expect(overview.axes.find((a) => a.id === 'survival')?.value).toBeCloseTo(5 / 3)
  })
})

describe('grading and economy with real metadata cadence', () => {
  it('does not let unrelated combat or death-detail warnings suppress valid personal counters', () => {
    const match = syntheticMatch({
      telemetryWarnings: ['combat-length-mismatch', 'deaths-invalid-time-to-kill'],
    })
    expect(reviewOverview(match, syntheticHistory()).gradeReason).toBe('ready')
  })
  it('accepts regular five-minute economic samples while preserving large gaps', () => {
    const match = syntheticMatch()
    const regular = match.stats.filter((p) => p.time % 300 === 0)
    match.stats = regular
    match.peers = match.peers.map((p) => ({
      ...p,
      stats: p.stats.filter((s) => s.time % 300 === 0),
    }))
    expect(teamAdvantage(match).find((p) => p.time === 150)).toBeDefined()
    match.peers[0].stats = regular.filter((p) => p.time === 0 || p.time >= 1200)
    expect(teamAdvantage(match).find((p) => p.time === 600)).toBeUndefined()
  })
})
