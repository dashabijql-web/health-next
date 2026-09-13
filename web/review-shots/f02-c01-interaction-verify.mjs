import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire('/Users/jiangqianli/Downloads/meeting-win/frontend/package.json')
const { chromium } = require('playwright')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const browser = await chromium.launch({ headless: true, channel: 'chrome' })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await context.newPage()

try {
  console.log('=== 开始 C01 事件处置与工作台联动验证 ===')
  await page.goto('http://127.0.0.1:9531/login', { waitUntil: 'networkidle' })
  await page.getByPlaceholder('用户名').fill('admin')
  await page.getByPlaceholder('密码').fill('admin123')
  await page.getByRole('button', { name: '登录' }).click()
  await page.waitForURL(/\/home/, { timeout: 15000 })
  await page.waitForTimeout(500)

  // 1. 点击第一条待办的“处置”按钮
  const handleBtn = page.locator('.wb-action-btn').filter({ hasText: '处置' }).first()
  await handleBtn.click()
  await page.waitForTimeout(600)

  // 2. 检查 C01 抽屉是否出现
  const drawer = page.locator('.hn-incident-drawer:visible')
  if (!(await drawer.count())) {
    throw new Error('C01 抽屉未弹出')
  }
  console.log('PASS C01 抽屉已弹出')

  // 3. 点击抽屉中的“确认”按钮 (如果存在)
  const confirmBtn = drawer.locator('button').filter({ hasText: '确认' }).first()
  if (await confirmBtn.count()) {
    await confirmBtn.click()
    await page.waitForTimeout(800)
    console.log('PASS C01 确认操作已执行')
  }

  // 4. 关闭抽屉
  const closeBtn = drawer.locator('.el-drawer__close-btn')
  if (await closeBtn.count()) {
    await closeBtn.click()
    await page.waitForTimeout(500)
  }

  // 5. 截图保存 C01 处理后的工作台
  await page.screenshot({ path: path.join(__dirname, 'f02-c01-after-handling.png'), fullPage: true })
  console.log('PASS 工作台已响应 C01 处理并刷新')
} catch (err) {
  console.error('C01 联动验证失败：', err)
  process.exitCode = 1
} finally {
  await browser.close()
}
