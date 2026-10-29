import { mergeAccountData } from './account'
import { mergeMatches } from './player'
import type { Profile } from './types'

const PREFIX = 'deadlock.atelier.'
const DATABASE = 'deadlock-atelier'
const STORE = 'profiles'
let opening: Promise<IDBDatabase> | undefined
let pending: Promise<unknown> = Promise.resolve()

export function activeProfileId(): number | null {
  try {
    const id = Number(localStorage.getItem(PREFIX + 'active-profile'))
    return Number.isInteger(id) && id > 0 && id <= 4294967295 ? id : null
  } catch {
    return null
  }
}

function validProfile(value: unknown, id: number): value is Profile {
  const p = value as Profile | null
  return (
    !!p &&
    p.accountId === id &&
    Array.isArray(p.matches) &&
    p.matches.length <= 5000 &&
    typeof p.updatedAt === 'string' &&
    p.matches.every(
      (m) =>
        m &&
        m.accountId === id &&
        typeof m.id === 'string' &&
        Number.isFinite(m.heroId) &&
        Number.isFinite(m.duration) &&
        Number.isFinite(m.netWorth) &&
        Array.isArray(m.stats) &&
        Array.isArray(m.peers) &&
        Array.isArray(m.purchases) &&
        Array.isArray(m.deathTimes),
    )
  )
}

export function readLegacyProfile(account = activeProfileId()): Profile | null {
  if (account === null) return null
  try {
    const value: unknown = JSON.parse(localStorage.getItem(PREFIX + `profile.${account}`) ?? 'null')
    return validProfile(value, account) ? value : null
  } catch {
    return null
  }
}

function database(): Promise<IDBDatabase> {
  if (!opening) {
    opening = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE, 1)
      request.onupgradeneeded = () =>
        request.result.createObjectStore(STORE, { keyPath: 'accountId' })
      request.onsuccess = () => {
        const db = request.result
        db.onversionchange = () => {
          db.close()
          opening = undefined
        }
        resolve(db)
      }
      request.onerror = () => {
        opening = undefined
        reject(request.error)
      }
      request.onblocked = () => {
        opening = undefined
        reject(new Error('Stockage occupé.'))
      }
    })
  }
  return opening
}

/** Keep writes and deletions ordered: an older save must never restore a cleared profile. */
function ordered<T>(operation: () => Promise<T>): Promise<T> {
  const result = pending.then(operation, operation)
  pending = result.catch(() => {})
  return result
}

async function transaction<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await database()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const request = operation(tx.objectStore(STORE))
    let result: T
    request.onsuccess = () => {
      result = request.result
    }
    tx.oncomplete = () => resolve(result)
    tx.onabort = () => reject(tx.error ?? request.error ?? new Error('Stockage interrompu.'))
    tx.onerror = () => reject(tx.error ?? request.error ?? new Error('Stockage indisponible.'))
  })
}

export function loadProfile(account: number): Promise<Profile | null> {
  return ordered(async () => {
    const legacy = readLegacyProfile(account)
    let stored: unknown
    try {
      stored = await transaction('readonly', (store) => store.get(account))
    } catch (error) {
      if (legacy) return legacy
      throw error
    }
    const saved = validProfile(stored, account) ? stored : null
    if (!saved) return legacy
    if (!legacy) return saved
    const [older, newer] = saved.updatedAt > legacy.updatedAt ? [legacy, saved] : [saved, legacy]
    return {
      ...newer,
      account: mergeAccountData(older.account, newer.account),
      historySync: newer.historySync ?? older.historySync,
      matches: mergeMatches(older.matches, newer.matches),
    }
  })
}

export function saveProfile(profile: Profile): Promise<void> {
  return ordered(async () => {
    try {
      await transaction('readwrite', (store) => store.put(profile))
    } catch {
      // A small profile still works in browsers where IndexedDB is unavailable.
      localStorage.setItem(PREFIX + `profile.${profile.accountId}`, JSON.stringify(profile))
      localStorage.setItem(PREFIX + 'active-profile', String(profile.accountId))
      return
    }
    localStorage.setItem(PREFIX + 'active-profile', String(profile.accountId))
    localStorage.removeItem(PREFIX + `profile.${profile.accountId}`)
  })
}

function clearLegacyProfiles() {
  Object.keys(localStorage)
    .filter((key) => key.startsWith(PREFIX + 'profile.') || key === PREFIX + 'active-profile')
    .forEach((key) => localStorage.removeItem(key))
}
export function clearProfiles(): Promise<void> {
  // Clear the marker immediately, then again after older queued saves have finished.
  try {
    clearLegacyProfiles()
  } catch {
    /* Still attempt to erase IndexedDB. */
  }
  return ordered(async () => {
    try {
      await transaction('readwrite', (store) => store.clear())
    } finally {
      clearLegacyProfiles()
    }
  })
}
