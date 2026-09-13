import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire('/Users/jiangqianli/Downloads/meeting-win/frontend/package.json')
const { chromium } = require('playwright')
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const browser = await chromium.launch({ headless: true, channel: 'chrome' })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await context.newPage()
await page.goto('http://127.0.0.1:9531/login', { waitUntil: 'networkidle' })
await page.getByPlaceholder('用户名').fill('admin')
await page.getByPlaceholder('密码').fill('admin123')
await page.getByRole('button', { name: '登录' }).click()
await page.waitForURL(/\/home/, { timeout: 15000 })
await page.goto('http://127.0.0.1:9531/health-monitor/real-time', { waitUntil: 'networkidle' })
await page.getByText('正在加载实时监控').waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {})
await page.waitForTimeout(400)
const viewports = [
  [1920, 1080, 'f06-layout-1920.png'],
  [1440, 900, 'f06-layout-1440.png'],
  [1280, 800, 'f06-layout-1280.png'],
  [1024, 768, 'f06-layout-1024.png'],
  [390, 844, 'f06-layout-390.png'],
]
for (const [w, h, name] of viewports) {
  await page.setViewportSize({ width: w, height: h })
  await page.waitForTimeout(350)
  await page.screenshot({ path: path.join(__dirname, name), fullPage: true })
}
await Promise.race([browser.close(), new Promise((resolve) => setTimeout(resolve, 3000))])
process.exit(0)
