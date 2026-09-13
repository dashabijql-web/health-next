<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Cpu, Link, Monitor, Plus, Refresh, Search, SwitchButton, Warning } from '@element-plus/icons-vue'
import { isMockApiError } from '@/mock/errors'
import { formatBattery, formatDateTimeParts } from '@/mock/format'
import { DEVICE_LIFECYCLE_LABELS, DEVICE_ONLINE_LABELS, LOW_BATTERY_THRESHOLD } from '@/mock/labels'
import { DEPARTMENTS } from '@/mock/org'
import {
  batchDeactivateDevices,
  batchUnbindDevices,
  bindDevice,
  deactivateDevice,
  DEVICE_IMPORT_SAMPLE,
  fetchBindCandidates,
  fetchDeviceList,
  fetchDeviceModels,
  importDevices,
  parseDeviceImportText,
  unbindDevice,
} from '@/mock/devicesApi'
import { DEVICE_SCENE_OPTIONS } from '@/mock/session'
import PersonDetailDrawer from '@/modules/people/PersonDetailDrawer.vue'
import DeviceDetailDrawer from './DeviceDetailDrawer.vue'
import DeviceFormDrawer from './DeviceFormDrawer.vue'
import type {
  BatchOpResult,
  DeviceBatteryFilter,
  DeviceBindCandidate,
  DeviceBindingStatus,
  DeviceDemoScene,
  DeviceListItem,
  DeviceOnlineStatus,
  DeviceSummary,
  PeopleDemoScene,
} from '@/mock/types'
import '@/styles/list-page.css'

defineOptions({ name: 'DeviceListPage' })

const route = useRoute()
const router = useRouter()

const scene = ref<DeviceDemoScene>('default')
const loading = ref(false)
const lastRefreshTime = ref('16:00:00')
const errorMessage = ref('')
const list = ref<DeviceListItem[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const hasLoaded = ref(false)
const models = ref<string[]>([])
const selected = ref<string[]>([])
const rowPending = ref('')
const detailNonce = ref(0)

const summary = ref<DeviceSummary>({
  total: 0,
  online: 0,
  offline: 0,
  lowBattery: 0,
  unbound: 0,
  generatedAt: '',
  dataNote: 'mock 测试数据，非正式接口统计，未连接手表与 Oracle',
})

const draft = reactive({
  imei: '',
  model: 'all' as string,
  onlineStatus: 'all' as DeviceOnlineStatus | 'all',
  bindingStatus: 'all' as DeviceBindingStatus | 'all',
  battery: 'all' as DeviceBatteryFilter,
  departmentId: 'all',
})
const applied = reactive({ ...draft })

const detailOpen = ref(false)
const formOpen = ref(false)
const formMode = ref<'create' | 'edit'>('create')
const activeDeviceId = ref<string | null>(null)
const personOpen = ref(false)
const activeEmployeeId = ref<string | null>(null)

const bindVisible = ref(false)
const unbindVisible = ref(false)
const deactivateVisible = ref(false)
const importVisible = ref(false)
const resultVisible = ref(false)
const bindEmployeeId = ref('')
const bindCandidates = ref<DeviceBindCandidate[]>([])
const importText = ref(DEVICE_IMPORT_SAMPLE)
const batchResult = ref<BatchOpResult | null>(null)
const confirmTarget = ref<DeviceListItem | null>(null)
const batchKind = ref<'unbind' | 'deactivate' | null>(null)

const canWrite = computed(() => scene.value === 'default' || scene.value === 'empty')
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
    applied.imei.trim()
    || applied.model !== 'all'
    || applied.onlineStatus !== 'all'
    || applied.bindingStatus !== 'all'
    || applied.battery !== 'all'
    || applied.departmentId !== 'all',
  )
})

const emptyKind = computed<'forbidden' | 'error' | 'empty' | 'filtered' | null>(() => {
  if (errorMessage.value && errorMessage.value.includes('无权')) return 'forbidden'
  if (errorMessage.value && !hasLoaded.value) return 'error'
  if (loading.value) return null
  if (list.value.length > 0) return null
  if (hasActiveFilters.value) return 'filtered'
  return 'empty'
})

const pageSelected = computed(() => list.value.filter((item) => selected.value.includes(item.deviceId)))
const allPageSelected = computed(() => list.value.length > 0 && pageSelected.value.length === list.value.length)

