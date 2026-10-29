import { useEffect, useRef, useState } from 'react'
import {
  ArrowUpRight,
  Database,
  FileJson,
  Link2,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react'
import { accountIdFromInput, importPlayerData } from '../domain/player'
import type { Profile } from '../domain/types'
import { HeroPortrait, Modal, number } from './GameUI'
import { heroIdentity } from '../domain/heroRoster'
import { readAccountData } from '../domain/account'
import './ProfileData.css'

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public recoverable = false,
    public retryAfter?: number,
  ) {
    super(message)
  }
}
export async function getJson(
  path: string,
  options: { method?: 'GET' | 'POST'; timeout?: number } = {},
): Promise<unknown> {
  const response = await fetch(path, {
    method: options.method ?? 'GET',
    signal: AbortSignal.timeout(options.timeout ?? 35000),
  })
  let data
  try {
    data = await response.json()
  } catch {
    throw new ApiError('Réponse API illisible.', response.status)
  }
  if (!response.ok)
    throw new ApiError(
      typeof data.error === 'string' ? data.error : 'La requête a échoué.',
      response.status,
      data.code,
      data.recoverable,
      Number(response.headers.get('retry-after')) || undefined,
    )
  return data
}

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
  useEffect(
    () => () => {
      request.current++
    },
    [],
  )
  const [allHeroes, setAllHeroes] = useState(false)
  const [account, setAccount] = useState(profile ? String(profile.accountId) : '')
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  async function connect(force = false) {
    const token = ++request.current
    setError('')
    setBusy(true)
    try {
      const id = accountIdFromInput(account)
      const data = await getJson(
        `/api/players/${id}/${force ? 'refresh' : 'history'}`,
        force ? { method: 'POST', timeout: 95000 } : {},
      )
      const imported = importPlayerData(data, id, 'api')
      try {
        imported.account = readAccountData(
          await getJson(`/api/players/${id}/profile`, { timeout: 12000 }),
          id,
        )
      } catch {
        /* A missing public profile must not discard available matches. */
      }
      if (token !== request.current) return
      onImport(imported)
      onClose()
    } catch (e) {
      if (token === request.current)
        setError(e instanceof Error ? e.message : 'Connexion impossible.')
    } finally {
      if (token === request.current) setBusy(false)
    }
  }
  async function readFile(selected?: File) {
    if (!selected) return
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
      setError(e instanceof Error ? e.message : 'Fichier incompatible.')
    } finally {
      setBusy(false)
      if (file.current) file.current.value = ''
    }
  }
  return (
    <Modal title="Mes données" onClose={onClose} className="player-dialog">
      <div className="account-emblem">
        <Database size={34} />
      </div>
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
      {profile && (
        <section className="account-summary" aria-label="Informations du compte">
          <div className="account-summary-heading">
            <strong>{profile.account?.name ?? `Compte ${profile.accountId}`}</strong>
            <span>{number(profile.matches.length)} parties disponibles</span>
          </div>
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
            <button
              className="text-button"
              disabled={busy}
              onClick={() => void connect(true)}
              title="Interroger l’historique Steam via Deadlock API ; quota limité à une fois par heure."
            >
              <RefreshCw size={13} /> Actualiser via Steam
            </button>
            <a href="https://deadlock-api.com/ingest-cache" target="_blank" rel="noreferrer">
              Parties manquantes <ArrowUpRight size={13} />
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
      {error && (
        <div className="error-box" role="alert">
          {error}
        </div>
      )}
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
