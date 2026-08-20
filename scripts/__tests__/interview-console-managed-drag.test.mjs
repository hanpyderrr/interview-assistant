import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const paths = {
  console: 'src/interview-console/InterviewConsole.tsx',
  styles: 'src/interview-console/InterviewConsole.css',
  preload: 'electron/preload.ts',
  ipc: 'electron/ipcHandlers.ts',
  helper: 'electron/WindowHelper.ts',
  types: 'src/types/electron.d.ts',
}

test('interview drag handle sends total pointer offsets through preload', async () => {
  const [component, preload, types] = await Promise.all([
    readFile(paths.console, 'utf8'),
    readFile(paths.preload, 'utf8'),
    readFile(paths.types, 'utf8'),
  ])

  assert.match(component, /const consoleDragHandleRef = useRef<HTMLDivElement \| null>/)
  assert.match(component, /startX = event\.screenX/)
  assert.match(component, /dx: event\.screenX - startX/)
  assert.match(component, /sendLauncherWindowDrag\?\.\(\{ phase: 'start' \}\)/)
  assert.match(component, /sendLauncherWindowDrag\?\.\(\{ \.\.\.next, phase: 'move' \}\)/)
  assert.match(component, /sendLauncherWindowDrag\?\.\(\{ phase: 'end' \}\)/)
  assert.match(component, /ref=\{consoleDragHandleRef\}/)
  assert.match(preload, /sendLauncherWindowDrag:[\s\S]*ipcRenderer\.invoke\('launcher-window-drag'/)
  assert.match(types, /sendLauncherWindowDrag\?:/)
})

test('launcher drag IPC validates the sender before moving the window', async () => {
  const ipc = await readFile(paths.ipc, 'utf8')

  assert.match(ipc, /safeHandle\([\s\S]*'launcher-window-drag'/)
  assert.match(ipc, /const launcherWin = helper\.getLauncherWindow\(\)/)
  assert.match(ipc, /launcherWin\.webContents\.id === event\.sender\.id/)
  assert.match(ipc, /if \(!fromLauncher\) return/)
  assert.match(ipc, /helper\.beginLauncherWindowDrag\(\)/)
  assert.match(ipc, /helper\.moveLauncherWindowTo\(/)
  assert.match(ipc, /helper\.endLauncherWindowDrag\(\)/)
})

test('WindowHelper anchors launcher movement to the drag-start origin', async () => {
  const helper = await readFile(paths.helper, 'utf8')

  assert.match(helper, /private launcherDragOrigin:/)
  assert.match(helper, /public beginLauncherWindowDrag\(\)/)
  assert.match(helper, /this\.launcherDragOrigin = \{ x, y \}/)
  assert.match(helper, /public moveLauncherWindowTo\(offsetX: number, offsetY: number\)/)
  assert.match(helper, /win\.setPosition\(targetX, targetY\)/)
  assert.match(helper, /public endLauncherWindowDrag\(\)/)
})

test('managed launcher handle opts out of the non-working native drag region', async () => {
  const styles = await readFile(paths.styles, 'utf8')
  assert.match(styles, /\.console-drag-handle[^}]*-webkit-app-region:\s*no-drag/s)
})
