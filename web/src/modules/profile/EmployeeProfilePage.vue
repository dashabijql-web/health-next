<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, type MessageOptions } from 'element-plus'
import {
  ArrowLeft,
  ArrowRight,
  ChatDotRound,
  CircleCheck,
  Clock,
  Connection,
  Cpu,
  FullScreen,
  InfoFilled,
  MapLocation,
  Phone,
  Refresh,
  Search,
  User,
  VideoPause,
  VideoPlay,
  WarningFilled,
} from '@element-plus/icons-vue'
import { formatClockTime } from '@/mock/format'
import { METRIC_KEYS } from '@/mock/healthStatus'
import { EMPLOYMENT_LABELS, INDICATOR_STATE_LABELS, METRIC_LABELS } from '@/mock/labels'
import type { MetricKey, PersonRecord } from '@/mock/types'
import IncidentDetailDrawer from '@/modules/incident-todo/IncidentDetailDrawer.vue'
import { useIncidentWorkspace } from '@/stores/incidentWorkspace'
import { immersiveBodyLocation } from '@/utils/immersiveBody'
import {
  buildEmployeeProfile,
  CLOCK_DATE,
  findProfilePersonByCode,
  getAllProfilePeople,
  presetDateRange,
  PROFILE_SCENARIOS,
  type EmployeeProfileModel,
  type HistoryRangePreset,
  type HistoryTrendPoint,
  type ProfileScenarioKey,
  validateHistoryQuery,
} from './mockProfileData'

defineOptions({ name: 'EmployeeProfilePage' })

const F15_POPPER = 'f15-popper'
const F15_DATE_POPPER = 'f15-date-popper'
const F15_AUTOCOMPLETE_POPPER = 'f15-autocomplete-popper'

function f15Message(type: MessageOptions['type'], message: string) {
  ElMessage({ type, message, customClass: 'f15-message' })
}

const route = useRoute()
const router = useRouter()
const workspace = useIncidentWorkspace()

const selectedScenario = ref<ProfileScenarioKey>('normal')
const currentEmpCode = ref('005875008')
const searchQuery = ref('')
const isRefreshing = ref(false)
const refreshErrorMessage = ref('')
const lastRefreshTime = ref('--')
const countdown = ref(30)
const isAutoRefreshPaused = ref(false)
const selectedMetric = ref<MetricKey>('heartRate')
const historyRange = ref<HistoryRangePreset>('7d')
const draftDateRange = ref<[string, string] | null>(presetDateRange('7d'))
const appliedDateRange = ref<[string, string]>(presetDateRange('7d'))

const hoveredPoint = ref<HistoryTrendPoint | null>(null)
const tooltipPos = ref<{ x: number; y: number } | null>(null)

const profileData = ref<EmployeeProfileModel | null>(null)
const cachedByEmpCode = ref<{ empCode: string; data: EmployeeProfileModel } | null>(null)
const allPeople = ref<PersonRecord[]>(getAllProfilePeople())

type LoadReason = 'nav' | 'auto' | 'manual' | 'history' | 'incident'

let loadGeneration = 0
let inFlightReason: LoadReason | null = null
let refreshTimer: number | null = null
const timeoutIds = new Set<number>()

function trackTimeout(fn: () => void, ms: number): number {
  const id = window.setTimeout(() => {
    timeoutIds.delete(id)
    fn()
  }, ms)
  timeoutIds.add(id)
  return id
}

function clearTrackedTimeouts() {
  timeoutIds.forEach((id) => window.clearTimeout(id))
  timeoutIds.clear()
}

function stampRefreshTime() {
  const now = new Date()
  lastRefreshTime.value = [now.getHours(), now.getMinutes(), now.getSeconds()]
    .map((item) => String(item).padStart(2, '0'))
    .join(':')
}

const currentPersonIndex = computed(() => {
  if (!profileData.value || profileData.value.isNotFound) return -1
  return allPeople.value.findIndex(
    (person) => person.empCode.toLowerCase() === profileData.value?.person.empCode.toLowerCase(),
  )
})

const historyIsLiveWindow = computed(() => appliedDateRange.value[1] >= CLOCK_DATE)

function currentHistoryQuery() {
  return {
    startDate: appliedDateRange.value[0],
    endDate: appliedDateRange.value[1],
    metric: selectedMetric.value,
  }
}

function shouldFailRefresh(empCode: string, reason: LoadReason) {
  return (
    selectedScenario.value === 'refresh_fail'
    && empCode === '005875008'
    && (reason === 'auto' || reason === 'manual')
  )
}

function applyFailState(empCode: string) {
  isRefreshing.value = false
  inFlightReason = null
  const cache = cachedByEmpCode.value
  if (cache && cache.empCode === empCode) {
    profileData.value = cache.data
    refreshErrorMessage.value =
      '演示环境模拟：体征网关数据同步超时 (504 Gateway Timeout)，已保留当前人员上次成功结果。'
  } else {
    if (profileData.value && profileData.value.person.empCode !== empCode) {
      profileData.value = null
    }
    refreshErrorMessage.value =
      '演示环境模拟：体征网关数据同步超时 (504 Gateway Timeout)。当前人员没有可展示的成功缓存。'
  }
  f15Message('error', '体征刷新失败：通信网关未响应')
}

function loadProfile(empCode: string, reason: LoadReason = 'nav') {
  if (inFlightReason && (reason === 'auto' || reason === 'manual')) return
  if (inFlightReason === 'manual' && reason === 'auto') return

  const gen = ++loadGeneration
  inFlightReason = reason
  if (reason === 'manual' || reason === 'auto' || reason === 'history') isRefreshing.value = reason !== 'auto'

  if (shouldFailRefresh(empCode, reason)) {
    trackTimeout(() => {
      if (gen !== loadGeneration) return
      applyFailState(empCode)
    }, 320)
    return
  }

  try {
    allPeople.value = getAllProfilePeople()
    const reuseHistory =
      reason !== 'history'
      && reason !== 'nav'
      && !historyIsLiveWindow.value
      && profileData.value
      && !profileData.value.isNotFound
      && profileData.value.person.empCode === empCode
        ? {
            trendPoints: profileData.value.trendPoints,
            trendMetadata: profileData.value.trendMetadata,
          }
        : undefined

    const data = buildEmployeeProfile(empCode, {
      historyQuery: currentHistoryQuery(),
      reuseHistory,
    })

    if (gen !== loadGeneration) return
    profileData.value = data
    if (!data.isNotFound) {
      cachedByEmpCode.value = { empCode: data.person.empCode, data }
    } else if (cachedByEmpCode.value?.empCode !== empCode) {
      cachedByEmpCode.value = null
    }
    refreshErrorMessage.value = ''
    stampRefreshTime()
    if (reason === 'manual') f15Message('success', '当前体征已刷新')
    if (reason === 'history') {
      f15Message(
        'success',
        `已查询 ${data.trendMetadata.startDate} 至 ${data.trendMetadata.endDate}，${data.trendMetadata.totalPoints} 个演示合成点`,
      )
    }
  } catch {
    if (gen !== loadGeneration) return
    f15Message('error', '加载职工画像数据出错')
  } finally {
    if (gen === loadGeneration) {
      isRefreshing.value = false
      inFlightReason = null
    }
  }
}

function syncRoute(empCode: string, scene?: ProfileScenarioKey) {
  const query: Record<string, string> = { empCode }
  if (scene && scene !== 'normal') query.scene = scene
  const currentCode = typeof route.query.empCode === 'string' ? route.query.empCode : ''
  const currentId = typeof route.query.id === 'string' ? route.query.id : ''
  const currentScene = typeof route.query.scene === 'string' ? route.query.scene : ''
  const nextScene = query.scene ?? ''
  if (currentCode === empCode && currentId === '' && currentScene === nextScene) {
    currentEmpCode.value = empCode
    loadProfile(empCode, 'nav')
    return
  }
  void router.replace({ query })
}

function resetHistoryToPreset(preset: Exclude<HistoryRangePreset, 'custom'>) {
  historyRange.value = preset
  const range = presetDateRange(preset)
  draftDateRange.value = range
  appliedDateRange.value = range
}

