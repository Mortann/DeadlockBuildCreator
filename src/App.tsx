import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  Check,
  ChevronDown,
  Clock3,
  Coins,
  Crosshair,
  Database,
  Download,
  Flame,
  GitCompareArrows,
  Heart,
  HeartOff,
  Info,
  Layers3,
  Link2,
  Plus,
  Search,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Target,
  Trash2,
  Upload,
  UserRound,
  X,
  Zap,
} from 'lucide-react'
import {
  catalogue,
  categoryLabels,
  heroes,
  initialBuild,
  itemById,
  phases,
  phaseLabels,
  source,
  statLabels,
  statUnit,
  topStats,
} from './domain/catalogue'
import {
  buildCurve,
  compareAddition,
  inventoryAt,
  personalCore,
  sortedEntries,
  validateBuild,
} from './domain/engine'
import { mergeAccountData } from './domain/account'
import { mergeMatches, personalModel } from './domain/player'
import {
  activeProfileId,
  clearProfiles,
  loadProfile,
  readLegacyProfile,
  saveProfile,
} from './domain/profileStorage'
import type { Build, BuildEntry, Category, Item, Phase, Profile, Scenario } from './domain/types'
import { metricLabels, PowerChart, type Metric } from './components/PowerChart'
import { PlayerDialog } from './components/PlayerDialog'
import {
  HeroPortrait,
  ItemArt,
  ItemTile,
  Modal,
  ScopeBadge,
  clock,
  metricIcons,
  number,
  roman,
  shortNumber,
} from './components/GameUI'
import presentation from './data/itemPresentation.json'

