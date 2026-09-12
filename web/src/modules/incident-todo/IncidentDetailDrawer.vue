<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Refresh, WarningFilled } from '@element-plus/icons-vue'
import { isMockApiError, newRequestId } from '@/mock/errors'
import { formatDateTime, formatSla } from '@/mock/format'
import {
  computeAllowedActions,
  fetchAssignees,
  fetchIncidentDetail,
  getCloseBlockReason,
  simulateForeignUpdate,
  submitIncidentAction,
} from '@/mock/incidentApi'
import { ACTION_LABELS, HANDLING_LABELS, RECOVERY_LABELS, SEVERITY_LABELS, SOURCE_LABELS } from '@/mock/labels'
import { lookupPerson } from '@/mock/peopleApi'
import { CURRENT_OPERATOR } from '@/mock/session'
import { useIncidentWorkspace } from '@/stores/incidentWorkspace'
import { immersiveBodyLocation } from '@/utils/immersiveBody'
import type { IncidentAction, IncidentRecord } from '@/mock/types'
import '@/styles/list-page.css'

defineOptions({ name: 'IncidentDetailDrawer' })

const emit = defineEmits<{ changed: [] }>()

const router = useRouter()
const workspace = useIncidentWorkspace()
const viewportWidth = ref(typeof window === 'undefined' ? 1440 : window.innerWidth)
const drawerSize = computed(() => (viewportWidth.value <= 640 ? '100%' : '520px'))

const loading = ref(false)
const loadError = ref('')
const record = ref<IncidentRecord | null>(null)
const submitting = ref<IncidentAction | null>(null)
const personHint = ref('')
const personPhone = ref('--')
const unsavedRemark = ref('')

const assignVisible = ref(false)
const completeVisible = ref(false)
const closeVisible = ref(false)
const falseVisible = ref(false)
const assignees = ref<{ userId: string; name: string }[]>([])
const assignForm = reactive({ assigneeId: '' })
const completeForm = reactive({ measures: '', result: '' })
const closeForm = reactive({ note: '' })
const falseForm = reactive({ reason: '' })

const allowed = computed(() => {
  if (!record.value) return []
  return computeAllowedActions(record.value, workspace.scene)
})

const sla = computed(() => formatSla(record.value?.dueAt ?? null))
const closeBlocked = computed(() => (record.value ? getCloseBlockReason(record.value) : null))

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
  () => [workspace.open, workspace.incidentId, workspace.scene] as const,
  async ([open, id]) => {
    if (!open || !id) return
    workspace.panel = 'event'
    await loadDetail(id)
  },
)

async function loadDetail(id: string) {
  loading.value = true
  loadError.value = ''
  try {
    record.value = await fetchIncidentDetail(workspace.scene, id)
    await loadPersonSide(record.value.employeeId)
  } catch (error) {
    record.value = null
    loadError.value = isMockApiError(error)
      ? `${error.message}（错误编号 ${error.requestId}）`
      : '事件详情加载失败'
  } finally {
    loading.value = false
  }
}

function loadPersonSide(employeeId: string) {
  personHint.value = ''
  personPhone.value = '--'
  const person = lookupPerson(employeeId)
  if (!person) {
    personHint.value = '人员档案仅展示事件内已有字段'
    return
  }
  personPhone.value = person.phone ? `${person.phone.slice(0, 3)}****${person.phone.slice(-4)}` : '--'
  personHint.value = '列表默认脱敏联系方式；完整号码按人员档案权限查看'
}

function closeDrawer() {
  workspace.closeDrawer()
  emit('changed')
}

function can(action: IncidentAction): boolean {
  return allowed.value.includes(action)
}

