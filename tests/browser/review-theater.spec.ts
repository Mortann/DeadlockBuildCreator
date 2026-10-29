import { test, expect } from '@playwright/test'
import { syntheticProfile, syntheticMatch } from '../reviewFixtures'
const chapter = (page: import('@playwright/test').Page, name: string) =>
  page
    .getByRole('navigation', { name: 'Chapitres de la review' })
    .getByRole('button', { name: new RegExp(name) })
async function open(page: import('@playwright/test').Page, large = false) {
  const profile = syntheticProfile()
  if (large)
    profile.matches = Array.from({ length: 40 }, (_, i) =>
      syntheticMatch({
        id: String(123456 - i),
        startTime: 1792497600 - i * 86400,
        heroId: i === 1 ? 81 : 1,
      }),
    )
  await page.addInitScript((p) => {
    localStorage.setItem('deadlock.atelier.active-profile', '42')
    localStorage.setItem('deadlock.atelier.profile.42', JSON.stringify(p))
  }, profile)
  await page.goto('/')
  await page.getByRole('button', { name: 'Mes parties', exact: true }).click()
}

test('a paginated library opens a full viewport review and returns to the same page', async ({
  page,
}) => {
  await open(page, true)
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(
    true,
  )
  const first = await page.locator('.match-row').first().getAttribute('aria-label')
  await page.getByRole('button', { name: 'Page suivante de l’historique' }).click()
  await expect(page.locator('.match-row').first()).not.toHaveAttribute('aria-label', first!)
  const chosen = await page.locator('.match-row').first().getAttribute('aria-label')
  await page.locator('.match-row').first().click()
  const dialog = page.getByRole('dialog', { name: /Review de la partie/ })
  await expect(dialog).toBeVisible()
  await expect(page.locator('.chapter-ready')).toHaveCount(4)
  expect(await dialog.evaluate((e) => ({ w: e.clientWidth, h: e.clientHeight }))).toEqual({
    w: 1440,
    h: 1000,
  })
  await page.mouse.wheel(0, 1200)
  expect(await dialog.evaluate((e) => e.scrollTop)).toBe(0)
  await page.keyboard.press('ArrowRight')
  await expect(chapter(page, 'Moments clés')).toHaveAttribute('aria-current', 'step')
  await page.keyboard.press('ArrowLeft')
  await expect(chapter(page, 'Bilan')).toHaveAttribute('aria-current', 'step')
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('.match-row').first()).toHaveAttribute('aria-label', chosen!)
  await page.getByLabel('Rechercher une partie').fill('Celeste')
  await expect(page.locator('.match-row')).toHaveCount(1)
  await expect(page.locator('.match-row')).toContainText('Celeste')
})

test('the actual map stays central, trajectories are focused and playback changes only recorded observations', async ({
  page,
}) => {
  await open(page)
  await page.locator('.match-row').first().click()
  await chapter(page, 'Moments clés').click()
  await expect(page.locator('.tactical-map')).toHaveClass(/geographic/)
  await expect(page.locator('.map-terrain')).toHaveAttribute(
    'href',
    '/assets/map/midtown-6711.avif',
  )
  await expect(page.locator('.map-zipline')).toHaveCount(3)
  const map = await page.locator('.scene-column').boundingBox(),
    context = await page.locator('.moment-summary').boundingBox()
  expect(map!.width).toBeGreaterThan(context!.width * 2)
  await expect(page.locator('.observed-trail')).toHaveCount(1)
  await page
    .getByRole('group', { name: 'Étapes de la séquence' })
    .getByRole('button', { name: /^Avant/ })
    .click()
  await expect(page.locator('.map-death')).toHaveCount(0)
  const before = await page.getByLabel('Instant de la scène', { exact: true }).inputValue()
  await page.getByRole('button', { name: 'Lire la scène' }).click()
  await expect(page.getByRole('button', { name: 'Mettre la scène en pause' })).toBeVisible()
  await expect
    .poll(() => page.getByLabel('Instant de la scène', { exact: true }).inputValue())
    .not.toBe(before)
  await page.getByRole('button', { name: 'Mettre la scène en pause' }).click()
  await expect(page.getByRole('button', { name: 'Lire la scène' })).toBeVisible()
})

test('all review pages fit desktop and mobile without scrolling or hidden controls', async ({
  page,
}) => {
  await open(page)
  await page.locator('.match-row').first().click()
  await expect(page.locator('.chapter-ready')).toHaveCount(4)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  for (const [width, height] of [
    [640, 480],
    [1366, 768],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height })
    await chapter(page, 'Bilan').click()
    for (let step = 0; step < 8; step++) {
      const result = await page.locator('.review-stage').evaluate((stage) => {
        const slide = stage.querySelector('.review-slide')!,
          frame = stage.getBoundingClientRect()
        const outside = [...slide.querySelectorAll('button,input')]
          .filter((e) => {
            const r = e.getBoundingClientRect()
            return (
              r.height > 0 &&
              (r.top < frame.top - 1 ||
                r.bottom > frame.bottom + 1 ||
                r.left < frame.left - 1 ||
                r.right > frame.right + 1)
            )
          })
          .map((e) => e.getAttribute('aria-label') ?? e.textContent)
        const nested = [...slide.querySelectorAll('.audit-detail,.inventory-panel')]
          .filter((el) => el.scrollHeight > el.clientHeight + 4)
          .map((el) => el.className)
        return { overflow: slide.scrollHeight - slide.clientHeight, outside, nested }
      })
      expect(result.outside, `${width}×${height} page${step + 1}`).toEqual([])
      expect(result.nested, `${width}×${height} page${step + 1}`).toEqual([])
      expect(result.overflow, `${width}×${height} page${step + 1}`).toBeLessThanOrEqual(4)
      if (step < 7) await page.getByRole('button', { name: 'Suivant', exact: true }).click()
    }
  }
  await page.getByRole('button', { name: 'Terminer', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
