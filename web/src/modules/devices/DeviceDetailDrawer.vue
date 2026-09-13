<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { isMockApiError } from '@/mock/errors'
import { formatBattery, formatDateTime } from '@/mock/format'
import { DEVICE_LIFECYCLE_LABELS, DEVICE_ONLINE_LABELS, LOW_BATTERY_THRESHOLD } from '@/mock/labels'
import { fetchDeviceDetail } from '@/mock/devicesApi'
import type { DeviceDemoScene, DeviceDetail } from '@/mock/types'
import '@/styles/list-page.css'

defineOptions({ name: 'DeviceDetailDrawer' })

const props = defineProps<{
  modelValue: boolean
  deviceId: string | null
  scene: DeviceDemoScene
  canWrite: boolean
  nonce: number
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  edit: [deviceId: string]
  bind: [deviceId: string]
  unbind: [deviceId: string]
  deactivate: [deviceId: string]
  openPerson: [employeeId: string]
}>()

const loading = ref(false)
const errorMessage = ref('')
const detail = ref<DeviceDetail | null>(null)
const viewportWidth = ref(typeof window === 'undefined' ? 1440 : window.innerWidth)
const drawerSize = computed(() => (viewportWidth.value <= 640 ? '100%' : '520px'))

const isLowBattery = computed(() => {
  const value = detail.value?.batteryPercent
  return value !== null && value !== undefined && value <= LOW_BATTERY_THRESHOLD
})

function onResize() {
  viewportWidth.value = window.innerWidth
}

