import { useEffect, useRef, useState } from 'react'
import {
  ArrowUpRight,
  Database,
  FileJson,
  Link2,
  LoaderCircle,
  LockKeyhole,
  LogIn,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react'
import { accountIdFromInput, importPlayerData } from '../domain/player'
import type { Profile } from '../domain/types'
import { HeroPortrait, Modal, number } from './GameUI'
import { heroIdentity } from '../domain/heroRoster'
import { getJson } from '../domain/api'
import { syncProfile } from '../domain/profileSync'
import { CacheSync } from './CacheSync'
import './ProfileData.css'

export function PlayerDialog({
  profile,
  onImport,
  onClose,
  onClear,
}: {
  profile: Profile | null
  onImport: (p: Profile) => void
  onClose: () => void
  onClear: () => void
}) {
  const file = useRef<HTMLInputElement>(null)
  const request = useRef(0)
  const operation = useRef<AbortController | null>(null)
  useEffect(
    () => () => {
      request.current++
      operation.current?.abort()
    },
    [],
  )
  const [allHeroes, setAllHeroes] = useState(false)
  const [account, setAccount] = useState(profile ? String(profile.accountId) : '')
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const [syncResult, setSyncResult] = useState('')
  const [cacheOpen, setCacheOpen] = useState(false)
  const [steamReturn] = useState(() => new URLSearchParams(location.search).get('steam'))
  useEffect(() => {
    if (!steamReturn) return
    const url = new URL(location.href)
    url.searchParams.delete('steam')
    history.replaceState(null, '', url.pathname + url.search + url.hash)
    if (steamReturn !== 'connected') {
      setError(
        steamReturn === 'cancelled'
          ? 'Connexion Steam annulée.'
          : 'Connexion Steam non validée. Réessayez.',
      )
      return
    }
    const controller = new AbortController()
    operation.current = controller
    setBusy(true)
    void getJson('/api/auth/steam/result', { signal: controller.signal })
      .then(async (raw) => {
        if (controller.signal.aborted) return
        const id = (raw as { accountId?: number }).accountId
        if (!Number.isInteger(id) || !id || id < 1 || id > 4294967295)
          throw new Error('Compte Steam invalide.')
        setAccount(String(id))
        await connect(false, false, id)
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setError(e instanceof Error ? e.message : 'Connexion Steam impossible.')
          setBusy(false)
        }
      })
    return () => controller.abort()
  }, [steamReturn])
  async function connect(force = false, close = true, explicitId?: number) {
    operation.current?.abort()
    const controller = new AbortController()
    operation.current = controller
    const token = ++request.current
    setError('')
    setSyncResult('')
    setBusy(true)
    try {
      const id = explicitId ?? accountIdFromInput(account)
      const imported = await syncProfile(id, force, controller.signal)
      if (token !== request.current) return
      const known = new Set(profile?.accountId === id ? profile.matches.map((m) => m.id) : [])
      const added = imported.matches.filter((m) => !known.has(m.id)).length
      onImport(imported)
      setSyncResult(
        added
          ? `${added} nouvelle${added > 1 ? 's' : ''} partie${added > 1 ? 's' : ''}`
          : 'Aucune nouvelle partie dans la source',
      )
      if (close) onClose()
    } catch (e) {
      if (token === request.current)
        setError(e instanceof Error ? e.message : 'Connexion impossible.')
    } finally {
      if (token === request.current) setBusy(false)
    }
  }
  async function readFile(selected?: File) {
    if (!selected) return
    operation.current?.abort()
    const token = ++request.current
    setError('')
    setBusy(true)
    try {
      if (selected.size > 32 * 1024 * 1024) throw new Error('32 Mo maximum.')
      const imported = importPlayerData(
        JSON.parse(await selected.text()),
        account.trim() ? accountIdFromInput(account) : undefined,
      )
      if (token !== request.current) return
      onImport(imported)
      onClose()
    } catch (e) {
      if (token === request.current)
        setError(e instanceof Error ? e.message : 'Fichier incompatible.')
    } finally {
      if (token === request.current) setBusy(false)
      if (file.current) file.current.value = ''
    }
  }
  return (
    <Modal title="Mes données" onClose={onClose} className="player-dialog">
      {error && (
        <div className="error-box" role="alert">
          {error}
        </div>
      )}
      {!profile && (
        <div className="account-emblem">
          <Database size={34} />
        </div>
      )}
      <details className="account-connection" open={!profile}>
        <summary>{profile ? 'Changer de compte' : 'Connecter mon compte'}</summary>
        <a
          className={`button steam-connect ${busy ? 'disabled' : ''}`}
          aria-disabled={busy}
          href={busy ? undefined : '/api/auth/steam/start'}
        >
          <LogIn size={19} />
          Se connecter avec Steam
          <ArrowUpRight size={15} />
        </a>
        <p className="steam-connect-note">
          Identifie votre compte · les replays restent à synchroniser
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void connect()
          }}
        >
          <label htmlFor="account-id" className="field-label">
            Account ID ou SteamID64
          </label>
          <div className="connect-row">
            <input
              id="account-id"
              placeholder="Identifiant ou lien du profil Steam"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              autoComplete="off"
            />
            <button className="button primary" disabled={busy || !account.trim()}>
              {busy ? <LoaderCircle size={15} className="spin" /> : <Link2 size={15} />}Charger
            </button>
          </div>
        </form>
      </details>
      {profile && (
        <section className="account-summary" aria-label="Informations du compte">
          <div className="account-summary-heading">
            <strong>{profile.account?.name ?? `Compte ${profile.accountId}`}</strong>
            <span>{number(profile.matches.length)} parties disponibles</span>
          </div>
          <div className="sync-diagnostic" aria-label="État de la synchronisation">
            <div>
              <span>Dernière partie disponible</span>
              <strong>
                {profile.matches.length
                  ? new Intl.DateTimeFormat('fr-FR', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    }).format(Math.max(...profile.matches.map((m) => m.startTime)) * 1000)
                  : 'Aucune'}
              </strong>
            </div>
            <div>
              <span>Source de l’historique</span>
              <strong>
                {profile.historySync?.source === 'steam'
                  ? 'Steam consulté'
                  : profile.historySync?.source === 'stored'
                    ? 'Base communautaire'
                    : 'Non confirmée'}
              </strong>
            </div>
            <div>
              <span>Dernière vérification</span>
              <strong>
                {profile.historySync
                  ? new Intl.DateTimeFormat('fr-FR', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    }).format(new Date(profile.historySync.fetchedAt))
                  : '—'}
              </strong>
            </div>
            <div>
              <span>Détails chargés</span>
              <strong>
                {profile.matches.filter((m) => m.stats.length > 0).length} /{' '}
                {profile.matches.length}
              </strong>
            </div>
          </div>
          {profile.historySync?.limited && (
            <div className="sync-note">Quota atteint · historique disponible conservé</div>
          )}
          {syncResult && (
            <div className="sync-result" role="status">
              {syncResult}
            </div>
          )}
          <div className="account-sync-actions primary-sync-actions">
            <button
              className="button primary"
              disabled={busy}
              onClick={() => void connect(false, false, profile.accountId)}
            >
              <RefreshCw size={14} className={busy ? 'spin' : ''} />
              Actualiser
            </button>
            <button
              className="button"
              disabled={busy}
              aria-expanded={cacheOpen}
              onClick={() => setCacheOpen((v) => !v)}
            >
              Parties manquantes
            </button>
          </div>
          {cacheOpen && (
            <CacheSync
              key={profile.accountId}
              accountId={profile.accountId}
              onImport={onImport}
              onRefresh={() => void connect(false, false, profile.accountId)}
            />
          )}
          <div className="account-metrics">
            <div>
              <strong>
                {profile.account?.rank
                  ? profile.account.rank.rank === 0
                    ? 'Non classé'
                    : `${['', 'Initiate', 'Seeker', 'Alchemist', 'Arcanist', 'Ritualist', 'Emissary', 'Archon', 'Oracle', 'Phantom', 'Ascendant', 'Eternus'][profile.account.rank.rank] ?? 'Rang'} ${['', 'I', 'II', 'III', 'IV', 'V', 'VI'][profile.account.rank.subrank] ?? ''}`
                  : '—'}
              </strong>
              <span>Rang enregistré</span>
            </div>
            <div>
              <strong>
                {profile.account?.heroStats.length
                  ? number(profile.account.heroStats.reduce((sum, h) => sum + h.matches, 0))
                  : '—'}
              </strong>
              <span>Parties standard · API</span>
            </div>
          </div>
          {!!profile.account?.heroStats.length && (
            <div className="account-heroes" aria-label="Statistiques par héros">
              {profile.account.heroStats.slice(0, allHeroes ? undefined : 5).map((h) => (
                <div key={h.heroId}>
                  <HeroPortrait hero={heroIdentity(h.heroId)} size="tiny" />
                  <span>{heroIdentity(h.heroId)?.name ?? `#${h.heroId}`}</span>
                  <small>{number(h.matches)} parties</small>
                  <strong>{h.matches ? Math.round((h.wins / h.matches) * 100) : '—'}%</strong>
                </div>
              ))}
              {profile.account.heroStats.length > 5 && (
                <button className="text-button" onClick={() => setAllHeroes((v) => !v)}>
                  {allHeroes ? 'Réduire' : `Voir les ${profile.account.heroStats.length} héros`}
                </button>
              )}
            </div>
          )}
          <div className="account-sync-actions">
            {profile.historySync?.source !== 'stored' && (
              <button
                className="text-button"
                disabled={busy}
                onClick={() => void connect(true, false, profile.accountId)}
                title="Demander une relecture complète au fournisseur. Steam n’est consulté que si votre compte est ami avec l’un de ses bots ; quota d’une demande par heure."
              >
                <RefreshCw size={13} /> Relecture complète · 1 / h
              </button>
            )}
            <a href="https://deadlock-api.com/ingest-cache" target="_blank" rel="noreferrer">
              Collecte automatique <ArrowUpRight size={13} />
            </a>
          </div>
        </section>
      )}
      <div className="import-divider">
        <span>ou</span>
      </div>
      <button
        className="upload-zone"
        aria-label="Importer un fichier JSON"
        disabled={busy}
        onClick={() => file.current?.click()}
      >
        <FileJson size={27} />
        <strong>Importer JSON</strong>
        <span>32 Mo max.</span>
        <Upload size={15} />
      </button>
      <input
        ref={file}
        type="file"
        hidden
        accept=".json,application/json"
        onChange={(e) => void readFile(e.target.files?.[0])}
      />
      <div
        className="privacy-note"
        title="Les imports restent dans ce navigateur. Le chargement en ligne transmet votre identifiant à Deadlock API."
      >
        <LockKeyhole size={12} />
        Stockage local
      </div>
      {profile && (
        <button
          className="text-button destructive"
          aria-label="Effacer mes données personnelles de ce navigateur"
          onClick={() => {
            request.current++
            onClear()
            onClose()
          }}
        >
          <Trash2 size={13} />
          Supprimer mes données
        </button>
      )}
    </Modal>
  )
}
