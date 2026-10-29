import { test, expect, type Page } from '@playwright/test'
import { bundle, metadata, summary } from '../fixtures'
import { syntheticProfile } from '../reviewFixtures'

const chapter = (page: Page, name: string) =>
  page
    .getByRole('navigation', { name: 'Chapitres de la review' })
    .getByRole('button', { name: new RegExp(name) })

async function loadRichProfile(page: Page) {
  await page.addInitScript((profile) => {
    localStorage.setItem('deadlock.atelier.profile.42', JSON.stringify(profile))
    localStorage.setItem('deadlock.atelier.active-profile', '42')
  }, syntheticProfile())
  await page.goto('/')
  await page.getByRole('button', { name: 'Mes parties', exact: true }).click()
  await page.locator('.match-row').first().click()
}

test('build editing, order, comparison, reference and persistence', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Mon build', exact: true })).toBeVisible()
  await page.getByRole('textbox', { name: 'Nom du build' }).fill('Mon build personnalisé')
  await page.getByRole('button', { name: 'Fixer la référence' }).click()
  await page.getByRole('textbox', { name: 'Rechercher un objet' }).fill('Healbane')
  await page.getByRole('button', { name: 'Ajouter Healbane', exact: true }).click()
  await expect(page.locator('.phase-grid')).toContainText('Healbane')
  await page.getByRole('button', { name: 'Comparer deux choix' }).click()
  await page.getByLabel('Objet A', { exact: true }).selectOption('upgrade_rapid_rounds')
  await page.getByLabel('Objet B', { exact: true }).selectOption('upgrade_health')
  await expect(page.locator('.comparison-option')).toHaveCount(2)
  await page.reload()
  await expect(page.getByRole('textbox', { name: 'Nom du build' })).toHaveValue(
    'Mon build personnalisé',
  )
  await expect(page.getByRole('button', { name: 'Retirer la référence' })).toBeVisible()
  await page.getByRole('button', { name: 'Retirer Healbane', exact: true }).click()
  await expect(page.locator('.phase-grid')).not.toContainText('Healbane')
  expect(errors).toEqual([])
})

test('personal imports actually calibrate calculations and enable contextual review', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Mon profil/ }).click()
  await page
    .locator('input[type=file]')
    .last()
    .setInputFiles({
      name: 'parties.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(bundle)),
    })
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /1 parties de Infernus/ })).toBeVisible()
  await expect(page.getByLabel('Précision des tirs', { exact: true })).toHaveValue('70')
  await expect(page.getByLabel('Précision des tirs', { exact: true })).toBeDisabled()
  await expect(page.getByText('Observé', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: /Proposer un noyau/ }).click()
  await expect(page.getByRole('textbox', { name: 'Nom du build' })).toHaveValue(
    'Mes habitudes · Infernus',
  )
  await expect(page.locator('.phase-grid .build-item')).toHaveCount(2)
  await page.getByRole('button', { name: /Mes parties/ }).click()
  await page.locator('.match-row').click()
  await expect(page.getByTestId('review-grade')).toHaveText('—')
  await chapter(page, 'Vue d’ensemble').click()
  await expect(page.getByRole('img', { name: 'Évolution du patrimoine des joueurs' })).toBeVisible()
  await expect(page.getByLabel('Contexte économique des équipes')).toBeVisible()
  await expect(page.locator('.purchase-event')).toHaveCount(2)
  await expect(page.locator('.death-event')).toHaveCount(2)
  const graph = page.getByRole('img', { name: 'Évolution du patrimoine des joueurs' })
  const bounds = await graph.boundingBox()
  await graph.click({
    position: { x: (bounds!.width * (62 + 878 * 0.25)) / 960, y: bounds!.height * 0.5 },
  })
  // A one-pixel click quantization can shift the selected timestamp by a second.
  await expect(page.locator('.match-graph-panel .chart-time')).toHaveText(/^7:(29|30|31)$/)
  await page.getByRole('button', { name: 'Mort à 15:00', exact: true }).click()
  await expect(page.locator('.match-graph-panel .chart-time')).toHaveText('15:00')
  await expect(page.locator('main')).not.toContainText('MurmurHash2')
  await expect(page.locator('main')).not.toContainText('L’analyse sépare les faits')
  await expect(page.locator('main')).not.toContainText('Une séquence à revoir')
  await chapter(page, 'Build').click()
  await page.getByRole('button', { name: 'Étudier cet inventaire' }).click()
  await expect(page.getByRole('textbox', { name: 'Nom du build' })).toHaveValue(
    /Inventaire #123456/,
  )
  await expect(page.locator('.phase-grid')).toContainText('Opening Rounds')
  await expect(page.locator('.phase-grid')).not.toContainText('High-Velocity Rounds')
  await page.reload()
  await page.getByRole('button', { name: /Compte 42/ }).click()
  await page.getByRole('button', { name: /Effacer mes données personnelles/ }).click()
  await expect(page.getByRole('button', { name: /Mon profil/ })).toBeVisible()
})

