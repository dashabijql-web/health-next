<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  Refresh,
  Search,
  Check,
  Warning,
  Clock,
  Remove,
  ChatDotRound,
  Phone,
  Right,
} from '@element-plus/icons-vue'
import {
  MOCK_DUTY_WORKERS,
  DUTY_SUMMARY_STATS,
  type DutyWorkerItem,
} from './mockDutyData'
import { immersiveBodyLocation } from '@/utils/immersiveBody'

defineOptions({ name: 'DutyRosterPage' })

const router = useRouter()

// 刷新时间管理
const lastRefreshTime = ref('15:58:20')
const isRefreshing = ref(false)

function handleRefresh() {
  isRefreshing.value = true
  const now = new Date()
  const h = String(now.getHours()).padStart(2, '0')
  const m = String(now.getMinutes()).padStart(2, '0')
  const s = String(now.getSeconds()).padStart(2, '0')
  lastRefreshTime.value = `${h}:${m}:${s}`

  setTimeout(() => {
    isRefreshing.value = false
    ElMessage.success('体征数据已刷新')
  }, 350)
}

// 筛选状态
const searchQuery = ref('')
const selectedStatus = ref<string>('all') // 'all' | 'online' | 'warning' | 'normal' | 'stale' | 'no_data'
const selectedTeam = ref<string>('all')

// 从演示数据中提取去重班组列表
const availableTeams = computed(() => {
  const teams = Array.from(new Set(MOCK_DUTY_WORKERS.map(w => w.team)))
  return teams
})

// 分页状态（每页 20 条）
const PAGE_SIZE = 20
const currentPage = ref(1)

// 胶囊点击快捷筛选
function handleCapsuleClick(filterType: 'online' | 'warning' | 'stale' | 'no_data') {
  if (selectedStatus.value === filterType) {
    // 再次点击取消筛选
    selectedStatus.value = 'all'
  } else {
    selectedStatus.value = filterType
  }
  currentPage.value = 1
}

// 过滤后的作业人员列表
const filteredWorkers = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()

  return MOCK_DUTY_WORKERS.filter((worker) => {
    // 搜索过滤：姓名或工号
    if (query) {
      const matchName = worker.empName.toLowerCase().includes(query)
      const matchCode = worker.empCode.toLowerCase().includes(query)
      if (!matchName && !matchCode) return false
    }

    // 状态过滤
    if (selectedStatus.value !== 'all') {
      if (selectedStatus.value === 'online') {
        // 在线：状态为 normal 或 warning
        if (worker.status !== 'normal' && worker.status !== 'warning') return false
      } else if (worker.status !== selectedStatus.value) {
        return false
      }
    }

    // 班组过滤
    if (selectedTeam.value !== 'all' && worker.team !== selectedTeam.value) {
      return false
    }

    return true
  })
})

// 分页计算
const totalFilteredCount = computed(() => filteredWorkers.value.length)
const totalPages = computed(() => Math.max(1, Math.ceil(totalFilteredCount.value / PAGE_SIZE)))

const paginatedWorkers = computed(() => {
  const start = (currentPage.value - 1) * PAGE_SIZE
  return filteredWorkers.value.slice(start, start + PAGE_SIZE)
})

function goToPage(page: number) {
  if (page < 1 || page > totalPages.value) return
  currentPage.value = page
}

function resetFilters() {
  searchQuery.value = ''
  selectedStatus.value = 'all'
  selectedTeam.value = 'all'
  currentPage.value = 1
}

// 导航至 360° 人体画像
function goToBody360(empCode: string, empName?: string) {
  router.push(immersiveBodyLocation(empCode, empName))
}

// 发消息 / 语音操作
function handleSendMessage(worker: DutyWorkerItem) {
  if (!worker.imei) return
  ElMessage.info('演示：未真正下发')
}

