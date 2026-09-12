<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { isMockApiError } from '@/mock/errors'
import { formatDateTime } from '@/mock/format'
import { EMPLOYMENT_LABELS, RISK_LABELS } from '@/mock/labels'
import { fetchPersonDetail } from '@/mock/peopleApi'
import { useIncidentWorkspace } from '@/stores/incidentWorkspace'
import { immersiveBodyLocation } from '@/utils/immersiveBody'
import type { PeopleDemoScene, PersonRecord } from '@/mock/types'
import '@/styles/list-page.css'

defineOptions({ name: 'PersonDetailDrawer' })

const props = defineProps<{
  modelValue: boolean
  employeeId: string | null
  scene: PeopleDemoScene
  canWrite: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  edit: [employeeId: string]
}>()

const router = useRouter()
const workspace = useIncidentWorkspace()
const loading = ref(false)
const errorMessage = ref('')
const detail = ref<(PersonRecord & { phoneDisplay: string; contactMasked: boolean }) | null>(null)
const viewportWidth = ref(typeof window === 'undefined' ? 1440 : window.innerWidth)
const drawerSize = computed(() => (viewportWidth.value <= 640 ? '100%' : '480px'))

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
  () => [props.modelValue, props.employeeId, props.scene] as const,
  async ([open, employeeId]) => {
    if (!open || !employeeId) return
    loading.value = true
    errorMessage.value = ''
    try {
      detail.value = await fetchPersonDetail(props.scene, employeeId)
    } catch (error) {
      detail.value = null
      errorMessage.value = isMockApiError(error)
        ? `${error.message}（错误编号 ${error.requestId}）`
        : '人员详情加载失败'
    } finally {
      loading.value = false
    }
  },
)

function close() {
  emit('update:modelValue', false)
}

function onEdit() {
  if (detail.value) emit('edit', detail.value.employeeId)
}

function openIncident() {
  if (!detail.value?.openIncidentId) return
  workspace.openIncident(detail.value.openIncidentId)
}

function openImmersiveBody() {
  if (!detail.value) return
  void router.push(immersiveBodyLocation(detail.value.empCode, detail.value.empName))
}

function notConnected(name: string) {
  ElMessage.info(`${name}尚未接入`)
}
</script>

<template>
  <el-drawer
    :model-value="modelValue"
    title="人员详情"
    :size="drawerSize"
    append-to-body
    class="hn-incident-drawer"
    @close="close"
  >
    <div v-if="loading" class="state">正在加载人员详情…</div>
    <div v-else-if="errorMessage" class="state is-error">
      <p>{{ errorMessage }}</p>
    </div>
    <div v-else-if="detail" class="detail">
      <dl class="kv">
        <div><dt>姓名</dt><dd class="wrap">{{ detail.empName }}</dd></div>
        <div><dt>工号</dt><dd class="hn-mono">{{ detail.empCode }}</dd></div>
        <div><dt>人员编号</dt><dd class="hn-mono">{{ detail.employeeId }}</dd></div>
        <div><dt>部门</dt><dd class="wrap">{{ detail.departmentName }}</dd></div>
        <div><dt>工种</dt><dd>{{ detail.jobName }}</dd></div>
        <div>
          <dt>在职状态</dt>
          <dd>
            <span class="hn-status" :class="`is-${detail.employmentStatus}`">
              <span class="hn-dot" />
              {{ EMPLOYMENT_LABELS[detail.employmentStatus] }}
            </span>
          </dd>
        </div>
        <div>
          <dt>联系方式</dt>
          <dd>
            {{ detail.phoneDisplay }}
            <span v-if="detail.contactMasked" class="sub">已脱敏</span>
          </dd>
        </div>
        <div><dt>IMEI</dt><dd class="hn-mono">{{ detail.imei || '未绑定' }}</dd></div>
        <div><dt>设备</dt><dd class="hn-mono">{{ detail.deviceId || '未绑定设备' }}</dd></div>
        <div><dt>最近在线</dt><dd class="hn-mono">{{ formatDateTime(detail.lastOnlineAt) }}</dd></div>
        <div><dt>最近健康数据</dt><dd class="hn-mono">{{ formatDateTime(detail.lastHealthAt) }}</dd></div>
        <div>
          <dt>当前风险</dt>
          <dd>
            <span class="hn-status" :class="`is-${detail.currentRisk === 'critical' ? 'critical' : detail.currentRisk === 'attention' ? 'attention' : detail.currentRisk}`">
              <span class="hn-dot" />
              {{ RISK_LABELS[detail.currentRisk] }}
            </span>
          </dd>
        </div>
      </dl>
      <p v-if="detail.remark" class="remark wrap">{{ detail.remark }}</p>
      <p v-if="detail.contactMasked" class="hint">当前账号无权查看完整联系方式。</p>
    </div>

    <template #footer>
      <div v-if="detail" class="hn-actions">
        <button v-if="detail.openIncidentId" type="button" class="hn-btn hn-btn-query" @click="openIncident">查看事件</button>
        <button v-if="canWrite" type="button" class="hn-btn hn-btn-refresh" @click="onEdit">编辑</button>
        <button type="button" class="hn-btn hn-btn-ghost" @click="openImmersiveBody">沉浸人体</button>
        <button type="button" class="hn-btn hn-btn-ghost" @click="notConnected('地图定位')">地图定位</button>
      </div>
    </template>
  </el-drawer>
</template>

<style scoped>
.state {
  min-height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
}

.state.is-error {
  color: #fca5a5;
}

.kv {
  display: grid;
  gap: 10px;
  margin: 0;
}

.kv > div {
  display: grid;
  grid-template-columns: 96px 1fr;
  gap: 8px;
}

dt {
  color: var(--text-muted);
  font-size: 12px;
}

dd {
  margin: 0;
  font-size: 13px;
  color: var(--text-primary);
}

.wrap {
  white-space: normal;
  word-break: break-word;
}

.sub,
.hint {
  color: var(--text-muted);
  font-size: 12px;
}

.remark {
  margin-top: 16px;
  line-height: 1.6;
  color: var(--text-secondary);
  font-size: 13px;
}

@media (max-width: 640px) {
  .kv > div {
    grid-template-columns: 72px 1fr;
  }
}
</style>
