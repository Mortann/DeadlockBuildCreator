import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  Clock3,
  Coins,
  Database,
  Download,
  Eye,
  Flag,
  Info,
  LoaderCircle,
  MapPin,
  RefreshCw,
  Shield,
  Skull,
  Swords,
  Target,
  TriangleAlert,
  Upload,
} from 'lucide-react'
import type { Match, Profile } from '../domain/types'
import { importPlayerData, personalModel } from '../domain/player'
import { heroes, itemById } from '../domain/catalogue'
import { inventoryAt } from '../domain/engine'
import {
  actorsOf,
  comparableHistory,
  objectiveLabel,
  sceneAt,
  PROXIMITY_RADIUS,
  type BuildCase,
  type Evidence,
  type ReviewMoment,
  type ReviewOverview,
} from '../domain/review'
import { heroIdentity } from '../domain/heroRoster'
import { useReviewAnalysis } from '../hooks/useReviewAnalysis'
import { ApiError, getJson } from './PlayerDialog'
import { HeroPortrait, ItemArt, clock, number, shortNumber } from './GameUI'
import { MatchChart } from './MatchChart'
import { TacticalMap, type TacticalArrow } from './TacticalMap'
import { AdvantageChart } from './AdvantageChart'
import './ReviewChapters.css'

const EMPTY: Match[] = []
const chapters = [
  { name: 'Bilan', icon: Target, stage: 1 },
  { name: 'Moments clés', icon: MapPin, stage: 2 },
  { name: 'Build', icon: Shield, stage: 3 },
  { name: 'Vue d’ensemble', icon: Coins, stage: 4 },
]
const date = (v: number) =>
  v ? new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(v * 1000) : '—'
const heroOf = heroIdentity
const axisValue = (value: number, id: string) =>
  id === 'survival'
    ? new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(value)
    : shortNumber(value)
