// Capture README screenshots: interview console (demo mode) + settings panel.
// Usage: node scripts/capture-screenshots.mjs
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(__dirname, '../docs/screenshots')
mkdirSync(OUT, { recursive: true })

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const BASE = 'http://localhost:5180'

const browser = await chromium.launch({ executablePath: CHROME, headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

// 1. Interview console with demo content loaded
await page.goto(`${BASE}/?interview=1`, { waitUntil: 'networkidle' })
await page.waitForSelector('text=加载演示内容', { timeout: 15000 }).catch(() => {})
// click the demo-load button if present, then wait for answer panel to render
const demoBtn = page.locator('button:has-text("加载演示内容")').first()
if (await demoBtn.isVisible().catch(() => false)) {
  await demoBtn.click()
  await page.waitForTimeout(600)
}
await page.waitForTimeout(500)
await page.screenshot({ path: `${OUT}/interview-console.png`, fullPage: false })
console.log('saved interview-console.png')

// 2. Settings panel (open via the console top-bar settings icon button)
const settingsBtn = page.locator('button[aria-label="打开设置"]').first()
if (await settingsBtn.isVisible().catch(() => false)) {
  await settingsBtn.click()
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${OUT}/settings.png` })
  console.log('saved settings.png')
} else {
  console.log('settings button not found')
}

await browser.close()
console.log('done:', OUT)