function stampRefreshTime() {
  const now = new Date()
  lastRefreshTime.value = [now.getHours(), now.getMinutes(), now.getSeconds()]
    .map((item) => String(item).padStart(2, '0'))
    .join(':')
}

function syncUrl(deviceId = activeDeviceId.value) {
  const query: Record<string, string> = {}
  if (scene.value !== 'default') query.scene = scene.value
  if (page.value > 1) query.page = String(page.value)
  if (pageSize.value !== 20) query.pageSize = String(pageSize.value)
  if (applied.imei.trim()) query.imei = applied.imei.trim()
  if (applied.model !== 'all') query.model = applied.model
  if (applied.onlineStatus !== 'all') query.onlineStatus = applied.onlineStatus
  if (applied.bindingStatus !== 'all') query.bindingStatus = applied.bindingStatus
  if (applied.battery !== 'all') query.battery = applied.battery
  if (applied.departmentId !== 'all') query.departmentId = applied.departmentId
  if (detailOpen.value && deviceId) query.deviceId = deviceId
  void router.replace({ query })
}

async function loadList() {
  loading.value = true
  errorMessage.value = ''
  try {
    const result = await fetchDeviceList(scene.value, {
      imei: applied.imei,
      model: applied.model,
      onlineStatus: applied.onlineStatus,
      bindingStatus: applied.bindingStatus,
      battery: applied.battery,
      departmentId: applied.departmentId,
      page: page.value,
      pageSize: pageSize.value,
    })
    list.value = result.list
    total.value = result.total
    page.value = result.page
    pageSize.value = result.pageSize
    summary.value = result.summary
    hasLoaded.value = true
    selected.value = selected.value.filter((id) => result.list.some((item) => item.deviceId === id))
    stampRefreshTime()
    detailNonce.value += 1
  } catch (error) {
    const message = isMockApiError(error) ? `${error.message}（错误编号 ${error.requestId}）` : '设备列表加载失败'
    errorMessage.value = message
    if (!hasLoaded.value) {
      list.value = []
      total.value = 0
      summary.value = {
        total: 0,
        online: 0,
        offline: 0,
        lowBattery: 0,
        unbound: 0,
        generatedAt: '',
        dataNote: 'mock 测试数据，非正式接口统计，未连接手表与 Oracle',
      }
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
    imei: '',
    model: 'all',
    onlineStatus: 'all',
    bindingStatus: 'all',
    battery: 'all',
    departmentId: 'all',
  })
  applyDraft()
}

function clickCapsule(kind: 'total' | 'online' | 'offline' | 'low' | 'unbound') {
  const active =
    (kind === 'online' && draft.onlineStatus === 'online' && draft.bindingStatus === 'all' && draft.battery === 'all')
    || (kind === 'offline' && draft.onlineStatus === 'offline' && draft.bindingStatus === 'all' && draft.battery === 'all')
    || (kind === 'low' && draft.battery === 'low' && draft.onlineStatus === 'all' && draft.bindingStatus === 'all')
    || (kind === 'unbound' && draft.bindingStatus === 'unbound' && draft.onlineStatus === 'all' && draft.battery === 'all')
    || (kind === 'total' && !hasActiveFilters.value)

  draft.onlineStatus = 'all'
  draft.bindingStatus = 'all'
  draft.battery = 'all'
  if (!active) {
    if (kind === 'online') draft.onlineStatus = 'online'
    if (kind === 'offline') draft.onlineStatus = 'offline'
    if (kind === 'low') draft.battery = 'low'
    if (kind === 'unbound') draft.bindingStatus = 'unbound'
  }
  applyDraft()
}

function goToPage(next: number) {
  if (next < 1 || next > totalPages.value || next === page.value) return
  page.value = next
  syncUrl()
  void loadList()
}

function changePageSize(size: number | string) {
  pageSize.value = Number(size) === 50 ? 50 : 20
  page.value = 1
  syncUrl()
  void loadList()
}

function onSceneChange(value: DeviceDemoScene) {
  scene.value = value
  hasLoaded.value = false
  page.value = 1
  selected.value = []
  detailOpen.value = false
  formOpen.value = false
  personOpen.value = false
  Object.assign(draft, {
    imei: '',
    model: 'all',
    onlineStatus: 'all',
    bindingStatus: 'all',
    battery: 'all',
    departmentId: 'all',
  })
  Object.assign(applied, { ...draft })
  syncUrl(null)
  void loadList()
}