const STORAGE = 'deadlock.atelier.'
const Review = lazy(() =>
  import('./components/Review').then((module) => ({ default: module.Review })),
)
function readBuild(key: string): Build | null {
  try {
    const b = validateBuild(JSON.parse(localStorage.getItem(STORAGE + key) ?? 'null'))
    return b && heroes.some((h) => h.id === b.heroId) ? b : null
  } catch {
    return null
  }
}
function downloadBuild(build: Build) {
  const url = URL.createObjectURL(
    new Blob(
      [
        JSON.stringify(
          { format: 'deadlock-atelier/v1', clientVersion: source.version, build },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    ),
  )
  const a = document.createElement('a')
  a.href = url
  a.download = 'deadlock-build.json'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function BuildLinks({
  owned,
  spiritApplied,
  onSpirit,
}: {
  owned: Item[]
  spiritApplied: boolean
  onSpirit: () => void
}) {
  const clip = owned.find((i) => (i.properties.BonusClipSizePercent ?? 0) > 0),
    fire = owned.find((i) => (i.properties.BonusFireRate ?? 0) > 0)
  const shred = owned.find((i) => i.id === 'upgrade_bullet_resist_shredder'),
    heal = owned.find((i) => i.id === 'upgrade_healbane')
  if (!(clip && fire) && !shred && !heal) return null
  return (
    <div className="build-links" aria-label="Interactions du build">
      {clip && fire && (
        <div
          className="build-link"
          title="Cadence × chargeur : prolonge la séquence avant rechargement"
        >
          <ItemArt item={fire} />
          <span>×</span>
          <ItemArt item={clip} />
          <ArrowRight size={13} />
          <Zap size={20} />
        </div>
      )}
      {shred && (
        <button
          className={`build-link ${spiritApplied ? 'applied' : 'conditional'}`}
          aria-label="Appliquer la réduction de Bullet Resist Shredder"
          aria-pressed={spiritApplied}
          title="Nécessite des dégâts Spirit avant les tirs"
          onClick={onSpirit}
        >
          <Flame size={23} />
          <ArrowRight size={13} />
          <ItemArt item={shred} />
          <ArrowRight size={13} />
          <Crosshair size={23} />
        </button>
      )}
      {heal && (
        <div
          className="build-link conditional"
          title="Spirit → Healbane → réduction des soins. Effet hors calcul."
        >
          <Flame size={23} />
          <ArrowRight size={13} />
          <ItemArt item={heal} />
          <ArrowRight size={13} />
          <HeartOff size={23} />
        </div>
      )}
    </div>
  )
}

export default function App() {
  const [build, setBuild] = useState<Build>(() => readBuild('build') ?? initialBuild())
  const [reference, setReference] = useState<Build | null>(() => readBuild('reference'))
  const [profile, setProfile] = useState<Profile | null>(() => readLegacyProfile())
  const [profileReady, setProfileReady] = useState(false)
  const profileAction = useRef(0)
  const currentProfile = useRef(profile)
  currentProfile.current = profile
  const [page, setPage] = useState<'lab' | 'review'>(() =>
      new URLSearchParams(location.search).has('steam') ? 'review' : 'lab',
    ),
    [tab, setTab] = useState<'build' | 'compare'>('build')
  const [playerOpen, setPlayerOpen] = useState(() =>
      new URLSearchParams(location.search).has('steam'),
    ),
    [infoOpen, setInfoOpen] = useState(false),
    [inspected, setInspected] = useState<Item | null>(null)
  const [category, setCategory] = useState<Category | 'all'>('all'),
    [query, setQuery] = useState(''),
    [tier, setTier] = useState(0),
    [visible, setVisible] = useState(18)
  const [phase, setPhase] = useState<Phase>('lane'),
    [situational, setSituational] = useState(false)
  const [metric, setMetric] = useState<Metric>('sustained'),
    [timeAxis, setTimeAxis] = useState(false),
    [selected, setSelected] = useState(999)
  const [manualAccuracy, setManualAccuracy] = useState(65),
    [personalAccuracy, setPersonalAccuracy] = useState(true),
    [resistance, setResistance] = useState(20),
    [duration, setDuration] = useState(10),
    [spiritApplied, setSpiritApplied] = useState(false),
    [rate, setRate] = useState(900)
  const [optionA, setOptionA] = useState('upgrade_rapid_rounds'),
    [optionB, setOptionB] = useState('upgrade_clip_size')
  const [toast, setToast] = useState(''),
    [storageError, setStorageError] = useState(false)
  const hero = heroes.find((h) => h.id === build.heroId) ?? heroes[0]
  const personal = useMemo(() => personalModel(profile?.matches ?? [], hero.id), [profile, hero.id])
  const scenario: Scenario = {
    accuracy:
      personalAccuracy && personal.accuracy !== null ? personal.accuracy : manualAccuracy / 100,
    resistance: resistance / 100,
    duration,
    spiritApplied,
  }
  const points = buildCurve(build, hero, scenario, personal, rate)
  const index = Math.min(selected, points.length - 1),
    current = points[index],
    final = points.at(-1)!
  const referencePoints =
    reference?.heroId === hero.id
      ? buildCurve(reference, hero, scenario, personal, rate)
      : undefined
  const observedCore = useMemo(
    () => personalCore(profile?.matches ?? [], hero.id),
    [profile, hero.id],
  )
  const filtered = catalogue
    .filter(
      (i) =>
        (category === 'all' || i.category === category) &&
        (!tier || i.tier === tier) &&
        i.name.toLocaleLowerCase('fr').includes(query.toLocaleLowerCase('fr')),
    )
    .sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name))
  const currentMetricIcon = metricIcons[metric]
  const MetricIcon = currentMetricIcon
  const inspectedEntry = inspected
    ? build.entries.find((e) => e.itemId === inspected.id)
    : undefined
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE + 'build', JSON.stringify(build))
      reference
        ? localStorage.setItem(STORAGE + 'reference', JSON.stringify(reference))
        : localStorage.removeItem(STORAGE + 'reference')
    } catch {
      setStorageError(true)
    }
  }, [build, reference])
  useEffect(() => {
    const account = activeProfileId(),
      action = profileAction.current
    if (account === null) {
      setProfileReady(true)
      return
    }
    let cancelled = false
    void loadProfile(account)
      .then((saved) => {
        if (!cancelled && action === profileAction.current && saved) {
          currentProfile.current = saved
          setProfile(saved)
        }
      })
      .catch(() => {
        if (!cancelled && action === profileAction.current) setStorageError(true)
      })
      .finally(() => {
        if (!cancelled && action === profileAction.current) setProfileReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [])
  useEffect(() => {
    if (!profile || !profileReady) return
    void saveProfile(profile).catch(() => setStorageError(true))
  }, [profile, profileReady])
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(''), 3500)
      return () => clearTimeout(timer)
    }
  }, [toast])
  useEffect(() => {
    setVisible(18)
  }, [category, query, tier])
  function acceptProfile(incoming: Profile) {
    const action = ++profileAction.current
    const active = currentProfile.current
    const apply = (previous: Profile | null) => {
      if (action !== profileAction.current) return
      const next = {
        ...incoming,
        account: mergeAccountData(previous?.account, incoming.account),
        historySync: incoming.historySync ?? previous?.historySync,
        matches: mergeMatches(previous?.matches ?? [], incoming.matches),
      }
      currentProfile.current = next
      setProfileReady(true)
      setProfile(next)
      setToast('Parties importées')
    }
    if (active?.accountId === incoming.accountId) apply(active)
    else
      void loadProfile(incoming.accountId)
        .then(apply)
        .catch(() => {
          if (action !== profileAction.current) return
          apply(readLegacyProfile(incoming.accountId))
        })
  }
  function clearProfile() {
    profileAction.current++
    currentProfile.current = null
    setProfileReady(true)
    setProfile(null)
    try {
      void clearProfiles().catch(() => setStorageError(true))
    } catch {
      setStorageError(true)
    }
    setToast('Données supprimées')
  }
  function addItem(item: Item) {
    if (build.entries.some((e) => e.itemId === item.id)) return
    if (build.entries.length >= 40) {
      setToast('40 objets maximum')
      return
    }
    setBuild((b) => ({
      ...b,
      entries: [
        ...b.entries,
        { id: crypto.randomUUID(), itemId: item.id, phase, situational, note: '' },
      ],
    }))
    setSelected(999)
  }
  function removeItem(id: string) {
    setBuild((b) => ({ ...b, entries: b.entries.filter((e) => e.id !== id) }))
  }
  function updateEntry(id: string, patch: Partial<BuildEntry>) {
    setBuild((b) => ({
      ...b,
      entries: b.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    }))
  }
  function moveEntry(id: string, direction: number) {
    setBuild((b) => {
      const entries = [...b.entries],
        at = entries.findIndex((e) => e.id === id),
        entry = entries[at]
      const same = entries
        .map((e, i) => (e.phase === entry.phase && e.situational === entry.situational ? i : -1))
        .filter((i) => i >= 0)
      const target = same[same.indexOf(at) + direction]
      if (target !== undefined) [entries[at], entries[target]] = [entries[target], entries[at]]
      return { ...b, entries }
    })
  }
  async function importBuild(file?: File) {
    if (!file) return
    try {
      if (file.size > 100000) throw new Error('Fichier trop volumineux')
      const raw = JSON.parse(await file.text()),
        imported = validateBuild(raw.build ?? raw)
      if (!imported || !heroes.some((h) => h.id === imported.heroId))
        throw new Error('Build incompatible')
      setReference(build)
      setBuild(imported)
      setSelected(999)
      setToast('Build importé · ancien plan en référence')
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Import impossible')
    }
  }
  function buildCard(entry: BuildEntry, i: number, entries: BuildEntry[]) {
    const item = itemById.get(entry.itemId)!
    const point = points.findIndex((p) => p.entry?.id === entry.id)
    return (
      <div className="build-item" key={entry.id}>
        <ItemTile
          item={item}
          selected={point === index}
          label={`Sélectionner ${item.name} dans le build`}
          onClick={() => {
            if (point >= 0) setSelected(point)
          }}
          onInspect={() => setInspected(item)}
          actions={
            <>
              <button
                aria-label={`Monter ${item.name}`}
                disabled={i === 0}
                onClick={() => moveEntry(entry.id, -1)}
              >
                <ArrowUp size={13} />
              </button>
              <button
                aria-label={`Descendre ${item.name}`}
                disabled={i === entries.length - 1}
                onClick={() => moveEntry(entry.id, 1)}
              >
                <ArrowDown size={13} />
              </button>
              <button aria-label={`Retirer ${item.name}`} onClick={() => removeItem(entry.id)}>
                <X size={13} />
              </button>
            </>
          }
        />
        {entry.situational && entry.note && (
          <span className="condition-mark" title={entry.note}>
            <GitCompareArrows size={11} />
          </span>
        )}
      </div>
    )
  }
  return (
    <div className="app-shell">
      <header className="game-topbar">
        <a
          href="#laboratoire"
          className="brand"
          aria-label="Deadlock Atelier — laboratoire"
          onClick={() => setPage('lab')}
        >
          DEADLOCK<span>BUILD LAB</span>
        </a>
        <nav aria-label="Navigation principale">
          <button className={page === 'lab' ? 'active' : ''} onClick={() => setPage('lab')}>
            <Layers3 size={16} />
            Builds
          </button>
          <button className={page === 'review' ? 'active' : ''} onClick={() => setPage('review')}>
            <Activity size={16} />
            Mes parties
          </button>
        </nav>
        <div className="topbar-actions">
          <button
            className="icon-button"
            aria-label="Sources et calculs"
            title="Sources et calculs"
            onClick={() => setInfoOpen(true)}
          >
            <Info size={17} />
          </button>
          <button
            className={`profile-button ${profile ? 'connected' : ''}`}
            aria-label={profile ? `Compte ${profile.accountId}` : 'Mon profil'}
            onClick={() => setPlayerOpen(true)}
          >
            <UserRound size={16} />
            <span>{profile ? (profile.account?.name ?? profile.accountId) : 'Mon profil'}</span>
            <ChevronDown size={12} />
          </button>
        </div>
      </header>
      <main id="laboratoire">
        {storageError && (
          <div className="error-box" role="alert">
            Sauvegarde locale impossible. Exportez le build avant de quitter.
          </div>
        )}
        {page === 'review' ? (
          <Suspense
            fallback={
              <div className="review-open-loading" role="status">
                <Activity size={20} />
                <span>Ouverture des parties</span>
              </div>
            }
          >
            <Review
              profile={profile}
              onConnect={() => setPlayerOpen(true)}
              onImport={acceptProfile}
              onBack={() => setPage('lab')}
              onStudy={(match, at, draft) => {
                const inventory = draft ? { items: draft.items } : inventoryAt(match, at)
                setReference(build)
                setBuild({
                  name: `${draft ? 'Décision' : 'Inventaire'} #${match.id} · ${clock(at)}`,
                  heroId: match.heroId,
                  entries: inventory.items.map((item) => ({
                    id: crypto.randomUUID(),
                    itemId: item.id,
                    phase: 'lane',
                    situational: false,
                    note: '',
                  })),
                })
                setPage('lab')
                if (draft) {
                  setOptionA(draft.actualItemId)
                  setOptionB(draft.alternativeItemId)
                  setTab('compare')
                  setManualAccuracy(draft.scenario.accuracy * 100)
                  setPersonalAccuracy(false)
                  setResistance(draft.scenario.resistance * 100)
                  setDuration(draft.scenario.duration)
                  setSpiritApplied(draft.scenario.spiritApplied)
                }
                setSelected(999)
                setToast('Inventaire chargé · règles actuelles')
              }}
            />
          </Suspense>
        ) : (
          <>
            <div className="build-heading">
              <HeroPortrait hero={hero} />
              <div className="build-heading-main">
                <label className="hero-select">
                  <select
                    aria-label="Héros du build"
                    value={hero.id}
                    onChange={(e) => {
                      setBuild((b) => ({ ...b, heroId: Number(e.target.value) }))
                      setSelected(999)
                    }}
                  >
                    {heroes.map((h) => (
                      <option value={h.id} key={h.id}>
                        {h.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={15} />
                </label>
                <input
                  className="build-name"
                  aria-label="Nom du build"
                  value={build.name}
                  onChange={(e) => setBuild((b) => ({ ...b, name: e.target.value.slice(0, 100) }))}
                />
              </div>
              <div
                className="build-budget"
                title="Budget du noyau, composants remplacés pris en compte"
              >
                <Coins size={20} />
                <strong>{number(final.budget)}</strong>
              </div>
              <button
                className={`player-source ${personal.matches ? 'connected' : ''}`}
                aria-label={
                  personal.matches
                    ? `${personal.matches} parties de ${hero.name}`
                    : 'Relier mes parties'
                }
                title={
                  personal.detailed
                    ? `${personal.detailed} chronologies du héros. Économie et précision observées utilisées si disponibles.`
                    : 'Données personnelles'
                }
                onClick={() => setPlayerOpen(true)}
              >
                <Activity size={17} />
                {personal.matches ? (
                  <span>
                    {personal.matches} {personal.matches === 1 ? 'partie' : 'parties'}
                  </span>
                ) : (
                  <span>Mes données</span>
                )}
              </button>
              <div className="build-heading-actions">
                <label
                  className="icon-button file-input-label"
                  title="Importer un build"
                  aria-label="Importer un build"
                >
                  <Upload size={17} />
                  <input
                    type="file"
                    accept=".json,application/json"
                    hidden
                    onChange={(e) => {
                      void importBuild(e.target.files?.[0])
                      e.target.value = ''
                    }}
                  />
                </label>
                <button
                  className="icon-button"
                  aria-label="Exporter le build"
                  title="Exporter"
                  onClick={() => downloadBuild(build)}
                >
                  <Download size={17} />
                </button>
              </div>
            </div>
            <div className="lab-layout">
              <div className="build-column">
                <nav className="category-rail" aria-label="Catégories d’objets">
                  {(
                    [
                      { id: 'all', Icon: Layers3, label: 'Tous' },
                      { id: 'weapon', Icon: Crosshair, label: 'Arme' },
                      { id: 'vitality', Icon: Plus, label: 'Vitalité' },
                      { id: 'spirit', Icon: Flame, label: 'Esprit' },
                    ] as const
                  ).map(({ id, Icon, label }) => (
                    <button
                      className={`category-button ${id} ${category === id ? 'active' : ''}`}
                      key={id}
                      onClick={() => {
                        setCategory(id)
                        setTab('build')
                      }}
                      aria-pressed={category === id}
                    >
                      <Icon size={27} strokeWidth={1.8} />
                      <span>{label}</span>
                    </button>
                  ))}
                  <button
                    className="category-search"
                    aria-label="Rechercher dans le catalogue"
                    onClick={() => document.getElementById('item-search')?.focus()}
                  >
                    <Search size={24} />
                  </button>
                </nav>
                <section className="build-panel" aria-label="Création du build">
                  <div className="build-panel-tools">
                    <h1>Mon build</h1>
                    {observedCore.length > 0 && (
                      <button
                        className="text-button personal-core-button"
                        title="Point de départ : vos achats les plus fréquents. Les phases restent modifiables."
                        onClick={() => {
                          setReference(build)
                          setBuild((b) => ({
                            ...b,
                            name: `Mes habitudes · ${hero.name}`,
                            entries: observedCore,
                          }))
                          setSelected(999)
                          setToast('Noyau issu de vos achats')
                        }}
                      >
                        <Sparkles size={14} />
                        Proposer un noyau
                      </button>
                    )}
                    <span
                      className="save-indicator"
                      title={
                        storageError ? 'Sauvegarde impossible' : 'Enregistré dans ce navigateur'
                      }
                    >
                      <Check size={13} />
                    </span>
                  </div>
                  <div className="phase-grid">
                    {phases.map((p) => (
                      <section
                        className={`phase-column ${phase === p && !situational ? 'target-phase' : ''}`}
                        key={p}
                      >
                        <header>
                          <h2>{phaseLabels[p]}</h2>
                          <button
                            className="icon-button"
                            aria-label={`Ajouter à ${phaseLabels[p]}`}
                            title={`Ajouter à ${phaseLabels[p]}`}
                            onClick={() => {
                              setPhase(p)
                              setSituational(false)
                            }}
                          >
                            <Plus size={15} />
                          </button>
                        </header>
                        <div className="phase-items">
                          {build.entries
                            .filter((e) => e.phase === p && !e.situational)
                            .map(buildCard)}
                          {!build.entries.some((e) => e.phase === p && !e.situational) && (
                            <button
                              className="empty-build-slot"
                              aria-label={`Préparer ${phaseLabels[p]}`}
                              onClick={() => {
                                setPhase(p)
                                setSituational(false)
                              }}
                            >
                              <Plus size={24} />
                            </button>
                          )}
                        </div>
                      </section>
                    ))}
                  </div>
                  <section className={`adaptation-group ${situational ? 'target-phase' : ''}`}>
                    <header>
                      <h2>
                        Adaptations <span>OPTIONNEL</span>
                      </h2>
                      <button
                        className="icon-button"
                        aria-label="Ajouter une adaptation"
                        title="Ajouter une adaptation"
                        onClick={() => setSituational(true)}
                      >
                        <Plus size={16} />
                      </button>
                    </header>
                    <div className="adaptation-items">
                      {build.entries.filter((e) => e.situational).map(buildCard)}
                      {!build.entries.some((e) => e.situational) && (
                        <button
                          className="empty-adaptation"
                          aria-label="Préparer une variante"
                          onClick={() => setSituational(true)}
                        >
                          <Shield size={22} />
                          <Plus size={13} />
                        </button>
                      )}
                    </div>
                  </section>
                </section>
                <section className="catalogue-panel" id="catalogue">
                  <div className="catalogue-toolbar">
                    <div className="catalogue-tabs">
                      <button
                        className={tab === 'build' ? 'active' : ''}
                        onClick={() => setTab('build')}
                      >
                        Objets
                      </button>
                      <button
                        className={tab === 'compare' ? 'active' : ''}
                        aria-label="Comparer deux choix"
                        onClick={() => setTab('compare')}
                      >
                        <GitCompareArrows size={14} />
                        Comparer
                      </button>
                    </div>
                    <span className="destination">
                      <ArrowRight size={11} />
                      {situational ? 'Adaptations' : phaseLabels[phase]}
                      <select
                        aria-label="Phase de destination"
                        value={phase}
                        onChange={(e) => setPhase(e.target.value as Phase)}
                      >
                        {phases.map((p) => (
                          <option value={p} key={p}>
                            {phaseLabels[p]}
                          </option>
                        ))}
                      </select>
                    </span>
                  </div>
                  {tab === 'build' ? (
                    <>
                      <div className="catalogue-filter">
                        <label className="search-field">
                          <Search size={15} />
                          <input
                            id="item-search"
                            aria-label="Rechercher un objet"
                            placeholder="Rechercher…"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                          />
                          {query && (
                            <button
                              className="icon-button"
                              aria-label="Effacer la recherche"
                              onClick={() => setQuery('')}
                            >
                              <X size={13} />
                            </button>
                          )}
                        </label>
                        <div className="tier-filter" role="group" aria-label="Palier de prix">
                          {[0, 1, 2, 3, 4].map((t) => (
                            <button
                              className={tier === t ? 'active' : ''}
                              key={t}
                              title={
                                t ? `${[0, 800, 1600, 3200, 6400][t]} âmes` : 'Tous les paliers'
                              }
                              aria-label={t ? `Palier ${t}` : 'Tous les paliers'}
                              aria-pressed={tier === t}
                              onClick={() => setTier(t)}
                            >
                              {t ? roman[t] : 'Tous'}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="item-grid">
                        {filtered.slice(0, visible).map((item) => (
                          <ItemTile
                            key={item.id}
                            item={item}
                            included={build.entries.some((e) => e.itemId === item.id)}
                            label={`Ajouter ${item.name}`}
                            onClick={() => addItem(item)}
                            onInspect={() => setInspected(item)}
                          />
                        ))}
                      </div>
                      {!filtered.length && (
                        <div className="catalogue-empty">
                          <Search size={20} />
                          <span>Aucun objet</span>
                          <button
                            className="text-button"
                            onClick={() => {
                              setQuery('')
                              setTier(0)
                              setCategory('all')
                            }}
                          >
                            Réinitialiser
                          </button>
                        </div>
                      )}
                      {filtered.length > visible && (
                        <button className="load-more" onClick={() => setVisible((v) => v + 18)}>
                          <Plus size={14} />
                          {filtered.length - visible}
                        </button>
                      )}
                    </>
                  ) : (
                    <div className="comparison">
                      <div className="comparison-origin">
                        <span>
                          <Crosshair size={14} />
                          {current.item?.name ?? 'Sans objet'}
                        </span>
                        <span>
                          <Coins size={13} />
                          {number(current.budget)}
                        </span>
                        <ScopeBadge />
                      </div>
                      <div className="comparison-grid">
                        {[
                          { value: optionA, setter: setOptionA, letter: 'A' },
                          { value: optionB, setter: setOptionB, letter: 'B' },
                        ].map(({ value, setter, letter }) => {
                          const item = itemById.get(value) ?? catalogue[0],
                            result = compareAddition(hero, current.owned, item, scenario)
                          const width = Math.max(result.after.sustained, result.before.sustained, 1)
                          return (
                            <div className={`comparison-option option-${letter}`} key={letter}>
                              <header>
                                <span>{letter}</span>
                                <select
                                  aria-label={`Objet ${letter}`}
                                  value={value}
                                  onChange={(e) => setter(e.target.value)}
                                >
                                  {catalogue.map((i) => (
                                    <option key={i.id} value={i.id}>
                                      {i.name}
                                    </option>
                                  ))}
                                </select>
                              </header>
                              <div className="comparison-art">
                                <ItemArt item={item} />
                                <span className="comparison-cost">
                                  <Coins size={14} />
                                  {number(result.cost)}
                                </span>
                              </div>
                              <div className="comparison-values">
                                <div title="DPS soutenu projeté">
                                  <Crosshair size={16} />
                                  <strong>{Math.round(result.after.sustained)}</strong>
                                  <span className={result.delta >= 0 ? 'positive' : 'negative'}>
                                    {result.delta >= 0 ? '+' : ''}
                                    {result.delta.toFixed(1)}
                                  </span>
                                </div>
                                <span className="comparison-value-bar">
                                  <i
                                    style={{ width: `${(result.after.sustained / width) * 100}%` }}
                                  />
                                </span>
                                <div title="PV de base et objets">
                                  <Heart size={16} />
                                  <strong>{number(result.after.health)}</strong>
                                  <span>
                                    {result.after.health - result.before.health >= 0 ? '+' : ''}
                                    {Math.round(result.after.health - result.before.health)}
                                  </span>
                                </div>
                                <div title="Puissance Spirit">
                                  <Flame size={16} />
                                  <strong>{result.after.spirit}</strong>
                                  <span>+{result.after.spirit - result.before.spirit}</span>
                                </div>
                              </div>
                              <button
                                className="button"
                                disabled={build.entries.some((e) => e.itemId === item.id)}
                                onClick={() => addItem(item)}
                              >
                                {build.entries.some((e) => e.itemId === item.id) ? (
                                  <Check size={14} />
                                ) : (
                                  <Plus size={14} />
                                )}
                                Ajouter
                              </button>
                              <button
                                className="text-button inspect-comparison"
                                aria-label={`Examiner ${item.name}`}
                                onClick={() => setInspected(item)}
                              >
                                <Info size={13} />
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </section>
              </div>
              <aside className="analysis-rail">
                <section className="stat-panel progression-panel">
                  <div className="stat-panel-heading">
                    <h2>Progression</h2>
                    <button
                      className="icon-button"
                      aria-label="Méthode de calcul"
                      title="Méthode"
                      onClick={() => setInfoOpen(true)}
                    >
                      <Info size={15} />
                    </button>
                    <ScopeBadge />
                  </div>
                  <div className="metric-tabs" role="group" aria-label="Mesure de progression">
                    {(['sustained', 'burst', 'health', 'spirit'] as Metric[]).map((m) => {
                      const Icon = metricIcons[m]
                      return (
                        <button
                          key={m}
                          className={metric === m ? 'active' : ''}
                          aria-label={metricLabels[m]}
                          aria-pressed={metric === m}
                          onClick={() => setMetric(m)}
                        >
                          <Icon size={15} />
                          <span>
                            {m === 'sustained'
                              ? 'DPS'
                              : m === 'burst'
                                ? 'Séquence'
                                : m === 'health'
                                  ? 'PV'
                                  : 'Spirit'}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                  <div className="metric-summary">
                    <MetricIcon size={22} />
                    <div>
                      <strong>{number(current.result[metric])}</strong>
                      <span>
                        {metric === 'sustained'
                          ? 'dégâts / s'
                          : metric === 'burst'
                            ? `${duration} s`
                            : metric === 'health'
                              ? 'PV'
                              : 'Spirit'}
                      </span>
                    </div>
                    <button
                      className={`reference-button ${referencePoints ? 'active' : ''}`}
                      aria-label={referencePoints ? 'Retirer la référence' : 'Fixer la référence'}
                      title={
                        referencePoints ? 'Retirer la référence' : 'Fixer ce build en référence B'
                      }
                      onClick={() => {
                        setReference(referencePoints ? null : structuredClone(build))
                        if (!referencePoints) setToast('Référence B fixée')
                      }}
                    >
                      <GitCompareArrows size={16} />
                      <span>A / B</span>
                    </button>
                  </div>
                  <div className="chart-options">
                    <div className="axis-switch">
                      <button
                        className={!timeAxis ? 'active' : ''}
                        onClick={() => setTimeAxis(false)}
                      >
                        Budget
                      </button>
                      <button
                        className={timeAxis ? 'active' : ''}
                        onClick={() => setTimeAxis(true)}
                      >
                        Minutes
                      </button>
                    </div>
                    <span
                      className="data-origin"
                      title={
                        personal.source === 'observed'
                          ? `${personal.detailed} chronologies personnelles. Temps indicatif, sans extrapolation.`
                          : personal.source === 'summary'
                            ? 'Estimation globale tirée de votre patrimoine final.'
                            : 'Rythme théorique sélectionné.'
                      }
                    >
                      <Activity size={11} />
                      {personal.source === 'observed'
                        ? 'Observé'
                        : personal.source === 'summary'
                          ? 'Estimé'
                          : 'Théorique'}
                    </span>
                  </div>
                  <PowerChart
                    points={points}
                    reference={referencePoints}
                    metric={metric}
                    selected={index}
                    onSelect={setSelected}
                    timeAxis={timeAxis}
                  />
                  <div className="progression-time">
                    <Clock3 size={13} />
                    <span>{clock(current.time)}</span>
                    <span className="base-level-tag" title="Niveau de base, capacités non incluses">
                      Arme · niveau de base
                    </span>
                  </div>
                </section>
                <section className="stat-panel scenario-panel">
                  <div className="stat-panel-heading">
                    <h2>
                      <SlidersHorizontal size={15} />
                      Scénario
                    </h2>
                  </div>
                  <label className="scenario-slider">
                    <span>
                      <Crosshair size={14} />
                      Précision<strong>{Math.round(scenario.accuracy * 100)}%</strong>
                      {personal.accuracy !== null && (
                        <button
                          type="button"
                          className={`personal-toggle ${personalAccuracy ? 'active' : ''}`}
                          aria-label="Utiliser ma précision observée"
                          aria-pressed={personalAccuracy}
                          title={`${personal.accuracyMatches} parties`}
                          onClick={(e) => {
                            e.preventDefault()
                            setPersonalAccuracy((v) => !v)
                          }}
                        >
                          <UserRound size={12} />
                        </button>
                      )}
                    </span>
                    <input
                      aria-label="Précision des tirs"
                      type="range"
                      min="0"
                      max="100"
                      value={Math.round(scenario.accuracy * 100)}
                      disabled={personalAccuracy && personal.accuracy !== null}
                      onChange={(e) => setManualAccuracy(Number(e.target.value))}
                    />
                  </label>
                  <label className="scenario-slider">
                    <span>
                      <Shield size={14} />
                      Résistance balle<strong>{resistance}%</strong>
                    </span>
                    <input
                      aria-label="Résistance balle de la cible"
                      type="range"
                      min="-50"
                      max="90"
                      step="1"
                      value={resistance}
                      onChange={(e) => setResistance(Number(e.target.value))}
                    />
                  </label>
                  <div className="scenario-selects">
                    <label>
                      <Clock3 size={14} />
                      <select
                        aria-label="Durée d’échange"
                        value={duration}
                        onChange={(e) => setDuration(Number(e.target.value))}
                      >
                        {![3, 10, 20].includes(duration) && (
                          <option value={duration}>{duration} s</option>
                        )}
                        <option value="3">3 s</option>
                        <option value="10">10 s</option>
                        <option value="20">20 s</option>
                      </select>
                    </label>
                    {personal.source === 'none' && (
                      <label>
                        <Coins size={14} />
                        <select
                          aria-label="Rythme économique théorique"
                          value={rate}
                          onChange={(e) => setRate(Number(e.target.value))}
                        >
                          <option value="600">600 / min</option>
                          <option value="900">900 / min</option>
                          <option value="1200">1 200 / min</option>
                        </select>
                      </label>
                    )}
                  </div>
                  {current.owned.some((i) => i.id === 'upgrade_bullet_resist_shredder') && (
                    <label className="condition-toggle">
                      <input
                        type="checkbox"
                        checked={spiritApplied}
                        onChange={(e) => setSpiritApplied(e.target.checked)}
                      />
                      <Flame size={13} />
                      <ArrowRight size={12} />
                      <Shield size={13} />
                      <span>Réduction appliquée</span>
                    </label>
                  )}
                </section>
                <BuildLinks
                  owned={current.owned}
                  spiritApplied={spiritApplied}
                  onSpirit={() => setSpiritApplied((v) => !v)}
                />
              </aside>
            </div>
          </>
        )}
      </main>
      {playerOpen && (
        <PlayerDialog
          profile={profile}
          onImport={acceptProfile}
          onClose={() => setPlayerOpen(false)}
          onClear={clearProfile}
        />
      )}
      {infoOpen && (
        <Modal
          title="Sources & calculs"
          onClose={() => setInfoOpen(false)}
          className="method-modal"
        >
          <div className="method-grid">
            <span>Arme, chargeur, rechargement</span>
            <Check size={16} />
            <span>Précision personnelle</span>
            <Check size={16} />
            <span>Économie personnelle</span>
            <Check size={16} />
            <span>Compétences & passifs</span>
            <X size={16} />
            <span>Bonus d’investissement</span>
            <X size={16} />
            <span>Calibration en jeu</span>
            <Clock3 size={16} />
          </div>
          <ScopeBadge />
          <div className="method-links">
            <a href={source.url} target="_blank" rel="noreferrer">
              Client {source.version}
              <ArrowUpRight size={13} />
            </a>
            <a href="https://api.deadlock-api.com/docs" target="_blank" rel="noreferrer">
              Deadlock API
              <ArrowUpRight size={13} />
            </a>
          </div>
        </Modal>
      )}
      {inspected && (
        <Modal
          title={inspected.name}
          onClose={() => setInspected(null)}
          className={`item-inspector ${inspected.category}`}
        >
          <div className="inspector-hero">
            <ItemArt item={inspected} />
            <div>
              <span>
                {categoryLabels[inspected.category]} · {roman[inspected.tier]}
              </span>
              <strong>
                <Coins size={17} />
                {number(inspected.cost)}
              </strong>
              {inspected.active && <span className="active-label">ACTIF</span>}
            </div>
          </div>
          <div className="inspector-stats">
            {Object.entries(inspected.properties)
              .filter(([key]) => statLabels[key])
              .map(([key, value]) => (
                <div key={key}>
                  <span>{statLabels[key]}</span>
                  <strong className={value < 0 ? 'negative' : ''}>
                    {value > 0 ? '+' : ''}
                    {value}
                    {statUnit(key)}
                  </strong>
                </div>
              ))}
          </div>
          {(presentation as Record<string, { description?: string }>)[inspected.id]
            ?.description && (
            <p className="item-effect">
              {(presentation as Record<string, { description: string }>)[inspected.id].description
                .replace(/<[^>]*>/g, '')
                .replace(/\{g:[^}]+\}/g, '')}
            </p>
          )}
          {inspected.components.length > 0 && (
            <div className="component-chain">
              {inspected.components.map((id) => {
                const item = itemById.get(id)
                return item ? (
                  <span key={id} title={item.name}>
                    <ItemArt item={item} />
                  </span>
                ) : null
              })}
              <ArrowRight size={18} />
              <ItemArt item={inspected} />
            </div>
          )}
          {inspectedEntry ? (
            <div className="entry-editor">
              <label>
                Phase
                <select
                  aria-label="Phase"
                  value={inspectedEntry.phase}
                  onChange={(e) =>
                    updateEntry(inspectedEntry.id, { phase: e.target.value as Phase })
                  }
                >
                  {phases.map((p) => (
                    <option value={p} key={p}>
                      {phaseLabels[p]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={inspectedEntry.situational}
                  onChange={(e) =>
                    updateEntry(inspectedEntry.id, { situational: e.target.checked })
                  }
                />
                Adaptation
              </label>
              {inspectedEntry.situational && (
                <input
                  aria-label={`Condition pour ${inspected.name}`}
                  placeholder="Condition…"
                  value={inspectedEntry.note}
                  onChange={(e) =>
                    updateEntry(inspectedEntry.id, { note: e.target.value.slice(0, 500) })
                  }
                />
              )}
            </div>
          ) : (
            <button
              className="button primary"
              onClick={() => {
                addItem(inspected)
                setInspected(null)
              }}
            >
              <Plus size={15} />
              Ajouter à {situational ? 'Adaptations' : phaseLabels[phase]}
            </button>
          )}
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={15} />
          {toast}
          <button
            className="icon-button"
            aria-label="Fermer la notification"
            onClick={() => setToast('')}
          >
            <X size={13} />
          </button>
        </div>
      )}
    </div>
  )
}
