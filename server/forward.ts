import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ChatRequest, LlmProvider } from '../src/llm/types.ts'

const ANTHROPIC_VERSION = '2023-06-01'
// Large quizzes are emitted as one JSON block; a low cap truncates it into invalid JSON.
const ANTHROPIC_MAX_TOKENS = 32000

function redactSecrets(text: string, apiKey: string): string {
  let out = text
  if (apiKey) {
    out = out.split(apiKey).join('[REDACTED]')
  }
  out = out.replace(/(Bearer\s+)\S+/gi, '$1[REDACTED]')
  out = out.replace(/(x-api-key["']?\s*[:=]\s*["']?)[^"',\s}]+/gi, '$1[REDACTED]')
  out = out.replace(/(x-goog-api-key["']?\s*[:=]\s*["']?)[^"',\s}]+/gi, '$1[REDACTED]')
  out = out.replace(/([?&]key=)[^&\s]+/gi, '$1[REDACTED]')
  return out
}

function jsonError(res: ServerResponse, status: number, error: string): void {
  if (res.headersSent) {
    res.end()
    return
  }
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error }))
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function isChatRequest(value: unknown): value is ChatRequest {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  const providers: LlmProvider[] = [
    'openai',
    'anthropic',
    'xai',
    'gemini',
    'custom',
  ]
  return (
    typeof v.provider === 'string' &&
    providers.includes(v.provider as LlmProvider) &&
    typeof v.model === 'string' &&
    typeof v.apiKey === 'string' &&
    Array.isArray(v.messages) &&
    (v.baseUrl === undefined || typeof v.baseUrl === 'string')
  )
}

function normalizeOpenAiCompatibleBase(baseUrl: string): string {
  let base = baseUrl.trim().replace(/\/+$/, '')
  if (!base.endsWith('/v1')) {
    base = `${base}/v1`
  }
  return base
}

async function readUpstreamError(
  response: Response,
  apiKey: string,
): Promise<string> {
  const raw = await response.text()
  const safe = redactSecrets(raw, apiKey)
  try {
    const parsed = JSON.parse(safe) as {
      error?: { message?: string } | string
      message?: string
    }
    if (typeof parsed.error === 'string') return parsed.error
    if (parsed.error && typeof parsed.error.message === 'string') {
      return parsed.error.message
    }
    if (typeof parsed.message === 'string') return parsed.message
  } catch {
    // not JSON
  }
  return safe || `Upstream request failed with status ${response.status}`
}

type DeltaExtractor = (data: string) => string | undefined

async function streamSseToResponse(
  upstream: Response,
  res: ServerResponse,
  apiKey: string,
  extractDelta: DeltaExtractor,
): Promise<void> {
  if (!upstream.ok) {
    const error = await readUpstreamError(upstream, apiKey)
    jsonError(res, 502, error)
    return
  }
  if (!upstream.body) {
    jsonError(res, 502, 'Upstream returned no body')
    return
  }

  res.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })

  const reader = upstream.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trimStart()
        if (!data || data === '[DONE]') continue
        try {
          const delta = extractDelta(data)
          if (delta) res.write(delta)
        } catch {
          // skip malformed SSE payloads
        }
      }
    }

    if (buffer.startsWith('data:')) {
      const data = buffer.slice(5).trimStart()
      if (data && data !== '[DONE]') {
        try {
          const delta = extractDelta(data)
          if (delta) res.write(delta)
        } catch {
          // skip
        }
      }
    }
  } catch (err) {
    const message = redactSecrets(
      err instanceof Error ? err.message : 'Upstream stream failed',
      apiKey,
    )
    if (!res.writableEnded) {
      // Headers already sent; end the stream without leaking secrets.
      console.error('Chat upstream stream error:', message)
    }
  } finally {
    res.end()
  }
}

function openAiDelta(data: string): string | undefined {
  const parsed = JSON.parse(data) as {
    choices?: Array<{ delta?: { content?: string } }>
  }
  const content = parsed.choices?.[0]?.delta?.content
  return typeof content === 'string' && content.length > 0
    ? content
    : undefined
}

function anthropicDelta(data: string): string | undefined {
  const parsed = JSON.parse(data) as {
    type?: string
    delta?: { type?: string; text?: string }
  }
  if (parsed.type !== 'content_block_delta') return undefined
  if (parsed.delta?.type !== 'text_delta') return undefined
  const text = parsed.delta.text
  return typeof text === 'string' && text.length > 0 ? text : undefined
}

