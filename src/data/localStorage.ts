import type { Quiz } from '../domain/quiz'
import {
  DEFAULT_QUIZ_PREFS,
  DEFAULT_SETTINGS,
  type Attempt,
  type QuizPrefs,
  type ChatThread,
  type Settings,
  type StudyRepository,
} from './types'

const STORAGE_KEY = 'studypartner:v1'

type StoreShape = {
  settings: Settings
  quizzes: Quiz[]
  attempts: Attempt[]
  chatThreads: ChatThread[]
  quizPrefs: QuizPrefs
}

function emptyStore(): StoreShape {
  return {
    settings: { ...DEFAULT_SETTINGS },
    quizzes: [],
    attempts: [],
    chatThreads: [],
    quizPrefs: { ...DEFAULT_QUIZ_PREFS },
  }
}

function readStore(): StoreShape {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return emptyStore()
    }
    const parsed = JSON.parse(raw) as Partial<StoreShape>
    return {
      settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
      quizzes: Array.isArray(parsed.quizzes) ? parsed.quizzes : [],
      attempts: Array.isArray(parsed.attempts) ? parsed.attempts : [],
      chatThreads: Array.isArray(parsed.chatThreads) ? parsed.chatThreads : [],
      quizPrefs: { ...DEFAULT_QUIZ_PREFS, ...parsed.quizPrefs },
    }
  } catch {
    return emptyStore()
  }
}

function writeStore(store: StoreShape): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch (err) {
    // Quota exceeded or storage blocked; keep the app running in memory.
    console.error('Failed to save StudyPartner data:', err)
  }
}

/**
 * Browser-only StudyRepository. One localStorage key namespace; no network.
 */
export class LocalStorageStudyRepository implements StudyRepository {
  getSettings(): Settings {
    return { ...readStore().settings }
  }

  saveSettings(settings: Settings): void {
    const store = readStore()
    store.settings = { ...settings }
    writeStore(store)
  }

  getQuizPrefs(): QuizPrefs {
    return { ...readStore().quizPrefs }
  }

  saveQuizPrefs(prefs: QuizPrefs): void {
    const store = readStore()
    store.quizPrefs = { ...prefs }
    writeStore(store)
  }

  listQuizzes(): Quiz[] {
    return [...readStore().quizzes]
  }

  getQuiz(id: string): Quiz | null {
    return readStore().quizzes.find((quiz) => quiz.id === id) ?? null
  }

  saveQuiz(quiz: Quiz): void {
    const store = readStore()
    const index = store.quizzes.findIndex((q) => q.id === quiz.id)
    if (index >= 0) {
      store.quizzes[index] = quiz
    } else {
      store.quizzes.push(quiz)
    }
    writeStore(store)
  }

  deleteQuiz(id: string): void {
    const store = readStore()
    store.quizzes = store.quizzes.filter((quiz) => quiz.id !== id)
    store.attempts = store.attempts.filter((attempt) => attempt.quizId !== id)
    writeStore(store)
  }

  listAttempts(quizId?: string): Attempt[] {
    const attempts = readStore().attempts
    if (quizId == null) {
      return [...attempts]
    }
    return attempts.filter((attempt) => attempt.quizId === quizId)
  }

  getAttempt(id: string): Attempt | null {
    return readStore().attempts.find((attempt) => attempt.id === id) ?? null
  }

  saveAttempt(attempt: Attempt): void {
    const store = readStore()
    const index = store.attempts.findIndex((a) => a.id === attempt.id)
    if (index >= 0) {
      store.attempts[index] = attempt
    } else {
      store.attempts.push(attempt)
    }
    writeStore(store)
  }

  deleteAttempt(id: string): void {
    const store = readStore()
    store.attempts = store.attempts.filter((attempt) => attempt.id !== id)
    writeStore(store)
  }

  replaceStudyData(quizzes: Quiz[], attempts: Attempt[]): void {
    const store = readStore()
    store.quizzes = [...quizzes]
    store.attempts = [...attempts]
    writeStore(store)
  }

  listChatThreads(): ChatThread[] {
    return [...readStore().chatThreads]
  }

  getChatThread(id: string): ChatThread | null {
    return readStore().chatThreads.find((thread) => thread.id === id) ?? null
  }

  saveChatThread(thread: ChatThread): void {
    const store = readStore()
    const index = store.chatThreads.findIndex((t) => t.id === thread.id)
    if (index >= 0) {
      store.chatThreads[index] = thread
    } else {
      store.chatThreads.push(thread)
    }
    writeStore(store)
  }

  deleteChatThread(id: string): void {
    const store = readStore()
    store.chatThreads = store.chatThreads.filter((thread) => thread.id !== id)
    writeStore(store)
  }
}

/** Shared singleton for the app shell. Feature UIs will import this later. */
export const studyRepository = new LocalStorageStudyRepository()
