<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  CircleCheck,
  CircleClose,
  Clock,
  FullScreen,
  Monitor,
  Refresh,
  Search,
  User,
  VideoPause,
  VideoPlay,
  Warning,
} from '@element-plus/icons-vue'
import { isMockApiError } from '@/mock/errors'
import { formatClockTime } from '@/mock/format'
import {
  FRESHNESS_WINDOW_MINUTES,
  METRIC_KEYS,
  MONITOR_REFRESH_MS,
  ONLINE_WINDOW_MINUTES,
} from '@/mock/healthStatus'
import { INDICATOR_STATE_LABELS, METRIC_LABELS } from '@/mock/labels'
import { fetchMonitorList } from '@/mock/monitorApi'
import { DEPARTMENTS } from '@/mock/org'
import { MONITOR_SCENE_OPTIONS, TEST_CLOCK_ISO } from '@/mock/session'
import IncidentDetailDrawer from '@/modules/incident-todo/IncidentDetailDrawer.vue'
import PersonDetailDrawer from '@/modules/people/PersonDetailDrawer.vue'
import { useIncidentWorkspace } from '@/stores/incidentWorkspace'
import { immersiveBodyLocation } from '@/utils/immersiveBody'
import type {
  DeviceOnlineStatus,
  IndicatorState,
  IndicatorView,
  MetricKey,
  MonitorDemoScene,
  MonitorListItem,
  MonitorQuery,
  MonitorSummary,
  PeopleDemoScene,
} from '@/mock/types'
import '@/styles/list-page.css'

defineOptions({ name: 'RealTimeMonitorPage' })

const route = useRoute()
const router = useRouter()
const workspace = useIncidentWorkspace()

const scene = ref<MonitorDemoScene>('default')
const loading = ref(false)
const refreshing = ref(false)
const lastRefreshTime = ref('--')
const errorMessage = ref('')
const cacheNotice = ref('')
const list = ref<MonitorListItem[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const hasLoaded = ref(false)
const countdown = ref(MONITOR_REFRESH_MS / 1000)
const autoPaused = ref(false)
const filterOpen = ref(true)
const viewportWidth = ref(typeof window === 'undefined' ? 1440 : window.innerWidth)

const summary = ref<MonitorSummary>({
  online: 0,
  warning: 0,
  stale: 0,
  noData: 0,
  generatedAt: TEST_CLOCK_ISO,
  dataNote: 'mock 测试数据，非正式接口统计，未连接手表与 Oracle',
  scopeNote: '',
  onlineWindowMinutes: ONLINE_WINDOW_MINUTES,
  freshnessWindowMinutes: FRESHNESS_WINDOW_MINUTES,
})

const draft = reactive({
  keyword: '',
  departmentId: 'all',
  overallStatus: 'all' as IndicatorState | 'all',
  metric: 'all' as MetricKey | 'all',
  onlineStatus: 'online' as DeviceOnlineStatus | 'all',
})
const applied = reactive({ ...draft })

const detailOpen = ref(false)
const activeEmployeeId = ref<string | null>(null)

let generation = 0
let inFlightKey: string | null = null
let timer: number | null = null

const isMobile = computed(() => viewportWidth.value <= 640)
const personScene = computed<PeopleDemoScene>(() => (scene.value === 'readonly' ? 'readonly' : 'default'))
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))
const pageNumbers = computed(() => {
  const pages = totalPages.value
  const current = page.value
  if (pages <= 7) return Array.from({ length: pages }, (_, index) => index + 1)
  const items = new Set([1, pages, current, current - 1, current + 1])
  return [...items].filter((item) => item >= 1 && item <= pages).sort((a, b) => a - b)
})

const hasActiveFilters = computed(() => {
  return Boolean(
    applied.keyword.trim()
    || applied.departmentId !== 'all'
    || applied.overallStatus !== 'all'
    || applied.metric !== 'all'
    || applied.onlineStatus !== 'online',
  )
})

const emptyKind = computed<'forbidden' | 'error' | 'empty' | 'empty-online' | 'filtered' | null>(() => {
  if (errorMessage.value && errorMessage.value.includes('无权')) return 'forbidden'
  if (errorMessage.value && !hasLoaded.value) return 'error'
  if (loading.value) return null
  if (list.value.length > 0) return null
  if (scene.value === 'empty') return 'empty'
  if (
    applied.onlineStatus === 'online'
    && summary.value.online === 0
    && !applied.keyword.trim()
    && applied.departmentId === 'all'
    && applied.overallStatus === 'all'
    && applied.metric === 'all'
  ) {
    return 'empty-online'
  }
  if (hasActiveFilters.value) return 'filtered'
  return 'empty'
})

