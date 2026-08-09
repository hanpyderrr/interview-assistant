import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const componentPath = path.join(repoRoot, 'src/interview-console/InterviewConsole.tsx')
const stylesPath = path.join(repoRoot, 'src/interview-console/InterviewConsole.css')

test('right answer panel prioritizes the spoken answer and uses readable type', async () => {
  const [component, styles] = await Promise.all([
    readFile(componentPath, 'utf8'),
    readFile(stylesPath, 'utf8'),
  ])

  const spokenAnswerIndex = component.indexOf('<div className="spoken-answer">')
  const hitSectionIndex = component.indexOf('<div className="hit-section">')
  assert.notEqual(spokenAnswerIndex, -1, 'spoken answer block should exist')
  assert.notEqual(hitSectionIndex, -1, 'supporting hit block should exist')
  assert.ok(spokenAnswerIndex < hitSectionIndex, 'spoken answer should render before supporting hits')

  const primaryAnswerRules = [...styles.matchAll(/\.spoken-answer p\{font-size:(\d+)px/g)]
  const primaryAnswerFont = Number(primaryAnswerRules.at(-1)?.[1])
  const supportingFont = Number(styles.match(/\.hit-main strong\{font-size:(\d+)px/)?.[1])
  assert.ok(primaryAnswerFont >= 18, 'primary answer should be at least 18px')
  assert.ok(primaryAnswerFont > supportingFont, 'primary answer should be larger than supporting text')
})

test('answer panel labels provider-failure drafts as local fallback instead of streamed output', async () => {
  const component = await readFile(componentPath, 'utf8')

  assert.match(component, /answerStatus/);
  assert.match(component, /answerStatus === 'error' \? '本地兜底稿' : '流式输出'/);
  assert.match(component, /answerStatus=\{selectedAnswer\?\.status \|\| null\}/);
})
