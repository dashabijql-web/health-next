<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  Bell,
  Check,
  CircleCloseFilled,
  Clock,
  Connection,
  Cpu,
  DataLine,
  InfoFilled,
  Location,
  Monitor,
  Refresh,
  Right,
  User,
  Warning,
  WarningFilled,
} from '@element-plus/icons-vue'
import { isMockApiError } from '@/mock/errors'
import { formatSla } from '@/mock/format'
import { peekIncidentScene } from '@/mock/incidentApi'
import { HANDLING_LABELS, SEVERITY_LABELS, SOURCE_LABELS } from '@/mock/labels'
import { TEST_CLOCK_ISO } from '@/mock/session'
import IncidentDetailDrawer from '@/modules/incident-todo/IncidentDetailDrawer.vue'
import PersonDetailDrawer from '@/modules/people/PersonDetailDrawer.vue'
import { useIncidentWorkspace } from '@/stores/incidentWorkspace'
import {
  fetchWorkbenchData,
  getLastRefreshTime,
  MY_TODO_QUERY,
  TODAY_CRITICAL_QUERY,
  WORKBENCH_SCENE_OPTIONS,
  type TrendDayPoint,
  type WorkbenchAggregatedData,
  type WorkbenchDemoScene,
} from './mockWorkbenchData'
import type { IncidentListItem } from '@/mock/types'
import '@/styles/list-page.css'

defineOptions({ name: 'WorkbenchPage' })

const router = useRouter()
const workspace = useIncidentWorkspace()

const scene = ref<WorkbenchDemoScene>('default')
const loading = ref(false)
const refreshing = ref(false)
const errorMessage = ref('')
const cacheNotice = ref('')
const lastRefreshTime = ref(getLastRefreshTime())
const data = ref<WorkbenchAggregatedData | null>(null)
const viewportWidth = ref(typeof window === 'undefined' ? 1440 : window.innerWidth)

const personDrawerOpen = ref(false)
const selectedEmployeeId = ref<string | null>(null)

const activeTrendPoint = ref<TrendDayPoint | null>(null)

const mobileTrendCollapsed = ref(false)
const mobileCapCollapsed = ref(false)

let loadGeneration = 0

const isCompact = computed(() => viewportWidth.value <= 640)
const forbiddenView = computed(() => scene.value === 'forbidden' || errorMessage.value.includes('无权访问'))

function mineTodoLocation() {
  return {
    path: '/alert-management/notifications',
    query: {
      mineOnly: String(MY_TODO_QUERY.mineOnly),
      handlingState: MY_TODO_QUERY.handlingState,
    },
  }
}

function todayCriticalLocation() {
  return {
    path: '/alert-management/notifications',
    query: {
      severity: TODAY_CRITICAL_QUERY.severity,
      timeRange: TODAY_CRITICAL_QUERY.timeRange,
      handlingState: TODAY_CRITICAL_QUERY.handlingState,
    },
  }
}

function metricWarningLocation(metric: string) {
  return {
    path: '/health-monitor/real-time',
    query: { metric, overallStatus: 'warning' },
  }
}

function offlineDeviceLocation() {
  return {
    path: '/admin/device-list',
    query: { onlineStatus: 'offline' },
  }
}

function onResize() {
  viewportWidth.value = window.innerWidth
}

async function loadData(options: { refresh?: boolean } = {}) {
  const gen = ++loadGeneration
  if (options.refresh) refreshing.value = true
  else loading.value = true
  errorMessage.value = ''
  cacheNotice.value = ''

  try {
    const res = await fetchWorkbenchData(scene.value, options)
    if (gen !== loadGeneration) return
    data.value = res
    lastRefreshTime.value = res.clockTime
  } catch (err) {
    if (gen !== loadGeneration) return
    if (isMockApiError(err) && err.code === 'FORBIDDEN') {
      data.value = null
      cacheNotice.value = ''
      errorMessage.value = err.message
    } else if (isMockApiError(err) && err.code === 'UNAVAILABLE' && options.refresh && data.value) {
      cacheNotice.value = `${err.message}（当前显示 ${lastRefreshTime.value} 缓存数据）`
      ElMessage.warning(cacheNotice.value)
    } else if (isMockApiError(err)) {
      data.value = null
      errorMessage.value = err.message
    } else {
      data.value = null
      errorMessage.value = '工作台数据加载失败，请重试'
    }
  } finally {
    if (gen === loadGeneration) {
      loading.value = false
      refreshing.value = false
    }
  }
}

function onSceneChange(val: WorkbenchDemoScene) {
  scene.value = val
  void loadData()
}

function handleRefresh() {
  void loadData({ refresh: true })
}

function openIncident(incidentId: string) {
  workspace.openIncident(incidentId, peekIncidentScene())
}

function openPerson(employeeId: string) {
  selectedEmployeeId.value = employeeId
  personDrawerOpen.value = true
}

function goToPersonProfile(employeeId: string) {
  router.push({
    path: '/health-monitor/employee-profile',
    query: { id: employeeId },
  })
}

function onIncidentChanged() {
  ElMessage.success('待办事件处理已更新，正在同步工作台数据...')
  void loadData({ refresh: true })
}

function slaView(item: IncidentListItem) {
  return formatSla(item.dueAt)
}

const aggDebugJson = computed(() => JSON.stringify({
  myTodoIds: data.value?.myTodoIds ?? [],
  todayCriticalIds: data.value?.todayCriticalIds ?? [],
  offlineDeviceIds: data.value?.offlineDeviceIds ?? [],
  rosterCount: data.value?.rosterCount ?? 0,
  mineCount: data.value?.incidentsSummary.mine ?? 0,
  totalTodosCount: data.value?.totalTodosCount ?? 0,
  todayCriticalCount: data.value?.todayCriticalCount ?? 0,
  offlineCount: data.value?.deviceSummary.offline ?? 0,
  warningByMetric: Object.fromEntries((data.value?.metricDistributions ?? []).map((item) => [item.key, item.warningCount])),
}))

