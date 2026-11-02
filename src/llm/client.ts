import type { ChatRequest } from './types.ts'

/**
 * Streams assistant text from the same-origin `/api/chat` forwarder.
 * The API key is sent only in this POST body — nowhere else.
 */
export async function streamChat(
  request: ChatRequest,
  onDelta?: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal,
  })

  if (!response.ok) {
    // Static hosting (e.g. Vercel) has no /api/chat forwarder.
    if (response.status === 404 || response.status === 405) {
      throw new Error(
        'AI chat is not available on this hosted version. Use Quizzes → Import quiz, or run the app locally with npm run dev.',
      )
    }
    let message = `Request failed with status ${response.status}`
    try {
      const data = (await response.json()) as { error?: string }
      if (typeof data.error === 'string' && data.error.length > 0) {
        message = data.error
      }
    } catch {
      // non-JSON error body
    }
    throw new Error(message)
  }

  if (!response.body) {
    throw new Error('No response body')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let full = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const chunk = decoder.decode(value, { stream: true })
    if (!chunk) continue
    full += chunk
    onDelta?.(chunk)
  }

  const rest = decoder.decode()
  if (rest) {
    full += rest
    onDelta?.(rest)
  }

  return full
}