function queryFromApplied(): MonitorQuery {
  return {
    keyword: applied.keyword,
    departmentId: applied.departmentId,
    overallStatus: applied.overallStatus,
    metric: applied.metric,
    onlineStatus: applied.onlineStatus,
    page: page.value,
    pageSize: pageSize.value,
  }
}

function stampRefreshTime() {
  const now = new Date()
  lastRefreshTime.value = [now.getHours(), now.getMinutes(), now.getSeconds()]
    .map((item) => String(item).padStart(2, '0'))
    .join(':')
}

function onResize() {
  viewportWidth.value = window.innerWidth
  if (window.innerWidth <= 640) filterOpen.value = false
}

function fourthVitals(item: MonitorListItem): IndicatorView[] {
  const items: IndicatorView[] = []
  if (item.indicators.temperature.state !== 'no_data') items.push(item.indicators.temperature)
  if (item.indicators.pressure.state !== 'no_data') items.push(item.indicators.pressure)
  if (!items.length) items.push(item.indicators.temperature)
  return items
}

function primaryReason(item: MonitorListItem): string {
  return item.warningReasons[0] || (item.overallStatus === 'normal' ? '当前无异常' : INDICATOR_STATE_LABELS[item.overallStatus])
}

function stateIcon(state: IndicatorState) {
  if (state === 'warning') return Warning
  if (state === 'stale') return Clock
  if (state === 'no_data') return CircleClose
  return CircleCheck
}

async function loadList(options: { refresh?: boolean; reason?: 'auto' | 'manual' | 'query' } = {}) {
  const reason = options.reason ?? (options.refresh ? 'manual' : 'query')
  const key = JSON.stringify(queryFromApplied())
  if (inFlightKey === key && (reason === 'auto' || reason === 'manual')) return
  const gen = ++generation
  inFlightKey = key
  if (options.refresh) refreshing.value = true
  else loading.value = true
  if (!options.refresh) errorMessage.value = ''
  try {
    const result = await fetchMonitorList(scene.value, queryFromApplied(), { refresh: options.refresh })
    if (gen !== generation) return
    list.value = result.list
    total.value = result.total
    page.value = result.page
    pageSize.value = result.pageSize
    summary.value = result.summary
    hasLoaded.value = true
    cacheNotice.value = ''
    errorMessage.value = ''
    stampRefreshTime()
    if (reason !== 'query') countdown.value = MONITOR_REFRESH_MS / 1000
  } catch (error) {
    if (gen !== generation) return
    const message = isMockApiError(error) ? `${error.message}（错误编号 ${error.requestId}）` : '实时监控加载失败'
    if (hasLoaded.value && isMockApiError(error) && error.code === 'UNAVAILABLE') {
      cacheNotice.value = message
      ElMessage.warning(message)
    } else {
      errorMessage.value = message
      if (!hasLoaded.value) {
        list.value = []
        total.value = 0
        summary.value = {
          online: 0,
          warning: 0,
          stale: 0,
          noData: 0,
          generatedAt: '',
          dataNote: 'mock 测试数据，非正式接口统计，未连接手表与 Oracle',
          scopeNote: '',
          onlineWindowMinutes: ONLINE_WINDOW_MINUTES,
          freshnessWindowMinutes: FRESHNESS_WINDOW_MINUTES,
        }
      }
    }
  } finally {
    if (generation === gen) inFlightKey = null
    loading.value = false
    refreshing.value = false
  }
}

function syncUrl(employeeId = activeEmployeeId.value) {
  const query: Record<string, string> = {}
  if (scene.value !== 'default') query.scene = scene.value
  if (page.value > 1) query.page = String(page.value)
  if (pageSize.value !== 20) query.pageSize = String(pageSize.value)
  if (applied.keyword.trim()) query.keyword = applied.keyword.trim()
  if (applied.departmentId !== 'all') query.departmentId = applied.departmentId
  if (applied.overallStatus !== 'all') query.overallStatus = applied.overallStatus
  if (applied.metric !== 'all') query.metric = applied.metric
  if (applied.onlineStatus !== 'online') query.onlineStatus = applied.onlineStatus
  if (detailOpen.value && employeeId) query.employeeId = employeeId
  if (workspace.open && workspace.incidentId) query.incidentId = workspace.incidentId
  void router.replace({ query })
}

