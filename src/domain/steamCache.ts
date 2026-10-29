export type ReplayReference = {
  match_id: number
  cluster_id: number
  metadata_salt?: number
  replay_salt?: number
}
const uint = (v: number) => Number.isSafeInteger(v) && v > 0 && v <= 4294967295
/** Only Valve's Deadlock replay addresses are recognized, including binary Steam cache headers. */
export function replayReferences(header: Uint8Array): ReplayReference[] {
  const text = new TextDecoder('latin1').decode(header)
  const pattern =
    /(?:^|[^a-z0-9_.-])(?:https?:\/\/)?replay(\d{1,10})\.valve\.net\/1422450\/(\d{1,16})_(\d{1,10})\.(meta|dem)\.bz2(?=$|[\x00\s'"?])/gi
  return [...text.matchAll(pattern)].flatMap((m) => {
    const cluster = Number(m[1]),
      id = Number(m[2]),
      salt = Number(m[3])
    if (!uint(cluster) || !Number.isSafeInteger(id) || id <= 0 || !uint(salt)) return []
    return [
      {
        match_id: id,
        cluster_id: cluster,
        ...(m[4].toLowerCase() === 'meta' ? { metadata_salt: salt } : { replay_salt: salt }),
      },
    ]
  })
}
export function mergeReferences(refs: ReplayReference[]): ReplayReference[] {
  const map = new Map<string, ReplayReference>()
  const conflicts = new Set<string>()
  for (const ref of refs) {
    const key = `${ref.match_id}:${ref.cluster_id}`,
      old = map.get(key)
    if (
      old &&
      ['metadata_salt', 'replay_salt'].some((field) => {
        const k = field as 'metadata_salt' | 'replay_salt'
        return old[k] !== undefined && ref[k] !== undefined && old[k] !== ref[k]
      })
    )
      conflicts.add(key)
    map.set(key, { ...old, ...ref })
  }
  return [...map.entries()]
    .filter(([key]) => !conflicts.has(key))
    .map(([, value]) => value)
    .sort((a, b) => b.match_id - a.match_id)
}
export async function scanSteamCache(
  files: File[],
  signal: AbortSignal,
  progress: (done: number, total: number) => void,
) {
  if (files.length > 20000)
    throw new Error(
      'Choisissez uniquement le dossier Steam/appcache/httpcache (20 000 fichiers maximum).',
    )
  const refs: ReplayReference[] = []
  let failed = 0
  // At most 16 small headers in memory; no full cache file is read or uploaded.
  for (let i = 0; i < files.length; i += 16) {
    signal.throwIfAborted()
    const batch = await Promise.allSettled(
      files
        .slice(i, i + 16)
        .map(async (f) => replayReferences(new Uint8Array(await f.slice(0, 512).arrayBuffer()))),
    )
    signal.throwIfAborted()
    for (const result of batch)
      if (result.status === 'fulfilled') refs.push(...result.value)
      else failed++
    progress(Math.min(i + 16, files.length), files.length)
  }
  return { references: mergeReferences(refs), failed }
}