function handleVoiceCall(worker: DutyWorkerItem) {
  if (!worker.imei) return
  ElMessage.info('演示：未真正下发')
}

// 判断特定生理指标是否在异常报警阈值
function isHrAbnormal(hr: number | null): boolean {
  if (hr === null) return false
  return hr > 100 || hr < 55
}

function isSpo2Abnormal(spo2: number | null): boolean {
  if (spo2 === null) return false
  return spo2 < 95
}

function isBpAbnormal(sys: number | null, dia: number | null): boolean {
  if (sys === null || dia === null) return false
  return sys >= 140 || dia >= 90
}

function isTempAbnormal(temp: number | null): boolean {
  if (temp === null) return false
  return temp >= 37.3 || temp < 36.0
}

function isPressureAbnormal(pressure: number | null): boolean {
  if (pressure === null) return false
  return pressure >= 70
}
</script>

<template>
  <div class="duty-roster-container">
    <!-- 1. 顶栏 -->
    <header class="roster-header">
      <div class="header-left">
        <h1 class="header-title">值班名单</h1>
        <span class="header-desc">最近 15 分钟有上报视为在线；5 分钟内视为新鲜</span>
      </div>
      <div class="header-right">
        <span class="refresh-time">
          数据刷新于：<span class="mono-time">{{ lastRefreshTime }}</span>
        </span>
        <button
          type="button"
          class="btn-refresh"
          :class="{ 'is-loading': isRefreshing }"
          @click="handleRefresh"
        >
          <el-icon class="refresh-icon"><Refresh /></el-icon>
          <span>刷新</span>
        </button>
      </div>
    </header>

    <!-- 2. 四个数字胶囊（全量统计，不随单页行数变化，点击可快速筛选） -->
    <section class="capsules-grid">
      <div
        class="capsule-card capsule--online"
        :class="{ 'is-active': selectedStatus === 'online' }"
        @click="handleCapsuleClick('online')"
        title="点击快速筛选在线人员"
      >
        <div class="capsule-header">
          <span class="capsule-label">在线人员</span>
          <span class="capsule-badge badge-online">
            <el-icon><Check /></el-icon>
          </span>
        </div>
        <div class="capsule-body">
          <span class="capsule-number">{{ DUTY_SUMMARY_STATS.online }}</span>
          <span class="capsule-unit">人</span>
        </div>
        <div class="capsule-meta">通信正常 / 15分钟内有上报</div>
      </div>

      <div
        class="capsule-card capsule--warning"
        :class="{ 'is-active': selectedStatus === 'warning' }"
        @click="handleCapsuleClick('warning')"
        title="点击快速筛选当前异常人员"
      >
        <div class="capsule-header">
          <span class="capsule-label">当前异常</span>
          <span class="capsule-badge badge-warning">
            <el-icon><Warning /></el-icon>
          </span>
        </div>
        <div class="capsule-body">
          <span class="capsule-number">{{ DUTY_SUMMARY_STATS.warning }}</span>
          <span class="capsule-unit">人</span>
        </div>
        <div class="capsule-meta">体征指标超标预警</div>
      </div>

      <div
        class="capsule-card capsule--stale"
        :class="{ 'is-active': selectedStatus === 'stale' }"
        @click="handleCapsuleClick('stale')"
        title="点击快速筛选数据陈旧人员"
      >
        <div class="capsule-header">
          <span class="capsule-label">数据陈旧</span>
          <span class="capsule-badge badge-stale">
            <el-icon><Clock /></el-icon>
          </span>
        </div>
        <div class="capsule-body">
          <span class="capsule-number">{{ DUTY_SUMMARY_STATS.stale }}</span>
          <span class="capsule-unit">人</span>
        </div>
        <div class="capsule-meta">超 15 分钟无数据上报</div>
      </div>

      <div
        class="capsule-card capsule--nodata"
        :class="{ 'is-active': selectedStatus === 'no_data' }"
        @click="handleCapsuleClick('no_data')"
        title="点击快速筛选无数据人员"
      >
        <div class="capsule-header">
          <span class="capsule-label">无有效体征</span>
          <span class="capsule-badge badge-nodata">
            <el-icon><Remove /></el-icon>
          </span>
        </div>
        <div class="capsule-body">
          <span class="capsule-number">{{ DUTY_SUMMARY_STATS.noData }}</span>
          <span class="capsule-unit">人</span>
        </div>
        <div class="capsule-meta">未绑定手表或设备离线</div>
      </div>
    </section>

    <!-- 3. 筛选一行 -->
    <section class="filter-bar">
      <div class="filter-group filter-search">
        <el-input
          v-model="searchQuery"
          placeholder="搜索姓名或工号..."
          clearable
          :prefix-icon="Search"
          class="custom-input"
          @clear="currentPage = 1"
          @input="currentPage = 1"
        />
      </div>

      <div class="filter-group">
        <label class="filter-label">状态：</label>
        <el-select
          v-model="selectedStatus"
          placeholder="状态筛选"
          class="custom-select"
          @change="currentPage = 1"
        >
          <el-option label="全部状态" value="all" />
          <el-option label="在线人员 (104)" value="online" />
          <el-option label="当前异常 (12)" value="warning" />
          <el-option label="体征正常 (92)" value="normal" />
          <el-option label="数据陈旧 (9)" value="stale" />
          <el-option label="无有效体征 (7)" value="no_data" />
        </el-select>
      </div>

      <div class="filter-group">
        <label class="filter-label">班组：</label>
        <el-select
          v-model="selectedTeam"
          placeholder="班组筛选"
          class="custom-select"
          @change="currentPage = 1"
        >
          <el-option label="全部班组" value="all" />
          <el-option
            v-for="team in availableTeams"
            :key="team"
            :label="team"
            :value="team"
          />
        </el-select>
      </div>

      <button type="button" class="btn-reset" @click="resetFilters">
        重置筛选
      </button>

      <div class="filter-count-badge">
        匹配结果：<span class="mono-num">{{ totalFilteredCount }}</span> 人
      </div>
    </section>

    <!-- 4. 表格（主内容，桌面值班台，非卡片矩阵） -->
    <section class="table-container">
      <div class="table-scroll-wrapper">
        <table class="roster-table">
          <thead>
            <tr>
              <th class="col-name">姓名</th>
              <th class="col-code">工号</th>
              <th class="col-team">班组</th>
              <th class="col-hr">心率</th>
              <th class="col-spo2">血氧</th>
              <th class="col-bp">血压</th>
              <th class="col-temp">体温</th>
              <th class="col-pressure">压力</th>
              <th class="col-status">状态</th>
              <th class="col-time">采集时间</th>
              <th class="col-actions">操作</th>
            </tr>
          </thead>
          <tbody v-if="paginatedWorkers.length > 0">
            <tr
              v-for="worker in paginatedWorkers"
              :key="worker.empCode"
              class="roster-row"
              :class="{
                'is-warning-row': worker.status === 'warning',
                'is-stale-row': worker.status === 'stale',
                'is-nodata-row': worker.status === 'no_data',
              }"
            >
              <!-- 姓名：可点击跳入 360° 人体画像 -->
              <td class="col-name">
                <a
                  class="worker-name-link"
                  @click="goToBody360(worker.empCode, worker.empName)"
                  title="点击查看此人沉浸人体"
                >
                  {{ worker.empName }}
                </a>
              </td>

              <!-- 工号：等宽显示 -->
              <td class="col-code">
                <span class="mono-text text-secondary">{{ worker.empCode }}</span>
              </td>

              <!-- 班组 -->
              <td class="col-team">
                <span class="team-cell">{{ worker.team }}</span>
              </td>

              <!-- 心率 -->
              <td class="col-hr">
                <span
                  v-if="worker.heartRate !== null"
                  class="mono-text"
                  :class="{ 'val-abnormal': isHrAbnormal(worker.heartRate) }"
                >
                  {{ worker.heartRate }} <span class="unit-sub">bpm</span>
                </span>
                <span v-else class="empty-val">--</span>
              </td>

              <!-- 血氧 -->
              <td class="col-spo2">
                <span
                  v-if="worker.bloodOxygen !== null"
                  class="mono-text"
                  :class="{ 'val-abnormal': isSpo2Abnormal(worker.bloodOxygen) }"
                >
                  {{ worker.bloodOxygen }}<span class="unit-sub">%</span>
                </span>
                <span v-else class="empty-val">--</span>
              </td>

              <!-- 血压 -->
              <td class="col-bp">
                <span
                  v-if="worker.systolic !== null && worker.diastolic !== null"
                  class="mono-text"
                  :class="{ 'val-abnormal': isBpAbnormal(worker.systolic, worker.diastolic) }"
                >
                  {{ worker.systolic }}/{{ worker.diastolic }}
                </span>
                <span v-else class="empty-val">--</span>
              </td>

              <!-- 体温 -->
              <td class="col-temp">
                <span
                  v-if="worker.temperature !== null"
                  class="mono-text"
                  :class="{ 'val-abnormal': isTempAbnormal(worker.temperature) }"
                >
                  {{ worker.temperature.toFixed(1) }} <span class="unit-sub">℃</span>
                </span>
                <span v-else class="empty-val">--</span>
              </td>

              <!-- 压力 -->
              <td class="col-pressure">
                <span
                  v-if="worker.pressure !== null"
                  class="mono-text"
                  :class="{ 'val-abnormal': isPressureAbnormal(worker.pressure) }"
                >
                  {{ worker.pressure }}
                </span>
                <span v-else class="empty-val">--</span>
              </td>

              <!-- 状态：克制色点徽标 -->
              <td class="col-status">
                <div v-if="worker.status === 'normal'" class="status-badge status--normal">
                  <span class="badge-dot dot-normal"></span>
                  <span class="badge-text">正常</span>
                </div>
                <div v-else-if="worker.status === 'warning'" class="status-badge status--warning">
                  <span class="badge-dot dot-warning"></span>
                  <span class="badge-text">异常</span>
                </div>
                <div v-else-if="worker.status === 'stale'" class="status-badge status--stale">
                  <span class="badge-dot dot-stale"></span>
                  <span class="badge-text">陈旧</span>
                </div>
                <div v-else class="status-badge status--nodata">
                  <span class="badge-dot dot-nodata"></span>
                  <span class="badge-text">无数据</span>
                </div>
              </td>

              <!-- 采集时间 -->
              <td class="col-time">
                <span v-if="worker.collectedAt" class="mono-text text-secondary">
                  {{ worker.collectedAt }}
                </span>
                <span v-else class="empty-val">--</span>
              </td>

              <!-- 操作：查看人体、发消息、语音 -->
              <td class="col-actions">
                <div class="action-buttons">
                  <button
                    type="button"
                    class="btn-act btn-act-link"
                    @click="goToBody360(worker.empCode, worker.empName)"
                    title="跳转至沉浸人体"
                  >
                    查看人体
                  </button>

                  <button
                    type="button"
                    class="btn-act"
                    :disabled="!worker.imei"
                    :class="{ 'is-disabled': !worker.imei }"
                    :title="!worker.imei ? '未绑定穿戴设备' : '向此作业人员下发通知消息'"
                    @click="handleSendMessage(worker)"
                  >
                    <el-icon class="btn-icon"><ChatDotRound /></el-icon>
                    <span>发消息</span>
                  </button>

                  <button
                    type="button"
                    class="btn-act"
                    :disabled="!worker.imei"
                    :class="{ 'is-disabled': !worker.imei }"
                    :title="!worker.imei ? '未绑定穿戴设备' : '向此作业人员发起语音呼叫'"
                    @click="handleVoiceCall(worker)"
                  >
                    <el-icon class="btn-icon"><Phone /></el-icon>
                    <span>语音</span>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        <!-- 6. 空态 -->
        <div v-if="paginatedWorkers.length === 0" class="empty-state">
          <div class="empty-icon-box">
            <el-icon :size="32"><Search /></el-icon>
          </div>
          <div class="empty-title">无符合条件的人员</div>
          <div class="empty-desc">未找到匹配的人员记录，请尝试清除搜索词或重置筛选条件。</div>
          <button type="button" class="btn-empty-reset" @click="resetFilters">
            重置筛选条件
          </button>
        </div>
      </div>

      <!-- 5. 底部分页 -->
      <footer v-if="totalFilteredCount > 0" class="roster-pagination">
        <div class="pagination-info">
          第 <span class="mono-num">{{ currentPage }}</span> / <span class="mono-num">{{ totalPages }}</span> 页，共 <span class="mono-num">{{ totalFilteredCount }}</span> 条
        </div>
        <div class="pagination-controls">
          <button
            type="button"
            class="pg-btn"
            :disabled="currentPage <= 1"
            @click="goToPage(currentPage - 1)"
          >
            上一页
          </button>

          <div class="pg-numbers">
            <button
              v-for="page in totalPages"
              :key="page"
              type="button"
              class="pg-num"
              :class="{ 'is-active': page === currentPage }"
              @click="goToPage(page)"
            >
              {{ page }}
            </button>
          </div>

          <button
            type="button"
            class="pg-btn"
            :disabled="currentPage >= totalPages"
            @click="goToPage(currentPage + 1)"
          >
            下一页
          </button>
        </div>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.duty-roster-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
  max-width: 1600px;
  margin: 0 auto;
}