function geminiDelta(data: string): string | undefined {
  const parsed = JSON.parse(data) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> }
    }>
  }
  const parts = parsed.candidates?.[0]?.content?.parts
  if (!parts?.length) return undefined
  const text = parts
    .map((p) => (typeof p.text === 'string' ? p.text : ''))
    .join('')
  return text.length > 0 ? text : undefined
}

async function forwardOpenAiCompatible(
  request: ChatRequest,
  res: ServerResponse,
  chatCompletionsUrl: string,
): Promise<void> {
  const upstream = await fetch(chatCompletionsUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${request.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: request.model,
      messages: request.messages,
      stream: true,
    }),
  })
  await streamSseToResponse(upstream, res, request.apiKey, openAiDelta)
}

async function forwardAnthropic(
  request: ChatRequest,
  res: ServerResponse,
): Promise<void> {
  const systemParts: string[] = []
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = []

  for (const message of request.messages) {
    if (message.role === 'system') {
      systemParts.push(message.content)
      continue
    }
    messages.push({
      role: message.role,
      content: message.content,
    })
  }

  const body: Record<string, unknown> = {
    model: request.model,
    max_tokens: ANTHROPIC_MAX_TOKENS,
    messages,
    stream: true,
  }
  if (systemParts.length > 0) {
    body.system = systemParts.join('\n\n')
  }

  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': request.apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  await streamSseToResponse(upstream, res, request.apiKey, anthropicDelta)
}

async function forwardGemini(
  request: ChatRequest,
  res: ServerResponse,
): Promise<void> {
  const systemParts: string[] = []
  const contents: Array<{
    role: 'user' | 'model'
    parts: Array<{ text: string }>
  }> = []

  for (const message of request.messages) {
    if (message.role === 'system') {
      systemParts.push(message.content)
      continue
    }
    contents.push({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }],
    })
  }

  const body: Record<string, unknown> = { contents }
  if (systemParts.length > 0) {
    body.systemInstruction = {
      parts: [{ text: systemParts.join('\n\n') }],
    }
  }

  const modelPath = encodeURIComponent(request.model)
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelPath}:streamGenerateContent?alt=sse`

  const upstream = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': request.apiKey,
    },
    body: JSON.stringify(body),
  })
  await streamSseToResponse(upstream, res, request.apiKey, geminiDelta)
}

async function forwardProvider(
  request: ChatRequest,
  res: ServerResponse,
): Promise<void> {
  switch (request.provider) {
    case 'openai':
      await forwardOpenAiCompatible(
        request,
        res,
        'https://api.openai.com/v1/chat/completions',
      )
      return
    case 'xai':
      await forwardOpenAiCompatible(
        request,
        res,
        'https://api.x.ai/v1/chat/completions',
      )
      return
    case 'custom': {
      if (!request.baseUrl?.trim()) {
        jsonError(res, 400, 'baseUrl is required for custom provider')
        return
      }
      const base = normalizeOpenAiCompatibleBase(request.baseUrl)
      await forwardOpenAiCompatible(
        request,
        res,
        `${base}/chat/completions`,
      )
      return
    }
    case 'anthropic':
      await forwardAnthropic(request, res)
      return
    case 'gemini':
      await forwardGemini(request, res)
      return
    default:
      jsonError(res, 400, `Unsupported provider: ${String(request.provider)}`)
  }
}

/** Handle POST /api/chat: parse ChatRequest, stream plain-text assistant tokens. */
export async function handleApiChat(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  let raw: string
  try {
    raw = await readBody(req)
  } catch {
    jsonError(res, 400, 'Failed to read request body')
    return
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch {
    jsonError(res, 400, 'Invalid JSON body')
    return
  }

  if (!isChatRequest(parsed)) {
    jsonError(res, 400, 'Invalid ChatRequest')
    return
  }

  const apiKey = parsed.apiKey
  try {
    await forwardProvider(parsed, res)
  } catch (err) {
    const message = redactSecrets(
      err instanceof Error ? err.message : 'Upstream request failed',
      apiKey,
    )
    console.error('Chat forwarder error:', message)
    jsonError(res, 502, message)
  }
}