function toggleAll(checked: boolean) {
  if (checked) selected.value = list.value.map((item) => item.deviceId)
  else selected.value = []
}

function toggleOne(deviceId: string, checked: boolean) {
  if (checked) selected.value = [...new Set([...selected.value, deviceId])]
  else selected.value = selected.value.filter((id) => id !== deviceId)
}

function openCreate() {
  formMode.value = 'create'
  activeDeviceId.value = null
  detailOpen.value = false
  formOpen.value = true
}

function openEdit(deviceId: string) {
  formMode.value = 'edit'
  activeDeviceId.value = deviceId
  detailOpen.value = false
  formOpen.value = true
}

function openDetail(deviceId: string) {
  activeDeviceId.value = deviceId
  detailOpen.value = true
  syncUrl(deviceId)
}

function onDetailClose() {
  detailOpen.value = false
  syncUrl(null)
}

function openPerson(employeeId: string) {
  activeEmployeeId.value = employeeId
  personOpen.value = true
}

function findRow(deviceId: string): DeviceListItem | undefined {
  return list.value.find((item) => item.deviceId === deviceId)
}

function dateParts(iso: string | null) {
  return formatDateTimeParts(iso)
}

async function openBind(deviceId: string) {
  activeDeviceId.value = deviceId
  confirmTarget.value = findRow(deviceId) ?? null
  bindEmployeeId.value = ''
  detailOpen.value = false
  try {
    bindCandidates.value = await fetchBindCandidates(scene.value)
    bindVisible.value = true
  } catch (error) {
    const message = isMockApiError(error) ? `${error.message}（错误编号 ${error.requestId}）` : '可绑定人员加载失败'
    ElMessage.error(message)
  }
}

function openUnbind(deviceId: string) {
  activeDeviceId.value = deviceId
  confirmTarget.value = findRow(deviceId) ?? null
  batchKind.value = null
  detailOpen.value = false
  unbindVisible.value = true
}

function openDeactivate(deviceId: string) {
  activeDeviceId.value = deviceId
  confirmTarget.value = findRow(deviceId) ?? null
  batchKind.value = null
  detailOpen.value = false
  deactivateVisible.value = true
}

async function afterMutation() {
  bindVisible.value = false
  unbindVisible.value = false
  deactivateVisible.value = false
  await loadList()
}

async function submitBind() {
  if (!activeDeviceId.value || rowPending.value) return
  rowPending.value = 'bind'
  try {
    await bindDevice(scene.value, activeDeviceId.value, bindEmployeeId.value, confirmTarget.value?.version)
    ElMessage.success('绑定已保存（mock 测试数据，人员与设备已同步，未连接手表）')
    await afterMutation()
  } catch (error) {
    const message = isMockApiError(error) ? `${error.message}（错误编号 ${error.requestId}）` : '绑定失败'
    ElMessage.error(message)
  } finally {
    rowPending.value = ''
  }
}

async function submitUnbind() {
  if (rowPending.value) return
  rowPending.value = 'unbind'
  try {
    if (batchKind.value === 'unbind') {
      batchResult.value = await batchUnbindDevices(scene.value, selected.value)
      resultVisible.value = true
      selected.value = []
    } else if (activeDeviceId.value) {
      await unbindDevice(scene.value, activeDeviceId.value, confirmTarget.value?.version)
      ElMessage.success('已解绑（mock 测试数据，人员档案中的设备编号已清空）')
    }
    await afterMutation()
  } catch (error) {
    const message = isMockApiError(error) ? `${error.message}（错误编号 ${error.requestId}）` : '解绑失败'
    ElMessage.error(message)
  } finally {
    rowPending.value = ''
  }
}

async function submitDeactivate() {
  if (rowPending.value) return
  rowPending.value = 'deactivate'
  try {
    if (batchKind.value === 'deactivate') {
      batchResult.value = await batchDeactivateDevices(scene.value, selected.value)
      resultVisible.value = true
      selected.value = []
    } else if (activeDeviceId.value) {
      await deactivateDevice(scene.value, activeDeviceId.value, confirmTarget.value?.version)
      ElMessage.success('设备已停用（mock 测试数据，未向手表发命令）')
    }
    await afterMutation()
  } catch (error) {
    const message = isMockApiError(error) ? `${error.message}（错误编号 ${error.requestId}）` : '停用失败'
    ElMessage.error(message)
  } finally {
    rowPending.value = ''
  }
}

