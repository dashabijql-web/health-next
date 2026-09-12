<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  Refresh,
  Search,
  Warning,
  WarningFilled,
  Clock,
  User,
  Check,
  CircleCheck,
} from '@element-plus/icons-vue'
import {
  MOCK_WARNING_RECORDS,
  WARNING_SUMMARY_STATS,
  type WarningRecordItem,
} from './mockWarningsData'

defineOptions({ name: 'WarningRecordsPage' })

const router = useRouter()

// 响应式数据副本，支持在演示中可点击“处理”按钮改变状态
const recordsList = ref<WarningRecordItem[]>(JSON.parse(JSON.stringify(MOCK_WARNING_RECORDS)))

// 刷新时间与操作
const lastRefreshTime = ref('16:02:15')
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
    ElMessage.success('预警记录数据已刷新')
  }, 350)
}

// 筛选字段
const searchQuery = ref('')
const selectedMetric = ref<string>('all') // 'all' | 'heartRate' | 'bloodOxygen' | 'bloodPressure' | 'temperature' | 'pressure'
const selectedTimeRange = ref<string>('7d') // 'today' | '3d' | '7d'
const selectedHandled = ref<string>('all') // 'all' | 'unhandled' | 'handled'

// 分页（每页 20 条）
const PAGE_SIZE = 20
const currentPage = ref(1)

// 顶栏 4 个统计数据（硬核演示数据，与今天 2026-09-10 实际口径保持绝对一致）
// 也可以从 recordsList 中实时反映（如点击处理后未处理数递减）
const todayRecords = computed(() => {
  return recordsList.value.filter(item => item.occurredAt.startsWith('2026-09-10'))
})

const summaryStats = computed(() => {
  const todayTotal = todayRecords.value.length
  const todayUnhandled = todayRecords.value.filter(item => !item.handled).length
  const distinctEmployees = new Set(todayRecords.value.map(item => item.empCode))
  return {
    todayTotal: WARNING_SUMMARY_STATS.todayTotal,
    todayUnhandled,
    todayPeopleCount: distinctEmployees.size,
    highestLevel: WARNING_SUMMARY_STATS.highestLevel,
  }
})

// 快捷点击胶囊筛选
function handleCapsuleClick(filterType: 'unhandled' | 'today') {
  if (filterType === 'unhandled') {
    if (selectedHandled.value === 'unhandled') {
      selectedHandled.value = 'all'
    } else {
      selectedHandled.value = 'unhandled'
    }
  } else if (filterType === 'today') {
    if (selectedTimeRange.value === 'today') {
      selectedTimeRange.value = '7d'
    } else {
      selectedTimeRange.value = 'today'
    }
  }
  currentPage.value = 1
}

// 列表过滤逻辑
const filteredRecords = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()

  return recordsList.value.filter((item) => {
    // 1. 搜索姓名或工号
    if (query) {
      const matchName = item.empName.toLowerCase().includes(query)
      const matchCode = item.empCode.toLowerCase().includes(query)
      if (!matchName && !matchCode) return false
    }

    // 2. 指标过滤
    if (selectedMetric.value !== 'all' && item.metric !== selectedMetric.value) {
      return false
    }

    // 3. 时间过滤
    if (selectedTimeRange.value === 'today') {
      if (!item.occurredAt.startsWith('2026-09-10')) return false
    } else if (selectedTimeRange.value === '3d') {
      // 2026-09-08 至 2026-09-10
      const dateStr = item.occurredAt.slice(0, 10)
      if (dateStr < '2026-09-08' || dateStr > '2026-09-10') return false
    } else if (selectedTimeRange.value === '7d') {
      // 2026-09-04 至 2026-09-10
      const dateStr = item.occurredAt.slice(0, 10)
      if (dateStr < '2026-09-04' || dateStr > '2026-09-10') return false
    }

    // 4. 处理状态过滤
    if (selectedHandled.value === 'unhandled') {
      if (item.handled) return false
    } else if (selectedHandled.value === 'handled') {
      if (!item.handled) return false
    }

    return true
  })
})

// 分页计算
const totalFilteredCount = computed(() => filteredRecords.value.length)
const totalPages = computed(() => Math.max(1, Math.ceil(totalFilteredCount.value / PAGE_SIZE)))

const paginatedRecords = computed(() => {
  const start = (currentPage.value - 1) * PAGE_SIZE
  return filteredRecords.value.slice(start, start + PAGE_SIZE)
})

function goToPage(page: number) {
  if (page < 1 || page > totalPages.value) return
  currentPage.value = page
}

