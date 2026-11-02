import { useMemo, useState, type FormEvent } from 'react'
import { studyRepository, type Settings } from '../../data/repository'
import type { LlmProvider } from '../../llm/types'
import { TransferPanel } from './TransferPanel'
import './settings.css'

const PROVIDERS: { value: LlmProvider; label: string }[] = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'xai', label: 'xAI' },
  { value: 'gemini', label: 'Gemini' },
  { value: 'custom', label: 'Custom (OpenAI-compatible)' },
]

const MODEL_PRESETS: Record<Exclude<LlmProvider, 'custom'>, string[]> = {
  openai: ['gpt-4o-mini', 'gpt-4o'],
  anthropic: ['claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-opus-5-5'],
  xai: ['grok-3'],
  gemini: ['gemini-2.5-flash'],
}

export function SettingsPage() {
  const initial = studyRepository.getSettings()
  const [provider, setProvider] = useState<LlmProvider>(initial.provider)
  const [apiKey, setApiKey] = useState(initial.apiKey)
  const [model, setModel] = useState(initial.model)
  const [baseUrl, setBaseUrl] = useState(initial.baseUrl ?? '')
  const [showKey, setShowKey] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const presets = useMemo(
    () => (provider === 'custom' ? [] : MODEL_PRESETS[provider]),
    [provider],
  )

  function handleProviderChange(next: LlmProvider) {
    setProvider(next)
    setSaved(false)
    setError(null)
    if (next !== 'custom') {
      const list = MODEL_PRESETS[next]
      if (list.length > 0 && !list.includes(model)) {
        setModel(list[0])
      }
    }
  }

  function handleSave(event: FormEvent) {
    event.preventDefault()
    setError(null)

    const trimmedBase = baseUrl.trim()
    if (provider === 'custom' && !trimmedBase) {
      setError('Base URL is required for a custom provider.')
      setSaved(false)
      return
    }

    const settings: Settings = {
      provider,
      apiKey: apiKey.trim(),
      model: model.trim(),
      ...(trimmedBase ? { baseUrl: trimmedBase } : {}),
    }

    studyRepository.saveSettings(settings)
    setSaved(true)
  }

  return (
    <section className="settings-page">
      <header className="settings-header">
        <h1>Settings</h1>
        <p className="settings-privacy">
          Your API key stays in this browser and is sent only to the same-origin
          model forwarder.
        </p>
      </header>

      <form className="settings-form" onSubmit={handleSave}>
        <label className="settings-field">
          <span className="settings-label">Provider</span>
          <select
            value={provider}
            onChange={(e) => handleProviderChange(e.target.value as LlmProvider)}
          >
            {PROVIDERS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>

        <label className="settings-field">
          <span className="settings-label">API key</span>
          <div className="settings-key-row">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value)
                setSaved(false)
              }}
              autoComplete="off"
              spellCheck={false}
              placeholder="sk-…"
            />
            <button
              type="button"
              className="settings-toggle"
              onClick={() => setShowKey((v) => !v)}
              aria-pressed={showKey}
            >
              {showKey ? 'Hide' : 'Show'}
            </button>
          </div>
        </label>

        <div className="settings-field">
          <span className="settings-label">Model</span>
          {presets.length > 0 && (
            <div className="settings-presets" role="group" aria-label="Model presets">
              {presets.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={
                    model === preset
                      ? 'settings-preset is-active'
                      : 'settings-preset'
                  }
                  onClick={() => {
                    setModel(preset)
                    setSaved(false)
                  }}
                >
                  {preset}
                </button>
              ))}
            </div>
          )}
          <input
            type="text"
            value={model}
            onChange={(e) => {
              setModel(e.target.value)
              setSaved(false)
            }}
            placeholder={
              provider === 'custom'
                ? 'Model id'
                : 'Choose a preset or type a model id'
            }
            spellCheck={false}
            required
          />
        </div>

        {provider === 'custom' ? (
          <label className="settings-field">
            <span className="settings-label">Base URL</span>
            <input
              type="url"
              value={baseUrl}
              onChange={(e) => {
                setBaseUrl(e.target.value)
                setSaved(false)
              }}
              placeholder="https://api.example.com/v1"
              required
            />
          </label>
        ) : (
          <details className="settings-advanced">
            <summary>Advanced (optional base URL)</summary>
            <label className="settings-field">
              <span className="settings-label">Base URL</span>
              <input
                type="url"
                value={baseUrl}
                onChange={(e) => {
                  setBaseUrl(e.target.value)
                  setSaved(false)
                }}
                placeholder="Leave blank for the provider default"
              />
            </label>
          </details>
        )}

        <div className="settings-actions">
          <button type="submit" className="settings-save">
            Save
          </button>
          {saved && !error && (
            <span className="settings-saved" role="status">
              Saved
            </span>
          )}
          {error && (
            <span className="settings-error" role="alert">
              {error}
            </span>
          )}
        </div>
      </form>

      <TransferPanel />
    </section>
  )
}