async function runAction(action: IncidentAction, extra: Partial<Parameters<typeof submitIncidentAction>[2]> = {}) {
  if (!record.value || submitting.value) return
  if (action !== 'view' && !can(action)) return
  submitting.value = action
  try {
    const next = await submitIncidentAction(workspace.scene, record.value.incidentId, {
      action,
      version: record.value.version,
      requestId: newRequestId('OK'),
      ...extra,
    })
    record.value = next
    ElMessage.success(`${ACTION_LABELS[action]}已保存（mock 测试数据，未发送外部通知）`)
    assignVisible.value = false
    completeVisible.value = false
    closeVisible.value = false
    falseVisible.value = false
    emit('changed')
  } catch (error) {
    if (isMockApiError(error) && error.code === 'CONFLICT') {
      ElMessage.error(`${error.message}（错误编号 ${error.requestId}）`)
      await loadDetail(record.value.incidentId)
      return
    }
    const message = isMockApiError(error) ? `${error.message}（错误编号 ${error.requestId}）` : '操作失败'
    ElMessage.error(message)
  } finally {
    submitting.value = null
  }
}

async function onConfirm() {
  await runAction('confirm')
}

async function openAssign() {
  assignees.value = await fetchAssignees()
  assignForm.assigneeId = record.value?.assignee?.userId || CURRENT_OPERATOR.userId
  assignVisible.value = true
}

async function submitAssign() {
  await runAction('assign', { assigneeId: assignForm.assigneeId })
}

async function onStart() {
  await runAction('start_handle')
}

function openComplete() {
  completeForm.measures = unsavedRemark.value || record.value?.remark || ''
  completeForm.result = ''
  completeVisible.value = true
}

async function submitComplete() {
  unsavedRemark.value = completeForm.measures
  await runAction('complete', { measures: completeForm.measures, result: completeForm.result })
  if (!submitting.value) unsavedRemark.value = ''
}

function openClose() {
  if (closeBlocked.value) {
    ElMessage.warning(closeBlocked.value)
    return
  }
  closeForm.note = ''
  closeVisible.value = true
}

async function submitClose() {
  await runAction('close', { closeNote: closeForm.note })
}

function openFalse() {
  falseForm.reason = ''
  falseVisible.value = true
}

async function submitFalse() {
  await runAction('false_alarm', { reason: falseForm.reason })
}

async function onSimulateConflict() {
  if (!record.value) return
  await simulateForeignUpdate(workspace.scene, record.value.incidentId)
  ElMessage.warning('已模拟他人更新。下一次保存应出现版本冲突提示。')
}

function goPerson() {
  workspace.showPerson()
}

function backEvent() {
  workspace.backToEvent()
}

function openImmersiveBody() {
  if (!record.value) return
  const person = lookupPerson(record.value.employeeId)
  const empCode = person?.empCode || record.value.employeeId
  void router.push(immersiveBodyLocation(empCode, record.value.employeeName))
}

function notConnected(name: string) {
  ElMessage.info(`${name}尚未接入`)
}

function actionLabel(action: IncidentRecord['timeline'][number]['action']): string {
  if (action === 'create') return '产生事件'
  return ACTION_LABELS[action]
}
</script>

