import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { MarkdownBody } from '../../components/MarkdownBody'
import '../../components/markdown.css'
import { studyRepository, type ChatThread, type Settings } from '../../data/repository'
import { streamChat } from '../../llm/client'
import type { Quiz } from '../../domain'
import type { ChatMessage, LlmProvider } from '../../llm/types'
import { QuizPreview } from './QuizPreview'
import { previewFromLatestAssistant } from './parseQuizFence'
import { QUIZ_BUILDER_SYSTEM_PROMPT } from './systemPrompt'
import './chat.css'

const PROVIDER_LABELS: Record<LlmProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  xai: 'xAI',
  gemini: 'Gemini',
  custom: 'Custom',
}

function formatModelLabel(settings: Settings): string {
  const provider = PROVIDER_LABELS[settings.provider] ?? settings.provider
  const model = settings.model.trim() || 'no model set'
  return `${provider} · ${model}`
}

const REFRESH_PREVIEW_PROMPT =
  'Emit only the agreed quiz as one fenced ```quiz JSON block based on our conversation. No other commentary—just the ```quiz block.'

function createThread(): ChatThread {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    title: 'Quiz builder',
    createdAt: now,
    updatedAt: now,
    messages: [],
  }
}

function loadOrCreateThread(): ChatThread {
  const threads = studyRepository.listChatThreads()
  if (threads.length === 0) {
    const thread = createThread()
    studyRepository.saveChatThread(thread)
    return thread
  }
  return [...threads].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]!
}

function titleFromFirstUserMessage(content: string): string {
  const trimmed = content.replace(/\s+/g, ' ').trim()
  if (!trimmed) {
    return 'Quiz builder'
  }
  return trimmed.length > 48 ? `${trimmed.slice(0, 45)}…` : trimmed
}

