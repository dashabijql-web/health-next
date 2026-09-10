<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import BodyHologram from './BodyHologram.vue'
import { DEMO_WORKERS, type DemoWorker, type TrendPoint } from './demoWorkers'

defineOptions({ name: 'Body360Page' })

const hologram = ref<{ resetView: () => void } | null>(null)
const reducedMotion = ref(false)
const autoRotate = ref(true)

// 人员状态管理
const workersList = ref<DemoWorker[]>(JSON.parse(JSON.stringify(DEMO_WORKERS)))
const selectedWorkerId = ref<string>(workersList.value[0].id)
const isSelectorOpen = ref(false)
const searchQuery = ref('')
const selectorRef = ref<HTMLElement | null>(null)

const currentWorker = computed<DemoWorker>(() => {
  return workersList.value.find(w => w.id === selectedWorkerId.value) || workersList.value[0]
})

const isOfflineOrNoData = computed(() => {
  return currentWorker.value.freshnessStatus === 'no_data' || currentWorker.value.telemetry.netty !== 'online'
})

const filteredWorkers = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return workersList.value
  return workersList.value.filter(w =>
    w.name.toLowerCase().includes(q) ||
    w.id.includes(q) ||
    w.team.toLowerCase().includes(q) ||
    w.role.toLowerCase().includes(q),
  )
})

function selectWorker(worker: DemoWorker) {
  selectedWorkerId.value = worker.id
  isSelectorOpen.value = false
}

function cycleWorker(direction: number) {
  const currentIndex = workersList.value.findIndex(w => w.id === selectedWorkerId.value)
  const nextIndex = (currentIndex + direction + workersList.value.length) % workersList.value.length
  selectedWorkerId.value = workersList.value[nextIndex].id
}

function resetView() {
  hologram.value?.resetView()
}

// ----------------------------------------------------
// 联系此人相关功能
// ----------------------------------------------------
const showMsgDialog = ref(false)
const msgContent = ref('')

function openMessageDialog() {
  if (isOfflineOrNoData.value) return
  msgContent.value = ''
  showMsgDialog.value = true
}

function applyPreset(text: string) {
  msgContent.value = text.slice(0, 50)
}

function submitMessage() {
  if (!msgContent.value.trim()) return
  showMsgDialog.value = false
  msgContent.value = ''
  ElMessage({
    type: 'warning',
    message: '【演示环境】消息未真正下发 · 智能手表通讯接口未接入',
    duration: 3500,
  })
}

function triggerVoicePrompt() {
  if (isOfflineOrNoData.value) return
  ElMessage({
    type: 'warning',
    message: '【演示环境】语音提醒未真正下发 · 智能终端接口未接入',
    duration: 3500,
  })
}

function triggerCall() {
  ElMessage({
    type: 'info',
    message: '语音呼叫通道未配置，当前无法发起呼叫',
    duration: 3000,
  })
}

// ----------------------------------------------------
// 最近走势曲线与时间窗 (1h / 3h / 6h)
// ----------------------------------------------------
const selectedTimeWindow = ref<'1h' | '3h' | '6h'>('3h')

const timeWindowSliceCount = computed(() => {
  if (selectedTimeWindow.value === '1h') return 5 // 近 1 小时 (5个点，包含端点)
  if (selectedTimeWindow.value === '3h') return 13 // 近 3 小时 (13个点)
  return 25 // 近 6 小时
})

const activeTrendPoints = computed<TrendPoint[]>(() => {
  const trend = currentWorker.value.trend
  if (!trend || trend.length === 0) return []
  return trend.slice(-timeWindowSliceCount.value)
})

// 指标曲线配置
interface MetricSparkConfig {
  id: string
  label: string
  subLabel: string
  unit: string
  color: string
  scaleMin: number
  scaleMax: number
  normalMin: number
  normalMax: number
  hasNormalBand: boolean
  isLowerBoundOnly?: boolean
  getValue: (pt: TrendPoint) => number
  formatVal: (val: number | string | null | undefined) => string
}

const sparkConfigs: MetricSparkConfig[] = [
  {
    id: 'hr',
    label: '心率',
    subLabel: 'HEART RATE',
    unit: 'BPM',
    color: 'var(--gauge-heart, #f87171)',
    scaleMin: 50,
    scaleMax: 140,
    normalMin: 60,
    normalMax: 100,
    hasNormalBand: true,
    getValue: (pt: TrendPoint) => pt.heartRate,
    formatVal: (v) => v !== null && v !== undefined ? `${v}` : '--',
  },
  {
    id: 'bp',
    label: '收缩压',
    subLabel: 'SYSTOLIC BP',
    unit: 'mmHg',
    color: 'var(--gauge-bp, #38bdf8)',
    scaleMin: 80,
    scaleMax: 160,
    normalMin: 90,
    normalMax: 140,
    hasNormalBand: true,
    getValue: (pt: TrendPoint) => pt.systolic,
    formatVal: (v) => v !== null && v !== undefined ? `${v}` : '--',
  },
  {
    id: 'spo2',
    label: '血氧',
    subLabel: 'SPO2',
    unit: '%',
    color: 'var(--gauge-oxygen, #34d399)',
    scaleMin: 90,
    scaleMax: 100,
    normalMin: 95,
    normalMax: 100,
    hasNormalBand: true,
    isLowerBoundOnly: true,
    getValue: (pt: TrendPoint) => pt.bloodOxygen,
    formatVal: (v) => v !== null && v !== undefined ? `${v}` : '--',
  },
  {
    id: 'temp',
    label: '体温',
    subLabel: 'BODY TEMP',
    unit: '°C',
    color: 'var(--gauge-temp, #fbbf24)',
    scaleMin: 35.5,
    scaleMax: 38.5,
    normalMin: 36.0,
    normalMax: 37.5,
    hasNormalBand: true,
    getValue: (pt: TrendPoint) => pt.temperature,
    formatVal: (v) => v !== null && v !== undefined ? `${v}` : '--',
  },
  {
    id: 'stress',
    label: '压力负荷',
    subLabel: 'STRESS',
    unit: 'LV',
    color: 'var(--gauge-stress, #a78bfa)',
    scaleMin: 0,
    scaleMax: 100,
    normalMin: 0,
    normalMax: 50,
    hasNormalBand: true,
    getValue: (pt: TrendPoint) => pt.stress,
    formatVal: (v) => v !== null && v !== undefined ? `${v}` : '--',
  },
]