<template>
  <el-drawer
    :model-value="workspace.open"
    :size="drawerSize"
    :with-header="true"
    append-to-body
    destroy-on-close
    class="hn-incident-drawer"
    @close="closeDrawer"
  >
    <template #header>
      <div class="drawer-head">
        <div>
          <div class="drawer-kicker">C01 事件详情 · mock 测试数据</div>
          <h2 class="drawer-title">{{ record?.eventName || '事件详情' }}</h2>
        </div>
        <span v-if="record" class="hn-status" :class="`is-${record.severity}`">
          <span class="hn-dot" />
          {{ SEVERITY_LABELS[record.severity] }}
        </span>
      </div>
    </template>

    <div class="drawer-shell">
      <div v-if="loading" class="drawer-state">正在加载事件详情…</div>
      <div v-else-if="loadError" class="drawer-state is-error">
        <p>{{ loadError }}</p>
        <button type="button" class="hn-btn hn-btn-refresh" @click="workspace.incidentId && loadDetail(workspace.incidentId)">
          重试
        </button>
      </div>

      <template v-else-if="record">
        <div class="drawer-scroll">
          <template v-if="workspace.panel === 'event'">
            <section class="block">
              <h3>事件</h3>
              <dl class="kv">
                <div><dt>事件编号</dt><dd class="hn-mono">{{ record.incidentId }}</dd></div>
                <div><dt>事件</dt><dd>{{ record.eventName }} / {{ record.eventCode }}</dd></div>
                <div><dt>来源</dt><dd>{{ SOURCE_LABELS[record.source] }}</dd></div>
                <div><dt>严重度</dt><dd>{{ SEVERITY_LABELS[record.severity] }}</dd></div>
                <div><dt>发生时间</dt><dd class="hn-mono">{{ formatDateTime(record.occurredAt) }}</dd></div>
                <div><dt>记录版本</dt><dd class="hn-mono">{{ record.version }}</dd></div>
              </dl>
            </section>

            <section class="block">
              <h3>人员 / 设备 / 位置</h3>
              <dl class="kv">
                <div>
                  <dt>人员</dt>
                  <dd>
                    <button type="button" class="hn-link" @click="goPerson">{{ record.employeeName }}</button>
                    <span class="sub">{{ record.employeeId }}</span>
                  </dd>
                </div>
                <div><dt>部门</dt><dd class="wrap">{{ record.departmentName }}</dd></div>
                <div><dt>工种</dt><dd>{{ record.jobName }}</dd></div>
                <div>
                  <dt>设备</dt>
                  <dd class="hn-mono">{{ record.deviceId || '未绑定设备' }}</dd>
                </div>
                <div>
                  <dt>位置</dt>
                  <dd class="wrap">{{ record.locationText || record.locationMissingReason || '暂无位置' }}</dd>
                </div>
              </dl>
            </section>

            <section class="block">
              <h3>测量证据</h3>
              <p class="hint">阈值与恢复条件均为 mock 测试数据，非正式健康规则。</p>
              <div v-for="(item, index) in record.evidence" :key="`${item.metric}-${index}`" class="evidence">
                <div class="evidence-main">
                  <strong>{{ item.metricLabel }}</strong>
                  <span v-if="item.value !== null && item.value !== ''" class="hn-mono val">{{ item.value }} {{ item.unit }}</span>
                  <span v-else class="hn-empty-val">字段缺失</span>
                </div>
                <div class="evidence-meta">
                  采集时间：{{ formatDateTime(item.measuredAt) }}
                  · {{ item.valid ? '有效' : '无效' }}
                  · {{ item.stale ? '读数过旧' : '未过旧' }}
                </div>
                <div v-if="item.thresholdNote" class="evidence-note">{{ item.thresholdNote }}</div>
              </div>
              <dl class="kv">
                <div>
                  <dt>恢复状态</dt>
                  <dd>{{ RECOVERY_LABELS[record.recoveryState] }}</dd>
                </div>
              </dl>
            </section>

            <section class="block">
              <h3>处理与时限</h3>
              <dl class="kv">
                <div>
                  <dt>处理状态</dt>
                  <dd>
                    <span class="hn-status" :class="`is-${record.handlingState}`">
                      <span class="hn-dot" />
                      {{ HANDLING_LABELS[record.handlingState] }}
                    </span>
                  </dd>
                </div>
                <div><dt>责任人</dt><dd>{{ record.assignee?.name || '未分派' }}</dd></div>
                <div>
                  <dt>处理时限</dt>
                  <dd :class="{ 'is-overdue': sla.overdue }">
                    {{ record.dueAt ? formatDateTime(record.dueAt) : '未设置' }}
                    <span class="sub">{{ sla.text }}</span>
                  </dd>
                </div>
              </dl>
              <p v-if="record.remark" class="remark wrap">{{ record.remark }}</p>
              <p v-if="closeBlocked && can('close')" class="hint">{{ closeBlocked }}</p>
            </section>

            <section class="block">
              <h3>处理时间线</h3>
              <ol class="timeline">
                <li v-for="item in record.timeline" :key="item.id">
                  <div class="tl-title">
                    <strong>{{ actionLabel(item.action) }}</strong>
                    <span class="hn-mono">{{ formatDateTime(item.at) }}</span>
                  </div>
                  <div class="tl-meta">{{ item.actorName }}</div>
                  <div v-if="item.remark" class="wrap">{{ item.remark }}</div>
                  <div v-if="item.result" class="tl-result wrap">{{ item.result }}</div>
                </li>
              </ol>
            </section>
          </template>

          <template v-else>
            <section class="block">
              <h3>人员摘要</h3>
              <dl class="kv">
                <div><dt>姓名</dt><dd class="wrap">{{ record.employeeName }}</dd></div>
                <div><dt>人员编号</dt><dd class="hn-mono">{{ record.employeeId }}</dd></div>
                <div><dt>部门</dt><dd class="wrap">{{ record.departmentName }}</dd></div>
                <div><dt>工种</dt><dd>{{ record.jobName }}</dd></div>
                <div><dt>设备</dt><dd class="hn-mono">{{ record.deviceId || '未绑定设备' }}</dd></div>
                <div><dt>联系方式</dt><dd>{{ personPhone }}</dd></div>
              </dl>
              <p v-if="personHint" class="hint">{{ personHint }}</p>
              <h4>最近读数</h4>
              <ul class="reading-list">
                <li v-for="(item, index) in record.evidence" :key="`p-${index}`">
                  {{ item.metricLabel }}
                  {{ item.value === null || item.value === '' ? '缺失' : `${item.value} ${item.unit}` }}
                  · {{ formatDateTime(item.measuredAt) }}
                </li>
              </ul>
              <div class="hn-actions" style="margin-top: 12px">
                <button type="button" class="hn-act" @click="openImmersiveBody">沉浸人体</button>
                <button type="button" class="hn-act" @click="notConnected('地图定位')">地图定位</button>
              </div>
            </section>
          </template>
        </div>

        <footer class="drawer-footer">
          <div v-if="workspace.panel === 'person'" class="hn-actions">
            <button type="button" class="hn-btn hn-btn-query" @click="backEvent">返回事件</button>
          </div>
          <div v-else class="hn-actions footer-actions">
            <button v-if="can('confirm')" type="button" class="hn-btn hn-btn-query" :disabled="Boolean(submitting)" @click="onConfirm">
              确认
            </button>
            <button v-if="can('assign')" type="button" class="hn-btn hn-btn-refresh" :disabled="Boolean(submitting)" @click="openAssign">
              分派
            </button>
            <button v-if="can('start_handle')" type="button" class="hn-btn hn-btn-query" :disabled="Boolean(submitting)" @click="onStart">
              开始处理
            </button>
            <button v-if="can('complete')" type="button" class="hn-btn hn-btn-query" :disabled="Boolean(submitting)" @click="openComplete">
              处理完成
            </button>
            <button v-if="can('close')" type="button" class="hn-btn hn-btn-refresh" :disabled="Boolean(submitting)" @click="openClose">
              关闭
            </button>
            <button v-if="can('false_alarm')" type="button" class="hn-btn hn-btn-danger" :disabled="Boolean(submitting)" @click="openFalse">
              误报
            </button>
            <button type="button" class="hn-btn hn-btn-ghost" :disabled="Boolean(submitting)" @click="onSimulateConflict">
              模拟他人更新
            </button>
          </div>
        </footer>
      </template>
    </div>
  </el-drawer>

  <el-dialog v-model="assignVisible" title="分派处理人" width="420px" append-to-body class="hn-dialog" @keyup.enter="submitAssign">
    <p class="hint">仅列出当前账号可分派的演示值班员。确认后更新责任人。</p>
    <el-select v-model="assignForm.assigneeId" class="full" filterable placeholder="选择处理人">
      <el-option v-for="item in assignees" :key="item.userId" :label="item.name" :value="item.userId" />
    </el-select>
    <template #footer>
      <button type="button" class="hn-btn hn-btn-ghost" @click="assignVisible = false">取消</button>
      <button type="button" class="hn-btn hn-btn-query" :disabled="Boolean(submitting)" @click="submitAssign">确认分派</button>
    </template>
  </el-dialog>

  <el-dialog v-model="completeVisible" title="处理完成" width="480px" append-to-body class="hn-dialog">
    <p class="hint">必须填写措施和结果。保存失败时保留输入，可重试。</p>
    <label class="field-label">措施</label>
    <el-input v-model="completeForm.measures" type="textarea" :rows="3" placeholder="已采取的措施" />
    <label class="field-label">结果</label>
    <el-input v-model="completeForm.result" type="textarea" :rows="3" placeholder="处理结果" />
    <template #footer>
      <button type="button" class="hn-btn hn-btn-ghost" @click="completeVisible = false">取消</button>
      <button type="button" class="hn-btn hn-btn-query" :disabled="Boolean(submitting)" @click="submitComplete">保存</button>
    </template>
  </el-dialog>

  <el-dialog v-model="closeVisible" title="关闭事件" width="480px" append-to-body class="hn-dialog">
    <p class="hint">关闭后事件不再出现在待办，处理记录保留。体征恢复不会自动关闭事件。</p>
    <label class="field-label">关闭说明</label>
    <el-input v-model="closeForm.note" type="textarea" :rows="3" placeholder="关闭说明 / 核实依据" />
    <template #footer>
      <button type="button" class="hn-btn hn-btn-ghost" @click="closeVisible = false">取消</button>
      <button type="button" class="hn-btn hn-btn-query" :disabled="Boolean(submitting)" @click="submitClose">确认关闭</button>
    </template>
  </el-dialog>

  <el-dialog v-model="falseVisible" title="标记误报" width="480px" append-to-body class="hn-dialog">
    <p class="hint">误报将终结当前处置，不抹掉健康记录，也不停止规则监测。终结后只读。</p>
    <label class="field-label">误报理由</label>
    <el-input v-model="falseForm.reason" type="textarea" :rows="3" placeholder="必须填写理由" />
    <template #footer>
      <button type="button" class="hn-btn hn-btn-ghost" @click="falseVisible = false">取消</button>
      <button type="button" class="hn-btn hn-btn-danger" :disabled="Boolean(submitting)" @click="submitFalse">确认误报</button>
    </template>
  </el-dialog>
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