function resetFilters() {
  searchQuery.value = ''
  selectedMetric.value = 'all'
  selectedTimeRange.value = '7d'
  selectedHandled.value = 'all'
  currentPage.value = 1
}

// 导航至 360° 人体画像
function goToBody360(empCode: string) {
  router.push({
    path: '/health-monitor/body-360',
    query: { empCode },
  })
}

// 操作：标记处理
function handleToggleHandled(record: WarningRecordItem) {
  record.handled = !record.handled
  if (record.handled) {
    ElMessage.success(`预警记录【${record.warningId}】(${record.empName}) 已标记为已处理`)
  } else {
    ElMessage.info(`预警记录【${record.warningId}】(${record.empName}) 已重置为未处理`)
  }
}
</script>

<template>
  <div class="warnings-page-container">
    <!-- 1. 顶栏 -->
    <header class="warnings-header">
      <div class="header-left">
        <h1 class="header-title">预警记录</h1>
        <span class="header-desc">按越界发生时间列出，不是当前名单人数</span>
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

    <!-- 2. 四个数字胶囊（真实吻合演示数据口径，非单页行数冒充） -->
    <section class="capsules-grid">
      <!-- 今日越界条数 -->
      <div
        class="capsule-card capsule--total"
        :class="{ 'is-active': selectedTimeRange === 'today' && selectedHandled === 'all' }"
        @click="handleCapsuleClick('today')"
        title="点击快速筛选今日发生的预警记录"
      >
        <div class="capsule-header">
          <span class="capsule-label">今日越界条数</span>
          <span class="capsule-badge badge-total">
            <el-icon><Clock /></el-icon>
          </span>
        </div>
        <div class="capsule-body">
          <span class="capsule-number">{{ summaryStats.todayTotal }}</span>
          <span class="capsule-unit">条</span>
        </div>
        <div class="capsule-meta">今日累计生理指标越界频次</div>
      </div>

      <!-- 未处理 -->
      <div
        class="capsule-card capsule--unhandled"
        :class="{ 'is-active': selectedHandled === 'unhandled' }"
        @click="handleCapsuleClick('unhandled')"
        title="点击快速筛选未处理的预警"
      >
        <div class="capsule-header">
          <span class="capsule-label">未处理</span>
          <span class="capsule-badge badge-unhandled">
            <el-icon><Warning /></el-icon>
          </span>
        </div>
        <div class="capsule-body">
          <span class="capsule-number">{{ summaryStats.todayUnhandled }}</span>
          <span class="capsule-unit">条</span>
        </div>
        <div class="capsule-meta">今日待值班员复核闭环</div>
      </div>

      <!-- 涉及人数 -->
      <div class="capsule-card capsule--people">
        <div class="capsule-header">
          <span class="capsule-label">涉及人数</span>
          <span class="capsule-badge badge-people">
            <el-icon><User /></el-icon>
          </span>
        </div>
        <div class="capsule-body">
          <span class="capsule-number">{{ summaryStats.todayPeopleCount }}</span>
          <span class="capsule-unit">人</span>
        </div>
        <div class="capsule-meta">今日产生越界去重人员数</div>
      </div>

      <!-- 最高级别 -->
      <div class="capsule-card capsule--level">
        <div class="capsule-header">
          <span class="capsule-label">最高级别</span>
          <span class="capsule-badge badge-level">
            <el-icon><WarningFilled /></el-icon>
          </span>
        </div>
        <div class="capsule-body">
          <span class="capsule-number level-text">{{ summaryStats.highestLevel }}</span>
        </div>
        <div class="capsule-meta">预警状态等级评估</div>
      </div>
    </section>

    <!-- 3. 筛选一行 -->
    <section class="filter-bar">
      <!-- 搜索姓名或工号 -->
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

      <!-- 指标筛选 -->
      <div class="filter-group">
        <label class="filter-label">指标：</label>
        <el-select
          v-model="selectedMetric"
          placeholder="全部指标"
          class="custom-select"
          @change="currentPage = 1"
        >
          <el-option label="全部指标" value="all" />
          <el-option label="心率" value="heartRate" />
          <el-option label="血氧" value="bloodOxygen" />
          <el-option label="血压" value="bloodPressure" />
          <el-option label="体温" value="temperature" />
          <el-option label="压力" value="pressure" />
        </el-select>
      </div>

      <!-- 时间筛选 -->
      <div class="filter-group">
        <label class="filter-label">时间：</label>
        <el-select
          v-model="selectedTimeRange"
          placeholder="时间跨度"
          class="custom-select"
          @change="currentPage = 1"
        >
          <el-option label="今天" value="today" />
          <el-option label="近 3 天" value="3d" />
          <el-option label="近 7 天" value="7d" />
        </el-select>
      </div>

      <!-- 处理状态筛选 -->
      <div class="filter-group">
        <label class="filter-label">处理：</label>
        <el-select
          v-model="selectedHandled"
          placeholder="处理状态"
          class="custom-select"
          @change="currentPage = 1"
        >
          <el-option label="全部状态" value="all" />
          <el-option label="未处理" value="unhandled" />
          <el-option label="已处理" value="handled" />
        </el-select>
      </div>

      <!-- 重置按钮 -->
      <button type="button" class="btn-reset" @click="resetFilters">
        重置
      </button>

      <!-- 计数徽标 -->
      <div class="filter-count-badge">
        匹配记录：<span class="mono-num">{{ totalFilteredCount }}</span> 条
      </div>
    </section>

    <!-- 4. 表格区（服务端分页风格，每页 20 条，石墨黑克制配色） -->
    <section class="table-container">
      <div class="table-scroll-wrapper">
        <table class="warnings-table">
          <thead>
            <tr>
              <th class="col-time">发生时间</th>
              <th class="col-name">姓名</th>
              <th class="col-code">工号</th>
              <th class="col-team">班组</th>
              <th class="col-metric">指标</th>
              <th class="col-val">数值</th>
              <th class="col-phase">状态</th>
              <th class="col-handled">处理</th>
              <th class="col-actions">操作</th>
            </tr>
          </thead>
          <tbody v-if="paginatedRecords.length > 0">
            <tr
              v-for="record in paginatedRecords"
              :key="record.warningId"
              class="warnings-row"
              :class="{
                'is-open-row': record.phase === 'open',
                'is-unhandled-row': !record.handled,
              }"
            >
              <!-- 发生时间 -->
              <td class="col-time">
                <span class="mono-text text-secondary">{{ record.occurredAt }}</span>
              </td>

              <!-- 姓名：点击跳入 360° 人体画像 -->
              <td class="col-name">
                <a
                  class="worker-name-link"
                  @click="goToBody360(record.empCode)"
                  title="点击查看此人 360° 人体画像"
                >
                  {{ record.empName }}
                </a>
              </td>

              <!-- 工号：等宽 -->
              <td class="col-code">
                <span class="mono-text text-secondary">{{ record.empCode }}</span>
              </td>

              <!-- 班组 -->
              <td class="col-team">
                <span class="team-cell">{{ record.team }}</span>
              </td>

              <!-- 指标 -->
              <td class="col-metric">
                <span class="metric-tag" :class="`metric--${record.metric}`">
                  {{ record.metricLabel }}
                </span>
              </td>

              <!-- 数值 -->
              <td class="col-val">
                <span class="mono-text val-abnormal">
                  {{ record.valueText }}
                </span>
              </td>

              <!-- 状态：越界 / 已恢复 -->
              <td class="col-phase">
                <div v-if="record.phase === 'open'" class="status-badge phase--open">
                  <span class="badge-dot dot-danger"></span>
                  <span class="badge-text">越界</span>
                </div>
                <div v-else class="status-badge phase--recovered">
                  <span class="badge-dot dot-normal"></span>
                  <span class="badge-text">已恢复</span>
                </div>
              </td>

              <!-- 处理：未处理 / 已处理 -->
              <td class="col-handled">
                <div v-if="!record.handled" class="status-badge handled--no">
                  <span class="badge-dot dot-warning"></span>
                  <span class="badge-text">未处理</span>
                </div>
                <div v-else class="status-badge handled--yes">
                  <el-icon class="handled-icon"><Check /></el-icon>
                  <span class="badge-text">已处理</span>
                </div>
              </td>

              <!-- 操作：查看人体 / 标记处理 -->
              <td class="col-actions">
                <div class="action-buttons">
                  <button
                    type="button"
                    class="btn-act btn-act-link"
                    @click="goToBody360(record.empCode)"
                    title="跳转至 360° 人体健康页面"
                  >
                    查看人体
                  </button>

                  <button
                    type="button"
                    class="btn-act btn-act-handle"
                    :class="{ 'is-handled': record.handled }"
                    :title="record.handled ? '点击撤销为未处理' : '点击标记为已处理'"
                    @click="handleToggleHandled(record)"
                  >
                    <el-icon v-if="!record.handled"><Check /></el-icon>
                    <el-icon v-else><CircleCheck /></el-icon>
                    <span>{{ record.handled ? '已处置' : '处理' }}</span>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        <!-- 5. 空态 -->
        <div v-if="paginatedRecords.length === 0" class="empty-state">
          <div class="empty-icon-box">
            <el-icon :size="32"><Search /></el-icon>
          </div>
          <div class="empty-title">无符合条件的记录</div>
          <div class="empty-desc">未找到匹配的预警历史记录，请尝试清除搜索词或重置筛选条件。</div>
          <button type="button" class="btn-empty-reset" @click="resetFilters">
            重置筛选条件
          </button>
        </div>
      </div>

      <!-- 6. 底部分页 -->
      <footer v-if="totalFilteredCount > 0" class="warnings-pagination">
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
.warnings-page-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
  max-width: 1600px;
  margin: 0 auto;
}

