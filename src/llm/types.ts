export type ChatRole = 'system' | 'user' | 'assistant'

export type ChatMessage = {
  role: ChatRole
  content: string
}

export type LlmProvider =
  | 'openai'
  | 'anthropic'
  | 'xai'
  | 'gemini'
  | 'custom'

/** Browser → same-origin forwarder contract. No HTTP client here. */
export type ChatRequest = {
  provider: LlmProvider
  model: string
  baseUrl?: string
  apiKey: string
  messages: ChatMessage[]
}
