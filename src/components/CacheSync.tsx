import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Check, FolderOpen, LoaderCircle, RefreshCw, Upload, X } from 'lucide-react'
import { getJson, ApiError } from '../domain/api'
import { importPlayerData } from '../domain/player'
import { scanSteamCache, type ReplayReference } from '../domain/steamCache'
import type { Profile } from '../domain/types'

type Status = 'ready' | 'pending' | 'other' | 'failed'
export function CacheSync({
  accountId,
  onImport,
  onRefresh,
}: {
  accountId: number
  onImport: (p: Profile) => void
  onRefresh: () => void
}) {
  const picker = useRef<HTMLInputElement>(null)
  const operation = useRef<AbortController | null>(null)
  useEffect(() => () => operation.current?.abort(), [])
  const [stage, setStage] = useState<'idle' | 'scan' | 'select' | 'send' | 'results'>('idle')
  const [references, setReferences] = useState<ReplayReference[]>([])
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [statuses, setStatuses] = useState<Record<string, Status>>({})
  const [page, setPage] = useState(0)
  const key = (r: ReplayReference) => `${r.match_id}:${r.cluster_id}`
  function begin() {
    operation.current?.abort()
    const controller = new AbortController()
    operation.current = controller
    setError('')
    return controller.signal
  }
  async function scan(files: File[]) {
    const signal = begin()
    setStage('scan')
    setProgress(0)
    setStatuses({})
    try {
      const result = await scanSteamCache(files, signal, (done, total) =>
        setProgress(total ? done / total : 1),
      )
      signal.throwIfAborted()
      // Replay-only entries cannot recover review metadata. Keep them out of the upload selection.
      const refs = result.references.filter((r) => r.metadata_salt !== undefined)
      setReferences(refs)
      setChosen(new Set(refs.slice(0, 20).map(key)))
      setPage(0)
      setStage('select')
      if (result.failed) setError(`${result.failed} fichiers illisibles.`)
    } catch (e) {
      if (!signal.aborted) {
        setError(e instanceof Error ? e.message : 'Lecture impossible.')
        setStage('idle')
      }
    } finally {
      if (picker.current) picker.current.value = ''
    }
  }
  async function check(refs: ReplayReference[], signal: AbortSignal) {
    for (const ref of refs) {
      signal.throwIfAborted()
      let status: Status = 'pending'
      try {
        const raw = await getJson(`/api/matches/${ref.match_id}`, { signal })
        signal.throwIfAborted()
        // Determine membership from raw actors, independently of import parser failures.
        const data = raw as {
          match_info?: { players?: { account_id: number }[] }
          match_metadata?: { match_info?: { players?: { account_id: number }[] } }
        }
        const actors = (data.match_info ?? data.match_metadata?.match_info)?.players
        if (Array.isArray(actors) && !actors.some((p) => p.account_id === accountId))
          status = 'other'
        else {
          onImport(importPlayerData(raw, accountId, 'api'))
          status = 'ready'
        }
      } catch (e) {
        if (signal.aborted) return
        if (e instanceof ApiError && e.status === 429) {
          setError(e.message)
          break
        }
        status = e instanceof ApiError && e.status === 404 ? 'pending' : 'failed'
      }
      setStatuses((old) => ({ ...old, [key(ref)]: status }))
    }
  }
  async function send() {
    const signal = begin(),
      selected = references.filter((r) => chosen.has(key(r)))
    setStage('send')
    try {
      await getJson('/api/matches/cache', { method: 'POST', body: selected, signal })
      signal.throwIfAborted()
      setReferences(selected)
      setPage(0)
      setStatuses(Object.fromEntries(selected.map((r) => [key(r), 'pending'])))
      await check(selected, signal)
      if (!signal.aborted) setStage('results')
    } catch (e) {
      if (!signal.aborted) {
        setError(e instanceof Error ? e.message : 'Envoi impossible.')
        setStage('select')
      }
    }
  }
  async function retry() {
    const signal = begin()
    setStage('send')
    try {
      await check(
        references.filter((r) => statuses[key(r)] === 'pending' || statuses[key(r)] === 'failed'),
        signal,
      )
    } finally {
      if (!signal.aborted) setStage('results')
    }
  }
  const ready = Object.values(statuses).filter((s) => s === 'ready').length
  const remaining = Object.values(statuses).some((s) => s === 'pending' || s === 'failed')
  return (
    <section className="cache-sync" aria-label="Récupérer les parties manquantes">
      <header>
        <FolderOpen size={18} />
        <div>
          <strong>Récupérer mes parties</strong>
          <small>Depuis le cache Steam</small>
        </div>
      </header>
      <ol className="cache-steps">
        <li>Ouvrir les parties manquantes dans Deadlock</li>
        <li>
          Choisir le dossier <code>Steam/appcache/httpcache</code>
        </li>
      </ol>
      <p className="cache-privacy">
        Lecture locale · seuls les identifiants et clés des replays choisis sont envoyés à Deadlock
        API.
      </p>
      <input
        ref={picker}
        type="file"
        aria-label="Dossier du cache Steam"
        multiple
        hidden
        {...{ webkitdirectory: '', directory: '' }}
        onChange={(e) => {
          if (e.target.files?.length) void scan(Array.from(e.target.files))
        }}
      />
      {(stage === 'idle' || stage === 'select') && (
        <button className="button" onClick={() => picker.current?.click()}>
          <FolderOpen size={15} />
          {stage === 'select' ? 'Changer de dossier' : 'Choisir le cache Steam'}
        </button>
      )}
      {stage === 'scan' && (
        <div className="cache-progress" role="status">
          <LoaderCircle size={15} className="spin" />
          Lecture locale <progress value={progress} max={1} />
          <button
            className="text-button"
            onClick={() => {
              operation.current?.abort()
              setStage('idle')
            }}
            aria-label="Annuler la lecture"
          >
            <X size={14} />
          </button>
        </div>
      )}
      {stage === 'select' && !references.length && (
        <div className="sync-note">
          Aucune référence de métadonnées. Ouvrez une partie dans le jeu, puis choisissez de nouveau
          le cache.
        </div>
      )}
      {stage === 'select' && !!references.length && (
        <>
          <div className="cache-selection-heading">
            <strong>{references.length} références</strong>
            <span>Jouées ou regardées · sélectionnez les vôtres</span>
          </div>
          <div className="cache-reference-list">
            {references.slice(page * 8, (page + 1) * 8).map((r) => (
              <label key={key(r)}>
                <input
                  type="checkbox"
                  checked={chosen.has(key(r))}
                  disabled={!chosen.has(key(r)) && chosen.size >= 20}
                  onChange={() =>
                    setChosen((old) => {
                      const next = new Set(old)
                      if (next.has(key(r))) next.delete(key(r))
                      else next.add(key(r))
                      return next
                    })
                  }
                />
                <span>Partie #{r.match_id}</span>
              </label>
            ))}
          </div>
          {references.length > 8 && (
            <div className="cache-pagination">
              <button
                className="text-button"
                disabled={!page}
                onClick={() => setPage((v) => v - 1)}
              >
                Précédentes
              </button>
              <small>
                {page + 1} / {Math.ceil(references.length / 8)}
              </small>
              <button
                className="text-button"
                disabled={(page + 1) * 8 >= references.length}
                onClick={() => setPage((v) => v + 1)}
              >
                Suivantes
              </button>
            </div>
          )}
          <button className="button primary" disabled={!chosen.size} onClick={() => void send()}>
            <Upload size={14} />
            Envoyer {chosen.size} référence{chosen.size > 1 ? 's' : ''}
          </button>
        </>
      )}
      {stage === 'send' && (
        <div role="status" className="cache-progress">
          <LoaderCircle size={15} className="spin" />
          Vérification des détails…
        </div>
      )}
      {(stage === 'results' || stage === 'send') && !!Object.keys(statuses).length && (
        <div className="cache-results" role="status">
          <strong>
            <Check size={16} />
            {ready} partie{ready === 1 ? '' : 's'} récupérée{ready === 1 ? '' : 's'} pour ce compte
          </strong>
          {Object.entries(statuses).map(([id, status]) => (
            <div key={id}>
              <span>#{id.split(':')[0]}</span>
              <small className={status}>
                {status === 'ready'
                  ? 'Détails chargés'
                  : status === 'other'
                    ? 'Autre joueur'
                    : status === 'failed'
                      ? 'À réessayer'
                      : 'Collecte en attente'}
              </small>
            </div>
          ))}
        </div>
      )}
      {stage === 'results' && (
        <div className="account-sync-actions">
          {remaining && (
            <button className="text-button" onClick={() => void retry()}>
              <RefreshCw size={13} />
              Vérifier les détails
            </button>
          )}
          <button className="text-button" onClick={onRefresh}>
            Actualiser l’historique
          </button>
          <button
            className="text-button"
            onClick={() => {
              begin()
              setStage('idle')
              setStatuses({})
            }}
          >
            Autre dossier
          </button>
        </div>
      )}
      {error && (
        <div className="error-box" role="alert">
          {error}
        </div>
      )}
      <a
        className="cache-help"
        href="https://deadlock-api.com/ingest-cache"
        target="_blank"
        rel="noreferrer"
      >
        Guide et synchronisation automatique <ArrowUpRight size={12} />
      </a>
    </section>
  )
}
