import { test, expect } from '@playwright/test'
import { syntheticProfile, syntheticMatch, testPurchase } from '../reviewFixtures'
const chapter = (page: import('@playwright/test').Page, name: string) =>
  page
    .getByRole('navigation', { name: 'Chapitres de la review' })
    .getByRole('button', { name: new RegExp(name) })
async function open(page: import('@playwright/test').Page, heroId = 1) {
  const profile = syntheticProfile()
  profile.matches[0] = syntheticMatch({
    heroId,
    purchases: [
      ...(heroId === 1 ? [{ itemId: '491391007', time: 15, upgradeInfo: 65536 }] : []),
      ...[
        testPurchase('upgrade_high_velocity_mag', 60),
        { ...testPurchase('upgrade_pristine_emblem', 600) },
        testPurchase('upgrade_clip_size', 1000),
      ].map((p) => ({ ...p, upgradeInfo: 65536 })),
    ],
  })
  await page.addInitScript((p) => {
    localStorage.setItem('deadlock.atelier.active-profile', '42')
    localStorage.setItem('deadlock.atelier.profile.42', JSON.stringify(p))
  }, profile)
  await page.goto('/')
  await page.getByRole('button', { name: 'Mes parties', exact: true }).click()
  await page.locator('.match-row').first().click()
  await expect(page.locator('.chapter-ready')).toHaveCount(4)
  await chapter(page, 'Build').click()
  await page.getByRole('button', { name: 'Rejouer un achat', exact: true }).click()
  await expect(page.getByLabel('Achat à rejouer')).toBeVisible()
  await expect(page.getByLabel('Achat à rejouer').locator('option')).toHaveCount(3)
}
test('replays component credit, shows the tradeoff and transfers the same prefix and pair into the laboratory', async ({
  page,
}) => {
  await open(page)
  await page.getByLabel('Achat à rejouer').selectOption({ label: '10:00 · Opening Rounds' })
  await page.getByLabel('Objet alternatif').selectOption('upgrade_health')
  await expect(page.locator('.choice-a')).toContainText('800')
  await expect(page.locator('.choice-b')).toContainText('800')
  await expect(page.locator('.decision-time')).toContainText('Même coût')
  await page.getByRole('button', { name: 'Inventaire', exact: true }).click()
  await expect(page.locator('.inventory-a .decision-components .item-art')).toHaveCount(1)
  await expect(page.locator('.inventory-b .decision-components')).toContainText('Aucun')
  await page.getByRole('button', { name: 'Échange', exact: true }).click()
  await expect(
    page.getByRole('img', { name: 'Dégâts de tirs projetés et fenêtres de rechargement' }),
  ).toBeVisible()
  await expect(page.locator('.reload-window').first()).toBeVisible()
  await expect(page.getByLabel('Précision de la projection')).toHaveValue('70')
  await page.getByLabel('Précision de la projection').fill('0')
  await expect(page.getByRole('button', { name: 'Revenir au relevé' })).toBeVisible()
  await page.getByRole('button', { name: 'Revenir au relevé' }).click()
  await expect(page.getByLabel('Précision de la projection')).toHaveValue('70')
  await page.getByLabel('Durée de l’échange').fill('20')
  await page.getByLabel('Résistance cible de la projection').fill('30')
  await page.getByRole('button', { name: 'Comparaison', exact: true }).click()
  await expect(page.locator('.decision-metrics-heading')).toContainText('20 s')
  await page.getByRole('button', { name: 'Comparer dans le laboratoire' }).click()
  await expect(page.getByLabel('Objet A')).toHaveValue('upgrade_pristine_emblem')
  await expect(page.getByLabel('Objet B')).toHaveValue('upgrade_health')
  await expect(page.getByLabel('Précision des tirs', { exact: true })).toHaveValue('70')
  await expect(page.getByLabel('Résistance balle de la cible')).toHaveValue('30')
  await expect(page.getByLabel('Durée d’échange', { exact: true })).toHaveValue('20')
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem('deadlock.atelier.build') ?? '{}').entries?.map(
          (e: { itemId: string }) => e.itemId,
        ),
      ),
    )
    .toEqual(['upgrade_high_velocity_mag'])
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
test('all three decision views fit desktop, phone and short landscape screens without scrolling', async ({
  page,
}) => {
  await open(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  for (const [width, height] of [
    [1366, 768],
    [390, 844],
    [640, 480],
  ]) {
    await page.setViewportSize({ width, height })
    for (const view of ['Comparaison', 'Échange', 'Inventaire']) {
      await page.getByRole('button', { name: view, exact: true }).click()
      const sizes = await page.locator('.decision-workbench').evaluate((root) => {
        const frame = root.closest('.review-stage')!.getBoundingClientRect()
        return {
          overflow: root.scrollHeight - root.clientHeight,
          outside: [...root.querySelectorAll('button,input,select')]
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
            .map((e) => e.getAttribute('aria-label') ?? e.textContent),
          clipped: [...root.querySelectorAll('.decision-panel,.decision-choice,.decision-metrics')]
            .filter((e) => e.scrollHeight > e.clientHeight + 4)
            .map((e) => e.className),
        }
      })
      expect(sizes.outside, `${width}x${height} ${view}`).toEqual([])
      expect(sizes.clipped, `${width}x${height} ${view}`).toEqual([])
      expect(sizes.overflow, `${width}x${height} ${view}`).toBeLessThanOrEqual(4)
    }
  }
})
test('an unsupported hero still compares item contributions without a borrowed weapon projection', async ({
  page,
}) => {
  await open(page, 81)
  await page.getByLabel('Objet alternatif').selectOption('upgrade_health')
  await expect(page.getByLabel('Contributions des objets')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Comparer dans le laboratoire' })).toBeDisabled()
  await page.getByRole('button', { name: 'Échange', exact: true }).click()
  await expect(page.getByText('Arme de ce héros non modélisée', { exact: true })).toBeVisible()
  await expect(page.locator('.shot-curve')).toHaveCount(0)
})