// 计算单个 sparkline 的 SVG 路径与阈值带坐标
const SVG_W = 280
const SVG_H = 54
const PAD_TOP = 6
const PAD_BOTTOM = 14
const PAD_LEFT = 4
const PAD_RIGHT = 4
const PLOT_W = SVG_W - PAD_LEFT - PAD_RIGHT
const PLOT_H = SVG_H - PAD_TOP - PAD_BOTTOM

function getSparklineData(cfg: MetricSparkConfig) {
  const pts = activeTrendPoints.value
  if (!pts || pts.length === 0) return null

  const { scaleMin, scaleMax, normalMin, normalMax } = cfg

  function mapY(val: number) {
    const clamped = Math.min(scaleMax, Math.max(scaleMin, val))
    const ratio = (clamped - scaleMin) / (scaleMax - scaleMin)
    return Number((PAD_TOP + (1 - ratio) * PLOT_H).toFixed(1))
  }

  function mapX(idx: number, count: number) {
    if (count <= 1) return PAD_LEFT + PLOT_W / 2
    return Number((PAD_LEFT + (idx / (count - 1)) * PLOT_W).toFixed(1))
  }

  const coords = pts.map((pt, i) => {
    const v = cfg.getValue(pt)
    return {
      x: mapX(i, pts.length),
      y: mapY(v),
      val: v,
      time: pt.time,
    }
  })

  // 折线路径
  const pathD = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ')

  // 阴影面积路径
  const baseLineY = PAD_TOP + PLOT_H
  const areaD = `${pathD} L ${coords[coords.length - 1].x} ${baseLineY} L ${coords[0].x} ${baseLineY} Z`

  // 正常范围带 Y
  const yNormalUpper = mapY(normalMax)
  const yNormalLower = mapY(normalMin)
  const normalBandY = yNormalUpper
  const normalBandH = Math.max(2, yNormalLower - yNormalUpper)

  // 最新点判断是否越界
  const latestPt = coords[coords.length - 1]
  const isOutOfRange = cfg.isLowerBoundOnly
    ? latestPt.val < normalMin
    : (latestPt.val < normalMin || latestPt.val > normalMax)

  return {
    pathD,
    areaD,
    coords,
    latestPt,
    isOutOfRange,
    yNormalUpper,
    yNormalLower,
    normalBandY,
    normalBandH,
    startTime: pts[0]?.time || '',
    endTime: pts[pts.length - 1]?.time || '',
  }
}

// ----------------------------------------------------
// 演示动态走势模拟 (每 12 秒微量递进，标明演示)
// ----------------------------------------------------
let liveTicker: number | null = null

function stepLiveTicker() {
  if (currentWorker.value.freshnessStatus !== 'fresh') return
  const trend = currentWorker.value.trend
  if (!trend || trend.length === 0) return

  const last = trend[trend.length - 1]
  // 微幅自然生理抖动
  const hrDelta = (Math.random() > 0.5 ? 1 : -1) * Math.round(Math.random())
  const bpDelta = (Math.random() > 0.5 ? 1 : -1) * Math.round(Math.random())
  const tempDelta = Number(((Math.random() - 0.5) * 0.1).toFixed(1))
  const stressDelta = (Math.random() > 0.5 ? 1 : -1) * Math.round(Math.random())

  last.heartRate = Math.max(55, Math.min(150, last.heartRate + hrDelta))
  last.systolic = Math.max(85, Math.min(165, last.systolic + bpDelta))
  last.temperature = Number(Math.max(35.8, Math.min(38.6, last.temperature + tempDelta)).toFixed(1))
  last.stress = Math.max(10, Math.min(95, last.stress + stressDelta))

  // 同步更新 currentWorker.vitals，确保最新点与人体周围读数 100% 吻合
  currentWorker.value.vitals.heartRate = last.heartRate
  currentWorker.value.vitals.bloodPressure = `${last.systolic}/${last.diastolic}`
  currentWorker.value.vitals.bloodOxygen = last.bloodOxygen
  currentWorker.value.vitals.temperature = last.temperature
  currentWorker.value.vitals.stress = last.stress
}

function handleGlobalClick(event: MouseEvent) {
  if (isSelectorOpen.value && selectorRef.value && !selectorRef.value.contains(event.target as Node)) {
    isSelectorOpen.value = false
  }
}

onMounted(() => {
  window.addEventListener('click', handleGlobalClick)
  liveTicker = window.setInterval(stepLiveTicker, 12000)
})

onBeforeUnmount(() => {
  window.removeEventListener('click', handleGlobalClick)
  if (liveTicker) clearInterval(liveTicker)
})
</script>

