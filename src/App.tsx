import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { ThemeToggle } from './components/ThemeToggle'
import { Toaster } from './components/Toaster'
import { ChatPage } from './features/chat/ChatPage'
import { QuizLibraryPage } from './features/quizzes/QuizLibraryPage'
import { QuizPlayerPage } from './features/quiz/QuizPlayerPage'
import { ResultsPage } from './features/results/ResultsPage'
import { SettingsPage } from './features/settings/SettingsPage'
import './styles.css'

export default function App() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <NavLink to="/chat" className="brand">
          StudyPartner
        </NavLink>
        <div className="app-header-right">
          <nav className="app-nav" aria-label="Main">
            <NavLink to="/chat">Chat</NavLink>
            <NavLink to="/quizzes">Quizzes</NavLink>
            <NavLink to="/settings">Settings</NavLink>
          </nav>
          <ThemeToggle />
        </div>
      </header>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Navigate to="/chat" replace />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/quizzes" element={<QuizLibraryPage />} />
          <Route path="/quiz/:quizId" element={<QuizPlayerPage />} />
          <Route
            path="/quiz/:quizId/results/:attemptId"
            element={<ResultsPage />}
          />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
      <Toaster />
    </div>
  )
}
