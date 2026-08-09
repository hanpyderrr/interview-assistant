import { chromium } from 'playwright';
import path from 'node:path';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://localhost:5180/?interview=1&demo=1');
await page.waitForLoadState('networkidle');
await page.getByRole('button', { name: '加载演示问题' }).click();
await page.waitForTimeout(900);
if (!await page.getByText('已确认问题').isVisible()) throw new Error('confirmed question is not visible');
if (!await page.locator('.hit-section .section-label').isVisible()) throw new Error('knowledge hits are not visible');
if (!await page.locator('.spoken-answer .section-label').isVisible()) throw new Error('answer card is not visible');
await page.screenshot({ path: path.resolve('ui-smoke.png'), fullPage: true });
console.log('UI smoke passed:', await page.locator('.console-grid').count());
await browser.close();