<template>
  <section class="body-page">
    <!-- 顶部工业状态条 -->
    <header class="body-page__bar">
      <div class="body-page__title-group">
        <div class="body-page__kicker">
          <span class="kicker-dot"></span>
          <span>HUMAN BIOMETRICS 360° · 实时体征仪表</span>
        </div>
        <div class="body-page__heading-row">
          <h1>360° 人体全息体征监护</h1>
          <span class="body-page__badge">演示名单 · 未接后端</span>
        </div>
      </div>

      <!-- 快速人员切换器（极克制，不占半屏） -->
      <div ref="selectorRef" class="worker-switcher">
        <div class="switcher-controls">
          <button
            type="button"
            class="switcher-nav-btn"
            title="上一位人员"
            @click.stop="cycleWorker(-1)"
          >
            ‹
          </button>
          <button
            type="button"
            class="switcher-trigger"
            :class="{ 'is-active': isSelectorOpen }"
            @click.stop="isSelectorOpen = !isSelectorOpen"
          >
            <span class="switcher-avatar-dot" :class="`is-${currentWorker.freshnessStatus}`"></span>
            <span class="switcher-name">{{ currentWorker.name }}</span>
            <span class="switcher-id">#{{ currentWorker.id }}</span>
            <span class="switcher-caret">▾</span>
          </button>
          <button
            type="button"
            class="switcher-nav-btn"
            title="下一位人员"
            @click.stop="cycleWorker(1)"
          >
            ›
          </button>
        </div>

        <!-- 人员下拉浮层 -->
        <transition name="dropdown-fade">
          <div v-if="isSelectorOpen" class="switcher-dropdown">
            <div class="dropdown-header">
              <input
                v-model="searchQuery"
                type="text"
                placeholder="搜索姓名 / 工号 / 班组..."
                class="dropdown-search"
                autofocus
                @click.stop
              />
            </div>
            <div class="dropdown-list">
              <div
                v-for="worker in filteredWorkers"
                :key="worker.id"
                class="dropdown-item"
                :class="{ 'is-selected': worker.id === currentWorker.id }"
                @click.stop="selectWorker(worker)"
              >
                <div class="item-left">
                  <span class="item-dot" :class="`is-${worker.freshnessStatus}`"></span>
                  <div>
                    <div class="item-name-row">
                      <strong>{{ worker.name }}</strong>
                      <span class="item-id">{{ worker.id }}</span>
                    </div>
                    <span class="item-team">{{ worker.team }} · {{ worker.role }}</span>
                  </div>
                </div>
                <span class="item-status-tag" :class="`is-${worker.freshnessStatus}`">
                  {{ worker.freshnessStatus === 'fresh' ? '新鲜' : (worker.freshnessStatus === 'stale' ? '陈旧' : '无数据') }}
                </span>
              </div>
              <div v-if="filteredWorkers.length === 0" class="dropdown-empty">
                无匹配人员
              </div>
            </div>
          </div>
        </transition>
      </div>
    </header>

    <!-- 上部两列：左侧人员身份标卡/遥测/联系此人 + 右侧3D人体全息舞台（两列等高 stretch） -->
    <div class="body-page__upper">
      <!-- 左侧：人员身份标卡、终端遥测、联系此人（钉在底部） -->
      <aside class="worker-sidebar">
        <section class="worker-card" aria-label="人员身份标卡">
          <div class="worker-card__top">
            <div class="card-header">
              <span class="card-eyebrow">WORKER IDENTIFICATION CARD</span>
              <span class="card-tag">在册职工</span>
            </div>

          <div class="worker-profile">
            <!-- 矿工形象头像 -->
            <div class="worker-avatar">
              <svg class="miner-avatar-svg" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="72" height="72" rx="10" fill="#0c1322" stroke="rgba(56, 189, 248, 0.2)" stroke-width="1.5"/>
                <path d="M12 66C12 52 23 48 36 48C49 48 60 52 60 66" fill="#1e293b" stroke="#334155" stroke-width="1.5"/>
                <path d="M25 50L22 66M47 50L50 66" stroke="#f59e0b" stroke-width="2.5" stroke-linecap="round"/>
                <rect x="31" y="40" width="10" height="9" rx="2" fill="#c28859"/>
                <ellipse cx="36" cy="35" rx="11" ry="12" fill="#d99b68"/>
                <path d="M29 35H33M39 35H43" stroke="#3b1e08" stroke-width="1.5" stroke-linecap="round"/>
                <path d="M33 41C35 42.5 37 42.5 39 41" stroke="#3b1e08" stroke-width="1.2" stroke-linecap="round"/>
                <path d="M20 28C20 17 26 12 36 12C46 12 52 17 52 28C52 29 20 29 20 28Z" fill="#eab308" stroke="#ca8a04" stroke-width="1.2"/>
                <path d="M18 28C18 26.5 24 25.5 36 25.5C48 25.5 54 26.5 54 28C54 29.5 18 29.5 18 28Z" fill="#facc15"/>
                <rect x="32.5" y="21" width="7" height="5.5" rx="1.5" fill="#1e293b" stroke="#64748b" stroke-width="1"/>
                <circle cx="36" cy="23.8" r="2" fill="#38bdf8"/>
                <circle cx="36" cy="23.8" r="0.8" fill="#ffffff"/>
              </svg>
            </div>

            <div class="worker-meta">
              <div class="worker-name-row">
                <h2>{{ currentWorker.name }}</h2>
                <span :class="['worker-status-chip', `is-${currentWorker.freshnessStatus}`]">
                  {{ currentWorker.freshnessStatus === 'fresh' ? '在线' : (currentWorker.freshnessStatus === 'stale' ? '陈旧' : '离线') }}
                </span>
              </div>
              <div class="worker-meta-item">
                <span class="meta-label">工号</span>
                <strong class="meta-value">{{ currentWorker.id }}</strong>
              </div>
              <div class="worker-meta-item">
                <span class="meta-label">班组</span>
                <span class="meta-value">{{ currentWorker.team }}</span>
              </div>
              <div class="worker-meta-item">
                <span class="meta-label">工种</span>
                <span class="meta-value">{{ currentWorker.role }}</span>
              </div>
            </div>
          </div>

          <!-- 终端实时遥测状态栏 (Real-Time Smart Watch Telemetry) -->
          <div class="telemetry-box">
            <div class="telemetry-header">
              <span>REAL-TIME SMART WATCH TELEMETRY</span>
            </div>
            <div class="telemetry-grid">
              <div class="telemetry-row">
                <span class="telemetry-label">
                  <svg class="telemetry-icon" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M2 5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5zm12 2a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1V7zM4 6v4h4V6H4z"/>
                  </svg>
                  电量
                </span>
                <span
                  class="telemetry-val"
                  :class="currentWorker.telemetry.battery ? (currentWorker.telemetry.battery > 20 ? 'is-good' : 'is-low') : 'is-none'"
                >
                  {{ currentWorker.telemetry.battery !== null ? currentWorker.telemetry.battery + '%' : '--' }}
                </span>
              </div>

              <div class="telemetry-row">
                <span class="telemetry-label">
                  <svg class="telemetry-icon" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zM2.5 8a5.5 5.5 0 1 1 11 0 5.5 5.5 0 0 1-11 0zm3.5 0a2 2 0 1 1 4 0 2 2 0 0 1-4 0z"/>
                  </svg>
                  Netty
                </span>
                <span
                  class="telemetry-val"
                  :class="currentWorker.telemetry.netty === 'online' ? 'is-good' : (currentWorker.telemetry.netty === 'reconnecting' ? 'is-warn' : 'is-none')"
                >
                  {{ currentWorker.telemetry.netty === 'online' ? 'TCP 在线' : (currentWorker.telemetry.netty === 'reconnecting' ? '重连中' : '未连接') }}
                </span>
              </div>

              <div class="telemetry-row">
                <span class="telemetry-label">
                  <svg class="telemetry-icon" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M1 12h2v2H1v-2zm4-3h2v5H5V9zm4-3h2v8H9V6zm4-3h2v11h-2V3z"/>
                  </svg>
                  信号
                </span>
                <span
                  class="telemetry-val"
                  :class="currentWorker.telemetry.signal === '5G' || currentWorker.telemetry.signal === '4G' ? 'is-good' : 'is-none'"
                >
                  {{ currentWorker.telemetry.signal === '5G' ? '5G 专网' : (currentWorker.telemetry.signal === '4G' ? '4G 蜂窝' : (currentWorker.telemetry.signal === 'weak' ? '弱信号' : '无信号')) }}
                </span>
              </div>

              <div class="telemetry-row">
                <span class="telemetry-label">
                  <svg class="telemetry-icon" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 3.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zm-6 4.5a6 6 0 1 1 12 0 6 6 0 0 1-12 0z"/>
                  </svg>
                  佩戴
                </span>
                <span
                  class="telemetry-val"
                  :class="currentWorker.telemetry.wearing === 'confirmed' ? 'is-good' : 'is-none'"
                >
                  {{ currentWorker.telemetry.wearing === 'confirmed' ? '已佩戴确认' : '未检测到佩戴' }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- 联系此人操作面板 (钉在左栏最底部，下沿与右侧人体舞台对齐) -->
        <div class="contact-box">
            <div class="contact-header">
              <span>DISPATCH & CONTACT · 联系此人</span>
            </div>
            <div class="contact-actions">
              <!-- 发消息 (弹窗最多50字) -->
              <button
                type="button"
                class="contact-btn contact-btn--msg"
                :disabled="isOfflineOrNoData"
                :title="isOfflineOrNoData ? '人员离线或无数据，通道关闭' : '向此人作业终端发送消息'"
                @click="openMessageDialog"
              >
                <svg class="contact-btn-icon" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M2 3a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5.414L2.707 14.707A1 1 0 0 1 1 14V3a2 2 0 0 1 1-1z"/>
                </svg>
                <span>发消息</span>
              </button>

              <!-- 语音提醒 (点一下即可) -->
              <button
                type="button"
                class="contact-btn contact-btn--voice"
                :disabled="isOfflineOrNoData"
                :title="isOfflineOrNoData ? '人员离线或无数据，通道关闭' : '向手表触发语音蜂鸣提醒'"
                @click="triggerVoicePrompt"
              >
                <svg class="contact-btn-icon" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M11.536 14.01A8.473 8.473 0 0 0 14.026 8a8.473 8.473 0 0 0-2.49-6.01l-.708.707A7.476 7.476 0 0 1 13.025 8c0 2.071-.84 3.946-2.197 5.303l.708.707z"/>
                  <path d="M8.707 11.182A4.486 4.486 0 0 0 10.025 8a4.486 4.486 0 0 0-1.318-3.182L8 5.525A3.489 3.489 0 0 1 9.025 8 3.49 3.49 0 0 1 8 10.475l.707.707zM6.717 3.55A.5.5 0 0 1 7 4v8a.5.5 0 0 1-.812.39L3.825 10.5H1.5A.5.5 0 0 1 1 10V6a.5.5 0 0 1 .5-.5h2.325l2.363-1.89a.5.5 0 0 1 .529-.06z"/>
                </svg>
                <span>语音提醒</span>
              </button>

              <!-- 打电话 (未配置) -->
              <button
                type="button"
                class="contact-btn contact-btn--call"
                title="语音通话未配置通道"
                @click="triggerCall"
              >
                <svg class="contact-btn-icon" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M3.654 1.328a.678.678 0 0 0-1.015-.063L1.605 2.3c-.483.484-.661 1.169-.45 1.77a17.568 17.568 0 0 0 4.168 6.608 17.569 17.569 0 0 0 6.608 4.168c.601.211 1.286.033 1.77-.45l1.034-1.034a.678.678 0 0 0-.063-1.015l-2.307-1.794a.678.678 0 0 0-.58-.122l-2.19.547a1.745 1.745 0 0 1-1.657-.459L5.482 8.062a1.745 1.745 0 0 1-.46-1.657l.548-2.19a.678.678 0 0 0-.122-.58L3.654 1.328z"/>
                </svg>
                <span>打电话</span>
                <small class="unconfigured-badge">未配置</small>
              </button>
            </div>
          </div>
        </section>
      </aside>

      <!-- 右侧：3D 线框人体主舞台（保持视觉中心） -->
      <div class="body-page__stage">
        <BodyHologram
          ref="hologram"
          :person-name="currentWorker.name"
          :vitals="currentWorker.vitals"
          :freshness-status="currentWorker.freshnessStatus"
          :last-collected="currentWorker.lastCollected"
          :reduced-motion="reducedMotion"
          :auto-rotate="autoRotate"
        />
      </div>
    </div>

    <!-- 下方：通栏近时体征动态走势条 (横跨整个主内容宽度，拉满整行宽度) -->
    <section class="trend-bar" aria-label="近时体征动态走势">
          <div class="trend-bar__header">
            <div class="trend-bar__title-wrap">
              <span class="trend-bar__title">RECENT BIOMETRIC TREND</span>
              <span class="trend-bar__sub">近时体征动态走势</span>
              <span class="trend-bar__pill">演示模拟 · 12s递进</span>
            </div>

            <!-- 时间窗切换：1h / 3h (默认) / 6h -->
            <div class="time-window-tabs" role="tablist">
              <button
                type="button"
                class="time-tab"
                :class="{ 'is-active': selectedTimeWindow === '1h' }"
                @click="selectedTimeWindow = '1h'"
              >
                1h
              </button>
              <button
                type="button"
                class="time-tab"
                :class="{ 'is-active': selectedTimeWindow === '3h' }"
                @click="selectedTimeWindow = '3h'"
              >
                3h
              </button>
              <button
                type="button"
                class="time-tab"
                :class="{ 'is-active': selectedTimeWindow === '6h' }"
                @click="selectedTimeWindow = '6h'"
              >
                6h
              </button>
            </div>
          </div>

          <!-- 走势内容区：5 项轻量 SVG 小曲线 / 无数据空态 -->
          <div class="trend-bar__content">
            <!-- 空态：无数据人员严格呈现空态提示，不复制假直线 -->
            <div v-if="activeTrendPoints.length === 0" class="trend-empty-state">
              <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <circle cx="12" cy="12" r="9"/>
                <line x1="9" y1="12" x2="15" y2="12"/>
              </svg>
              <div class="empty-text">
                <strong>暂无走势数据</strong>
                <span>该人员设备离线或未接入，未采集连续历史曲线</span>
              </div>
            </div>

            <!-- 5 条微型 SVG 走势图 -->
            <div v-else class="trend-grid">
              <div
                v-for="cfg in sparkConfigs"
                :key="cfg.id"
                class="spark-card"
                :class="{ 'is-alert': getSparklineData(cfg)?.isOutOfRange }"
              >
                <!-- 卡片顶栏：指标名 + 当前读数 -->
                <div class="spark-card__top">
                  <div class="spark-meta">
                    <span class="spark-dot" :style="{ backgroundColor: cfg.color }"></span>
                    <strong class="spark-name">{{ cfg.label }}</strong>
                    <span class="spark-sub">{{ cfg.subLabel }}</span>
                  </div>
                  <div class="spark-val">
                    <strong
                      :style="{ color: getSparklineData(cfg)?.isOutOfRange ? 'var(--status-warning)' : cfg.color }"
                    >
                      {{ cfg.formatVal(cfg.id === 'bp' && currentWorker.vitals.bloodPressure ? currentWorker.vitals.bloodPressure.split('/')[0] : (currentWorker.vitals as any)[cfg.id === 'hr' ? 'heartRate' : (cfg.id === 'spo2' ? 'bloodOxygen' : (cfg.id === 'temp' ? 'temperature' : (cfg.id === 'stress' ? 'stress' : 'heartRate')))]) }}
                    </strong>
                    <small>{{ cfg.unit }}</small>
                  </div>
                </div>

                <!-- 轻量 SVG 曲线与正常区间带 -->
                <div class="spark-svg-wrap">
                  <svg
                    :viewBox="`0 0 ${SVG_W} ${SVG_H}`"
                    class="spark-svg"
                    preserveAspectRatio="none"
                  >
                    <!-- 渐变定义 -->
                    <defs>
                      <linearGradient :id="`grad-${cfg.id}`" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" :stop-color="cfg.color" stop-opacity="0.28"/>
                        <stop offset="100%" :stop-color="cfg.color" stop-opacity="0.0"/>
                      </linearGradient>
                    </defs>

                    <!-- 正常阈值带底色阴影 -->
                    <rect
                      v-if="getSparklineData(cfg)"
                      x="0"
                      :y="getSparklineData(cfg)!.normalBandY"
                      :width="SVG_W"
                      :height="getSparklineData(cfg)!.normalBandH"
                      fill="rgba(255, 255, 255, 0.03)"
                    />

                    <!-- 上下限虚线 -->
                    <line
                      v-if="getSparklineData(cfg) && !cfg.isLowerBoundOnly"
                      x1="0"
                      :y1="getSparklineData(cfg)!.yNormalUpper"
                      :x2="SVG_W"
                      :y2="getSparklineData(cfg)!.yNormalUpper"
                      stroke="rgba(255, 255, 255, 0.16)"
                      stroke-dasharray="2 3"
                      stroke-width="1"
                    />
                    <line
                      v-if="getSparklineData(cfg)"
                      x1="0"
                      :y1="getSparklineData(cfg)!.yNormalLower"
                      :x2="SVG_W"
                      :y2="getSparklineData(cfg)!.yNormalLower"
                      stroke="rgba(255, 255, 255, 0.16)"
                      stroke-dasharray="2 3"
                      stroke-width="1"
                    />

                    <!-- 曲线下方渐变填充 -->
                    <path
                      v-if="getSparklineData(cfg)"
                      :d="getSparklineData(cfg)!.areaD"
                      :fill="`url(#grad-${cfg.id})`"
                    />

                    <!-- 曲线折线主体 (GPU 渲染平滑矢量) -->
                    <path
                      v-if="getSparklineData(cfg)"
                      :d="getSparklineData(cfg)!.pathD"
                      fill="none"
                      :stroke="getSparklineData(cfg)!.isOutOfRange ? 'var(--status-warning)' : cfg.color"
                      stroke-width="1.8"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />

                    <!-- 最新一个点 (与人体读数一致，带呼吸微光) -->
                    <circle
                      v-if="getSparklineData(cfg)"
                      :cx="getSparklineData(cfg)!.latestPt.x"
                      :cy="getSparklineData(cfg)!.latestPt.y"
                      r="4.5"
                      fill="none"
                      :stroke="getSparklineData(cfg)!.isOutOfRange ? 'var(--status-warning)' : cfg.color"
                      stroke-width="1"
                      opacity="0.6"
                    />
                    <circle
                      v-if="getSparklineData(cfg)"
                      :cx="getSparklineData(cfg)!.latestPt.x"
                      :cy="getSparklineData(cfg)!.latestPt.y"
                      r="2.5"
                      :fill="getSparklineData(cfg)!.isOutOfRange ? 'var(--status-warning)' : cfg.color"
                    />

                    <!-- 横轴首尾时刻 -->
                    <text
                      x="4"
                      :y="SVG_H - 2"
                      fill="rgba(255, 255, 255, 0.35)"
                      font-size="8"
                      font-family="monospace"
                    >
                      {{ getSparklineData(cfg)?.startTime }}
                    </text>
                    <text
                      :x="SVG_W - 4"
                      :y="SVG_H - 2"
                      text-anchor="end"
                      fill="rgba(255, 255, 255, 0.35)"
                      font-size="8"
                      font-family="monospace"
                    >
                      {{ getSparklineData(cfg)?.endTime }}
                    </text>
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </section>

    <!-- 底部控制条 -->
    <footer class="body-page__controls">
      <div class="controls-left">
        <span class="controls-label">三维空间视角控制</span>
        <label class="controls-checkbox">
          <input v-model="autoRotate" type="checkbox" />
          <span>自动旋转</span>
        </label>
        <label class="controls-checkbox">
          <input v-model="reducedMotion" type="checkbox" />
          <span>减少动态</span>
        </label>
      </div>

      <div class="controls-right">
        <button type="button" class="reset-btn" @click="resetView">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" class="btn-icon">
            <path d="M2.5 8a5.5 5.5 0 1 0 1.5-3.8L2 6M2 2v4h4" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          重置正面视角
        </button>
      </div>
    </footer>

    <!-- 发消息弹窗 (最多50字，深色磨砂工业风) -->
    <el-dialog
      v-model="showMsgDialog"
      title="发送终端调度消息"
      width="440px"
      class="custom-msg-dialog"
      :append-to-body="true"
      destroy-on-close
    >
      <div class="dialog-content">
        <div class="recipient-bar">
          <span class="r-label">当前接收人:</span>
          <strong class="r-name">{{ currentWorker.name }}</strong>
          <span class="r-desc">(工号 {{ currentWorker.id }} · {{ currentWorker.team }} · {{ currentWorker.role }})</span>
        </div>

        <div class="preset-group">
          <span class="preset-title">快捷预设:</span>
          <div class="preset-chips">
            <button
              type="button"
              class="preset-btn"
              @click="applyPreset('请报告当前作业面瓦斯与环境情况。')"
            >
              作业面报告
            </button>
            <button
              type="button"
              class="preset-btn"
              @click="applyPreset('作业负荷提示：请适时就地休息并补充水分。')"
            >
              负荷休息提示
            </button>
            <button
              type="button"
              class="preset-btn"
              @click="applyPreset('请复测智能手环佩戴紧度，确保信号稳定。')"
            >
              手环佩戴复测
            </button>
          </div>
        </div>

        <div class="textarea-box">
          <textarea
            v-model="msgContent"
            maxlength="50"
            rows="3"
            class="dialog-textarea"
            placeholder="请输入下发内容（严格限制 50 字以内）..."
          ></textarea>
          <div class="char-count" :class="{ 'is-limit': msgContent.length >= 50 }">
            {{ msgContent.length }} / 50
          </div>
        </div>

        <div class="dialog-disclaimer">
          <span class="disclaimer-tag">演示说明</span>
          <span>本环境为前端原型交互，确认发送后仅作界面反馈，不会真正下发至物理手环。</span>
        </div>
      </div>

      <template #footer>
        <div class="dialog-actions">
          <button type="button" class="btn-cancel" @click="showMsgDialog = false">取消</button>
          <button
            type="button"
            class="btn-send"
            :disabled="!msgContent.trim()"
            @click="submitMessage"
          >
            确认发送
          </button>
        </div>
      </template>
    </el-dialog>
  </section>
</template>

<style scoped>
.body-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  gap: 10px;
}