// 趋势图 SVG 坐标计算
const trendSvgConfig = computed(() => {
  const points = data.value?.sevenDayTrends ?? []
  if (points.length === 0) return null

  const width = 560
  const height = 180
  const padding = { top: 24, right: 24, bottom: 28, left: 36 }
  const innerW = width - padding.left - padding.right
  const innerH = height - padding.top - padding.bottom

  const maxVal = Math.max(4, ...points.map((p) => p.anomalyCount))
  const stepX = points.length > 1 ? innerW / (points.length - 1) : innerW

  const coords = points.map((p, idx) => {
    const x = padding.left + idx * stepX
    const y = padding.top + innerH - (p.anomalyCount / maxVal) * innerH
    return { x, y, point: p }
  })

  // 折线路径
  const pathD = coords.reduce((acc, curr, idx) => {
    return idx === 0 ? `M ${curr.x} ${curr.y}` : `${acc} L ${curr.x} ${curr.y}`
  }, '')

  // 面积填充路径
  const areaD = coords.length > 0
    ? `${pathD} L ${coords[coords.length - 1].x} ${height - padding.bottom} L ${coords[0].x} ${height - padding.bottom} Z`
    : ''

  return { width, height, padding, coords, pathD, areaD, maxVal }
})

onMounted(() => {
  window.addEventListener('resize', onResize)
  void loadData()
})

onBeforeUnmount(() => {
  loadGeneration += 1
  window.removeEventListener('resize', onResize)
})
</script>