function applyDraft() {
  Object.assign(applied, { ...draft })
  page.value = 1
  syncUrl()
  void loadList({ reason: 'query' })
}

function resetFilters() {
  Object.assign(draft, {
    keyword: '',
    departmentId: 'all',
    overallStatus: 'all',
    metric: 'all',
    onlineStatus: 'online',
  })
  applyDraft()
}

function clickCapsule(kind: 'online' | 'warning' | 'stale' | 'no_data') {
  if (kind === 'online') {
    draft.onlineStatus = 'online'
    draft.overallStatus = 'all'
    draft.metric = 'all'
    applyDraft()
    return
  }
  draft.overallStatus = draft.overallStatus === kind ? 'all' : kind
  applyDraft()
}

function showAllIncludingOffline() {
  draft.keyword = ''
  draft.departmentId = 'all'
  draft.overallStatus = 'all'
  draft.metric = 'all'
  draft.onlineStatus = 'all'
  applyDraft()
}

function goToPage(next: number) {
  if (next < 1 || next > totalPages.value || next === page.value) return
  page.value = next
  syncUrl()
  void loadList({ reason: 'query' })
}

function changePageSize(size: number | string) {
  pageSize.value = Number(size) === 50 ? 50 : 20
  page.value = 1
  syncUrl()
  void loadList({ reason: 'query' })
}

function onSceneChange(value: MonitorDemoScene) {
  scene.value = value
  hasLoaded.value = false
  cacheNotice.value = ''
  errorMessage.value = ''
  page.value = 1
  detailOpen.value = false
  workspace.clearIncident()
  Object.assign(draft, {
    keyword: '',
    departmentId: 'all',
    overallStatus: 'all',
    metric: 'all',
    onlineStatus: 'online',
  })
  Object.assign(applied, { ...draft })
  syncUrl(null)
  void loadList({ reason: 'query' })
}

function openPerson(employeeId: string) {
  activeEmployeeId.value = employeeId
  detailOpen.value = true
  syncUrl(employeeId)
}

function onPersonClose(open?: boolean) {
  if (open) return
  syncUrl(null)
}

function openIncident(id: string | null, missing?: string | null) {
  if (!id) {
    ElMessage.info(missing || '暂无关联事件')
    return
  }
  if (scene.value === 'readonly') workspace.scene = 'readonly'
  workspace.openIncident(id)
  syncUrl()
}

function onDrawerChanged() {
  void loadList({ reason: 'query' })
  if (!workspace.open) syncUrl()
}

function analysisMetric(item: MonitorListItem): MetricKey {
  return METRIC_KEYS.find((key) => item.indicatorStates[key] === 'warning') ?? 'heartRate'
}

function openAnalysis(metric: MetricKey, item?: MonitorListItem) {
  const who = item ? `${item.empName}（${item.empCode}）` : '当前人员'
  const reason = item?.warningReasons[0] ? `，当前异常：${item.warningReasons[0]}` : ''
  ElMessage.info(`${METRIC_LABELS[metric]}分析尚未实现。已保留 ${who} 与 ${METRIC_LABELS[metric]} 上下文${reason}。不会跳转到错误页面或其他人员。`)
}

function openBody(item: MonitorListItem) {
  void router.push(immersiveBodyLocation(item.empCode, item.empName))
}

function toggleAuto() {
  autoPaused.value = !autoPaused.value
}

function tick() {
  if (autoPaused.value) return
  if (countdown.value <= 1) {
    countdown.value = MONITOR_REFRESH_MS / 1000
    void loadList({ refresh: true, reason: 'auto' })
    return
  }
  countdown.value -= 1
}

