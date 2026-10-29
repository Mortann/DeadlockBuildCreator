import { describe, expect, it } from 'vitest'
import {
  freshMapObservation,
  mapTrailSegments,
  projectMapPoint,
  relativeMapBounds,
  worldMapBounds,
} from '../src/domain/map'

describe('recorded map geometry', () => {
  it('uses the supplied world radius and inverts only the image y axis', () => {
    const bounds = worldMapBounds(100)!
    expect(projectMapPoint({ x: 0, y: 0 }, bounds)).toEqual({ x: 300, y: 300 })
    expect(projectMapPoint({ x: -100, y: 100 }, bounds)).toEqual({ x: 0, y: 0 })
    expect(projectMapPoint({ x: 100, y: -100 }, bounds)).toEqual({ x: 600, y: 600 })
    expect(worldMapBounds(0)).toBeNull()
  })
  it('does not clamp out-of-bounds coordinates into a false border position', () => {
    const point = projectMapPoint({ x: 200, y: 0 }, worldMapBounds(100)!)!
    expect(point.x).toBe(900)
  })
  it('preserves aspect ratio and relative positions without assuming a map image', () => {
    const bounds = relativeMapBounds([
      { x: 100, y: 400 },
      { x: 200, y: 800 },
    ])
    expect(bounds.maxX - bounds.minX).toBeCloseTo(bounds.maxY - bounds.minY)
    const a = projectMapPoint({ x: 100, y: 400 }, bounds)!,
      b = projectMapPoint({ x: 200, y: 800 }, bounds)!
    expect((b.y - a.y) / (b.x - a.x)).toBeCloseTo(-4)
  })
  it('rejects malformed geometry and does not borrow future or old observations', () => {
    expect(projectMapPoint({ x: NaN, y: 0 }, worldMapBounds(100)!)).toBeNull()
    expect(freshMapObservation(101, 100)).toBe(false)
    expect(freshMapObservation(80, 100)).toBe(false)
    expect(freshMapObservation(90, 100)).toBe(true)
  })
  it('never bridges a missing stretch in recorded trails or extends beyond the cursor', () => {
    const points = [
      { time: 70, x: 0, y: 0 },
      { time: 80, x: 1, y: 1 },
      { time: 82, x: 2, y: 2 },
      { time: 99, x: 3, y: 3 },
      { time: 100, x: 4, y: 4 },
      { time: 105, x: 5, y: 5 },
    ]
    expect(mapTrailSegments(points, 100).map((s) => s.map((p) => p.time))).toEqual([
      [80, 82],
      [99, 100],
    ])
  })
})
