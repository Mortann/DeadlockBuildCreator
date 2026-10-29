import {
  REVIEW_VERSION,
  reviewBuild,
  reviewMoments,
  reviewOverview,
  teamAdvantage,
} from '../domain/review'
import type { Match } from '../domain/types'

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<{ id: number; match: Match; history: Match[] }>) => void) | null
  postMessage: (value: unknown) => void
}
const yieldStage = () => new Promise<void>((resolve) => setTimeout(resolve, 0))
scope.onmessage = async ({ data }) => {
  try {
    const { id, match, history } = data
    const overview = reviewOverview(match, history)
    scope.postMessage({ id, stage: 'overview', progress: 1, overview })
    await yieldStage()
    const moments = reviewMoments(match, history)
    scope.postMessage({ id, stage: 'moments', progress: 2, moments })
    await yieldStage()
    const build = reviewBuild(match, moments)
    scope.postMessage({ id, stage: 'build', progress: 3, build })
    await yieldStage()
    const advantage = teamAdvantage(match)
    scope.postMessage({ id, stage: 'complete', progress: 4, advantage, version: REVIEW_VERSION })
  } catch {
    scope.postMessage({
      id: data.id,
      stage: 'error',
      error: 'Analyse interrompue. Vérifiez les données importées.',
    })
  }
}
