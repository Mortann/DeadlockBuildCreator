import data from '../data/heroRoster.json'
import type { HeroIdentity } from './types'
export const heroRoster: HeroIdentity[] = data.heroes
export const heroIdentity = (id: number) => heroRoster.find((h) => h.id === id)
