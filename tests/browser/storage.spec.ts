import { test, expect } from '@playwright/test'
import { syntheticProfile } from '../reviewFixtures'

const prefix = 'deadlock.atelier.'
async function savedProfile(page: import('@playwright/test').Page, account: number) {
  return page.evaluate(async (account) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('deadlock-atelier', 1)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    const value = await new Promise<unknown>((resolve, reject) => {
      const req = db.transaction('profiles').objectStore('profiles').get(account)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    db.close()
    return value ? JSON.stringify(value).length : 0
  }, account)
}

test('large imported telemetry survives reload in IndexedDB beyond localStorage capacity', async ({
  page,
}) => {
  const count = 12000
  const data = {
    match_info: {
      match_id: 654321,
      start_time: 1792497600,
      duration_s: 7200,
      winning_team: 0,
      game_mode: 1,
      players: Array.from({ length: 12 }, (_, slot) => ({
        account_id: 42 + slot,
        hero_id: 1,
        player_slot: slot,
        team: slot < 6 ? 0 : 1,
        net_worth: 30000,
        kills: 1,
        deaths: 1,
        assists: 1,
        items: [],
        stats: [
          { time_stamp_s: 0, net_worth: 0 },
          { time_stamp_s: 7200, net_worth: 30000 },
        ],
      })),
      match_paths: {
        interval_s: 0.5,
        x_resolution: 1024,
        y_resolution: 1024,
        paths: Array.from({ length: 12 }, (_, slot) => ({
          player_slot: slot,
          x_min: -1000,
          x_max: 1000,
          y_min: -1000,
          y_max: 1000,
          x_pos: Array(count).fill(512),
          y_pos: Array(count).fill(512),
          health: Array(count).fill(100),
        })),
      },
    },
  }
  await page.goto('/')
  await page.getByRole('button', { name: 'Mon profil', exact: true }).click()
  await page.getByLabel('Account ID ou SteamID64').fill('42')
  await page
    .locator('input[type=file]')
    .last()
    .setInputFiles({
      name: 'large.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(data)),
    })
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Compte 42/ })).toBeVisible()
  await expect.poll(() => savedProfile(page, 42)).toBeGreaterThan(5 * 1024 * 1024)
  expect(await page.evaluate((key) => localStorage.getItem(key), prefix + 'profile.42')).toBeNull()
  await page.reload()
  await expect(page.getByRole('button', { name: /Compte 42/ })).toBeVisible()
  await page.getByRole('button', { name: 'Mes parties', exact: true }).click()
  await expect(page.locator('.match-row')).toHaveCount(1)
})

test('legacy profile migrates, merges once and deletion does not restore it', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(
    ({ profile, prefix }) => {
      localStorage.setItem(prefix + 'profile.42', JSON.stringify(profile))
      localStorage.setItem(prefix + 'active-profile', '42')
    },
    { profile: syntheticProfile(), prefix },
  )
  await page.reload()
  await expect(page.getByRole('button', { name: /Compte 42/ })).toBeVisible()
  await expect.poll(() => savedProfile(page, 42)).toBeGreaterThan(0)
  expect(await page.evaluate((key) => localStorage.getItem(key), prefix + 'profile.42')).toBeNull()
  await page.reload()
  await expect(page.getByRole('button', { name: /Compte 42/ })).toBeVisible()
  await page.getByRole('button', { name: 'Mes parties', exact: true }).click()
  await expect(page.locator('.match-row')).toHaveCount(7)
  await page.getByRole('button', { name: /Compte 42/ }).click()
  await page.getByRole('button', { name: /Effacer mes données personnelles/ }).click()
  await expect(page.getByRole('button', { name: 'Mon profil', exact: true })).toBeVisible()
  await expect.poll(() => savedProfile(page, 42)).toBe(0)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Mon profil', exact: true })).toBeVisible()
  expect(
    await page.evaluate((key) => localStorage.getItem(key), prefix + 'active-profile'),
  ).toBeNull()
})