test('connection failure preserves data and explains the JSON fallback', async ({ page }) => {
  await page.route('**/api/players/42/history', (route) =>
    route.fulfill({
      status: 502,
      contentType: 'application/json',
      body: JSON.stringify({
        error: 'Deadlock API est inaccessible. L’import JSON reste disponible.',
      }),
    }),
  )
  await page.goto('/')
  await page.getByRole('button', { name: /Mon profil/ }).click()
  await page.getByLabel('Account ID ou SteamID64').fill('42')
  await page.getByRole('button', { name: 'Charger', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('JSON')
  await expect(page.getByRole('button', { name: /Importer un fichier JSON/ })).toBeEnabled()
})

test('mobile layout remains within the viewport and the editor is usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('textbox', { name: 'Rechercher un objet' }).fill('Healbane')
  await page.getByRole('button', { name: 'Ajouter Healbane', exact: true }).click()
  await expect(page.locator('.phase-grid')).toContainText('Healbane')
})

test('object details retain phase editing and contextual alternatives without a text wall', async ({
  page,
}) => {
  await page.goto('/')
  await page
    .locator('.phase-grid')
    .getByRole('button', { name: 'Examiner Basic Magazine', exact: true })
    .click()
  const dialog = page.getByRole('dialog', { name: 'Basic Magazine', exact: true })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('Phase', { exact: true }).selectOption('late')
  await dialog.getByRole('checkbox', { name: 'Adaptation', exact: true }).check()
  await dialog
    .getByLabel('Condition pour Basic Magazine', { exact: true })
    .fill('Échanges prolongés')
  await page.keyboard.press('Escape')
  await expect(page.locator('.adaptation-items')).toContainText('Basic Magazine')
  await expect(page.locator('.phase-grid')).not.toContainText('Basic Magazine')
  await page.reload()
  await page
    .locator('.adaptation-items')
    .getByRole('button', { name: 'Examiner Basic Magazine', exact: true })
    .click()
  await expect(page.getByLabel('Condition pour Basic Magazine', { exact: true })).toHaveValue(
    'Échanges prolongés',
  )
  await page.keyboard.press('Escape')
  await expect(page.locator('main')).not.toContainText('Les effets hors modèle ne valent pas zéro')
  await expect(page.locator('main')).not.toContainText('Votre expérience, dans les calculs')
})

test('a summary has an explicit empty chart instead of fabricated observations', async ({
  page,
}) => {
  await page.route('**/api/matches/*', (route) =>
    route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Détails indisponibles. Importer JSON.' }),
    }),
  )
  await page.goto('/')
  await page.getByRole('button', { name: 'Mon profil', exact: true }).click()
  await page
    .locator('input[type=file]')
    .last()
    .setInputFiles({
      name: 'history.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify([summary()])),
    })
  await page.getByRole('button', { name: 'Mes parties', exact: true }).click()
  await page.locator('.match-row').click()
  await expect(page.getByTestId('review-grade')).toHaveText('—')
  await chapter(page, 'Vue d’ensemble').click()
  await expect(page.getByText('Chronologie indisponible', { exact: true })).toBeVisible()
  await expect(page.locator('.match-chart > svg path')).toHaveCount(0)
  await expect(page.locator('.purchase-event')).toHaveCount(0)
  await expect(page.getByText('12 chronologies nécessaires', { exact: true })).toBeVisible()
  await chapter(page, 'Moments clés').click()
  await expect(page.getByText('Aucun moment isolé', { exact: true })).toBeVisible()
  await chapter(page, 'Build').click()
  await expect(page.getByRole('button', { name: 'Étudier cet inventaire' })).toBeDisabled()
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('the review plots prior economy instead of explanatory prose', async ({ page }) => {
  const current = metadata()
  current.match_info.players[0].net_worth = 20000
  current.match_info.players[0].stats = [
    { time_stamp_s: 0, net_worth: 0, shots_hit: 0, shots_missed: 0 },
    { time_stamp_s: 600, net_worth: 6000, shots_hit: 70, shots_missed: 30 },
    { time_stamp_s: 1200, net_worth: 12000, shots_hit: 140, shots_missed: 60 },
    { time_stamp_s: 1800, net_worth: 20000, shots_hit: 210, shots_missed: 90 },
  ]
  const prior = [1, 2, 3, 4, 5].map((i) =>
    metadata({ match_id: 123456 - i, start_time: 1792497600 - i * 86400 }),
  )
  await page.goto('/')
  await page.getByRole('button', { name: 'Mon profil', exact: true }).click()
  await page
    .locator('input[type=file]')
    .last()
    .setInputFiles({
      name: 'details.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ account_id: 42, metadata: [current, ...prior] })),
    })
  await page.getByRole('button', { name: 'Mes parties', exact: true }).click()
  await page.locator('.match-row').first().click()
  const economy = page.locator('.review-axis').filter({ hasText: 'Économie' })
  await expect(economy).toContainText('5 parties')
  await expect(economy.locator('.axis-bars i')).toHaveCount(2)
  await chapter(page, 'Vue d’ensemble').click()
  await expect(page.locator('.habitual-reference')).toHaveCount(1)
  await expect(page.locator('.match-chart')).toContainText('Habitude')
  await expect(page.locator('main')).not.toContainText('L’analyse sépare les faits')
})

test('production worker produces four visual review chapters from recorded telemetry', async ({
  page,
}) => {
  const errors: string[] = []
  const workers: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('worker', (worker) => workers.push(worker.url()))
  await loadRichProfile(page)
  await expect(page.getByTestId('review-grade')).toHaveText(/^[ABCD]$/)
  await expect(page.locator('.grade-caption')).toHaveText('6 parties comparables')
  await expect(page.locator('.review-axis')).toHaveCount(5)
  await expect(page.locator('.chapter-ready')).toHaveCount(4)
  expect(workers.some((url) => /review\.worker.*\.js/.test(url))).toBe(true)
  await expect(page.locator('.priority-card')).toHaveCount(1)

  await page.locator('.priority-card').click()
  await expect(chapter(page, 'Moments clés')).toHaveAttribute('aria-current', 'step')
  await expect(
    page.getByRole('heading', { name: 'Indisponible à la perte d’un objectif', exact: true }),
  ).toBeVisible()
  await expect(page.locator('.map-death')).toHaveCount(1)
  await expect(page.locator('.respawn-band')).toHaveCount(2)
  await expect(page.locator('.damage-actor')).toHaveCount(1)
  await expect(page.locator('.damage-actor')).toContainText('800')
  await expect.poll(() => page.locator('.tactical-arrow.observed').count()).toBeGreaterThan(0)
  const phases = page.getByRole('group', { name: 'Étapes de la séquence' })
  await phases.getByRole('button', { name: /^Avant/ }).click()
  await expect(page.locator('.map-clock')).toHaveText('14:52')
  await expect(page.locator('.map-death')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Proche', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.locator('.map-player')).toHaveCount(7)
  await page.getByRole('button', { name: 'Tous', exact: true }).click()
  await expect(page.locator('.map-player')).toHaveCount(12)
  await expect(page.locator('.map-player.self title')).toHaveText('Vous · 14:48')
  await phases.getByRole('button', { name: /^Moment/ }).click()
  await expect(page.locator('.map-clock')).toHaveText('15:00')
  await expect(page.locator('.map-death')).toHaveCount(1)
  await phases.getByRole('button', { name: /^Suite/ }).click()
  await expect(page.locator('.map-clock')).toHaveText('15:30')
  await expect(page.locator('.map-player')).toHaveCount(11)
  await expect(page.locator('.map-player.self')).toHaveCount(0)
  await expect(page.locator('.episode-cursor')).toHaveText('15:30')
  await expect(page.locator('.consequence-strip')).toContainText('Votre retour16:00')
  await page.getByLabel('Instant de la scène', { exact: true }).fill('1080')
  await expect(page.locator('.map-clock')).toHaveText('18:00')
  await expect(page.locator('.episode-cursor')).toHaveText('18:00')
  await expect(page.getByText('Positions indisponibles', { exact: true })).toBeVisible()
  await expect(page.locator('.map-player')).toHaveCount(0)

  await page.getByRole('button', { name: 'Comparer les options du build', exact: true }).click()
  await expect(chapter(page, 'Build')).toHaveAttribute('aria-current', 'step')
  await expect(page.locator('.audit-cases button').first()).toBeVisible()
  await expect(page.locator('.candidate-choice').first()).toBeVisible()
  await expect(page.locator('.candidate-options')).toContainText('Healbane')
  await expect(page.locator('.actual-choice')).toBeVisible()
  await expect(page.locator('.audit-price-note')).toContainText('comparaison de coût')
  await expect(page.getByRole('button', { name: 'Étudier cet inventaire' })).toBeEnabled()

  await chapter(page, 'Vue d’ensemble').click()
  await expect(
    page.getByRole('img', { name: 'Part des âmes de votre équipe', exact: true }),
  ).toBeVisible()
  await expect(page.locator('.advantage-chart path[stroke="#70F8C1"]')).toHaveCount(1)
  await expect(page.locator('.advantage-legend')).toContainText('Équilibre économique')
  await expect(page.getByLabel('Contexte économique des équipes')).toBeVisible()
  await expect(page.locator('.team-player')).toHaveCount(12)
  await expect(page.locator('main')).not.toContainText('probabilité de victoire')
  await page.getByRole('button', { name: /^Revoir 15:00/ }).click()
  await expect(chapter(page, 'Moments clés')).toHaveAttribute('aria-current', 'step')
  await expect(page.locator('.map-clock')).toHaveText('15:00')
  expect(errors).toEqual([])
})

test('changing match replaces analysis and every chapter fits a phone viewport', async ({
  page,
}) => {
  await loadRichProfile(page)
  await expect(page.getByTestId('review-grade')).toHaveText(/^[ABCD]$/)
  await chapter(page, 'Moments clés').click()
  await expect(page.getByTestId('tactical-map')).toBeVisible()
  await page.locator('.match-row').last().click()
  await expect(chapter(page, 'Bilan')).toHaveAttribute('aria-current', 'step')
  await expect(page.locator('.match-header-meta')).toContainText('#123450')
  await expect(page.getByTestId('review-grade')).toHaveText('—')
  await expect(page.locator('.grade-caption')).toHaveText('5 parties comparables minimum')
  await expect(page.locator('.chapter-ready')).toHaveCount(4)
  await page.setViewportSize({ width: 390, height: 844 })
  for (const name of ['Bilan', 'Moments clés', 'Build', 'Vue d’ensemble']) {
    await chapter(page, name).click()
    await expect(page.locator('.chapter-loading')).toHaveCount(0)
    if (name === 'Moments clés') {
      const summary = await page.locator('.moment-summary').boundingBox()
      const scene = await page.locator('.scene-column').boundingBox()
      expect(summary!.y + summary!.height).toBeLessThanOrEqual(scene!.y)
      await page.getByRole('button', { name: 'Comparer les options du build', exact: true }).click()
      await expect(chapter(page, 'Build')).toHaveAttribute('aria-current', 'step')
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      name,
    ).toBe(true)
  }
})

test('completing summary references loads five detailed matches sequentially and enables the personal grade', async ({
  page,
}) => {
  const rich = syntheticProfile()
  const refs = rich.matches.slice(1, 6)
  const profile = {
    ...rich,
    matches: [
      rich.matches[0],
      ...refs.map((match) => ({
        ...match,
        stats: [],
        purchases: [],
        peers: [],
        positions: undefined,
        inventoryRecorded: undefined,
        deathDetails: undefined,
        objectives: undefined,
        damageMatrix: undefined,
      })),
    ],
  }
  const requested: string[] = []
  let releaseFirst!: () => void
  const firstResponse = new Promise<void>((resolve) => {
    releaseFirst = resolve
  })
  await page.route('**/api/matches/*', async (route) => {
    const id = new URL(route.request().url()).pathname.split('/').at(-1)!
    requested.push(id)
    const match = refs.find((match) => match.id === id)
    if (!match) {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Partie inconnue' }),
      })
      return
    }
    if (requested.length === 1) await firstResponse
    const body = {
      match_info: {
        match_id: Number(match.id),
        start_time: match.startTime,
        duration_s: match.duration,
        game_mode: match.mode,
        client_version: match.clientVersion,
        winning_team: 1,
        players: [
          {
            account_id: match.accountId,
            hero_id: match.heroId,
            team: match.team,
            player_slot: match.playerSlot,
            kills: match.kills,
            deaths: match.deaths,
            assists: match.assists,
            net_worth: match.netWorth,
            items: [],
            stats: match.stats.map((point) => ({
              time_stamp_s: point.time,
              net_worth: point.netWorth,
              deaths: point.deaths,
              player_damage: point.damage,
              boss_damage: point.objectiveDamage,
              teammate_healing: point.teammateHealing,
            })),
          },
        ],
      },
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) })
  })
  await page.addInitScript((profile) => {
    localStorage.setItem('deadlock.atelier.profile.42', JSON.stringify(profile))
    localStorage.setItem('deadlock.atelier.active-profile', '42')
  }, profile)
  await page.goto('/')
  await page.getByRole('button', { name: 'Mes parties', exact: true }).click()
  await page.locator('.match-row').first().click()
  await expect(page.getByTestId('review-grade')).toHaveText('—')
  const complete = page.getByRole('button', { name: 'Compléter les références', exact: true })
  await complete.click()
  try {
    await expect(page.getByText('Références 0 / 5', { exact: true })).toBeVisible()
    expect(requested).toHaveLength(1)
    await expect(complete).toBeDisabled()
  } finally {
    releaseFirst()
  }
  await expect(page.getByTestId('review-grade')).toHaveText(/^[ABCD]$/)
  await expect(page.locator('.grade-caption')).toHaveText('5 parties comparables')
  expect(requested).toEqual(refs.map((match) => match.id))
  await expect(complete).toHaveCount(0)
  await expect(page.getByRole('alert')).toHaveCount(0)
})
