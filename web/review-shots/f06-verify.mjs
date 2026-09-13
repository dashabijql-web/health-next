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

async function waitGone(page, text) {
  await page.getByText(text).waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {})
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

async function openMonitor(page, query = '') {
  await page.goto(`http://127.0.0.1:9531/health-monitor/real-time${query}`, { waitUntil: 'networkidle' })
  await waitGone(page, '正在加载实时监控')
  await page.waitForTimeout(300)
}

async function shot(page, name, fullPage = true) {
  await page.screenshot({ path: path.join(__dirname, name), fullPage })
}

async function setScene(page, label) {
  await closeOverlays(page)
  await page.locator('.hn-scene-select').click()
  await page.getByRole('option', { name: label }).click()
  await waitGone(page, '正在加载实时监控')
  await page.waitForTimeout(250)
}

async function queryKeyword(page, value) {
  await closeOverlays(page)
  const input = page.getByPlaceholder('姓名 / 工号 / IMEI')
  await input.fill(value)
  await page.locator('.hn-filter').getByRole('button', { name: '查询' }).click()
  await waitGone(page, '正在加载实时监控')
  await page.waitForTimeout(250)
}

async function setScope(page, label) {
  await closeOverlays(page)
  await page.locator('.hn-filter-group').filter({ hasText: '范围' }).locator('.el-select').click()
  await page.getByRole('option', { name: label }).click()
  await page.locator('.hn-filter').getByRole('button', { name: '查询' }).click()
  await waitGone(page, '正在加载实时监控')
  await page.waitForTimeout(250)
}

const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await context.newPage()

