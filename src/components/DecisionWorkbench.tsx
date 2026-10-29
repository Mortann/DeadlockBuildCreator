import { useMemo, useState } from 'react'
import {
  ArrowRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Coins,
  Crosshair,
  Info,
  Layers3,
  SlidersHorizontal,
  TriangleAlert,
} from 'lucide-react'
import {
  decisionAt,
  decisionCandidates,
  decisionContext,
  decisionMetrics,
  accuracyBefore,
  compareDecision,
  purchaseDecisions,
  type PurchaseDecision,
  type ReplayDraft,
  type DecisionPreference,
  initialAlternative,
} from '../domain/decisions'
import {
  heroes,
  source,
  statLabels,
  statUnit,
  topStats,
  itemDescription,
} from '../domain/catalogue'
import { modelLimitations } from '../domain/engine'
import type { BuildCase } from '../domain/review'
import type { Item, Match } from '../domain/types'
import { ItemArt, clock, number, ScopeBadge, shortNumber } from './GameUI'
import './DecisionWorkbench.css'
import presentation from '../data/itemPresentation.json'

const reasons = {
  mode: 'Mode non pris en charge',
  missing: 'Historique des achats absent',
  incomplete: 'Inventaire incomplet à cet instant',
  variant: 'Objet ou variante hors catalogue',
  simultaneous: 'Achats ou vente au même instant · ordre inconnu',
  owned: 'Achat déjà couvert par un objet détenu',
}
const decimal = (v: number) =>
  new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(v)
const effectDescription = (item: Item) =>
  (presentation as Record<string, { description?: string }>)[item.id]?.description ||
  itemDescription(item)
