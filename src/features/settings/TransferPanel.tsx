import { useState, type ChangeEvent } from 'react'
import { buildBackup, mergeBackup, parseBackup, type MergeStats } from '../../data/backup'
import { studyRepository } from '../../data/repository'

function backupFileName(): string {
  return `studypartner-backup-${new Date().toISOString().slice(0, 10)}.json`
}

function currentBackupText(): string {
  return JSON.stringify(
    buildBackup(
      studyRepository.listQuizzes(),
      studyRepository.listAttempts(),
      studyRepository.getQuizPrefs(),
    ),
  )
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

function describeStats(stats: MergeStats): string {
  const parts = [
    `${plural(stats.quizzesAdded, 'quiz', 'quizzes')} added`,
    `${stats.quizzesUpdated} updated`,
    `${plural(stats.attemptsAdded, 'attempt')} added`,
  ]
  if (stats.attemptsUpdated > 0) {
    parts.push(`${stats.attemptsUpdated} attempts updated`)
  }
  if (stats.skipped > 0) {
    parts.push(`${stats.skipped} skipped`)
  }
  return parts.join(' · ')
}

/** Move quizzes and results between devices with a file or copy/paste. */
export function TransferPanel() {
  const [counts, setCounts] = useState(() => ({
    quizzes: studyRepository.listQuizzes().length,
    attempts: studyRepository.listAttempts().filter((a) => a.finishedAt).length,
  }))
  const [pasted, setPasted] = useState('')
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const canShareFiles =
    typeof navigator !== 'undefined' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({
      files: [new File(['{}'], 'test.json', { type: 'application/json' })],
    })

  function refreshCounts() {
    setCounts({
      quizzes: studyRepository.listQuizzes().length,
      attempts: studyRepository.listAttempts().filter((a) => a.finishedAt).length,
    })
  }

  function handleDownload() {
    const blob = new Blob([currentBackupText()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = backupFileName()
    link.click()
    URL.revokeObjectURL(url)
    setStatus({ kind: 'ok', text: 'Backup downloaded.' })
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(currentBackupText())
      setStatus({ kind: 'ok', text: 'Copied. Paste it into the import box on your other device.' })
    } catch {
      setStatus({ kind: 'error', text: 'Could not copy. Use Download backup instead.' })
    }
  }

  async function handleShare() {
    const file = new File([currentBackupText()], backupFileName(), {
      type: 'application/json',
    })
    try {
      await navigator.share({ files: [file], title: 'StudyPartner backup' })
    } catch {
      // Share sheet dismissed.
    }
  }

  function importText(text: string) {
    const parsed = parseBackup(text)
    if (parsed.status === 'invalid') {
      setStatus({ kind: 'error', text: parsed.error })
      return
    }
    const result = mergeBackup(
      { quizzes: studyRepository.listQuizzes(), attempts: studyRepository.listAttempts() },
      parsed.backup,
    )
    studyRepository.replaceStudyData(result.quizzes, result.attempts)
    if (result.quizPrefs) {
      studyRepository.saveQuizPrefs(result.quizPrefs)
    }
    setPasted('')
    refreshCounts()
    setStatus({ kind: 'ok', text: `Imported: ${describeStats(result.stats)}.` })
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) {
      return
    }
    importText(await file.text())
  }

  return (
    <section className="settings-transfer" aria-labelledby="transfer-title">
      <h2 id="transfer-title">Move to another device</h2>
      <p className="settings-privacy">
        This device has {plural(counts.quizzes, 'quiz', 'quizzes')} and{' '}
        {plural(counts.attempts, 'finished attempt')}. Your API key is never included.
      </p>

      <div className="settings-transfer-group">
        <span className="settings-label">Export</span>
        <div className="settings-transfer-actions">
          <button type="button" onClick={handleDownload}>
            Download backup
          </button>
          <button type="button" onClick={() => void handleCopy()}>
            Copy to clipboard
          </button>
          {canShareFiles ? (
            <button type="button" onClick={() => void handleShare()}>
              Share…
            </button>
          ) : null}
        </div>
      </div>

      <div className="settings-transfer-group">
        <span className="settings-label">Import</span>
        <p className="settings-transfer-help">
          Adds to what's on this device. Quizzes and attempts that are already here get
          replaced by the backup's copy, and nothing else is deleted.
        </p>
        <label className="settings-transfer-file">
          <input
            type="file"
            accept=".json,application/json,text/plain"
            onChange={(event) => void handleFile(event)}
          />
          <span>Choose backup file…</span>
        </label>
        <textarea
          aria-label="Paste backup"
          value={pasted}
          onChange={(event) => {
            setPasted(event.target.value)
            setStatus(null)
          }}
          rows={3}
          spellCheck={false}
          placeholder="…or paste a copied backup here"
        />
        <div className="settings-transfer-actions">
          <button
            type="button"
            className="settings-transfer-import"
            disabled={pasted.trim() === ''}
            onClick={() => importText(pasted)}
          >
            Import pasted backup
          </button>
        </div>
      </div>

      {status ? (
        <p
          className={status.kind === 'ok' ? 'settings-saved' : 'settings-error'}
          role={status.kind === 'ok' ? 'status' : 'alert'}
        >
          {status.text}
        </p>
      ) : null}
    </section>
  )
}