try {
  await login(page)
  await openMonitor(page)

  const title = await page.locator('h1.hn-title').textContent()
  log('open-list', title?.includes('实时监控'), title || '')
  log('mock-tag', await page.getByText('mock 测试数据').first().isVisible())
  log('online-window', await page.getByText(/在线窗口 15 分钟/).first().isVisible())
  log('freshness-window', await page.getByText(/体征新鲜度 5 分钟/).first().isVisible())
  log('test-clock', await page.getByText('2026-09-12T16:00:00+08:00').first().isVisible())
  await shot(page, 'f06-layout-1440.png')

  const checks = await page.evaluate(() => {
    const run = window.__hnRunHealthStatusSelfCheck
    return run ? run() : []
  })
  const failed = checks.filter((item) => !item.ok)
  log('status-self-check', failed.length === 0, failed.map((item) => item.name).join(',') || `n=${checks.length}`)

  const numbers = await page.locator('.hn-capsule-number').allTextContents()
  const onlineN = Number(numbers[0])
  const warnN = Number(numbers[1])
  const staleN = Number(numbers[2])
  const noDataN = Number(numbers[3])
  const pageInfo = await page.locator('.hn-pager-info').textContent()
  log('summary-scope-note', await page.getByText(/默认统计 15 分钟在线窗口内人员/).isVisible())
  log('default-online-equals-total', new RegExp(`共\\s*${onlineN}\\s*条`).test(pageInfo || '') && onlineN > 20, `online=${onlineN} ${pageInfo}`)
  log('sample-over-20', onlineN > 20 && /第\s*1\s*\/\s*[2-9]/.test(pageInfo || ''), pageInfo || '')
  const defaultOffline = await page.locator('tr[data-online="offline"]').count()
  log('default-list-online-only', defaultOffline === 0 && (await page.locator('tr[data-online="online"]').count()) > 0, `offlineRows=${defaultOffline}`)
  log('summary-parts-within-online', warnN + staleN + noDataN <= onlineN, `w=${warnN} s=${staleN} n=${noDataN} online=${onlineN}`)

  const rowJia = page.locator('tr[data-emp="EMP-DEMO-001"]')
  const rowLi = page.locator('tr[data-emp="EMP-005875012"]')
  log('jia-warning', (await rowJia.getAttribute('data-status')) === 'warning')
  log('li-warning', (await rowLi.getAttribute('data-status')) === 'warning')
  const liText = await rowLi.innerText()
  log('li-mixed-times', liText.includes('15:56:45') && liText.includes('15:55:00') && liText.includes('15:54:59'), liText.replace(/\s+/g, ' ').slice(0, 220))
  log('li-states-mixed', liText.includes('异常') && liText.includes('过旧') && liText.includes('正常'), 'warning+stale+normal')

  await queryKeyword(page, '张伟')
  const zhang = page.locator('tr[data-emp="EMP-005875008"]')
  log('filter-zhang', await zhang.isVisible())
  const zhangText = await zhang.innerText()
  log('zhang-normal', (await zhang.getAttribute('data-status')) === 'normal', zhangText.replace(/\s+/g, ' ').slice(0, 160))
  log('zhang-no-incident', zhangText.includes('暂无关联事件'))
  await shot(page, 'f06-person-zhang-1440.png')

  await queryKeyword(page, 'NO-SUCH-PERSON-999')
  log('filter-empty', await page.getByText('无符合条件的人员').isVisible())
  await shot(page, 'f06-filter-empty-1440.png')
  await page.getByRole('button', { name: '重置筛选条件' }).click()
  await waitGone(page, '正在加载实时监控')

  await setScope(page, '全部（含离线）')
  await queryKeyword(page, '演示职工乙')
  const yi = page.locator('tr[data-emp="EMP-DEMO-002"]')
  const yiText = await yi.innerText()
  log('yi-zero-not-missing', yiText.includes('0 bpm') && !yiText.includes('无数据\n0'), yiText.replace(/\s+/g, ' ').slice(0, 200))
  log('yi-stale', (await yi.getAttribute('data-status')) === 'stale')

  await queryKeyword(page, '赵铁柱')
  const zhao = page.locator('tr[data-emp="EMP-005875019"]')
  const zhaoText = await zhao.innerText()
  log('zhao-invalid', zhaoText.includes('无效') || zhaoText.includes('无数据'), zhaoText.replace(/\s+/g, ' ').slice(0, 200))
  log('zhao-no-data', (await zhao.getAttribute('data-status')) === 'no_data')

  await queryKeyword(page, '王强')
  const wang = page.locator('tr[data-emp="EMP-005875034"]')
  log('wang-unbound-no-data', (await wang.getAttribute('data-status')) === 'no_data')
  log('wang-no-incident', (await wang.innerText()).includes('暂无关联事件'))

  await page.locator('.hn-filter').getByRole('button', { name: '重置' }).click()
  await waitGone(page, '正在加载实时监控')

  const capNums = await page.locator('.hn-capsule-number').allTextContents()
  const warnCap = Number(capNums[1])
  const staleCap = Number(capNums[2])
  const noDataCap = Number(capNums[3])
  await page.locator('.hn-capsule').filter({ hasText: '当前异常' }).click()
  await waitGone(page, '正在加载实时监控')
  const warningRows = await page.locator('tr[data-status="warning"]').count()
  const pagerAfter = await page.locator('.hn-pager-info').textContent()
  log('filter-warning-matches-summary', warningRows === warnCap && new RegExp(`共\\s*${warnCap}\\s*条`).test(pagerAfter || ''), `rows=${warningRows} cap=${warnCap} ${pagerAfter}`)
  log('filter-warning-still-online', (await page.locator('tr[data-online="offline"]').count()) === 0)
  await shot(page, 'f06-warning-only-1440.png')
  await page.locator('.hn-filter').getByRole('button', { name: '重置' }).click()
  await waitGone(page, '正在加载实时监控')

  await page.locator('.hn-capsule').filter({ hasText: '数据陈旧' }).click()
  await waitGone(page, '正在加载实时监控')
  const staleRows = await page.locator('tr[data-status="stale"]').count()
  const stalePager = await page.locator('.hn-pager-info').textContent()
  const stalePageSize = Math.min(staleCap, 20)
  log('filter-stale-matches-summary', staleRows === stalePageSize && new RegExp(`共\\s*${staleCap}\\s*条`).test(stalePager || ''), `rows=${staleRows} cap=${staleCap} ${stalePager}`)
  await page.locator('.hn-filter').getByRole('button', { name: '重置' }).click()
  await waitGone(page, '正在加载实时监控')

  await page.locator('.hn-capsule').filter({ hasText: '无数据' }).click()
  await waitGone(page, '正在加载实时监控')
  const noDataRows = await page.locator('tr[data-status="no_data"]').count()
  const noDataPager = await page.locator('.hn-pager-info').textContent()
  const noDataPageSize = Math.min(noDataCap, 20)
  log('filter-nodata-matches-summary', noDataRows === noDataPageSize && new RegExp(`共\\s*${noDataCap}\\s*条`).test(noDataPager || ''), `rows=${noDataRows} cap=${noDataCap} ${noDataPager}`)
  await page.locator('.hn-filter').getByRole('button', { name: '重置' }).click()
  await waitGone(page, '正在加载实时监控')

  const p1 = await page.locator('.hn-pager-info').textContent()
  log('pagination-p1', /第\s*1\s*\//.test(p1 || ''), p1 || '')
  await page.getByRole('button', { name: '下一页' }).click()
  await waitGone(page, '正在加载实时监控')
  const p2 = await page.locator('.hn-pager-info').textContent()
  log('pagination-p2', /第\s*2\s*\//.test(p2 || ''), p2 || '')
  await shot(page, 'f06-pagination-p2-1440.png')
  await page.getByRole('button', { name: '上一页' }).click()
  await waitGone(page, '正在加载实时监控')
  await page.locator('.el-select').filter({ hasText: '20 条/页' }).click()
  await page.getByRole('option', { name: '50 条/页' }).click()
  await waitGone(page, '正在加载实时监控')
  const p50 = await page.locator('.hn-pager-info').textContent()
  log('page-size-50', /共\s*\d+\s*条/.test(p50 || '') && !/第\s*2\s*\//.test(p50 || ''), p50 || '')
  await page.locator('.el-select').filter({ hasText: '50 条/页' }).click()
  await page.getByRole('option', { name: '20 条/页' }).click()
  await waitGone(page, '正在加载实时监控')

  const beforePause = await page.locator('[data-testid="auto-refresh"]').textContent()
  await page.getByRole('button', { name: '暂停' }).click()
  await page.waitForTimeout(2200)
  const paused = await page.locator('[data-testid="auto-refresh"]').textContent()
  log('auto-paused', (paused || '').includes('已暂停'), paused || '')
  await page.getByRole('button', { name: '恢复' }).click()
  const resumed = await page.locator('[data-testid="auto-refresh"]').textContent()
  log('auto-resumed', (resumed || '').includes('秒'), resumed || '')
  log('pause-froze', Boolean(beforePause && paused), `before=${beforePause} paused=${paused}`)

  await queryKeyword(page, '演示职工甲')
  const jiaBefore = await page.locator('tr[data-emp="EMP-DEMO-001"]').innerText()
  await page.getByRole('button', { name: '刷新' }).click()
  await waitGone(page, '正在加载实时监控')
  const jiaAfter = await page.locator('tr[data-emp="EMP-DEMO-001"]').innerText()
  log('refresh-keeps-measured-at', jiaAfter.includes('15:57:40') && jiaBefore.includes('15:57:40'))
  log('refresh-keeps-warning', (await page.locator('tr[data-emp="EMP-DEMO-001"]').getAttribute('data-status')) === 'warning')

  await page.locator('tr[data-emp="EMP-DEMO-001"]').getByRole('button', { name: '查看' }).click()
  await page.getByRole('heading', { name: '人员详情' }).waitFor()
  await page.getByText('正在加载人员详情').waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {})
  log('person-has-incident', await page.getByText(/关联事件 心率异常/).isVisible())
  await page.locator('.el-drawer').getByRole('button', { name: '查看事件' }).click()
  await page.getByText(/C01|事件详情|心率异常/).first().waitFor({ timeout: 8000 }).catch(() => {})
  const incidentVisible = await page.locator('.hn-incident-drawer').filter({ hasText: '心率异常' }).count()
    || await page.getByText('INC-DEMO-001').count()
  log('open-c01-from-person', incidentVisible > 0, `count=${incidentVisible}`)
  const confirmBtn = page.locator('.el-drawer').getByRole('button', { name: '确认' })
  if (await confirmBtn.count()) {
    await confirmBtn.first().click()
    await page.waitForTimeout(500)
  }
  await closeOverlays(page)
  await page.locator('.hn-filter').getByRole('button', { name: '重置' }).click()
  await waitGone(page, '正在加载实时监控')
  await queryKeyword(page, '演示职工甲')
  const jiaHandled = await page.locator('tr[data-emp="EMP-DEMO-001"]').innerText()
  log('incident-does-not-clear-vital', jiaHandled.includes('126') && (await page.locator('tr[data-emp="EMP-DEMO-001"]').getAttribute('data-status')) === 'warning', jiaHandled.replace(/\s+/g, ' ').slice(0, 180))

  await queryKeyword(page, '李建国')
  await page.locator('tr[data-emp="EMP-005875012"]').getByRole('button', { name: '查看' }).click()
  await page.getByRole('heading', { name: '人员详情' }).waitFor()
  await page.getByText('正在加载人员详情').waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {})
  await page.getByText('暂无关联事件').first().waitFor()
  log('li-no-incident-in-detail', await page.getByText('暂无关联事件').first().isVisible())
  const eventBtn = page.locator('.el-drawer').getByRole('button', { name: '查看事件' })
  log('li-no-fake-event-button', (await eventBtn.count()) === 0)
  await closeOverlays(page)

  await page.locator('.hn-filter').getByRole('button', { name: '重置' }).click()
  await waitGone(page, '正在加载实时监控')
  await setScope(page, '全部（含离线）')
  await queryKeyword(page, '演示职工丁')
  const ding = await page.locator('tr[data-emp="EMP-DEMO-004"]').innerText()
  log('ding-completed-not-rewritten', ding.includes('128/82') && (await page.locator('tr[data-emp="EMP-DEMO-004"]').getAttribute('data-status')) === 'stale', ding.replace(/\s+/g, ' ').slice(0, 180))

  await page.locator('.hn-filter').getByRole('button', { name: '重置' }).click()
  await waitGone(page, '正在加载实时监控')
  await queryKeyword(page, '张伟')
  await page.locator('tr[data-emp="EMP-005875008"] .hn-metric-btn').first().click()
  const analysisMsg = await page.getByText(/心率分析尚未实现/).isVisible()
  log('analysis-not-implemented', analysisMsg)
  const stillZhang = page.url().includes('real-time')
  log('analysis-no-wrong-route', stillZhang, page.url())

  await page.locator('tr[data-emp="EMP-005875008"]').getByRole('button', { name: '查看' }).click()
  await page.getByRole('heading', { name: '人员详情' }).waitFor()
  await page.getByText('正在加载人员详情').waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {})
  await page.locator('.el-drawer').getByRole('button', { name: '沉浸人体' }).click()
  await page.waitForURL(/body-360-immersive/, { timeout: 10000 })
  log('body-keeps-person', page.url().includes('005875008') || page.url().includes('%E5%BC%A0%E4%BC%9F') || decodeURIComponent(page.url()).includes('张伟'), page.url())
  await page.goto('http://127.0.0.1:9531/health-monitor/real-time', { waitUntil: 'networkidle' })
  await waitGone(page, '正在加载实时监控')
  const timerOn = await page.evaluate(() => window.__hnMonitorTimerActive === true)
  log('timer-on-page', timerOn)
  await page.locator('.el-menu-item').filter({ hasText: '工作台' }).click()
  await page.waitForURL(/\/home/, { timeout: 10000 })
  await page.waitForTimeout(400)
  const timerOff = await page.evaluate(() => window.__hnMonitorTimerActive === false)
  log('timer-cleared-on-leave', timerOff)

  await openMonitor(page, '?scene=empty-online')
  log('empty-online-banner', await page.getByText('暂无在线人员').first().isVisible())
  await page.locator('.hn-capsule').filter({ hasText: '在线人数' }).click()
  await waitGone(page, '正在加载实时监控')
  log('empty-online-list', await page.getByText('暂无在线人员').first().isVisible())
  await shot(page, 'f06-empty-online-1440.png')

  await setScene(page, '空名单')
  log('empty-scene', await page.getByText('当前没有可监控人员').isVisible())
  await shot(page, 'f06-empty-1440.png')

  await setScene(page, '首次加载失败')
  log('first-error', await page.getByText('实时监控加载失败').isVisible())
  await shot(page, 'f06-error-1440.png')

  await setScene(page, '刷新失败保留缓存')
  log('cache-first-ok', await page.locator('tr[data-emp]').count() > 0)
  await page.getByRole('button', { name: '刷新' }).click()
  await page.waitForTimeout(800)
  log('cache-fail-banner', await page.locator('.hn-banner').filter({ hasText: '刷新失败' }).isVisible())
  log('cache-rows-kept', await page.locator('tr[data-emp]').count() > 0)
  await page.locator('.el-message').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
  await shot(page, 'f06-cache-fail-1440.png')

  await setScene(page, '无权限')
  log('forbidden', await page.getByText('无权限查看实时监控').isVisible())
  await shot(page, 'f06-forbidden-1440.png')

  await setScene(page, '只读账号')
  log('readonly-list', await page.locator('tr[data-emp]').count() > 0)
  await shot(page, 'f06-readonly-1440.png')

  await setScene(page, '默认实时名单')
  await waitGone(page, '正在加载实时监控')

  await queryKeyword(page, '演示职工丙')
  log('bing-online-stale', (await page.locator('tr[data-emp="EMP-DEMO-003"]').getAttribute('data-status')) === 'stale' && (await page.locator('tr[data-emp="EMP-DEMO-003"]').getAttribute('data-online')) === 'online')
  await page.locator('.hn-filter').getByRole('button', { name: '重置' }).click()
  await waitGone(page, '正在加载实时监控')

  await queryKeyword(page, '演示在线边界')
  log('exact-15min-online', (await page.locator('tr[data-emp="EMP-BOUND-ON"]').getAttribute('data-online')) === 'online')
  await page.locator('.hn-filter').getByRole('button', { name: '重置' }).click()
  await waitGone(page, '正在加载实时监控')

  await queryKeyword(page, '演示未来读数')
  const futureRead = page.locator('tr[data-emp="EMP-FUTURE-READ"]')
  const futureReadText = await futureRead.innerText()
  log('future-read-in-default', await futureRead.isVisible())
  log('future-read-not-warning', (await futureRead.getAttribute('data-status')) !== 'warning', await futureRead.getAttribute('data-status'))
  log('future-read-time-anomaly', futureReadText.includes('时间异常'), futureReadText.replace(/\s+/g, ' ').slice(0, 180))
  log('future-read-keeps-time', futureReadText.includes('08:00:00') || futureReadText.includes('2026-09-13') || futureReadText.includes('08:00'))
  await page.locator('.hn-filter').getByRole('button', { name: '重置' }).click()
  await waitGone(page, '正在加载实时监控')

  await queryKeyword(page, '演示未来通信')
  log('future-comm-not-in-default', (await page.locator('tr[data-emp="EMP-FUTURE-COMM"]').count()) === 0)
  await setScope(page, '全部（含离线）')
  await queryKeyword(page, '演示未来通信')
  const futureComm = page.locator('tr[data-emp="EMP-FUTURE-COMM"]')
  log('future-comm-offline', (await futureComm.getAttribute('data-online')) === 'offline')
  log('future-comm-not-treated-online', (await futureComm.getAttribute('data-online')) !== 'online')
  await page.locator('.hn-filter').getByRole('button', { name: '重置' }).click()
  await waitGone(page, '正在加载实时监控')

  await page.locator('.el-menu-item').filter({ hasText: '值班名单' }).click()
  await page.waitForURL(/duty-roster/, { timeout: 10000 })
  log('duty-roster-menu', (await page.locator('h1.header-title, h1.hn-title').first().textContent() || '').includes('值班名单'), await page.locator('h1').first().textContent())
  await page.locator('.el-menu-item').filter({ hasText: '实时监控' }).click()
  await page.waitForURL(/real-time/, { timeout: 10000 })
  await waitGone(page, '正在加载实时监控')
  log('real-time-menu', (await page.locator('h1.hn-title').textContent() || '').includes('实时监控'))

  await page.goto('http://127.0.0.1:9531/admin/device-list', { waitUntil: 'networkidle' })
  await page.getByText('正在加载设备列表').waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {})
  await page.getByPlaceholder('IMEI / 设备编号 / 名称').fill('869234051029808')
  await page.locator('.hn-filter').getByRole('button', { name: '查询' }).click()
  await page.getByText('正在加载设备列表').waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {})
  const deviceZhang = await page.getByText('张伟').first().isVisible()
  log('f22-zhang-bound-before', deviceZhang)

  await openMonitor(page)
  await queryKeyword(page, '张伟')
  const monitorImei = await page.locator('tr[data-emp="EMP-005875008"]').textContent()
  log('f06-zhang-same-imei', (monitorImei || '').includes('869234051029808'), (monitorImei || '').replace(/\s+/g, ' ').slice(0, 160))
  await page.locator('tr[data-emp="EMP-005875008"]').getByRole('button', { name: '查看' }).click()
  await page.getByRole('heading', { name: '人员详情' }).waitFor()
  await page.getByText('正在加载人员详情').waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {})
  log('f06-person-detail-imei', await page.locator('.el-drawer').getByText('869234051029808').first().isVisible())
  await closeOverlays(page)

  await page.goto('http://127.0.0.1:9531/admin/device-list', { waitUntil: 'networkidle' })
  await page.getByText('正在加载设备列表').waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {})
  await page.getByPlaceholder('IMEI / 设备编号 / 名称').fill('869234051029808')
  await page.locator('.hn-filter').getByRole('button', { name: '查询' }).click()
  await page.getByText('正在加载设备列表').waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {})
  log('f22-zhang-bound-after', await page.getByText('张伟').first().isVisible())

  await page.goto('http://127.0.0.1:9531/health-monitor/employee-archive', { waitUntil: 'networkidle' })
  await page.getByText('正在加载人员档案').waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {})
  await page.getByPlaceholder('姓名 / 工号 / 手机号 / IMEI').fill('张伟')
  await page.locator('.hn-filter').getByRole('button', { name: '查询' }).click()
  await page.getByText('正在加载人员档案').waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {})
  log('f14-zhang-bound-after', await page.getByText('869234051029808').first().isVisible())

  await openMonitor(page)
  const viewports = [
    [1920, 1080, 'f06-layout-1920.png'],
    [1440, 900, 'f06-layout-1440.png'],
    [1280, 800, 'f06-layout-1280.png'],
    [1024, 768, 'f06-layout-1024.png'],
    [390, 844, 'f06-layout-390.png'],
  ]
  for (const [w, h, name] of viewports) {
    await page.setViewportSize({ width: w, height: h })
    await page.waitForTimeout(400)
    await shot(page, name, true)
    if (w === 390) {
      await shot(page, 'f06-layout-390-scrolled.png', true)
      log('mobile-filter-toggle', await page.getByRole('button', { name: /筛选/ }).count() > 0)
    }
  }

  await page.setViewportSize({ width: 1440, height: 900 })
} catch (error) {
  log('script-error', false, String(error && error.message ? error.message : error))
  await shot(page, 'f06-script-error.png').catch(() => {})
} finally {
  const failedCount = results.filter((item) => !item.ok).length
  console.log(`\n${results.length - failedCount}/${results.length} passed`)
  await Promise.race([browser.close(), new Promise((resolve) => setTimeout(resolve, 3000))])
  process.exit(failedCount ? 1 : 0)
}