function openBatchUnbind() {
  if (!selected.value.length) return
  batchKind.value = 'unbind'
  confirmTarget.value = null
  unbindVisible.value = true
}

function openBatchDeactivate() {
  if (!selected.value.length) return
  batchKind.value = 'deactivate'
  confirmTarget.value = null
  deactivateVisible.value = true
}

async function submitImport() {
  if (rowPending.value) return
  rowPending.value = 'import'
  try {
    const rows = parseDeviceImportText(importText.value)
    batchResult.value = await importDevices(scene.value, rows)
    importVisible.value = false
    resultVisible.value = true
    await loadList()
  } catch (error) {
    const message = isMockApiError(error) ? `${error.message}（错误编号 ${error.requestId}）` : '导入校验失败'
    ElMessage.error(message)
  } finally {
    rowPending.value = ''
  }
}

onMounted(async () => {
  models.value = await fetchDeviceModels()
  const query = route.query
  if (typeof query.scene === 'string' && DEVICE_SCENE_OPTIONS.some((item) => item.value === query.scene)) {
    scene.value = query.scene as DeviceDemoScene
  }
  if (typeof query.page === 'string') page.value = Number(query.page) || 1
  if (query.pageSize === '50') pageSize.value = 50
  if (typeof query.imei === 'string') draft.imei = query.imei
  if (typeof query.model === 'string') draft.model = query.model
  if (query.onlineStatus === 'online' || query.onlineStatus === 'offline') draft.onlineStatus = query.onlineStatus
  if (query.bindingStatus === 'bound' || query.bindingStatus === 'unbound') draft.bindingStatus = query.bindingStatus
  if (query.battery === 'low' || query.battery === 'normal' || query.battery === 'unknown') draft.battery = query.battery
  if (typeof query.departmentId === 'string') draft.departmentId = query.departmentId
  Object.assign(applied, { ...draft })
  await loadList()
  if (typeof query.deviceId === 'string' && query.deviceId) openDetail(query.deviceId)
})
</script>