onMounted(() => {
  window.addEventListener('resize', onResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
})

watch(
  () => [props.modelValue, props.deviceId, props.scene, props.nonce] as const,
  async ([open, deviceId]) => {
    if (!open || !deviceId) return
    loading.value = true
    errorMessage.value = ''
    try {
      detail.value = await fetchDeviceDetail(props.scene, deviceId)
    } catch (error) {
      detail.value = null
      errorMessage.value = isMockApiError(error)
        ? `${error.message}（错误编号 ${error.requestId}）`
        : '设备详情加载失败'
    } finally {
      loading.value = false
    }
  },
)

function close() {
  emit('update:modelValue', false)
}

function can(action: 'edit' | 'bind' | 'unbind' | 'deactivate'): boolean {
  return Boolean(detail.value?.allowedActions.includes(action))
}

function openBoundPerson(employeeId: string | null) {
  if (employeeId) emit('openPerson', employeeId)
}

function notConnected(kind: 'control' | 'raw') {
  const message = kind === 'control'
    ? (detail.value?.controlUnavailableReason ?? '手表控制尚未接入。未向设备下发命令，也没有执行结果。')
    : (detail.value?.rawUnavailableReason ?? '原始报文尚未接入。当前不能查询手表收发记录。')
  ElMessage.info(message)
}

function retry() {
  if (props.deviceId) {
    const current = props.deviceId
    void fetchDeviceDetail(props.scene, current)
      .then((result) => {
        detail.value = result
        errorMessage.value = ''
      })
      .catch((error) => {
        errorMessage.value = isMockApiError(error)
          ? `${error.message}（错误编号 ${error.requestId}）`
          : '设备详情加载失败'
      })
  }
}
</script>

<template>
  <el-drawer
    :model-value="modelValue"
    :size="drawerSize"
    append-to-body
    destroy-on-close
    class="hn-incident-drawer"
    @close="close"
  >
    <template #header>
      <div class="drawer-head">
        <div>
          <div class="drawer-kicker">C03 设备详情 · mock 测试数据</div>
          <h2 class="drawer-title wrap">{{ detail?.deviceName || '设备详情' }}</h2>
        </div>
        <span
          v-if="detail"
          class="hn-status"
          :class="detail.lifecycleStatus === 'inactive' ? 'is-resigned' : detail.onlineStatus === 'online' ? 'is-active' : 'is-muted'"
        >
          <span class="hn-dot" />
          {{ detail.lifecycleStatus === 'inactive' ? DEVICE_LIFECYCLE_LABELS.inactive : DEVICE_ONLINE_LABELS[detail.onlineStatus] }}
        </span>
      </div>
    </template>

    <div class="drawer-shell">
      <div v-if="loading" class="drawer-state">正在加载设备详情…</div>
      <div v-else-if="errorMessage" class="drawer-state is-error">
        <p>{{ errorMessage }}</p>
        <button type="button" class="hn-btn hn-btn-refresh" @click="retry">重试</button>
      </div>

      <template v-else-if="detail">
        <div class="drawer-scroll">
          <div class="flags">
            <span v-if="detail.lifecycleStatus === 'inactive'" class="hn-status is-resigned"><span class="hn-dot" />已停用</span>
            <span v-else class="hn-status" :class="detail.onlineStatus === 'online' ? 'is-active' : 'is-muted'">
              <span class="hn-dot" />{{ DEVICE_ONLINE_LABELS[detail.onlineStatus] }}
            </span>
            <span class="hn-status" :class="detail.employeeId ? 'is-active' : 'is-unbound'">
              <span class="hn-dot" />{{ detail.employeeId ? '已绑定' : '未绑定' }}
            </span>
            <span class="hn-status" :class="detail.batteryPercent === null ? 'is-unknown' : isLowBattery ? 'is-warning' : 'is-none'">
              <span class="hn-dot" />电量 {{ formatBattery(detail.batteryPercent) }}
            </span>
          </div>

          <p v-if="detail.lifecycleStatus === 'inactive'" class="hint">已停用：不能绑定或下发控制。当前佩戴关系仍保留，可先解绑。</p>
          <p v-else-if="detail.onlineStatus === 'offline'" class="hint">设备离线。手表控制尚未接入，不能假装已经下发命令。</p>
          <p v-else-if="!detail.employeeId" class="hint">在线未绑定。可绑定在职且未占用的人员；冲突绑定会被拒绝。</p>
          <p v-if="isLowBattery" class="hint">权威电量低于 {{ LOW_BATTERY_THRESHOLD }}%。未知电量不会出现在低电统计里。</p>
          <p v-if="detail.missingFields.length" class="hint">字段缺失：{{ detail.missingFields.join('、') }}</p>

          <section class="block">
            <h3>设备</h3>
            <dl class="kv">
              <div><dt>设备编号</dt><dd class="hn-mono wrap">{{ detail.deviceId }}</dd></div>
              <div><dt>IMEI</dt><dd class="hn-mono">{{ detail.imei }}</dd></div>
              <div><dt>名称</dt><dd class="wrap">{{ detail.deviceName }}</dd></div>
              <div><dt>型号</dt><dd>{{ detail.model }}</dd></div>
              <div>
                <dt>状态</dt>
                <dd>{{ DEVICE_LIFECYCLE_LABELS[detail.lifecycleStatus] }} · {{ DEVICE_ONLINE_LABELS[detail.onlineStatus] }}</dd>
              </div>
              <div>
                <dt>电量</dt>
                <dd :class="{ 'is-unknown': detail.batteryPercent === null }">{{ formatBattery(detail.batteryPercent) }}</dd>
              </div>
              <div><dt>最近通信</dt><dd class="hn-mono">{{ formatDateTime(detail.lastCommAt) }}</dd></div>
              <div><dt>最后数据</dt><dd class="hn-mono">{{ formatDateTime(detail.lastDataAt) }}</dd></div>
              <div><dt>记录版本</dt><dd class="hn-mono">{{ detail.version }}</dd></div>
            </dl>
            <p v-if="detail.remark" class="remark wrap">{{ detail.remark }}</p>
          </section>

          <section class="block">
            <h3>固件 / 网络</h3>
            <dl class="kv">
              <div><dt>固件</dt><dd class="wrap">{{ detail.firmware || '字段缺失' }}</dd></div>
              <div><dt>网络</dt><dd class="wrap">{{ detail.network || '字段缺失' }}</dd></div>
            </dl>
          </section>

          <section class="block">
            <h3>佩戴人员</h3>
            <dl v-if="detail.employeeId" class="kv">
              <div>
                <dt>人员</dt>
                <dd>
                  <button type="button" class="hn-link wrap" @click="openBoundPerson(detail.employeeId)">
                    {{ detail.employeeName }}
                  </button>
                  <span class="sub">{{ detail.empCode }}</span>
                </dd>
              </div>
              <div><dt>部门</dt><dd class="wrap">{{ detail.departmentName || '--' }}</dd></div>
            </dl>
            <p v-else class="hint">当前未绑定人员。</p>
          </section>

          <section class="block">
            <h3>维护记录</h3>
            <ol v-if="detail.maintenance.length" class="timeline">
              <li v-for="item in [...detail.maintenance].reverse()" :key="item.id">
                <div class="tl-title">
                  <strong>{{ item.action }}</strong>
                  <span class="hn-mono">{{ formatDateTime(item.at) }}</span>
                </div>
                <div class="tl-meta">{{ item.actorName }}</div>
                <div v-if="item.note" class="wrap">{{ item.note }}</div>
              </li>
            </ol>
            <p v-else class="hint">没有维护记录。</p>
          </section>

          <section class="block">
            <h3>绑定历史</h3>
            <ol v-if="detail.bindings.length" class="timeline">
              <li v-for="item in [...detail.bindings].reverse()" :key="item.id">
                <div class="tl-title">
                  <strong>
                    <button
                      v-if="item.employeeId"
                      type="button"
                      class="hn-link"
                      @click="openBoundPerson(item.employeeId)"
                    >
                      {{ item.employeeName }}
                    </button>
                    <span v-else>{{ item.employeeName || '未知人员' }}</span>
                  </strong>
                  <span class="hn-mono">{{ item.unboundAt ? '已解绑' : '当前佩戴' }}</span>
                </div>
                <div class="tl-meta">
                  {{ item.empCode || '--' }}
                  · 绑定 {{ formatDateTime(item.boundAt) }}
                  <template v-if="item.unboundAt"> · 解绑 {{ formatDateTime(item.unboundAt) }}</template>
                </div>
                <div v-if="item.note" class="wrap">{{ item.note }}</div>
              </li>
            </ol>
            <p v-else class="hint">没有绑定历史。</p>
          </section>

          <section class="block">
            <h3>近期错误</h3>
            <ol v-if="detail.errors.length" class="timeline">
              <li v-for="item in detail.errors" :key="item.id">
                <div class="tl-title">
                  <strong class="hn-mono">{{ item.code }}</strong>
                  <span class="hn-mono">{{ formatDateTime(item.at) }}</span>
                </div>
                <div class="wrap">{{ item.message }}</div>
              </li>
            </ol>
            <p v-else class="hint">近期没有记录到设备错误。</p>
          </section>
        </div>

        <footer class="drawer-footer">
          <div class="hn-actions footer-actions">
            <button v-if="can('bind')" type="button" class="hn-btn hn-btn-query" @click="emit('bind', detail.deviceId)">绑定</button>
            <button v-if="can('unbind')" type="button" class="hn-btn hn-btn-refresh" @click="emit('unbind', detail.deviceId)">解绑</button>
            <button v-if="can('deactivate')" type="button" class="hn-btn hn-btn-danger" @click="emit('deactivate', detail.deviceId)">停用</button>
            <button v-if="can('edit')" type="button" class="hn-btn hn-btn-ghost" @click="emit('edit', detail.deviceId)">编辑</button>
            <button type="button" class="hn-btn hn-btn-ghost" @click="notConnected('control')">手表控制</button>
            <button type="button" class="hn-btn hn-btn-ghost" @click="notConnected('raw')">原始报文</button>
          </div>
        </footer>
      </template>
    </div>
  </el-drawer>
</template>

<style scoped>
.drawer-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding-right: 8px;
}