/* 1. 顶栏样式 */
.roster-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  padding: 16px 20px;
  background: var(--bg-panel);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
}

.header-left {
  display: flex;
  align-items: baseline;
  gap: 14px;
  flex-wrap: wrap;
}

.header-title {
  margin: 0;
  color: var(--text-strong);
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.header-desc {
  color: var(--text-secondary);
  font-size: 13px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 14px;
}

.refresh-time {
  color: var(--text-muted);
  font-size: 12px;
}

.mono-time {
  font-family: var(--font-mono);
  color: var(--text-secondary);
}

.btn-refresh {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  font-size: 12px;
  font-weight: 500;
  color: var(--signal-cyan);
  background: rgba(56, 189, 248, 0.08);
  border: 1px solid var(--border-interactive);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.16s ease;
}

.btn-refresh:hover {
  background: rgba(56, 189, 248, 0.18);
  color: #fff;
}

.btn-refresh.is-loading .refresh-icon {
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 2. 四个指标胶囊 */
.capsules-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
}

@media (max-width: 1024px) {
  .capsules-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 640px) {
  .capsules-grid {
    grid-template-columns: 1fr;
  }
}

.capsule-card {
  display: flex;
  flex-direction: column;
  padding: 14px 16px;
  background: var(--bg-panel);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.18s ease;
  user-select: none;
}

.capsule-card:hover {
  border-color: var(--border-interactive);
  transform: translateY(-1px);
}

.capsule-card.is-active {
  border-color: var(--signal-cyan);
  box-shadow: 0 0 12px rgba(56, 189, 248, 0.2);
  background: rgba(13, 22, 34, 0.95);
}

.capsule-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.capsule-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
}