function onPersonNavigated(empCode: string, scene: ProfileScenarioKey = 'normal') {
  countdown.value = 30
  searchQuery.value = ''
  selectedScenario.value = scene
  if (cachedByEmpCode.value && cachedByEmpCode.value.empCode !== empCode) {
    refreshErrorMessage.value = ''
  }
  resetHistoryToPreset('7d')
  currentEmpCode.value = empCode
  syncRoute(empCode, scene)
}

watch(
  () => [route.query.empCode, route.query.id, route.query.scene] as const,
  ([queryCode, queryId, queryScene]) => {
    const sceneKey =
      typeof queryScene === 'string' && PROFILE_SCENARIOS.some((item) => item.key === queryScene)
        ? (queryScene as ProfileScenarioKey)
        : 'normal'
    selectedScenario.value = sceneKey
    const targetCode = ((queryCode || queryId || PROFILE_SCENARIOS.find((item) => item.key === sceneKey)?.empCode || '005875008') as string).trim()
    const personChanged = targetCode !== currentEmpCode.value
    currentEmpCode.value = targetCode
    if (personChanged) {
      countdown.value = 30
      resetHistoryToPreset(sceneKey === 'refresh_fail' ? '7d' : '7d')
    }
    loadProfile(targetCode, 'nav')
    if (sceneKey === 'refresh_fail' && targetCode === '005875008') {
      trackTimeout(() => loadProfile(targetCode, 'manual'), 80)
    }
  },
  { immediate: true },
)

function onScenarioChange(key: ProfileScenarioKey) {
  const scenario = PROFILE_SCENARIOS.find((item) => item.key === key)
  if (!scenario) return
  onPersonNavigated(scenario.empCode, key)
}

function goToPrevPerson() {
  if (allPeople.value.length === 0) return
  let idx = currentPersonIndex.value
  idx = idx <= 0 ? allPeople.value.length - 1 : idx - 1
  const prev = allPeople.value[idx]
  if (prev) onPersonNavigated(prev.empCode)
}

function goToNextPerson() {
  if (allPeople.value.length === 0) return
  let idx = currentPersonIndex.value
  idx = idx < 0 || idx >= allPeople.value.length - 1 ? 0 : idx + 1
  const next = allPeople.value[idx]
  if (next) onPersonNavigated(next.empCode)
}

function querySearch(queryString: string, cb: (results: Array<{ value: string; empCode: string }>) => void) {
  const q = queryString.trim().toLowerCase()
  const matched = allPeople.value.filter((person) => {
    if (!q) return true
    return (
      person.empName.toLowerCase().includes(q)
      || person.empCode.toLowerCase().includes(q)
      || person.employeeId.toLowerCase().includes(q)
    )
  })
  cb(
    matched.slice(0, 12).map((person) => ({
      value: `${person.empName}  ${person.empCode}`,
      empCode: person.empCode,
    })),
  )
}

function handleSearchSelect(item: { empCode?: string; value?: string }) {
  if (item.empCode) {
    onPersonNavigated(item.empCode)
    return
  }
  handleSearch(item.value ?? searchQuery.value)
}

function handleSearch(queryStr: string) {
  const q = queryStr.trim()
  if (!q) return
  const found = findProfilePersonByCode(q) ?? findProfilePersonByCode(q.split(/\s+/).pop() || q)
  onPersonNavigated(found?.empCode ?? q)
}

function handleManualRefresh() {
  countdown.value = 30
  loadProfile(currentEmpCode.value, 'manual')
}

function toggleAutoRefresh() {
  isAutoRefreshPaused.value = !isAutoRefreshPaused.value
  f15Message('info', isAutoRefreshPaused.value ? '已暂停自动刷新' : '已恢复自动刷新')
}

function goToImmersiveBody() {
  if (!profileData.value || profileData.value.isNotFound) {
    f15Message('warning', '该人员不存在，无法进入沉浸人体')
    return
  }
  router.push(immersiveBodyLocation(profileData.value.person.empCode, profileData.value.person.empName))
}

function selectMetric(key: MetricKey) {
  selectedMetric.value = key
}

function applyPresetRange(preset: Exclude<HistoryRangePreset, 'custom'>) {
  historyRange.value = preset
  const range = presetDateRange(preset)
  draftDateRange.value = range
  appliedDateRange.value = range
  loadProfile(currentEmpCode.value, 'history')
}

function onRangePresetChange(val: string | number | boolean | undefined) {
  if (val === '7d' || val === '14d' || val === '30d') applyPresetRange(val)
}

function onDraftDateChange(value: [string, string] | null) {
  draftDateRange.value = value
  if (!value) {
    historyRange.value = 'custom'
    return
  }
  const matched = (['7d', '14d', '30d'] as const).find((preset) => {
    const range = presetDateRange(preset)
    return value[0] === range[0] && value[1] === range[1]
  })
  historyRange.value = matched ?? 'custom'
}