.block {
  margin-bottom: 18px;
}

.block h3,
.block h4 {
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
  margin: 0 0 8px;
  color: var(--text-muted);
  font-size: 12px;
}

.remark,
.tl-result {
  margin-top: 8px;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.6;
}

.evidence {
  margin-bottom: 10px;
  padding: 10px 12px;
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  background: rgba(9, 14, 23, 0.6);
}

.evidence-main {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.val {
  color: #f87171;
  font-weight: 700;
}

.evidence-meta,
.evidence-note {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-muted);
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

.reading-list {
  margin: 0;
  padding-left: 18px;
  color: var(--text-secondary);
  font-size: 13px;
}

.is-overdue {
  color: #f87171;
}

.full {
  width: 100%;
}

.field-label {
  display: block;
  margin: 10px 0 6px;
  font-size: 12px;
  color: var(--text-secondary);
}

.hn-btn + .hn-btn,
.hn-act + .hn-act {
  margin-left: 0;
}
</style>

<style>
.hn-incident-drawer.el-drawer {
  background: #0d1117;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.hn-incident-drawer .el-drawer__header {
  margin-bottom: 0;
  padding: 14px 20px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.16);
  color: #f3f8ff;
}

.hn-incident-drawer .el-drawer__body {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  height: calc(100% - 61px);
  padding: 12px 20px 16px;
  overflow: hidden;
}

.hn-incident-drawer .el-drawer__footer {
  padding: 12px 20px 16px;
  border-top: 1px solid rgba(148, 163, 184, 0.16);
}

.hn-incident-drawer .el-drawer__close-btn {
  color: #8fa7c3;
}

.hn-dialog.el-dialog {
  background: #0d1117;
  border: 1px solid rgba(148, 163, 184, 0.16);
}

.hn-dialog .el-dialog__title,
.hn-dialog .el-dialog__body,
.hn-dialog .el-dialog__footer {
  color: #d8e5f5;
}

.hn-dialog .el-textarea__inner {
  color: #f3f8ff;
  background: rgba(9, 12, 16, 0.7);
}
</style>
