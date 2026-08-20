import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const ipc = fs.readFileSync(path.join(root, 'electron', 'ipcHandlers.ts'), 'utf8')
const preload = fs.readFileSync(path.join(root, 'electron', 'preload.ts'), 'utf8')
const types = fs.readFileSync(path.join(root, 'src', 'types', 'electron.d.ts'), 'utf8')

test('transcript correction uses dedicated invoke and cancel channels', () => {
  assert.match(ipc, /interview:transcript-text-correction/)
  assert.match(ipc, /interview:transcript-text-correction-cancel/)
  assert.match(preload, /correctTranscriptText[\s\S]*ipcRenderer\.invoke\('interview:transcript-text-correction'/)
  assert.match(preload, /cancelTranscriptTextCorrection[\s\S]*ipcRenderer\.send\('interview:transcript-text-correction-cancel'/)
  assert.match(types, /correctTranscriptText:\s*\(text: string\)/)
  assert.match(types, /cancelTranscriptTextCorrection:\s*\(\)\s*=>\s*void/)
})

test('correction stream is isolated, bounded, and launcher-authorized', () => {
  assert.match(ipc, /transcriptTextCorrectionBySender/)
  const handler = ipc.match(/interview:transcript-text-correction'[\s\S]*?interview:transcript-text-correction-cancel'/)?.[0] || ''
  assert.match(handler, /getLauncherWindow\(\)[\s\S]{0,500}event\.sender\.id/)
  assert.match(handler, /setTimeout\(\(\) => controller\.abort\(\), 8_000\)/)
  assert.match(handler, /validateTranscriptTextCorrection/)
  assert.match(handler, /llmHelper\.streamChat\([\s\S]{0,600}true,[\s\S]{0,120}true/)
  assert.doesNotMatch(handler, /candidateSpeechCleanupBySender/)
  assert.doesNotMatch(handler, /gemini-stream-(?:token|done|error)/)
})
