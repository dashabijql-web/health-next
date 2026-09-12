<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Plus, Refresh, Search, User, Warning } from '@element-plus/icons-vue'
import { isMockApiError } from '@/mock/errors'
import { formatDateTime } from '@/mock/format'
import { EMPLOYMENT_LABELS, RISK_LABELS } from '@/mock/labels'
import { DEPARTMENTS, JOBS } from '@/mock/org'
import { fetchPeopleList } from '@/mock/peopleApi'
import { PEOPLE_SCENE_OPTIONS } from '@/mock/session'
import { useIncidentWorkspace } from '@/stores/incidentWorkspace'
import IncidentDetailDrawer from '@/modules/incident-todo/IncidentDetailDrawer.vue'
import PersonDetailDrawer from './PersonDetailDrawer.vue'
import PersonFormDrawer from './PersonFormDrawer.vue'
import type {
  DeviceBindingStatus,
  EmploymentStatus,
  PeopleDemoScene,
  PersonListItem,
} from '@/mock/types'
import '@/styles/list-page.css'

defineOptions({ name: 'PeopleArchivePage' })

const route = useRoute()
const router = useRouter()
const workspace = useIncidentWorkspace()

const scene = ref<PeopleDemoScene>('default')
const loading = ref(false)
const lastRefreshTime = ref('16:00:00')
const errorMessage = ref('')
const list = ref<PersonListItem[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const hasLoaded = ref(false)

const draft = reactive({
  keyword: '',
  departmentId: 'all',
  jobId: 'all',
  employmentStatus: 'all' as EmploymentStatus | 'all',
  deviceBinding: 'all' as DeviceBindingStatus | 'all',
})
const applied = reactive({ ...draft })

const detailOpen = ref(false)
const formOpen = ref(false)
const formMode = ref<'create' | 'edit'>('create')
const activeEmployeeId = ref<string | null>(null)

const canWrite = computed(() => scene.value === 'default' || scene.value === 'empty')
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))
const pageNumbers = computed(() => Array.from({ length: totalPages.value }, (_, index) => index + 1))

const emptyKind = computed<'forbidden' | 'error' | 'empty' | 'filtered' | null>(() => {
  if (errorMessage.value && errorMessage.value.includes('无权')) return 'forbidden'
  if (errorMessage.value && !hasLoaded.value) return 'error'
  if (loading.value) return null
  if (list.value.length > 0) return null
  if (hasActiveFilters.value) return 'filtered'
  return 'empty'
})

const hasActiveFilters = computed(() => {
  return Boolean(
    applied.keyword.trim()
    || applied.departmentId !== 'all'
    || applied.jobId !== 'all'
    || applied.employmentStatus !== 'all'
    || applied.deviceBinding !== 'all',
  )
})

function stampRefreshTime() {
  const now = new Date()
  lastRefreshTime.value = [now.getHours(), now.getMinutes(), now.getSeconds()]
    .map((item) => String(item).padStart(2, '0'))
    .join(':')
}

async function loadList() {
  loading.value = true
  errorMessage.value = ''
  try {
    const result = await fetchPeopleList(scene.value, {
      ...applied,
      page: page.value,
      pageSize: pageSize.value,
    })
    list.value = result.list
    total.value = result.total
    page.value = result.page
    pageSize.value = result.pageSize
    hasLoaded.value = true
    stampRefreshTime()
  } catch (error) {
    const message = isMockApiError(error) ? `${error.message}（错误编号 ${error.requestId}）` : '人员档案加载失败'
    errorMessage.value = message
    if (!hasLoaded.value) {
      list.value = []
      total.value = 0
    } else {
      ElMessage.error(message)
    }
  } finally {
    loading.value = false
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
    jobId: 'all',
    employmentStatus: 'all',
    deviceBinding: 'all',
  })
  applyDraft()
}

function goToPage(next: number) {
  if (next < 1 || next > totalPages.value || next === page.value) return
  page.value = next
  syncUrl()
  void loadList()
}

function onSceneChange(value: PeopleDemoScene) {
  scene.value = value
  hasLoaded.value = false
  page.value = 1
  detailOpen.value = false
  formOpen.value = false
  syncUrl()
  void loadList()
}

