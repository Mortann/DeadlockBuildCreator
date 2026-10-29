import type { BuildCase, ReviewMoment } from './review'
export type ReviewSlide = {
  id: string
  chapter: 0 | 1 | 2 | 3
  kind: 'bilan' | 'moment' | 'build' | 'purchases' | 'economy' | 'teams'
  momentId?: string
  caseId?: string
}
export function reviewSlides(
  moments: ReviewMoment[] | undefined,
  cases: BuildCase[] | undefined,
): ReviewSlide[] {
  return [
    { id: 'bilan', chapter: 0, kind: 'bilan' },
    ...(moments?.length
      ? moments.map((m) => ({
          id: `moment:${m.id}`,
          chapter: 1 as const,
          kind: 'moment' as const,
          momentId: m.id,
        }))
      : [{ id: 'moment:empty', chapter: 1 as const, kind: 'moment' as const }]),
    ...(cases?.length
      ? cases.map((c) => ({
          id: `build:${c.id}`,
          chapter: 2 as const,
          kind: 'build' as const,
          caseId: c.id,
        }))
      : [{ id: 'build:empty', chapter: 2 as const, kind: 'build' as const }]),
    { id: 'purchases', chapter: 2, kind: 'purchases' },
    { id: 'economy', chapter: 3, kind: 'economy' },
    { id: 'teams', chapter: 3, kind: 'teams' },
  ]
}
export function currentSlide(slides: ReviewSlide[], id: string): ReviewSlide {
  return (
    slides.find((s) => s.id === id) ??
    slides.find((s) =>
      id.startsWith('moment:')
        ? s.chapter === 1
        : id.startsWith('build:')
          ? s.chapter === 2
          : false,
    ) ??
    slides[0]
  )
}
