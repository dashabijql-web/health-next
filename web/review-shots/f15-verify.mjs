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

function lum(color) {
  const m = String(color || '').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  if (!m) return 0
  return (Number(m[1]) * 299 + Number(m[2]) * 587 + Number(m[3]) * 114) / 1000
}

function isLightSolid(color) {
  const m = String(color || '').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?/)
  if (!m) return false
  const a = m[4] === undefined ? 1 : Number(m[4])
  if (a < 0.4) return false
  return lum(color) > 180
}

async function shot(page, name, fullPage = true) {
  await page.screenshot({ path: path.join(__dirname, name), fullPage })
}

async function login(page) {
  await page.goto('http://127.0.0.1:9531/login', { waitUntil: 'networkidle' })
  await page.getByPlaceholder('用户名').fill('admin')
  await page.getByPlaceholder('密码').fill('admin123')
  await page.getByRole('button', { name: '登录' }).click()
  await page.waitForURL(/\/home/, { timeout: 15000 })
}

async function openProfile(page, query = '') {
  await page.goto(`http://127.0.0.1:9531/health-monitor/employee-profile${query}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
}

async function overflowInfo(page) {
  return page.evaluate(() => {
    const doc = document.documentElement
    const pageEl = document.querySelector('.employee-profile-page')
    const overflowing = []
    const rootRight = window.innerWidth
    const nodes = pageEl ? pageEl.querySelectorAll('header, .header-right, .history-query-btn, .trend-svg, .warnings-section, .actions-section, .el-button') : []
    nodes.forEach((el) => {
      const r = el.getBoundingClientRect()
      if (r.width > 1 && r.right > rootRight + 2) overflowing.push(`${el.className?.toString?.().slice(0, 40)}:${Math.round(r.right - rootRight)}`)
    })
    return {
      doc: doc.scrollWidth - doc.clientWidth,
      page: pageEl ? pageEl.scrollWidth - pageEl.clientWidth : -1,
      overflowing: overflowing.slice(0, 8),
    }
  })
}

async function historyMeta(page) {
  return page.evaluate(() => {
    const el = document.querySelector('.employee-profile-page')
    return {
      start: el?.getAttribute('data-history-start') || '',
      end: el?.getAttribute('data-history-end') || '',
      points: Number(el?.getAttribute('data-history-points') || 0),
      interval: Number(el?.getAttribute('data-history-interval') || 0),
      label: document.querySelector('.trend-meta-bar')?.textContent || '',
    }
  })
}

async function closeOverlays(page) {
  for (let i = 0; i < 6; i += 1) {
    if ((await page.locator('.el-drawer:visible, .el-picker-panel:visible, .el-popper:visible, .el-overlay:visible').count()) === 0) return
    await page.keyboard.press('Escape')
    await page.waitForTimeout(180)
  }
}

async function clickRange(page, label) {
  await page.locator('.range-radios .el-radio-button').filter({ hasText: label }).click()
}

const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await context.newPage()

try {
  await login(page)
  log('登录工作台', true)
  await openProfile(page)
  log('访问目标路由 /health-monitor/employee-profile', page.url().includes('/health-monitor/employee-profile'))

  const zhang = await page.locator('.worker-name').textContent()
  log('默认人员张伟', zhang?.includes('张伟'), `姓名: ${zhang}`)

  const meta7 = await historyMeta(page)
  log('近7天日期范围', meta7.start === '2026-09-06' && meta7.end === '2026-09-12', JSON.stringify(meta7))
  log('近7天间隔1小时', meta7.interval === 1, `interval=${meta7.interval} points=${meta7.points}`)
  log('近7天为演示合成点', meta7.label.includes('演示合成点') && !meta7.label.includes('15分钟'), meta7.label.replace(/\s+/g, ' ').slice(0, 180))

  await clickRange(page, '近14天')
  await page.waitForTimeout(400)
  const meta14 = await historyMeta(page)
  log('近14天日期范围', meta14.start === '2026-08-30' && meta14.end === '2026-09-12', JSON.stringify(meta14))
  log('近14天间隔2小时且点数不同', meta14.interval === 2 && meta14.points !== meta7.points && meta14.points > 0, JSON.stringify(meta14))

  await clickRange(page, '近30天')
  await page.waitForTimeout(400)
  const meta30 = await historyMeta(page)
  log('近30天日期范围', meta30.start === '2026-08-14' && meta30.end === '2026-09-12', JSON.stringify(meta30))
  log('近30天间隔4小时且点数不同', meta30.interval === 4 && meta30.points !== meta14.points && meta30.points !== meta7.points, JSON.stringify(meta30))

  await page.getByPlaceholder('开始日期').fill('2026-09-01')
  await page.getByPlaceholder('结束日期').fill('2026-09-03')
  await page.getByRole('button', { name: '查询' }).click()
  await page.waitForTimeout(400)
  const metaCustom = await historyMeta(page)
  log(
    '自定义日期范围生效',
    metaCustom.start === '2026-09-01' && metaCustom.end === '2026-09-03' && metaCustom.points > 0 && metaCustom.points < meta7.points,
    JSON.stringify(metaCustom),
  )

  await page.locator('.history-dates').hover()
  const closeIcon = page.locator('.history-dates .el-range__close-icon, .history-dates .el-icon')
  if (await closeIcon.count()) await closeIcon.last().click({ force: true }).catch(() => {})
  await page.waitForTimeout(200)
  await page.getByRole('button', { name: '查询' }).click()
  await page.waitForTimeout(400)
  const emptyToast = await page.locator('.el-message, .f15-message').filter({ hasText: '请选择开始日期和结束日期' }).count()
  const metaAfterEmpty = await historyMeta(page)
  log('空日期校验', emptyToast > 0 && metaAfterEmpty.start === '2026-09-01', `toast=${emptyToast} kept=${JSON.stringify(metaAfterEmpty)}`)

  await clickRange(page, '近7天')
  await page.waitForTimeout(300)
  await page.locator('.history-dates').click()
  await page.waitForTimeout(300)
  const futureCell = page.locator('.f15-date-popper td.disabled').filter({ hasText: /^20$/ })
  log('结束日期不超过测试时钟（未来日禁用）', (await futureCell.count()) > 0, `disabled20=${await futureCell.count()}`)
  await closeOverlays(page)
  await page.evaluate(() => document.querySelectorAll('.el-message').forEach((n) => n.remove()))

  await clickRange(page, '近7天')
  await page.waitForTimeout(300)

  const viewports = [
    [1920, 1080, 'f15-profile-1920.png'],
    [1440, 900, 'f15-profile-1440.png'],
    [1280, 800, 'f15-profile-1280.png'],
    [1024, 768, 'f15-profile-1024.png'],
    [390, 844, 'f15-profile-390.png'],
  ]
  for (const [w, h, name] of viewports) {
    await page.setViewportSize({ width: w, height: h })
    await page.waitForTimeout(350)
    const info = await overflowInfo(page)
    const queryBtn = page.getByRole('button', { name: '查询' })
    const queryBox = await queryBtn.boundingBox()
    const vibrate = page.getByRole('button', { name: '手环震动提醒' })
    const vibrateBox = await vibrate.boundingBox()
    const queryVisible = queryBox && queryBox.x >= 0 && queryBox.x + queryBox.width <= w + 1
    const vibrateVisible = !vibrateBox || (vibrateBox.x >= 0 && vibrateBox.x + vibrateBox.width <= w + 1)
    const pass = info.doc <= 1 && info.page <= 2 && queryVisible && vibrateVisible
    log(`分辨率 ${w}×${h} 无横向溢出且查询/设备按钮可访问`, pass, `doc=${info.doc} page=${info.page} query=${JSON.stringify(queryBox)} extra=${info.overflowing.join('|')}`)
    await shot(page, name, true)
  }

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.waitForTimeout(300)

  const searchBg = await page.locator('.search-input-wrap .el-input__wrapper').evaluate((el) => getComputedStyle(el).backgroundColor)
  const callBg = await page.getByRole('button', { name: '语音呼叫' }).evaluate((el) => getComputedStyle(el).backgroundColor)
  const queryBg = await page.getByRole('button', { name: '查询' }).evaluate((el) => getComputedStyle(el).backgroundColor)
  const chipBg = await page.locator('.status-chip').first().evaluate((el) => getComputedStyle(el).backgroundColor)
  log('搜索框非白底', !isLightSolid(searchBg), searchBg)
  log('呼叫按钮非白底', !isLightSolid(callBg), callBg)
  log('查询按钮使用青色强调且非白底', !isLightSolid(queryBg) && queryBg.includes('56, 189, 248'), queryBg)
  log('身份状态标签非白底实心', !isLightSolid(chipBg), chipBg)

  await page.locator('.search-input-wrap input').click()
  await page.locator('.search-input-wrap input').fill('张')
  await page.waitForTimeout(400)
  const suggest = page.locator('.f15-autocomplete-popper:visible, .el-autocomplete-suggestion:visible')
  log('搜索下拉展开', (await suggest.count()) > 0)
  if (await suggest.count()) {
    const suggestBg = await suggest.first().evaluate((el) => getComputedStyle(el).backgroundColor)
    const suggestColor = await suggest.first().evaluate((el) => getComputedStyle(el).color)
    log('搜索下拉深色', lum(suggestBg) < 80 && lum(suggestColor) > 140, `${suggestBg} / ${suggestColor}`)
  }
  await shot(page, 'f15-dropdown-1440.png', false)
  await closeOverlays(page)

  await page.locator('.history-dates').click()
  await page.waitForTimeout(400)
  const datePanel = page.locator('.f15-date-popper:visible, .el-date-range-picker:visible, .el-picker-panel:visible')
  log('日期面板展开', (await datePanel.count()) > 0)
  if (await datePanel.count()) {
    const inner = datePanel.locator('.el-picker-panel, .el-date-range-picker').first()
    const target = (await inner.count()) ? inner : datePanel.first()
    const bg = await target.evaluate((el) => getComputedStyle(el).backgroundColor)
    const cellBg = await datePanel.locator('.el-date-table td.available .el-date-table-cell').first().evaluate((el) => getComputedStyle(el).backgroundColor).catch(() => 'n/a')
    log('日期面板深色', !isLightSolid(bg) && !isLightSolid(cellBg), `${bg} cell=${cellBg}`)
  }
  await shot(page, 'f15-datepicker-1440.png', false)
  await closeOverlays(page)

  await page.getByRole('button', { name: '存在异常及关联事件' }).click()
  await page.waitForTimeout(500)
  const anomalyName = await page.locator('.worker-name').textContent()
  log('场景：存在异常及关联事件', anomalyName?.includes('演示职工甲'), `姓名: ${anomalyName}`)
  await shot(page, 'f15-scenario-anomaly-1440.png')

  const c01Btn = page.getByRole('button', { name: '处置工单 (C01)' }).first()
  log('C01 入口存在', (await c01Btn.count()) > 0)
  await c01Btn.click()
  await page.waitForTimeout(500)
  log('C01 抽屉打开', (await page.locator('.el-drawer:visible').count()) > 0)
  await shot(page, 'f15-c01-drawer-1440.png', false)

  await page.getByRole('button', { name: '确认' }).click()
  await page.waitForTimeout(500)
  await page.locator('.el-drawer:visible .el-drawer__close-btn').click()
  await page.waitForTimeout(400)
  const afterConfirm = await page.locator('.tl-handling-tag').first().textContent()
  log('C01 确认后画像为已确认', afterConfirm?.includes('已确认'), `state=${afterConfirm}`)

  await page.getByRole('button', { name: '处置工单 (C01)' }).first().click()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: '分派' }).click()
  await page.waitForTimeout(400)
  const assignDlg = page.locator('.hn-dialog:visible, .el-dialog:visible')
  log('分派对话框打开', (await assignDlg.count()) > 0)
  if (await assignDlg.count()) {
    const dlgBg = await assignDlg.locator('.el-dialog, .hn-dialog').first().evaluate((el) => getComputedStyle(el).backgroundColor).catch(async () => {
      return assignDlg.evaluate((el) => getComputedStyle(el).backgroundColor)
    })
    log('分派对话框深色', lum(dlgBg) < 80, dlgBg)
  }
  await shot(page, 'f15-dialog-1440.png', false)
  await page.locator('.el-dialog:visible .el-select').click()
  await page.getByRole('option', { name: '演示值班员甲' }).click()
  await page.getByRole('button', { name: '确认分派' }).click()
  await page.waitForTimeout(500)
  await page.locator('.el-drawer:visible .el-drawer__close-btn').click()
  await page.waitForTimeout(400)
  const afterAssign = await page.locator('.tl-handling-tag').first().textContent()
  log('C01 分派后画像为已分派', afterAssign?.includes('已分派'), `state=${afterAssign}`)

  await page.getByRole('button', { name: '处置工单 (C01)' }).first().click()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: '开始处理' }).click()
  await page.waitForTimeout(500)
  await page.locator('.el-drawer:visible .el-drawer__close-btn').click()
  await page.waitForTimeout(400)
  const afterStart = await page.locator('.tl-handling-tag').first().textContent()
  log('C01 开始处理后画像为处理中', afterStart?.includes('处理中'), `state=${afterStart}`)

  await page.getByRole('button', { name: '处置工单 (C01)' }).first().click()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: '处理完成' }).click()
  await page.waitForTimeout(300)
  await page.getByPlaceholder('已采取的措施').fill('现场核实并休息观察')
  await page.getByPlaceholder('处理结果').fill('心率回落，继续观察')
  await page.locator('.el-dialog:visible').getByRole('button', { name: '保存' }).click()
  await page.waitForTimeout(500)
  await page.locator('.el-drawer:visible .el-drawer__close-btn').click()
  await page.waitForTimeout(400)
  const afterComplete = await page.locator('.tl-handling-tag').first().textContent()
  log('C01 处理后画像为处理完成而非已闭环', afterComplete?.includes('处理完成') && !afterComplete?.includes('已闭环'), `state=${afterComplete}`)

  await page.getByRole('button', { name: '人员无设备' }).click()
  await page.waitForTimeout(400)
  const unboundText = await page.locator('.identity-strip').textContent()
  const vibrateDisabled = await page.getByRole('button', { name: '手环震动提醒' }).isDisabled()
  log('场景：人员无设备', vibrateDisabled && unboundText?.includes('未绑定设备'), unboundText?.replace(/\s+/g, ' ').slice(0, 160))
  await shot(page, 'f15-scenario-unbound-1440.png')

  await page.getByRole('button', { name: '体征陈旧与缺失' }).click()
  await page.waitForTimeout(400)
  const zhaoBattery = await page.locator('[data-battery]').first().getAttribute('data-battery')
  const hasMissing = await page.locator('text=[信号中断/未佩戴]').count()
  log('赵铁柱电量为未知而非 0', zhaoBattery === 'unknown', `battery=${zhaoBattery}`)
  log('赵铁柱趋势含中断', hasMissing > 0, `missing=${hasMissing}`)
  await shot(page, 'f15-scenario-stale-1440.png')

  await page.getByRole('button', { name: '时间异常' }).click()
  await page.waitForTimeout(400)
  log('场景：时间异常', (await page.locator('.worker-name').textContent())?.includes('未来时钟测试员'))
  await shot(page, 'f15-scenario-time-anomaly-1440.png')

  await page.getByRole('button', { name: '无历史数据' }).click()
  await page.waitForTimeout(400)
  log('场景：无历史空态', (await page.locator('.empty-chart-state').count()) > 0)
  await shot(page, 'f15-scenario-no-history-1440.png')

  await page.getByRole('button', { name: '人员不存在' }).click()
  await page.waitForTimeout(400)
  log('场景：人员不存在 404', (await page.locator('.not-found-card').count()) > 0)
  await shot(page, 'f15-scenario-not-found-1440.png')

  await page.getByRole('button', { name: '刷新失败但保留数据' }).click()
  await page.waitForTimeout(900)
  const failBanner = await page.locator('.error-banner').count()
  const failName = await page.locator('.worker-name').textContent()
  log('刷新失败保留张伟缓存', failBanner > 0 && failName?.includes('张伟'), `name=${failName} banner=${failBanner}`)
  await shot(page, 'f15-scenario-refresh-fail-1440.png')

  await page.getByRole('button', { name: '下一人' }).click()
  await page.waitForTimeout(600)
  const switchedName = await page.locator('.worker-name').textContent()
  const switchedBanner = await page.locator('.error-banner').count()
  const switchedCode = await page.locator('.employee-profile-page').getAttribute('data-emp-code')
  log(
    '刷新失败后切换人员不串用张伟缓存',
    Boolean(switchedName) && !switchedName.includes('张伟') && switchedCode !== '005875008',
    `name=${switchedName} code=${switchedCode} banner=${switchedBanner} url=${page.url()}`,
  )

  await page.getByRole('button', { name: '正常且有历史' }).click()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: /^血压$/ }).click()
  await page.waitForTimeout(200)
  await shot(page, 'f15-metric-bp-1440.png')
  await page.getByRole('button', { name: /^血氧$/ }).click()
  await page.waitForTimeout(200)
  await shot(page, 'f15-metric-spo2-1440.png')
  log('趋势图指标切换', true)

  await page.getByRole('button', { name: '调整上报频次' }).click()
  await page.waitForTimeout(300)
  const fakeCopy = await page.locator('.el-message').filter({ hasText: /已生成报文|已生成.*策略/ }).count()
  const notExec = await page.locator('.el-message').filter({ hasText: /未接入|未执行/ }).count()
  log('设备操作不提示已生成报文/策略', fakeCopy === 0 && notExec > 0, `fake=${fakeCopy} notExec=${notExec}`)

  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(400)
  await page.locator('.search-input-wrap input').click()
  await page.locator('.search-input-wrap input').fill('李')
  await page.waitForTimeout(400)
  await shot(page, 'f15-dropdown-390.png', true)
  await closeOverlays(page)
  await page.locator('.history-dates').click()
  await page.waitForTimeout(400)
  const date390 = page.locator('.f15-date-popper:visible, .el-date-range-picker:visible')
  if (await date390.count()) {
    const inner = date390.locator('.el-picker-panel, .el-date-range-picker').first()
    const target = (await inner.count()) ? inner : date390.first()
    const bg = await target.evaluate((el) => getComputedStyle(el).backgroundColor)
    const box = await target.boundingBox()
    log('390 日期面板深色', !isLightSolid(bg), bg)
    log('390 日期面板不超出视口', Boolean(box) && box.x >= -8 && box.x + box.width <= 390 + 8, JSON.stringify(box))
  }
  await shot(page, 'f15-datepicker-390.png', true)
  const overflow390 = await overflowInfo(page)
  log('390 展开日期后页面不横向溢出', overflow390.page <= 2, JSON.stringify(overflow390))
  await closeOverlays(page)

  await page.setViewportSize({ width: 1440, height: 900 })
  await closeOverlays(page)
  await page.locator('.el-menu-item').filter({ hasText: '人员档案' }).click()
  await page.waitForURL(/employee-archive/)
  await page.waitForTimeout(400)
  await page.getByPlaceholder('姓名 / 工号 / 手机号 / IMEI').fill('005875008')
  await page.locator('.hn-filter').getByRole('button', { name: '查询' }).click()
  await page.waitForTimeout(500)
  const personRow = page.locator('tr').filter({ hasText: '005875008' })
  await personRow.getByRole('button', { name: '编辑' }).click()
  const nameInput = page.locator('.el-drawer:visible').getByPlaceholder('姓名')
  await nameInput.waitFor({ state: 'visible', timeout: 8000 })
  await nameInput.fill('张伟改')
  await page.locator('.el-drawer:visible').getByRole('button', { name: '保存' }).click()
  await page.getByText('人员已保存').waitFor({ timeout: 8000 })
  await page.waitForTimeout(300)
  await page.locator('.el-menu-item').filter({ hasText: '职工画像' }).click()
  await page.waitForURL(/employee-profile/)
  await page.waitForTimeout(400)
  await page.locator('.search-input-wrap input').fill('005875008')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(500)
  const renamed = await page.locator('.worker-name').textContent()
  log('F14 改名后 F15 一致', renamed?.includes('张伟改'), `name=${renamed}`)

  await page.locator('.el-menu-item').filter({ hasText: '设备管理' }).click()
  await page.waitForURL(/device-list/)
  await page.waitForTimeout(400)
  await page.getByPlaceholder('IMEI / 设备编号 / 名称').fill('869234051029808')
  await page.locator('.hn-filter').getByRole('button', { name: '查询' }).click()
  await page.waitForTimeout(400)
  const deviceRow = page.locator('tr').filter({ hasText: '869234051029808' })
  const unbindBtn = deviceRow.locator('button.hn-act').filter({ hasText: /^解绑$/ })
  log('F22 找到解绑按钮', (await unbindBtn.count()) > 0)
  if (await unbindBtn.count()) {
    await unbindBtn.click()
    await page.waitForTimeout(300)
    await page.getByRole('button', { name: '确认解绑' }).click()
    await page.getByText('已解绑').waitFor({ timeout: 8000 })
    await page.waitForTimeout(300)
  }
  await page.locator('.el-menu-item').filter({ hasText: '职工画像' }).click()
  await page.waitForURL(/employee-profile/)
  await page.waitForTimeout(400)
  await page.locator('.search-input-wrap input').fill('005875008')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(500)
  const afterUnbind = await page.locator('.identity-strip').textContent()
  const vibrateAfter = await page.getByRole('button', { name: '手环震动提醒' }).isDisabled()
  log('F22 解绑后 F15 显示未绑定', Boolean(afterUnbind?.includes('未绑定设备')) && vibrateAfter, afterUnbind?.replace(/\s+/g, ' ').slice(0, 180))

  await page.getByRole('button', { name: '进入沉浸人体' }).click()
  await page.waitForURL(/\/health-monitor\/body-360-immersive/, { timeout: 8000 })
  log('沉浸人体入口跳转', page.url().includes('/health-monitor/body-360-immersive'), page.url())
  await shot(page, 'f15-navigated-immersive.png')

  console.log('\n===== 全部测试与截图完成 =====')
  const passedCount = results.filter((r) => r.ok).length
  console.log(`总计: ${results.length} 项，通过: ${passedCount} 项，失败: ${results.length - passedCount} 项`)
  const failed = results.filter((r) => !r.ok)
  if (failed.length) {
    console.log('失败项:')
    failed.forEach((item) => console.log(` - ${item.name}${item.extra ? ` — ${item.extra}` : ''}`))
  }
} catch (err) {
  console.error('测试异常中断:', err)
  results.push({ name: '脚本执行', ok: false, extra: String(err?.message || err) })
} finally {
  await browser.close()
  const failedCount = results.filter((r) => !r.ok).length
  process.exit(failedCount ? 1 : 0)
}