/* 顶部状态条 */
.body-page__bar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 2px 2px 0;
}

.body-page__title-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.body-page__kicker {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--signal-cyan);
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.kicker-dot {
  display: inline-block;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--signal-cyan);
  box-shadow: 0 0 6px var(--signal-cyan);
}

.body-page__heading-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.body-page__bar h1 {
  margin: 0;
  color: var(--text-strong);
  font-size: 18px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.body-page__badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.04em;
}

/* 极克制的人员切换器 */
.worker-switcher {
  position: relative;
  flex-shrink: 0;
}

.switcher-controls {
  display: flex;
  align-items: center;
  background: rgba(13, 17, 23, 0.9);
  border: 1px solid var(--border-dim);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.switcher-nav-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 30px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  transition: all 0.15s ease;
}

.switcher-nav-btn:hover {
  background: rgba(56, 189, 248, 0.12);
  color: #fff;
}

.switcher-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 30px;
  padding: 0 10px;
  border: none;
  border-left: 1px solid var(--border-dim);
  border-right: 1px solid var(--border-dim);
  background: transparent;
  color: var(--text-strong);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.switcher-trigger:hover,
.switcher-trigger.is-active {
  background: rgba(56, 189, 248, 0.08);
}

.switcher-avatar-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--status-standby);
}

