import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const ipc = fs.readFileSync(path.join(root, 'electron', 'ipcHandlers.ts'), 'utf8')
const preload = fs.readFileSync(path.join(root, 'electron', 'preload.ts'), 'utf8')
const types = fs.readFileSync(path.join(root, 'src', 'types', 'electron.d.ts'), 'utf8')

test('cleanup uses dedicated invoke and cancel channels', () => {
  assert.match(ipc, /interview:candidate-speech-cleanup/)
  assert.match(ipc, /interview:candidate-speech-cleanup-cancel/)
  assert.match(preload, /cleanupCandidateSpeech[\s\S]*ipcRenderer\.invoke\('interview:candidate-speech-cleanup'/)
  assert.match(preload, /cancelCandidateSpeechCleanup[\s\S]*ipcRenderer\.send\('interview:candidate-speech-cleanup-cancel'/)
  assert.match(types, /cleanupCandidateSpeech:\s*\(text: string\)/)
  assert.match(types, /cancelCandidateSpeechCleanup:\s*\(\)\s*=>\s*void/)
})

test('cleanup stream is private, isolated, and launcher-authorized', () => {
  assert.match(ipc, /candidateSpeechCleanupBySender/)
  assert.match(ipc, /getLauncherWindow\(\)[\s\S]{0,500}event\.sender\.id/)
  assert.match(ipc, /llmHelper\.streamChat\([\s\S]{0,600}true,[\s\S]{0,120}true/)
  const handler = ipc.match(/interview:candidate-speech-cleanup'[\s\S]*?interview:candidate-speech-cleanup-cancel'/)?.[0] || ''
  assert.doesNotMatch(handler, /gemini-stream-(?:token|done|error)/)
})