function disabledHistoryDate(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}` > CLOCK_DATE
}

function queryHistory() {
  const start = draftDateRange.value?.[0]
  const end = draftDateRange.value?.[1]
  const error = validateHistoryQuery(start, end)
  if (error) {
    f15Message('warning', error)
    return
  }
  appliedDateRange.value = [start as string, end as string]
  const preset7 = presetDateRange('7d')
  const preset14 = presetDateRange('14d')
  const preset30 = presetDateRange('30d')
  if (start === preset7[0] && end === preset7[1]) historyRange.value = '7d'
  else if (start === preset14[0] && end === preset14[1]) historyRange.value = '14d'
  else if (start === preset30[0] && end === preset30[1]) historyRange.value = '30d'
  else historyRange.value = 'custom'
  loadProfile(currentEmpCode.value, 'history')
}

function openIncidentDrawer(incidentId: string) {
  workspace.openIncident(incidentId)
}

function handleVoiceCall() {
  f15Message('info', '演示环境：语音通道未接入，未执行呼叫')
}

function handleSendMessage() {
  f15Message('info', '演示环境：短信通道未接入，未执行发送')
}

function handleDeviceVibrate() {
  if (!profileData.value?.deviceInfo.isBound) {
    f15Message('warning', '该职工未绑定智能设备，无法下发震动指令')
    return
  }
  f15Message('info', '演示环境：设备指令通道未接入，未执行手环震动提醒')
}

function handleAdjustReporting() {
  if (!profileData.value?.deviceInfo.isBound) {
    f15Message('warning', '该职工未绑定智能设备，无法调整上报频次')
    return
  }
  f15Message('info', '演示环境：设备采集策略未接入，未执行上报频次调整')
}

function handleMineGisLocation() {
  f15Message('info', '演示环境：井下定位未接入，未打开地图定位')
}

const SVG_W = 760
const SVG_H = 220
const PAD_L = 50
const PAD_R = 25
const PAD_T = 25
const PAD_B = 30
const PLOT_W = SVG_W - PAD_L - PAD_R
const PLOT_H = SVG_H - PAD_T - PAD_B

interface MetricConfig {
  key: MetricKey
  label: string
  unit: string
  min: number
  max: number
  normalMin: number
  normalMax: number
  color: string
}

const METRIC_CONFIGS: Record<MetricKey, MetricConfig> = {
  heartRate: { key: 'heartRate', label: '心率', unit: 'bpm', min: 40, max: 140, normalMin: 50, normalMax: 100, color: '#f87171' },
  bloodPressure: { key: 'bloodPressure', label: '收缩压', unit: 'mmHg', min: 70, max: 170, normalMin: 90, normalMax: 140, color: '#38bdf8' },
  bloodOxygen: { key: 'bloodOxygen', label: '血氧', unit: '%', min: 88, max: 100, normalMin: 95, normalMax: 100, color: '#34d399' },
  temperature: { key: 'temperature', label: '体温', unit: '°C', min: 35.5, max: 38.5, normalMin: 36.0, normalMax: 37.5, color: '#fbbf24' },
  pressure: { key: 'pressure', label: '压力指数', unit: '', min: 0, max: 100, normalMin: 0, normalMax: 70, color: '#a78bfa' },
}

const currentMetricConfig = computed(() => METRIC_CONFIGS[selectedMetric.value])

function getY(val: number, cfg: MetricConfig): number {
  const clamped = Math.max(cfg.min, Math.min(cfg.max, val))
  const ratio = (clamped - cfg.min) / (cfg.max - cfg.min)
  return PAD_T + (1 - ratio) * PLOT_H
}

const normalBandY = computed(() => getY(currentMetricConfig.value.normalMax, currentMetricConfig.value))
const normalBandHeight = computed(() => {
  const cfg = currentMetricConfig.value
  return Math.max(2, getY(cfg.normalMin, cfg) - getY(cfg.normalMax, cfg))
})

const yTicks = computed(() => {
  const cfg = currentMetricConfig.value
  const ticks = []
  for (let i = 0; i <= 4; i += 1) {
    const val = cfg.min + ((cfg.max - cfg.min) / 4) * i
    ticks.push({ val: Number(val.toFixed(cfg.key === 'temperature' ? 1 : 0)), y: getY(val, cfg) })
  }
  return ticks
})

const trendRenderData = computed(() => {
  const points = profileData.value?.trendPoints ?? []
  if (points.length === 0) return { pathD: '', circles: [], missingSpans: [] }
  const cfg = currentMetricConfig.value
  const total = points.length
  const stepX = PLOT_W / (total - 1 || 1)
  const circles: Array<{ x: number; y: number; val: number; pt: HistoryTrendPoint; isAlert: boolean }> = []
  const missingSpans: Array<{ startX: number; endX: number }> = []
  const pathSegments: string[] = []
  let currentSegment: string[] = []
  let inMissingSpan = false
  let missingStart = 0

  points.forEach((pt, i) => {
    const x = PAD_L + i * stepX
    if (pt.isMissing) {
      if (!inMissingSpan) {
        inMissingSpan = true
        missingStart = x
      }
      if (currentSegment.length > 0) {
        pathSegments.push(currentSegment.join(' '))
        currentSegment = []
      }
      return
    }
    if (inMissingSpan) {
      inMissingSpan = false
      missingSpans.push({ startX: missingStart, endX: x })
    }
    const rawVal = cfg.key === 'bloodPressure' ? pt.systolic : pt[cfg.key as keyof HistoryTrendPoint]
    const numericVal = typeof rawVal === 'number' ? rawVal : cfg.min
    const y = getY(numericVal, cfg)
    circles.push({
      x,
      y,
      val: numericVal,
      pt,
      isAlert: numericVal > cfg.normalMax || numericVal < cfg.normalMin,
    })
    currentSegment.push(`${currentSegment.length === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`)
  })

  if (inMissingSpan) missingSpans.push({ startX: missingStart, endX: PAD_L + PLOT_W })
  if (currentSegment.length > 0) pathSegments.push(currentSegment.join(' '))
  return { pathD: pathSegments.join(' '), circles, missingSpans }
})

const xLabels = computed(() => {
  const points = profileData.value?.trendPoints ?? []
  if (points.length === 0) return []
  const step = Math.max(1, Math.floor(points.length / 6))
  const labels: Array<{ text: string; x: number }> = []
  for (let i = 0; i < points.length; i += step) {
    const pt = points[i]
    if (!pt) continue
    const x = PAD_L + (i / (points.length - 1 || 1)) * PLOT_W
    labels.push({ text: pt.timestamp.split(' ')[0], x })
  }
  const last = points[points.length - 1]
  if (last && (labels.length === 0 || labels[labels.length - 1].text !== last.timestamp.split(' ')[0])) {
    labels.push({ text: last.timestamp.split(' ')[0], x: PAD_L + PLOT_W })
  }
  return labels
})

function onSvgMouseMove(e: MouseEvent) {
  const svgEl = e.currentTarget as SVGSVGElement
  const rect = svgEl.getBoundingClientRect()
  if (rect.width <= 0) return
  const scaleX = SVG_W / rect.width
  const mouseX = (e.clientX - rect.left) * scaleX
  const points = profileData.value?.trendPoints ?? []
  if (points.length === 0) return
  const stepX = PLOT_W / (points.length - 1 || 1)
  const index = Math.round((mouseX - PAD_L) / stepX)
  if (index >= 0 && index < points.length) {
    hoveredPoint.value = points[index]
    tooltipPos.value = { x: e.clientX, y: e.clientY - 10 }
  }
}

function onSvgMouseLeave() {
  hoveredPoint.value = null
  tooltipPos.value = null
}

onMounted(() => {
  refreshTimer = window.setInterval(() => {
    if (isAutoRefreshPaused.value) return
    if (countdown.value > 1) {
      countdown.value -= 1
      return
    }
    countdown.value = 30
    loadProfile(currentEmpCode.value, 'auto')
  }, 1000)
})

onBeforeUnmount(() => {
  if (refreshTimer !== null) {
    window.clearInterval(refreshTimer)
    refreshTimer = null
  }
  clearTrackedTimeouts()
  loadGeneration += 1
  inFlightReason = null
})
</script>

<template>
  <div
    class="employee-profile-page"
    :data-emp-code="profileData?.person.empCode || currentEmpCode"
    :data-history-start="profileData?.trendMetadata.startDate || ''"
    :data-history-end="profileData?.trendMetadata.endDate || ''"
    :data-history-points="profileData?.trendMetadata.totalPoints ?? 0"
    :data-history-interval="profileData?.trendMetadata.intervalHours ?? 0"
  >
    <header class="profile-topbar">
      <div class="scenario-pills">
        <span class="pills-label">测试场景切换：</span>
        <button
          v-for="sc in PROFILE_SCENARIOS"
          :key="sc.key"
          type="button"
          class="scenario-pill"
          :class="{ active: selectedScenario === sc.key, [sc.badgeType]: true }"
          @click="onScenarioChange(sc.key)"
        >
          {{ sc.label }}
        </button>
      </div>

      <div class="topbar-actions">
        <div class="nav-people-group">
          <el-button-group size="small" class="f15-btn-group">
            <el-button :icon="ArrowLeft" @click="goToPrevPerson">上一人</el-button>
            <el-button @click="goToNextPerson">
              下一人 <el-icon class="el-icon--right"><ArrowRight /></el-icon>
            </el-button>
          </el-button-group>

          <div class="search-input-wrap">
            <el-autocomplete
              v-model="searchQuery"
              size="small"
              placeholder="搜索工号/姓名"
              clearable
              :prefix-icon="Search"
              :fetch-suggestions="querySearch"
              :popper-class="F15_AUTOCOMPLETE_POPPER"
              value-key="value"
              @select="handleSearchSelect"
              @keyup.enter="handleSearch(searchQuery)"
            />
          </div>
        </div>

        <div class="refresh-controls">
          <el-button
            size="small"
            type="primary"
            plain
            :loading="isRefreshing"
            :icon="Refresh"
            @click="handleManualRefresh"
          >
            刷新
          </el-button>
          <span class="countdown-tag" :class="{ paused: isAutoRefreshPaused }" @click="toggleAutoRefresh">
            <el-icon v-if="!isAutoRefreshPaused"><VideoPause /></el-icon>
            <el-icon v-else><VideoPlay /></el-icon>
            {{ isAutoRefreshPaused ? '自动刷新已暂停' : `${countdown}s 后自动刷新` }}
          </span>
        </div>

        <button class="immersive-body-btn" type="button" @click="goToImmersiveBody">
          <el-icon class="pulse-icon"><FullScreen /></el-icon>
          <span>进入沉浸人体</span>
        </button>
      </div>
    </header>

    <div v-if="refreshErrorMessage" class="notice-banner error-banner">
      <el-icon><WarningFilled /></el-icon>
      <span>{{ refreshErrorMessage }}</span>
      <span class="banner-sub">上次缓存数据采集于 {{ lastRefreshTime }}</span>
    </div>

    <main v-if="profileData" class="profile-main-container">
      <div v-if="profileData.isNotFound" class="not-found-card">
        <el-icon class="empty-icon"><InfoFilled /></el-icon>
        <h2>未找到该职工健康档案</h2>
        <p>工号或姓名「{{ currentEmpCode }}」在系统中无匹配记录。系统未默认显示其他人以保证医疗数据严肃性。</p>
        <div class="not-found-actions">
          <el-button type="primary" @click="onScenarioChange('normal')">返回首位人员 (张伟)</el-button>
          <el-button @click="onScenarioChange('anomaly')">查看异常样本 (演示职工甲)</el-button>
        </div>
      </div>

      <template v-else>
        <section class="identity-strip">
          <div class="avatar-box" :class="`risk-${profileData.person.currentRisk}`">
            <el-icon><User /></el-icon>
          </div>

          <div class="identity-info">
            <div class="primary-row">
              <h1 class="worker-name">{{ profileData.person.empName }}</h1>
              <span class="emp-code-badge">工号: {{ profileData.person.empCode }}</span>
              <span class="status-chip" :class="`emp-${profileData.person.employmentStatus}`">
                {{ EMPLOYMENT_LABELS[profileData.person.employmentStatus] }}
              </span>
              <span class="status-chip" :class="`ind-${profileData.overallStatus}`">
                综合体征：{{ INDICATOR_STATE_LABELS[profileData.overallStatus] }}
              </span>
            </div>

            <div class="secondary-row">
              <span class="meta-item">部门：<strong>{{ profileData.person.departmentName }}</strong></span>
              <span class="divider">|</span>
              <span class="meta-item">工种：<strong>{{ profileData.person.jobName }}</strong></span>
              <span class="divider">|</span>
              <span class="meta-item device-meta">
                绑定设备：
                <span :class="{ 'text-muted': !profileData.deviceInfo.isBound }">
                  {{ profileData.deviceInfo.modelName }}
                  <template v-if="profileData.deviceInfo.imei"> (IMEI: {{ profileData.deviceInfo.imei }})</template>
                </span>
              </span>
              <span class="divider">|</span>
              <span class="meta-item">
                通信状态：
                <el-badge
                  is-dot
                  :type="profileData.deviceInfo.onlineStatus === 'online' ? 'success' : 'info'"
                  class="online-dot"
                />
                {{ profileData.deviceInfo.onlineStatus === 'online' ? '在线' : '离线' }}
              </span>
              <span class="divider">|</span>
              <span class="meta-item">
                设备电量：
                <span
                  :data-battery="profileData.deviceInfo.batteryPercent === null ? 'unknown' : String(profileData.deviceInfo.batteryPercent)"
                >{{ profileData.deviceInfo.batteryDisplay }}</span>
              </span>
              <span class="divider">|</span>
              <span class="meta-item location-meta">
                位置来源：
                <el-tooltip :content="profileData.locationSource.note" placement="top" :popper-class="F15_POPPER">
                  <span class="location-tag not-connected">
                    <el-icon><MapLocation /></el-icon>
                    {{ profileData.locationSource.text }}
                  </span>
                </el-tooltip>
              </span>
            </div>
          </div>

          <div class="identity-meta-right">
            <div class="sync-time-box">
              <span class="time-label">数据刷新时间</span>
              <span class="time-val">{{ lastRefreshTime }}</span>
            </div>
          </div>
        </section>

        <section class="vitals-grid">
          <div
            v-for="key in METRIC_KEYS"
            :key="key"
            class="vital-card"
            :class="{ active: selectedMetric === key, [profileData.indicators[key].state]: true }"
            @click="selectMetric(key)"
          >
            <div class="card-header">
              <span class="metric-title">{{ METRIC_LABELS[key] }}</span>
              <span class="state-badge" :class="profileData.indicators[key].state">
                {{ profileData.indicators[key].stateLabel }}
              </span>
            </div>
            <div class="card-body">
              <div class="readout-box">
                <span class="numeric-value">
                  {{ profileData.indicators[key].value !== null ? profileData.indicators[key].value : '--' }}
                </span>
                <span class="unit">{{ profileData.indicators[key].unit }}</span>
              </div>
              <div class="time-row">
                <el-icon><Clock /></el-icon>
                <span>
                  {{
                    profileData.indicators[key].measuredAt
                      ? formatClockTime(profileData.indicators[key].measuredAt)
                      : '无采集记录'
                  }}
                </span>
                <span v-if="profileData.indicators[key].state === 'stale'" class="stale-warn">(已过新鲜窗口)</span>
              </div>
              <div class="threshold-note">
                <span v-if="profileData.indicators[key].reason" class="reason-text">{{ profileData.indicators[key].reason }}</span>
                <span v-else class="range-hint">
                  演示正常区间: {{ METRIC_CONFIGS[key].normalMin }}~{{ METRIC_CONFIGS[key].normalMax }} {{ METRIC_CONFIGS[key].unit }}
                </span>
              </div>
            </div>
            <div class="click-hint">点击聚焦趋势图</div>
          </div>
        </section>

        <div class="profile-content-split">
          <div class="left-panel">
            <section class="panel-card trend-section">
              <div class="section-header">
                <div class="header-left">
                  <h3 class="section-title">生理趋势分析</h3>
                  <div class="metric-tabs">
                    <button
                      v-for="key in METRIC_KEYS"
                      :key="key"
                      type="button"
                      class="metric-tab"
                      :class="{ active: selectedMetric === key }"
                      @click="selectMetric(key)"
                    >
                      {{ METRIC_LABELS[key] }}
                    </button>
                  </div>
                </div>

                <div class="header-right">
                  <el-radio-group
                    :model-value="historyRange === 'custom' ? '' : historyRange"
                    size="small"
                    class="range-radios"
                    @change="onRangePresetChange"
                  >
                    <el-radio-button value="7d">近7天</el-radio-button>
                    <el-radio-button value="14d">近14天</el-radio-button>
                    <el-radio-button value="30d">近30天</el-radio-button>
                  </el-radio-group>
                  <el-date-picker
                    v-model="draftDateRange"
                    class="history-dates"
                    type="daterange"
                    size="small"
                    unlink-panels
                    placement="bottom-start"
                    range-separator="至"
                    start-placeholder="开始日期"
                    end-placeholder="结束日期"
                    value-format="YYYY-MM-DD"
                    :disabled-date="disabledHistoryDate"
                    :popper-class="F15_DATE_POPPER"
                    @change="onDraftDateChange"
                  />
                  <el-button size="small" type="primary" class="history-query-btn" @click="queryHistory">查询</el-button>
                </div>
              </div>

              <div class="trend-meta-bar">
                <span class="meta-tag">
                  样本统计：<strong data-valid-points>{{ profileData.trendMetadata.validPoints }}</strong> 演示点 (有效) /
                  <strong>{{ profileData.trendMetadata.missingPoints }}</strong> 中断
                </span>
                <span class="meta-tag">点间隔：{{ profileData.trendMetadata.samplingInterval }}</span>
                <span class="meta-tag">生成方式：{{ profileData.trendMetadata.aggregationMethod }}</span>
                <span class="meta-tag">时间区间：{{ profileData.trendMetadata.dateRangeLabel }}</span>
              </div>
              <p class="synthetic-note">{{ profileData.trendMetadata.syntheticNote }}</p>

              <div class="chart-container">
                <div v-if="profileData.trendPoints.length === 0" class="empty-chart-state">
                  <el-icon class="empty-icon"><InfoFilled /></el-icon>
                  <p>该职工在指定时间范围内无历史体征采样点（设备未上报或未绑定）</p>
                </div>
                <div v-else class="svg-wrap">
                  <svg
                    :viewBox="`0 0 ${SVG_W} ${SVG_H}`"
                    class="trend-svg"
                    preserveAspectRatio="none"
                    @mousemove="onSvgMouseMove"
                    @mouseleave="onSvgMouseLeave"
                  >
                    <defs>
                      <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" :stop-color="currentMetricConfig.color" stop-opacity="0.25" />
                        <stop offset="100%" :stop-color="currentMetricConfig.color" stop-opacity="0.0" />
                      </linearGradient>
                      <pattern id="missingPattern" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                        <line x1="0" y1="0" x2="0" y2="8" stroke="rgba(245, 158, 11, 0.3)" stroke-width="2" />
                      </pattern>
                    </defs>
                    <g class="grid-lines">
                      <line
                        v-for="tick in yTicks"
                        :key="tick.val"
                        :x1="PAD_L"
                        :y1="tick.y"
                        :x2="PAD_L + PLOT_W"
                        :y2="tick.y"
                        stroke="rgba(255, 255, 255, 0.08)"
                        stroke-dasharray="2 3"
                      />
                      <text
                        v-for="tick in yTicks"
                        :key="`t-${tick.val}`"
                        :x="PAD_L - 8"
                        :y="tick.y + 4"
                        fill="#8fa7c3"
                        font-size="10"
                        font-family="var(--font-mono)"
                        text-anchor="end"
                      >
                        {{ tick.val }}
                      </text>
                    </g>
                    <rect :x="PAD_L" :y="normalBandY" :width="PLOT_W" :height="normalBandHeight" fill="rgba(34, 197, 94, 0.07)" />
                    <line :x1="PAD_L" :y1="normalBandY" :x2="PAD_L + PLOT_W" :y2="normalBandY" stroke="rgba(34, 197, 94, 0.35)" stroke-dasharray="3 3" />
                    <line :x1="PAD_L" :y1="normalBandY + normalBandHeight" :x2="PAD_L + PLOT_W" :y2="normalBandY + normalBandHeight" stroke="rgba(34, 197, 94, 0.35)" stroke-dasharray="3 3" />
                    <text :x="PAD_L + PLOT_W - 6" :y="normalBandY + 12" fill="rgba(34, 197, 94, 0.75)" font-size="9" text-anchor="end">
                      正常参考区间 ({{ currentMetricConfig.normalMin }}~{{ currentMetricConfig.normalMax }} {{ currentMetricConfig.unit }})
                    </text>
                    <g v-for="(span, sIdx) in trendRenderData.missingSpans" :key="`miss-${sIdx}`">
                      <rect :x="span.startX" :y="PAD_T" :width="Math.max(4, span.endX - span.startX)" :height="PLOT_H" fill="url(#missingPattern)" />
                      <text :x="(span.startX + span.endX) / 2" :y="PAD_T + PLOT_H / 2" fill="#f59e0b" font-size="10" text-anchor="middle">
                        [信号中断/未佩戴]
                      </text>
                    </g>
                    <path :d="trendRenderData.pathD" fill="none" :stroke="currentMetricConfig.color" stroke-width="2" stroke-linejoin="round" />
                    <circle
                      v-for="(c, cIdx) in trendRenderData.circles"
                      :key="`c-${cIdx}`"
                      :cx="c.x"
                      :cy="c.y"
                      :r="c.isAlert ? 3.5 : 2"
                      :fill="c.isAlert ? '#ef4444' : currentMetricConfig.color"
                      stroke="#0d1929"
                      stroke-width="1"
                    />
                    <g class="x-axis-labels">
                      <text
                        v-for="(lbl, lIdx) in xLabels"
                        :key="`x-${lIdx}`"
                        :x="lbl.x"
                        :y="PAD_T + PLOT_H + 18"
                        fill="#8fa7c3"
                        font-size="10"
                        font-family="var(--font-mono)"
                        text-anchor="middle"
                      >
                        {{ lbl.text }}
                      </text>
                    </g>
                  </svg>
                  <div
                    v-if="hoveredPoint && tooltipPos"
                    class="trend-tooltip"
                    :style="{ left: `${tooltipPos.x + 12}px`, top: `${tooltipPos.y}px` }"
                  >
                    <div class="tt-time">{{ hoveredPoint.fullTime }}</div>
                    <div class="tt-flag">演示合成点</div>
                    <div v-if="hoveredPoint.isMissing" class="tt-val warning">数据中断：{{ hoveredPoint.missingReason }}</div>
                    <div v-else class="tt-val">
                      <span class="tt-label">{{ currentMetricConfig.label }}：</span>
                      <strong :style="{ color: currentMetricConfig.color }">
                        {{
                          currentMetricConfig.key === 'bloodPressure'
                            ? `${hoveredPoint.systolic}/${hoveredPoint.diastolic}`
                            : hoveredPoint[currentMetricConfig.key as keyof HistoryTrendPoint]
                        }}
                      </strong>
                      <span class="tt-unit">{{ currentMetricConfig.unit }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section class="panel-card activity-section">
              <h3 class="section-title">今日活动与穿戴工况</h3>
              <div v-if="!profileData.todayActivity.dataAvailable" class="empty-activity">
                <el-icon><InfoFilled /></el-icon>
                <span>该职工未绑定穿戴设备，暂无步数、佩戴时长与活动工况数据。</span>
              </div>
              <div v-else class="activity-grid">
                <div class="activity-metric-box">
                  <span class="act-label">今日步数</span>
                  <span class="act-val">{{ profileData.todayActivity.steps?.toLocaleString() ?? '--' }}</span>
                  <span class="act-unit">步</span>
                </div>
                <div class="activity-metric-box">
                  <span class="act-label">有效佩戴时长</span>
                  <span class="act-val">
                    {{ profileData.todayActivity.wearingMinutes ? (profileData.todayActivity.wearingMinutes / 60).toFixed(1) : '--' }}
                  </span>
                  <span class="act-unit">小时</span>
                </div>
                <div class="activity-metric-box">
                  <span class="act-label">工况状态</span>
                  <span class="act-status-tag">{{ profileData.todayActivity.activeStateLabel }}</span>
                </div>
                <div class="activity-metric-box">
                  <span class="act-label">手环电量 / 信号</span>
                  <span class="act-telemetry">
                    <span
                      class="battery-tag"
                      :data-battery="profileData.todayActivity.batteryKnown ? String(profileData.todayActivity.battery) : 'unknown'"
                    >{{ profileData.todayActivity.batteryDisplay }}</span>
                    <span class="signal-tag">{{ profileData.todayActivity.signal }}</span>
                  </span>
                </div>
              </div>
              <p class="activity-note">{{ profileData.todayActivity.activityNote }}</p>
            </section>
          </div>

          <div class="right-panel">
            <section class="panel-card warnings-section">
              <div class="section-header">
                <h3 class="section-title">近 30 日预警轨迹</h3>
                <span class="count-badge">{{ profileData.warningTrajectory.length }} 条记录</span>
              </div>
              <div v-if="profileData.warningTrajectory.length === 0" class="empty-warnings">
                <el-icon><CircleCheck class="text-success" /></el-icon>
                <p>近 30 日内各项体征平稳，无超限预警记录</p>
              </div>
              <div v-else class="warning-timeline">
                <div
                  v-for="item in profileData.warningTrajectory"
                  :key="item.id"
                  class="timeline-card"
                  :class="`sev-${item.severity}`"
                >
                  <div class="tl-header">
                    <span class="tl-source-badge">{{ item.sourceLabel }}</span>
                    <span class="tl-severity-badge" :class="item.severity">{{ item.severityLabel }}</span>
                    <span class="tl-time">{{ item.occurredAt }}</span>
                  </div>
                  <div class="tl-body">
                    <div class="tl-event-name">{{ item.eventName }}</div>
                    <div class="tl-evidence">{{ item.evidenceText }}</div>
                  </div>
                  <div class="tl-footer">
                    <span class="tl-handling-tag" :class="item.handlingState">{{ item.handlingStateLabel }}</span>
                    <el-button
                      v-if="item.relatedIncidentId"
                      size="small"
                      type="primary"
                      plain
                      @click="openIncidentDrawer(item.relatedIncidentId)"
                    >
                      处置工单 (C01)
                    </el-button>
                    <span v-else class="no-incident-hint">历史归档预警</span>
                  </div>
                </div>
              </div>
            </section>

            <section class="panel-card actions-section">
              <h3 class="section-title">应急联络与设备指令</h3>
              <div class="action-group">
                <span class="group-title">应急联络</span>
                <div class="btn-grid">
                  <el-button :icon="Phone" @click="handleVoiceCall">语音呼叫</el-button>
                  <el-button :icon="ChatDotRound" @click="handleSendMessage">发送提示短信</el-button>
                </div>
                <div class="action-caption">提示：通信与短信通道均未接入，点击后不会执行。</div>
              </div>
              <div class="action-group">
                <span class="group-title">设备远程指令</span>
                <div class="btn-grid">
                  <el-button :icon="Connection" :disabled="!profileData.deviceInfo.isBound" @click="handleDeviceVibrate">
                    手环震动提醒
                  </el-button>
                  <el-button :icon="Cpu" :disabled="!profileData.deviceInfo.isBound" @click="handleAdjustReporting">
                    调整上报频次
                  </el-button>
                </div>
                <div v-if="!profileData.deviceInfo.isBound" class="unbound-warning">* 职工未绑定手表，设备下发按钮已禁用。</div>
                <div v-else class="action-caption">设备指令通道未接入，不会生成或下发报文与策略。</div>
              </div>
              <div class="action-group">
                <span class="group-title">矿山地理态势</span>
                <el-button class="gis-btn" :icon="MapLocation" @click="handleMineGisLocation">
                  井下地图定位（未接入）
                </el-button>
              </div>
            </section>
          </div>
        </div>
      </template>
    </main>

    <IncidentDetailDrawer @changed="loadProfile(currentEmpCode, 'incident')" />
  </div>
</template>

<style scoped>
.employee-profile-page {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  min-width: 0;
  width: 100%;
  max-width: 100%;
  overflow-x: hidden;
  padding: 16px 20px 32px;
  background: var(--bg-root);
  color: var(--text-primary);
  font-family: var(--font);
}

.profile-topbar,
.identity-strip,
.panel-card,
.left-panel,
.right-panel,
.profile-main-container,
.profile-content-split,
.header-right,
.header-left,
.topbar-actions,
.nav-people-group {
  min-width: 0;
}

.profile-topbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  margin-bottom: 12px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius);
}

.scenario-pills {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.pills-label {
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 600;
}

.scenario-pill {
  padding: 3px 10px;
  font-size: 11px;
  color: var(--text-secondary);
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  cursor: pointer;
}

.scenario-pill:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-strong);
}

.scenario-pill.active {
  font-weight: 700;
  border-color: currentColor;
}

.scenario-pill.success.active { color: #34d399; background: rgba(52, 211, 153, 0.15); }
.scenario-pill.danger.active { color: #f87171; background: rgba(248, 113, 113, 0.15); }
.scenario-pill.warning.active { color: #fbbf24; background: rgba(251, 191, 36, 0.15); }
.scenario-pill.info.active { color: #94a3b8; background: rgba(148, 163, 184, 0.15); }

.topbar-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}

.nav-people-group,
.refresh-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.search-input-wrap {
  width: 180px;
  min-width: 0;
  max-width: 100%;
}

.countdown-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--text-muted);
  font-family: var(--font-mono);
  cursor: pointer;
  padding: 3px 8px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.03);
}

.countdown-tag.paused { color: #fbbf24; }

.immersive-body-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 14px;
  background: linear-gradient(135deg, rgba(56, 189, 248, 0.25), rgba(59, 130, 246, 0.35));
  border: 1px solid var(--accent);
  border-radius: var(--radius);
  color: #e0f2fe;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 0 12px rgba(56, 189, 248, 0.2);
}

.immersive-body-btn:hover {
  background: linear-gradient(135deg, rgba(56, 189, 248, 0.4), rgba(59, 130, 246, 0.5));
}

.notice-banner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  margin-bottom: 12px;
  border-radius: 6px;
  font-size: 12px;
}

.error-banner {
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: #fca5a5;
}

.banner-sub {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-muted);
  font-family: var(--font-mono);
}

.not-found-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  background: var(--bg-elevated);
  border: 1px dashed var(--border-soft);
  border-radius: var(--radius);
  text-align: center;
}

.not-found-card .empty-icon { font-size: 48px; color: var(--text-muted); margin-bottom: 16px; }
.not-found-card h2 { margin: 0 0 8px; font-size: 18px; color: var(--text-strong); }
.not-found-card p { margin: 0 0 20px; font-size: 13px; color: var(--text-secondary); max-width: 480px; }

.identity-strip {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 18px;
  margin-bottom: 14px;
  background: var(--bg-surface);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius);
}

.avatar-box {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: rgba(14, 165, 233, 0.15);
  color: var(--accent);
  font-size: 24px;
  border: 2px solid var(--border-soft);
  flex-shrink: 0;
}

.avatar-box.risk-critical { border-color: #ef4444; color: #ef4444; background: rgba(239, 68, 68, 0.15); }
.avatar-box.risk-attention { border-color: #f59e0b; color: #f59e0b; background: rgba(245, 158, 11, 0.15); }

.identity-info { flex: 1; min-width: 0; }

.primary-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 4px;
}

.worker-name {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--text-strong);
}

.emp-code-badge {
  font-size: 12px;
  font-family: var(--font-mono);
  color: var(--accent);
  background: rgba(56, 189, 248, 0.1);
  padding: 1px 6px;
  border-radius: 4px;
}

.status-chip {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  border: 1px solid transparent;
}

.status-chip.emp-active,
.status-chip.ind-normal {
  background: rgba(34, 197, 94, 0.12);
  color: #4ade80;
  border-color: rgba(34, 197, 94, 0.28);
}

.status-chip.emp-leave,
.status-chip.ind-stale {
  background: rgba(245, 158, 11, 0.12);
  color: #fbbf24;
  border-color: rgba(245, 158, 11, 0.28);
}

.status-chip.emp-resigned,
.status-chip.ind-no_data {
  background: rgba(100, 116, 139, 0.14);
  color: #94a3b8;
  border-color: rgba(100, 116, 139, 0.28);
}

.status-chip.ind-warning {
  background: rgba(239, 68, 68, 0.12);
  color: #f87171;
  border-color: rgba(239, 68, 68, 0.28);
}

.secondary-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-secondary);
}

.secondary-row strong { color: var(--text-primary); }
.divider { color: rgba(255, 255, 255, 0.15); }
.device-meta { overflow-wrap: anywhere; }
.text-muted { color: var(--text-muted); }

.location-tag.not-connected {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #fbbf24;
  background: rgba(251, 191, 36, 0.1);
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11px;
}

.identity-meta-right { text-align: right; flex-shrink: 0; }
.sync-time-box { display: flex; flex-direction: column; }
.time-label { font-size: 11px; color: var(--text-muted); }
.time-val { font-size: 13px; font-family: var(--font-mono); color: var(--text-primary); }

.vitals-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.vital-card {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 12px 14px;
  background: var(--bg-surface);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius);
  cursor: pointer;
}

.vital-card:hover { border-color: var(--border-interactive); }
.vital-card.active { border-color: var(--accent); box-shadow: 0 0 10px rgba(56, 189, 248, 0.2); }

.card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; gap: 8px; }
.metric-title { font-size: 12px; font-weight: 600; color: var(--text-secondary); }
.state-badge { font-size: 10px; padding: 1px 6px; border-radius: 4px; font-weight: 600; }
.state-badge.normal { background: rgba(34, 197, 94, 0.15); color: #34d399; }
.state-badge.warning { background: rgba(239, 68, 68, 0.15); color: #f87171; }
.state-badge.stale { background: rgba(245, 158, 11, 0.15); color: #fbbf24; }
.state-badge.no_data { background: rgba(148, 163, 184, 0.15); color: #94a3b8; }

.readout-box { display: flex; align-items: baseline; gap: 4px; margin-bottom: 4px; }
.numeric-value { font-size: 24px; font-weight: 700; font-family: var(--font-mono); color: var(--text-strong); overflow-wrap: anywhere; }
.unit { font-size: 11px; color: var(--text-muted); }
.time-row { display: flex; align-items: center; gap: 4px; font-size: 11px; color: var(--text-muted); font-family: var(--font-mono); margin-bottom: 4px; }
.stale-warn { color: #fbbf24; font-size: 10px; }
.threshold-note { font-size: 10px; line-height: 1.3; min-height: 26px; color: var(--text-secondary); }
.reason-text { color: #f87171; }
.range-hint { color: var(--text-muted); }
.click-hint { margin-top: 4px; font-size: 9px; color: rgba(56, 189, 248, 0.6); text-align: right; }

.profile-content-split {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 380px);
  gap: 16px;
}

.panel-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius);
  padding: 14px 16px;
  margin-bottom: 16px;
  overflow: hidden;
}

.section-title { margin: 0; font-size: 14px; font-weight: 700; color: var(--text-strong); }
.section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; gap: 12px; flex-wrap: wrap; }
.header-left { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.header-right { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; max-width: 100%; }

.metric-tabs { display: flex; flex-wrap: wrap; gap: 4px; }
.metric-tab {
  padding: 2px 8px;
  font-size: 11px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-secondary);
  border: 1px solid rgba(255, 255, 255, 0.08);
  cursor: pointer;
}
.metric-tab.active {
  background: rgba(56, 189, 248, 0.15);
  color: var(--accent);
  border-color: var(--accent);
  font-weight: 600;
}

.range-radios { flex: 0 1 auto; }
.history-dates { width: 240px; max-width: 100%; }
.history-query-btn { flex-shrink: 0; }
.employee-profile-page :deep(.el-date-editor--daterange) {
  width: 240px;
  max-width: 100%;
  min-width: 0;
}

.trend-meta-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  padding: 6px 10px;
  margin-bottom: 6px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
  font-size: 11px;
  color: var(--text-secondary);
}
.trend-meta-bar strong { color: var(--text-strong); }
.synthetic-note { margin: 0 0 10px; font-size: 11px; color: #fbbf24; }

.chart-container {
  position: relative;
  width: 100%;
  max-width: 100%;
  height: 220px;
  background: rgba(0, 0, 0, 0.25);
  border-radius: 6px;
  overflow: hidden;
}
.svg-wrap, .trend-svg { width: 100%; height: 100%; display: block; }
.empty-chart-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-muted);
  font-size: 12px;
  gap: 8px;
  padding: 12px;
  text-align: center;
}
.empty-chart-state .empty-icon { font-size: 28px; }

.trend-tooltip {
  position: fixed;
  z-index: 100;
  padding: 6px 10px;
  background: rgba(13, 28, 47, 0.95);
  border: 1px solid var(--border-interactive);
  border-radius: 4px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
  pointer-events: none;
  font-size: 11px;
}
.tt-time { color: var(--text-muted); font-family: var(--font-mono); margin-bottom: 2px; }
.tt-flag { color: #fbbf24; font-size: 10px; margin-bottom: 2px; }
.tt-val { color: var(--text-primary); }
.tt-val.warning { color: #fbbf24; }

.empty-activity { display: flex; align-items: center; gap: 8px; padding: 16px 0; color: var(--text-muted); font-size: 12px; }
.activity-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-top: 8px; }
.activity-metric-box { display: flex; flex-direction: column; min-width: 0; padding: 10px; background: rgba(0, 0, 0, 0.2); border-radius: 6px; }
.act-label { font-size: 11px; color: var(--text-muted); margin-bottom: 4px; }
.act-val { font-size: 18px; font-weight: 700; font-family: var(--font-mono); color: var(--text-strong); }
.act-unit { font-size: 10px; color: var(--text-muted); }
.act-status-tag { font-size: 12px; color: #34d399; font-weight: 600; }
.act-telemetry { display: flex; gap: 6px; font-size: 11px; font-family: var(--font-mono); }
.battery-tag { color: #38bdf8; }
.signal-tag { color: #34d399; }
.activity-note { margin: 8px 0 0; font-size: 11px; color: var(--text-muted); }

.count-badge { font-size: 11px; color: var(--text-muted); background: rgba(255, 255, 255, 0.05); padding: 2px 6px; border-radius: 4px; }
.empty-warnings { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 30px 0; color: var(--text-secondary); font-size: 12px; }
.warning-timeline { display: flex; flex-direction: column; gap: 8px; max-height: 380px; overflow-y: auto; }
.timeline-card { padding: 10px 12px; background: rgba(0, 0, 0, 0.2); border-left: 3px solid #94a3b8; border-radius: 4px; }
.timeline-card.sev-critical { border-left-color: #ef4444; }
.timeline-card.sev-warning { border-left-color: #f59e0b; }
.tl-header { display: flex; align-items: center; gap: 8px; font-size: 11px; margin-bottom: 4px; flex-wrap: wrap; }
.tl-source-badge { color: var(--text-secondary); }
.tl-severity-badge { font-weight: 700; }
.tl-severity-badge.critical { color: #ef4444; }
.tl-severity-badge.warning { color: #f59e0b; }
.tl-time { margin-left: auto; color: var(--text-muted); font-family: var(--font-mono); font-size: 10px; }
.tl-event-name { font-size: 13px; font-weight: 600; color: var(--text-strong); margin-bottom: 2px; }
.tl-evidence { font-size: 11px; color: var(--text-secondary); margin-bottom: 6px; }
.tl-footer { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }

.tl-handling-tag {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 3px;
}
.tl-handling-tag.new { background: rgba(239, 68, 68, 0.15); color: #f87171; }
.tl-handling-tag.confirmed,
.tl-handling-tag.assigned { background: rgba(245, 158, 11, 0.12); color: #fbbf24; }
.tl-handling-tag.processing { background: rgba(56, 189, 248, 0.12); color: #38bdf8; }
.tl-handling-tag.completed { background: rgba(34, 197, 94, 0.15); color: #34d399; }
.tl-handling-tag.closed,
.tl-handling-tag.false_alarm,
.tl-handling-tag.archive_done { background: rgba(100, 116, 139, 0.14); color: #94a3b8; }
.tl-handling-tag.archive_open { background: rgba(239, 68, 68, 0.12); color: #fca5a5; }
.no-incident-hint { font-size: 10px; color: var(--text-muted); }

.action-group { margin-top: 12px; }
.group-title { display: block; font-size: 11px; color: var(--text-muted); margin-bottom: 6px; }
.btn-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 8px; }
.action-caption { font-size: 10px; color: var(--text-muted); margin-top: 4px; }
.unbound-warning { font-size: 10px; color: #fbbf24; margin-top: 4px; }
.gis-btn { width: 100%; }

.employee-profile-page :deep(.el-input__wrapper),
.employee-profile-page :deep(.el-select__wrapper),
.employee-profile-page :deep(.el-range-editor.el-input__wrapper) {
  background-color: rgba(9, 12, 16, 0.7) !important;
  box-shadow: 0 0 0 1px var(--border-subtle) inset !important;
  border-radius: 6px;
}

.employee-profile-page :deep(.el-input__wrapper.is-focus),
.employee-profile-page :deep(.el-select__wrapper.is-focused),
.employee-profile-page :deep(.el-range-editor.is-active) {
  box-shadow: 0 0 0 1px var(--signal-cyan) inset !important;
}

.employee-profile-page :deep(.el-input__inner),
.employee-profile-page :deep(.el-range-input) {
  color: var(--text-strong);
  font-size: 13px;
}

.employee-profile-page :deep(.el-range-separator),
.employee-profile-page :deep(.el-input__prefix),
.employee-profile-page :deep(.el-input__suffix) {
  color: var(--text-muted);
}

.employee-profile-page :deep(.el-button) {
  --el-button-bg-color: rgba(255, 255, 255, 0.04);
  --el-button-text-color: var(--text-primary);
  --el-button-border-color: var(--border-subtle);
  --el-button-hover-bg-color: rgba(255, 255, 255, 0.09);
  --el-button-hover-text-color: var(--text-strong);
  --el-button-hover-border-color: rgba(255, 255, 255, 0.2);
  --el-button-active-bg-color: rgba(255, 255, 255, 0.12);
  --el-button-disabled-bg-color: rgba(255, 255, 255, 0.03);
  --el-button-disabled-text-color: var(--text-muted);
  --el-button-disabled-border-color: var(--border-dim);
  --el-button-disabled-opacity: 0.55;
}

.employee-profile-page :deep(.el-button.is-disabled),
.employee-profile-page :deep(.el-button.is-loading) {
  opacity: 0.55;
}

.employee-profile-page :deep(.el-button--primary) {
  --el-button-bg-color: rgba(56, 189, 248, 0.22);
  --el-button-text-color: #fff;
  --el-button-border-color: var(--border-interactive);
  --el-button-hover-bg-color: rgba(56, 189, 248, 0.32);
  --el-button-hover-text-color: #fff;
  --el-button-hover-border-color: var(--signal-cyan);
  --el-button-active-bg-color: rgba(56, 189, 248, 0.4);
}

.employee-profile-page :deep(.el-button--primary.is-plain) {
  --el-button-bg-color: rgba(56, 189, 248, 0.08);
  --el-button-text-color: var(--signal-cyan);
  --el-button-border-color: var(--border-interactive);
  --el-button-hover-bg-color: rgba(56, 189, 248, 0.18);
  --el-button-hover-text-color: #fff;
}

.employee-profile-page :deep(.el-radio-button__inner) {
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-secondary);
  border-color: var(--border-subtle);
  box-shadow: none;
}

.employee-profile-page :deep(.el-radio-button__original-radio:checked + .el-radio-button__inner) {
  background: rgba(56, 189, 248, 0.2);
  color: #fff;
  border-color: var(--signal-cyan);
  box-shadow: none;
}

.employee-profile-page :deep(.el-radio-button__inner:hover) {
  color: var(--text-strong);
}

.employee-profile-page :deep(.el-radio-group) {
  display: inline-flex;
  flex-wrap: wrap;
}

.employee-profile-page :deep(.el-badge__content.is-dot) {
  border-color: transparent;
}

@media (max-width: 1280px) {
  .vitals-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .profile-content-split { grid-template-columns: minmax(0, 1fr); }
}

@media (max-width: 768px) {
  .employee-profile-page { padding: 12px 12px 24px; }
  .identity-strip { flex-direction: column; align-items: flex-start; gap: 12px; }
  .identity-info { width: 100%; }
  .identity-meta-right { text-align: left; width: 100%; padding-top: 4px; border-top: 1px solid rgba(255, 255, 255, 0.06); }
  .vitals-grid { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
  .profile-topbar { flex-direction: column; align-items: stretch; }
  .search-input-wrap { flex: 1; min-width: 120px; width: auto; }
  .activity-grid { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
  .section-header { flex-direction: column; align-items: stretch; }
  .header-right { width: 100%; }
  .history-dates { width: 100%; }
  .employee-profile-page :deep(.el-date-editor--daterange) { width: 100%; }
  .history-query-btn { width: auto; }
}

@media (max-width: 480px) {
  .vitals-grid { grid-template-columns: minmax(0, 1fr); }
  .btn-grid { grid-template-columns: minmax(0, 1fr); }
  .header-right { flex-direction: column; align-items: stretch; }
  .range-radios { width: 100%; }
  .employee-profile-page :deep(.el-radio-button) { flex: 1 1 30%; }
  .employee-profile-page :deep(.el-radio-button__inner) { width: 100%; }
  .history-query-btn { width: 100%; }
}
</style>

<style>
.f15-popper.el-popper {
  background: #0d1117 !important;
  border: 1px solid rgba(56, 189, 248, 0.35) !important;
  color: #d8e5f5 !important;
}

.f15-popper.el-popper .el-popper__arrow::before {
  background: #0d1117 !important;
  border: 1px solid rgba(56, 189, 248, 0.35) !important;
}

.f15-autocomplete-popper.el-popper,
.f15-autocomplete-popper.el-autocomplete-suggestion {
  background: #0d1117 !important;
  border: 1px solid rgba(148, 163, 184, 0.16) !important;
}

.f15-autocomplete-popper .el-autocomplete-suggestion__wrap,
.f15-autocomplete-popper .el-autocomplete-suggestion__list {
  background: #0d1117;
  color: #d8e5f5;
}

.f15-autocomplete-popper li {
  color: #d8e5f5 !important;
}

.f15-autocomplete-popper li.highlighted,
.f15-autocomplete-popper li:hover {
  background: rgba(56, 189, 248, 0.16) !important;
  color: #f3f8ff !important;
}

.f15-date-popper.el-picker__popper,
.f15-date-popper {
  --el-bg-color-overlay: #0d1117;
  --el-bg-color: #0d1117;
  --el-fill-color-blank: #0d1117;
  --el-fill-color-light: rgba(56, 189, 248, 0.12);
  --el-text-color-regular: #d8e5f5;
  --el-text-color-primary: #f3f8ff;
  --el-text-color-placeholder: #5f7694;
  --el-border-color-lighter: rgba(148, 163, 184, 0.16);
  --el-datepicker-text-color: #d8e5f5;
  --el-datepicker-off-text-color: #5f7694;
  --el-datepicker-header-text-color: #d8e5f5;
  --el-datepicker-icon-color: #8fa7c3;
  --el-datepicker-inrange-bg-color: rgba(56, 189, 248, 0.14);
  --el-datepicker-inrange-hover-bg-color: rgba(56, 189, 248, 0.22);
  --el-datepicker-active-color: #38bdf8;
  --el-datepicker-hover-text-color: #38bdf8;
  background: transparent;
}

.f15-date-popper .el-picker-panel,
.f15-date-popper .el-date-range-picker,
.f15-date-popper .el-picker-panel__body,
.f15-date-popper .el-date-range-picker__content,
.f15-date-popper .el-date-table {
  background: #0d1117 !important;
  color: #d8e5f5;
  border-color: rgba(148, 163, 184, 0.16);
}

.f15-date-popper .el-date-range-picker__header,
.f15-date-popper .el-picker-panel__icon-btn,
.f15-date-popper .el-date-picker__header-label {
  color: #d8e5f5;
}

.f15-date-popper .el-picker-panel__icon-btn:hover,
.f15-date-popper .el-date-picker__header-label:hover {
  color: #38bdf8;
}

.f15-date-popper .el-date-table th {
  color: #8fa7c3;
  border-bottom-color: rgba(148, 163, 184, 0.16);
  background: transparent;
}

.f15-date-popper .el-date-table td,
.f15-date-popper .el-date-table td .el-date-table-cell {
  background: transparent !important;
}

.f15-date-popper .el-date-table td .el-date-table-cell__text {
  color: #d8e5f5;
  background: transparent;
}

.f15-date-popper .el-date-table td.available:hover .el-date-table-cell__text {
  background: rgba(56, 189, 248, 0.18);
  color: #fff;
}

.f15-date-popper .el-date-table td.in-range .el-date-table-cell {
  background: rgba(56, 189, 248, 0.14) !important;
}

.f15-date-popper .el-date-table td.start-date .el-date-table-cell__text,
.f15-date-popper .el-date-table td.end-date .el-date-table-cell__text,
.f15-date-popper .el-date-table td.current:not(.disabled) .el-date-table-cell__text {
  background: #38bdf8;
  color: #06111f;
}

.f15-date-popper .el-date-table td.today .el-date-table-cell__text {
  color: #38bdf8;
  font-weight: 700;
}

.f15-date-popper .el-date-table td.disabled .el-date-table-cell__text,
.f15-date-popper .el-date-table td.prev-month .el-date-table-cell__text,
.f15-date-popper .el-date-table td.next-month .el-date-table-cell__text {
  color: #5f7694;
  background: transparent;
}

.f15-date-popper .el-picker-panel__footer {
  background: #0d1117;
  border-top: 1px solid rgba(148, 163, 184, 0.16);
}

.f15-date-popper .el-picker-panel__footer .el-button {
  --el-button-bg-color: rgba(255, 255, 255, 0.04);
  --el-button-text-color: #d8e5f5;
  --el-button-border-color: rgba(148, 163, 184, 0.16);
}

.f15-date-popper .el-picker-panel__footer .el-button--primary {
  --el-button-bg-color: rgba(56, 189, 248, 0.22);
  --el-button-text-color: #fff;
  --el-button-border-color: rgba(56, 189, 248, 0.35);
}

@media (max-width: 640px) {
  .f15-date-popper .el-date-range-picker {
    width: min(318px, calc(100vw - 16px)) !important;
  }
  .f15-date-popper .el-picker-panel__body {
    min-width: 0 !important;
    width: 100%;
    display: flex;
    flex-direction: column;
  }
  .f15-date-popper .el-date-range-picker__content {
    float: none !important;
    width: 100% !important;
    margin: 0;
  }
}

.f15-message.el-message {
  background: #0d1117 !important;
  border: 1px solid rgba(148, 163, 184, 0.22) !important;
  color: #d8e5f5 !important;
}

.f15-message .el-message__content {
  color: #d8e5f5 !important;
}
</style>
