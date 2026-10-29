import { lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

export const REPOSITORY = 'Mortann/DeadlockBuildCreator'
export const BRANCH = 'codex/deadlock-build-lab'
export const MARKER = '.deadlock-installation.json'
const PROTECTED = new Set([
  '.env',
  'node_modules',
  '.git',
  '.deadlock-installation.json',
  '.deadlock-update.lock',
])

export function managedPath(name) {
  const parts = name.replaceAll('\\', '/').split('/')
  return (
    !!name &&
    !name.startsWith('/') &&
    !/^[a-z]:/i.test(name) &&
    parts.every((p) => p && p !== '.' && p !== '..') &&
    !PROTECTED.has(parts[0]) &&
    !(parts[0].startsWith('.env.') && parts[0] !== '.env.example')
  )
}
async function fileExists(path) {
  try {
    await readFile(path)
    return true
  } catch (e) {
    if (e.code === 'ENOENT') return false
    throw e
  }
}
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')

/** Copy only release files and never remove user configuration or unknown files. */
export async function installRelease(source, target, sha) {
  let previous
  try {
    previous = JSON.parse(await readFile(join(target, MARKER), 'utf8'))
  } catch (e) {
    if (e.code !== 'ENOENT') throw e
  }
  if (!previous && (await fileExists(join(target, 'package.json'))))
    throw new Error('Ce dossier contient deja un autre projet. Installation interrompue.')
  if (previous?.repository && previous.repository !== REPOSITORY)
    throw new Error('Ce dossier appartient a une autre installation.')
  // A managed installation may still contain personal source edits. Keep them intact.
  const originals = new Map()
  for (const [name, hash] of Object.entries(previous?.files ?? {})) {
    if (!managedPath(name)) throw new Error('Manifest de mise a jour invalide.')
    try {
      const bytes = await readFile(join(target, name))
      originals.set(name, bytes)
      if (digest(bytes) !== hash)
        throw new Error(`Modification locale conservee : ${name}. Mise a jour annulee.`)
    } catch (e) {
      if (e.code !== 'ENOENT') throw e
    }
  }
  const files = {}
  async function copyFolder(folder) {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const from = join(folder, entry.name),
        name = relative(source, from).split(sep).join('/')
      if (!managedPath(name)) throw new Error(`Chemin de publication interdit : ${name}`)
      if (entry.isSymbolicLink())
        throw new Error('Une publication ne doit pas contenir de lien symbolique.')
      if (entry.isDirectory()) {
        await copyFolder(from)
        continue
      }
      if (!entry.isFile()) throw new Error('Type de fichier non pris en charge.')
      const bytes = await readFile(from)
      files[name] = digest(bytes)
    }
  }
  await mkdir(target, { recursive: true })
  await copyFolder(source)
  for (const name of Object.keys(files)) {
    if (previous?.files?.[name]) continue
    try {
      await lstat(join(target, name))
      throw new Error(`Fichier personnel conserve : ${name}. Mise a jour annulee.`)
    } catch (e) {
      if (e.code !== 'ENOENT') throw e
    }
  }
  const changed = []
  const temporaryMarker = join(target, MARKER + '.tmp')
  try {
    for (const name of Object.keys(files)) {
      await mkdir(dirname(join(target, name)), { recursive: true })
      changed.push(name)
      await writeFile(join(target, name), await readFile(join(source, name)))
    }
    for (const name of Object.keys(previous?.files ?? {}))
      if (!(name in files)) {
        changed.push(name)
        await rm(join(target, name), { force: true })
      }
    await writeFile(
      temporaryMarker,
      JSON.stringify({ repository: REPOSITORY, branch: BRANCH, sha, files }, null, 2),
    )
    await rename(temporaryMarker, join(target, MARKER))
  } catch (error) {
    // Keep the previous usable release if a write fails partway through an update.
    for (const name of changed.reverse()) {
      if (originals.has(name)) await writeFile(join(target, name), originals.get(name))
      else await rm(join(target, name), { force: true })
    }
    await rm(temporaryMarker, { force: true })
    throw error
  }
}

async function json(url) {
  const response = await fetch(url, {
    headers: { Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(15000),
  })
  if (!response.ok) throw new Error(`GitHub indisponible (${response.status}).`)
  return response.json()
}

async function shortcuts(target) {
  const script = `$desktop=[Environment]::GetFolderPath('Desktop'); $programs=[Environment]::GetFolderPath('Programs'); $shell=New-Object -ComObject WScript.Shell; foreach($folder in @($desktop,$programs)){ $link=$shell.CreateShortcut((Join-Path $folder 'Deadlock Atelier.lnk')); $link.TargetPath=(Join-Path $env:DEADLOCK_INSTALL_DIR 'Demarrer.cmd'); $link.WorkingDirectory=$env:DEADLOCK_INSTALL_DIR; $link.Description='Deadlock Atelier'; $link.Save() }`
  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    { env: { ...process.env, DEADLOCK_INSTALL_DIR: target }, stdio: 'inherit' },
  )
  if (result.status !== 0)
    console.log('Raccourci non cree. Vous pouvez lancer Demarrer.cmd dans ' + target)
}

