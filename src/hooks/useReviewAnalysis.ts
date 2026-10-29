import { useEffect, useRef, useState } from 'react'
import type { Match } from '../domain/types'
import { comparableHistory } from '../domain/review'
import type { AdvantagePoint, BuildCase, ReviewMoment, ReviewOverview } from '../domain/review'
export type AnalysisState = {
  progress: number
  status: 'idle' | 'running' | 'ready' | 'error'
  overview?: ReviewOverview
  moments?: ReviewMoment[]
  build?: BuildCase[]
  advantage?: AdvantagePoint[]
  error?: string
}
export function useReviewAnalysis(match: Match | undefined, history: Match[]) {
  const [state, setState] = useState<AnalysisState & { forMatch?: Match; forHistory?: Match[] }>({
    progress: 0,
    status: 'idle',
  })
  const [revision, setRevision] = useState(0)
  const sequence = useRef(0)
  useEffect(() => {
    if (!match) {
      setState({ progress: 0, status: 'idle' })
      return
    }
    const id = ++sequence.current
    setState({ progress: 0, status: 'running', forMatch: match, forHistory: history })
    let worker: Worker
    try {
      worker = new Worker(new URL('../workers/review.worker.ts', import.meta.url), {
        type: 'module',
      })
    } catch {
      setState({
        progress: 0,
        status: 'error',
        forMatch: match,
        forHistory: history,
        error: 'Le calcul en arrière-plan n’a pas pu démarrer.',
      })
      return
    }
    worker.onmessage = ({ data }) => {
      if (data.id !== sequence.current) return
      if (data.stage === 'complete') worker.terminate()
      if (data.stage === 'error') {
        worker.terminate()
        setState((old) => ({ ...old, status: 'error', error: data.error }))
        return
      }
      setState((old) => ({
        ...old,
        progress: data.progress,
        status: data.stage === 'complete' ? 'ready' : 'running',
        ...(data.overview ? { overview: data.overview } : {}),
        ...(data.moments ? { moments: data.moments } : {}),
        ...(data.build ? { build: data.build } : {}),
        ...(data.advantage ? { advantage: data.advantage } : {}),
      }))
    }
    worker.onerror = () => {
      if (id === sequence.current)
        setState((old) => ({ ...old, status: 'error', error: 'Le calcul a été interrompu.' }))
    }
    // Historical references only need self counters, never hundreds of full replay paths/matrices.
    const references = comparableHistory(match, history).map((m) => ({
      ...m,
      peers: [],
      positions: undefined,
      damageMatrix: undefined,
      objectives: undefined,
      deathDetails: undefined,
      purchases: [],
    }))
    worker.postMessage({ id, match, history: references })
    return () => {
      sequence.current++
      worker.terminate()
    }
  }, [match, history, revision])
  const visible =
    state.forMatch === match && state.forHistory === history
      ? state
      : { progress: 0, status: match ? ('running' as const) : ('idle' as const) }
  return { ...visible, retry: () => setRevision((n) => n + 1) }
}