onMounted(() => {
  ;(window as Window & { __hnMonitorTimerActive?: boolean }).__hnMonitorTimerActive = true
  const query = route.query
  if (typeof query.scene === 'string' && MONITOR_SCENE_OPTIONS.some((item) => item.value === query.scene)) {
    scene.value = query.scene as MonitorDemoScene
  }
  if (typeof query.page === 'string') page.value = Number(query.page) || 1
  if (query.pageSize === '50') pageSize.value = 50
  if (typeof query.keyword === 'string') draft.keyword = query.keyword
  if (typeof query.departmentId === 'string') draft.departmentId = query.departmentId
  if (query.overallStatus === 'normal' || query.overallStatus === 'warning' || query.overallStatus === 'stale' || query.overallStatus === 'no_data') {
    draft.overallStatus = query.overallStatus
  }
  if (query.metric === 'heartRate' || query.metric === 'bloodPressure' || query.metric === 'bloodOxygen' || query.metric === 'temperature' || query.metric === 'pressure') {
    draft.metric = query.metric
  }
  if (query.onlineStatus === 'online' || query.onlineStatus === 'offline' || query.onlineStatus === 'all') {
    draft.onlineStatus = query.onlineStatus
  }
  Object.assign(applied, { ...draft })
  viewportWidth.value = window.innerWidth
  if (window.innerWidth <= 640) filterOpen.value = false
  window.addEventListener('resize', onResize)
  timer = window.setInterval(tick, 1000)
  void loadList({ reason: 'query' }).then(() => {
    if (typeof query.employeeId === 'string' && query.employeeId) openPerson(query.employeeId)
    if (typeof query.incidentId === 'string' && query.incidentId) openIncident(query.incidentId)
  })
})

onBeforeUnmount(() => {
  generation += 1
  inFlightKey = null
  if (timer) window.clearInterval(timer)
  timer = null
  window.removeEventListener('resize', onResize)
  ;(window as Window & { __hnMonitorTimerActive?: boolean }).__hnMonitorTimerActive = false
})
</script>