.capsule-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 5px;
  font-size: 12px;
}

.badge-online {
  background: rgba(34, 197, 94, 0.14);
  color: var(--status-normal);
}

.badge-warning {
  background: rgba(239, 68, 68, 0.14);
  color: var(--status-danger);
}

.badge-stale {
  background: rgba(234, 179, 8, 0.14);
  color: var(--status-warning);
}

.badge-nodata {
  background: rgba(100, 116, 139, 0.16);
  color: var(--status-standby);
}

.capsule-body {
  display: flex;
  align-items: baseline;
  gap: 4px;
  margin-bottom: 4px;
}

.capsule-number {
  font-family: var(--font-mono);
  font-size: 26px;
  font-weight: 700;
  line-height: 1.1;
  color: var(--text-strong);
}

.capsule-unit {
  font-size: 12px;
  color: var(--text-muted);
}

.capsule--online .capsule-number {
  color: #38bdf8;
}

.capsule--warning .capsule-number {
  color: #f87171;
}

.capsule--stale .capsule-number {
  color: #fbbf24;
}

.capsule--nodata .capsule-number {
  color: #94a3b8;
}

.capsule-meta {
  font-size: 12px;
  color: var(--text-muted);
}

/* 3. 筛选行 */
.filter-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  padding: 12px 18px;
  background: var(--bg-panel);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.filter-label {
  font-size: 13px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.filter-search {
  width: 240px;
}

.custom-input :deep(.el-input__wrapper) {
  background-color: rgba(9, 12, 16, 0.7) !important;
  box-shadow: 0 0 0 1px var(--border-subtle) inset !important;
  border-radius: 6px;
}

.custom-input :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px var(--signal-cyan) inset !important;
}

