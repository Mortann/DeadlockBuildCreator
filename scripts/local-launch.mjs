import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { readFile, writeFile, access } from 'node:fs/promises'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const URL = 'http://localhost:5173'
export const APP_MARKER = '<meta name="application-name" content="Deadlock Atelier"'

export function dependencySignature(
  lock,
  nodeMajor = process.versions.node.split('.')[0],
  platform = process.platform,
  arch = process.arch,
) {
  return createHash('sha256')
    .update(lock)
    .update(`\n${nodeMajor}:${platform}:${arch}`)
    .digest('hex')
}
export async function probe(url = URL) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) })
    return (await response.text()).includes(APP_MARKER) ? 'atelier' : 'occupied'
  } catch (e) {
    // A response timeout is not proof that a port is free.
    return e.name === 'TimeoutError' ? 'occupied' : 'free'
  }
}
function openBrowser() {
  if (process.env.DEADLOCK_NO_BROWSER === '1') return
  const command =
    process.platform === 'win32'
      ? 'explorer.exe'
      : process.platform === 'darwin'
        ? 'open'
        : 'xdg-open'
  const child = spawn(command, [URL], { detached: true, stdio: 'ignore' })
  child.on('error', () => console.log('Ouvrez ' + URL))
  child.unref()
}
async function command(program, args) {
  const child = spawn(program, args, { cwd: ROOT, stdio: 'inherit' })
  return new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('exit', (code) => resolve(code ?? 1))
  })
}
export async function main() {
  if (Number(process.versions.node.split('.')[0]) < 24)
    throw new Error('Installez Node.js 24 ou plus recent : https://nodejs.org/fr/download')
  const status = await probe()
  if (status === 'atelier') {
    openBrowser()
    return
  }
  if (status === 'occupied')
    throw new Error(
      'Le port 5173 est deja utilise. Fermez son serveur puis relancez. Le port reste fixe pour retrouver vos donnees.',
    )
  try {
    await access(join(ROOT, '.deadlock-installation.json'))
    if (!process.argv.includes('--skip-update')) {
      const result = await command(process.execPath, [
        '--use-env-proxy',
        join(ROOT, 'scripts/windows-install.mjs'),
        '--install-dir',
        ROOT,
        '--update-only',
      ])
      if (result !== 0)
        console.log('Mise a jour indisponible. Lancement de la version deja installee.')
    }
  } catch (e) {
    if (e.code !== 'ENOENT') throw e
  }
  const signature = dependencySignature(await readFile(join(ROOT, 'package-lock.json')))
  let installed = ''
  try {
    installed = await readFile(join(ROOT, 'node_modules/.deadlock-dependencies'), 'utf8')
    await access(join(ROOT, 'node_modules/vite/bin/vite.js'))
  } catch {
    installed = ''
  }
  if (installed !== signature) {
    console.log('Installation des dependances (premier lancement ou nouvelle version)...')
    const result =
      process.platform === 'win32'
        ? await command(process.env.ComSpec ?? 'cmd.exe', [
            '/d',
            '/s',
            '/c',
            'npm.cmd ci --no-fund --no-audit',
          ])
        : await command('npm', ['ci', '--no-fund', '--no-audit'])
    if (result !== 0)
      throw new Error('Installation interrompue. Verifiez votre connexion puis relancez.')
    await writeFile(join(ROOT, 'node_modules/.deadlock-dependencies'), signature)
  }
  console.log(
    '\nDeadlock Atelier : ' + URL + '\nGardez cette fenetre ouverte. Ctrl+C pour arreter.\n',
  )
  const child = spawn(
    process.execPath,
    [
      '--use-env-proxy',
      '--env-file-if-exists=.env',
      join(ROOT, 'node_modules/vite/bin/vite.js'),
      '--host',
      '127.0.0.1',
      '--port',
      '5173',
      '--strictPort',
    ],
    { cwd: ROOT, stdio: 'inherit' },
  )
  let ended = false
  const complete = new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('exit', (code) => {
      ended = true
      resolve(code === 130 || code === 3221225786 ? 0 : (code ?? 1))
    })
  })
  for (let attempt = 0; attempt < 120 && !ended; attempt++) {
    if ((await probe()) === 'atelier') {
      openBrowser()
      break
    }
    await delay(500)
  }
  process.exitCode = await complete
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch((error) => {
    console.error('\n' + error.message)
    process.exitCode = 1
  })
