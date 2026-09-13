import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire('/Users/jiangqianli/Downloads/meeting-win/frontend/package.json')
const { chromium } = require('playwright')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
await mkdir(__dirname, { recursive: true })

const browser = await chromium.launch({ headless: true, channel: 'chrome' })
const results = []
function log(name, ok, extra = '') {
  results.push({ name, ok, extra })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`)
}

async function login(page) {
  await page.goto('http://127.0.0.1:9531/login', { waitUntil: 'networkidle' })
  await page.getByPlaceholder('用户名').fill('admin')
  await page.getByPlaceholder('密码').fill('admin123')
  await page.getByRole('button', { name: '登录' }).click()
  await page.waitForURL(/\/home/, { timeout: 15000 })
}

async function closeOverlays(page) {
  const closeBtn = page.locator('.el-drawer:visible .el-drawer__close-btn')
  if (await closeBtn.count()) await closeBtn.first().click().catch(() => {})
  for (let i = 0; i < 4; i += 1) {
    if (await page.locator('.el-overlay:visible').count() === 0) return
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)
  }
}

async function searchPeople(page, keyword) {
  await closeOverlays(page)
  await page.getByPlaceholder('姓名 / 工号 / 手机号 / IMEI').fill(keyword)
  await page.locator('.hn-filter').getByRole('button', { name: '查询' }).click()
  await page.getByText('正在加载人员档案').waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(250)
}

async function searchDevices(page, keyword) {
  await closeOverlays(page)
  await page.getByPlaceholder('IMEI / 设备编号 / 名称').fill(keyword)
  await page.locator('.hn-filter').getByRole('button', { name: '查询' }).click()
  await page.getByText('正在加载设备列表').waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(250)
}

async function shot(page, name, fullPage = true) {
  await page.screenshot({ path: path.join(__dirname, name), fullPage })
}

const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await context.newPage()

try {
  await login(page)

  await page.goto('http://127.0.0.1:9531/health-monitor/employee-archive', { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)

  await searchPeople(page, '演示职工乙')
  const yiImeiBefore = await page.locator('tbody .hn-mono').filter({ hasText: '869234051029802' }).count()
  log('yi-imei-before', yiImeiBefore > 0, `count=${yiImeiBefore}`)
  await page.getByRole('button', { name: '编辑' }).first().click()
  const imeiInput = page.getByPlaceholder('占用或已停用会被拒绝')
  await imeiInput.waitFor()
  await page.waitForFunction(() => {
    const el = [...document.querySelectorAll('input')].find((item) => (item.getAttribute('placeholder') || '').includes('占用或已停用'))
    return Boolean(el && el.value.includes('869234051029802'))
  })
  await imeiInput.fill('869234051029801')
  await page.locator('.el-drawer').getByRole('button', { name: '保存' }).click()
  await page.getByText(/已绑定 IMEI/).waitFor({ timeout: 8000 })
  log('edit-occupied-imei-rejected', true)
  await closeOverlays(page)
  await searchPeople(page, '演示职工乙')
  const yiStill = await page.getByText('869234051029802').count()
  log('yi-unchanged', yiStill > 0, `count=${yiStill}`)
  await searchPeople(page, '演示职工甲')
  const jiaStill = await page.getByText('869234051029801').count()
  const jiaName = await page.getByRole('button', { name: '演示职工甲' }).count()
  log('jia-unchanged', jiaStill > 0 && jiaName > 0)

  await page.getByRole('button', { name: '新增' }).click()
  const createDrawer = page.locator('.el-drawer:visible')
  await createDrawer.getByPlaceholder('姓名', { exact: true }).fill('占用IMEI测试员')
  await createDrawer.getByPlaceholder('工号', { exact: true }).fill('OCCUPY001')
  await createDrawer.locator('.el-select').nth(0).click()
  await page.getByRole('option', { name: '采掘一队' }).click()
  await createDrawer.locator('.el-select').nth(1).click()
  await page.getByRole('option', { name: '采煤机司机' }).click()
  await createDrawer.getByPlaceholder('占用或已停用会被拒绝').fill('869234051029801')
  await createDrawer.getByRole('button', { name: '保存' }).click()
  await page.getByText(/已绑定 IMEI/).waitFor({ timeout: 8000 })
  log('create-occupied-imei-rejected', true)
  await closeOverlays(page)
  await searchPeople(page, '占用IMEI测试员')
  const created = await page.getByText('占用IMEI测试员').count()
  log('create-not-partial', created === 0, `count=${created}`)

  await searchPeople(page, '王强')
  await page.getByRole('button', { name: '编辑' }).first().click()
  await page.getByPlaceholder('占用或已停用会被拒绝').waitFor()
  await page.getByPlaceholder('占用或已停用会被拒绝').fill('869234051040004')
  await page.locator('.el-drawer').getByRole('button', { name: '保存' }).click()
  await page.getByText(/设备已停用/).waitFor({ timeout: 8000 })
  log('inactive-device-rejected', true)
  await closeOverlays(page)
  await searchPeople(page, '王强')
  const wangBound = await page.getByText('869234051040004').count()
  log('wang-still-unbound', wangBound === 0, `count=${wangBound}`)

  await page.getByRole('menuitem', { name: '设备管理' }).click()
  await page.waitForTimeout(500)
  await searchDevices(page, '演示职工乙')
  await page.getByRole('button', { name: '查看', exact: true }).first().click()
  await page.getByText('C03 设备详情').waitFor()
  await page.waitForTimeout(400)
  const drawerText = await page.locator('.el-drawer:visible').innerText()
  console.log('C03_TEXT_START\n' + drawerText + '\nC03_TEXT_END')
  await shot(page, 'f22-binding-c03-yi.png', false)
  const originalId = drawerText.includes('DEV-869234051029802')
  log('device-id-before-imei-edit', originalId, drawerText.slice(0, 200))
  await page.locator('.el-drawer').getByRole('button', { name: '编辑' }).click()
  await page.getByPlaceholder('15 位数字').waitFor()
  await page.getByPlaceholder('15 位数字').fill('869234051061111')
  await page.locator('.el-drawer').getByRole('button', { name: '保存' }).click()
  await page.getByText('设备已保存').waitFor({ timeout: 8000 })
  await closeOverlays(page)
  await searchDevices(page, '869234051061111')
  const newImeiRows = await page.locator('tbody tr').count()
  log('device-imei-changed-stable-id', newImeiRows === 1, `rows=${newImeiRows}`)
  await page.getByRole('button', { name: '查看', exact: true }).first().click()
  await page.getByText('C03 设备详情').waitFor()
  await page.waitForTimeout(300)
  const afterText = await page.locator('.el-drawer:visible').innerText()
  log('device-detail-after-imei', afterText.includes('869234051061111') && afterText.includes('DEV-869234051029802') && afterText.includes('演示职工乙'))
  await closeOverlays(page)

  await page.getByRole('menuitem', { name: '人员档案' }).click()
  await page.waitForTimeout(500)
  await searchPeople(page, '演示职工乙')
  const yiNewImei = await page.getByText('869234051061111').count()
  log('person-got-device-imei', yiNewImei > 0)
  await page.getByRole('button', { name: '编辑' }).first().click()
  await page.getByPlaceholder('姓名', { exact: true }).waitFor()
  await page.waitForFunction(() => {
    const el = document.querySelector('input[placeholder="姓名"]')
    return Boolean(el && el.value.includes('演示职工乙'))
  })
  await page.getByPlaceholder('姓名', { exact: true }).fill('演示职工乙改')
  await page.locator('.el-drawer').getByRole('button', { name: '保存' }).click()
  await page.getByText('人员已保存').waitFor({ timeout: 8000 })
  await closeOverlays(page)

  await page.getByRole('menuitem', { name: '设备管理' }).click()
  await page.waitForTimeout(500)
  await searchDevices(page, '869234051061111')
  const afterNameRows = await page.locator('tbody tr').count()
  const boundName = await page.getByRole('button', { name: '演示职工乙改' }).count()
  const dupDev = await page.getByText('DEV-869234051061111').count()
  log('ordinary-edit-no-duplicate', afterNameRows === 1 && boundName > 0 && dupDev === 0, `rows=${afterNameRows} name=${boundName} dup=${dupDev}`)
  await page.getByRole('button', { name: '查看', exact: true }).first().click()
  await page.getByText('C03 设备详情').waitFor()
  await page.waitForTimeout(300)
  const afterPersonEdit = await page.locator('.el-drawer:visible').innerText()
  log('stable-device-id-after-person-edit', afterPersonEdit.includes('DEV-869234051029802') && afterPersonEdit.includes('869234051061111') && afterPersonEdit.includes('演示职工乙改'))
  await closeOverlays(page)

  await searchDevices(page, '040001')
  await page.locator('tbody').getByRole('button', { name: '绑定', exact: true }).first().click()
  await page.getByRole('dialog', { name: '绑定人员' }).waitFor()
  await page.getByRole('dialog', { name: '绑定人员' }).locator('.el-select').click()
  await page.getByRole('option', { name: /王强/ }).click()
  await page.getByRole('button', { name: '确认绑定' }).click()
  await page.getByText('绑定已保存').waitFor({ timeout: 8000 })
  await closeOverlays(page)
  await page.getByRole('menuitem', { name: '人员档案' }).click()
  await page.waitForTimeout(500)
  await searchPeople(page, '王强')
  const wangImei = await page.getByText('869234051040001').count()
  log('bind-cross-page-person', wangImei > 0)
  await page.getByRole('menuitem', { name: '设备管理' }).click()
  await page.waitForTimeout(500)
  await searchDevices(page, '040001')
  const wangOnDevice = await page.getByRole('button', { name: '王强' }).count()
  log('bind-cross-page-device', wangOnDevice > 0)
  await page.locator('tbody').getByRole('button', { name: '解绑', exact: true }).first().click()
  await page.getByRole('button', { name: '确认解绑' }).click()
  await page.getByText('已解绑').waitFor({ timeout: 8000 })
  await closeOverlays(page)
  await page.getByRole('menuitem', { name: '人员档案' }).click()
  await page.waitForTimeout(500)
  await searchPeople(page, '王强')
  const wangAfter = await page.getByText('869234051040001').count()
  log('unbind-cross-page-person', wangAfter === 0, `count=${wangAfter}`)
  await page.getByRole('menuitem', { name: '设备管理' }).click()
  await page.waitForTimeout(500)
  await searchDevices(page, '040001')
  const unbound = await page.getByText('未绑定').count()
  log('unbind-cross-page-device', unbound > 0)

  await page.getByRole('button', { name: '重置' }).click()
  await page.waitForTimeout(400)
  await shot(page, 'f22-datetime-1440.png', false)
  const lastDataHeader = await page.getByText('最后数据').isVisible()
  const lastDataTime = await page.locator('.col-datetime .cell-sub').first().textContent()
  log('datetime-two-line-1440', lastDataHeader && Boolean(lastDataTime && lastDataTime.includes(':')), `time=${lastDataTime}`)

  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator('.hn-table-card').scrollIntoViewIfNeeded()
  await shot(page, 'f22-datetime-390.png', true)
  const view390 = await page.getByRole('button', { name: '查看', exact: true }).first().isVisible()
  log('layout-390', view390)
} catch (error) {
  console.error(error)
  await shot(page, 'f22-binding-crash.png')
  results.push({ name: 'script', ok: false, extra: String(error) })
} finally {
  const failed = results.filter((item) => !item.ok)
  console.log('---')
  console.log(`passed ${results.filter((item) => item.ok).length}/${results.length}`)
  if (failed.length) {
    for (const item of failed) console.log(` - ${item.name}: ${item.extra}`)
  }
  await browser.close()
  if (failed.length) process.exit(1)
}