.drawer-kicker {
  font-size: 11px;
  color: #fbbf24;
  margin-bottom: 4px;
}

.drawer-title {
  margin: 0;
  font-size: 16px;
  color: var(--text-strong);
}

.drawer-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.drawer-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 4px 4px 32px;
}

.drawer-footer {
  flex-shrink: 0;
  padding: 12px 4px 4px;
  border-top: 1px solid var(--border-subtle);
  background: #0d1117;
}

.footer-actions {
  flex-wrap: wrap;
}

.drawer-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-height: 240px;
  color: var(--text-secondary);
  text-align: center;
}

.drawer-state.is-error {
  color: #fca5a5;
}

.flags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}

.block {
  margin-bottom: 18px;
}

.block h3 {
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-strong);
}

.kv {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
  margin: 0;
}

.kv > div {
  display: grid;
  grid-template-columns: 84px 1fr;
  gap: 8px;
  align-items: start;
}

dt {
  color: var(--text-muted);
  font-size: 12px;
}

dd {
  margin: 0;
  color: var(--text-primary);
  font-size: 13px;
}

.sub {
  margin-left: 8px;
  color: var(--text-muted);
  font-size: 12px;
  font-family: var(--font-mono);
}

.wrap {
  white-space: normal;
  word-break: break-word;
}

.hint {
  margin: 0 0 10px;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.5;
}

.remark {
  margin-top: 8px;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.6;
}

.timeline {
  margin: 0;
  padding-left: 18px;
  color: var(--text-secondary);
  font-size: 13px;
}

.timeline li + li {
  margin-top: 10px;
}

.tl-title {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  color: var(--text-primary);
}

.tl-meta {
  font-size: 12px;
  color: var(--text-muted);
}

.is-unknown {
  color: #94a3b8;
}
</style>
