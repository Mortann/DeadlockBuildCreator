import { describe, it, expect } from 'vitest'
import { matchMap, mapObjective } from '../src/domain/gameMap'
import { currentSlide, reviewSlides } from '../src/domain/reviewSlides'
import { reviewBuild, reviewMoments } from '../src/domain/review'
import { syntheticMatch } from './reviewFixtures'
describe('map family and coordinate calibration', () => {
  it('uses a declared compatible client version and refuses an incompatible version even for a recent date', () => {
    expect(matchMap({ clientVersion: 6821, startTime: 0 })).toMatchObject({
      radius: 10752,
      basis: 'version',
      imageSrc: '/assets/map/midtown-6711.avif',
    })
    expect(matchMap({ clientVersion: 6500, startTime: 1792940353 })).toBeUndefined()
    expect(matchMap({ clientVersion: 9999, startTime: 1792940353 })).toBeUndefined()
  })
  it('selects the published patch preceding the match and keeps old dates uncalibrated', () => {
    expect(matchMap({ startTime: Date.parse('2026-10-25T12:00:00Z') / 1000 })).toMatchObject({
      clientVersion: 6819,
      basis: 'date',
    })
    expect(matchMap({ startTime: 0 })).toBeUndefined()
  })
  it('converts objective marker centers instead of placing the point at the CSS top left', () => {
    const calibration = matchMap({ clientVersion: 6821, startTime: 0 })
    const point = mapObjective(
      { id: 'g', type: 'guardian', team: 0, lane: 4, destroyedTime: 100 },
      calibration,
    )!
    expect(point.x).toBeCloseTo((0.7774 + 0.05) * 21504 - 10752)
    expect(point.y).toBeCloseTo(10752 - (0.5423 + 0.05) * 21504)
    expect(
      mapObjective({ id: 'u', type: 'guardian', lane: 4, destroyedTime: 100 }, calibration),
    ).toBeUndefined()
  })
})
describe('review page progression', () => {
  it('includes every detected moment and build case once before the final graphs and teams', () => {
    const match = syntheticMatch(),
      moments = reviewMoments(match, []),
      cases = reviewBuild(match, moments)
    const slides = reviewSlides(moments, cases)
    expect(slides[0].id).toBe('bilan')
    expect(slides.filter((s) => s.momentId).map((s) => s.momentId)).toEqual(
      moments.map((m) => m.id),
    )
    expect(slides.filter((s) => s.caseId).map((s) => s.caseId)).toEqual(cases.map((c) => c.id))
    expect(slides.slice(-2).map((s) => s.id)).toEqual(['economy', 'teams'])
    expect(new Set(slides.map((s) => s.id)).size).toBe(slides.length)
  })
  it('keeps the requested chapter selected while worker results arrive', () => {
    const pending = reviewSlides(undefined, undefined)
    expect(currentSlide(pending, 'moment:death-900').chapter).toBe(1)
    expect(currentSlide(pending, 'build:healing-48').chapter).toBe(2)
    const match = syntheticMatch(),
      moments = reviewMoments(match, [])
    expect(currentSlide(reviewSlides(moments, []), 'moment:empty').momentId).toBe(moments[0].id)
  })
})