<template>
  <div class="hn-page workbench-page">
    <!-- 顶部状态栏 -->
    <header class="hn-header wb-header">
      <div class="hn-header-left wb-header-left">
        <div class="wb-title-group">
          <h1 class="hn-title wb-main-title">工作台</h1>
          <span class="wb-subtitle">全矿值班调度与健康态势</span>
        </div>
        <div class="wb-duty-badges">
          <span class="wb-badge wb-badge-operator" title="当前登录值班操作人">
            <el-icon><User /></el-icon>
            值班人：<strong>{{ data?.operator.name || '值班员·管理员' }}</strong> ({{ data?.operator.username || 'admin' }})
          </span>
          <span class="wb-badge wb-badge-muted" title="班次信息当前未接入">
            当前班次：<span class="wb-unlinked">未配置/未接入</span>
          </span>
          <span class="wb-badge wb-badge-muted" title="矿区数据源当前未接入">
            所属矿区：<span class="wb-unlinked">未接入</span>
          </span>
        </div>
      </div>

      <div class="hn-header-right wb-header-right">
        <el-select
          v-model="scene"
          class="hn-scene-select wb-scene-select"
          aria-label="工作台演示场景"
          @change="onSceneChange"
        >
          <el-option
            v-for="item in WORKBENCH_SCENE_OPTIONS"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </el-select>

        <div class="wb-time-block">
          <span class="hn-refresh-time wb-time">
            页面刷新：<span class="hn-mono">{{ lastRefreshTime }}</span>
          </span>
          <span class="wb-clock-note">
            统计测试时钟 <span class="hn-mono">{{ data?.testClock || TEST_CLOCK_ISO }}</span>（mock）
          </span>
        </div>

        <button
          type="button"
          class="hn-btn hn-btn-refresh wb-refresh-btn"
          :class="{ 'is-loading': refreshing }"
          :disabled="loading || refreshing"
          @click="handleRefresh"
        >
          <el-icon class="hn-spin"><Refresh /></el-icon>
          <span>{{ refreshing ? '刷新中...' : '手动刷新' }}</span>
        </button>
      </div>
    </header>

    <!-- 刷新失败保留缓存警示条 -->
    <div v-if="cacheNotice" class="wb-banner wb-banner-warning">
      <el-icon><WarningFilled /></el-icon>
      <span>{{ cacheNotice }}</span>
      <button type="button" class="wb-banner-retry" @click="handleRefresh">重试</button>
    </div>

    <!-- 无权限 403 状态：不能回退展示缓存业务数据 -->
    <div v-if="forbiddenView" class="wb-card wb-forbidden-card">
      <el-icon class="wb-forbidden-icon"><WarningFilled /></el-icon>
      <div class="wb-error-title">当前账号无权访问工作台 (403 Forbidden)</div>
      <p class="wb-error-desc">您的值班账号缺少工作台调度查看权限，请联系矿区系统管理员开通权限。权限拒绝不会继续展示上次业务数据。</p>
      <button type="button" class="hn-btn hn-btn-reset" @click="onSceneChange('default')">切换为默认账号</button>
    </div>

    <div v-else-if="(loading && !data) || (scene === 'loading' && loading)" class="wb-card wb-loading-card">
      <el-icon class="hn-spin wb-loading-icon"><Refresh /></el-icon>
      <div class="wb-error-title">正在加载工作台</div>
      <p class="wb-error-desc">正在读取当前共享台账，不会切换事件或设备演示场景。</p>
    </div>

    <!-- 首次加载错误状态 -->
    <div v-else-if="errorMessage && !data" class="wb-card wb-error-card">
      <el-icon class="wb-error-icon"><CircleCloseFilled /></el-icon>
      <div class="wb-error-title">{{ errorMessage }}</div>
      <p class="wb-error-desc">工作台集中数据源暂时无法响应请求，请检查演示场景或重试。</p>
      <button type="button" class="hn-btn hn-btn-query" @click="handleRefresh">重新加载</button>
    </div>

    <!-- 正常工作台主体 -->
    <div v-else class="wb-body">
      <pre id="wb-agg-ids" class="wb-agg-ids" hidden>{{ aggDebugJson }}</pre>
      <!-- 一、紧凑摘要卡片行 -->
      <section
        class="wb-metrics-row"
        aria-label="核心指标摘要"
        :data-wb-mine="data?.incidentsSummary.mine ?? 0"
        :data-wb-critical="data?.todayCriticalCount ?? 0"
        :data-wb-offline="data?.deviceSummary.offline ?? 0"
        :data-wb-roster="data?.rosterCount ?? 0"
        :data-wb-todo-total="data?.incidentsSummary.totalTodo ?? 0"
      >
        <!-- 1. 我的待办 -->
        <div
          class="wb-metric-card is-cyan"
          data-wb-card="mine"
          role="button"
          tabindex="0"
          title="点击下钻查看我的待办事件"
          @click="router.push(mineTodoLocation())"
          @keydown.enter="router.push(mineTodoLocation())"
        >
          <div class="wb-card-header">
            <span class="wb-card-title">我的待办</span>
            <span class="wb-card-tag is-cyan">待我处理</span>
          </div>
          <div class="wb-card-value-wrap">
            <span class="wb-card-number">{{ data?.incidentsSummary.mine ?? 0 }}</span>
            <span class="wb-card-unit">件</span>
          </div>
          <div class="wb-card-footer">
            <span>总待办 {{ data?.incidentsSummary.totalTodo ?? 0 }} 件 · 点击下钻列表</span>
            <el-icon class="wb-card-arrow"><Right /></el-icon>
          </div>
        </div>

        <!-- 2. 今日高危 -->
        <div
          class="wb-metric-card is-danger"
          data-wb-card="critical"
          role="button"
          tabindex="0"
          title="点击下钻查看今日高危事件列表"
          @click="router.push(todayCriticalLocation())"
          @keydown.enter="router.push(todayCriticalLocation())"
        >
          <div class="wb-card-header">
            <span class="wb-card-title">今日高危</span>
            <span class="wb-card-tag is-danger">高危事件</span>
          </div>
          <div class="wb-card-value-wrap">
            <span class="wb-card-number is-danger">{{ data?.todayCriticalCount ?? 0 }}</span>
            <span class="wb-card-unit">起</span>
          </div>
          <div class="wb-card-footer">
            <span title="按测试时钟当天发生的高危事件统计，处理完成或关闭后仍计入今日发生">按今日发生统计，结案后仍计入</span>
            <el-icon class="wb-card-arrow"><Right /></el-icon>
          </div>
        </div>

        <!-- 3. 待复检准入 (明确未接入，不填 0，无假下钻) -->
        <div class="wb-metric-card is-unintegrated" title="复检准入评估模型尚未接入">
          <div class="wb-card-header">
            <span class="wb-card-title">待复检准入</span>
            <span class="wb-card-tag is-muted">能力未接入</span>
          </div>
          <div class="wb-card-value-wrap">
            <span class="wb-card-number is-muted">未接入</span>
          </div>
          <div class="wb-card-footer">
            <span class="wb-text-muted">准入评估模型尚未接入 · 暂无数据</span>
          </div>
        </div>

        <!-- 4. 离线设备 -->
        <div
          class="wb-metric-card is-warning"
          data-wb-card="offline"
          role="button"
          tabindex="0"
          title="点击下钻查看离线设备列表"
          @click="router.push(offlineDeviceLocation())"
          @keydown.enter="router.push(offlineDeviceLocation())"
        >
          <div class="wb-card-header">
            <span class="wb-card-title">离线设备</span>
            <span class="wb-card-tag is-warning">通信中断</span>
          </div>
          <div class="wb-card-value-wrap">
            <span class="wb-card-number is-warning">{{ data?.deviceSummary.offline ?? 0 }}</span>
            <span class="wb-card-unit">台</span>
          </div>
          <div class="wb-card-footer">
            <span>在线 {{ data?.deviceSummary.online ?? 0 }} / 登记总数 {{ data?.deviceSummary.total ?? 0 }} 台</span>
            <el-icon class="wb-card-arrow"><Right /></el-icon>
          </div>
        </div>
      </section>

      <!-- 二、优先处理区（主体：我的待办时间线与重点清单） -->
      <section class="wb-card wb-priority-section" aria-label="优先处理区">
        <div class="wb-section-header">
          <div class="wb-section-title-wrap">
            <div class="wb-section-icon is-cyan">
              <el-icon><Bell /></el-icon>
            </div>
            <div>
              <h2 class="wb-section-title">优先处理待办</h2>
              <span class="wb-section-desc">
                按当前操作人责任归属与未终结状态筛选，按严重度与 SLA 排序（展示前 {{ data?.myTodos.length ?? 0 }} 条 / 共 {{ data?.totalTodosCount ?? 0 }} 条）
              </span>
            </div>
          </div>
          <div class="wb-section-actions">
            <button
              type="button"
              class="hn-btn hn-btn-ghost wb-all-btn"
              @click="router.push(mineTodoLocation())"
            >
              <span class="wb-all-btn-text">查看全部待办 ({{ data?.totalTodosCount ?? 0 }})</span>
              <el-icon><Right /></el-icon>
            </button>
          </div>
        </div>
        <p v-if="data?.overlayNote" class="wb-overlay-note">{{ data.overlayNote }}</p>

        <!-- 无待办状态 -->
        <div v-if="!data?.myTodos || data.myTodos.length === 0" class="wb-empty-state">
          <el-icon class="wb-empty-icon"><Check /></el-icon>
          <div class="wb-empty-title">当前无需要处理的待办事项</div>
          <p class="wb-empty-desc">值班人员责任范围内的预警事件均已完成处置，系统持续监控中。</p>
        </div>

        <div v-else-if="isCompact" class="wb-todo-cards">
          <article
            v-for="item in data.myTodos"
            :key="item.incidentId"
            class="wb-todo-card"
            :class="`is-${item.severity}`"
            :data-incident-id="item.incidentId"
            :data-employee-id="item.employeeId"
          >
            <div class="wb-todo-card-top">
              <button
                type="button"
                class="wb-link-btn wb-emp-name"
                :title="`查看 ${item.employeeName} 健康画像`"
                @click="goToPersonProfile(item.employeeId)"
              >
                {{ item.employeeName }}
              </button>
              <span class="hn-tag-severity" :class="`is-${item.severity}`">
                {{ SEVERITY_LABELS[item.severity] || item.severity }}
              </span>
            </div>
            <button
              type="button"
              class="wb-link-btn wb-todo-card-event"
              @click="openIncident(item.incidentId)"
            >
              {{ item.eventName }}
            </button>
            <div class="wb-todo-card-meta">
              <span
                class="wb-sla-tag hn-mono"
                :class="{ 'is-overdue': slaView(item).overdue }"
              >
                {{ slaView(item).overdue ? '超时' : slaView(item).text }}
              </span>
              <span class="wb-todo-card-state">{{ HANDLING_LABELS[item.handlingState] }}</span>
            </div>
            <div class="wb-todo-card-actions">
              <button
                type="button"
                class="hn-btn hn-btn-query wb-action-btn"
                @click="openIncident(item.incidentId)"
              >
                处置
              </button>
              <button
                type="button"
                class="hn-btn hn-btn-ghost wb-action-btn"
                @click="openPerson(item.employeeId)"
              >
                详情
              </button>
            </div>
          </article>
        </div>

        <!-- 待办事件表格列表 -->
        <div v-else class="wb-todo-table-wrap">
          <table class="hn-table wb-todo-table">
            <thead>
              <tr>
                <th style="width: 140px;">预警人员</th>
                <th style="width: 170px;">事件名称 / 编码</th>
                <th style="width: 100px;">来源</th>
                <th style="width: 80px;">严重度</th>
                <th style="width: 90px;">处理状态</th>
                <th style="width: 130px;">发生时间</th>
                <th style="width: 140px;">SLA 倒计时</th>
                <th style="width: 90px;">责任人</th>
                <th style="width: 130px; text-align: right;">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="item in data.myTodos"
                :key="item.incidentId"
                class="wb-todo-row"
                :class="`is-${item.severity}`"
                :data-incident-id="item.incidentId"
                :data-employee-id="item.employeeId"
              >
                <!-- 人员 -->
                <td>
                  <div class="wb-person-cell">
                    <button
                      type="button"
                      class="wb-link-btn wb-emp-name"
                      title="点击查看职工健康画像"
                      @click="goToPersonProfile(item.employeeId)"
                    >
                      {{ item.employeeName }}
                    </button>
                    <span class="wb-emp-sub">{{ item.departmentName }}</span>
                  </div>
                </td>

                <!-- 事件 -->
                <td>
                  <div class="wb-event-cell">
                    <button
                      type="button"
                      class="wb-link-btn wb-event-name"
                      title="点击打开 C01 事件处置抽屉"
                      @click="openIncident(item.incidentId)"
                    >
                      {{ item.eventName }}
                    </button>
                    <span class="wb-event-code hn-mono">{{ item.incidentId }}</span>
                  </div>
                </td>

                <!-- 来源 -->
                <td>
                  <span class="wb-source-tag">
                    {{ SOURCE_LABELS[item.source] || item.source }}
                  </span>
                </td>

                <!-- 严重度 -->
                <td>
                  <span class="hn-tag-severity" :class="`is-${item.severity}`">
                    {{ SEVERITY_LABELS[item.severity] || item.severity }}
                  </span>
                </td>

                <!-- 处理状态 -->
                <td>
                  <span class="hn-tag-state" :class="`is-${item.handlingState}`">
                    {{ HANDLING_LABELS[item.handlingState] || item.handlingState }}
                  </span>
                </td>

                <!-- 发生时间 -->
                <td class="hn-mono wb-time-cell">
                  {{ item.occurredAt.replace('T', ' ').slice(11, 19) }}
                </td>

                <!-- SLA -->
                <td>
                  <span
                    class="wb-sla-tag hn-mono"
                    :class="{ 'is-overdue': formatSla(item.dueAt).overdue }"
                  >
                    <el-icon><Clock /></el-icon>
                    {{ formatSla(item.dueAt).text }}
                  </span>
                </td>

                <!-- 责任人 -->
                <td>
                  <span class="wb-assignee-text">
                    {{ item.assigneeName || '未分派' }}
                  </span>
                </td>

                <!-- 操作按钮 -->
                <td style="text-align: right;">
                  <div class="wb-action-btns">
                    <button
                      type="button"
                      class="hn-btn hn-btn-query wb-action-btn"
                      title="打开 C01 处置抽屉进行确认、分派或结案"
                      @click="openIncident(item.incidentId)"
                    >
                      处置
                    </button>
                    <button
                      type="button"
                      class="hn-btn hn-btn-ghost wb-action-btn"
                      title="查看人员快速详情"
                      @click="openPerson(item.employeeId)"
                    >
                      详情
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- 三、今日健康情况与趋势 + 常用入口与系统状态（双列布局） -->
      <div class="wb-grid-two-col">
        <!-- 左列：今日健康态势与 7 日走势 -->
        <section class="wb-card wb-health-section" aria-label="健康态势与趋势">
          <div class="wb-section-header">
            <div class="wb-section-title-wrap">
              <div class="wb-section-icon is-green">
                <el-icon><DataLine /></el-icon>
              </div>
              <div>
                <h2 class="wb-section-title">全矿健康态势与 7 日走势</h2>
                <span class="wb-section-desc">复用 F06 在线与新鲜度口径，按人去重统计</span>
              </div>
            </div>
            <button
              type="button"
              class="hn-btn hn-btn-ghost wb-mobile-toggle"
              @click="mobileTrendCollapsed = !mobileTrendCollapsed"
            >
              {{ mobileTrendCollapsed ? '展开趋势' : '收起' }}
            </button>
          </div>

          <div :class="{ 'wb-mobile-hide': mobileTrendCollapsed }">
            <!-- 统计口径说明条 -->
            <div class="wb-scope-bar">
              <el-icon class="wb-scope-icon"><InfoFilled /></el-icon>
              <div class="wb-scope-content">
                <span class="wb-scope-text">{{ data?.dataScopeNote }}</span>
                <span class="wb-scope-rule">
                  三口径区隔：人员体征异常 ({{ data?.monitorSummary.warning ?? 0 }}人) |
                  待办事件 ({{ data?.incidentsSummary.totalTodo ?? 0 }}起) |
                  离线设备 ({{ data?.deviceSummary.offline ?? 0 }}台)
                </span>
              </div>
            </div>

            <!-- 五大指标实时分布卡片 -->
            <div class="wb-metrics-dist-grid">
              <div
                v-for="m in data?.metricDistributions"
                :key="m.key"
                class="wb-dist-card"
                role="button"
                tabindex="0"
                :title="`查看${m.label}异常人员名单`"
                @click="router.push(metricWarningLocation(m.key))"
                @keydown.enter="router.push(metricWarningLocation(m.key))"
              >
                <div class="wb-dist-header">
                  <span class="wb-dist-name">{{ m.label }}</span>
                  <span v-if="m.unit" class="wb-dist-unit">{{ m.unit }}</span>
                </div>
                <div class="wb-dist-body">
                  <div class="wb-dist-stat">
                    <span class="wb-dist-num is-normal">{{ m.normalCount }}</span>
                    <span class="wb-dist-label">正常</span>
                  </div>
                  <div class="wb-dist-stat">
                    <span class="wb-dist-num" :class="m.warningCount > 0 ? 'is-warning' : 'is-muted'">
                      {{ m.warningCount }}
                    </span>
                    <span class="wb-dist-label">异常</span>
                  </div>
                  <div class="wb-dist-stat">
                    <span class="wb-dist-num is-muted">{{ m.staleCount }}</span>
                    <span class="wb-dist-label">陈旧</span>
                  </div>
                </div>
                <div class="wb-dist-footer">
                  <span>共覆盖 {{ m.totalMonitored }} 人</span>
                  <el-icon><Right /></el-icon>
                </div>
              </div>
            </div>

            <!-- 7日走势图（原生 SVG） -->
            <div class="wb-trend-panel">
              <div class="wb-trend-header">
                <div class="wb-trend-title-wrap">
                  <span class="wb-demo-badge">[演示样本]</span>
                  <span class="wb-trend-title">7日健康体征与异常趋势</span>
                </div>
                <span class="wb-trend-tip">非真实后台聚合，仅用于布局与走势演示</span>
              </div>

              <!-- 空数据图表提示 -->
              <div v-if="!trendSvgConfig" class="wb-trend-empty">
                <span>暂无 7 日历史趋势演示样本数据</span>
              </div>

              <!-- SVG 折线走势 -->
              <div v-else class="wb-svg-wrap">
                <svg
                  :viewBox="`0 0 ${trendSvgConfig.width} ${trendSvgConfig.height}`"
                  class="wb-trend-svg"
                  preserveAspectRatio="xMidYMid meet"
                >
                  <defs>
                    <linearGradient id="wbTrendGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.32" />
                      <stop offset="100%" stop-color="#38bdf8" stop-opacity="0.01" />
                    </linearGradient>
                  </defs>

                  <!-- 背景网格线 -->
                  <line
                    x1="36"
                    :y1="trendSvgConfig.height - 28"
                    :x2="trendSvgConfig.width - 24"
                    :y2="trendSvgConfig.height - 28"
                    stroke="rgba(148, 163, 184, 0.16)"
                    stroke-width="1"
                  />
                  <line
                    x1="36"
                    :y1="24"
                    :x2="trendSvgConfig.width - 24"
                    :y2="24"
                    stroke="rgba(148, 163, 184, 0.08)"
                    stroke-width="1"
                    stroke-dasharray="3 3"
                  />

                  <!-- 区域填充 -->
                  <path
                    :d="trendSvgConfig.areaD"
                    fill="url(#wbTrendGrad)"
                  />

                  <!-- 折线 -->
                  <path
                    :d="trendSvgConfig.pathD"
                    fill="none"
                    stroke="#38bdf8"
                    stroke-width="2.5"
                    stroke-linejoin="round"
                    stroke-linecap="round"
                  />

                  <!-- 节点与悬浮触点 -->
                  <g v-for="(item, idx) in trendSvgConfig.coords" :key="idx">
                    <!-- 垂直指示虚线 -->
                    <line
                      v-if="activeTrendPoint?.date === item.point.date"
                      :x1="item.x"
                      :y1="24"
                      :x2="item.x"
                      :y2="trendSvgConfig.height - 28"
                      stroke="#38bdf8"
                      stroke-width="1"
                      stroke-dasharray="2 2"
                    />

                    <!-- 圆点 -->
                    <circle
                      :cx="item.x"
                      :cy="item.y"
                      :r="item.point.isToday ? 5 : 3.5"
                      :fill="item.point.anomalyCount > 1 ? '#f87171' : '#38bdf8'"
                      stroke="#0d1117"
                      stroke-width="2"
                    />

                    <!-- X 轴日期文本 -->
                    <text
                      :x="item.x"
                      :y="trendSvgConfig.height - 8"
                      text-anchor="middle"
                      fill="#8fa7c3"
                      font-size="11"
                      font-family="var(--font-mono)"
                    >
                      {{ item.point.dayLabel }}
                    </text>

                    <!-- 交互点击/悬浮透明区域 -->
                    <rect
                      :x="item.x - 20"
                      :y="0"
                      width="40"
                      :height="trendSvgConfig.height"
                      fill="transparent"
                      style="cursor: pointer;"
                      @mouseenter="activeTrendPoint = item.point"
                      @mouseleave="activeTrendPoint = null"
                    />
                  </g>
                </svg>

                <!-- 悬浮 Tooltip 卡片 -->
                <div v-if="activeTrendPoint" class="wb-trend-tooltip">
                  <div class="wb-tt-title">{{ activeTrendPoint.date }} {{ activeTrendPoint.isToday ? '（今日）' : '' }}</div>
                  <div class="wb-tt-item">
                    <span>体征异常人数：</span>
                    <strong class="wb-tt-warn">{{ activeTrendPoint.anomalyCount }} 人</strong>
                  </div>
                  <div class="wb-tt-item">
                    <span>体征采集覆盖率：</span>
                    <strong>{{ activeTrendPoint.coveragePercent }}%</strong>
                  </div>
                  <div class="wb-tt-item">
                    <span>手表在线率：</span>
                    <strong>{{ activeTrendPoint.deviceOnlineRate }}%</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- 右列：常用入口与系统状态 -->
        <div class="wb-right-col">
          <!-- 常用业务入口 -->
          <section class="wb-card wb-portals-section" aria-label="常用业务入口">
            <div class="wb-section-header">
              <div class="wb-section-title-wrap">
                <div class="wb-section-icon is-cyan">
                  <el-icon><Location /></el-icon>
                </div>
                <div>
                  <h2 class="wb-section-title">常用业务入口</h2>
                  <span class="wb-section-desc">真实系统路由，点击快速直达对应功能</span>
                </div>
              </div>
            </div>

            <div class="wb-portals-grid">
              <div
                class="wb-portal-item"
                role="button"
                tabindex="0"
                @click="router.push('/health-monitor/real-time')"
                @keydown.enter="router.push('/health-monitor/real-time')"
              >
                <div class="wb-portal-icon is-cyan">
                  <el-icon><Monitor /></el-icon>
                </div>
                <div class="wb-portal-content">
                  <span class="wb-portal-title">实时监控</span>
                  <span class="wb-portal-desc">15min 在线人员体征读数</span>
                </div>
                <el-icon class="wb-portal-arrow"><Right /></el-icon>
              </div>

              <div
                class="wb-portal-item"
                role="button"
                tabindex="0"
                @click="router.push('/alert-management/notifications')"
                @keydown.enter="router.push('/alert-management/notifications')"
              >
                <div class="wb-portal-icon is-danger">
                  <el-icon><Bell /></el-icon>
                </div>
                <div class="wb-portal-content">
                  <span class="wb-portal-title">待办事件</span>
                  <span class="wb-portal-desc">集中处理未办完告警风险</span>
                </div>
                <el-icon class="wb-portal-arrow"><Right /></el-icon>
              </div>

              <div
                class="wb-portal-item"
                role="button"
                tabindex="0"
                @click="router.push('/health-monitor/employee-profile')"
                @keydown.enter="router.push('/health-monitor/employee-profile')"
              >
                <div class="wb-portal-icon is-blue">
                  <el-icon><User /></el-icon>
                </div>
                <div class="wb-portal-content">
                  <span class="wb-portal-title">职工健康画像</span>
                  <span class="wb-portal-desc">全生命周期历次体检走势</span>
                </div>
                <el-icon class="wb-portal-arrow"><Right /></el-icon>
              </div>

              <div
                class="wb-portal-item"
                role="button"
                tabindex="0"
                @click="router.push('/admin/device-list')"
                @keydown.enter="router.push('/admin/device-list')"
              >
                <div class="wb-portal-icon is-warning">
                  <el-icon><Cpu /></el-icon>
                </div>
                <div class="wb-portal-content">
                  <span class="wb-portal-title">设备管理</span>
                  <span class="wb-portal-desc">手表登记、在线与电量排查</span>
                </div>
                <el-icon class="wb-portal-arrow"><Right /></el-icon>
              </div>

              <div
                class="wb-portal-item"
                role="button"
                tabindex="0"
                @click="router.push('/health-monitor/body-360-immersive')"
                @keydown.enter="router.push('/health-monitor/body-360-immersive')"
              >
                <div class="wb-portal-icon is-purple">
                  <el-icon><Connection /></el-icon>
                </div>
                <div class="wb-portal-content">
                  <span class="wb-portal-title">沉浸人体 360°</span>
                  <span class="wb-portal-desc">三维全息体征映射交互</span>
                </div>
                <el-icon class="wb-portal-arrow"><Right /></el-icon>
              </div>

              <div
                class="wb-portal-item"
                role="button"
                tabindex="0"
                @click="router.push('/mine/map')"
                @keydown.enter="router.push('/mine/map')"
              >
                <div class="wb-portal-icon is-green">
                  <el-icon><Location /></el-icon>
                </div>
                <div class="wb-portal-content">
                  <span class="wb-portal-title">井下态势 GIS</span>
                  <span class="wb-portal-desc">巷道矢量地图与人员轨迹</span>
                </div>
                <el-icon class="wb-portal-arrow"><Right /></el-icon>
              </div>
            </div>
          </section>

          <!-- 外部系统与能力接入状态（诚实显示未接入） -->
          <section class="wb-card wb-capabilities-section" aria-label="外部系统与能力状态">
            <div class="wb-section-header">
              <div class="wb-section-title-wrap">
                <div class="wb-section-icon is-muted">
                  <el-icon><Connection /></el-icon>
                </div>
                <div>
                  <h2 class="wb-section-title">系统能力与接入状态</h2>
                  <span class="wb-section-desc">真实记录外部连接，未接入项严禁冒充在线</span>
                </div>
              </div>
              <button
                type="button"
                class="hn-btn hn-btn-ghost wb-mobile-toggle"
                @click="mobileCapCollapsed = !mobileCapCollapsed"
              >
                {{ mobileCapCollapsed ? '展开状态' : '收起' }}
              </button>
            </div>

            <div :class="{ 'wb-mobile-hide': mobileCapCollapsed }">
              <div class="wb-cap-list">
                <div
                  v-for="cap in data?.systemCapabilities"
                  :key="cap.id"
                  class="wb-cap-item"
                >
                  <div class="wb-cap-info">
                    <div class="wb-cap-head">
                      <span class="wb-cap-name">{{ cap.title }}</span>
                      <span class="wb-cap-badge is-unintegrated">{{ cap.statusText }}</span>
                    </div>
                    <p class="wb-cap-desc">{{ cap.detail }}</p>
                  </div>
                </div>
              </div>

              <!-- 严禁假装连接的醒目免责申明 -->
              <div class="wb-disclaimer-box">
                <el-icon class="wb-disc-icon"><Warning /></el-icon>
                <span>
                  <strong>环境声明：</strong>本工作台当前运行正常，仅代表页面前端与本地 Mock 环境已连接，<strong>不代表物理智能手表真实在线或外部生产系统已接入</strong>。
                </span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>

    <!-- C01 事件处置抽屉组件（复用已有） -->
    <IncidentDetailDrawer @changed="onIncidentChanged" />

    <!-- 人员详情抽屉组件（复用已有） -->
    <PersonDetailDrawer
      v-model="personDrawerOpen"
      :employee-id="selectedEmployeeId"
      scene="default"
      :can-write="false"
      preserve-store
      show-vitals
    />
  </div>