.switcher-avatar-dot.is-fresh {
  background: var(--status-normal);
  box-shadow: 0 0 6px var(--status-normal);
}

.switcher-avatar-dot.is-stale {
  background: var(--status-warning);
}

.switcher-avatar-dot.is-no_data {
  background: var(--status-standby);
}

.switcher-name {
  font-weight: 600;
}

.switcher-id {
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 11px;
}

.switcher-caret {
  font-size: 10px;
  color: var(--text-muted);
  transition: transform 0.2s ease;
}

.switcher-trigger.is-active .switcher-caret {
  transform: rotate(180deg);
}

/* 下拉浮层 */
.switcher-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 50;
  width: 270px;
  padding: 6px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  background: #0d121c;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.65), 0 0 1px rgba(255, 255, 255, 0.1);
}

.dropdown-header {
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border-dim);
}

.dropdown-search {
  width: 100%;
  box-sizing: border-box;
  padding: 6px 10px;
  border: 1px solid var(--border-dim);
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-strong);
  font-size: 12px;
  outline: none;
  transition: border-color 0.15s ease;
}

.dropdown-search:focus {
  border-color: var(--signal-cyan);
}

.dropdown-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 4px;
  max-height: 220px;
  overflow-y: auto;
}

.dropdown-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 8px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background 0.15s ease;
}

