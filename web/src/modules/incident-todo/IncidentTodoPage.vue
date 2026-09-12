<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Bell, Clock, Refresh, Search, User, Warning } from '@element-plus/icons-vue'
import { isMockApiError, newRequestId } from '@/mock/errors'
import { formatDateTime, formatSla } from '@/mock/format'
import {
  fetchIncidentList,
  submitIncidentAction,
} from '@/mock/incidentApi'
import { HANDLING_LABELS, SEVERITY_LABELS, SOURCE_LABELS } from '@/mock/labels'
import { DEPARTMENTS } from '@/mock/org'
import { INCIDENT_SCENE_OPTIONS } from '@/mock/session'
import { useIncidentWorkspace } from '@/stores/incidentWorkspace'
import IncidentDetailDrawer from './IncidentDetailDrawer.vue'
import type {
  HandlingState,
  IncidentDemoScene,
  IncidentListItem,
  IncidentQuery,
  IncidentSource,
  IncidentSummary,
  Severity,
} from '@/mock/types'
import '@/styles/list-page.css'

defineOptions({ name: 'IncidentTodoPage' })

const route = useRoute()
const router = useRouter()
const workspace = useIncidentWorkspace()

const scene = ref<IncidentDemoScene>('default')
const loading = ref(false)
const refreshing = ref(false)
const lastRefreshTime = ref('16:00:00')
const errorMessage = ref('')
const cacheNotice = ref('')
const list = ref<IncidentListItem[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const summary = ref<IncidentSummary>({
  totalTodo: 0,
  mine: 0,
  criticalUnconfirmed: 0,
  unassigned: 0,
  overdue: 0,
  generatedAt: '',
  dataNote: 'mock 测试数据，非正式接口统计',
})

const draft = reactive({
  keyword: '',
  departmentId: 'all',
  source: 'all' as IncidentSource | 'all',
  severity: 'all' as Severity | 'all',
  handlingState: 'todo' as HandlingState | 'all' | 'todo',
  timeRange: 'all' as 'all' | 'today' | '3d' | '7d',
  mineOnly: false,
  unassignedOnly: false,
  overdueOnly: false,
  criticalUnconfirmedOnly: false,
})

const applied = reactive({ ...draft })
const rowPending = ref('')
const hasLoaded = ref(false)

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))
const pageNumbers = computed(() => {
  const pages = totalPages.value
  const current = page.value
  if (pages <= 7) return Array.from({ length: pages }, (_, index) => index + 1)
  const items = new Set([1, pages, current, current - 1, current + 1])
  return [...items].filter((item) => item >= 1 && item <= pages).sort((a, b) => a - b)
})

const emptyKind = computed<'forbidden' | 'error' | 'empty' | 'filtered' | null>(() => {
  if (errorMessage.value && !hasLoaded.value) return errorMessage.value.includes('无权') ? 'forbidden' : 'error'
  if (loading.value) return null
  if (list.value.length > 0) return null
  if (hasActiveFilters.value && total.value === 0) return 'filtered'
  if (summary.value.totalTodo === 0) return 'empty'
  return 'filtered'
})

const hasActiveFilters = computed(() => {
  return Boolean(
    applied.keyword.trim()
    || applied.departmentId !== 'all'
    || applied.source !== 'all'
    || applied.severity !== 'all'
    || applied.handlingState !== 'todo'
    || applied.timeRange !== 'all'
    || applied.mineOnly
    || applied.unassignedOnly
    || applied.overdueOnly
    || applied.criticalUnconfirmedOnly,
  )
})

