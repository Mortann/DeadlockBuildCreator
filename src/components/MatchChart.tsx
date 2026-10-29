import { Crosshair, Skull } from 'lucide-react'
import type { Match, StatPoint } from '../domain/types'
import { heroes, itemByApiId } from '../domain/catalogue'
import { ItemArt, clock, shortNumber } from './GameUI'

export function MatchChart({
  match,
  at,
  onSelect,
  reference = [],
}: {
  match: Match
  at: number
  onSelect: (time: number) => void
  reference?: StatPoint[]
}) {
  const w = 960,
    h = 300,
    left = 62,
    right = 20,
    top = 24,
    bottom = 42
  const maxTime = Math.max(60, match.duration)
  const ownColor = match.team === 1 ? '#BDCBFF' : '#FBDCA0'
  const allyColor = match.team === 1 ? '#4D75C3' : '#D4860B'
  const enemyColor = match.team === 1 ? '#D4860B' : '#4D75C3'
  const allyAvailable = match.peers.some((p) => p.team === match.team && p.stats.length >= 2)
  const enemyAvailable = match.peers.some((p) => p.team !== match.team && p.stats.length >= 2)
  const series = [
    { id: 'self', points: match.stats, color: ownColor, name: 'Vous', own: true },
    ...match.peers.map((p) => ({
      id: String(p.accountId),
      points: p.stats,
      color: p.team === 0 ? '#D4860B' : p.team === 1 ? '#4D75C3' : '#8a9281',
      name: heroes.find((h) => h.id === p.heroId)?.name ?? `Héros #${p.heroId}`,
      own: false,
    })),
  ].filter((s) => s.points.length >= 2)
  const referencePoints = reference.filter((p) => p.time <= maxTime)
  const maxY =
    Math.max(
      1000,
      ...series.flatMap((s) => s.points.map((p) => p.netWorth)),
      ...referencePoints.map((p) => p.netWorth),
    ) * 1.1
  const x = (n: number) => left + (n / maxTime) * (w - left - right)
  const y = (n: number) => h - bottom - (n / maxY) * (h - bottom - top)
  const path = (points: StatPoint[]) =>
    points.map((p, i) => `${i ? 'L' : 'M'}${x(p.time)},${y(p.netWorth)}`).join(' ')
  const clusters = match.deathTimes
    .slice(1)
    .flatMap((t, i) =>
      t - match.deathTimes[i] <= 180 ? [{ start: match.deathTimes[i], end: t }] : [],
    )
  return (
    <div className="match-chart" data-testid="match-economy-chart">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label="Évolution du patrimoine des joueurs"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          const value = ((e.clientX - rect.left) / rect.width) * w
          onSelect(
            Math.round(
              Math.max(0, Math.min(maxTime, ((value - left) / (w - left - right)) * maxTime)),
            ),
          )
        }}
      >
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i}>
            <line
              x1={left}
              x2={w - right}
              y1={y((maxY * i) / 4)}
              y2={y((maxY * i) / 4)}
              className="chart-grid"
            />
            <text x={left - 14} y={y((maxY * i) / 4) + 5} textAnchor="end" className="graph-label">
              {shortNumber((maxY * i) / 4)}
            </text>
            <text x={x((maxTime * i) / 4)} y={h - 12} textAnchor="middle" className="graph-label">
              {clock((maxTime * i) / 4)}
            </text>
          </g>
        ))}
        {clusters.map((c, i) => (
          <rect
            key={i}
            x={x(c.start)}
            y={top}
            width={Math.max(2, x(c.end) - x(c.start))}
            height={h - bottom - top}
            fill="#d35e4c"
            fillOpacity=".09"
          >
            <title>
              {clock(c.start)} → {clock(c.end)} · 2 morts
            </title>
          </rect>
        ))}
        {series.map((s) => (
          <path
            key={s.id}
            d={path(s.points)}
            fill="none"
            stroke={s.color}
            strokeWidth={s.own ? 3 : 1.5}
            opacity={s.own ? 1 : 0.5}
          >
            <title>{s.name}</title>
          </path>
        ))}
        {referencePoints.length >= 2 && (
          <path
            className="habitual-reference"
            d={referencePoints
              .map(
                (p, i) =>
                  `${i && p.time - referencePoints[i - 1].time <= 90 ? 'L' : 'M'}${x(p.time)},${y(p.netWorth)}`,
              )
              .join(' ')}
            fill="none"
            stroke="#d8d6c8"
            strokeWidth="1.5"
            strokeDasharray="6 5"
          >
            <title>Habitude · au moins 3 parties antérieures</title>
          </path>
        )}
        <line
          x1={x(at)}
          x2={x(at)}
          y1={top}
          y2={h - bottom}
          stroke="#FFEFD7"
          strokeOpacity=".45"
          strokeDasharray="3 5"
        />
        {!series.length && (
          <text x={w / 2} y={h / 2} className="graph-empty" textAnchor="middle">
            Chronologie indisponible
          </text>
        )}
      </svg>
      <div className="match-chart-legend">
        <span>
          <i className="legend-line self" style={{ background: ownColor }} />
          Vous
        </span>
        <span
          className={allyAvailable ? '' : 'unavailable'}
          title={allyAvailable ? 'Alliés' : 'Courbes alliées indisponibles'}
        >
          <i className="legend-line amber" style={{ background: allyColor }} />
          Alliés
        </span>
        <span
          className={enemyAvailable ? '' : 'unavailable'}
          title={enemyAvailable ? 'Adversaires' : 'Courbes adverses indisponibles'}
        >
          <i className="legend-line sapphire" style={{ background: enemyColor }} />
          Adversaires
        </span>
        {referencePoints.length >= 2 && (
          <span>
            <i className="legend-line habitual" />
            Habitude
          </span>
        )}
      </div>
      <div className="event-lane purchases-lane" aria-label="Achats horodatés">
        <span className="event-label">
          <Crosshair size={14} />
        </span>
        {match.purchases.map((p, i) => {
          const item = itemByApiId.get(p.itemId)
          return (
            <button
              key={i}
              className="timeline-event purchase-event"
              style={{ left: `${6.45 + (p.time / maxTime) * 91.45}%` }}
              aria-label={`${item?.name ?? 'Objet inconnu'} à ${clock(p.time)}`}
              title={`${item?.name ?? 'Objet inconnu'} · ${clock(p.time)}`}
              onClick={() => onSelect(p.time)}
            >
              {item ? <ItemArt item={item} /> : <span className="unknown-item">?</span>}
            </button>
          )
        })}
      </div>
      <div className="event-lane deaths-lane" aria-label="Morts horodatées">
        <span className="event-label">
          <Skull size={14} />
        </span>
        {match.deathTimes.map((t, i) => (
          <button
            key={i}
            className="timeline-event death-event"
            style={{ left: `${6.45 + (t / maxTime) * 91.45}%` }}
            aria-label={`Mort à ${clock(t)}`}
            title={clock(t)}
            onClick={() => onSelect(t)}
          >
            <Skull size={16} />
          </button>
        ))}
      </div>
      <input
        aria-label="Moment de la partie à étudier"
        type="range"
        min="0"
        max={maxTime}
        step="1"
        value={at}
        onChange={(e) => onSelect(Number(e.target.value))}
        className="match-time-slider"
      />
    </div>
  )
}