</template>

<style scoped>
.workbench-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
  max-width: 1600px;
  margin: 0 auto;
}

/* 顶部头部样式 */
.wb-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 20px;
  background: var(--bg-panel);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
}

.wb-header-left {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
}

.wb-title-group {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.wb-main-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: var(--text-strong);
  letter-spacing: 0.02em;
}

.wb-subtitle {
  font-size: 13px;
  color: var(--text-secondary);
}

.wb-duty-badges {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.wb-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  font-size: 12px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
}

.wb-badge-operator {
  color: var(--signal-cyan);
  background: rgba(56, 189, 248, 0.08);
  border-color: var(--border-interactive);
}

.wb-badge-operator strong {
  color: var(--text-strong);
}

.wb-unlinked {
  color: #fbbf24;
  font-weight: 500;
}

.wb-header-right {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.wb-scene-select {
  width: 170px;
}

.wb-time-block {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.wb-time {
  font-size: 12px;
  color: var(--text-muted);
}

.wb-clock-note {
  font-size: 11px;
  color: #fbbf24;
  line-height: 1.35;
}

.wb-all-btn {
  flex-shrink: 0;
  white-space: nowrap;
}

.wb-all-btn-text {
  white-space: nowrap;
}

.wb-overlay-note {
  margin: 0 0 12px;
  font-size: 12px;
  color: #fbbf24;
}

.wb-loading-card {
  text-align: center;
  padding: 48px 24px;
}

.wb-loading-icon {
  font-size: 28px;
  color: var(--signal-cyan);
  margin-bottom: 12px;
}

.wb-agg-ids {
  display: none;
}

.wb-todo-cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.wb-todo-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.02);
}