.dropdown-item:hover {
  background: rgba(255, 255, 255, 0.06);
}

.dropdown-item.is-selected {
  background: rgba(56, 189, 248, 0.12);
}

.item-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.item-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--status-standby);
  flex-shrink: 0;
}

.item-dot.is-fresh { background: var(--status-normal); box-shadow: 0 0 6px var(--status-normal); }
.item-dot.is-stale { background: var(--status-warning); }
.item-dot.is-no_data { background: var(--status-standby); }

.item-name-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.item-name-row strong {
  color: var(--text-strong);
  font-size: 13px;
  font-weight: 600;
}

.item-id {
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 10px;
}

.item-team {
  color: var(--text-secondary);
  font-size: 11px;
}

.item-status-tag {
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 10px;
  font-family: var(--font-mono);
}

.item-status-tag.is-fresh {
  color: var(--status-normal);
  background: rgba(34, 197, 94, 0.12);
}

.item-status-tag.is-stale {
  color: var(--status-warning);
  background: rgba(245, 158, 11, 0.12);
}

.item-status-tag.is-no_data {
  color: var(--status-standby);
  background: rgba(100, 116, 139, 0.12);
}

.dropdown-empty {
  padding: 12px;
  color: var(--text-muted);
  text-align: center;
  font-size: 12px;
}

