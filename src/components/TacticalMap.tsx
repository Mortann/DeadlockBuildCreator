import { useId, useMemo, useState, type CSSProperties } from 'react'
import { Clock3, Eye, Focus, MapPin, MoveUpRight, Shield, Skull, Target } from 'lucide-react'
import { heroRoster as heroes } from '../domain/heroRoster'
import {
  freshMapObservation,
  isMapPoint,
  mapTrailSegments,
  projectMapPoint,
  relativeMapBounds,
  worldMapBounds,
  type MapPoint,
  type TimedMapPoint,
} from '../domain/map'
import { mapZiplines } from '../domain/gameMap'
import { clock } from './GameUI'
import './TacticalMap.css'

export type TacticalPlayer = MapPoint & {
  id: string
  label: string
  heroId?: number
  team?: number
  observedAt: number
  health?: number
}
export type TacticalArrow = {
  from: MapPoint
  to: MapPoint
  kind: 'observed' | 'suggested'
  label?: string
}
export type TacticalMapProps = {
  time: number
  selfId: string
  selfTeam?: number
  players: TacticalPlayer[]
  death?: MapPoint
  deathTime?: number
  trails?: { id: string; points: TimedMapPoint[] }[]
  arrows?: TacticalArrow[]
  objective?: MapPoint & { label?: string; destroyed?: boolean }
  coordinateSpace?: 'world' | 'relative'
  calibration?: {
    radius: number
    imageSrc: string
    clientVersion?: number
    basis?: 'date' | 'version'
  }
  focus?: MapPoint & { radius: number }
  highlightId?: string
}

const SIZE = 600
const teamColor = (team?: number) => (team === 0 ? '#D4860B' : team === 1 ? '#7f9fe3' : '#8f9b80')

