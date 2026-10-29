import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
// @ts-expect-error The launcher is a standalone Node script without TS dependencies.
import { installRelease, managedPath, MARKER } from '../scripts/windows-install.mjs'
// @ts-expect-error Standalone cross-platform Node launcher.
import { APP_MARKER, dependencySignature, probe } from '../scripts/local-launch.mjs'
const folders: string[] = []
const servers: ReturnType<typeof createServer>[] = []
afterEach(async () => {
  await Promise.all(folders.splice(0).map((p) => rm(p, { recursive: true, force: true })))
  await Promise.all(
    servers.splice(0).map((s) => new Promise<void>((resolve) => s.close(() => resolve()))),
  )
})
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'deadlock-launch-test-'))
  folders.push(root)
  const source = join(root, 'release'),
    target = join(root, 'installation')
  await mkdir(source)
  await mkdir(target)
  await writeFile(join(source, 'package.json'), '{}')
  await writeFile(join(source, 'index.html'), 'version1')
  return { source, target }
}

describe('safe automatic release updates', () => {
  it('updates managed files and removes obsolete release files while preserving settings and unknown user files', async () => {
    const { source, target } = await fixture()
    await writeFile(join(source, 'old.txt'), 'old')
    await installRelease(source, target, 'a'.repeat(40))
    await writeFile(join(target, '.env'), 'LOCAL_SETTING=keep')
    await writeFile(join(target, 'my-notes.txt'), 'keep')
    await rm(join(source, 'old.txt'))
    await writeFile(join(source, 'index.html'), 'version2')
    await installRelease(source, target, 'b'.repeat(40))
    expect(await readFile(join(target, 'index.html'), 'utf8')).toBe('version2')
    expect(await readFile(join(target, '.env'), 'utf8')).toBe('LOCAL_SETTING=keep')
    expect(await readFile(join(target, 'my-notes.txt'), 'utf8')).toBe('keep')
    await expect(readFile(join(target, 'old.txt'))).rejects.toMatchObject({ code: 'ENOENT' })
    expect(JSON.parse(await readFile(join(target, MARKER), 'utf8')).sha).toBe('b'.repeat(40))
  })
  it('refuses to overwrite local source changes or an existing unrelated project', async () => {
    const { source, target } = await fixture()
    await writeFile(join(target, 'package.json'), 'existing project')
    await expect(installRelease(source, target, 'a'.repeat(40))).rejects.toThrow(/autre projet/)
    expect(await readFile(join(target, 'package.json'), 'utf8')).toBe('existing project')
    await rm(join(target, 'package.json'))
    await installRelease(source, target, 'a'.repeat(40))
    await writeFile(join(target, 'index.html'), 'my edits')
    await expect(installRelease(source, target, 'b'.repeat(40))).rejects.toThrow(
      /Modification locale/,
    )
    expect(await readFile(join(target, 'index.html'), 'utf8')).toBe('my edits')
  })
  it('rejects traversal and protected paths and validates a release before copying it', async () => {
    for (const value of [
      '../notes',
      '/outside',
      'C:\\outside',
      'nested/../../outside',
      '.env',
      '.env.local',
      'node_modules/a',
      '.git/config',
      'bad//path',
    ])
      expect(managedPath(value), value).toBe(false)
    expect(managedPath('.env.example')).toBe(true)
    const { source, target } = await fixture()
    await installRelease(source, target, 'a'.repeat(40))
    await writeFile(join(source, 'index.html'), 'must not copy')
    await writeFile(join(source, '.env'), 'must not copy')
    await expect(installRelease(source, target, 'b'.repeat(40))).rejects.toThrow(/interdit/)
    expect(await readFile(join(target, 'index.html'), 'utf8')).toBe('version1')
  })
  it('does not overwrite an unknown personal file whose path appears in a later release', async () => {
    const { source, target } = await fixture()
    await installRelease(source, target, 'a'.repeat(40))
    await writeFile(join(target, 'notes.txt'), 'personal')
    await writeFile(join(source, 'notes.txt'), 'new release file')
    await expect(installRelease(source, target, 'b'.repeat(40))).rejects.toThrow(
      /Fichier personnel/,
    )
    expect(await readFile(join(target, 'notes.txt'), 'utf8')).toBe('personal')
  })
  it('rejects symbolic links before copying release files', async () => {
    const { source, target } = await fixture()
    await symlink(join(source, 'index.html'), join(source, 'link.html'))
    await expect(installRelease(source, target, 'a'.repeat(40))).rejects.toThrow(/symbolique/)
    await expect(readFile(join(target, 'index.html'))).rejects.toMatchObject({ code: 'ENOENT' })
  })
})

describe('launcher readiness and dependency cache', () => {
  it('distinguishes the running application from another service before opening a browser', async () => {
    const server = createServer((req, res) =>
      res.end(req.url === '/ours' ? APP_MARKER + ' />' : 'another application'),
    )
    servers.push(server)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    expect(await probe(base + '/ours')).toBe('atelier')
    expect(await probe(base + '/other')).toBe('occupied')
  })
  it('refreshes dependencies for a changed lockfile, Node runtime or platform', () => {
    const first = dependencySignature('lock1', '24', 'win32', 'x64')
    expect(dependencySignature('lock1', '24', 'win32', 'x64')).toBe(first)
    expect(dependencySignature('lock2', '24', 'win32', 'x64')).not.toBe(first)
    expect(dependencySignature('lock1', '26', 'win32', 'x64')).not.toBe(first)
    expect(dependencySignature('lock1', '24', 'win32', 'arm64')).not.toBe(first)
  })
})
