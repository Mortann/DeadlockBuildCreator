import identities from '../data/abilityIdentities.json'
import type { Purchase } from './types'

const signatureIds = new Set(Object.keys(identities.abilities))
/** The API's items array also contains signature unlocks/upgrades. Preserve raw rows, skip them in shop calculations. */
export const isAbilityRow = (row: Pick<Purchase, 'itemId'>) => signatureIds.has(row.itemId)
/** 0x00010000 is the ordinary TRAINED bit, not a corruption or an enhanced item. */
export const hasUnsupportedItemUpgrade = (row: Pick<Purchase, 'upgradeInfo'>) =>
  row.upgradeInfo !== undefined && row.upgradeInfo !== 0 && row.upgradeInfo !== 0x00010000
export const shopPurchases = (rows: Purchase[]) => rows.filter((row) => !isAbilityRow(row))
