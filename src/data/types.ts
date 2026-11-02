import type { Quiz } from '../domain/quiz'
import type { ChatMessage, LlmProvider } from '../llm/types'
import type { GradeResult, ItemAnswer, ItemStatus } from '../domain/grading'
import type { AttemptMetrics } from '../domain/metrics'
import type { QuizItemType } from '../domain/quiz'

export type Settings = {
  provider: LlmProvider
  apiKey: string
  model: string
  baseUrl?: string
}

/** How the student wants to take quizzes; remembered between attempts. */
export type QuizPrefs = {
  /** Show the key and explanation right after each answer. */
  practice: boolean
  shuffleItems: boolean
  shuffleChoices: boolean
}

export type AttemptOptions = QuizPrefs & {
  /** Play order as indexes into quiz.items. */
  itemOrder: number[]
}

export type AttemptItemRecord = {
  itemId: string
  type: QuizItemType
  /** Raw student answer, or null when skipped / unanswered. */
  answer: ItemAnswer | null
  studentAnswer: unknown
  key: unknown
  status: ItemStatus
  durationMs: number
  enumeration?: GradeResult['enumeration']
  /** Student marked an auto-graded miss as correct. */
  overridden?: boolean
}

export type Attempt = {
  id: string
  quizId: string
  startedAt: string
  /** Unset until the student picks options on the start screen. */
  options?: AttemptOptions
  /** Set when the attempt is finished. */
  finishedAt?: string
  /** Position in the play order of the current unlocked item while in progress. */
  currentItemIndex: number
  items: AttemptItemRecord[]
  metrics?: AttemptMetrics
  conclusion?: string
}

export type ChatThread = {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  messages: ChatMessage[]
}

/**
 * Only storage API for the app. Implementations may swap localStorage
 * for a remote account store later without changing feature code.
 */
export interface StudyRepository {
  getSettings(): Settings
  saveSettings(settings: Settings): void

  getQuizPrefs(): QuizPrefs
  saveQuizPrefs(prefs: QuizPrefs): void

  listQuizzes(): Quiz[]
  getQuiz(id: string): Quiz | null
  saveQuiz(quiz: Quiz): void
  deleteQuiz(id: string): void

  listAttempts(quizId?: string): Attempt[]
  getAttempt(id: string): Attempt | null
  saveAttempt(attempt: Attempt): void
  deleteAttempt(id: string): void

  /** Replace all quizzes and attempts in one write (backup import). */
  replaceStudyData(quizzes: Quiz[], attempts: Attempt[]): void

  listChatThreads(): ChatThread[]
  getChatThread(id: string): ChatThread | null
  saveChatThread(thread: ChatThread): void
  deleteChatThread(id: string): void
}

export const DEFAULT_SETTINGS: Settings = {
  provider: 'openai',
  apiKey: '',
  model: 'gpt-4o-mini',
}

export const DEFAULT_QUIZ_PREFS: QuizPrefs = {
  practice: true,
  shuffleItems: false,
  shuffleChoices: false,
}