<template>
  <div class="hn-page monitor-page">
    <header class="hn-header">
      <div class="hn-header-left">
        <h1 class="hn-title">实时监控</h1>
        <span class="hn-desc">查看当前人员最新有效读数，采集时间按指标分开保存</span>
        <span class="hn-mock-tag">mock 测试数据</span>
      </div>
      <div class="hn-header-right">
        <el-select v-model="scene" class="hn-scene-select" aria-label="演示场景" @change="onSceneChange">
          <el-option v-for="item in MONITOR_SCENE_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <span class="hn-refresh-time">
          页面刷新于：<span class="hn-mono">{{ lastRefreshTime }}</span>
        </span>
        <span class="hn-refresh-time" data-testid="auto-refresh">
          自动刷新
          <span class="hn-mono">{{ autoPaused ? '已暂停' : `${countdown} 秒` }}</span>
        </span>
        <button type="button" class="hn-btn hn-btn-ghost" :aria-pressed="autoPaused" @click="toggleAuto">
          <el-icon><VideoPlay v-if="autoPaused" /><VideoPause v-else /></el-icon>
          <span>{{ autoPaused ? '恢复' : '暂停' }}</span>
        </button>
        <button
          type="button"
          class="hn-btn hn-btn-refresh"
          :class="{ 'is-loading': refreshing }"
          :disabled="loading || refreshing"
          @click="loadList({ refresh: true, reason: 'manual' })"
        >
          <el-icon class="hn-spin"><Refresh /></el-icon>
          <span>刷新</span>
        </button>
      </div>
    </header>

    <div class="hn-banner hn-policy">
      <p class="hn-policy-full">
        在线窗口 {{ ONLINE_WINDOW_MINUTES }} 分钟，体征新鲜度 {{ FRESHNESS_WINDOW_MINUTES }} 分钟，相对测试时钟
        <span class="hn-mono">{{ TEST_CLOCK_ISO }}</span>
        。默认只统计该在线窗口内人员。页面刷新时间是浏览器请求时间，不会把旧读数改成新鲜读数。阈值来自演示配置，不是真实后台规则。
      </p>
      <p class="hn-policy-short">
        在线 {{ ONLINE_WINDOW_MINUTES }} 分钟 · 新鲜度 {{ FRESHNESS_WINDOW_MINUTES }} 分钟 · 测试时钟
        <span class="hn-mono">{{ TEST_CLOCK_ISO }}</span>
      </p>
    </div>

    <div v-if="cacheNotice" class="hn-banner is-warn">
      <span>{{ cacheNotice }}。已保留上次成功名单，采集时间未改写。统计时钟 {{ summary.generatedAt || '上次成功时间' }}。</span>
      <button type="button" class="hn-btn hn-btn-refresh" @click="loadList({ refresh: true, reason: 'manual' })">重试</button>
    </div>
    <div v-else-if="errorMessage && hasLoaded" class="hn-banner is-error">
      <span>{{ errorMessage }}</span>
      <button type="button" class="hn-btn hn-btn-refresh" @click="loadList({ reason: 'query' })">重试</button>
    </div>
    <section class="hn-capsules is-compact">
      <div
        class="hn-capsule"
        :class="{ 'is-active': applied.onlineStatus === 'online' && applied.overallStatus === 'all' }"
        title="筛选 15 分钟内在线人员"
        @click="clickCapsule('online')"
      >
        <div class="hn-capsule-head">
          <span class="hn-capsule-label">在线人数</span>
          <span class="hn-capsule-icon is-cyan"><el-icon><Monitor /></el-icon></span>
        </div>
        <div class="hn-capsule-body">
          <span class="hn-capsule-number is-cyan">{{ summary.online }}</span>
          <span class="hn-capsule-unit">人</span>
        </div>
        <div class="hn-capsule-meta">默认范围：15 分钟在线窗口</div>
      </div>
      <div
        class="hn-capsule"
        :class="{ 'is-active': applied.overallStatus === 'warning' }"
        title="筛选当前异常人员"
        @click="clickCapsule('warning')"
      >
        <div class="hn-capsule-head">
          <span class="hn-capsule-label">当前异常</span>
          <span class="hn-capsule-icon is-danger"><el-icon><Warning /></el-icon></span>
        </div>
        <div class="hn-capsule-body">
          <span class="hn-capsule-number is-danger">{{ summary.warning }}</span>
          <span class="hn-capsule-unit">人</span>
        </div>
        <div class="hn-capsule-meta">当前范围内新鲜超限，按人去重</div>
      </div>
      <div
        class="hn-capsule"
        :class="{ 'is-active': applied.overallStatus === 'stale' }"
        title="筛选数据陈旧人员"
        @click="clickCapsule('stale')"
      >
        <div class="hn-capsule-head">
          <span class="hn-capsule-label">数据陈旧</span>
          <span class="hn-capsule-icon is-warning"><el-icon><Clock /></el-icon></span>
        </div>
        <div class="hn-capsule-body">
          <span class="hn-capsule-number is-warning">{{ summary.stale }}</span>
          <span class="hn-capsule-unit">人</span>
        </div>
        <div class="hn-capsule-meta">当前范围内读数过旧或时间异常</div>
      </div>
      <div
        class="hn-capsule"
        :class="{ 'is-active': applied.overallStatus === 'no_data' }"
        title="筛选无数据人员"
        @click="clickCapsule('no_data')"
      >
        <div class="hn-capsule-head">
          <span class="hn-capsule-label">无数据</span>
          <span class="hn-capsule-icon is-muted"><el-icon><CircleClose /></el-icon></span>
        </div>
        <div class="hn-capsule-body">
          <span class="hn-capsule-number is-muted">{{ summary.noData }}</span>
          <span class="hn-capsule-unit">人</span>
        </div>
        <div class="hn-capsule-meta">当前范围内无有效读数，不是 0 值</div>
      </div>
    </section>
    <p class="hn-scope">{{ summary.scopeNote || summary.dataNote }}</p>

    <section class="hn-filter" :class="{ 'is-collapsed': isMobile && !filterOpen }">
      <button
        v-if="isMobile"
        type="button"
        class="hn-btn hn-btn-ghost hn-filter-toggle"
        :aria-expanded="filterOpen"
        @click="filterOpen = !filterOpen"
      >
        {{ filterOpen ? '收起筛选' : '展开筛选' }}
      </button>
      <div v-show="!isMobile || filterOpen" class="hn-filter-body">
        <div class="hn-filter-group hn-filter-search">
          <el-input
            v-model="draft.keyword"
            placeholder="姓名 / 工号 / IMEI"
            clearable
            :prefix-icon="Search"
            @keyup.enter="applyDraft"
          />
        </div>
        <div class="hn-filter-group">
          <label class="hn-filter-label">部门：</label>
          <el-select v-model="draft.departmentId" class="hn-select-sm">
            <el-option label="全部部门" value="all" />
            <el-option v-for="item in DEPARTMENTS" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
        </div>
        <div class="hn-filter-group">
          <label class="hn-filter-label">总体状态：</label>
          <el-select v-model="draft.overallStatus" class="hn-select-sm">
            <el-option label="全部状态" value="all" />
            <el-option label="正常" value="normal" />
            <el-option label="异常" value="warning" />
            <el-option label="过旧" value="stale" />
            <el-option label="无数据" value="no_data" />
          </el-select>
        </div>
        <div class="hn-filter-group">
          <label class="hn-filter-label">异常指标：</label>
          <el-select v-model="draft.metric" class="hn-select-sm">
            <el-option label="全部指标" value="all" />
            <el-option label="心率" value="heartRate" />
            <el-option label="血压" value="bloodPressure" />
            <el-option label="血氧" value="bloodOxygen" />
            <el-option label="体温" value="temperature" />
            <el-option label="压力" value="pressure" />
          </el-select>
        </div>
        <div class="hn-filter-group">
          <label class="hn-filter-label">范围：</label>
          <el-select v-model="draft.onlineStatus" class="hn-select-sm">
            <el-option label="在线窗口内（默认）" value="online" />
            <el-option label="全部（含离线）" value="all" />
            <el-option label="仅离线" value="offline" />
          </el-select>
        </div>
        <button type="button" class="hn-btn hn-btn-query" @click="applyDraft">查询</button>
        <button type="button" class="hn-btn hn-btn-reset" @click="resetFilters">重置</button>
        <div class="hn-filter-count">
          匹配结果：<strong>{{ total }}</strong> 人
        </div>
      </div>
    </section>

    <section class="hn-table-card">
      <div v-if="loading" class="hn-loading-mask">正在加载实时监控…</div>
      <div class="hn-table-scroll">
        <table class="hn-table">
          <thead>
            <tr>
              <th class="col-sticky-left">人员</th>
              <th class="col-status">总体状态</th>
              <th class="col-reason col-hide-1024">异常原因</th>
              <th class="col-hide-lg">部门</th>
              <th class="col-hide-lg">设备</th>
              <th class="col-hide-sm">在线</th>
              <th class="col-hide-sm">心率</th>
              <th class="col-hide-1280">血压</th>
              <th class="col-hide-sm">血氧</th>
              <th class="col-hide-lg">体温/压力</th>
              <th class="col-actions">操作</th>
            </tr>
          </thead>
          <tbody v-if="list.length > 0">
            <tr
              v-for="item in list"
              :key="item.employeeId"
              class="hn-row"
              :class="{ 'is-critical': item.overallStatus === 'warning' }"
              :data-emp="item.employeeId"
              :data-status="item.overallStatus"
              :data-online="item.onlineStatus"
            >
              <td class="cell-stack col-sticky-left">
                <button type="button" class="hn-link person-name" @click="openPerson(item.employeeId)">{{ item.empName }}</button>
                <div class="cell-sub hn-mono">{{ item.empCode }}</div>
                <div class="cell-sub col-show-sm">
                  <span class="hn-status" :class="`is-${item.overallStatus}`">
                    <el-icon><component :is="stateIcon(item.overallStatus)" /></el-icon>
                    {{ INDICATOR_STATE_LABELS[item.overallStatus] }}
                  </span>
                  · {{ primaryReason(item) }}
                </div>
              </td>
              <td class="col-status">
                <span class="hn-status" :class="`is-${item.overallStatus}`">
                  <el-icon><component :is="stateIcon(item.overallStatus)" /></el-icon>
                  {{ INDICATOR_STATE_LABELS[item.overallStatus] }}
                </span>
              </td>
              <td class="col-reason is-wrap col-hide-1024">
                <button
                  v-if="item.relatedIncidentId"
                  type="button"
                  class="hn-link reason-link"
                  @click="openIncident(item.relatedIncidentId)"
                >
                  {{ primaryReason(item) }}
                </button>
                <span v-else>{{ primaryReason(item) }}</span>
                <div class="cell-sub">{{ item.relatedIncidentId ? `关联 ${item.relatedIncidentName}` : '暂无关联事件' }}</div>
              </td>
              <td class="wrap col-hide-lg">{{ item.departmentName }}</td>
              <td class="cell-stack col-hide-lg">
                <div>{{ item.deviceName || '未绑定设备' }}</div>
                <div class="cell-sub hn-mono">{{ item.imei || '无 IMEI' }}</div>
              </td>
              <td class="col-hide-sm">
                <span class="hn-status" :class="item.onlineStatus === 'online' ? 'is-active' : 'is-muted'">
                  <span class="hn-dot" />{{ item.onlineStatus === 'online' ? '在线' : '离线' }}
                </span>
                <div class="cell-sub hn-mono">{{ formatClockTime(item.lastOnlineAt) }}</div>
              </td>
              <td class="cell-stack hn-metric col-hide-sm" :class="`is-${item.indicators.heartRate.state}`">
                <button type="button" class="hn-metric-btn" @click="openAnalysis('heartRate', item)">
                  <div class="hn-metric-value">
                    <el-icon><component :is="stateIcon(item.indicators.heartRate.state)" /></el-icon>
                    {{ item.indicators.heartRate.display }}
                  </div>
                  <div class="cell-sub">{{ item.indicators.heartRate.stateLabel }} · {{ formatClockTime(item.indicators.heartRate.measuredAt) }}</div>
                </button>
              </td>
              <td class="cell-stack hn-metric col-hide-1280" :class="`is-${item.indicators.bloodPressure.state}`">
                <button type="button" class="hn-metric-btn" @click="openAnalysis('bloodPressure', item)">
                  <div class="hn-metric-value">
                    <el-icon><component :is="stateIcon(item.indicators.bloodPressure.state)" /></el-icon>
                    {{ item.indicators.bloodPressure.display }}
                  </div>
                  <div class="cell-sub">{{ item.indicators.bloodPressure.stateLabel }} · {{ formatClockTime(item.indicators.bloodPressure.measuredAt) }}</div>
                </button>
              </td>
              <td class="cell-stack hn-metric col-hide-sm" :class="`is-${item.indicators.bloodOxygen.state}`">
                <button type="button" class="hn-metric-btn" @click="openAnalysis('bloodOxygen', item)">
                  <div class="hn-metric-value">
                    <el-icon><component :is="stateIcon(item.indicators.bloodOxygen.state)" /></el-icon>
                    {{ item.indicators.bloodOxygen.display }}
                  </div>
                  <div class="cell-sub">{{ item.indicators.bloodOxygen.stateLabel }} · {{ formatClockTime(item.indicators.bloodOxygen.measuredAt) }}</div>
                </button>
              </td>
              <td class="cell-stack hn-metric col-hide-lg">
                <button
                  v-for="vital in fourthVitals(item)"
                  :key="vital.key"
                  type="button"
                  class="hn-metric-btn"
                  :class="`is-${vital.state}`"
                  @click="openAnalysis(vital.key, item)"
                >
                  <div class="hn-metric-value">
                    <el-icon><component :is="stateIcon(vital.state)" /></el-icon>
                    {{ vital.label }} {{ vital.display }}
                  </div>
                  <div class="cell-sub">{{ vital.stateLabel }} · {{ formatClockTime(vital.measuredAt) }}</div>
                </button>
              </td>
              <td class="is-nowrap col-actions">
                <div class="hn-actions">
                  <button type="button" class="hn-act is-link" @click="openPerson(item.employeeId)">查看</button>
                  <button
                    type="button"
                    class="hn-act col-hide-sm"
                    :disabled="!item.relatedIncidentId"
                    @click="openIncident(item.relatedIncidentId, item.relatedIncidentMissingReason)"
                  >
                    {{ item.relatedIncidentId ? '事件' : '暂无事件' }}
                  </button>
                  <button type="button" class="hn-act col-hide-lg" @click="openAnalysis(analysisMetric(item), item)">分析</button>
                  <button type="button" class="hn-act col-hide-lg" @click="openBody(item)">
                    <el-icon><FullScreen /></el-icon>
                    人体
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        <div v-if="!loading && emptyKind === 'forbidden'" class="hn-empty">
          <div class="hn-empty-icon"><el-icon :size="32"><Warning /></el-icon></div>
          <div class="hn-empty-title">无权限查看实时监控</div>
          <div class="hn-empty-desc">{{ errorMessage }}</div>
        </div>
        <div v-else-if="!loading && emptyKind === 'error'" class="hn-empty">
          <div class="hn-empty-icon"><el-icon :size="32"><Warning /></el-icon></div>
          <div class="hn-empty-title">实时监控加载失败</div>
          <div class="hn-empty-desc">{{ errorMessage }}</div>
          <button type="button" class="hn-btn hn-btn-refresh" @click="loadList({ reason: 'query' })">重试</button>
        </div>
        <div v-else-if="!loading && emptyKind === 'empty'" class="hn-empty">
          <div class="hn-empty-icon"><el-icon :size="32"><User /></el-icon></div>
          <div class="hn-empty-title">当前没有可监控人员</div>
          <div class="hn-empty-desc">人员台账为空。这是演示场景，不是真实空库。</div>
        </div>
        <div v-else-if="!loading && emptyKind === 'empty-online'" class="hn-empty">
          <div class="hn-empty-icon"><el-icon :size="32"><Monitor /></el-icon></div>
          <div class="hn-empty-title">暂无在线人员</div>
          <div class="hn-empty-desc">在线窗口 {{ ONLINE_WINDOW_MINUTES }} 分钟内没有通信。可改用「全部（含离线）」扩展筛选。</div>
          <button type="button" class="hn-btn hn-btn-reset" @click="showAllIncludingOffline">查看全部（含离线）</button>
        </div>
        <div v-else-if="!loading && emptyKind === 'filtered'" class="hn-empty">
          <div class="hn-empty-icon"><el-icon :size="32"><Search /></el-icon></div>
          <div class="hn-empty-title">无符合条件的人员</div>
          <div class="hn-empty-desc">当前筛选没有匹配结果。请调整条件或重置后重试。</div>
          <button type="button" class="hn-btn hn-btn-reset" @click="resetFilters">重置筛选条件</button>
        </div>
      </div>

      <footer v-if="total > 0" class="hn-pager">
        <div class="hn-pager-info">
          第 <span class="hn-mono">{{ page }}</span> / <span class="hn-mono">{{ totalPages }}</span> 页，共
          <span class="hn-mono">{{ total }}</span> 条
        </div>
        <div class="hn-pager-controls">
          <el-select :model-value="pageSize" class="hn-select-sm" style="width: 110px" @change="changePageSize">
            <el-option :value="20" label="20 条/页" />
            <el-option :value="50" label="50 条/页" />
          </el-select>
          <button type="button" class="hn-pg" :disabled="page <= 1" @click="goToPage(page - 1)">上一页</button>
          <button
            v-for="item in pageNumbers"
            :key="item"
            type="button"
            class="hn-pg-num"
            :class="{ 'is-active': item === page }"
            @click="goToPage(item)"
          >
            {{ item }}
          </button>
          <button type="button" class="hn-pg" :disabled="page >= totalPages" @click="goToPage(page + 1)">下一页</button>
        </div>
      </footer>
    </section>

    <PersonDetailDrawer
      v-model="detailOpen"
      :employee-id="activeEmployeeId"
      :scene="personScene"
      :can-write="false"
      preserve-store
      show-vitals
      @update:model-value="onPersonClose"
    />
    <IncidentDetailDrawer @changed="onDrawerChanged" />
  </div>