.custom-input :deep(.el-input__inner) {
  color: var(--text-strong);
  font-size: 13px;
}

.custom-select {
  width: 150px;
}

.custom-select :deep(.el-select__wrapper) {
  background-color: rgba(9, 12, 16, 0.7) !important;
  box-shadow: 0 0 0 1px var(--border-subtle) inset !important;
  border-radius: 6px;
  color: var(--text-primary);
}

.btn-reset {
  padding: 6px 14px;
  font-size: 12px;
  color: var(--text-secondary);
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.16s ease;
}

.btn-reset:hover {
  background: rgba(255, 255, 255, 0.09);
  color: var(--text-strong);
  border-color: rgba(255, 255, 255, 0.2);
}

.filter-count-badge {
  margin-left: auto;
  font-size: 13px;
  color: var(--text-secondary);
}

.mono-num {
  font-family: var(--font-mono);
  font-weight: 600;
  color: var(--signal-cyan);
}

/* 4. 表格区 */
.table-container {
  background: var(--bg-panel);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  overflow: hidden;
}

.table-scroll-wrapper {
  overflow-x: auto;
  width: 100%;
}

.roster-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  font-size: 13px;
}

.roster-table th {
  padding: 12px 14px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  background: rgba(9, 14, 23, 0.95);
  border-bottom: 1px solid var(--border-subtle);
  white-space: nowrap;
}

