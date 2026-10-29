import { useState } from 'react'
import { Coins, Crosshair } from 'lucide-react'
import type { CurvePoint } from '../domain/engine'
import { ItemArt, number, shortNumber } from './GameUI'

export type Metric = 'sustained' | 'burst' | 'health' | 'spirit'
export const metricLabels: Record<Metric, string> = {
  sustained: 'DPS soutenu',
  burst: 'Dégâts de séquence',
  health: 'Points de vie',
  spirit: 'Puissance Spirit',
}

export function PowerChart({
  points,
  reference,
  selected,
  onSelect,
  metric,
  timeAxis = false,
}: {
  points: CurvePoint[]
  reference?: CurvePoint[]
  selected: number
  onSelect: (n: number) => void
  metric: Metric
  timeAxis?: boolean
}) {
  const [hover, setHover] = useState<number | null>(null)
  const w = 600,
    h = 268,
    left = 44,
    right = 18,
    top = 18,
    bottom = 34
  const xvalue = (p: CurvePoint) => (timeAxis ? p.time : p.budget)
  const all = [...points, ...(reference ?? [])].filter((p) => xvalue(p) !== null)
  const maxX = Math.max(timeAxis ? 600 : 3200, ...all.map((p) => xvalue(p)!))
  const maxY = Math.max(1, ...all.map((p) => p.result[metric])) * 1.15
  const x = (v: number) => left + (v / maxX) * (w - left - right)
  const y = (v: number) => h - bottom - (v / maxY) * (h - top - bottom)
  const path = (data: CurvePoint[]) => {
    let result = '',
      previous: CurvePoint | undefined
    for (const p of data) {
      const value = xvalue(p)
      if (value === null) {
        previous = undefined
        continue
      }
      result += previous
        ? `H${x(value)}V${y(p.result[metric])}`
        : `M${x(value)},${y(p.result[metric])}`
      previous = p
    }
    return result
  }
  const active = points[Math.min(hover ?? selected, points.length - 1)]
  return (
    <div className="power-chart">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label={`${metricLabels[metric]} selon ${timeAxis ? 'le temps projeté' : 'le budget'}`}
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
            <text x={left - 9} y={y((maxY * i) / 4) + 5} textAnchor="end" className="graph-label">
              {shortNumber((maxY * i) / 4)}
            </text>
            <text x={x((maxX * i) / 4)} y={h - 8} textAnchor="middle" className="graph-label">
              {timeAxis ? `${Math.round((maxX * i) / 240)}′` : shortNumber((maxX * i) / 4)}
            </text>
          </g>
        ))}
        {reference && (
          <path
            d={path(reference)}
            fill="none"
            stroke="#BDCBFF"
            strokeWidth="2"
            strokeDasharray="5 4"
          />
        )}
        <path
          d={path(points)}
          fill="none"
          stroke="#FBDCA0"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        {active && xvalue(active) !== null && (
          <line
            x1={x(xvalue(active)!)}
            x2={x(xvalue(active)!)}
            y1={top}
            y2={h - bottom}
            stroke="#FFEFD7"
            strokeOpacity=".25"
            strokeDasharray="3 5"
          />
        )}
        {points.map((p, i) =>
          xvalue(p) === null ? null : (
            <g
              key={i}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onSelect(i)}
              className="graph-point"
            >
              <circle cx={x(xvalue(p)!)} cy={y(p.result[metric])} r="13" fill="transparent" />
              <circle
                cx={x(xvalue(p)!)}
                cy={y(p.result[metric])}
                r={i === selected ? 5 : 3}
                fill={i === selected ? '#FBDCA0' : '#10130D'}
                stroke="#FBDCA0"
                strokeWidth="2"
              />
              <title>
                {p.item?.name ?? 'Sans objet'} · {number(p.result[metric])} · {number(p.budget)}{' '}
                âmes
              </title>
            </g>
          ),
        )}
      </svg>
      <div className="chart-legend">
        <span>
          <i className="legend-line self" />
          Build A
        </span>
        {reference && (
          <span>
            <i className="legend-line sapphire" />
            Référence B
          </span>
        )}
        <span className="axis-unit">{timeAxis ? 'Minutes' : 'Âmes'}</span>
      </div>
      <div className="build-event-strip">
        {points.slice(1).map(
          (p, i) =>
            p.item && (
              <button
                key={p.entry?.id ?? i}
                className={`build-event ${selected === i + 1 ? 'selected' : ''}`}
                aria-label={`Sélectionner ${p.item.name}`}
                title={`${p.item.name} · ${number(p.budget)} âmes`}
                onClick={() => onSelect(i + 1)}
              >
                <ItemArt item={p.item} />
              </button>
            ),
        )}
      </div>
      <input
        className="build-time-slider"
        aria-label="Achat observé dans la progression"
        type="range"
        min="0"
        max={points.length - 1}
        value={selected}
        onChange={(e) => onSelect(Number(e.target.value))}
      />
      <div className="selected-purchase">
        <span>{points[selected]?.item?.name ?? 'Sans objet'}</span>
        <span>
          <Coins size={12} />
          {number(points[selected]?.budget ?? 0)}
        </span>
      </div>
    </div>
  )
}
