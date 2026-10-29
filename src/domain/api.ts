export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public recoverable = false,
    public retryAfter?: number,
  ) {
    super(message)
  }
}
type Options = { method?: 'GET' | 'POST'; timeout?: number; body?: unknown; signal?: AbortSignal }
export async function jsonResponse(path: string, options: Options = {}) {
  const response = await fetch(path, {
    method: options.method ?? 'GET',
    signal: options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(options.timeout ?? 35000)])
      : AbortSignal.timeout(options.timeout ?? 35000),
    ...(options.body === undefined
      ? {}
      : { body: JSON.stringify(options.body), headers: { 'Content-Type': 'application/json' } }),
  })
  let data
  try {
    data = await response.json()
  } catch {
    throw new ApiError('Réponse API illisible.', response.status)
  }
  if (!response.ok)
    throw new ApiError(
      typeof data?.error === 'string' ? data.error : 'La requête a échoué.',
      response.status,
      data?.code,
      data?.recoverable,
      Number(response.headers.get('retry-after')) || undefined,
    )
  return { data: data as unknown, headers: response.headers }
}
export async function getJson(path: string, options: Options = {}): Promise<unknown> {
  return (await jsonResponse(path, options)).data
}
