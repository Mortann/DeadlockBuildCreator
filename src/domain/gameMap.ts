import snapshot from '../data/mapSnapshot.json'
import type { Match, ObjectiveEvent } from './types'
import type { MapPoint } from './map'
export type MapCalibration = {
  radius: number
  imageSrc: string
  clientVersion?: number
  basis: 'version' | 'date'
}
/** A declared compatible client version wins; otherwise use the dated patch manifest. */
export function matchMap(
  match: Pick<Match, 'clientVersion' | 'startTime'>,
): MapCalibration | undefined {
  const version =
    match.clientVersion ??
    snapshot.versions.find((v) => Date.parse(v.at) / 1000 <= match.startTime)?.version
  if (!version || version < snapshot.minVersion || version > snapshot.maxVersion) return undefined
  return {
    radius: snapshot.radius,
    imageSrc: snapshot.imageSrc,
    clientVersion: version,
    basis: match.clientVersion ? 'version' : 'date',
  }
}
export function mapObjective(
  objective: ObjectiveEvent,
  calibration: MapCalibration | undefined,
): MapPoint | undefined {
  if (!calibration || objective.team === undefined) return undefined
  const type =
    objective.type === 'guardian'
      ? 'tier1'
      : objective.type === 'walker'
        ? 'tier2'
        : objective.type === 'titan'
          ? 'titan'
          : objective.type === 'core'
            ? 'core'
            : undefined
  if (!type) return undefined
  const key = `team${objective.team}_${type}${type.startsWith('tier') ? `_${objective.lane}` : ''}`
  const point = (
    snapshot.objectives as Record<string, { left_relative: number; top_relative: number }>
  )[key]
  if (!point) return undefined
  // API positions are marker top-lefts. Their sizes are defined in the client CSS.
  const x = point.left_relative + (type === 'core' ? 0.15 : 0.05),
    y = point.top_relative + (type === 'core' ? 0.04 : 0.05)
  return { x: (x * 2 - 1) * calibration.radius, y: (1 - y * 2) * calibration.radius }
}
export const mapZiplines = snapshot.ziplines