<template>
  <div class="hn-page device-page">
    <header class="hn-header">
      <div class="hn-header-left">
        <h1 class="hn-title">设备管理</h1>
        <span class="hn-desc">登记手表、绑定人员、检查在线和电量，不连接真实设备</span>
        <span class="hn-mock-tag">mock 测试数据</span>
      </div>
      <div class="hn-header-right">
        <el-select v-model="scene" class="hn-scene-select" aria-label="演示场景" @change="onSceneChange">
          <el-option v-for="item in DEVICE_SCENE_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
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
        <button v-if="canWrite" type="button" class="hn-btn hn-btn-ghost" @click="importVisible = true">批量导入</button>
      </div>
    </header>

    <div v-if="errorMessage && hasLoaded" class="hn-banner is-error">
      <span>{{ errorMessage }}</span>
      <button type="button" class="hn-btn hn-btn-refresh" @click="loadList">重试</button>
    </div>

    <section class="hn-capsules is-five">
      <div class="hn-capsule" :class="{ 'is-active': !hasActiveFilters }" title="显示全部设备" @click="clickCapsule('total')">
        <div class="hn-capsule-head">
          <span class="hn-capsule-label">设备总数</span>
          <span class="hn-capsule-icon is-cyan"><el-icon><Monitor /></el-icon></span>
        </div>
        <div class="hn-capsule-body">
          <span class="hn-capsule-number is-cyan">{{ summary.total }}</span>
          <span class="hn-capsule-unit">台</span>
        </div>
        <div class="hn-capsule-meta">当前台账，含停用</div>
      </div>
      <div class="hn-capsule" :class="{ 'is-active': applied.onlineStatus === 'online' && applied.battery === 'all' && applied.bindingStatus === 'all' }" title="筛选在线设备" @click="clickCapsule('online')">
        <div class="hn-capsule-head">
          <span class="hn-capsule-label">在线</span>
          <span class="hn-capsule-icon is-cyan"><el-icon><Cpu /></el-icon></span>
        </div>
        <div class="hn-capsule-body">
          <span class="hn-capsule-number is-cyan">{{ summary.online }}</span>
          <span class="hn-capsule-unit">台</span>
        </div>
        <div class="hn-capsule-meta">15 分钟内有通信</div>
      </div>
      <div class="hn-capsule" :class="{ 'is-active': applied.onlineStatus === 'offline' && applied.battery === 'all' && applied.bindingStatus === 'all' }" title="筛选离线设备" @click="clickCapsule('offline')">
        <div class="hn-capsule-head">
          <span class="hn-capsule-label">离线</span>
          <span class="hn-capsule-icon is-muted"><el-icon><SwitchButton /></el-icon></span>
        </div>
        <div class="hn-capsule-body">
          <span class="hn-capsule-number is-muted">{{ summary.offline }}</span>
          <span class="hn-capsule-unit">台</span>
        </div>
        <div class="hn-capsule-meta">超时未收到心跳</div>
      </div>
      <div class="hn-capsule" :class="{ 'is-active': applied.battery === 'low' }" title="筛选低电设备" @click="clickCapsule('low')">
        <div class="hn-capsule-head">
          <span class="hn-capsule-label">低电</span>
          <span class="hn-capsule-icon is-warning"><el-icon><Warning /></el-icon></span>
        </div>
        <div class="hn-capsule-body">
          <span class="hn-capsule-number is-warning">{{ summary.lowBattery }}</span>
          <span class="hn-capsule-unit">台</span>
        </div>
        <div class="hn-capsule-meta">已知电量 ≤ {{ LOW_BATTERY_THRESHOLD }}%，未知不计</div>
      </div>
      <div class="hn-capsule" :class="{ 'is-active': applied.bindingStatus === 'unbound' && applied.battery === 'all' && applied.onlineStatus === 'all' }" title="筛选未绑定设备" @click="clickCapsule('unbound')">
        <div class="hn-capsule-head">
          <span class="hn-capsule-label">未绑定</span>
          <span class="hn-capsule-icon is-muted"><el-icon><Link /></el-icon></span>
        </div>
        <div class="hn-capsule-body">
          <span class="hn-capsule-number is-muted">{{ summary.unbound }}</span>
          <span class="hn-capsule-unit">台</span>
        </div>
        <div class="hn-capsule-meta">当前没有佩戴人员</div>
      </div>
    </section>

    <section class="hn-filter">
      <div class="hn-filter-group hn-filter-search">
        <el-input v-model="draft.imei" placeholder="IMEI / 设备编号 / 名称" clearable :prefix-icon="Search" @keyup.enter="applyDraft" />
      </div>
      <div class="hn-filter-group">
        <label class="hn-filter-label">型号：</label>
        <el-select v-model="draft.model" class="hn-select-sm">
          <el-option label="全部型号" value="all" />
          <el-option v-for="item in models" :key="item" :label="item" :value="item" />
        </el-select>
      </div>
      <div class="hn-filter-group">
        <label class="hn-filter-label">在线：</label>
        <el-select v-model="draft.onlineStatus" class="hn-select-sm">
          <el-option label="全部状态" value="all" />
          <el-option label="在线" value="online" />
          <el-option label="离线" value="offline" />
        </el-select>
      </div>
      <div class="hn-filter-group">
        <label class="hn-filter-label">绑定：</label>
        <el-select v-model="draft.bindingStatus" class="hn-select-sm">
          <el-option label="全部绑定" value="all" />
          <el-option label="已绑定" value="bound" />
          <el-option label="未绑定" value="unbound" />
        </el-select>
      </div>
      <div class="hn-filter-group">
        <label class="hn-filter-label">电量：</label>
        <el-select v-model="draft.battery" class="hn-select-sm">
          <el-option label="全部电量" value="all" />
          <el-option label="低电" value="low" />
          <el-option label="正常" value="normal" />
          <el-option label="未知" value="unknown" />
        </el-select>
      </div>
      <div class="hn-filter-group">
        <label class="hn-filter-label">部门：</label>
        <el-select v-model="draft.departmentId" class="hn-select-sm">
          <el-option label="全部部门" value="all" />
          <el-option v-for="item in DEPARTMENTS" :key="item.id" :label="item.name" :value="item.id" />
        </el-select>
      </div>
      <button type="button" class="hn-btn hn-btn-query" @click="applyDraft">查询</button>
      <button type="button" class="hn-btn hn-btn-reset" @click="resetFilters">重置</button>
      <div class="hn-filter-count">
        匹配结果：<strong>{{ total }}</strong> 台
      </div>
    </section>

    <section class="hn-table-card">
      <div v-if="canWrite && list.length > 0" class="hn-batch-bar">
        <span>已选 <span class="hn-mono">{{ selected.length }}</span> 台</span>
        <button type="button" class="hn-btn hn-btn-ghost" :disabled="!selected.length" @click="openBatchUnbind">批量解绑</button>
        <button type="button" class="hn-btn hn-btn-danger" :disabled="!selected.length" @click="openBatchDeactivate">批量停用</button>
        <span class="hn-capsule-meta">逐项返回成功或失败原因，不会把失败项显示成成功。</span>
      </div>
      <div v-if="loading" class="hn-loading-mask">正在加载设备列表…</div>
      <div class="hn-table-scroll">
        <table class="hn-table">
          <thead>
            <tr>
              <th v-if="canWrite" class="col-check col-hide-sm">
                <input type="checkbox" :checked="allPageSelected" @change="toggleAll(($event.target as HTMLInputElement).checked)">
              </th>
              <th class="col-device">设备</th>
              <th class="col-hide-md">型号</th>
              <th class="col-person">绑定人员</th>
              <th class="col-hide-sm">在线</th>
              <th class="col-hide-sm">电量</th>
              <th class="col-hide-md">最近通信</th>
              <th class="col-hide-md">最后数据</th>
              <th class="col-hide-lg">固件</th>
              <th class="col-hide-md">状态</th>
              <th class="col-actions">操作</th>
            </tr>
          </thead>
          <tbody v-if="list.length > 0">
            <tr
              v-for="item in list"
              :key="item.deviceId"
              class="hn-row"
              :class="{ 'is-critical': item.batteryPercent !== null && item.batteryPercent <= LOW_BATTERY_THRESHOLD }"
            >
              <td v-if="canWrite" class="col-check col-hide-sm">
                <input type="checkbox" :checked="selected.includes(item.deviceId)" @change="toggleOne(item.deviceId, ($event.target as HTMLInputElement).checked)">
              </td>
              <td class="cell-stack col-device">
                <button type="button" class="hn-link device-name" @click="openDetail(item.deviceId)">{{ item.deviceName }}</button>
                <div class="cell-sub hn-mono device-imei">{{ item.imei }}</div>
                <div class="cell-sub col-show-sm">
                  {{ item.model }} · {{ DEVICE_ONLINE_LABELS[item.onlineStatus] }} · {{ formatBattery(item.batteryPercent) }}
                </div>
              </td>
              <td class="col-hide-md">{{ item.model }}</td>
              <td class="cell-stack col-person">
                <button v-if="item.employeeId" type="button" class="hn-link person-name" @click="openPerson(item.employeeId)">{{ item.employeeName }}</button>
                <span v-else class="hn-status is-unbound"><span class="hn-dot" />未绑定</span>
                <div v-if="item.empCode" class="cell-sub hn-mono">{{ item.empCode }}</div>
                <div v-if="item.departmentName" class="cell-sub person-dept col-hide-sm">{{ item.departmentName }}</div>
              </td>
              <td class="col-hide-sm">
                <span class="hn-status" :class="item.onlineStatus === 'online' ? 'is-active' : 'is-muted'">
                  <span class="hn-dot" />{{ DEVICE_ONLINE_LABELS[item.onlineStatus] }}
                </span>
              </td>
              <td class="col-hide-sm hn-mono" :class="{ 'is-unknown-bat': item.batteryPercent === null }">
                {{ formatBattery(item.batteryPercent) }}
              </td>
              <td class="cell-stack hn-mono col-hide-md col-datetime">
                <template v-if="dateParts(item.lastCommAt)">
                  <div>{{ dateParts(item.lastCommAt)?.date }}</div>
                  <div class="cell-sub">{{ dateParts(item.lastCommAt)?.time }}</div>
                </template>
                <span v-else class="hn-empty-val">--</span>
              </td>
              <td class="cell-stack hn-mono col-hide-md col-datetime">
                <template v-if="dateParts(item.lastDataAt)">
                  <div>{{ dateParts(item.lastDataAt)?.date }}</div>
                  <div class="cell-sub">{{ dateParts(item.lastDataAt)?.time }}</div>
                </template>
                <span v-else class="hn-empty-val">--</span>
              </td>
              <td class="wrap col-hide-lg">{{ item.firmware || '字段缺失' }}</td>
              <td class="col-hide-md">
                <span class="hn-status" :class="item.lifecycleStatus === 'inactive' ? 'is-resigned' : 'is-active'">
                  <span class="hn-dot" />{{ DEVICE_LIFECYCLE_LABELS[item.lifecycleStatus] }}
                </span>
                <div v-if="item.missingFields.length" class="hn-empty-val">缺失：{{ item.missingFields.join('、') }}</div>
              </td>
              <td class="is-nowrap col-actions">
                <div class="hn-actions">
                  <button type="button" class="hn-act is-link" @click="openDetail(item.deviceId)">查看</button>
                  <button v-if="item.allowedActions.includes('bind')" type="button" class="hn-act col-hide-sm" @click="openBind(item.deviceId)">绑定</button>
                  <button v-if="item.allowedActions.includes('unbind')" type="button" class="hn-act col-hide-sm" @click="openUnbind(item.deviceId)">解绑</button>
                  <button v-if="item.allowedActions.includes('deactivate')" type="button" class="hn-act col-hide-sm" @click="openDeactivate(item.deviceId)">停用</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        <div v-if="!loading && emptyKind === 'forbidden'" class="hn-empty">
          <div class="hn-empty-icon"><el-icon :size="32"><Warning /></el-icon></div>
          <div class="hn-empty-title">无权限查看设备管理</div>
          <div class="hn-empty-desc">{{ errorMessage }}</div>
        </div>
        <div v-else-if="!loading && emptyKind === 'error'" class="hn-empty">
          <div class="hn-empty-icon"><el-icon :size="32"><Warning /></el-icon></div>
          <div class="hn-empty-title">设备列表加载失败</div>
          <div class="hn-empty-desc">{{ errorMessage }}</div>
          <button type="button" class="hn-btn hn-btn-refresh" @click="loadList">重试</button>
        </div>
        <div v-else-if="!loading && emptyKind === 'empty'" class="hn-empty">
          <div class="hn-empty-icon"><el-icon :size="32"><Monitor /></el-icon></div>
          <div class="hn-empty-title">当前没有设备</div>
          <div class="hn-empty-desc">还没有手表记录。有权限时可新增或导入，或刷新后再检查。</div>
          <button v-if="canWrite" type="button" class="hn-btn hn-btn-query" @click="openCreate">新增设备</button>
        </div>
        <div v-else-if="!loading && emptyKind === 'filtered'" class="hn-empty">
          <div class="hn-empty-icon"><el-icon :size="32"><Search /></el-icon></div>
          <div class="hn-empty-title">无符合条件的设备</div>
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

    <DeviceDetailDrawer
      :model-value="detailOpen"
      :device-id="activeDeviceId"
      :scene="scene"
      :can-write="canWrite"
      :nonce="detailNonce"
      @edit="openEdit"
      @bind="openBind"
      @unbind="openUnbind"
      @deactivate="openDeactivate"
      @open-person="openPerson"
      @update:model-value="(value) => { detailOpen = value; if (!value) onDetailClose() }"
    />
    <DeviceFormDrawer
      v-model="formOpen"
      :mode="formMode"
      :device-id="activeDeviceId"
      :scene="scene"
      @saved="loadList"
    />
    <PersonDetailDrawer
      v-model="personOpen"
      :employee-id="activeEmployeeId"
      :scene="personScene"
      :can-write="false"
      preserve-store
    />

    <el-dialog v-model="bindVisible" title="绑定人员" width="480px" append-to-body class="hn-dialog">
      <p class="hint">只能绑定在职人员。若该人员或设备已有其他绑定，接口会明确拒绝，不会覆盖。</p>
      <p v-if="confirmTarget" class="hint">设备 {{ confirmTarget.deviceName }} / {{ confirmTarget.imei }}</p>
      <el-select v-model="bindEmployeeId" class="full" filterable placeholder="选择人员">
        <el-option
          v-for="item in bindCandidates"
          :key="item.employeeId"
          :label="item.boundDeviceId ? `${item.empName} / ${item.empCode}（已绑定 ${item.boundDeviceId}）` : `${item.empName} / ${item.empCode} / ${item.departmentName}`"
          :value="item.employeeId"
        />
      </el-select>
      <template #footer>
        <button type="button" class="hn-btn hn-btn-ghost" @click="bindVisible = false">取消</button>
        <button type="button" class="hn-btn hn-btn-query" :disabled="!bindEmployeeId || Boolean(rowPending)" @click="submitBind">确认绑定</button>
      </template>
    </el-dialog>

    <el-dialog v-model="unbindVisible" :title="batchKind === 'unbind' ? '批量解绑' : '解除绑定'" width="460px" append-to-body class="hn-dialog">
      <p v-if="batchKind === 'unbind'" class="hint">将对已选 {{ selected.length }} 台设备逐项解绑。未绑定的设备会记为失败，不会显示成功。</p>
      <p v-else class="hint">
        解除后，人员档案中的设备编号和 IMEI 会同步清空。这是 mock 数据，不会通知手表。
      </p>
      <template #footer>
        <button type="button" class="hn-btn hn-btn-ghost" @click="unbindVisible = false">取消</button>
        <button type="button" class="hn-btn hn-btn-query" :disabled="Boolean(rowPending)" @click="submitUnbind">确认解绑</button>
      </template>
    </el-dialog>

    <el-dialog v-model="deactivateVisible" :title="batchKind === 'deactivate' ? '批量停用' : '停用设备'" width="460px" append-to-body class="hn-dialog">
      <p v-if="batchKind === 'deactivate'" class="hint">将对已选 {{ selected.length }} 台设备逐项停用。已停用的设备会记为失败。</p>
      <p v-else class="hint">停用后不能再绑定或下发控制。当前佩戴关系仍保留，可再解绑。未向手表发命令。</p>
      <template #footer>
        <button type="button" class="hn-btn hn-btn-ghost" @click="deactivateVisible = false">取消</button>
        <button type="button" class="hn-btn hn-btn-danger" :disabled="Boolean(rowPending)" @click="submitDeactivate">确认停用</button>
      </template>
    </el-dialog>

    <el-dialog v-model="importVisible" title="批量导入校验" width="560px" append-to-body class="hn-dialog">
      <p class="hint">每行：IMEI,名称,型号[,固件,部门编号]。会逐行校验，成功行写入 mock 台账，失败行保留原因。</p>
      <el-input v-model="importText" type="textarea" :rows="10" class="import-area" />
      <template #footer>
        <button type="button" class="hn-btn hn-btn-ghost" @click="importVisible = false">取消</button>
        <button type="button" class="hn-btn hn-btn-query" :disabled="Boolean(rowPending)" @click="submitImport">校验并导入</button>
      </template>
    </el-dialog>

    <el-dialog v-model="resultVisible" title="逐项结果" width="560px" append-to-body class="hn-dialog">
      <p v-if="batchResult" class="hint">
        成功 {{ batchResult.successCount }} · 失败 {{ batchResult.failCount }} · 编号 {{ batchResult.requestId }}
      </p>
      <div v-if="batchResult" class="hn-result-list">
        <div
          v-for="item in batchResult.results"
          :key="item.key"
          class="hn-result-item"
          :class="item.success ? 'is-ok' : 'is-fail'"
        >
          <div>
            <div class="wrap">{{ item.label }}</div>
            <div class="cell-sub">{{ item.message }}</div>
          </div>
          <strong>{{ item.success ? '成功' : '失败' }}</strong>
        </div>
      </div>
      <template #footer>
        <button type="button" class="hn-btn hn-btn-query" @click="resultVisible = false">关闭</button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.wrap {
  white-space: normal;
  word-break: break-word;
}

.hint {
  margin: 0 0 10px;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.6;
}

.full,
.import-area {
  width: 100%;
}

.is-unknown-bat {
  color: #94a3b8;
}

.device-page :deep(.hn-table) {
  min-width: 1180px;
}

.col-datetime {
  min-width: 96px;
  width: 96px;
}

.device-page :deep(.hn-table .col-actions) {
  min-width: 212px;
  width: 212px;
}

.col-device {
  min-width: 228px;
  max-width: 280px;
}

.col-person {
  min-width: 148px;
  max-width: 200px;
}

.device-name,
.person-name,
.person-dept {
  white-space: normal;
  overflow-wrap: break-word;
  word-break: break-word;
}

.device-imei {
  white-space: nowrap;
}

.cell-sub {
  margin-top: 4px;
}

@media (max-width: 1100px) {
  .device-page :deep(.hn-table) {
    min-width: 720px;
  }
}

@media (max-width: 640px) {
  .device-page :deep(.hn-table) {
    min-width: 0;
  }

  .device-page :deep(.hn-table .col-actions) {
    min-width: 72px;
    width: 72px;
  }

  .col-device,
  .col-person {
    min-width: 0;
    max-width: none;
  }

  .device-imei {
    white-space: normal;
  }
}
</style>