/** Recorded evidence, not a replay engine or a pathfinding recommendation. */
export function TacticalMap({
  time,
  selfId,
  selfTeam,
  players,
  death,
  deathTime,
  trails = [],
  arrows = [],
  objective,
  coordinateSpace = 'relative',
  calibration,
  focus,
  highlightId,
}: TacticalMapProps) {
  const id = useId().replace(/:/g, '')
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [failedImage, setFailedImage] = useState<string | null>(null)
  const [framing, setFraming] = useState<'near' | 'all'>(calibration ? 'all' : 'near')
  const fresh = players.filter((p) => isMapPoint(p) && freshMapObservation(p.observedAt, time))
  const omitted = players.length - fresh.length
  const safeDeath = isMapPoint(death) ? death : undefined
  const safeObjective = isMapPoint(objective) ? objective : undefined
  const safeArrows = arrows.filter((a) => isMapPoint(a.from) && isMapPoint(a.to))
  const safeFocus =
    isMapPoint(focus) && Number.isFinite(focus.radius) && focus.radius > 0 ? focus : undefined
  const near = !!safeFocus && framing === 'near'
  const geographicBounds = calibration ? worldMapBounds(calibration.radius) : null
  const imageSrc = calibration?.imageSrc
  const geographic =
    coordinateSpace === 'world' &&
    geographicBounds !== null &&
    !!imageSrc?.startsWith('/assets/map/') &&
    failedImage !== imageSrc
  const trailSegments = useMemo(
    () =>
      trails
        .filter((t) => t.id === selfId || t.id === focusedId)
        .flatMap((t) => {
          const chunks: TimedMapPoint[][] = [[]]
          for (const p of [...t.points].sort((a, b) => a.time - b.time)) {
            const state = p as TimedMapPoint & { alive?: boolean; health?: number }
            // Dead samples are sentinels, not positions. Keep their interruption.
            if (state.alive === false || state.health === 0 || !isMapPoint(p)) {
              if (chunks.at(-1)!.length) chunks.push([])
            } else chunks.at(-1)!.push(p)
          }
          return chunks.flatMap((chunk) =>
            mapTrailSegments(chunk, time).map((points) => ({ id: t.id, points })),
          )
        }),
    [trails, time, selfId, focusedId],
  )
  const points = [
    ...fresh,
    ...(safeDeath ? [safeDeath] : []),
    ...(safeObjective ? [safeObjective] : []),
    ...safeArrows.flatMap((a) => [a.from, a.to]),
    ...trailSegments.flatMap((t) => t.points),
  ]
  const allBounds = geographic ? geographicBounds! : relativeMapBounds(points)
  const halfSpan = safeFocus ? safeFocus.radius * 1.4 : 0
  const bounds =
    near && safeFocus
      ? {
          minX: safeFocus.x - halfSpan,
          maxX: safeFocus.x + halfSpan,
          minY: safeFocus.y - halfSpan,
          maxY: safeFocus.y + halfSpan,
        }
      : allBounds
  const project = (p: MapPoint) => projectMapPoint(p, bounds, SIZE)!
  const inFrame = (p: MapPoint) =>
    p.x >= bounds.minX && p.x <= bounds.maxX && p.y >= bounds.minY && p.y <= bounds.maxY
  const visible = fresh.filter(inFrame)
  const chosen =
    visible.find((p) => p.id === focusedId) ??
    visible.find((p) => p.id === highlightId) ??
    visible.find((p) => p.id === selfId)
  const labelOf = (p: TacticalPlayer) =>
    p.id === selfId ? 'Vous' : (heroes.find((h) => h.id === p.heroId)?.name ?? p.label)
  const layer = (p: TacticalPlayer) =>
    p.id === focusedId ? 3 : p.id === selfId ? 2 : p.id === highlightId ? 1 : 0
  const drawnPlayers = [...visible].sort((a, b) => layer(a) - layer(b))
  const imageOrigin = geographic
    ? project({ x: geographicBounds!.minX, y: geographicBounds!.maxY })
    : undefined
  const imageSize = geographic
    ? ((geographicBounds!.maxX - geographicBounds!.minX) / (bounds.maxX - bounds.minX)) * SIZE
    : 0
  const hasPosition = fresh.length > 0 || !!safeDeath || !!safeObjective
  const allyColor = teamColor(selfTeam),
    enemyColor = teamColor(selfTeam === 0 ? 1 : selfTeam === 1 ? 0 : undefined)

  return (
    <figure
      className={`tactical-map ${geographic ? 'geographic' : 'relative'}`}
      data-testid="tactical-map"
    >
      <div className="tactical-map-heading">
        <span
          title={
            geographic
              ? `City Never Sleeps · version ${calibration?.clientVersion ?? 'inconnue'}${calibration?.basis === 'date' ? ' · patch déduit de la date de la partie' : ''}`
              : undefined
          }
        >
          <MapPin size={14} />
          {geographic ? 'Carte de la partie' : 'Vue relative'}
        </span>
        <span className="map-clock">
          <Clock3 size={12} />
          {clock(time)}
        </span>
        <span
          className="map-coverage"
          title={`${visible.length} positions visibles sur ${fresh.length} relevés datant de 12 s ou moins${visible.length < fresh.length ? ` ; ${fresh.length - visible.length} hors cadre, sans déplacement artificiel` : ''}${omitted ? ` ; ${omitted} relevés anciens, futurs ou invalides exclus` : ''}`}
        >
          <Eye size={12} />
          {visible.length < fresh.length ? `${visible.length}/${fresh.length}` : fresh.length}
        </span>
      </div>
      <div className="tactical-map-canvas">
        {safeFocus && (
          <div className="map-framing" role="group" aria-label="Cadrage des positions">
            <button type="button" aria-pressed={near} onClick={() => setFraming('near')}>
              <Focus size={13} /> Proche
            </button>
            <button type="button" aria-pressed={!near} onClick={() => setFraming('all')}>
              Tous
            </button>
          </div>
        )}
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          role="img"
          aria-label={
            geographic
              ? 'Positions enregistrées sur la carte'
              : 'Positions enregistrées, vue relative sans fond géographique'
          }
        >
          <defs>
            <pattern id={`${id}-grid`} width="60" height="60" patternUnits="userSpaceOnUse">
              <path
                d="M60 0H0V60"
                fill="none"
                stroke="#ffefd7"
                strokeOpacity=".06"
                strokeWidth="1"
              />
            </pattern>
            <clipPath id={`${id}-clip`}>
              <rect width={SIZE} height={SIZE} rx="2" />
            </clipPath>
            <marker
              id={`${id}-observed`}
              markerWidth="8"
              markerHeight="8"
              refX="6"
              refY="3"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d="M0 0 6 3 0 6" fill="none" stroke="#d8d8c7" strokeWidth="1.3" />
            </marker>
            <marker
              id={`${id}-suggested`}
              markerWidth="8"
              markerHeight="8"
              refX="6"
              refY="3"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d="M0 0 6 3 0 6" fill="none" stroke="#FBDCA0" strokeWidth="1.3" />
            </marker>
            {fresh.map((p) => (
              <clipPath key={p.id} id={`${id}-portrait-${p.id.replace(/[^\w-]/g, '')}`}>
                <circle r="15" />
              </clipPath>
            ))}
          </defs>
          <rect width={SIZE} height={SIZE} fill={geographic ? '#46543c' : '#10170f'} />
          <g clipPath={`url(#${id}-clip)`}>
            {geographic && (
              <image
                href={imageSrc}
                x={imageOrigin!.x}
                y={imageOrigin!.y}
                width={imageSize}
                height={imageSize}
                opacity="1"
                className="map-terrain"
                onError={() => setFailedImage(imageSrc!)}
                aria-hidden="true"
              />
            )}
            {!geographic && <rect width={SIZE} height={SIZE} fill={`url(#${id}-grid)`} />}
            {geographic &&
              mapZiplines.map((lane, index) => {
                const at = (p: number[]) =>
                  project({ x: lane.origin[0] + p[0], y: lane.origin[1] + p[1] })
                const first = at(lane.P0_points[0])
                let d = `M${first.x},${first.y}`
                for (let i = 1; i < lane.P0_points.length; i++) {
                  const a = lane.P0_points[i - 1],
                    b = lane.P0_points[i],
                    out = lane.P2_points[i - 1],
                    input = lane.P1_points[i]
                  const c1 = at([a[0] + out[0], a[1] + out[1]]),
                    c2 = at([b[0] + input[0], b[1] + input[1]]),
                    to = at(b)
                  d += ` C${c1.x},${c1.y} ${c2.x},${c2.y} ${to.x},${to.y}`
                }
                return (
                  <path key={index} d={d} fill="none" stroke={lane.color} className="map-zipline">
                    <title>Ligne {index + 1}</title>
                  </path>
                )
              })}
            {!geographic && hasPosition && (
              <>
                <line x1="300" x2="300" y1="0" y2="600" className="map-origin" />
                <line x1="0" x2="600" y1="300" y2="300" className="map-origin" />
              </>
            )}
            {safeFocus &&
              near &&
              (() => {
                const center = project(safeFocus)
                const radius = (safeFocus.radius / (bounds.maxX - bounds.minX)) * SIZE
                return (
                  <g className="map-observation-radius" aria-label="Rayon d’observation 2D">
                    <circle cx={center.x} cy={center.y} r={radius} />
                    <text x={center.x} y={center.y - radius + 18} textAnchor="middle">
                      Observation 2D
                    </text>
                  </g>
                )
              })()}
            {trailSegments.map((t, i) => {
              const player = players.find((p) => p.id === t.id)
              return (
                <path
                  key={`${t.id}-${i}`}
                  className="observed-trail"
                  d={t.points
                    .map((p, j) => {
                      const q = project(p)
                      return `${j ? 'L' : 'M'}${q.x},${q.y}`
                    })
                    .join(' ')}
                  stroke={t.id === selfId ? '#FFEFD7' : teamColor(player?.team)}
                >
                  <title>Relevés observés · {player?.label ?? t.id}</title>
                </path>
              )
            })}
            {safeObjective &&
              (() => {
                const p = project(safeObjective)
                return (
                  <g
                    transform={`translate(${p.x} ${p.y})`}
                    className={`map-objective ${objective?.destroyed ? 'destroyed' : ''}`}
                  >
                    <path d="M0-15 15 0 0 15-15 0Z" />
                    <Shield x="-8" y="-8" width="16" height="16" />
                    <title>
                      {safeObjective.label ?? 'Objectif observé'}
                      {objective?.destroyed ? ' · perdu' : ''}
                    </title>
                  </g>
                )
              })()}
            {safeArrows.map((a, i) => {
              const from = project(a.from),
                to = project(a.to)
              return (
                <path
                  key={i}
                  d={`M${from.x},${from.y} L${to.x},${to.y}`}
                  className={`tactical-arrow ${a.kind}`}
                  markerEnd={`url(#${id}-${a.kind})`}
                >
                  <title>
                    {a.label ?? (a.kind === 'suggested' ? 'Option à examiner' : 'Lien observé')}
                  </title>
                </path>
              )
            })}
            {drawnPlayers.map((p) => {
              const q = project(p),
                hero = heroes.find((h) => h.id === p.heroId),
                self = p.id === selfId,
                selected = p.id === focusedId
              return (
                <g
                  key={p.id}
                  className={`map-player ${self ? 'self' : ''} ${selected ? 'selected' : ''} ${p.id === highlightId ? 'highlighted' : ''}`}
                  transform={`translate(${q.x} ${q.y})`}
                  style={
                    {
                      '--player-color': self ? '#FFEFD7' : teamColor(p.team),
                      opacity: time - p.observedAt > 5 ? 0.65 : 1,
                    } as CSSProperties
                  }
                  tabIndex={0}
                  role="button"
                  aria-label={`${labelOf(p)} · relevé à ${clock(p.observedAt)}${p.health !== undefined && p.health >= 0 && p.health <= 100 ? ` · PV ${p.health} %` : ''}`}
                  onClick={() => setFocusedId(p.id)}
                  onFocus={() => setFocusedId(p.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setFocusedId(p.id)
                    }
                  }}
                >
                  {self && <circle className="self-ring" r="25" />}
                  {p.id === highlightId && <circle className="priority-ring" r="28" />}
                  <circle className="player-disc" r="18" />
                  {hero?.portrait ? (
                    <image
                      href={hero.portrait}
                      x="-15"
                      y="-15"
                      width="30"
                      height="30"
                      clipPath={`url(#${id}-portrait-${p.id.replace(/[^\w-]/g, '')})`}
                    />
                  ) : (
                    <text className="player-initial" y="5" textAnchor="middle">
                      {p.label.slice(0, 2)}
                    </text>
                  )}
                  <circle className="player-border" r="18" />
                  {p.health !== undefined &&
                    Number.isFinite(p.health) &&
                    p.health >= 0 &&
                    p.health <= 100 && (
                      <g
                        className={`map-health ${p.health <= 25 ? 'critical' : p.health <= 50 ? 'low' : ''}`}
                        aria-hidden="true"
                      >
                        <rect x={-19} y={23} width={38} height={5} rx={1} />
                        <rect
                          className="map-health-value"
                          x={-18}
                          y={24}
                          width={(36 * p.health) / 100}
                          height={3}
                          rx={0.5}
                        />
                      </g>
                    )}
                  <title>
                    {labelOf(p)} · {clock(p.observedAt)}
                  </title>
                </g>
              )
            })}
            {safeDeath &&
              (() => {
                const p = project(safeDeath)
                return (
                  <g transform={`translate(${p.x} ${p.y})`} className="map-death">
                    <circle r="24" />
                    <Skull x="-11" y="-11" width="22" height="22" />
                    <text y="42" textAnchor="middle">
                      {deathTime !== undefined ? clock(deathTime) : 'Vous'}
                    </text>
                    <title>
                      Position enregistrée au décès
                      {deathTime !== undefined ? ` · ${clock(deathTime)}` : ''}
                    </title>
                  </g>
                )
              })()}
          </g>
        </svg>
        {!hasPosition && (
          <div className="map-no-data">
            <Focus size={32} />
            <span>Positions indisponibles</span>
          </div>
        )}
        {!geographic && hasPosition && (
          <span
            className="relative-mark"
            title="Relations spatiales uniquement. Aucun obstacle, passage ou temps de trajet n’est déduit."
          >
            <Focus size={12} />
            Sans fond géographique
          </span>
        )}
      </div>
      <figcaption className="tactical-map-caption">
        <div className="map-legend">
          <span>
            <i style={{ background: '#FFEFD7' }} />
            Vous
          </span>
          <span>
            <i style={{ background: allyColor }} />
            Alliés
          </span>
          <span>
            <i style={{ background: enemyColor }} />
            Adversaires
          </span>
          {safeArrows.some((a) => a.kind === 'suggested') && (
            <span className="option-legend">
              <MoveUpRight size={12} />
              Option
            </span>
          )}
        </div>
        <span className="map-selected-player">
          {chosen ? (
            <>
              <Target size={12} />
              {labelOf(chosen)}
              {chosen.health !== undefined &&
                Number.isFinite(chosen.health) &&
                chosen.health >= 0 &&
                chosen.health <= 100 && (
                  <span className="map-selected-health">♥ {chosen.health}%</span>
                )}
              <small>−{Math.max(0, Math.round(time - chosen.observedAt))} s</small>
            </>
          ) : null}
        </span>
      </figcaption>
    </figure>
  )
}