.wb-todo-card-top,
.wb-todo-card-meta,
.wb-todo-card-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.wb-todo-card-event {
  font-size: 13px;
  font-weight: 600;
}

.wb-todo-card-state {
  font-size: 11px;
  color: var(--text-muted);
}

/* 警示条与异常卡片 */
.wb-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-radius: 6px;
  font-size: 13px;
}

.wb-banner-warning {
  background: rgba(245, 158, 11, 0.12);
  border: 1px solid rgba(245, 158, 11, 0.3);
  color: #fbbf24;
}

.wb-banner-retry {
  margin-left: auto;
  padding: 2px 8px;
  background: rgba(245, 158, 11, 0.2);
  border: 1px solid rgba(245, 158, 11, 0.4);
  color: #fff;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.wb-card {
  background: var(--bg-panel);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  padding: 16px 20px;
}

.wb-error-card,
.wb-forbidden-card {
  text-align: center;
  padding: 48px 24px;
}

.wb-error-icon,
.wb-forbidden-icon {
  font-size: 40px;
  color: var(--status-danger);
  margin-bottom: 12px;
}

.wb-error-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-strong);
  margin-bottom: 8px;
}

.wb-error-desc {
  font-size: 13px;
  color: var(--text-secondary);
  max-width: 480px;
  margin: 0 auto 16px;
}

