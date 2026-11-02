import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { toast } from '../../components/toast'
import { buildBackup, mergeBackup, parseBackup, type MergeStats } from '../../data/backup'
import { studyRepository } from '../../data/repository'

type FlashKey = 'download' | 'copy' | 'share' | 'file' | 'paste'

const FLASH_LABELS: Record<FlashKey, string> = {
  download: '✓ Downloaded',
  copy: '✓ Copied',
  share: '✓ Shared',
  file: '✓ Imported',
  paste: '✓ Imported',
}

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
  // Which button briefly shows a ✓ label after it did its job.
  const [flashed, setFlashed] = useState<FlashKey | null>(null)
  const flashTimer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(flashTimer.current), [])

  function flash(key: FlashKey) {
    window.clearTimeout(flashTimer.current)
    setFlashed(key)
    flashTimer.current = window.setTimeout(() => setFlashed(null), 2000)
  }

  function label(key: FlashKey, normal: string): string {
    return flashed === key ? FLASH_LABELS[key] : normal
  }

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
    flash('download')
    toast(`Backup saved as ${link.download}. Check your Downloads folder.`)
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(currentBackupText())
      flash('copy')
      toast('Backup copied. Paste it into the import box on your other device.')
    } catch {
      toast('Could not copy. Use Download backup instead.', 'error')
    }
  }

  async function handleShare() {
    const file = new File([currentBackupText()], backupFileName(), {
      type: 'application/json',
    })
    try {
      await navigator.share({ files: [file], title: 'StudyPartner backup' })
      flash('share')
      toast('Backup shared.')
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return
      }
      toast('Could not share. Use Download backup instead.', 'error')
    }
  }

  function importText(text: string, source: 'file' | 'paste') {
    const parsed = parseBackup(text)
    if (parsed.status === 'invalid') {
      toast(parsed.error, 'error')
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
    flash(source)
    toast(`Imported: ${describeStats(result.stats)}.`)
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) {
      return
    }
    try {
      importText(await file.text(), 'file')
    } catch {
      toast(`Could not read ${file.name}.`, 'error')
    }
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
          <button
            type="button"
            className={flashed === 'download' ? 'is-flashed' : undefined}
            onClick={handleDownload}
          >
            {label('download', 'Download backup')}
          </button>
          <button
            type="button"
            className={flashed === 'copy' ? 'is-flashed' : undefined}
            onClick={() => void handleCopy()}
          >
            {label('copy', 'Copy to clipboard')}
          </button>
          {canShareFiles ? (
            <button
              type="button"
              className={flashed === 'share' ? 'is-flashed' : undefined}
              onClick={() => void handleShare()}
            >
              {label('share', 'Share…')}
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
          <span className={flashed === 'file' ? 'is-flashed' : undefined}>
            {label('file', 'Choose backup file…')}
          </span>
        </label>
        <textarea
          aria-label="Paste backup"
          value={pasted}
          onChange={(event) => setPasted(event.target.value)}
          rows={3}
          spellCheck={false}
          placeholder="…or paste a copied backup here"
        />
        <div className="settings-transfer-actions">
          <button
            type="button"
            className={
              flashed === 'paste'
                ? 'settings-transfer-import is-flashed'
                : 'settings-transfer-import'
            }
            disabled={pasted.trim() === ''}
            onClick={() => importText(pasted, 'paste')}
          >
            {label('paste', 'Import pasted backup')}
          </button>
        </div>
      </div>
    </section>
  )
}
