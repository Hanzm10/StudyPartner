import { useEffect, useState } from 'react'

type Theme = 'light' | 'dark'

const THEME_KEY = 'studypartner:theme'

function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

function savedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(THEME_KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

/** Light/dark switch. Follows the OS until the student picks one. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => savedTheme() ?? systemTheme())

  useEffect(() => {
    if (savedTheme()) {
      return
    }
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setTheme(systemTheme())
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    try {
      localStorage.setItem(THEME_KEY, next)
    } catch {
      // Storage blocked; the choice lasts for this page only.
    }
    setTheme(next)
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {theme === 'dark' ? '☀ Light' : '☾ Dark'}
    </button>
  )
}
