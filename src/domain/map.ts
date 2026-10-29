/** Geometry and freshness rules for recorded positions; no gameplay inference. */
export type MapPoint = { x: number; y: number }
export type TimedMapPoint = MapPoint & { time: number }
export type MapBounds = { minX: number; maxX: number; minY: number; maxY: number }
export const MAP_OBSERVATION_MAX_AGE = 12
export const MAP_TRAIL_WINDOW = 24

export const isMapPoint = (p: unknown): p is MapPoint => {
  if (!p || typeof p !== 'object') return false
  const v = p as MapPoint
  return Number.isFinite(v.x) && Number.isFinite(v.y)
}

/** SVG y points downward; recorded world y points upward. No metres conversion. */
export function projectMapPoint(point: MapPoint, bounds: MapBounds, size = 600): MapPoint | null {
  const spanX = bounds.maxX - bounds.minX,
    spanY = bounds.maxY - bounds.minY
  if (
    !isMapPoint(point) ||
    !Number.isFinite(size) ||
    size <= 0 ||
    !Number.isFinite(spanX) ||
    !Number.isFinite(spanY) ||
    spanX <= 0 ||
    spanY <= 0
  )
    return null
  return {
    x: ((point.x - bounds.minX) / spanX) * size,
    y: ((bounds.maxY - point.y) / spanY) * size,
  }
}

/** A geographic backdrop must provide its own actual radius, not a guessed default. */
export function worldMapBounds(radius: number): MapBounds | null {
  return Number.isFinite(radius) && radius > 0
    ? { minX: -radius, maxX: radius, minY: -radius, maxY: radius }
    : null
}

/** A square local frame preserves angles/distances but makes no geographic assertion. */
export function relativeMapBounds(points: MapPoint[], minimumSpan = 1600): MapBounds {
  const valid = points.filter(isMapPoint)
  if (!valid.length) return { minX: -1, maxX: 1, minY: -1, maxY: 1 }
  const minX = Math.min(...valid.map((p) => p.x)),
    maxX = Math.max(...valid.map((p) => p.x))
  const minY = Math.min(...valid.map((p) => p.y)),
    maxY = Math.max(...valid.map((p) => p.y))
  const span =
    Math.max(
      Number.isFinite(minimumSpan) && minimumSpan > 0 ? minimumSpan : 1600,
      maxX - minX,
      maxY - minY,
    ) * 1.4
  const cx = (minX + maxX) / 2,
    cy = (minY + maxY) / 2
  return { minX: cx - span / 2, maxX: cx + span / 2, minY: cy - span / 2, maxY: cy + span / 2 }
}

export function freshMapObservation(
  observedAt: number,
  time: number,
  maxAge = MAP_OBSERVATION_MAX_AGE,
): boolean {
  return (
    Number.isFinite(observedAt) &&
    Number.isFinite(time) &&
    Number.isFinite(maxAge) &&
    maxAge >= 0 &&
    observedAt <= time &&
    time - observedAt <= maxAge
  )
}

/** Connect actual consecutive observations only, never bridge a telemetry hole. */
export function mapTrailSegments(
  points: TimedMapPoint[],
  time: number,
  maxGap = MAP_OBSERVATION_MAX_AGE,
): TimedMapPoint[][] {
  const samples = points
    .filter(
      (p) =>
        isMapPoint(p) &&
        Number.isFinite(p.time) &&
        p.time <= time &&
        p.time >= time - MAP_TRAIL_WINDOW,
    )
    .sort((a, b) => a.time - b.time)
  const segments: TimedMapPoint[][] = []
  for (const point of samples) {
    const last = segments.at(-1)
    if (!last || point.time - last.at(-1)!.time > maxGap || point.time === last.at(-1)!.time)
      segments.push([point])
    else last.push(point)
  }
  return segments.filter((s) => s.length >= 2)
}
