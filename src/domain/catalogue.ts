import snapshot from '../data/snapshot.json'
import type { Build, Item, Hero, Category } from './types'

export const catalogue: Item[] = snapshot.items.map((item) => ({
  ...item,
  category: item.category as Category,
  properties: Object.fromEntries(
    Object.entries(item.properties).filter(
      (entry): entry is [string, number] => typeof entry[1] === 'number',
    ),
  ),
}))
export const heroes = snapshot.heroes as Hero[]
export const itemById = new Map(catalogue.map((item) => [item.id, item]))
export const itemByApiId = new Map(catalogue.map((item) => [String(item.apiId), item]))
export const source = { version: snapshot.clientVersion, date: snapshot.date, url: snapshot.source }
export const phases = ['lane', 'mid', 'late'] as const
export const phaseLabels = { lane: 'Lane', mid: 'Mid game', late: 'Late game' }
export const categoryLabels: Record<Category, string> = {
  weapon: 'Arme',
  vitality: 'Vitalité',
  spirit: 'Esprit',
}
export const statLabels: Record<string, string> = {
  BaseAttackDamagePercent: 'Dégâts d’arme',
  BonusFireRate: 'Cadence',
  BonusClipSizePercent: 'Chargeur',
  BonusHealth: 'PV',
  TechPower: 'Puissance spirituelle',
  BulletResist: 'Résistance balle',
  TechResist: 'Résistance esprit',
  BonusBulletSpeedPercent: 'Vitesse des balles',
  BonusHealthRegen: 'Régénération',
  HealthRegen: 'Régénération',
  StatusResistancePercent: 'Résistance aux contrôles',
  MaxHealthLossPercent: 'PV maximum',
  BulletArmorReduction: 'Résistance balle adverse',
  HealAmpReceivePenaltyPercent: 'Soins adverses',
  CooldownReduction: 'Réduction des délais',
  SpiritLifestealPercent: 'Vol de vie esprit',
}
export function statUnit(key: string) {
  if (['BonusHealth', 'TechPower'].includes(key)) return ''
  if (['BonusHealthRegen', 'HealthRegen'].includes(key)) return '/s'
  return '%'
}
export const explanations: Record<string, string> = {
  upgrade_clip_size:
    'Un chargeur plus grand prolonge le tir avant le rechargement. Son intérêt augmente dans les échanges longs.',
  upgrade_high_velocity_mag:
    'Améliore les dégâts de base et la vitesse des projectiles. La vitesse ne garantit pas une meilleure précision.',
  upgrade_rapid_rounds:
    'La cadence multiplie les dégâts d’arme, mais vide aussi le chargeur plus vite.',
  upgrade_blitz_bullets:
    'Une amélioration de Rapid Rounds. Le composant est remplacé dans l’inventaire.',
  upgrade_health:
    'Une réserve de PV supplémentaire. Elle ne couvre pas à elle seule les contrôles ou le manque de portée.',
  upgrade_healbane:
    'Les dégâts Spirit appliquent la réduction des soins. Le héros doit pouvoir maintenir cet effet sur la menace.',
  upgrade_bullet_resist_shredder:
    'Les dégâts Spirit réduisent la résistance balle de la cible. Activez cette condition dans le scénario pour explorer son effet.',
  upgrade_toxic_bullets:
    'La réduction de soins et le saignement nécessitent une accumulation de tirs. Ces procs ne sont pas encore simulés.',
  upgrade_metal_skin:
    'L’actif protège des balles pendant sa fenêtre. Cette fenêtre et les décisions d’activation ne sont pas encore simulées.',
  upgrade_glass_cannon:
    'Un investissement offensif avec des compromis. Les effets conditionnels doivent être considérés séparément de l’arme de base.',
  upgrade_improved_spirit:
    'Le gain dépend des coefficients de chaque capacité. Les compétences ne sont pas encore incluses dans le calcul des dégâts.',
}
export function itemDescription(item: Item) {
  return (
    explanations[item.id] ??
    (item.active
      ? 'Objet actif : sa valeur dépend de la fenêtre d’utilisation. Effet actif hors calcul.'
      : 'Les propriétés sont extraites du client. Les effets conditionnels et les compétences restent hors calcul.')
  )
}
export function topStats(item: Item) {
  return Object.entries(item.properties)
    .filter(([key]) => statLabels[key])
    .slice(0, 2)
}
export function initialBuild(): Build {
  return {
    name: 'Mon premier build',
    heroId: 1,
    entries: [
      ['upgrade_high_velocity_mag', 'lane'],
      ['upgrade_clip_size', 'lane'],
      ['upgrade_health', 'lane'],
      ['upgrade_rapid_rounds', 'lane'],
      ['upgrade_pristine_emblem', 'mid'],
      ['upgrade_blitz_bullets', 'mid'],
      ['upgrade_glass_cannon', 'late'],
    ].map(([itemId, phase], index) => ({
      id: `initial-${index}`,
      itemId,
      phase: phase as 'lane' | 'mid' | 'late',
      situational: false,
      note: '',
    })),
  }
}