/* 主展示区上部两列：左侧人员身份标卡 + 右侧3D人体全息舞台（两列等高 stretch） */
.body-page__upper {
  display: grid;
  grid-template-columns: 290px minmax(0, 1fr);
  align-items: stretch;
  flex: 1;
  min-height: 0;
  gap: 12px;
}

/* 左侧栏 */
.worker-sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.worker-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100%;
  min-height: 0;
  box-sizing: border-box;
  padding: 13px;
  border: 1px solid var(--border-dim);
  border-radius: var(--radius-md);
  background: var(--bg-panel);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.35);
}

.worker-card__top {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--border-dim);
  padding-bottom: 6px;
}

.card-eyebrow {
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
}

.card-tag {
  padding: 1px 6px;
  border: 1px solid rgba(56, 189, 248, 0.2);
  border-radius: 3px;
  background: rgba(56, 189, 248, 0.06);
  color: var(--signal-cyan);
  font-size: 10px;
  font-weight: 500;
}

.worker-profile {
  display: flex;
  align-items: center;
  gap: 12px;
}

.worker-avatar {
  width: 62px;
  height: 62px;
  flex-shrink: 0;
}

.miner-avatar-svg {
  width: 100%;
  height: 100%;
  display: block;
}

.worker-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.worker-name-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.worker-name-row h2 {
  margin: 0;
  color: var(--text-strong);
  font-size: 17px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.worker-status-chip {
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 10px;
  font-family: var(--font-mono);
  font-weight: 600;
}

.worker-status-chip.is-fresh {
  color: var(--status-normal);
  background: rgba(34, 197, 94, 0.15);
}

.worker-status-chip.is-stale {
  color: var(--status-warning);
  background: rgba(245, 158, 11, 0.15);
}

.worker-status-chip.is-no_data {
  color: var(--status-standby);
  background: rgba(100, 116, 139, 0.15);
}

.worker-meta-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11.5px;
}

.meta-label {
  color: var(--text-muted);
}

.meta-value {
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-weight: 500;
}

/* 终端遥测状态面板 */
.telemetry-box {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: var(--radius-sm);
  background: rgba(9, 13, 20, 0.65);
}

.telemetry-header {
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.06em;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  padding-bottom: 3px;
}

.telemetry-grid {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.telemetry-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
}

.telemetry-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-muted);
}

.telemetry-icon {
  width: 13px;
  height: 13px;
  opacity: 0.7;
}

.telemetry-val {
  font-family: var(--font-mono);
  font-weight: 600;
  color: var(--text-secondary);
}

.telemetry-val.is-good { color: var(--status-normal); }
.telemetry-val.is-warn { color: var(--status-warning); }
.telemetry-val.is-low { color: var(--status-danger); }
.telemetry-val.is-none { color: var(--status-standby); }

/* 联系此人操作面板 (钉在左栏最底部，下沿与右侧人体舞台对齐) */
.contact-box {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 8px;
  border-top: 1px solid var(--border-dim);
}

.contact-header {
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.06em;
}

.contact-actions {
  display: grid;
  grid-template-columns: 1fr 1fr 1.15fr;
  gap: 6px;
}

.contact-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 28px;
  padding: 0 6px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-strong);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.contact-btn:hover:not(:disabled) {
  border-color: var(--border-interactive);
  background: rgba(56, 189, 248, 0.12);
  color: #fff;
}

.contact-btn:disabled {
  opacity: 0.42;
  cursor: not-allowed;
  border-color: rgba(255, 255, 255, 0.05);
  background: rgba(255, 255, 255, 0.01);
}

.contact-btn-icon {
  width: 12px;
  height: 12px;
  opacity: 0.85;
}

.contact-btn--call {
  color: var(--text-muted);
  background: rgba(255, 255, 255, 0.02);
}

.unconfigured-badge {
  padding: 1px 3px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-muted);
  font-size: 8.5px;
  font-family: var(--font-mono);
}

/* 3D 人体主舞台容器 */
.body-page__stage {
  height: 100%;
  min-height: 0;
}

/* 通栏近时体征走势条 (拉满整行宽度，横跨左栏与右侧人体舞台，高度约 136px) */
.trend-bar {
  width: 100%;
  height: 136px;
  flex-shrink: 0;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  padding: 8px 12px;
  border: 1px solid var(--border-dim);
  border-radius: var(--radius-md);
  background: var(--bg-panel);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
}

.trend-bar__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.trend-bar__title-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}

.trend-bar__title {
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 9.5px;
  font-weight: 600;
  letter-spacing: 0.08em;
}

.trend-bar__sub {
  color: var(--text-strong);
  font-size: 11px;
  font-weight: 600;
}

.trend-bar__pill {
  padding: 1px 6px;
  border: 1px solid rgba(56, 189, 248, 0.2);
  border-radius: 3px;
  background: rgba(56, 189, 248, 0.06);
  color: var(--signal-cyan);
  font-family: var(--font-mono);
  font-size: 9.5px;
}

/* 时间窗切换胶囊 */
.time-window-tabs {
  display: flex;
  align-items: center;
  background: rgba(9, 13, 20, 0.8);
  border: 1px solid var(--border-dim);
  border-radius: var(--radius-sm);
  padding: 1px;
}

.time-tab {
  padding: 2px 10px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  cursor: pointer;
  border-radius: 2px;
  transition: all 0.15s ease;
}

.time-tab.is-active {
  background: rgba(56, 189, 248, 0.2);
  color: #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
}

/* 走势图内容区 */
.trend-bar__content {
  flex: 1;
  min-height: 0;
}

.trend-empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  height: 100%;
  border: 1px dashed rgba(255, 255, 255, 0.08);
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, 0.01);
  color: var(--text-muted);
}

.empty-icon {
  width: 22px;
  height: 22px;
  opacity: 0.5;
}

.empty-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.empty-text strong {
  color: var(--text-secondary);
  font-size: 12px;
}

.empty-text span {
  font-size: 10.5px;
  color: var(--text-muted);
}

/* 5 个 mini sparkline 栅格 */
.trend-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
  height: 100%;
}

.spark-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 4px 6px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: var(--radius-sm);
  background: rgba(9, 13, 20, 0.6);
  min-width: 0;
}

.spark-card.is-alert {
  border-color: rgba(245, 158, 11, 0.35);
  background: rgba(245, 158, 11, 0.04);
}