/* 工作台主体 */
.wb-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 一、四个紧凑指标卡片 */
.wb-metrics-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
}

.wb-metric-card {
  display: flex;
  flex-direction: column;
  padding: 14px 16px;
  background: var(--bg-panel);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  cursor: pointer;
  transition: border-color 0.18s ease, background 0.18s ease, transform 0.14s ease;
  user-select: none;
}

.wb-metric-card:hover:not(.is-unintegrated) {
  border-color: var(--border-interactive);
  background: rgba(13, 22, 34, 0.95);
  transform: translateY(-1px);
}

.wb-metric-card.is-unintegrated {
  cursor: not-allowed;
  opacity: 0.85;
}

.wb-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.wb-card-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
}

.wb-card-tag {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 4px;
  font-weight: 600;
  white-space: nowrap;
}

.wb-card-tag.is-cyan {
  background: rgba(56, 189, 248, 0.12);
  color: var(--signal-cyan);
  border: 1px solid rgba(56, 189, 248, 0.3);
}

.wb-card-tag.is-danger {
  background: rgba(239, 68, 68, 0.12);
  color: var(--status-danger);
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.wb-card-tag.is-warning {
  background: rgba(245, 158, 11, 0.12);
  color: var(--status-warning);
  border: 1px solid rgba(245, 158, 11, 0.3);
}

.wb-card-tag.is-muted {
  background: rgba(100, 116, 139, 0.12);
  color: var(--status-standby);
  border: 1px solid rgba(100, 116, 139, 0.3);
}

.wb-card-value-wrap {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 8px;
}

.wb-card-number {
  font-family: var(--font-mono);
  font-size: 26px;
  font-weight: 700;
  line-height: 1.1;
  color: var(--text-strong);
}

.wb-card-number.is-danger { color: #f87171; }
.wb-card-number.is-warning { color: #fbbf24; }
.wb-card-number.is-muted { font-size: 18px; color: var(--text-muted); }

.wb-card-unit {
  font-size: 12px;
  color: var(--text-muted);
}

.wb-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  color: var(--text-muted);
}

.wb-card-arrow {
  font-size: 12px;
  transition: transform 0.15s ease;
}

.wb-metric-card:hover .wb-card-arrow {
  transform: translateX(3px);
  color: var(--signal-cyan);
}

/* 二、优先处理区 */
.wb-priority-section {
  padding: 16px 20px;
}

.wb-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.wb-section-title-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
}

.wb-section-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  font-size: 16px;
}

