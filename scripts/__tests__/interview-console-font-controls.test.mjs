import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const componentPath = 'src/interview-console/InterviewConsole.tsx'
const stylesPath = 'src/interview-console/InterviewConsole.css'

test('interview console exposes independent persistent question and answer controls', async () => {
  const component = await readFile(componentPath, 'utf8')

  assert.match(component, /loadInterviewFontSizes/)
  assert.match(component, /saveInterviewFontSizes/)
  assert.match(component, /--interview-question-font-size/)
  assert.match(component, /--interview-answer-font-size/)
  assert.match(component, /aria-label="缩小问题字体"/)
  assert.match(component, /aria-label="放大问题字体"/)
  assert.match(component, /aria-label="缩小答案字体"/)
  assert.match(component, /aria-label="放大答案字体"/)
  assert.match(component, /onDoubleClick=.*resetInterviewFontSize\('question'\)/)
  assert.match(component, /onDoubleClick=.*resetInterviewFontSize\('answer'\)/)
})

test('top bar reserves a managed drag handle while font controls remain clickable', async () => {
  const [component, styles] = await Promise.all([
    readFile(componentPath, 'utf8'),
    readFile(stylesPath, 'utf8'),
  ])

  assert.match(component, /className="console-drag-handle" aria-hidden="true"/)
  assert.match(component, /className="font-size-controls no-drag"/)
  assert.match(styles, /\.console-topbar[^}]*-webkit-app-region:\s*drag/s)
  assert.match(styles, /\.console-drag-handle[^}]*-webkit-app-region:\s*no-drag/s)
  assert.match(styles, /\.font-size-controls[^}]*-webkit-app-region:\s*no-drag/s)
})

test('question and primary answer text consume their own CSS variables', async () => {
  const styles = await readFile(stylesPath, 'utf8')

  assert.match(styles, /\.live-caption[^}]*font-size:\s*var\(--interview-question-font-size\)/s)
  assert.match(styles, /\.confirmed-question p[^}]*font:[^;}]*var\(--interview-question-font-size\)/s)
  assert.match(styles, /\.spoken-answer p[^}]*font-size:\s*var\(--interview-answer-font-size\)/s)
  assert.match(styles, /\.candidate-transcript p[^}]*font-size:\s*var\(--interview-answer-font-size\)/s)
})

test('long transcripts use a bounded display window without truncating context refs', async () => {
  const component = await readFile(componentPath, 'utf8')

  assert.match(
    component,
    /buildTranscriptDisplayWindow\(\s*interviewerDisplayCorrectionRef\.current\?\.apply\(committedInterviewerRef\.current\)\s*\?\?\s*committedInterviewerRef\.current,?\s*\)/,
  )
  assert.match(
    component,
    /onDisplayChanged:\s*\(\) => \{[\s\S]{0,300}buildTranscriptDisplayWindow\(\s*coordinator\.apply\(committedInterviewerRef\.current\),?\s*\)/,
  )
  assert.match(component, /buildTranscriptDisplayWindow\(committedCandidateRef\.current/)
  assert.match(
    component,
    /buildRecentInterviewContext\(\s*conversationTurnsRef\.current,\s*\{\s*includeCandidateSpeech:\s*candidateContextEnabledRef\.current,?\s*\}\s*\)/,
  )
  assert.doesNotMatch(component, /conversationTurnsRef\.current\s*=\s*buildTranscriptDisplayWindow/)
  assert.match(component, /interviewerTranscriptWindow\.folded[\s\S]*candidateTranscriptWindow\.folded[\s\S]*已折叠更早转写/)
  assert.match(component, /aria-label="回到最新转写"/)
})

test('transcript pane stays within the window and scrolls independently', async () => {
  const styles = await readFile(stylesPath, 'utf8')

  assert.match(styles, /\.interview-console[^}]*height:\s*100vh[^}]*overflow:\s*hidden/s)
  assert.match(styles, /\.console-grid[^}]*min-height:\s*0/s)
  assert.match(styles, /\.transcript-panel[^}]*overflow:\s*hidden/s)
  assert.match(styles, /\.transcript-scroll-region[^}]*overflow-y:\s*auto/s)
  assert.match(styles, /\.confirmed-question[^}]*max-height:/s)
})

test('font persistence runs outside React state updater and reset is keyboard accessible', async () => {
  const component = await readFile(componentPath, 'utf8')

  assert.match(component, /useEffect\(\(\) => \{ saveInterviewFontSizes\(fontSizes\) \}, \[fontSizes\]\)/)
  assert.doesNotMatch(component, /setFontSizes\(\(current\) => \{[\s\S]{0,300}saveInterviewFontSizes/)
  assert.match(component, /onKeyDown=\{\(event\) => handleFontResetKeyDown\(event, 'question'\)\}/)
  assert.match(component, /onKeyDown=\{\(event\) => handleFontResetKeyDown\(event, 'answer'\)\}/)
})