/* 1. 顶栏样式 */
.warnings-header {
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

.badge-total {
  background: rgba(56, 189, 248, 0.14);
  color: var(--signal-cyan);
}

.badge-unhandled {
  background: rgba(239, 68, 68, 0.16);
  color: var(--status-danger);
}

.badge-people {
  background: rgba(168, 85, 247, 0.16);
  color: #c084fc;
}

.badge-level {
  background: rgba(245, 158, 11, 0.16);
  color: var(--status-warning);
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

.capsule-number.level-text {
  font-size: 22px;
  color: var(--status-warning);
}

.capsule-unit {
  font-size: 12px;
  color: var(--text-muted);
}

.capsule--total .capsule-number {
  color: #38bdf8;
}

.capsule--unhandled .capsule-number {
  color: #f87171;
}

.capsule--people .capsule-number {
  color: #c084fc;
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
  width: 220px;
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
  width: 140px;
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

.warnings-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  font-size: 13px;
}

.warnings-table th {
  padding: 12px 14px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  background: rgba(9, 14, 23, 0.95);
  border-bottom: 1px solid var(--border-subtle);
  white-space: nowrap;
}

.warnings-table td {
  padding: 12px 14px;
  color: var(--text-primary);
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  vertical-align: middle;
  white-space: nowrap;
}

/* 表格行样式 */
.warnings-row {
  transition: background 0.14s ease;
}

.warnings-row:hover {
  background: rgba(56, 189, 248, 0.05);
}

/* 越界进行中行：左侧 3px 红色条 */
.warnings-row.is-open-row {
  background: rgba(239, 68, 68, 0.035);
}

.warnings-row.is-open-row:hover {
  background: rgba(239, 68, 68, 0.07);
}

.warnings-row.is-open-row td:first-child {
  position: relative;
}

.warnings-row.is-open-row td:first-child::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--status-danger);
}