.spark-card__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
}

.spark-meta {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.spark-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  flex-shrink: 0;
}

.spark-name {
  color: var(--text-secondary);
  font-size: 10.5px;
  font-weight: 600;
  white-space: nowrap;
}

.spark-sub {
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 8px;
  opacity: 0.6;
  white-space: nowrap;
}

.spark-val {
  display: flex;
  align-items: baseline;
  gap: 2px;
}

.spark-val strong {
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.spark-val small {
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 8.5px;
}

.spark-svg-wrap {
  width: 100%;
  height: 54px;
}

.spark-svg {
  width: 100%;
  height: 100%;
  display: block;
  overflow: visible;
}

/* 底部控制器 */
.body-page__controls {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 14px;
  border: 1px solid var(--border-dim);
  border-radius: var(--radius-md);
  background: var(--bg-panel);
  color: var(--text-secondary);
  font-size: 12px;
}

.controls-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.controls-label {
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.04em;
}

.controls-checkbox {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  user-select: none;
}

.controls-checkbox input[type='checkbox'] {
  accent-color: var(--signal-cyan);
  cursor: pointer;
}

.reset-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 14px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-strong);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.reset-btn:hover {
  background: rgba(56, 189, 248, 0.12);
  border-color: var(--border-interactive);
  color: #fff;
}

.reset-btn:active {
  transform: translateY(1px);
}

.btn-icon {
  width: 12px;
  height: 12px;
}

/* 弹窗样式定制 (深色工业风) */
:deep(.custom-msg-dialog) {
  background: #0d121c !important;
  border: 1px solid var(--border-subtle) !important;
  border-radius: var(--radius-md) !important;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.75) !important;
}

:deep(.custom-msg-dialog .el-dialog__header) {
  padding: 14px 18px 10px;
  margin-right: 0;
  border-bottom: 1px solid var(--border-dim);
}

:deep(.custom-msg-dialog .el-dialog__title) {
  color: var(--text-strong);
  font-size: 15px;
  font-weight: 600;
}

:deep(.custom-msg-dialog .el-dialog__headerbtn .el-dialog__close) {
  color: var(--text-muted);
}

:deep(.custom-msg-dialog .el-dialog__body) {
  padding: 16px 18px 8px;
}

:deep(.custom-msg-dialog .el-dialog__footer) {
  padding: 10px 18px 16px;
  border-top: 1px solid var(--border-dim);
}

.dialog-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.recipient-bar {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, 0.03);
  font-size: 12px;
}

.r-label {
  color: var(--text-muted);
}

.r-name {
  color: var(--text-strong);
  font-size: 14px;
}

.r-desc {
  color: var(--text-secondary);
  font-size: 11px;
}

.preset-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.preset-title {
  color: var(--text-muted);
  font-size: 11px;
}

.preset-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.preset-btn {
  padding: 3px 8px;
  border: 1px solid var(--border-dim);
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-secondary);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.preset-btn:hover {
  border-color: var(--signal-cyan);
  color: #fff;
  background: rgba(56, 189, 248, 0.1);
}

.textarea-box {
  position: relative;
}

.dialog-textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  background: rgba(0, 0, 0, 0.35);
  color: var(--text-strong);
  font-family: var(--font);
  font-size: 13px;
  line-height: 1.5;
  resize: none;
  outline: none;
  transition: border-color 0.15s ease;
}

.dialog-textarea:focus {
  border-color: var(--signal-cyan);
}

.char-count {
  position: absolute;
  right: 8px;
  bottom: 8px;
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 10px;
}

.char-count.is-limit {
  color: var(--status-warning);
}

.dialog-disclaimer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border: 1px solid rgba(245, 158, 11, 0.2);
  border-radius: var(--radius-sm);
  background: rgba(245, 158, 11, 0.06);
  color: var(--text-muted);
  font-size: 11px;
}

.disclaimer-tag {
  color: var(--status-warning);
  font-weight: 600;
  flex-shrink: 0;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.btn-cancel {
  padding: 5px 14px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
}

.btn-cancel:hover {
  background: rgba(255, 255, 255, 0.05);
  color: #fff;
}

.btn-send {
  padding: 5px 16px;
  border: 1px solid var(--signal-cyan);
  border-radius: var(--radius-sm);
  background: rgba(56, 189, 248, 0.18);
  color: #fff;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-send:hover:not(:disabled) {
  background: rgba(56, 189, 248, 0.32);
}

.btn-send:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* 动画过渡 */
.dropdown-fade-enter-active,
.dropdown-fade-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.dropdown-fade-enter-from,
.dropdown-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

/* 窄屏自适应响应式 */
@media (max-width: 860px) {
  .body-page {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    overflow-y: auto;
    gap: 10px;
  }

  .body-page__bar {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
    flex-shrink: 0;
  }

  .body-page__heading-row {
    flex-wrap: wrap;
    gap: 6px;
  }

  .body-page__bar h1 {
    font-size: 16px;
  }

  .body-page__upper {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 0;
    flex: unset;
  }

  .worker-sidebar {
    width: 100%;
    height: auto;
    flex-shrink: 0;
  }

  .worker-card {
    height: auto;
    padding: 10px;
    gap: 8px;
  }

  .worker-card__top {
    gap: 8px;
  }

  .worker-profile {
    gap: 10px;
  }

  .worker-avatar {
    width: 48px;
    height: 48px;
  }

  .worker-name-row h2 {
    font-size: 16px;
  }

  .telemetry-box {
    padding: 6px 8px;
  }

  .telemetry-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 4px 10px;
  }

  .contact-box {
    margin-top: 6px;
    padding-top: 6px;
  }

  .contact-actions {
    grid-template-columns: 1fr 1fr 1fr;
    gap: 4px;
  }

  .contact-btn {
    font-size: 10px;
    padding: 0 4px;
  }

  .body-page__stage {
    height: 420px;
    min-height: 420px;
    width: 100%;
    flex-shrink: 0;
  }

  .trend-bar {
    width: 100%;
    height: auto;
    flex-shrink: 0;
  }

  .trend-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 6px;
  }

  .body-page__controls {
    flex-direction: column;
    gap: 8px;
    align-items: stretch;
    flex-shrink: 0;
  }

  .controls-left {
    justify-content: space-around;
  }

  .reset-btn {
    justify-content: center;
  }
}
</style>