.wb-section-icon.is-cyan {
  background: rgba(56, 189, 248, 0.14);
  color: var(--signal-cyan);
}

.wb-section-icon.is-green {
  background: rgba(34, 197, 94, 0.14);
  color: var(--status-normal);
}

.wb-section-icon.is-muted {
  background: rgba(148, 163, 184, 0.14);
  color: var(--text-secondary);
}

.wb-section-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-strong);
}

.wb-section-desc {
  font-size: 12px;
  color: var(--text-muted);
}

.wb-todo-table-wrap {
  overflow-x: auto;
}

.wb-todo-table {
  width: 100%;
  border-collapse: collapse;
}

.wb-todo-row td {
  padding: 10px 10px;
  border-bottom: 1px solid var(--border-subtle);
  font-size: 13px;
  vertical-align: middle;
}

.wb-todo-row:hover td {
  background: rgba(255, 255, 255, 0.02);
}

.wb-person-cell,
.wb-event-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.wb-link-btn {
  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
  text-align: left;
  font-size: 13px;
  font-weight: 500;
  color: var(--signal-cyan);
  transition: color 0.15s ease;
}

.wb-link-btn:hover {
  color: #fff;
  text-decoration: underline;
}

.wb-emp-sub,
.wb-event-code {
  font-size: 11px;
  color: var(--text-muted);
}

.wb-source-tag {
  display: inline-block;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-secondary);
  border: 1px solid var(--border-subtle);
  white-space: nowrap;
}

.wb-time-cell {
  color: var(--text-secondary);
  font-size: 12px;
}

.wb-sla-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(56, 189, 248, 0.08);
  color: var(--signal-cyan);
  border: 1px solid rgba(56, 189, 248, 0.2);
}

.wb-sla-tag.is-overdue {
  background: rgba(239, 68, 68, 0.12);
  color: #f87171;
  border-color: rgba(239, 68, 68, 0.3);
}

.wb-assignee-text {
  font-size: 12px;
  color: var(--text-secondary);
}

.wb-action-btns {
  display: inline-flex;
  gap: 6px;
}

.wb-action-btn {
  padding: 4px 8px;
  font-size: 11px;
}

.wb-empty-state {
  text-align: center;
  padding: 36px 16px;
}

.wb-empty-icon {
  font-size: 32px;
  color: var(--status-normal);
  margin-bottom: 8px;
}

.wb-empty-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-strong);
  margin-bottom: 4px;
}

.wb-empty-desc {
  font-size: 12px;
  color: var(--text-muted);
  margin: 0;
}

/* 三、双列布局（健康态势 + 常用入口与系统状态） */
.wb-grid-two-col {
  display: grid;
  grid-template-columns: 1.15fr 0.85fr;
  gap: 16px;
}

.wb-health-section {
  padding: 16px 20px;
}

.wb-right-col {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 统计口径条 */
.wb-scope-bar {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  margin-bottom: 14px;
}

.wb-scope-icon {
  font-size: 14px;
  color: var(--signal-cyan);
  margin-top: 2px;
  flex-shrink: 0;
}

.wb-scope-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.wb-scope-text {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.4;
}

.wb-scope-rule {
  font-size: 11px;
  color: var(--signal-cyan);
  font-weight: 500;
}

/* 五大指标卡片 */
.wb-metrics-dist-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 10px;
  margin-bottom: 16px;
}

.wb-dist-card {
  display: flex;
  flex-direction: column;
  padding: 10px 10px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  cursor: pointer;
  transition: border-color 0.16s ease, background 0.16s ease;
}