function sortedThreads(): ChatThread[] {
  return studyRepository
    .listChatThreads()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

/**
 * Models often reuse ids like "quiz-1", which would overwrite an older quiz.
 * Reuse a saved quiz only when it is the same content; otherwise mint a new id.
 */
function saveQuizFromPreview(quiz: Quiz): Quiz {
  const items = JSON.stringify(quiz.items)
  const existing = studyRepository
    .listQuizzes()
    .find((q) => q.title === quiz.title && JSON.stringify(q.items) === items)
  if (existing) {
    return existing
  }
  const saved: Quiz = {
    ...quiz,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  }
  studyRepository.saveQuiz(saved)
  return saved
}

function persistThread(thread: ChatThread): ChatThread {
  const next: ChatThread = {
    ...thread,
    updatedAt: new Date().toISOString(),
  }
  studyRepository.saveChatThread(next)
  return next
}

export function ChatPage() {
  const navigate = useNavigate()
  const [thread, setThread] = useState<ChatThread>(() => loadOrCreateThread())
  const [threads, setThreads] = useState<ChatThread[]>(() => sortedThreads())
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [settings, setSettings] = useState<Settings>(() =>
    studyRepository.getSettings(),
  )
  const threadRef = useRef(thread)
  const abortRef = useRef<AbortController | null>(null)
  const transcriptEndRef = useRef<HTMLDivElement | null>(null)

  threadRef.current = thread

  const refreshSettings = useCallback(() => {
    setSettings(studyRepository.getSettings())
  }, [])

  const preview = previewFromLatestAssistant(thread.messages)
  const previewQuiz = preview.status === 'valid' ? preview.quiz : null
  const previewError = preview.status === 'invalid' ? preview.error : null
  const hasApiKey = settings.apiKey.trim().length > 0

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [thread.messages])

  useEffect(() => {
    refreshSettings()
    const onFocus = () => refreshSettings()
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        refreshSettings()
      }
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [refreshSettings])

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  async function runAssistantTurn(userContent: string) {
    const settings = studyRepository.getSettings()
    if (!settings.apiKey.trim()) {
      setSendError('Add an API key in Settings before chatting.')
      return
    }

    setSendError(null)
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setBusy(true)

    const prior = threadRef.current
    const userMessage: ChatMessage = { role: 'user', content: userContent }
    let working = persistThread({
      ...prior,
      messages: [...prior.messages, userMessage],
      title: prior.messages.some((m) => m.role === 'user')
        ? prior.title
        : titleFromFirstUserMessage(userContent),
    })
    threadRef.current = working
    setThread(working)

    working = persistThread({
      ...working,
      messages: [...working.messages, { role: 'assistant', content: '' }],
    })
    threadRef.current = working
    setThread(working)

    const historyForApi: ChatMessage[] = [
      { role: 'system', content: QUIZ_BUILDER_SYSTEM_PROMPT },
      ...working.messages
        .slice(0, -1)
        .filter((m) => m.role === 'user' || m.role === 'assistant'),
    ]

    try {
      const finalText = await streamChat(
        {
          provider: settings.provider,
          model: settings.model,
          baseUrl: settings.baseUrl,
          apiKey: settings.apiKey,
          messages: historyForApi,
        },
        (chunk) => {
          const current = threadRef.current
          const messages = [...current.messages]
          const last = messages[messages.length - 1]
          if (!last || last.role !== 'assistant') {
            return
          }
          messages[messages.length - 1] = {
            role: 'assistant',
            content: last.content + chunk,
          }
          // Persisted once the stream ends; writing every chunk is slow on long chats.
          const next = { ...current, messages }
          threadRef.current = next
          setThread(next)
        },
        controller.signal,
      )

      const current = threadRef.current
      const messages = [...current.messages]
      const last = messages[messages.length - 1]
      if (last?.role === 'assistant') {
        messages[messages.length - 1] = {
          role: 'assistant',
          content: finalText || last.content,
        }
      }
      const next = persistThread({ ...current, messages })
      threadRef.current = next
      setThread(next)
    } catch (err) {
      if (controller.signal.aborted) {
        persistThread(threadRef.current)
        return
      }
      const message = err instanceof Error ? err.message : 'Chat request failed'
      setSendError(message)
      const current = threadRef.current
      const messages = [...current.messages]
      const last = messages[messages.length - 1]
      if (last?.role === 'assistant' && last.content.trim() === '') {
        messages.pop()
      }
      const next = persistThread({ ...current, messages })
      threadRef.current = next
      setThread(next)
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null
      }
      setBusy(false)
      setThreads(sortedThreads())
    }
  }

  async function handleSubmit(event?: FormEvent) {
    event?.preventDefault()
    const content = draft.trim()
    if (!content || busy) {
      return
    }
    setDraft('')
    await runAssistantTurn(content)
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void handleSubmit()
    }
  }

  function handleRefreshPreview() {
    if (busy) {
      return
    }
    void runAssistantTurn(REFRESH_PREVIEW_PROMPT)
  }

  function handleStartQuiz() {
    if (!previewQuiz) {
      return
    }
    const saved = saveQuizFromPreview(previewQuiz)
    navigate(`/quiz/${saved.id}`)
  }

  function handleNewChat() {
    if (busy) {
      return
    }
    const current = threadRef.current
    // Reuse an untouched thread instead of piling up empty ones.
    const next = current.messages.length === 0 ? current : createThread()
    if (next !== current) {
      studyRepository.saveChatThread(next)
    }
    threadRef.current = next
    setThread(next)
    setThreads(sortedThreads())
    setSendError(null)
    setDraft('')
  }

  function handleSelectThread(id: string) {
    if (busy) {
      return
    }
    const found = studyRepository.getChatThread(id)
    if (!found) {
      return
    }
    threadRef.current = found
    setThread(found)
    setSendError(null)
  }

  function handleDeleteThread() {
    if (busy || !window.confirm('Delete this chat? Saved quizzes are kept.')) {
      return
    }
    studyRepository.deleteChatThread(thread.id)
    const remaining = sortedThreads()
    const next = remaining[0] ?? createThread()
    if (remaining.length === 0) {
      studyRepository.saveChatThread(next)
    }
    threadRef.current = next
    setThread(next)
    setThreads(sortedThreads())
    setSendError(null)
  }

  return (
    <div className="chat-page">
      <header className="chat-page-intro">
        <h1>Quiz builder</h1>
        <p>
          Paste questions, answers, or your notes. Review the draft, then start
          the quiz.
        </p>
        <div className="chat-threads">
          <label className="visually-hidden" htmlFor="chat-thread-select">
            Chat
          </label>
          <select
            id="chat-thread-select"
            value={thread.id}
            onChange={(event) => handleSelectThread(event.target.value)}
            disabled={busy}
          >
            {threads.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
          <button type="button" onClick={handleNewChat} disabled={busy}>
            New chat
          </button>
          <button
            type="button"
            className="chat-thread-delete"
            onClick={handleDeleteThread}
            disabled={busy}
          >
            Delete chat
          </button>
        </div>
        <p className="chat-model-banner" aria-live="polite">
          <span className="chat-model-label">Model</span>
          <span className="chat-model-value">{formatModelLabel(settings)}</span>
          {!hasApiKey ? (
            <span className="chat-model-hint">
              · Add an API key in <Link to="/settings">Settings</Link>
            </span>
          ) : null}
        </p>
      </header>

      <div className="chat-layout">
        <section className="chat-main" aria-label="Chat">
          <div className="chat-transcript" role="log" aria-live="polite">
            {thread.messages.length === 0 ? (
              <p className="chat-empty">
                Paste quiz material to begin. The assistant will ask for the quiz type
                before drafting.
              </p>
            ) : (
              thread.messages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={`chat-bubble chat-bubble-${message.role}`}
                >
                  <span className="chat-bubble-role">
                    {message.role === 'user' ? 'You' : 'Assistant'}
                  </span>
                  <div className="chat-bubble-content">
                    {message.role === 'assistant' ? (
                      message.content ? (
                        <MarkdownBody
                          content={message.content}
                          hideQuizFence
                        />
                      ) : busy && index === thread.messages.length - 1 ? (
                        '…'
                      ) : null
                    ) : (
                      message.content ||
                      (busy && index === thread.messages.length - 1 ? '…' : '')
                    )}
                  </div>
                </div>
              ))
            )}
            <div ref={transcriptEndRef} />
          </div>

          {sendError ? (
            <p className="chat-send-error" role="alert">
              {sendError}
            </p>
          ) : null}

          <form className="chat-composer" onSubmit={handleSubmit}>
            <label className="visually-hidden" htmlFor="chat-composer-input">
              Message
            </label>
            <textarea
              id="chat-composer-input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              placeholder="Paste questions, answers, or feedback…"
              rows={3}
              disabled={busy}
            />
            <button type="submit" disabled={busy || draft.trim() === ''}>
              {busy ? 'Sending…' : 'Send'}
            </button>
          </form>
        </section>

        <QuizPreview
          quiz={previewQuiz}
          error={previewError}
          canStart={preview.status === 'valid'}
          busy={busy}
          onRefresh={handleRefreshPreview}
          onStart={handleStartQuiz}
        />
      </div>
    </div>
  )
}