</template>

<style scoped>
.monitor-page :deep(.hn-table) {
  min-width: 1180px;
}

.monitor-page :deep(.hn-table .col-status),
.monitor-page :deep(.hn-table .col-actions),
.monitor-page :deep(.hn-table .col-sticky-left) {
  position: static;
  box-shadow: none;
}

.monitor-page :deep(.hn-table .col-status) {
  min-width: 108px;
}

.monitor-page :deep(.hn-table .col-actions) {
  min-width: 148px;
  width: auto;
}

.col-reason {
  min-width: 200px;
  max-width: 260px;
  white-space: normal;
  overflow-wrap: break-word;
}

.hn-policy {
  display: block;
}

.hn-policy p {
  margin: 0;
  line-height: 1.55;
}

.hn-policy-short {
  display: none;
}

.hn-policy {
  color: var(--text-secondary);
  line-height: 1.5;
}

.hn-scope {
  margin: -6px 2px 0;
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.5;
}

.hn-filter-body {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  width: 100%;
}

.hn-metric-btn {
  display: block;
  width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.hn-metric-value {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: var(--font-mono);
}

.hn-status {
  gap: 4px;
}

.person-name,
.reason-link {
  white-space: normal;
  overflow-wrap: anywhere;
}

.col-sticky-left {
  min-width: 148px;
  max-width: 220px;
}

@media (max-width: 1280px) {
  .col-hide-1280 {
    display: none;
  }

  .monitor-page :deep(.hn-table) {
    min-width: 1100px;
  }
}

@media (max-width: 1024px) {
  .col-hide-1024 {
    display: none;
  }

  .monitor-page :deep(.hn-table) {
    min-width: 0;
  }

  .monitor-page :deep(.hn-table .col-actions) {
    min-width: 72px;
    width: auto;
  }
}

@media (max-width: 640px) {
  .monitor-page :deep(.hn-table) {
    min-width: 0;
  }

  .col-sticky-left,
  .monitor-page :deep(.hn-table .col-sticky-left),
  .monitor-page :deep(.hn-table .col-status),
  .monitor-page :deep(.hn-table .col-actions) {
    position: static;
    box-shadow: none;
    min-width: 0;
    width: auto;
    max-width: none;
  }

  .hn-filter-toggle {
    width: 100%;
  }

  .hn-policy-full {
    display: none;
  }

  .hn-policy-short {
    display: block;
  }
}
</style>
