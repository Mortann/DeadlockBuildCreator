import { test, expect } from '@playwright/test'
import { metadata, summary } from '../fixtures'
import { syntheticProfile } from '../reviewFixtures'

async function importJson(page: import('@playwright/test').Page, value: unknown) {
  await page.getByRole('button', { name: 'Mon profil', exact: true }).click()
  await page
    .locator('input[type=file]')
    .last()
    .setInputFiles({
      name: 'test.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(value)),
    })
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

test('a Steam profile URL loads identity and hero statistics and recognizes heroes outside the combat model', async ({
  page,
}) => {
  await page.route('**/api/players/42/history', (r) =>
    r.fulfill({ json: [summary({ hero_id: 81 })] }),
  )
  await page.route('**/api/players/42/profile', (r) =>
    r.fulfill({
      json: {
        account_id: 42,
        steam: [{ account_id: 42, personaname: 'Joueur de test' }],
        heroes: [{ account_id: 42, hero_id: 81, matches_played: 10, wins: 6 }],
        rank: { badge: 35, rank: 3, subrank: 5 },
        ingest: { active: false },
        unavailable: [],
      },
    }),
  )
  const details = metadata()
  details.match_info.players[0].hero_id = 81
  await page.route('**/api/matches/123456', (r) => r.fulfill({ json: details }))
  await page.goto('/')
  await page.getByRole('button', { name: 'Mon profil', exact: true }).click()
  await page
    .getByLabel('Account ID ou SteamID64')
    .fill('https://steamcommunity.com/profiles/76561197960265770/')
  await page.getByRole('button', { name: 'Charger', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Compte 42', exact: true })).toContainText(
    'Joueur de test',
  )
  await page.getByRole('button', { name: 'Compte 42', exact: true }).click()
  await expect(page.getByLabel('Informations du compte')).toContainText('Alchemist V')
  await expect(page.getByLabel('Statistiques par héros')).toContainText('Celeste')
  await expect(page.getByLabel('Statistiques par héros')).toContainText('60%')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Mes parties', exact: true }).click()
  await expect(page.locator('.match-row')).toContainText('Celeste')
  await page.locator('.match-row').click()
  await expect(page.locator('.chapter-ready')).toHaveCount(4)
  await expect(page.locator('.match-header h2')).toHaveText('Celeste')
  await expect(page.locator('.match-header .hero-portrait img')).toHaveAttribute(
    'src',
    '/assets/heroes/81.png',
  )
  await page
    .getByRole('navigation', { name: 'Chapitres de la review' })
    .getByRole('button', { name: /Build/ })
    .click()
  await expect(page.getByRole('button', { name: 'Étudier cet inventaire' })).toBeDisabled()
})

test('missing cached metadata offers an explicit Steam recovery and retains the recovered inventory', async ({
  page,
}) => {
  let recovered = 0
  await page.route('**/api/matches/123456', (r) =>
    r.fulfill({
      status: 404,
      json: {
        code: 'metadata_missing',
        recoverable: true,
        error: 'Détails non disponibles dans le cache.',
      },
    }),
  )
  await page.route('**/api/matches/123456/recover', (r) => {
    expect(r.request().method()).toBe('POST')
    recovered++
    return r.fulfill({ json: metadata() })
  })
  await page.goto('/')
  await importJson(page, [summary()])
  await page.getByRole('button', { name: 'Mes parties', exact: true }).click()
  await page.locator('.match-row').click()
  await page.getByRole('button', { name: 'Récupérer via Steam' }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.locator('.chapter-ready')).toHaveCount(4)
  await page
    .getByRole('navigation', { name: 'Chapitres de la review' })
    .getByRole('button', { name: /Build/ })
    .click()
  await expect(page.getByRole('button', { name: 'Étudier cet inventaire' })).toBeEnabled()
  expect(recovered).toBe(1)
})

test('an unavailable historical reference does not hide selected match data or stop the remaining references', async ({
  page,
}) => {
  const profile = syntheticProfile()
  profile.matches = profile.matches.map((m, i) =>
    i === 0
      ? m
      : {
          ...m,
          stats: [],
          peers: [],
          purchases: [],
          positions: undefined,
          damageMatrix: undefined,
        },
  )
  const requested: string[] = []
  await page.route('**/api/matches/*', async (r) => {
    const id = r.request().url().split('/').at(-1)!
    requested.push(id)
    if (id === '123455')
      return r.fulfill({
        status: 404,
        json: {
          code: 'metadata_missing',
          recoverable: true,
          error: 'Détails non disponibles dans le cache.',
        },
      })
    const index = 123456 - Number(id)
    return r.fulfill({
      json: metadata({ match_id: Number(id), start_time: 1792497600 - index * 86400 }),
    })
  })
  await page.addInitScript((p) => {
    localStorage.setItem('deadlock.atelier.active-profile', '42')
    localStorage.setItem('deadlock.atelier.profile.42', JSON.stringify(p))
  }, profile)
  await page.goto('/')
  await page.getByRole('button', { name: 'Mes parties', exact: true }).click()
  await page.locator('.match-row').first().click()
  await page.getByRole('button', { name: 'Compléter les références' }).click()
  await expect(page.locator('.reference-problems')).toContainText('4 chargées')
  await expect(page.locator('.reference-problems')).toContainText('1 non chargées')
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.locator('.priority-card')).toHaveCount(1)
  expect(requested).toEqual(['123455', '123454', '123453', '123452', '123451'])
})