export async function main() {
  if (process.platform !== 'win32') throw new Error('Cet installateur est destine a Windows.')
  const updateOnly = process.argv.includes('--update-only')
  const option = process.argv.indexOf('--install-dir')
  const target = resolve(
    option >= 0
      ? process.argv[option + 1]
      : join(
          process.env.LOCALAPPDATA ?? join(process.env.USERPROFILE, 'AppData', 'Local'),
          'DeadlockBuildCreator',
        ),
  )
  if (Number(process.versions.node.split('.')[0]) < 24)
    throw new Error('Node.js 24 ou plus recent est necessaire.')
  await mkdir(target, { recursive: true })
  let lock
  try {
    const fs = await import('node:fs/promises')
    try {
      lock = await fs.open(join(target, '.deadlock-update.lock'), 'wx')
    } catch (e) {
      if (e.code !== 'EEXIST') throw e
      const pid = Number(await readFile(join(target, '.deadlock-update.lock'), 'utf8'))
      let stale = false
      if (Number.isInteger(pid) && pid > 0) {
        try {
          process.kill(pid, 0)
        } catch (error) {
          stale = error.code === 'ESRCH'
        }
      }
      if (!stale)
        throw new Error(
          'Une installation est deja en cours. Fermez cette fenetre et utilisez le raccourci ensuite.',
        )
      await rm(join(target, '.deadlock-update.lock'), { force: true })
      lock = await fs.open(join(target, '.deadlock-update.lock'), 'wx')
    }
    await lock.writeFile(String(process.pid))
  } catch (e) {
    throw e
  }
  let temporary
  try {
    let installed
    try {
      installed = JSON.parse(await readFile(join(target, MARKER), 'utf8'))
    } catch (e) {
      if (e.code !== 'ENOENT') throw e
    }
    if (updateOnly && !installed) throw new Error('Installation geree introuvable.')
    if (!updateOnly) {
      try {
        const running = await fetch('http://localhost:5173', { signal: AbortSignal.timeout(1500) })
        if (running.ok)
          throw new Error(
            'Le port 5173 est utilise. Fermez la fenetre du precedent serveur, puis relancez cet installateur.',
          )
      } catch (error) {
        if (error.message.startsWith('Le port')) throw error
      }
    }
    console.log(
      updateOnly ? 'Verification des mises a jour...' : 'Telechargement de Deadlock Atelier...',
    )
    const version = await json(
      `https://api.github.com/repos/${REPOSITORY}/commits/${encodeURIComponent(BRANCH)}`,
    )
    if (!/^[0-9a-f]{40}$/.test(version.sha)) throw new Error('Version GitHub invalide.')
    if (version.sha !== installed?.sha) {
      temporary = await mkdtemp(join(tmpdir(), 'deadlock-install-'))
      const response = await fetch(`https://codeload.github.com/${REPOSITORY}/zip/${version.sha}`, {
        signal: AbortSignal.timeout(90000),
      })
      if (!response.ok) throw new Error(`Telechargement impossible (${response.status}).`)
      const bytes = new Uint8Array(await response.arrayBuffer())
      if (bytes.length > 64 * 1024 * 1024) throw new Error('Publication trop volumineuse.')
      const archive = join(temporary, 'release.zip'),
        extracted = join(temporary, 'release')
      await writeFile(archive, bytes)
      await mkdir(extracted)
      // Inline built-in command: no .ps1 file and no execution-policy change.
      const unpack = spawnSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          'Expand-Archive -LiteralPath $env:DEADLOCK_ZIP -DestinationPath $env:DEADLOCK_EXTRACT -Force',
        ],
        {
          env: { ...process.env, DEADLOCK_ZIP: archive, DEADLOCK_EXTRACT: extracted },
          stdio: 'inherit',
        },
      )
      if (unpack.status !== 0) throw new Error('Extraction impossible.')
      const folders = await readdir(extracted, { withFileTypes: true })
      if (folders.length !== 1 || !folders[0].isDirectory())
        throw new Error('Archive GitHub invalide.')
      await installRelease(join(extracted, folders[0].name), target, version.sha)
      console.log('Version installee : ' + version.sha.slice(0, 7))
    } else console.log('Votre version est a jour.')
    if (!updateOnly) await shortcuts(target)
  } finally {
    await lock.close()
    await rm(join(target, '.deadlock-update.lock'), { force: true })
    if (temporary) await rm(temporary, { recursive: true, force: true })
  }
  if (!updateOnly) {
    // The launcher does the first dependency install and opens the browser when ready.
    const child = spawn(
      process.execPath,
      [
        '--use-env-proxy',
        '--env-file-if-exists=.env',
        join(target, 'scripts/local-launch.mjs'),
        '--skip-update',
      ],
      { cwd: target, stdio: 'inherit' },
    )
    process.exitCode = await new Promise((resolve) =>
      child.on('exit', (code) => resolve(code ?? 1)),
    )
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch((error) => {
    console.error('\n' + error.message)
    process.exitCode = 1
  })