.roster-table td {
  padding: 12px 14px;
  color: var(--text-primary);
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  vertical-align: middle;
  white-space: nowrap;
}

/* 表格行状态背景与左侧细色条 */
.roster-row {
  transition: background 0.14s ease;
}

.roster-row:hover {
  background: rgba(56, 189, 248, 0.05);
}

/* 异常行：左侧 3px 琥珀橙色条，克制暖底色 */
.roster-row.is-warning-row {
  background: rgba(245, 158, 11, 0.035);
}

.roster-row.is-warning-row:hover {
  background: rgba(245, 158, 11, 0.07);
}

.roster-row.is-warning-row td:first-child {
  position: relative;
}

.roster-row.is-warning-row td:first-child::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--status-warning);
}

.roster-row.is-nodata-row {
  opacity: 0.72;
}

/* 单元格排版细节 */
.worker-name-link {
  color: #38bdf8;
  font-weight: 600;
  cursor: pointer;
  text-decoration: none;
  transition: color 0.14s ease;
}

.worker-name-link:hover {
  color: #7dd3fc;
  text-decoration: underline;
}

.mono-text {
  font-family: var(--font-mono);
  font-size: 13px;
}

.text-secondary {
  color: var(--text-secondary);
}

.unit-sub {
  font-size: 11px;
  color: var(--text-muted);
}

