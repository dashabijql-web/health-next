import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
const require = createRequire('/Users/jiangqianli/Downloads/meeting-win/frontend/package.json')
const { chromium } = require('playwright')
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = __dirname
await mkdir(OUT, { recursive: true })

const browser = await chromium.launch({ headless: true, channel: 'chrome' })
const results = []

function log(name, ok, extra = '') {
  const line = `${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`
  results.push({ name, ok, extra })
  console.log(line)
}

async function login(page) {
  await page.goto('http://127.0.0.1:9531/login', { waitUntil: 'networkidle' })
  await page.getByPlaceholder('用户名').fill('admin')
  await page.getByPlaceholder('密码').fill('admin123')
  await page.getByRole('button', { name: '登录' }).click()
  await page.waitForURL(/\/home/, { timeout: 15000 })
}

async function openDevices(page, query = '') {
  await page.goto(`http://127.0.0.1:9531/admin/device-list${query}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
}

async function shot(page, name, fullPage = true) {
  const file = path.join(OUT, name)
  await page.screenshot({ path: file, fullPage })
  return file
}

async function waitGone(page, text) {
  await page.getByText(text).waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {})
}

async function closeOverlays(page) {
  const closeBtn = page.locator('.el-drawer:visible .el-drawer__close-btn')
  if (await closeBtn.count()) await closeBtn.first().click().catch(() => {})
  for (let i = 0; i < 4; i += 1) {
    if (await page.locator('.el-overlay:visible').count() === 0) return
    await page.keyboard.press('Escape')
    await page.waitForTimeout(250)
  }
  await page.locator('.el-overlay:visible').waitFor({ state: 'hidden', timeout: 4000 }).catch(() => {})
}

async function queryImei(page, value) {
  await closeOverlays(page)
  const input = page.getByPlaceholder('IMEI / 设备编号 / 名称')
  await input.fill(value)
  await page.locator('.hn-filter').getByRole('button', { name: '查询' }).click()
  await waitGone(page, '正在加载设备列表')
  await page.waitForTimeout(250)
}

const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await context.newPage()

try {
  await login(page)
  await openDevices(page)
  await waitGone(page, '正在加载设备列表')
  const title = await page.locator('h1.hn-title').textContent()
  log('open-list', title?.includes('设备管理'), title || '')
  await shot(page, 'f22-after-1440.png')

  const totalText = await page.locator('.hn-capsule-number').first().textContent()
  log('summary-total', Number(totalText) > 20, `total=${totalText}`)

  const unknown = await page.getByText('未知', { exact: true }).count()
  log('battery-unknown-visible', unknown > 0, `count=${unknown}`)

  await queryImei(page, '040007')
  const zero = await page.getByText('0%', { exact: true }).count()
  log('battery-zero-distinct', zero > 0, `count=${zero}`)
  await page.locator('.hn-filter').getByRole('button', { name: '重置' }).click()
  await waitGone(page, '正在加载设备列表')

  // pagination
  const pageInfo = await page.locator('.hn-pager-info').textContent()
  log('pagination-p1', /第\s*1\s*\/\s*2/.test(pageInfo || ''), pageInfo || '')
  await page.getByRole('button', { name: '下一页' }).click()
  await waitGone(page, '正在加载设备列表')
  await shot(page, 'f22-pagination-p2-1440.png')
  const page2 = await page.locator('.hn-pager-info').textContent()
  log('pagination-p2', /第\s*2\s*\//.test(page2 || ''), page2 || '')
  await page.getByRole('button', { name: '上一页' }).click()
  await waitGone(page, '正在加载设备列表')

  await page.locator('.el-select').filter({ hasText: '20 条/页' }).click()
  await page.getByRole('option', { name: '50 条/页' }).click()
  await waitGone(page, '正在加载设备列表')
  const page50 = await page.locator('.hn-pager-info').textContent()
  log('page-size-50', /共\s*\d+\s*条/.test(page50 || '') && !/第\s*2\s*\//.test(page50 || ''), page50 || '')
  await page.locator('.el-select').filter({ hasText: '50 条/页' }).click()
  await page.getByRole('option', { name: '20 条/页' }).click()
  await waitGone(page, '正在加载设备列表')

  // filter empty
  await queryImei(page, 'NO-SUCH-IMEI-999')
  const filtered = await page.getByText('无符合条件的设备').isVisible()
  log('filter-empty', filtered)
  await shot(page, 'f22-filter-empty-1440.png')
  await page.getByRole('button', { name: '重置筛选条件' }).click()
  await waitGone(page, '正在加载设备列表')

  // long name
  await queryImei(page, '040006')
  const longName = await page.getByText('超长设备名称').first().isVisible()
  log('long-text', longName)
  await shot(page, 'f22-long-name-1440.png')
  await page.locator('.hn-filter').getByRole('button', { name: '重置' }).click()
  await waitGone(page, '正在加载设备列表')

  // missing fields
  await queryImei(page, '040005')
  const missing = await page.getByText(/缺失：/).first().isVisible()
  log('missing-fields', missing)
  await page.locator('.hn-filter').getByRole('button', { name: '重置' }).click()
  await waitGone(page, '正在加载设备列表')

  // create
  await page.getByRole('button', { name: '新增' }).click()
  await page.getByPlaceholder('15 位数字').fill('869234051060001')
  await page.getByPlaceholder('设备名称').fill('实测新增表')
  await page.locator('.el-drawer').locator('.el-select').filter({ hasText: '选择型号' }).click()
  await page.getByRole('option', { name: 'HW-T10' }).click()
  await page.locator('.el-drawer').getByRole('button', { name: '保存' }).click()
  await page.getByText('设备已登记').waitFor({ timeout: 8000 })
  await closeOverlays(page)
  const created = await page.getByText('实测新增表').first().isVisible()
  log('create-device', created)
  await shot(page, 'f22-create-1440.png')

  // edit
  await queryImei(page, '869234051060001')
  await page.getByRole('button', { name: '查看', exact: true }).first().click()
  await page.getByText('C03 设备详情').waitFor()
  await page.locator('.el-drawer').getByRole('button', { name: '编辑' }).click()
  await page.getByPlaceholder('15 位数字').waitFor({ state: 'visible' })
  await page.waitForFunction(() => {
    const el = document.querySelector('input[placeholder="设备名称"]')
    return Boolean(el && 'value' in el && String(el.value).includes('实测新增'))
  })
  await page.getByPlaceholder('设备名称').fill('实测编辑表')
  await page.locator('.el-drawer').getByRole('button', { name: '保存' }).click()
  await page.getByText('设备已保存').waitFor({ timeout: 8000 })
  await closeOverlays(page)
  await queryImei(page, '869234051060001')
  await shot(page, 'f22-edit-1440.png')
  const edited = await page.getByText('实测编辑表').first().isVisible()
  log('edit-device', edited)
  await page.locator('.hn-filter').getByRole('button', { name: '重置' }).click()
  await waitGone(page, '正在加载设备列表')

  // bind 王强 to unbound online
  await queryImei(page, '040001')
  await closeOverlays(page)
  await page.locator('tbody').getByRole('button', { name: '绑定', exact: true }).first().click()
  await page.getByRole('dialog', { name: '绑定人员' }).waitFor({ timeout: 8000 })
  await page.getByRole('dialog', { name: '绑定人员' }).locator('.el-select').click()
  await page.getByRole('option', { name: /王强/ }).click()
  await page.getByRole('button', { name: '确认绑定' }).click()
  await page.getByText('绑定已保存').waitFor({ timeout: 8000 })
  await closeOverlays(page)
  const bound = await page.getByRole('button', { name: '王强' }).first().isVisible()
  log('bind-wangqiang', bound)
  await shot(page, 'f22-bind-1440.png')

  // conflict: bind another unbound device to 王强
  await page.locator('.hn-filter').getByRole('button', { name: '重置' }).click()
  await waitGone(page, '正在加载设备列表')
  await queryImei(page, '040003')
  await closeOverlays(page)
  await page.locator('tbody').getByRole('button', { name: '绑定', exact: true }).first().click()
  await page.getByRole('dialog', { name: '绑定人员' }).waitFor({ timeout: 8000 })
  await page.getByRole('dialog', { name: '绑定人员' }).locator('.el-select').click()
  await page.getByRole('option', { name: /王强/ }).click()
  await page.getByRole('button', { name: '确认绑定' }).click()
  await page.waitForTimeout(700)
  const conflict = await page.getByText(/已绑定设备/).isVisible()
  log('bind-conflict', conflict)
  await closeOverlays(page)

  // unbind 王强
  await page.locator('.hn-filter').getByRole('button', { name: '重置' }).click()
  await waitGone(page, '正在加载设备列表')
  await queryImei(page, '040001')
  await page.getByRole('button', { name: '解绑', exact: true }).first().click()
  await page.getByRole('button', { name: '确认解绑' }).click()
  await page.getByText('已解绑').waitFor({ timeout: 8000 })
  await closeOverlays(page)
  const unbound = await page.getByText('未绑定').first().isVisible()
  log('unbind', unbound)
  await shot(page, 'f22-unbind-1440.png')

  // deactivate
  await page.getByRole('button', { name: '停用', exact: true }).first().click()
  await page.getByRole('button', { name: '确认停用' }).click()
  await page.getByText('设备已停用').waitFor({ timeout: 8000 })
  await closeOverlays(page)
  const inactive = await page.getByText('已停用').first().isVisible()
  log('deactivate', inactive)
  await shot(page, 'f22-deactivate-1440.png')

  // import mixed
  await page.locator('.hn-filter').getByRole('button', { name: '重置' }).click()
  await waitGone(page, '正在加载设备列表')
  await page.getByRole('button', { name: '批量导入' }).click()
  await page.getByRole('button', { name: '校验并导入' }).click()
  await page.getByRole('dialog', { name: '逐项结果' }).waitFor({ timeout: 8000 })
  await page.waitForTimeout(400)
  const importOk = await page.getByText(/成功 2/).isVisible()
  const importFail = await page.getByText(/失败 4/).isVisible()
  log('import-mixed', importOk && importFail, `ok=${importOk} fail=${importFail}`)
  await shot(page, 'f22-import-1440.png', false)
  await page.getByRole('button', { name: '关闭' }).click()
  await closeOverlays(page)

  // batch mixed: select unbound low + already inactive
  await queryImei(page, '04000')
  const checks = page.locator('tbody input[type="checkbox"]')
  const checkCount = await checks.count()
  for (let i = 0; i < Math.min(checkCount, 4); i += 1) await checks.nth(i).check()
  await page.getByRole('button', { name: '批量停用' }).click()
  await page.getByRole('button', { name: '确认停用' }).click()
  await page.getByRole('dialog', { name: '逐项结果' }).waitFor({ timeout: 8000 })
  await page.waitForTimeout(400)
  const batchFail = await page.getByText('失败').first().isVisible()
  log('batch-deactivate-results', batchFail)
  await shot(page, 'f22-batch-1440.png', false)
  await page.getByRole('button', { name: '关闭' }).click()
  await closeOverlays(page)
  await page.locator('.hn-filter').getByRole('button', { name: '重置' }).click()
  await waitGone(page, '正在加载设备列表')

  // C03 detail
  await queryImei(page, '869234051029808')
  await page.getByRole('button', { name: '查看', exact: true }).first().click()
  await page.waitForTimeout(500)
  const c03 = await page.getByText('C03 设备详情').isVisible()
  const firmware = await page.getByText('固件 / 网络').isVisible()
  const history = await page.getByText('绑定历史').isVisible()
  const errors = await page.getByText('近期错误').isVisible()
  log('c03-sections', c03 && firmware && history && errors)
  await shot(page, 'c03-detail-1440.png')

  await page.getByRole('button', { name: '手表控制' }).click()
  await page.waitForTimeout(400)
  const controlMsg = await page.getByText(/手表控制尚未接入/).isVisible()
  log('control-not-connected', controlMsg)
  await shot(page, 'c03-control-1440.png')
  await page.getByRole('button', { name: '原始报文' }).click()
  await page.waitForTimeout(400)
  const rawMsg = await page.getByText(/原始报文尚未接入/).isVisible()
  log('raw-not-connected', rawMsg)

  const personLink = page.locator('.hn-incident-drawer .hn-link').first()
  if (await personLink.count()) {
    await personLink.click()
    await page.waitForTimeout(500)
    const personDetail = await page.getByText('人员详情').isVisible()
    log('open-person', personDetail)
    await shot(page, 'c03-person-1440.png')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  } else {
    log('open-person', false, 'no person link')
  }
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)

  // scenes
  async function pickScene(label) {
    await page.locator('.hn-scene-select').click()
    await page.getByRole('option', { name: label }).click()
    await waitGone(page, '正在加载设备列表')
    await page.waitForTimeout(400)
  }

  await pickScene('空设备')
  await page.getByText('当前没有设备').waitFor({ timeout: 8000 })
  const empty = await page.getByText('当前没有设备').isVisible()
  log('scene-empty', empty)
  await shot(page, 'f22-empty-1440.png')

  await pickScene('加载失败')
  const error = await page.getByText('设备列表加载失败').isVisible()
  log('scene-error', error)
  await shot(page, 'f22-error-1440.png')

  await pickScene('无权限')
  const forbidden = await page.getByText('无权限查看设备管理').isVisible()
  log('scene-forbidden', forbidden)
  await shot(page, 'f22-forbidden-1440.png')

  await pickScene('只读账号')
  const readonlyNoAdd = await page.getByRole('button', { name: '新增' }).count() === 0
  const readonlyView = await page.getByRole('button', { name: '查看', exact: true }).first().isVisible()
  log('scene-readonly', readonlyNoAdd && readonlyView, `noAdd=${readonlyNoAdd} view=${readonlyView}`)
  await shot(page, 'f22-readonly-1440.png')
  await page.getByRole('button', { name: '查看', exact: true }).first().click()
  await page.waitForTimeout(500)
  const readonlyNoBind = await page.getByRole('button', { name: '绑定', exact: true }).count() === 0
  log('readonly-detail', readonlyNoBind)
  await shot(page, 'c03-readonly-1440.png')
  await page.keyboard.press('Escape')

  await pickScene('默认设备')
  await waitGone(page, '正在加载设备列表')

  // viewports
  const viewports = [
    [1920, 1080, 'f22-layout-1920.png'],
    [1440, 900, 'f22-layout-1440.png'],
    [1280, 800, 'f22-layout-1280.png'],
    [1024, 768, 'f22-layout-1024.png'],
    [390, 844, 'f22-layout-390.png'],
  ]
  for (const [w, h, name] of viewports) {
    await page.setViewportSize({ width: w, height: h })
    await page.waitForTimeout(300)
    if (w <= 400) {
      const table = page.locator('.hn-table-card')
      if (await table.count()) await table.scrollIntoViewIfNeeded()
    }
    await shot(page, name, w <= 400)
    const deviceVisible = await page.locator('h1.hn-title').isVisible()
    const viewBtn = await page.getByRole('button', { name: '查看', exact: true }).first().isVisible()
    log(`layout-${w}x${h}`, deviceVisible && viewBtn, `view=${viewBtn}`)
  }

  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator('.hn-table-card').scrollIntoViewIfNeeded()
  await page.getByRole('button', { name: '查看', exact: true }).first().click()
  await page.waitForTimeout(500)
  const mobileDrawer = await page.getByText('C03 设备详情').isVisible()
  const footerBtn = await page.getByRole('button', { name: '手表控制' }).isVisible()
  log('c03-mobile-fullscreen', mobileDrawer && footerBtn)
  await shot(page, 'c03-detail-390.png', false)
  await page.evaluate(() => {
    const scroll = document.querySelector('.drawer-scroll')
    if (scroll) scroll.scrollTop = scroll.scrollHeight
  })
  await page.waitForTimeout(200)
  await shot(page, 'c03-detail-390-scrolled.png')
  const footerStill = await page.getByRole('button', { name: '手表控制' }).isVisible()
  log('c03-mobile-footer-reachable', footerStill)
} catch (error) {
  console.error(error)
  await shot(page, 'f22-verify-crash.png')
  results.push({ name: 'script', ok: false, extra: String(error) })
} finally {
  const failed = results.filter((item) => !item.ok)
  console.log('---')
  console.log(`passed ${results.filter((item) => item.ok).length}/${results.length}`)
  if (failed.length) {
    console.log('failed:')
    for (const item of failed) console.log(` - ${item.name}: ${item.extra}`)
  }
  await browser.close()
  if (failed.length) process.exit(1)
}