function queryFromApplied(): IncidentQuery {
  return {
    keyword: applied.keyword,
    departmentId: applied.departmentId,
    source: applied.source,
    severity: applied.severity,
    handlingState: applied.handlingState,
    timeRange: applied.timeRange,
    mineOnly: applied.mineOnly,
    unassignedOnly: applied.unassignedOnly,
    overdueOnly: applied.overdueOnly,
    criticalUnconfirmedOnly: applied.criticalUnconfirmedOnly,
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

async function loadList(options: { refresh?: boolean } = {}) {
  if (options.refresh) refreshing.value = true
  else loading.value = true
  if (!options.refresh) errorMessage.value = ''
  try {
    const result = await fetchIncidentList(scene.value, queryFromApplied(), { refresh: options.refresh })
    list.value = result.list
    total.value = result.total
    page.value = result.page
    pageSize.value = result.pageSize
    summary.value = result.summary
    hasLoaded.value = true
    cacheNotice.value = ''
    errorMessage.value = ''
    stampRefreshTime()
  } catch (error) {
    const message = isMockApiError(error) ? `${error.message}（错误编号 ${error.requestId}）` : '待办事件加载失败'
    if (hasLoaded.value && isMockApiError(error) && error.code === 'UNAVAILABLE') {
      cacheNotice.value = message
      ElMessage.warning(message)
    } else {
      errorMessage.value = message
      if (!hasLoaded.value) {
        list.value = []
        total.value = 0
        summary.value = {
          totalTodo: 0,
          mine: 0,
          criticalUnconfirmed: 0,
          unassigned: 0,
          overdue: 0,
          generatedAt: '',
          dataNote: 'mock 测试数据，非正式接口统计',
        }
      }
    }
  } finally {
    loading.value = false
    refreshing.value = false
  }
}

function applyDraft() {
  Object.assign(applied, { ...draft })
  page.value = 1
  syncUrl()
  void loadList()
}

function resetFilters() {
  Object.assign(draft, {
    keyword: '',
    departmentId: 'all',
    source: 'all',
    severity: 'all',
    handlingState: 'todo',
    timeRange: 'all',
    mineOnly: false,
    unassignedOnly: false,
    overdueOnly: false,
    criticalUnconfirmedOnly: false,
  })
  applyDraft()
}

function clickCapsule(kind: 'mine' | 'critical' | 'unassigned' | 'overdue') {
  const active =
    (kind === 'mine' && draft.mineOnly)
    || (kind === 'critical' && draft.criticalUnconfirmedOnly)
    || (kind === 'unassigned' && draft.unassignedOnly)
    || (kind === 'overdue' && draft.overdueOnly)

  draft.mineOnly = false
  draft.unassignedOnly = false
  draft.overdueOnly = false
  draft.criticalUnconfirmedOnly = false
  draft.severity = 'all'
  draft.handlingState = 'todo'

  if (!active) {
    if (kind === 'mine') draft.mineOnly = true
    if (kind === 'unassigned') draft.unassignedOnly = true
    if (kind === 'overdue') draft.overdueOnly = true
    if (kind === 'critical') {
      draft.criticalUnconfirmedOnly = true
      draft.severity = 'critical'
      draft.handlingState = 'new'
    }
  }
  applyDraft()
}

function goToPage(next: number) {
  if (next < 1 || next > totalPages.value || next === page.value) return
  page.value = next
  syncUrl()
  void loadList()
}

function changePageSize(size: number) {
  pageSize.value = size
  page.value = 1
  syncUrl()
  void loadList()
}

function openIncident(id: string) {
  workspace.scene = scene.value
  workspace.openIncident(id, scene.value)
  syncUrl(id)
}

function onDrawerChanged() {
  void loadList()
  if (!workspace.open) syncUrl(null)
}

function syncUrl(incidentId = workspace.incidentId) {
  const query: Record<string, string> = {}
  if (scene.value !== 'default') query.scene = scene.value
  if (incidentId) query.incidentId = incidentId
  if (page.value > 1) query.page = String(page.value)
  if (pageSize.value !== 20) query.pageSize = String(pageSize.value)
  void router.replace({ query })
}

async function onRowAction(item: IncidentListItem, action: 'confirm' | 'assign') {
  if (rowPending.value) return
  if (action === 'assign') {
    openIncident(item.incidentId)
    return
  }
  rowPending.value = `${item.incidentId}:${action}`
  try {
    await submitIncidentAction(scene.value, item.incidentId, {
      action,
      version: item.version,
      requestId: newRequestId('OK'),
    })
    ElMessage.success('确认已保存（mock 测试数据，未发送外部通知）')
    await loadList()
  } catch (error) {
    const message = isMockApiError(error) ? `${error.message}（错误编号 ${error.requestId}）` : '操作失败'
    ElMessage.error(message)
    await loadList()
  } finally {
    rowPending.value = ''
  }
}

function onSceneChange(value: IncidentDemoScene) {
  scene.value = value
  workspace.scene = value
  workspace.clearIncident()
  hasLoaded.value = false
  cacheNotice.value = ''
  errorMessage.value = ''
  page.value = 1
  syncUrl()
  void loadList()
}

onMounted(() => {
  const query = route.query
  if (typeof query.scene === 'string' && INCIDENT_SCENE_OPTIONS.some((item) => item.value === query.scene)) {
    scene.value = query.scene as IncidentDemoScene
  }
  if (typeof query.page === 'string') page.value = Number(query.page) || 1
  if (query.pageSize === '50') pageSize.value = 50
  workspace.scene = scene.value
  void loadList().then(() => {
    if (typeof query.incidentId === 'string' && query.incidentId) {
      openIncident(query.incidentId)
    }
  })
})
</script>

<template>
  <div class="hn-page">
    <header class="hn-header">
      <div class="hn-header-left">
        <h1 class="hn-title">待办事件</h1>
        <span class="hn-desc">集中处理尚未办完的事件，不是预警历史记录</span>
        <span class="hn-mock-tag">mock 测试数据</span>
      </div>
      <div class="hn-header-right">
        <el-select v-model="scene" class="hn-scene-select" aria-label="演示场景" @change="onSceneChange">
          <el-option
            v-for="item in INCIDENT_SCENE_OPTIONS"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </el-select>
        <span class="hn-refresh-time">
          数据刷新于：<span class="hn-mono">{{ lastRefreshTime }}</span>
        </span>
        <button
          type="button"
          class="hn-btn hn-btn-refresh"
          :class="{ 'is-loading': refreshing }"
          :disabled="loading || refreshing"
          @click="loadList({ refresh: true })"
        >
          <el-icon class="hn-spin"><Refresh /></el-icon>
          <span>刷新</span>
        </button>
      </div>
    </header>

    <div v-if="cacheNotice" class="hn-banner is-warn">
      <span>{{ cacheNotice }}。统计时钟 {{ summary.generatedAt || '上次成功时间' }}。</span>
      <button type="button" class="hn-btn hn-btn-refresh" @click="loadList({ refresh: true })">重试</button>
    </div>
    <div v-else-if="errorMessage && hasLoaded" class="hn-banner is-error">
      <span>{{ errorMessage }}</span>
      <button type="button" class="hn-btn hn-btn-refresh" @click="loadList()">重试</button>
    </div>

    <section class="hn-capsules">
      <div
        class="hn-capsule"
        :class="{ 'is-active': applied.mineOnly }"
        title="点击筛选当前处理人的待办"
        @click="clickCapsule('mine')"
      >
        <div class="hn-capsule-head">
          <span class="hn-capsule-label">我的待办</span>
          <span class="hn-capsule-icon is-cyan"><el-icon><User /></el-icon></span>
        </div>
        <div class="hn-capsule-body">
          <span class="hn-capsule-number is-cyan">{{ summary.mine }}</span>
          <span class="hn-capsule-unit">条</span>
        </div>
        <div class="hn-capsule-meta">当前处理人为我的待办</div>
      </div>

      <div
        class="hn-capsule"
        :class="{ 'is-active': applied.criticalUnconfirmedOnly }"
        title="点击筛选高危且新建的事件"
        @click="clickCapsule('critical')"
      >
        <div class="hn-capsule-head">
          <span class="hn-capsule-label">高危未确认</span>
          <span class="hn-capsule-icon is-danger"><el-icon><Warning /></el-icon></span>
        </div>
        <div class="hn-capsule-body">
          <span class="hn-capsule-number is-danger">{{ summary.criticalUnconfirmed }}</span>
          <span class="hn-capsule-unit">条</span>
        </div>
        <div class="hn-capsule-meta">高危且仍为新建</div>
      </div>

      <div
        class="hn-capsule"
        :class="{ 'is-active': applied.unassignedOnly }"
        title="点击筛选未分派事件"
        @click="clickCapsule('unassigned')"
      >
        <div class="hn-capsule-head">
          <span class="hn-capsule-label">未分派</span>
          <span class="hn-capsule-icon is-muted"><el-icon><Bell /></el-icon></span>
        </div>
        <div class="hn-capsule-body">
          <span class="hn-capsule-number is-muted">{{ summary.unassigned }}</span>
          <span class="hn-capsule-unit">条</span>
        </div>
        <div class="hn-capsule-meta">尚无责任人</div>
      </div>

      <div
        class="hn-capsule"
        :class="{ 'is-active': applied.overdueOnly }"
        title="点击筛选已超时事件"
        @click="clickCapsule('overdue')"
      >
        <div class="hn-capsule-head">
          <span class="hn-capsule-label">已超时</span>
          <span class="hn-capsule-icon is-warning"><el-icon><Clock /></el-icon></span>
        </div>
        <div class="hn-capsule-body">
          <span class="hn-capsule-number is-warning">{{ summary.overdue }}</span>
          <span class="hn-capsule-unit">条</span>
        </div>
        <div class="hn-capsule-meta">相对测试时钟已超过处理时限</div>
      </div>
    </section>

    <section class="hn-filter">
      <div class="hn-filter-group hn-filter-search">
        <el-input
          v-model="draft.keyword"
          placeholder="人员 / 工号 / 事件编号"
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
        <label class="hn-filter-label">来源：</label>
        <el-select v-model="draft.source" class="hn-select-sm">
          <el-option label="全部来源" value="all" />
          <el-option label="体征超限" value="HEALTH_THRESHOLD" />
          <el-option label="设备主动报警" value="DEVICE_ALARM" />
          <el-option label="趋势风险" value="TREND_WARNING" />
        </el-select>
      </div>
      <div class="hn-filter-group">
        <label class="hn-filter-label">严重度：</label>
        <el-select v-model="draft.severity" class="hn-select-sm">
          <el-option label="全部严重度" value="all" />
          <el-option label="高危" value="critical" />
          <el-option label="关注" value="warning" />
          <el-option label="普通" value="info" />
        </el-select>
      </div>
      <div class="hn-filter-group">
        <label class="hn-filter-label">状态：</label>
        <el-select v-model="draft.handlingState" class="hn-select-sm">
          <el-option label="全部待办" value="todo" />
          <el-option label="新建" value="new" />
          <el-option label="已确认" value="confirmed" />
          <el-option label="已分派" value="assigned" />
          <el-option label="处理中" value="processing" />
          <el-option label="处理完成" value="completed" />
          <el-option label="已关闭" value="closed" />
          <el-option label="误报" value="false_alarm" />
        </el-select>
      </div>
      <div class="hn-filter-group">
        <label class="hn-filter-label">时间：</label>
        <el-select v-model="draft.timeRange" class="hn-select-sm">
          <el-option label="全部时间" value="all" />
          <el-option label="今天" value="today" />
          <el-option label="近 3 天" value="3d" />
          <el-option label="近 7 天" value="7d" />
        </el-select>
      </div>
      <button type="button" class="hn-btn hn-btn-query" @click="applyDraft">查询</button>
      <button type="button" class="hn-btn hn-btn-reset" @click="resetFilters">重置</button>
      <div class="hn-filter-count">
        匹配记录：<strong>{{ total }}</strong> 条
        · 总待办 <strong>{{ summary.totalTodo }}</strong>
      </div>
    </section>

    <section class="hn-table-card">
      <div v-if="loading" class="hn-loading-mask">正在加载待办事件…</div>
      <div class="hn-table-scroll">
        <table class="hn-table">
          <thead>
            <tr>
              <th>人员</th>
              <th class="col-hide-sm">部门</th>
              <th>事件</th>
              <th class="col-hide-md">来源</th>
              <th class="col-hide-sm">严重程度</th>
              <th class="col-hide-md">责任人</th>
              <th class="col-status col-hide-sm">状态</th>
              <th class="col-actions">操作</th>
            </tr>
          </thead>
          <tbody v-if="list.length > 0">
            <tr
              v-for="item in list"
              :key="item.incidentId"
              class="hn-row"
              :class="{ 'is-critical': item.severity === 'critical' && item.handlingState !== 'closed' }"
            >
              <td>
                <button type="button" class="hn-link" @click="openIncident(item.incidentId)">
                  {{ item.employeeName }}
                </button>
                <div class="hn-mono" style="font-size: 12px">{{ item.employeeId }}</div>
              </td>
              <td class="col-hide-sm">{{ item.departmentName }}</td>
              <td class="cell-stack">
                <div>{{ item.eventName }}</div>
                <div class="cell-sub hn-mono col-hide-sm">{{ formatDateTime(item.occurredAt) }}</div>
                <div v-if="formatSla(item.dueAt).overdue" class="cell-sub is-overdue col-show-sm">已超时</div>
                <div v-if="item.missingFields.length" class="hn-empty-val">字段缺失：{{ item.missingFields.join('、') }}</div>
              </td>
              <td class="is-nowrap col-hide-md">
                <span class="hn-source" :class="`is-${item.source}`">{{ SOURCE_LABELS[item.source] }}</span>
              </td>
              <td class="is-nowrap col-hide-sm">
                <span class="hn-status" :class="`is-${item.severity}`">
                  <span class="hn-dot" />
                  {{ SEVERITY_LABELS[item.severity] }}
                </span>
              </td>
              <td class="is-nowrap col-hide-md">{{ item.assigneeName || '未分派' }}</td>
              <td class="cell-stack col-status col-hide-sm">
                <span class="hn-status" :class="`is-${item.handlingState}`">
                  <span class="hn-dot" />
                  {{ HANDLING_LABELS[item.handlingState] }}
                </span>
                <div class="cell-sub" :class="{ 'is-overdue': formatSla(item.dueAt).overdue }">
                  {{ formatSla(item.dueAt).text }}
                </div>
              </td>
              <td class="is-nowrap col-actions">
                <div class="hn-actions">
                  <button type="button" class="hn-act is-link" @click="openIncident(item.incidentId)">查看</button>
                  <button
                    v-if="item.allowedActions.includes('confirm')"
                    type="button"
                    class="hn-act col-hide-sm"
                    :disabled="Boolean(rowPending)"
                    @click="onRowAction(item, 'confirm')"
                  >
                    确认
                  </button>
                  <button
                    v-if="item.allowedActions.includes('assign')"
                    type="button"
                    class="hn-act col-hide-sm"
                    :disabled="Boolean(rowPending)"
                    @click="onRowAction(item, 'assign')"
                  >
                    分派
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        <div v-if="!loading && emptyKind === 'forbidden'" class="hn-empty">
          <div class="hn-empty-icon"><el-icon :size="32"><Warning /></el-icon></div>
          <div class="hn-empty-title">无权限查看待办事件</div>
          <div class="hn-empty-desc">{{ errorMessage || '当前账号不能查看该名单。' }}</div>
        </div>
        <div v-else-if="!loading && emptyKind === 'error'" class="hn-empty">
          <div class="hn-empty-icon"><el-icon :size="32"><Warning /></el-icon></div>
          <div class="hn-empty-title">待办事件加载失败</div>
          <div class="hn-empty-desc">{{ errorMessage }}</div>
          <button type="button" class="hn-btn hn-btn-refresh" @click="loadList()">重试</button>
        </div>
        <div v-else-if="!loading && emptyKind === 'empty'" class="hn-empty">
          <div class="hn-empty-icon"><el-icon :size="32"><Bell /></el-icon></div>
          <div class="hn-empty-title">当前没有待办事件</div>
          <div class="hn-empty-desc">没有需要处理的新建、已确认、已分派、处理中或处理完成事件。可刷新后再次检查。</div>
          <button type="button" class="hn-btn hn-btn-refresh" @click="loadList({ refresh: true })">刷新</button>
        </div>
        <div v-else-if="!loading && emptyKind === 'filtered'" class="hn-empty">
          <div class="hn-empty-icon"><el-icon :size="32"><Search /></el-icon></div>
          <div class="hn-empty-title">无符合条件的记录</div>
          <div class="hn-empty-desc">当前筛选没有匹配的待办。请调整条件或重置后重试。</div>
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

    <IncidentDetailDrawer @changed="onDrawerChanged" />
  </div>
</template>
