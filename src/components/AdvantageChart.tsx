import { useId } from 'react'
import type { AdvantagePoint, ReviewMoment } from '../domain/review'
import { clock } from './GameUI'
export function AdvantageChart({
  points,
  duration,
  moments,
  onSelect,
  at,
  onMoment,
}: {
  points: AdvantagePoint[]
  duration: number
  moments: ReviewMoment[]
  onSelect: (time: number) => void
  at: number
  onMoment: (m: ReviewMoment) => void
}) {
  const id = useId().replace(/:/g, '')
  const w = 960,
    h = 240,
    left = 50,
    right = 20,
    top = 22,
    bottom = 35
  const low = Math.max(0, Math.floor(Math.min(40, ...points.map((p) => p.share)) / 10) * 10)
  const high = Math.min(100, Math.ceil(Math.max(60, ...points.map((p) => p.share)) / 10) * 10)
  const ticks = Array.from({ length: (high - low) / 10 + 1 }, (_, i) => low + i * 10)
  const current = points.find((p) => Math.abs(p.time - at) <= 15)
  const x = (t: number) => left + (t / Math.max(1, duration)) * (w - left - right),
    y = (v: number) => top + ((high - v) / (high - low)) * (h - top - bottom)
  const segments: AdvantagePoint[][] = []
  for (const p of points) {
    const last = segments.at(-1)
    if (last && p.time - last.at(-1)!.time <= 30) last.push(p)
    else segments.push([p])
  }
  if (!points.length)
    return (
      <div className="review-no-curve">
        <span>Part des âmes</span>
        <strong>—</strong>
        <small>12 chronologies nécessaires</small>
      </div>
    )
  return (
    <div className="advantage-chart">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label="Part des âmes de votre équipe"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          onSelect(
            Math.max(
              0,
              Math.min(
                duration,
                ((((e.clientX - r.left) / r.width) * w - left) / (w - left - right)) * duration,
              ),
            ),
          )
        }}
      >
        <defs>
          <clipPath id={`${id}-clip`}>
            <rect x={left} y={top} width={w - left - right} height={h - top - bottom} />
          </clipPath>
        </defs>
        {ticks.map((v) => (
          <g key={v}>
            <line
              x1={left}
              x2={w - right}
              y1={y(v)}
              y2={y(v)}
              stroke={v === 50 ? '#ffefd760' : '#ffefd715'}
              strokeDasharray={v === 50 ? '5 5' : undefined}
            />
            <text x={left - 10} y={y(v) + 4} textAnchor="end" className="graph-label">
              {v}%
            </text>
          </g>
        ))}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <text key={t} x={x(t * duration)} y={h - 9} textAnchor="middle" className="graph-label">
            {clock(t * duration)}
          </text>
        ))}
        <g clipPath={`url(#${id}-clip)`}>
          {segments.map((s, i) =>
            s.length === 1 ? (
              <circle key={i} cx={x(s[0].time)} cy={y(s[0].share)} r="3" fill="#70F8C1" />
            ) : (
              <path
                key={i}
                d={s.map((p, j) => `${j ? 'L' : 'M'}${x(p.time)},${y(p.share)}`).join(' ')}
                stroke="#70F8C1"
                fill="none"
                strokeWidth="2.6"
              />
            ),
          )}
          <line
            x1={x(at)}
            x2={x(at)}
            y1={top}
            y2={h - bottom}
            stroke="#ffefd755"
            strokeDasharray="3 5"
          />
          {moments.map((m) => (
            <g
              key={m.id}
              tabIndex={0}
              role="button"
              aria-label={`Revoir ${clock(m.time)} : ${m.title}`}
              className="advantage-event"
              onClick={(e) => {
                e.stopPropagation()
                onMoment(m)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onMoment(m)
                }
              }}
            >
              <line x1={x(m.time)} x2={x(m.time)} y1={top} y2={h - bottom} stroke="#e78b7340" />
              <path d={`M${x(m.time) - 5},${top - 7}h10l-5,7Z`} fill="#e78b73" />
              <rect
                x={x(m.time) - 8}
                y={top - 8}
                width="16"
                height={h - top - bottom + 8}
                fill="transparent"
              />
              <title>
                {clock(m.time)} · {m.title}
              </title>
            </g>
          ))}
        </g>
      </svg>
      <div className="advantage-legend">
        <span>
          <i /> Votre équipe{' '}
          {current ? `· ${Math.round(current.share)}% à ${clock(current.time)}` : ''}
        </span>
        <span>50% · Équilibre économique</span>
      </div>
    </div>
  )
}