function InventoryIcons({ items }: { items: Item[] }) {
  return (
    <div className="decision-inventory-icons">
      {items.map((i) => (
        <span key={i.id} title={i.name}>
          <ItemArt item={i} />
        </span>
      ))}
      {!items.length && <span className="decision-empty-slot">—</span>}
    </div>
  )
}
export function DecisionWorkbench({
  match,
  cases,
  at,
  preferred,
  onStudy,
  onBack,
}: {
  match: Match
  cases: BuildCase[]
  at: number
  preferred?: DecisionPreference
  onStudy: (m: Match, t: number, draft?: ReplayDraft) => void
  onBack: () => void
}) {
  const decisions = useMemo(() => purchaseDecisions(match), [match])
  const [id, setId] = useState(() => decisionAt(decisions, at)?.id)
  const decision = decisions.find((d) => d.id === id) ?? decisions[0]
  const index = decision ? decisions.indexOf(decision) : -1
  return (
    <section className="decision-workbench" aria-label="Rejouer un achat">
      <header className="decision-heading">
        <div>
          <span className="eyebrow">Vos décisions d’achat</span>
          <h3>Et si j’avais choisi…</h3>
        </div>
        <button className="text-button" onClick={onBack}>
          <ChevronLeft size={14} />
          <span>Adaptations</span>
        </button>
        <span
          className="decision-price-basis"
          title="Tous les prix et propriétés sont ceux du catalogue local. Le patrimoine n’est pas du cash disponible ; les emplacements et déblocages ne sont pas reconstruits."
        >
          Projection · {source.version}
          <Info size={12} />
        </span>
      </header>
      <div className="decision-purchase-picker">
        <button
          className="icon-button"
          aria-label="Achat précédent"
          disabled={index <= 0}
          onClick={() => setId(decisions[index - 1].id)}
        >
          <ChevronLeft size={16} />
        </button>
        <label>
          <span>Achat de la partie</span>
          <select
            aria-label="Achat à rejouer"
            value={decision?.id ?? ''}
            disabled={!decision}
            onChange={(e) => setId(e.target.value)}
          >
            {decisions.map((d) => (
              <option key={d.id} value={d.id}>
                {clock(d.time)} · {d.item?.name ?? 'Objet inconnu'}
                {d.variant ? ' · variante' : ''}
              </option>
            ))}
          </select>
        </label>
        <button
          className="icon-button"
          aria-label="Achat suivant"
          disabled={index < 0 || index >= decisions.length - 1}
          onClick={() => setId(decisions[index + 1].id)}
        >
          <ChevronRight size={16} />
        </button>
        <span className="decision-purchase-count">
          {decision ? index + 1 : 0} / {decisions.length}
        </span>
      </div>
      {decision ? (
        <PurchaseComparison
          key={decision.id}
          match={match}
          decision={decision}
          cases={cases}
          preferred={preferred}
          onStudy={onStudy}
        />
      ) : (
        <div className="chapter-empty">
          <Layers3 />
          <strong>Achat non enregistré</strong>
          <span>Chargez les détails de cette partie pour comparer ses achats.</span>
        </div>
      )}
    </section>
  )
}
function PurchaseComparison({
  match,
  decision,
  cases,
  preferred,
  onStudy,
}: {
  match: Match
  decision: PurchaseDecision
  cases: BuildCase[]
  preferred?: DecisionPreference
  onStudy: (m: Match, t: number, draft?: ReplayDraft) => void
}) {
  const candidates = useMemo(
    () => decisionCandidates(match, decision, cases),
    [match, decision, cases],
  )
  const [alternativeId, setAlternativeId] = useState(
    () => initialAlternative(candidates, preferred, decision.time)?.id ?? '',
  )
  const [view, setView] = useState<'compare' | 'exchange' | 'inventory'>('compare')
  const [duration, setDuration] = useState(10),
    [resistance, setResistance] = useState(0),
    [accuracy, setAccuracy] = useState<number | null>(null)
  const observed = accuracyBefore(match, decision.time),
    precision = accuracy ?? observed?.value ?? 1
  const context = decisionContext(match, decision)
  const comparison = compareDecision(match, decision, alternativeId, {
    duration,
    accuracy: precision,
    resistance: resistance / 100,
    spiritApplied: false,
  })
  if (!comparison)
    return (
      <div className="decision-unavailable chapter-empty">
        <TriangleAlert />
        <strong>
          {context.reason ? reasons[context.reason] : 'Aucune alternative disponible'}
        </strong>
        <InventoryIcons items={context.before.items} />
        <button
          className="button"
          disabled={
            !context.before.items.length ||
            !heroes.some((h) => h.id === match.heroId) ||
            match.mode !== 1
          }
          onClick={() => onStudy(match, Math.max(-0.001, decision.time - 0.001))}
        >
          Étudier l’inventaire connu <ArrowUpRight size={14} />
        </button>
      </div>
    )
  const a = comparison.actual,
    b = comparison.alternative
  const differences = comparison.contributions.filter((p) => p.actual !== p.alternative)
  const measured = !!a.result && !!b.result
  return (
    <div className="purchase-comparison">
      <div className="decision-view-switch" role="group" aria-label="Vues de la décision">
        {(
          [
            { id: 'compare', label: 'Comparaison', icon: SlidersHorizontal },
            { id: 'exchange', label: 'Échange', icon: Crosshair },
            { id: 'inventory', label: 'Inventaire', icon: Layers3 },
          ] as const
        ).map((v) => (
          <button key={v.id} aria-pressed={view === v.id} onClick={() => setView(v.id)}>
            <v.icon size={14} />
            {v.label}
          </button>
        ))}
        <span className="decision-time">
          <Coins size={12} />
          <strong
            className={
              comparison.difference > 0 ? 'dearer' : comparison.difference < 0 ? 'cheaper' : ''
            }
          >
            {comparison.difference === 0
              ? 'Même coût'
              : `${comparison.difference > 0 ? '+' : ''}${number(comparison.difference)}`}
          </strong>
          <small>vs achat</small>
        </span>
      </div>
      <div className={`decision-panel panel-${view}`}>
        {view === 'compare' && (
          <>
            <div className="decision-pair">
              <article className="decision-choice choice-a">
                <span className="choice-letter">A</span>
                <ItemArt item={a.item} />
                <div>
                  <span className="eyebrow">Votre achat · {clock(decision.time)}</span>
                  <strong>{a.item.name}</strong>
                  <span className="decision-choice-price">
                    <Coins size={12} />
                    {number(a.cost)}
                    {a.consumed.length > 0 && <small>composants déduits</small>}
                  </span>
                  <div className="decision-item-stats">
                    {topStats(a.item).map(([key, value]) => (
                      <span key={key}>
                        {value > 0 ? '+' : ''}
                        {decimal(value)}
                        {statUnit(key)} {statLabels[key]}
                      </span>
                    ))}
                  </div>
                </div>
              </article>
              <article className="decision-choice choice-b">
                <span className="choice-letter">B</span>
                <ItemArt item={b.item} />
                <div>
                  <label>
                    <span className="eyebrow">À la place</span>
                    <select
                      aria-label="Objet alternatif"
                      value={alternativeId}
                      onChange={(e) => setAlternativeId(e.target.value)}
                    >
                      {candidates.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <span className="decision-choice-price">
                    <Coins size={12} />
                    {number(b.cost)}
                    {b.consumed.length > 0 && <small>composants déduits</small>}
                  </span>
                  <div className="decision-item-stats">
                    {topStats(b.item).map(([key, value]) => (
                      <span key={key}>
                        {value > 0 ? '+' : ''}
                        {decimal(value)}
                        {statUnit(key)} {statLabels[key]}
                      </span>
                    ))}
                  </div>
                </div>
              </article>
            </div>
            <div
              className="decision-metrics"
              aria-label={measured ? 'Projections comparées' : 'Contributions des objets'}
            >
              <div className="decision-metrics-heading">
                <span>
                  {measured
                    ? `Projection · ${duration} s · tirs ${Math.round(precision * 100)} % · cible ${resistance} %`
                    : 'Contributions des objets'}
                </span>
                <span>
                  A <i /> B
                </span>
                {measured ? (
                  <ScopeBadge compact />
                ) : (
                  <span title="Sommes des propriétés des objets du catalogue actuel, sans calcul des capacités ni des règles d’empilement.">
                    <Info size={12} />
                  </span>
                )}
              </div>
              {measured
                ? decisionMetrics.map((metric) => {
                    const first = a.result![metric.key],
                      second = b.result![metric.key],
                      max = Math.max(1, first, second)
                    return (
                      <div className="decision-metric" key={metric.key}>
                        <span>{metric.label}</span>
                        <strong className="metric-a">
                          {decimal(first)}
                          <small>{metric.unit}</small>
                        </strong>
                        <div className="decision-bar-pair">
                          <i className="bar-a" style={{ width: `${(first / max) * 100}%` }} />
                          <i className="bar-b" style={{ width: `${(second / max) * 100}%` }} />
                        </div>
                        <strong className="metric-b">
                          {decimal(second)}
                          <small>{metric.unit}</small>
                        </strong>
                        <span
                          className={`decision-delta ${second > first ? 'up' : second < first ? 'down' : ''}`}
                        >
                          {second === first
                            ? '='
                            : `${second > first ? '+' : ''}${decimal(second - first)}`}
                        </span>
                      </div>
                    )
                  })
                : differences.map((metric) => {
                    const max = Math.max(1, Math.abs(metric.actual), Math.abs(metric.alternative))
                    return (
                      <div className="decision-metric" key={metric.key}>
                        <span>{statLabels[metric.key]}</span>
                        <strong className="metric-a">
                          {decimal(metric.actual)}
                          {statUnit(metric.key)}
                        </strong>
                        <div className="decision-bar-pair">
                          <i
                            className="bar-a"
                            style={{ width: `${(Math.abs(metric.actual) / max) * 100}%` }}
                          />
                          <i
                            className="bar-b"
                            style={{ width: `${(Math.abs(metric.alternative) / max) * 100}%` }}
                          />
                        </div>
                        <strong className="metric-b">
                          {decimal(metric.alternative)}
                          {statUnit(metric.key)}
                        </strong>
                        <span className="decision-delta">
                          {metric.alternative > metric.actual ? '+' : ''}
                          {decimal(metric.alternative - metric.actual)}
                        </span>
                      </div>
                    )
                  })}
              {!measured && !differences.length && (
                <div className="decision-raw-empty">
                  Les propriétés simples sont identiques. Comparez les effets des objets.
                </div>
              )}
            </div>
            <div className="decision-effects">
              <span title={effectDescription(a.item)} tabIndex={0}>
                <Info size={12} />
                <strong>A</strong>
                {a.item.active
                  ? 'Actif hors courbe'
                  : a.result?.unsupported
                    ? 'Effets hors courbe'
                    : 'Propriétés de l’objet'}
                <span className="decision-effect-popover">{effectDescription(a.item)}</span>
              </span>
              <span title={effectDescription(b.item)} tabIndex={0}>
                <Info size={12} />
                <strong>B</strong>
                {b.item.active
                  ? 'Actif hors courbe'
                  : b.result?.unsupported
                    ? 'Effets hors courbe'
                    : 'Propriétés de l’objet'}
                <span className="decision-effect-popover">{effectDescription(b.item)}</span>
              </span>
            </div>
          </>
        )}
        {view === 'exchange' && (
          <>
            <div className="decision-chart-heading">
              <h4>Le temps de faire la différence</h4>
              <span title={modelLimitations}>
                Tirs + rechargements <ScopeBadge compact />
              </span>
            </div>
            {measured && comparison.actualSequence && comparison.alternativeSequence ? (
              <ShotChart
                actual={comparison.actualSequence}
                alternative={comparison.alternativeSequence}
                duration={duration}
              />
            ) : (
              <div className="chapter-empty">
                <Crosshair />
                <strong>Arme de ce héros non modélisée</strong>
                <span>La comparaison des objets et des coûts reste disponible.</span>
              </div>
            )}
            <div className="decision-settings">
              <label>
                <span>
                  Échange <strong>{duration} s</strong>
                </span>
                <input
                  aria-label="Durée de l’échange"
                  type="range"
                  min={2}
                  max={30}
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                />
              </label>
              <label>
                <span>
                  Précision <strong>{Math.round(precision * 100)} %</strong>
                </span>
                <input
                  aria-label="Précision de la projection"
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(precision * 100)}
                  onChange={(e) => setAccuracy(Number(e.target.value) / 100)}
                />
                <button
                  className="text-button"
                  type="button"
                  disabled={!observed}
                  title={
                    observed
                      ? `${observed.shots} tirs cumulés, relevé à ${clock(observed.at)} ; cibles de tout type`
                      : 'Aucun relevé antérieur à cet achat'
                  }
                  onClick={() => setAccuracy(null)}
                >
                  {observed && accuracy === null
                    ? 'Relevée avant l’achat'
                    : observed
                      ? 'Revenir au relevé'
                      : 'Réglage manuel'}
                </button>
              </label>
              <label>
                <span>
                  Résistance cible <strong>{resistance} %</strong>
                </span>
                <input
                  aria-label="Résistance cible de la projection"
                  type="range"
                  min={-50}
                  max={90}
                  value={resistance}
                  onChange={(e) => setResistance(Number(e.target.value))}
                />
              </label>
            </div>
          </>
        )}
        {view === 'inventory' && (
          <div className="decision-inventory-grid">
            <article>
              <header>
                <Layers3 size={15} />
                <strong>Avant l’achat</strong>
                <span>{clock(decision.time)}</span>
              </header>
              <InventoryIcons items={comparison.before} />
              <small>{comparison.before.length} objets</small>
            </article>
            {[
              { letter: 'A', value: a },
              { letter: 'B', value: b },
            ].map(({ letter, value }) => (
              <article key={letter} className={`inventory-${letter.toLowerCase()}`}>
                <header>
                  <span className="inventory-letter">{letter}</span>
                  <strong>{letter === 'A' ? 'Avec votre achat' : 'Avec l’alternative'}</strong>
                  <span>{value.items.length} objets</span>
                </header>
                <InventoryIcons items={value.items} />
                <div className="decision-components">
                  <span>Composants remplacés</span>
                  {value.consumed.length ? (
                    <InventoryIcons items={value.consumed} />
                  ) : (
                    <small>Aucun</small>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
      <footer className="decision-actions">
        <span
          className="decision-model-note"
          title={`${modelLimitations} Prix catalogue ${source.version}. Les coûts sont des dépenses comparées, pas une vérification du budget ni de l’espace d’inventaire.`}
        >
          <Info size={12} />
          {comparison.priceBasis === 'same' ? 'Catalogue de la partie' : 'Catalogue actuel'}
          {!measured ? ' · bonus des objets' : ' · arme de base'}
        </span>
        {comparison.activeLimit && (
          <span className="decision-slot-warning">
            <TriangleAlert size={12} />
            Plus de 4 actifs
          </span>
        )}
        <button
          className="button primary"
          disabled={!measured || comparison.activeLimit}
          title={
            !measured
              ? 'Ce héros n’a pas encore de modèle de combat dans le laboratoire'
              : comparison.activeLimit
                ? 'La proposition dépasse les quatre emplacements d’actifs'
                : 'Ouvrir les deux achats depuis le même inventaire et avec les mêmes réglages'
          }
          onClick={() =>
            onStudy(match, decision.time, {
              items: comparison.before,
              actualItemId: a.item.id,
              alternativeItemId: b.item.id,
              scenario: {
                duration,
                accuracy: precision,
                resistance: resistance / 100,
                spiritApplied: false,
              },
            })
          }
        >
          Comparer dans le laboratoire <ArrowUpRight size={14} />
        </button>
      </footer>
    </div>
  )
}
function ShotChart({
  actual,
  alternative,
  duration,
}: {
  actual: NonNullable<ReturnType<typeof compareDecision>>['actualSequence'] & {}
  alternative: NonNullable<ReturnType<typeof compareDecision>>['alternativeSequence'] & {}
  duration: number
}) {
  const width = 900,
    height = 330,
    left = 54,
    right = 20,
    top = 22,
    bottom = 65
  const max =
    Math.max(1, actual.shots.at(-1)?.damage ?? 0, alternative.shots.at(-1)?.damage ?? 0) * 1.08
  const x = (t: number) => left + (t / duration) * (width - left - right),
    y = (v: number) => height - bottom - (v / max) * (height - top - bottom)
  const path = (sequence: typeof actual) =>
    `M${left},${y(0)}` +
    sequence.shots.map((s) => `H${x(s.time)}V${y(s.damage)}`).join('') +
    `H${x(duration)}`
  return (
    <div className="decision-shot-chart">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Dégâts de tirs projetés et fenêtres de rechargement"
      >
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line
              x1={left}
              x2={width - right}
              y1={y(max * f)}
              y2={y(max * f)}
              className="chart-grid"
            />
            <text x={left - 10} y={y(max * f) + 4} textAnchor="end" className="graph-label">
              {shortNumber(max * f)}
            </text>
            <text x={x(duration * f)} y={height - 8} textAnchor="middle" className="graph-label">
              {decimal(duration * f)} s
            </text>
          </g>
        ))}
        <path d={path(actual)} className="shot-curve curve-a" fill="none" />
        <path d={path(alternative)} className="shot-curve curve-b" fill="none" />
        {[
          { letter: 'A', sequence: actual, offset: 0 },
          { letter: 'B', sequence: alternative, offset: 17 },
        ].map(({ letter, sequence, offset }) => (
          <g key={letter} className={`reload-row reload-${letter.toLowerCase()}`}>
            <text x={left - 20} y={height - 39 + offset} className="graph-label">
              {letter}
            </text>
            <line
              x1={left}
              x2={width - right}
              y1={height - 43 + offset}
              y2={height - 43 + offset}
              stroke="currentColor"
              strokeOpacity=".12"
            />
            {sequence.reloads.map((r, i) => (
              <rect
                className="reload-window"
                key={i}
                x={x(r.start)}
                y={height - 48 + offset}
                width={Math.max(0.5, x(r.end) - x(r.start))}
                height={10}
                rx={2}
              >
                <title>
                  Recharge {letter} · {decimal(r.start)}–{decimal(r.end)} s
                </title>
              </rect>
            ))}
          </g>
        ))}
      </svg>
      <div className="decision-chart-key">
        <span>
          <i className="key-a" />A · Votre achat
        </span>
        <span>
          <i className="key-b" />B · Alternative
        </span>
        <span className="reload-key">
          <i />
          Rechargement
        </span>
      </div>
    </div>
  )
}
