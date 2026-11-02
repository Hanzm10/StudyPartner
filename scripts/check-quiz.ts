/**
 * Validate quiz files exactly the way "Quizzes → Import quiz" does.
 * Usage: npm run check-quiz -- quizzes/week5.md [more files...]
 * Files may hold a ```quiz block, a ```json block, or bare JSON.
 */
import fs from 'node:fs'
import { parseImportedQuiz } from '../src/features/quizzes/saveQuiz.ts'

const files = process.argv.slice(2)
if (files.length === 0) {
  console.error('Usage: npm run check-quiz -- <file> [more files...]')
  process.exit(2)
}

const startedAt = Date.now()
let failed = 0

files.forEach((file, index) => {
  const done = index + 1
  const percent = Math.round((done / files.length) * 100)
  const elapsedS = (Date.now() - startedAt) / 1000
  const etaS = (elapsedS / done) * (files.length - done)
  const prefix = `[${done}/${files.length} ${percent}% · ${elapsedS.toFixed(1)}s elapsed · ETA ${etaS.toFixed(1)}s]`

  let text: string
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch (err) {
    failed += 1
    console.log(`${prefix} FAIL ${file}: ${err instanceof Error ? err.message : err}`)
    return
  }

  const result = parseImportedQuiz(text)
  if (result.status === 'valid') {
    const counts = new Map<string, number>()
    for (const item of result.quiz.items) {
      counts.set(item.type, (counts.get(item.type) ?? 0) + 1)
    }
    const breakdown = [...counts].map(([type, n]) => `${n} ${type}`).join(', ')
    const missingExplanations = result.quiz.items.filter((i) => !i.explanation).length
    console.log(
      `${prefix} OK   ${file}: "${result.quiz.title}" · ${result.quiz.items.length} items (${breakdown})` +
        (missingExplanations > 0 ? ` · ${missingExplanations} without explanation` : ''),
    )
    return
  }

  failed += 1
  const reason = result.status === 'none' ? 'no quiz found' : result.error
  console.log(`${prefix} FAIL ${file}:\n${reason.replace(/^/gm, '    ')}`)
})

console.log(`\n${files.length - failed}/${files.length} valid`)
process.exit(failed > 0 ? 1 : 0)