/* 姓名可点击链接 */
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

.team-cell {
  color: var(--text-secondary);
}

/* 指标徽章 */
.metric-tag {
  display: inline-block;
  padding: 2px 7px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  border: 1px solid transparent;
}

.metric--heartRate {
  background: rgba(248, 113, 113, 0.12);
  color: #f87171;
  border-color: rgba(248, 113, 113, 0.25);
}

.metric--bloodOxygen {
  background: rgba(52, 211, 153, 0.12);
  color: #34d399;
  border-color: rgba(52, 211, 153, 0.25);
}

.metric--bloodPressure {
  background: rgba(56, 189, 248, 0.12);
  color: #38bdf8;
  border-color: rgba(56, 189, 248, 0.25);
}

.metric--temperature {
  background: rgba(251, 191, 36, 0.12);
  color: #fbbf24;
  border-color: rgba(251, 191, 36, 0.25);
}

.metric--pressure {
  background: rgba(167, 139, 250, 0.12);
  color: #a78bfa;
  border-color: rgba(167, 139, 250, 0.25);
}

/* 越界数值高亮 */
.val-abnormal {
  color: #f87171 !important;
  font-weight: 700;
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

.dot-danger {
  background: #ef4444;
}

.dot-normal {
  background: #22c55e;
}

.dot-warning {
  background: #f59e0b;
}

.phase--open {
  background: rgba(239, 68, 68, 0.14);
  color: #f87171;
}

.phase--recovered {
  background: rgba(34, 197, 94, 0.12);
  color: #4ade80;
}

.handled--no {
  background: rgba(245, 158, 11, 0.12);
  color: #fbbf24;
}

.handled--yes {
  background: rgba(100, 116, 139, 0.14);
  color: #94a3b8;
}

.handled-icon {
  font-size: 12px;
}

/* 操作列按钮 */
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

.btn-act:hover {
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

.btn-act-handle.is-handled {
  opacity: 0.6;
}

.btn-act-handle:hover {
  color: #fff;
  border-color: var(--signal-cyan);
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
.warnings-pagination {
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