.wb-dist-card:hover {
  border-color: var(--border-interactive);
  background: rgba(56, 189, 248, 0.04);
}

.wb-dist-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.wb-dist-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-strong);
}

.wb-dist-unit {
  font-size: 10px;
  color: var(--text-muted);
}

.wb-dist-body {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
  padding: 4px 0;
  border-top: 1px dashed rgba(255, 255, 255, 0.06);
  border-bottom: 1px dashed rgba(255, 255, 255, 0.06);
}

.wb-dist-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.wb-dist-num {
  font-family: var(--font-mono);
  font-size: 14px;
  font-weight: 700;
  color: var(--text-strong);
}

.wb-dist-num.is-normal { color: #34d399; }
.wb-dist-num.is-warning { color: #f87171; }
.wb-dist-num.is-muted { color: #64748b; }

.wb-dist-label {
  font-size: 10px;
  color: var(--text-muted);
}

.wb-dist-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 10px;
  color: var(--text-muted);
}

/* 7日走势图面板 */
.wb-trend-panel {
  position: relative;
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  padding: 12px 14px;
}

.wb-trend-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.wb-trend-title-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
}

.wb-demo-badge {
  font-size: 10px;
  color: #fbbf24;
  font-weight: 600;
}

.wb-trend-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-strong);
}

.wb-trend-tip {
  font-size: 11px;
  color: var(--text-muted);
}

.wb-svg-wrap {
  position: relative;
  width: 100%;
  height: 160px;
}

.wb-trend-svg {
  width: 100%;
  height: 100%;
  display: block;
}

.wb-trend-tooltip {
  position: absolute;
  top: 10px;
  right: 14px;
  background: rgba(13, 17, 23, 0.96);
  border: 1px solid var(--border-interactive);
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 11px;
  pointer-events: none;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  z-index: 10;
}

.wb-tt-title {
  font-weight: 600;
  color: var(--signal-cyan);
  margin-bottom: 4px;
  font-family: var(--font-mono);
}

.wb-tt-item {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  color: var(--text-secondary);
}

.wb-tt-item strong {
  color: var(--text-strong);
  font-family: var(--font-mono);
}

.wb-tt-warn {
  color: #f87171 !important;
}

.wb-trend-empty {
  text-align: center;
  padding: 40px 0;
  color: var(--text-muted);
  font-size: 12px;
}

/* 常用业务入口 */
.wb-portals-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.wb-portal-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  cursor: pointer;
  transition: border-color 0.16s ease, background 0.16s ease;
}

.wb-portal-item:hover {
  border-color: var(--border-interactive);
  background: rgba(56, 189, 248, 0.05);
}

.wb-portal-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 5px;
  font-size: 15px;
  flex-shrink: 0;
}

.wb-portal-icon.is-cyan {
  background: rgba(56, 189, 248, 0.14);
  color: var(--signal-cyan);
}

.wb-portal-icon.is-danger {
  background: rgba(239, 68, 68, 0.14);
  color: var(--status-danger);
}

.wb-portal-icon.is-blue {
  background: rgba(59, 130, 246, 0.14);
  color: #60a5fa;
}

.wb-portal-icon.is-warning {
  background: rgba(245, 158, 11, 0.14);
  color: var(--status-warning);
}

.wb-portal-icon.is-purple {
  background: rgba(168, 85, 247, 0.14);
  color: #c084fc;
}

.wb-portal-icon.is-green {
  background: rgba(34, 197, 94, 0.14);
  color: var(--status-normal);
}

.wb-portal-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.wb-portal-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-strong);
}

.wb-portal-desc {
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.wb-portal-arrow {
  font-size: 12px;
  color: var(--text-muted);
  transition: transform 0.15s ease;
}

.wb-portal-item:hover .wb-portal-arrow {
  transform: translateX(2px);
  color: var(--signal-cyan);
}

/* 系统能力与接入状态 */
.wb-cap-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}

.wb-cap-item {
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
}

.wb-cap-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.wb-cap-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.wb-cap-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  font-weight: 600;
}

.wb-cap-badge.is-unintegrated {
  background: rgba(100, 116, 139, 0.14);
  color: var(--status-standby);
  border: 1px solid rgba(100, 116, 139, 0.3);
}

.wb-cap-desc {
  margin: 0;
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.4;
}

.wb-disclaimer-box {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 10px;
  background: rgba(245, 158, 11, 0.08);
  border: 1px solid rgba(245, 158, 11, 0.25);
  border-radius: 6px;
  font-size: 11px;
  color: #fbbf24;
  line-height: 1.4;
}

.wb-disc-icon {
  font-size: 14px;
  margin-top: 2px;
  flex-shrink: 0;
}

.wb-mobile-toggle {
  display: none;
}

/* 响应式断点适配 */
@media (max-width: 1440px) {
  .wb-metrics-dist-grid {
    grid-template-columns: repeat(5, 1fr);
  }
}

@media (max-width: 1280px) {
  .wb-grid-two-col {
    grid-template-columns: 1fr;
  }
  
  .wb-metrics-dist-grid {
    grid-template-columns: repeat(5, 1fr);
  }
}

@media (max-width: 1024px) {
  .wb-metrics-row {
    grid-template-columns: repeat(2, 1fr);
  }

  .wb-metrics-dist-grid {
    grid-template-columns: repeat(3, 1fr);
  }

  .wb-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .wb-header-right {
    width: 100%;
    justify-content: flex-start;
  }
}

@media (max-width: 640px) {
  .wb-header {
    padding: 12px 14px;
  }

  .wb-duty-badges {
    flex-direction: column;
    align-items: flex-start;
  }

  .wb-metrics-row {
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .wb-metric-card {
    padding: 10px 12px;
  }

  .wb-card-number {
    font-size: 20px;
  }

  .wb-portals-grid {
    grid-template-columns: 1fr;
  }

  .wb-metrics-dist-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .wb-mobile-toggle {
    display: inline-flex;
    padding: 2px 6px;
    font-size: 11px;
  }

  .wb-mobile-hide {
    display: none !important;
  }

  .wb-section-header {
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 8px;
  }

  .wb-section-actions {
    width: 100%;
  }

  .wb-all-btn {
    width: auto;
    max-width: 100%;
    white-space: nowrap;
  }

  .wb-todo-table th,
  .wb-todo-table td {
    padding: 8px 6px;
    font-size: 12px;
  }

  .wb-sla-tag {
    font-size: 10px;
  }
}
</style>