.empty-val {
  color: #475569;
  font-family: var(--font-mono);
}

/* 生理指标超标高亮（克制文字着色，非大屏霓虹） */
.val-abnormal {
  color: #f87171 !important;
  font-weight: 700;
}

.team-cell {
  color: var(--text-secondary);
}

/* 状态徽标 */
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.badge-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status--normal {
  background: rgba(34, 197, 94, 0.12);
  color: #4ade80;
}
.dot-normal {
  background: #22c55e;
}

.status--warning {
  background: rgba(239, 68, 68, 0.14);
  color: #f87171;
}
.dot-warning {
  background: #ef4444;
}

.status--stale {
  background: rgba(234, 179, 8, 0.12);
  color: #facc15;
}
.dot-stale {
  background: #eab308;
}

.status--nodata {
  background: rgba(100, 116, 139, 0.14);
  color: #94a3b8;
}
.dot-nodata {
  background: #64748b;
}

/* 操作按钮列 */
.action-buttons {
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-act {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 9px;
  font-size: 12px;
  color: var(--text-secondary);
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--border-subtle);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.14s ease;
}

.btn-act:hover:not(:disabled) {
  color: var(--text-strong);
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.2);
}

.btn-act-link {
  color: var(--signal-cyan);
  background: rgba(56, 189, 248, 0.08);
  border-color: rgba(56, 189, 248, 0.28);
}

.btn-act-link:hover {
  background: rgba(56, 189, 248, 0.18);
  color: #fff;
  border-color: var(--signal-cyan);
}

.btn-act.is-disabled,
.btn-act:disabled {
  opacity: 0.38;
  cursor: not-allowed;
  border-color: transparent;
  background: rgba(255, 255, 255, 0.02);
}

.btn-icon {
  font-size: 12px;
}

/* 空态样式 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 16px;
  text-align: center;
}

.empty-icon-box {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border-subtle);
  color: var(--text-muted);
  margin-bottom: 12px;
}

.empty-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-strong);
  margin-bottom: 6px;
}

.empty-desc {
  font-size: 13px;
  color: var(--text-muted);
  max-width: 360px;
  margin-bottom: 16px;
}

.btn-empty-reset {
  padding: 6px 16px;
  font-size: 13px;
  color: var(--signal-cyan);
  background: rgba(56, 189, 248, 0.1);
  border: 1px solid var(--border-interactive);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.16s ease;
}

.btn-empty-reset:hover {
  background: rgba(56, 189, 248, 0.2);
  color: #fff;
}

/* 5. 底部分页 */
.roster-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  padding: 12px 18px;
  border-top: 1px solid var(--border-subtle);
  background: rgba(9, 14, 23, 0.6);
}

.pagination-info {
  font-size: 13px;
  color: var(--text-secondary);
}

.pagination-controls {
  display: flex;
  align-items: center;
  gap: 6px;
}

.pg-btn {
  padding: 4px 10px;
  font-size: 12px;
  color: var(--text-secondary);
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--border-subtle);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.14s ease;
}

.pg-btn:hover:not(:disabled) {
  color: var(--text-strong);
  border-color: rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.08);
}

.pg-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.pg-numbers {
  display: flex;
  align-items: center;
  gap: 4px;
}

.pg-num {
  min-width: 28px;
  height: 28px;
  padding: 0 6px;
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.14s ease;
}

.pg-num:hover {
  color: var(--text-strong);
  background: rgba(255, 255, 255, 0.04);
}

.pg-num.is-active {
  color: #fff;
  background: rgba(56, 189, 248, 0.2);
  border-color: var(--signal-cyan);
  font-weight: 700;
}
</style>
