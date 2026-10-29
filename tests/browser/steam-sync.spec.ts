import { test, expect } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { metadata, summary } from '../fixtures'

test('Steam identification loads an empty account and offers cache recovery without inventing matches', async ({
  page,
}) => {
  await page.route('**/api/auth/steam/result', (r) =>
    r.fulfill({ json: { accountId: 42, steamId64: '76561197960265770' } }),
  )
  await page.route('**/api/players/42/history', (r) =>
    r.fulfill({
      json: [],
      headers: {
        'X-Deadlock-History-Source': 'stored',
        'X-Deadlock-Fetched-At': '2026-10-29T18:00:00Z',
      },
    }),
  )
  await page.route('**/api/players/42/profile', (r) =>
    r.fulfill({
      json: {
        account_id: 42,
        steam: [{ account_id: 42, personaname: 'Joueur de test' }],
        unavailable: [],
      },
    }),
  )
  await page.goto('/?steam=connected')
  await expect(page.getByLabel('Account ID ou SteamID64')).toHaveValue('42')
  await expect(page.getByLabel('Informations du compte')).toContainText('Joueur de test')
  await expect(page.getByLabel('État de la synchronisation')).toContainText('Base communautaire')
  await expect(page.getByLabel('Informations du compte')).toContainText('0 parties disponibles')
  await expect(page).toHaveURL('/')
  await page.getByRole('button', { name: 'Parties manquantes', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Choisir le cache Steam' })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('a stale history is explicitly synchronized, preserving existing details and usable quota fallback', async ({
  page,
}) => {
  let requests = 0
  await page.route('**/api/players/42/history', (r) => {
    requests++
    return r.fulfill({
      json:
        requests === 1
          ? [summary()]
          : [summary(), summary({ match_id: 123457, start_time: 1792756800 })],
      headers: {
        'X-Deadlock-History-Source': 'stored',
        'X-Deadlock-History-Limited': requests === 1 ? 'false' : 'true',
      },
    })
  })
  await page.route('**/api/players/42/profile', (r) =>
    r.fulfill({ json: { account_id: 42, unavailable: ['steam', 'rank', 'heroes', 'ingest'] } }),
  )
  await page.goto('/')
  await page.getByRole('button', { name: 'Mon profil', exact: true }).click()
  await page.getByLabel('Account ID ou SteamID64').fill('42')
  await page.getByRole('button', { name: 'Charger', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: 'Mes parties', exact: true }).click()
  await page.getByRole('button', { name: 'Synchroniser', exact: true }).click()
  await page.getByRole('button', { name: 'Actualiser', exact: true }).click()
  await expect(page.getByLabel('Informations du compte').getByRole('status')).toContainText(
    '1 nouvelle partie',
  )
  await expect(page.getByLabel('Informations du compte')).toContainText('Quota atteint')
  await expect(page.getByLabel('Informations du compte')).toContainText('2 parties disponibles')
  await expect(page.getByRole('button', { name: /Relecture complète/ })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(page.locator('.match-row')).toHaveCount(2)
  expect(requests).toBe(2)
})

test('cache selection is local until explicit submission, excludes private content and imports only this account’s details', async ({
  page,
}, testInfo) => {
  let submitted: unknown
  let available = false
  await page.route('**/api/matches/cache', (r) => {
    submitted = r.request().postDataJSON()
    return r.fulfill({ json: { accepted: 3 } })
  })
  await page.route('**/api/matches/123456', (r) => r.fulfill({ json: metadata() }))
  await page.route('**/api/matches/123455', (r) =>
    r.fulfill({ json: metadata({ match_id: 123455, players: [{ account_id: 43, hero_id: 13 }] }) }),
  )
  await page.route('**/api/matches/123454', (r) =>
    available
      ? r.fulfill({ json: metadata({ match_id: 123454 }) })
      : r.fulfill({
          status: 404,
          json: { error: 'En attente', code: 'metadata_missing', recoverable: true },
        }),
  )
  const directory = testInfo.outputPath('httpcache')
  await mkdir(directory, { recursive: true })
  await Promise.all([
    writeFile(
      directory + '/sensitive-cache-name.bin',
      '\0sessionid=DO_NOT_UPLOAD\0http://replay404.valve.net/1422450/123456_111.meta.bz2\0',
    ),
    writeFile(
      directory + '/other.bin',
      '\0http://replay404.valve.net/1422450/123455_222.meta.bz2\0',
    ),
    writeFile(
      directory + '/pending.bin',
      '\0http://replay404.valve.net/1422450/123454_333.meta.bz2\0',
    ),
    writeFile(
      directory + '/foreign.bin',
      '\0http://replay404.valve.net/730/999_333.meta.bz2\0private account token',
    ),
  ])
  await page.goto('/')
  await page.getByRole('button', { name: 'Mon profil', exact: true }).click()
  await page
    .locator('input[type=file]')
    .last()
    .setInputFiles({
      name: 'test.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify([summary()])),
    })
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: 'Compte 42', exact: true }).click()
  await page.getByRole('button', { name: 'Parties manquantes', exact: true }).click()
  await page.getByLabel('Dossier du cache Steam').setInputFiles(directory)
  await expect(page.locator('.cache-selection-heading')).toContainText('3 références')
  expect(submitted).toBeUndefined()
  await page.getByRole('button', { name: 'Envoyer 3 références', exact: true }).click()
  await expect(page.locator('.cache-results')).toContainText('Autre joueur')
  await expect(page.locator('.cache-results')).toContainText('Collecte en attente')
  await expect(page.locator('.cache-results > strong')).toHaveText(
    '1 partie récupérée pour ce compte',
  )
  expect(submitted).toEqual([
    { match_id: 123456, cluster_id: 404, metadata_salt: 111 },
    { match_id: 123455, cluster_id: 404, metadata_salt: 222 },
    { match_id: 123454, cluster_id: 404, metadata_salt: 333 },
  ])
  available = true
  await page.getByRole('button', { name: 'Vérifier les détails' }).click()
  await expect(page.locator('.cache-results > strong')).toHaveText(
    '2 parties récupérées pour ce compte',
  )
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Mes parties', exact: true }).click()
  await expect(page.locator('.match-row')).toHaveCount(2)
  await page.reload()
  await page.getByRole('button', { name: 'Mes parties', exact: true }).click()
  await expect(page.locator('.match-row')).toHaveCount(2)
})