function syncUrl() {
  const query: Record<string, string> = {}
  if (scene.value !== 'default') query.scene = scene.value
  if (page.value > 1) query.page = String(page.value)
  void router.replace({ query })
}

function openCreate() {
  formMode.value = 'create'
  activeEmployeeId.value = null
  formOpen.value = true
}

function openEdit(employeeId: string) {
  formMode.value = 'edit'
  activeEmployeeId.value = employeeId
  formOpen.value = true
  detailOpen.value = false
}

function openDetail(employeeId: string) {
  activeEmployeeId.value = employeeId
  detailOpen.value = true
}

function openIncident(id: string) {
  workspace.scene = 'default'
  workspace.openIncident(id, 'default')
}

onMounted(() => {
  const query = route.query
  if (typeof query.scene === 'string' && PEOPLE_SCENE_OPTIONS.some((item) => item.value === query.scene)) {
    scene.value = query.scene as PeopleDemoScene
  }
  if (typeof query.page === 'string') page.value = Number(query.page) || 1
  void loadList()
})
</script>

<template>
  <div class="hn-page">
    <header class="hn-header">
      <div class="hn-header-left">
        <h1 class="hn-title">人员档案</h1>
        <span class="hn-desc">登记和查找职工，联系方式按权限脱敏</span>
        <span class="hn-mock-tag">mock 测试数据</span>
      </div>
      <div class="hn-header-right">
        <el-select v-model="scene" class="hn-scene-select" aria-label="演示场景" @change="onSceneChange">
          <el-option v-for="item in PEOPLE_SCENE_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <span class="hn-refresh-time">
          数据刷新于：<span class="hn-mono">{{ lastRefreshTime }}</span>
        </span>
        <button type="button" class="hn-btn hn-btn-refresh" :disabled="loading" @click="loadList">
          <el-icon class="hn-spin"><Refresh /></el-icon>
          <span>刷新</span>
        </button>
        <button v-if="canWrite" type="button" class="hn-btn hn-btn-query" @click="openCreate">
          <el-icon><Plus /></el-icon>
          <span>新增</span>
        </button>
      </div>
    </header>

    <section class="hn-filter">
      <div class="hn-filter-group hn-filter-search">
        <el-input
          v-model="draft.keyword"
          placeholder="姓名 / 工号 / 手机号 / IMEI"
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
        <label class="hn-filter-label">工种：</label>
        <el-select v-model="draft.jobId" class="hn-select-sm">
          <el-option label="全部工种" value="all" />
          <el-option v-for="item in JOBS" :key="item.id" :label="item.name" :value="item.id" />
        </el-select>
      </div>
      <div class="hn-filter-group">
        <label class="hn-filter-label">在职：</label>
        <el-select v-model="draft.employmentStatus" class="hn-select-sm">
          <el-option label="全部状态" value="all" />
          <el-option label="在职" value="active" />
          <el-option label="请假" value="leave" />
          <el-option label="离职" value="resigned" />
        </el-select>
      </div>
      <div class="hn-filter-group">
        <label class="hn-filter-label">设备：</label>
        <el-select v-model="draft.deviceBinding" class="hn-select-sm">
          <el-option label="全部绑定" value="all" />
          <el-option label="已绑定" value="bound" />
          <el-option label="未绑定" value="unbound" />
        </el-select>
      </div>
      <button type="button" class="hn-btn hn-btn-query" @click="applyDraft">查询</button>
      <button type="button" class="hn-btn hn-btn-reset" @click="resetFilters">重置</button>
      <div class="hn-filter-count">
        匹配结果：<strong>{{ total }}</strong> 人
      </div>
    </section>

    <section class="hn-table-card">
      <div v-if="loading" class="hn-loading-mask">正在加载人员档案…</div>
      <div class="hn-table-scroll">
        <table class="hn-table">
          <thead>
            <tr>
              <th>姓名</th>
              <th class="col-hide-sm">工号</th>
              <th class="col-hide-md">部门</th>
              <th class="col-hide-md">工种</th>
              <th class="col-hide-md">联系方式</th>
              <th class="col-hide-md">设备绑定</th>
              <th class="col-hide-lg">最近在线</th>
              <th class="col-hide-lg">最近健康数据</th>
              <th class="col-hide-lg">当前风险</th>
              <th class="col-actions">操作</th>
            </tr>
          </thead>
          <tbody v-if="list.length > 0">
            <tr v-for="item in list" :key="item.employeeId" class="hn-row">
              <td>
                <button type="button" class="hn-link" @click="openDetail(item.employeeId)">{{ item.empName }}</button>
              </td>
              <td class="hn-mono col-hide-sm">{{ item.empCode }}</td>
              <td class="col-hide-md">{{ item.departmentName }}</td>
              <td class="is-nowrap col-hide-md">{{ item.jobName }}</td>
              <td class="is-nowrap col-hide-md">
                {{ item.phoneDisplay }}
                <span v-if="item.contactMasked" class="hn-empty-val">脱敏</span>
              </td>
              <td class="col-hide-md">
                <span class="hn-status" :class="item.deviceBinding === 'bound' ? 'is-active' : 'is-unbound'">
                  <span class="hn-dot" />
                  {{ item.deviceBinding === 'bound' ? '已绑定' : '未绑定' }}
                </span>
                <div v-if="item.imei" class="hn-mono" style="font-size: 12px">{{ item.imei }}</div>
              </td>
              <td class="is-nowrap hn-mono col-hide-lg">{{ formatDateTime(item.lastOnlineAt) }}</td>
              <td class="is-nowrap hn-mono col-hide-lg">{{ formatDateTime(item.lastHealthAt) }}</td>
              <td class="is-nowrap col-hide-lg">
                <span
                  class="hn-status"
                  :class="item.currentRisk === 'critical' ? 'is-critical' : item.currentRisk === 'attention' ? 'is-attention' : `is-${item.currentRisk}`"
                >
                  <span class="hn-dot" />
                  {{ RISK_LABELS[item.currentRisk] }}
                </span>
              </td>
              <td class="is-nowrap col-actions">
                <div class="hn-actions">
                  <button type="button" class="hn-act is-link" @click="openDetail(item.employeeId)">查看</button>
                  <button v-if="canWrite" type="button" class="hn-act col-hide-sm" @click="openEdit(item.employeeId)">编辑</button>
                  <button
                    v-if="item.openIncidentId"
                    type="button"
                    class="hn-act col-hide-sm"
                    @click="openIncident(item.openIncidentId)"
                  >
                    事件
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        <div v-if="!loading && emptyKind === 'forbidden'" class="hn-empty">
          <div class="hn-empty-icon"><el-icon :size="32"><Warning /></el-icon></div>
          <div class="hn-empty-title">无权限查看人员档案</div>
          <div class="hn-empty-desc">{{ errorMessage }}</div>
        </div>
        <div v-else-if="!loading && emptyKind === 'error'" class="hn-empty">
          <div class="hn-empty-icon"><el-icon :size="32"><Warning /></el-icon></div>
          <div class="hn-empty-title">人员档案加载失败</div>
          <div class="hn-empty-desc">{{ errorMessage }}</div>
          <button type="button" class="hn-btn hn-btn-refresh" @click="loadList">重试</button>
        </div>
        <div v-else-if="!loading && emptyKind === 'empty'" class="hn-empty">
          <div class="hn-empty-icon"><el-icon :size="32"><User /></el-icon></div>
          <div class="hn-empty-title">当前没有人员档案</div>
          <div class="hn-empty-desc">还没有职工记录。有权限时可新增，或刷新后再检查。</div>
          <button v-if="canWrite" type="button" class="hn-btn hn-btn-query" @click="openCreate">新增人员</button>
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
      :scene="scene"
      :can-write="canWrite"
      @edit="openEdit"
    />
    <PersonFormDrawer
      v-model="formOpen"
      :mode="formMode"
      :employee-id="activeEmployeeId"
      :scene="scene"
      @saved="loadList"
    />
    <IncidentDetailDrawer />
  </div>
</template>