function EvidenceTiles({ evidence }: { evidence: Evidence[] }) {
  return (
    <div className="evidence-tiles">
      {evidence.map((e, i) => (
        <div key={`${e.label}-${i}`} className={e.tone ?? ''}>
          <strong>
            {number(Math.round(e.value))}
            <small>{e.unit}</small>
          </strong>
          <span>
            {e.label}
            {e.at !== undefined && <small className="evidence-at">{clock(e.at)}</small>}
          </span>
        </div>
      ))}
    </div>
  )
}
function ItemStrip({ ids }: { ids: string[] }) {
  return (
    <div className="review-item-strip">
      {ids.map((id, i) => {
        const item = itemById.get(id)
        return item ? (
          <span key={`${id}-${i}`} title={item.name}>
            <ItemArt item={item} />
          </span>
        ) : null
      })}
    </div>
  )
}
function MomentIcon({ moment }: { moment: ReviewMoment }) {
  return moment.kind === 'availability' ? (
    <Flag />
  ) : moment.kind === 'economy' ? (
    <Coins />
  ) : moment.kind === 'priority' ? (
    <Target />
  ) : (
    <Skull />
  )
}
function Overview({
  match,
  overview,
  moments,
  onMoment,
  onReferences,
  referenceBusy,
}: {
  match: Match
  overview: ReviewOverview
  moments: ReviewMoment[]
  onMoment: (m: ReviewMoment) => void
  onReferences?: () => void
  referenceBusy?: boolean
}) {
  const reasons = {
    references: '5 parties comparables minimum',
    dimensions: '3 axes comparables minimum',
    telemetry: 'Données partielles',
    mode: 'Mode non évalué',
    ready: `${overview.referenceCount} parties comparables`,
  }
  return (
    <div className="chapter-overview">
      <div className="overview-top">
        <section className="grade-card">
          <span className="eyebrow">Repère personnel</span>
          <div
            className={`review-grade grade-${overview.grade ?? 'none'}`}
            data-testid="review-grade"
          >
            {overview.grade ?? '—'}
          </div>
          <span className="grade-caption">{reasons[overview.gradeReason]}</span>
          <span
            className="grade-help"
            title="Comparaison aux parties antérieures : même héros, mode, durée proche et version si connue. Minimum 5 références et 3 axes variables. Victoire et défaite n’entrent pas dans le calcul."
          >
            <Info size={14} /> Performance observée
          </span>
          {onReferences && (
            <button
              className="text-button reference-loader"
              disabled={referenceBusy}
              onClick={onReferences}
            >
              {referenceBusy ? <LoaderCircle size={12} className="spin" /> : <Download size={12} />}
              Compléter les références
            </button>
          )}
        </section>
        <section className="stat-panel review-axis-panel">
          <div className="stat-panel-heading">
            <h3>Votre rythme</h3>
            <span>vs habituel</span>
          </div>
          {overview.axes.length ? (
            overview.axes.map((axis) => {
              const max = Math.max(1, axis.value, axis.reference)
              return (
                <div className="review-axis" key={axis.id}>
                  <div>
                    <span>{axis.label}</span>
                    <strong>
                      {axisValue(axis.value, axis.id)} <small>{axis.unit}</small>
                    </strong>
                  </div>
                  <div className="axis-bars">
                    <i style={{ width: `${(axis.value / max) * 100}%` }} />
                    <i
                      className="reference"
                      style={{ width: `${(axis.reference / max) * 100}%` }}
                    />
                  </div>
                  <small>
                    {axisValue(axis.reference, axis.id)} · {axis.count} parties
                  </small>
                </div>
              )
            })
          ) : (
            <div className="overview-kda">
              <div>
                <Swords />
                <strong>
                  {match.kills} / {match.deaths} / {match.assists}
                </strong>
                <span>K / D / A</span>
              </div>
              <div>
                <Coins />
                <strong>{shortNumber(match.netWorth)}</strong>
                <span>Âmes finales</span>
              </div>
              <div>
                <Clock3 />
                <strong>{clock(match.duration)}</strong>
                <span>Durée</span>
              </div>
            </div>
          )}
        </section>
      </div>
      <div className="coverage-row" aria-label="Données disponibles">
        {overview.coverage.map((c) => (
          <span
            key={c.key}
            className={c.available ? 'available' : 'missing'}
            title={c.available ? `${c.count} relevés` : 'Absent de cet import'}
          >
            {c.available ? <Check size={13} /> : <span className="coverage-dash">—</span>}
            {c.label}
          </span>
        ))}
      </div>
      <section className="priority-section">
        <div className="stat-panel-heading">
          <h3>À revoir en priorité</h3>
          <span>
            {moments.length ? `${moments.length} moment${moments.length > 1 ? 's' : ''}` : '—'}
          </span>
        </div>
        <div className="priority-cards">
          {moments.slice(0, 3).map((m, i) => (
            <button key={m.id} onClick={() => onMoment(m)} className="priority-card">
              <span className="priority-rank">0{i + 1}</span>
              <MomentIcon moment={m} />
              <span className="priority-time">{clock(m.time)}</span>
              <strong>{m.title}</strong>
              <span className={`proof ${m.proof}`}>
                {m.proof === 'observed' ? 'Observé' : 'Signal'}
              </span>
              <ChevronRight size={16} />
            </button>
          ))}
          {!moments.length && (
            <div className="chapter-empty">
              <Eye />
              <strong>Aucun moment isolé</strong>
              <span>
                {match.stats.length
                  ? 'Les données ne suffisent pas à qualifier une séquence.'
                  : 'Chargez les détails de la partie.'}
              </span>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
function MomentScene({
  match,
  moment,
  onBuild,
}: {
  match: Match
  moment: ReviewMoment
  onBuild: () => void
}) {
  const [phase, setPhase] = useState(1),
    [customTime, setCustomTime] = useState<number | null>(null)
  const times = [
    Math.max(moment.start, moment.time - 8),
    moment.time,
    moment.objective?.destroyedTime ?? moment.end,
  ]
  const time = customTime ?? times[phase],
    scene = sceneAt(match, time)
  const focus = scene.players.find((p) => p.id === String(match.accountId)) ?? scene.death
  const respawn = match.deathDetails?.find(
    (d) =>
      moment.deathTimes.includes(d.time) &&
      d.respawnDuration !== undefined &&
      moment.objective &&
      d.time <= moment.objective.destroyedTime &&
      d.time + d.respawnDuration! > moment.objective.destroyedTime,
  )
  const arrows: TacticalArrow[] = scene.trails.flatMap((trail) => {
    const p = trail.points.filter((p) => p.alive !== false && p.health !== 0)
    const a = p.at(-2),
      b = p.at(-1)
    return a &&
      b &&
      b.time - a.time <= 12 &&
      b.time <= time &&
      time - b.time <= 12 &&
      Math.hypot(a.x - b.x, a.y - b.y) > 20
      ? [{ from: a, to: b, kind: 'observed' as const, label: 'Déplacement entre deux relevés' }]
      : []
  })
  return (
    <div className="moment-workspace">
      <div className="scene-column">
        <div className="scene-phases" role="group" aria-label="Étapes de la séquence">
          {['Avant', 'Moment', 'Suite'].map((label, i) => (
            <button
              key={label}
              className={phase === i && customTime === null ? 'active' : ''}
              onClick={() => {
                setPhase(i)
                setCustomTime(null)
              }}
            >
              {label}
              <small>{clock(times[i])}</small>
            </button>
          ))}
        </div>
        <TacticalMap
          time={time}
          selfId={String(match.accountId)}
          selfTeam={match.team}
          players={scene.players}
          trails={scene.trails}
          death={scene.death}
          arrows={arrows}
          focus={focus ? { ...focus, radius: PROXIMITY_RADIUS } : undefined}
          highlightId={
            time >= moment.time && moment.damage?.actors[0]?.accountId
              ? String(moment.damage.actors[0].accountId)
              : undefined
          }
        />
        <div className="scene-slider">
          <span>{clock(moment.start)}</span>
          <input
            type="range"
            aria-label="Instant de la scène"
            min={moment.start}
            max={moment.end}
            step={1}
            value={time}
            onChange={(e) => setCustomTime(Number(e.target.value))}
          />
          <span>{clock(moment.end)}</span>
        </div>
      </div>
      <div className="moment-summary">
        <div className="moment-title">
          <span className={`proof ${moment.proof}`}>
            {moment.proof === 'observed' ? 'Observé' : 'Signal à examiner'}
          </span>
          <h3>{moment.title}</h3>
        </div>
        <EvidenceTiles evidence={moment.evidence} />
      </div>
      <div className="moment-reading">
        <EpisodeTimeline match={match} moment={moment} time={time} />
        {moment.damage && (
          <section className="damage-breakdown">
            <div className="stat-panel-heading">
              <h4>Sources de dégâts relevées</h4>
              <span>
                {clock(moment.damage.start)} — {clock(moment.damage.end)}
              </span>
            </div>
            {moment.damage.actors.slice(0, 4).map((actor) => (
              <div
                className="damage-actor"
                key={actor.slot}
                title={actor.sources.map((s) => `${s.name} : ${Math.round(s.value)}`).join('\n')}
              >
                <HeroPortrait
                  hero={heroOf(actor.heroId ?? 0)}
                  name={`#${actor.heroId}`}
                  size="tiny"
                />
                <div>
                  <span>{heroOf(actor.heroId ?? 0)?.name ?? `#${actor.heroId}`}</span>
                  <i style={{ width: `${(actor.damage / moment.damage!.total) * 100}%` }} />
                </div>
                <strong>{shortNumber(actor.damage)}</strong>
              </div>
            ))}
          </section>
        )}
        {respawn && moment.objective && (
          <div className="consequence-strip">
            <span>
              <Flag size={15} />
              {objectiveLabel(moment.objective)}
              <strong>{clock(moment.objective.destroyedTime)}</strong>
            </span>
            <ArrowRight size={17} />
            <span>
              <RefreshCw size={15} />
              Votre retour<strong>{clock(respawn.time + respawn.respawnDuration!)}</strong>
            </span>
          </div>
        )}
        <button className="button moment-build-link" onClick={onBuild}>
          <Shield size={15} />
          Comparer les options du build
          <ArrowUpRight size={15} />
        </button>
        {moment.local && (
          <span
            className="compact-note"
            title="Voisinage 2D, relevés de moins de 8 s. La hauteur, le terrain et la vision peuvent modifier l’engagement."
          >
            Rayon d’observation : {moment.local.radius} unités · 2D
          </span>
        )}
      </div>
    </div>
  )
}
function EpisodeTimeline({
  match,
  moment,
  time,
}: {
  match: Match
  moment: ReviewMoment
  time: number
}) {
  const pct = (t: number) =>
    Math.max(0, Math.min(100, ((t - moment.start) / Math.max(1, moment.end - moment.start)) * 100))
  return (
    <div className="episode-timeline" aria-label="Chronologie de la séquence">
      <div className="episode-track">
        <i className="episode-cursor" style={{ left: `${pct(time)}%` }}>
          <span>{clock(time)}</span>
        </i>
        {moment.deathTimes.map((t) => {
          const d = match.deathDetails?.find((d) => d.time === t)
          return (
            <span key={t}>
              {d?.respawnDuration !== undefined && (
                <i
                  className="respawn-band"
                  style={{ left: `${pct(t)}%`, width: `${pct(t + d.respawnDuration) - pct(t)}%` }}
                  title={`Indisponible ${d.respawnDuration} s`}
                />
              )}
              <Skull size={14} style={{ left: `${pct(t)}%` }}>
                <title>{clock(t)}</title>
              </Skull>
            </span>
          )
        })}
        {moment.objective && (
          <Flag
            size={15}
            className="objective-mark"
            style={{ left: `${pct(moment.objective.destroyedTime)}%` }}
          >
            <title>
              {objectiveLabel(moment.objective)} · {clock(moment.objective.destroyedTime)}
            </title>
          </Flag>
        )}
      </div>
      <div className="episode-key">
        <span>
          <Skull size={11} /> Décès
        </span>
        <span>
          <i /> Indisponibilité
        </span>
        {moment.objective && (
          <span>
            <Flag size={11} /> {objectiveLabel(moment.objective)}
          </span>
        )}
      </div>
    </div>
  )
}
function BuildAudit({
  match,
  cases,
  at,
  onAt,
  onStudy,
}: {
  match: Match
  cases: BuildCase[]
  at: number
  onAt: (n: number) => void
  onStudy: (m: Match, t: number) => void
}) {
  const [caseId, setCaseId] = useState<string | null>(null),
    selected = cases.find((c) => c.id === caseId) ?? cases[0],
    inventory = inventoryAt(match, at)
  return (
    <div className="build-audit">
      <div className="audit-cases">
        {cases.map((c) => (
          <button
            key={c.id}
            className={selected?.id === c.id ? 'active' : ''}
            onClick={() => {
              setCaseId(c.id)
              onAt(c.time)
            }}
          >
            <HeroPortrait hero={heroOf(c.targetHero)} name={`#${c.targetHero}`} size="tiny" />
            <span>
              <strong>{c.title}</strong>
              <small>
                {clock(c.time)} · {heroOf(c.targetHero)?.name ?? `#${c.targetHero}`}
              </small>
            </span>
            <ChevronRight size={15} />
          </button>
        ))}
      </div>
      {selected ? (
        <section className="stat-panel audit-detail">
          <div className="stat-panel-heading">
            <h3>{selected.title}</h3>
            <span className="chart-time">{clock(selected.time)}</span>
            <span className="proof signal">Option à comparer</span>
          </div>
          <div className="audit-context">
            <HeroPortrait
              hero={heroOf(selected.targetHero)}
              name={`#${selected.targetHero}`}
              size="large"
            />
            <div>
              <strong>{heroOf(selected.targetHero)?.name ?? `#${selected.targetHero}`}</strong>
              <ItemStrip ids={selected.enemyItems} />
            </div>
            <EvidenceTiles evidence={selected.evidence} />
          </div>
          <div className={`team-response ${selected.teamResponse}`}>
            <Shield size={16} />
            <span>
              {selected.teamResponse === 'equipped'
                ? selected.holderId === match.accountId
                  ? 'Réponse déjà équipée'
                  : 'Réponse équipée par un allié'
                : selected.teamResponse === 'not-recorded'
                  ? 'Aucune réponse équipée relevée'
                  : 'Couverture alliée incomplète'}
            </span>
            <ItemStrip ids={selected.responseItems} />
          </div>
          <div className="audit-options">
            {selected.actualPurchase && (
              <div className="actual-choice">
                <span className="eyebrow">Votre achat · {clock(selected.actualPurchase.time)}</span>
                <ItemStrip ids={[selected.actualPurchase.itemId]} />
                <strong>{itemById.get(selected.actualPurchase.itemId)?.name}</strong>
                <span>
                  <Coins size={13} />
                  {number(selected.actualPurchase.cost)}
                </span>
              </div>
            )}
            <div className="candidate-options">
              {selected.options.map((option) => (
                <div className="candidate-choice" key={option.itemId}>
                  <ItemStrip ids={[option.itemId]} />
                  <strong>{itemById.get(option.itemId)?.name}</strong>
                  <span className="candidate-effect">
                    {option.effect
                      ? `${selected.kind === 'healing' ? '−' : '+'}${number(option.effect)} ${option.unit}`
                      : '—'}
                  </span>
                  <span className="effect-name">
                    {selected.kind === 'healing'
                      ? 'Soins reçus'
                      : selected.kind === 'control'
                        ? 'Résistance aux effets'
                        : 'Réserve de santé'}
                  </span>
                  <small>{option.condition}</small>
                  <span className="option-cost">
                    <Coins size={12} />
                    {number(option.cost)}
                    {option.difference !== null && (
                      <small>
                        {option.difference >= 0 ? '+' : ''}
                        {number(option.difference)} vs achat
                      </small>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div
            className="audit-price-note"
            title="Coûts du catalogue actuel, composants détenus déduits. Le patrimoine ne donne pas les âmes disponibles à cet instant. Aucun résultat de combat n’est prédit."
          >
            <Info size={13} />
            {selected.priceVersion === 'same'
              ? 'Prix de cette version'
              : 'Prix du catalogue actuel'}{' '}
            · comparaison de coût
          </div>
        </section>
      ) : (
        <div className="chapter-empty">
          <Shield />
          <strong>Aucune adaptation étayée</strong>
          <span>Achats adverses et compteurs de combat nécessaires.</span>
        </div>
      )}
      <section className="stat-panel inventory-panel">
        <div className="stat-panel-heading">
          <h3>Votre inventaire</h3>
          <span className="chart-time">{clock(at)}</span>
          <span
            className="inventory-coverage"
            title={`${inventory.items.length} objets reconnus, ${inventory.unknown} non modélisés`}
          >
            <Check size={12} />
            {inventory.items.length}
            {inventory.unknown > 0 && (
              <span className="unknown-count">
                <TriangleAlert size={12} />
                {inventory.unknown}
              </span>
            )}
          </span>
        </div>
        <input
          type="range"
          aria-label="Instant de l’inventaire"
          min={0}
          max={match.duration}
          step={1}
          value={at}
          onChange={(e) => onAt(Number(e.target.value))}
        />
        <div className="observed-inventory">
          {inventory.items.map((item) => (
            <span key={item.id} title={item.name}>
              <ItemArt item={item} />
            </span>
          ))}
          {Array.from({ length: Math.max(0, 6 - inventory.items.length) }, (_, i) => (
            <span className="inventory-slot" key={i} />
          ))}
          {inventory.unknown > 0 && (
            <span className="inventory-slot unknown">
              ? <small>×{inventory.unknown}</small>
            </span>
          )}
        </div>
        <button
          className="button study-inventory"
          disabled={
            !inventory.items.length ||
            !heroes.some((h) => h.id === match.heroId) ||
            match.mode !== 1
          }
          onClick={() => onStudy(match, at)}
        >
          Étudier cet inventaire <ArrowUpRight size={15} />
        </button>
      </section>
    </div>
  )
}
function TeamSummary({ match }: { match: Match }) {
  const actors = actorsOf(match),
    max = Math.max(1, ...actors.map((p) => p.netWorth))
  return (
    <section className="stat-panel team-economy" aria-label="Contexte économique des équipes">
      <div className="stat-panel-heading">
        <h3>Équipes</h3>
        <span>Âmes finales</span>
      </div>
      <div className="team-economy-grid">
        {[0, 1].map((team) => (
          <div key={team} className={`team-column ${team === 0 ? 'amber' : 'sapphire'}`}>
            <header>
              <strong>
                {match.team === undefined
                  ? team === 0
                    ? 'Ambre'
                    : 'Saphir'
                  : team === match.team
                    ? 'Votre équipe'
                    : 'Adversaires'}
              </strong>
              <span>{actors.filter((p) => p.team === team).length} / 6</span>
            </header>
            {actors
              .filter((p) => p.team === team)
              .map((p) => (
                <div
                  className={`team-player ${p.accountId === match.accountId ? 'self' : ''}`}
                  key={p.accountId}
                >
                  <HeroPortrait hero={heroOf(p.heroId)} name={`#${p.heroId}`} size="tiny" />
                  <span className="team-player-name">
                    {p.accountId === match.accountId
                      ? 'Vous'
                      : (heroOf(p.heroId)?.name ?? `#${p.heroId}`)}
                  </span>
                  <span className="team-wealth-bar">
                    <i style={{ width: `${(p.netWorth / max) * 100}%` }} />
                  </span>
                  <strong>{p.netWorth ? shortNumber(p.netWorth) : '—'}</strong>
                </div>
              ))}
          </div>
        ))}
      </div>
    </section>
  )
}

export function Review({
  profile,
  onConnect,
  onImport,
  onBack,
  onStudy,
}: {
  profile: Profile | null
  onConnect: () => void
  onImport: (p: Profile) => void
  onBack: () => void
  onStudy: (m: Match, time: number) => void
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null),
    [chapter, setChapter] = useState(0),
    [momentId, setMomentId] = useState<string | null>(null),
    [at, setAt] = useState(600)
  const [error, setError] = useState(''),
    [busyId, setBusyId] = useState<string | null>(null)
  const [detailError, setDetailError] = useState<ApiError | null>(null)
  const [referenceIssues, setReferenceIssues] = useState<{
    loaded: number
    missing: number
  } | null>(null)
  const [referenceProgress, setReferenceProgress] = useState<{
    done: number
    total: number
  } | null>(null)
  const attempted = useRef(new Set<string>()),
    request = useRef(0)
  const matches = profile?.matches ?? EMPTY,
    selected = matches.find((m) => m.id === selectedId),
    analysis = useReviewAnalysis(selected, matches),
    moments = analysis.moments ?? [],
    moment = moments.find((m) => m.id === momentId) ?? moments[0]
  const refs = useMemo(
    () => (selected ? comparableHistory(selected, matches) : EMPTY),
    [selected, matches],
  )
  const reference = useMemo(
    () =>
      selected && refs.length >= 5
        ? personalModel(refs, selected.heroId).curve.filter((p) => p.samples >= 5)
        : [],
    [refs, selected],
  )
  const referenceCandidates = refs
    .filter(
      (m) =>
        !m.stats.some(
          (p) =>
            p.time >= m.duration * 0.85 &&
            p.damage !== undefined &&
            p.objectiveDamage !== undefined,
        ),
    )
    .slice(0, 5)
  const atTime = Math.min(at, selected?.duration ?? 0)
  useEffect(
    () => () => {
      request.current++
    },
    [profile?.accountId],
  )
  async function enrich(match: Match, recover = false) {
    const token = ++request.current
    setError('')
    setDetailError(null)
    setBusyId(match.id)
    try {
      const p = importPlayerData(
        await getJson(
          `/api/matches/${match.id}${recover ? '/recover' : ''}`,
          recover ? { method: 'POST', timeout: 95000 } : {},
        ),
        match.accountId,
        'api',
      )
      if (token === request.current) onImport(p)
    } catch (e) {
      if (token === request.current) {
        setDetailError(e instanceof ApiError ? e : null)
        setError(e instanceof Error ? e.message : 'Chargement impossible.')
      }
    } finally {
      if (token === request.current) setBusyId(null)
    }
  }
  async function enrichReferences() {
    if (!selected || !referenceCandidates.length) return
    const token = ++request.current,
      accountId = selected.accountId,
      loaded: Match[] = []
    setError('')
    setBusyId(selected.id)
    setReferenceProgress({ done: 0, total: referenceCandidates.length })
    let missing = 0
    setReferenceIssues(null)
    try {
      for (let index = 0; index < referenceCandidates.length; index++) {
        const candidate = referenceCandidates[index]
        try {
          const result = importPlayerData(
            await getJson(`/api/matches/${candidate.id}`),
            accountId,
            'api',
          )
          if (token !== request.current) return
          loaded.push(...result.matches)
        } catch (e) {
          if (token !== request.current) return
          missing++
          // Absent cached references do not stop the other candidates or mark the selected game missing.
          if (e instanceof ApiError && e.status === 429) {
            missing += referenceCandidates.length - index - 1
            break
          }
        }
        if (token === request.current)
          setReferenceProgress({ done: index + 1, total: referenceCandidates.length })
      }
      if (token === request.current && missing)
        setReferenceIssues({ loaded: loaded.length, missing })
    } finally {
      if (token === request.current) {
        if (loaded.length)
          onImport({ accountId, matches: loaded, updatedAt: new Date().toISOString() })
        setBusyId(null)
        setReferenceProgress(null)
      }
    }
  }
  useEffect(() => {
    if (
      selected &&
      (!selected.stats.length ||
        selected.telemetryWarnings?.some(
          (w) => w === 'combat-length-mismatch' || w === 'deaths-invalid-time-to-kill',
        )) &&
      !attempted.current.has(`${selected.accountId}:${selected.id}`)
    ) {
      attempted.current.add(`${selected.accountId}:${selected.id}`)
      void enrich(selected)
    }
  }, [selected]) // One metadata attempt per selection, never a polling loop.
  function openMoment(m: ReviewMoment) {
    setMomentId(m.id)
    setChapter(1)
  }
  function selectMatch(m: Match) {
    request.current++
    setBusyId(null)
    setReferenceProgress(null)
    setReferenceIssues(null)
    setDetailError(null)
    setError('')
    setSelectedId(m.id)
    setChapter(0)
    setMomentId(null)
    setAt(Math.min(600, m.duration))
  }
  return (
    <div className="review-page">
      <div className="section-toolbar">
        <button className="text-button" onClick={onBack}>
          <ArrowLeft size={16} /> Builds
        </button>
        <h1>Mes parties</h1>
        <button className="button" onClick={onConnect}>
          <Upload size={15} /> Importer
        </button>
      </div>
      {!profile ? (
        <div className="review-empty">
          <Database size={42} />
          <h2>Mes parties</h2>
          <button className="button primary" onClick={onConnect}>
            <Download size={15} /> Charger mon historique
          </button>
        </div>
      ) : (
        <div className="review-layout chapter-layout">
          <aside className="match-list" aria-label="Liste des parties">
            <div className="list-heading">
              Historique <span>{matches.length}</span>
            </div>
            {matches.map((m) => (
              <button
                className={`match-row ${selectedId === m.id ? 'selected' : ''}`}
                key={m.id}
                onClick={() => selectMatch(m)}
              >
                <HeroPortrait hero={heroOf(m.heroId)} name={`#${m.heroId}`} size="small" />
                <div>
                  <strong>{heroOf(m.heroId)?.name ?? `#${m.heroId}`}</strong>
                  <span>
                    {date(m.startTime)} · {clock(m.duration)}
                  </span>
                </div>
                <span className={`outcome ${m.outcome}`}>
                  {m.outcome === 'win' ? 'V' : m.outcome === 'loss' ? 'D' : '—'}
                </span>
                <ChevronRight size={15} />
              </button>
            ))}
          </aside>
          {!selected ? (
            <div className="review-empty select-match">
              <Target size={38} />
              <h2>Choisissez une partie</h2>
            </div>
          ) : (
            <div className="review-content chapter-content">
              <header className={`match-header team-${selected.team ?? 'unknown'}`}>
                <HeroPortrait
                  hero={heroOf(selected.heroId)}
                  name={`#${selected.heroId}`}
                  size="large"
                />
                <div>
                  <span className={`match-result ${selected.outcome}`}>
                    {selected.outcome === 'win'
                      ? 'Victoire'
                      : selected.outcome === 'loss'
                        ? 'Défaite'
                        : 'Résultat inconnu'}
                  </span>
                  <h2>{heroOf(selected.heroId)?.name ?? `Héros ${selected.heroId}`}</h2>
                  <div className="match-header-meta">
                    <span>#{selected.id}</span>
                    <span>{date(selected.startTime)}</span>
                    <span>
                      <Clock3 size={12} />
                      {clock(selected.duration)}
                    </span>
                    <span>
                      {selected.kills} / {selected.deaths} / {selected.assists}
                    </span>
                  </div>
                </div>
                <div className="match-header-actions">
                  <button
                    className="icon-button"
                    title="Actualiser les détails"
                    aria-label="Actualiser les détails"
                    disabled={busyId === selected.id}
                    onClick={() => void enrich(selected)}
                  >
                    {busyId === selected.id ? (
                      <LoaderCircle className="spin" size={16} />
                    ) : (
                      <RefreshCw size={16} />
                    )}
                  </button>
                </div>
              </header>
              <nav className="review-chapters" aria-label="Chapitres de la review">
                {chapters.map((c, i) => (
                  <button
                    key={c.name}
                    className={chapter === i ? 'active' : ''}
                    aria-current={chapter === i ? 'step' : undefined}
                    onClick={() => setChapter(i)}
                  >
                    <span className="chapter-index">0{i + 1}</span>
                    <c.icon size={17} />
                    <strong>{c.name}</strong>
                    {analysis.progress >= c.stage ? (
                      <Check size={13} className="chapter-ready" />
                    ) : (
                      <span className="chapter-pending" />
                    )}
                  </button>
                ))}
              </nav>
              {busyId === selected.id && (
                <div className="analysis-status">
                  <LoaderCircle size={13} className="spin" />
                  {referenceProgress
                    ? `Références ${referenceProgress.done} / ${referenceProgress.total}`
                    : 'Chargement des détails'}
                </div>
              )}
              {analysis.status === 'running' && (
                <div className="analysis-status" role="status">
                  <LoaderCircle size={13} className="spin" />
                  Analyse en cours <progress value={analysis.progress} max={4} />
                </div>
              )}
              {error && (
                <div className="error-box" role="alert">
                  {error}
                  <div className="metadata-recovery">
                    {detailError?.recoverable && (
                      <button
                        className="button"
                        disabled={busyId !== null}
                        onClick={() => void enrich(selected, true)}
                      >
                        <Download size={13} />
                        Récupérer via Steam
                      </button>
                    )}
                    <a
                      href="https://deadlock-api.com/ingest-cache"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Synchroniser les parties <ArrowUpRight size={13} />
                    </a>
                  </div>
                </div>
              )}
              {referenceIssues && (
                <div className="reference-problems" role="status">
                  <Info size={13} />
                  <span>
                    Références : {referenceIssues.loaded} chargées · {referenceIssues.missing} non
                    chargées
                  </span>
                  <a href="https://deadlock-api.com/ingest-cache" target="_blank" rel="noreferrer">
                    Synchroniser
                    <ArrowUpRight size={11} />
                  </a>
                </div>
              )}
              {analysis.status === 'error' && (
                <div className="error-box" role="alert">
                  {analysis.error}
                  <button className="button" onClick={analysis.retry}>
                    Relancer
                  </button>
                </div>
              )}
              {selected.telemetryWarnings?.length ? (
                <div className="compact-warning" title={selected.telemetryWarnings.join('\n')}>
                  <TriangleAlert size={13} /> Données partielles
                </div>
              ) : null}
              <div className="chapter-body" key={`${selected.id}-${chapter}`}>
                {chapter === 0 && analysis.overview && (
                  <Overview
                    match={selected}
                    overview={analysis.overview}
                    moments={moments}
                    onMoment={openMoment}
                    onReferences={
                      analysis.overview.grade === null && referenceCandidates.length
                        ? () => void enrichReferences()
                        : undefined
                    }
                    referenceBusy={busyId !== null}
                  />
                )}
                {chapter === 1 &&
                  analysis.moments &&
                  (moment ? (
                    <div className="moments-chapter">
                      <div className="moment-rail" aria-label="Moments détectés">
                        {moments.map((m, i) => (
                          <button
                            key={m.id}
                            className={moment.id === m.id ? 'active' : ''}
                            onClick={() => setMomentId(m.id)}
                          >
                            <span>0{i + 1}</span>
                            <MomentIcon moment={m} />
                            <strong>{clock(m.time)}</strong>
                            <span>{m.title}</span>
                          </button>
                        ))}
                      </div>
                      <MomentScene
                        key={moment.id}
                        match={selected}
                        moment={moment}
                        onBuild={() => {
                          setAt(moment.time)
                          setChapter(2)
                        }}
                      />
                    </div>
                  ) : (
                    <div className="chapter-empty">
                      <Eye />
                      <strong>Aucun moment isolé</strong>
                      <span>Chargez les positions, décès et objectifs.</span>
                    </div>
                  ))}
                {chapter === 2 && analysis.build && (
                  <BuildAudit
                    key={selected.id}
                    match={selected}
                    cases={analysis.build}
                    at={atTime}
                    onAt={setAt}
                    onStudy={onStudy}
                  />
                )}
                {chapter === 3 && analysis.advantage && (
                  <div className="overview-charts">
                    <section className="stat-panel">
                      <div className="stat-panel-heading">
                        <h3>Part des âmes</h3>
                        <span title="Patrimoine de votre équipe / patrimoine des deux équipes. Interpolation entre relevés selon leur cadence, sans extrapolation. 12 chronologies exigées.">
                          <Info size={14} />
                        </span>
                      </div>
                      <AdvantageChart
                        at={atTime}
                        onMoment={openMoment}
                        points={analysis.advantage}
                        duration={selected.duration}
                        moments={moments}
                        onSelect={setAt}
                      />
                    </section>
                    <section className="stat-panel match-graph-panel">
                      <div className="stat-panel-heading">
                        <h3>Économie</h3>
                        <span className="chart-time">{clock(atTime)}</span>
                      </div>
                      <MatchChart
                        match={selected}
                        at={atTime}
                        onSelect={setAt}
                        reference={reference}
                      />
                      {!selected.stats.length && (
                        <button
                          className="button empty-chart-action"
                          onClick={() => void enrich(selected)}
                          disabled={busyId === selected.id}
                        >
                          <Download size={14} /> Charger la chronologie
                        </button>
                      )}
                    </section>
                    <div className="overview-jump">
                      <button className="button" onClick={() => setChapter(2)}>
                        Inventaire à {clock(atTime)} <ArrowRight size={14} />
                      </button>
                    </div>
                    <TeamSummary match={selected} />
                  </div>
                )}
                {analysis.progress < chapters[chapter].stage && analysis.status !== 'error' && (
                  <div className="chapter-loading">
                    <LoaderCircle className="spin" />
                    <span>Calcul du chapitre</span>
                  </div>
                )}
              </div>
              <footer className="chapter-footer">
                <button
                  className="text-button"
                  disabled={chapter === 0}
                  onClick={() => setChapter((n) => n - 1)}
                >
                  <ArrowLeft size={15} /> Précédent
                </button>
                <span>{chapter + 1} / 4</span>
                <button
                  className="button"
                  disabled={chapter === 3}
                  onClick={() => setChapter((n) => n + 1)}
                >
                  Suivant <ArrowRight size={15} />
                </button>
              </footer>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
