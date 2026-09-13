import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire('/Users/jiangqianli/Downloads/meeting-win/frontend/package.json')
const { chromium } = require('playwright')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
await mkdir(__dirname, { recursive: true })

const BASE = 'http://127.0.0.1:9531'
const browser = await chromium.launch({ headless: true, channel: 'chrome' })
const results = []

function log(name, ok, extra = '') {
  results.push({ name, ok, extra })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`)
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.getByPlaceholder('用户名').fill('admin')
  await page.getByPlaceholder('密码').fill('admin123')
  await page.getByRole('button', { name: '登录' }).click()
  await page.waitForURL(/\/home/, { timeout: 15000 })
}

async function waitWorkbench(page) {
  await page.waitForSelector('.wb-body, .wb-forbidden-card, .wb-error-card, .wb-loading-card', { timeout: 15000 })
  await page.waitForTimeout(350)
}

async function closeOverlays(page) {
  const closeBtn = page.locator('.el-drawer:visible .el-drawer__close-btn, .el-dialog:visible .el-dialog__headerbtn')
  if (await closeBtn.count()) await closeBtn.first().click().catch(() => {})
  for (let i = 0; i < 4; i += 1) {
    if ((await page.locator('.el-overlay:visible').count()) === 0) return
    await page.keyboard.press('Escape')
    await page.waitForTimeout(150)
  }
}

async function setScene(page, label) {
  await closeOverlays(page)
  await page.locator('.wb-scene-select').click()
  await page.getByRole('option', { name: label }).click()
  await waitWorkbench(page)
}

async function readAgg(page) {
  const raw = await page.locator('#wb-agg-ids').textContent()
  return JSON.parse(raw || '{}')
}

async function collectPagedIds(page, rowSelector, attr) {
  const ids = []
  for (let guard = 0; guard < 12; guard += 1) {
    await page.waitForTimeout(280)
    const pageIds = await page.locator(rowSelector).evaluateAll((rows, key) => (
      rows.map((row) => row.getAttribute(key)).filter(Boolean)
    ), attr)
    for (const id of pageIds) {
      if (!ids.includes(id)) ids.push(id)
    }
    const next = page.locator('.hn-pg').filter({ hasText: '下一页' })
    if (!(await next.count()) || await next.isDisabled()) break
    await next.click()
  }
  return ids
}

const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await context.newPage()

try {
  console.log('=== F02 工作台验收 ===')
  await login(page)
  await waitWorkbench(page)

  const titleText = await page.locator('.wb-main-title').textContent()
  log('页面标题为工作台', titleText?.trim() === '工作台', titleText ?? '')

  const shiftText = await page.locator('.wb-duty-badges').textContent()
  log('班次与矿区显示未接入', Boolean(shiftText?.includes('未配置/未接入') && shiftText?.includes('未接入')), shiftText ?? '')

  const reexamCard = await page.locator('.wb-metric-card.is-unintegrated').textContent()
  log('待复检准入未接入且无假数字', Boolean(reexamCard?.includes('待复检准入') && reexamCard?.includes('未接入')))

  const agg = await readAgg(page)
  log('在册人数超过 50，聚合不依赖第一页', agg.rosterCount > 50, `roster=${agg.rosterCount}`)
  log('我的待办超过 50，可验证分页截断', agg.mineCount > 50 && agg.totalTodosCount === agg.mineCount, `mine=${agg.mineCount} totalTodos=${agg.totalTodosCount}`)
  log('今日高危包含已关闭样本', Array.isArray(agg.todayCriticalIds) && agg.todayCriticalIds.includes('INC-DEMO-090'), String(agg.todayCriticalIds?.length ?? 0))

  const refreshText = await page.locator('.wb-time').textContent()
  const clockNote = await page.locator('.wb-clock-note').textContent()
  const refreshHasFull = /\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(refreshText || '')
  const refreshNotSpliced = !(refreshText || '').includes('2026-09-12')
  log('页面刷新时间为完整实际时间', refreshHasFull && refreshNotSpliced, refreshText ?? '')
  log('单独标明 mock 统计测试时钟', Boolean(clockNote?.includes('2026-09-12T16:00:00+08:00') && clockNote.includes('mock')), clockNote ?? '')

  const capText = await page.locator('.wb-capabilities-section').textContent()
  const capNames = ['实时推送', '通知', '定位', '设备控制'].every((name) => capText?.includes(name))
  const noStack = !/Gateway|UWB|Zigbee/i.test(capText || '')
  log('系统状态使用能力名称且均为未接入', capNames && capText.includes('未接入'))
  log('产品页不堆放 Gateway/UWB/Zigbee 细节', noStack)

  const scopeText = await page.locator('.wb-scope-text').textContent()
  log(
    '统计口径读取同一汇总人数',
    Boolean(scopeText?.includes(`全矿在册 ${agg.rosterCount} 人`) && scopeText.includes('当前在线')),
    scopeText ?? '',
  )

  const previewIds = await page.locator('.wb-todo-row, .wb-todo-card').evaluateAll((rows) => (
    rows.map((row) => row.getAttribute('data-incident-id')).filter(Boolean)
  ))
  const previewSubset = previewIds.every((id) => agg.myTodoIds.includes(id))
  log('前 N 条是我的待办全集的前缀', previewIds.length > 0 && previewIds.length <= 5 && previewSubset && previewIds.length <= agg.totalTodosCount, `preview=${previewIds.length}`)

  const viewports = [
    [1920, 1080, 'f02-layout-1920.png'],
    [1440, 900, 'f02-layout-1440.png'],
    [1280, 800, 'f02-layout-1280.png'],
    [1024, 768, 'f02-layout-1024.png'],
    [390, 844, 'f02-layout-390.png'],
  ]

  for (const [w, h, shotName] of viewports) {
    await page.setViewportSize({ width: w, height: h })
    await page.waitForTimeout(400)
    const layout = await page.evaluate(() => {
      const pageOverflow = document.documentElement.scrollWidth > window.innerWidth + 1
      const region = document.querySelector('.wb-priority-section')
      const btn = document.querySelector('.wb-all-btn-text, .wb-all-btn')
      const btnBox = btn ? btn.getBoundingClientRect() : null
      const regionBox = region
        ? { clientWidth: region.clientWidth, scrollWidth: region.scrollWidth }
        : null
      const cards = [...document.querySelectorAll('.wb-todo-card')].map((card) => {
        const handle = card.querySelector('.wb-action-btn')
        const r = handle ? handle.getBoundingClientRect() : null
        return {
          text: card.textContent,
          handleW: r?.width ?? 0,
          handleH: r?.height ?? 0,
        }
      })
      return {
        pageOverflow,
        regionOverflow: regionBox ? regionBox.scrollWidth > regionBox.clientWidth + 2 : false,
        btnWidth: btnBox?.width ?? 0,
        btnHeight: btnBox?.height ?? 0,
        btnText: btn?.textContent?.trim() ?? '',
        cardCount: cards.length,
        cards,
      }
    })
    log(`分辨率 ${w}×${h} 页面无横向溢出`, !layout.pageOverflow)
    await page.screenshot({ path: path.join(__dirname, shotName), fullPage: true })
    if (w === 390) {
      log('390 待办区内部无横向挤出', !layout.regionOverflow, `scrollWidth vs clientWidth`)
      log(
        '390「查看全部待办」保持横排可读',
        layout.btnText.includes('查看全部待办') && layout.btnWidth >= 110 && layout.btnHeight <= 40,
        `w=${layout.btnWidth} h=${layout.btnHeight} text=${layout.btnText}`,
      )
      log('390 直接展示待办卡片', layout.cardCount > 0, `cards=${layout.cardCount}`)
      const first = layout.cards[0]
      const hasFields = Boolean(first?.text && first.text.includes('处置') && /高危|关注|普通/.test(first.text))
      log('390 卡片含人员/事件/严重度/超时与处置', hasFields && first.handleW >= 32 && first.handleH >= 22, JSON.stringify(first))
      await page.locator('.wb-todo-card .wb-action-btn').filter({ hasText: '处置' }).first().click()
      await page.waitForTimeout(500)
      const drawer = await page.locator('.hn-incident-drawer:visible, .el-drawer:visible').count()
      log('390 处置入口可点击并打开抽屉', drawer > 0)
      await closeOverlays(page)
      await page.evaluate(() => window.scrollTo(0, 520))
      await page.waitForTimeout(200)
      await page.screenshot({ path: path.join(__dirname, 'f02-layout-390-scrolled.png') })
      await page.evaluate(() => window.scrollTo(0, 0))
    }
  }

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.waitForTimeout(300)

  const firstIncident = previewIds[0]
  const firstName = await page.locator('.wb-todo-row .wb-emp-name, .wb-todo-card .wb-emp-name').first().textContent()
  await page.locator('.wb-action-btn').filter({ hasText: '处置' }).first().click()
  await page.waitForTimeout(600)
  const drawerVisible = await page.locator('.el-drawer:visible').count() > 0
  log('点击待办处置呼出 C01 抽屉', drawerVisible)
  await page.screenshot({ path: path.join(__dirname, 'f02-c01-drawer-1440.png') })

  const confirmBtn = page.locator('.el-drawer:visible button').filter({ hasText: /^确认$/ })
  const startBtn = page.locator('.el-drawer:visible button').filter({ hasText: '开始处理' })
  const completeBtn = page.locator('.el-drawer:visible button').filter({ hasText: '处理完成' })
  if (await confirmBtn.count()) {
    await confirmBtn.first().click()
    await page.waitForTimeout(700)
  } else if (await startBtn.count()) {
    await startBtn.first().click()
    await page.waitForTimeout(700)
  } else if (await completeBtn.count()) {
    await completeBtn.first().click()
    await page.waitForTimeout(300)
    await page.locator('.el-dialog:visible textarea').nth(0).fill('工作台验证：现场观察并复测')
    await page.locator('.el-dialog:visible textarea').nth(1).fill('工作台验证：措施已记录')
    await page.locator('.el-dialog:visible button').filter({ hasText: '保存' }).click()
    await page.waitForTimeout(800)
  }
  await closeOverlays(page)
  await waitWorkbench(page)
  const afterHandle = await readAgg(page)
  log('C01 处理后工作台仍有该事件身份', afterHandle.myTodoIds.includes(firstIncident) || afterHandle.todayCriticalIds.includes(firstIncident), firstIncident)

  await page.locator('.wb-todo-row .wb-emp-name, .wb-todo-card .wb-emp-name').first().click()
  await page.waitForURL(/\/health-monitor\/employee-profile/, { timeout: 8000 })
  const profileText = await page.locator('.hn-page, .f15-page, body').first().textContent()
  log('人员画像跳转保留人员身份', Boolean(firstName && profileText?.includes(firstName.trim())), firstName ?? '')
  await page.goto(`${BASE}/home`, { waitUntil: 'networkidle' })
  await waitWorkbench(page)

  await page.locator('.wb-action-btn').filter({ hasText: '详情' }).first().click()
  await page.waitForTimeout(500)
  const personDrawer = await page.locator('.el-drawer:visible').textContent()
  log('人员详情抽屉保留人员身份', Boolean(firstName && personDrawer?.includes(firstName.trim())), firstName ?? '')
  await closeOverlays(page)

  await page.goto(`${BASE}/admin/device-list`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
  const marker = 'WB-F02'
  const editedDeviceId = await page.locator('tr.hn-row[data-device-id]').first().getAttribute('data-device-id')
  await page.locator('tr.hn-row[data-device-id]').first().locator('.hn-act').filter({ hasText: '查看' }).click()
  await page.waitForTimeout(400)
  await page.locator('.el-drawer:visible button').filter({ hasText: '编辑' }).click()
  await page.getByText('编辑设备', { exact: false }).waitFor({ timeout: 5000 })
  await page.locator('.el-drawer:visible .form-grid').waitFor({ timeout: 5000 })
  const nameInput = page.locator('.el-drawer:visible .form-grid > .el-input input').nth(1)
  await nameInput.waitFor({ timeout: 5000 })
  const oldName = await nameInput.inputValue()
  const nextName = oldName.includes(marker) ? oldName : `${oldName} ${marker}`
  await nameInput.fill(nextName)
  await page.locator('.el-drawer:visible .hn-btn-query').filter({ hasText: '保存' }).click()
  await page.waitForTimeout(1000)
  await closeOverlays(page)
  const nameAfterSave = await page.locator(`tr[data-device-id="${editedDeviceId}"] .device-name`).textContent()
  log('F22 保存后列表已更新名称', Boolean(nameAfterSave?.includes(marker)), nameAfterSave ?? '')

  await page.locator('.el-menu-item').filter({ hasText: '工作台' }).click()
  await waitWorkbench(page)
  const mineAfterC01 = (await readAgg(page)).mineCount
  await setScene(page, '无待办事项')
  const emptyTitle = await page.locator('.wb-empty-title').textContent()
  log('无待办演示显示空态', Boolean(emptyTitle?.includes('当前无需要处理')), emptyTitle ?? '')
  await page.screenshot({ path: path.join(__dirname, 'f02-scene-empty-1440.png'), fullPage: true })
  await setScene(page, '健康数据为空')
  log('健康空态不要求清空共享事件', true)
  await page.screenshot({ path: path.join(__dirname, 'f02-scene-empty-health-1440.png'), fullPage: true })
  await setScene(page, '默认状态（有待办）')
  const backDefault = await readAgg(page)
  log('演示场景切换后我的待办数据仍在', backDefault.mineCount === mineAfterC01 && backDefault.mineCount > 0, `mine=${backDefault.mineCount}`)

  await page.locator('.el-menu-item').filter({ hasText: '设备管理' }).click()
  await page.waitForTimeout(500)
  const deviceNameAfter = await page.locator(`tr[data-device-id="${editedDeviceId}"] .device-name`).textContent()
  log('F22 修改在工作台场景切换后仍在', Boolean(deviceNameAfter?.includes(marker)), deviceNameAfter ?? '')

  await page.goto(`${BASE}/home`, { waitUntil: 'networkidle' })
  await waitWorkbench(page)
  await page.locator('.wb-scene-select').click()
  await page.getByRole('option', { name: '无待办事项' }).click()
  await page.locator('.wb-scene-select').click()
  await page.getByRole('option', { name: '无权限 (403)' }).click()
  await page.waitForTimeout(200)
  await page.locator('.wb-scene-select').click()
  await page.getByRole('option', { name: '默认状态（有待办）' }).click()
  await waitWorkbench(page)
  await page.waitForTimeout(900)
  const afterRace = await readAgg(page)
  const forbiddenShowing = await page.locator('.wb-forbidden-card:visible').count()
  log('快速切换场景时旧响应未覆盖新结果', afterRace.mineCount > 0 && forbiddenShowing === 0, `mine=${afterRace.mineCount}`)

  await setScene(page, '首次加载失败')
  const errorTitle = await page.locator('.wb-error-title').textContent()
  log('首次加载失败显示错误卡', Boolean(errorTitle && /超时|无法响应|失败/.test(errorTitle)), errorTitle ?? '')
  await page.screenshot({ path: path.join(__dirname, 'f02-scene-error-1440.png'), fullPage: true })

  await setScene(page, '无权限 (403)')
  const forbiddenVisible = await page.locator('.wb-forbidden-card:visible').count()
  const bodyVisible = await page.locator('.wb-body:visible').count()
  log('403 不继续展示缓存业务数据', forbiddenVisible > 0 && bodyVisible === 0)
  await page.screenshot({ path: path.join(__dirname, 'f02-scene-forbidden-1440.png'), fullPage: true })

  await setScene(page, '刷新失败保留缓存')
  await page.locator('.wb-refresh-btn').click()
  await page.waitForTimeout(700)
  const cacheBanner = await page.locator('.wb-banner-warning').textContent()
  log('刷新失败保留缓存并提示', Boolean(cacheBanner?.includes('已保留上次成功加载结果')), cacheBanner ?? '')
  await page.screenshot({ path: path.join(__dirname, 'f02-scene-cache-fail-1440.png'), fullPage: true })

  await setScene(page, '默认状态（有待办）')
  const homeAgg = await readAgg(page)

  await page.locator('[data-wb-card="mine"]').click()
  await page.waitForURL(/\/alert-management\/notifications/, { timeout: 8000 })
  await page.waitForTimeout(500)
  const mineFilterVisible = await page.getByText('当前：仅我的待办').count()
  const mineChecked = await page.locator('.el-checkbox.is-checked').filter({ hasText: '仅我的待办' }).count()
  log('F18 我的待办筛选可见', mineFilterVisible > 0 && mineChecked > 0)
  const f18MineIds = await collectPagedIds(page, 'tr.hn-row[data-incident-id]', 'data-incident-id')
  const mineSame = f18MineIds.length === homeAgg.myTodoIds.length && homeAgg.myTodoIds.every((id) => f18MineIds.includes(id))
  log('F18 下钻名单与工作台我的待办一致', mineSame, `home=${homeAgg.myTodoIds.length} f18=${f18MineIds.length}`)
  await page.screenshot({ path: path.join(__dirname, 'f02-drilldown-todos.png') })
  if (await page.locator('.hn-pg').filter({ hasText: '下一页' }).count()) {
    await page.locator('.hn-pg').filter({ hasText: '上一页' }).click().catch(() => {})
    await page.waitForTimeout(300)
    const stillMine = await page.getByText('当前：仅我的待办').count()
    log('F18 分页保持我的待办条件', stillMine > 0)
  }

  await page.goto(`${BASE}/home`, { waitUntil: 'networkidle' })
  await waitWorkbench(page)
  await page.locator('[data-wb-card="critical"]').click()
  await page.waitForURL(/\/alert-management\/notifications/, { timeout: 8000 })
  await page.waitForTimeout(500)
  const criticalHint = await page.locator('.hn-filter-count').textContent()
  log('F18 今日高危筛选可见', Boolean(criticalHint?.includes('高危') && criticalHint.includes('今天') && criticalHint.includes('全部状态')), criticalHint ?? '')
  const f18CriticalIds = await collectPagedIds(page, 'tr.hn-row[data-incident-id]', 'data-incident-id')
  const criticalSame = f18CriticalIds.length === homeAgg.todayCriticalIds.length && homeAgg.todayCriticalIds.every((id) => f18CriticalIds.includes(id))
  log('F18 今日高危名单与工作台一致且含已关闭', criticalSame && f18CriticalIds.includes('INC-DEMO-090'), `home=${homeAgg.todayCriticalIds.length} f18=${f18CriticalIds.length}`)

  await page.goto(`${BASE}/home`, { waitUntil: 'networkidle' })
  await waitWorkbench(page)
  await page.locator('[data-wb-card="offline"]').click()
  await page.waitForURL(/\/admin\/device-list/, { timeout: 8000 })
  await page.waitForTimeout(500)
  const offlineFilter = await page.locator('.hn-capsule.is-active').textContent()
  log('F22 离线筛选可见', Boolean(offlineFilter?.includes('离线')), offlineFilter ?? '')
  const f22Ids = await collectPagedIds(page, 'tr.hn-row[data-device-id]', 'data-device-id')
  const offlineSame = f22Ids.length === homeAgg.offlineDeviceIds.length && homeAgg.offlineDeviceIds.every((id) => f22Ids.includes(id))
  log('F22 离线设备名单与工作台一致', offlineSame, `home=${homeAgg.offlineDeviceIds.length} f22=${f22Ids.length}`)
  await page.screenshot({ path: path.join(__dirname, 'f02-drilldown-device-offline.png') })

  await page.goto(`${BASE}/home`, { waitUntil: 'networkidle' })
  await waitWorkbench(page)
  const hrCard = page.locator('.wb-dist-card').filter({ hasText: '心率' }).first()
  const hrWarningText = await hrCard.locator('.wb-dist-num').nth(1).textContent()
  const hrWarning = Number(hrWarningText || '0')
  await hrCard.click()
  await page.waitForURL(/\/health-monitor\/real-time/, { timeout: 8000 })
  await page.waitForTimeout(600)
  const f06Filter = await page.locator('section.hn-filter').textContent()
  log('F06 指标异常筛选可见', Boolean(f06Filter?.includes('心率') && f06Filter.includes('异常')), (f06Filter || '').replace(/\s+/g, ' ').slice(0, 120))
  const f06Ids = await collectPagedIds(page, 'tr.hn-row[data-emp]', 'data-emp')
  const expectedHr = homeAgg.warningByMetric?.heartRate ?? hrWarning
  log('F06 心率异常人数与工作台一致', f06Ids.length === expectedHr, `home=${expectedHr} f06=${f06Ids.length}`)

  const failed = results.filter((item) => !item.ok)
  console.log(`=== 完成：${results.length - failed.length}/${results.length} 通过 ===`)
  if (failed.length) {
    for (const item of failed) console.log(`  FAIL ${item.name} ${item.extra}`)
    process.exitCode = 1
  }
} catch (err) {
  console.error('验证执行异常：', err)
  process.exitCode = 1
} finally {
  await browser.close()
}
