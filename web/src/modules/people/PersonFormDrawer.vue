<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { isMockApiError } from '@/mock/errors'
import { createPerson, fetchPersonDetail, updatePerson } from '@/mock/peopleApi'
import { DEPARTMENTS, JOBS } from '@/mock/org'
import type { PeopleDemoScene, PersonWritePayload } from '@/mock/types'
import '@/styles/list-page.css'

defineOptions({ name: 'PersonFormDrawer' })

const props = defineProps<{
  modelValue: boolean
  mode: 'create' | 'edit'
  employeeId: string | null
  scene: PeopleDemoScene
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  saved: []
}>()

const submitting = ref(false)
const loading = ref(true)
const form = reactive<PersonWritePayload>({
  empName: '',
  empCode: '',
  departmentId: '',
  jobId: '',
  phone: '',
  imei: '',
  employmentStatus: 'active',
  remark: '',
})

const title = computed(() => (props.mode === 'create' ? '新增人员' : '编辑人员'))
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

function resetForm() {
  form.empName = ''
  form.empCode = ''
  form.departmentId = ''
  form.jobId = ''
  form.phone = ''
  form.imei = ''
  form.employmentStatus = 'active'
  form.remark = ''
}

watch(
  () => [props.modelValue, props.mode, props.employeeId] as const,
  async ([open, mode, employeeId]) => {
    if (!open) return
    loading.value = true
    if (mode === 'create' || !employeeId) {
      resetForm()
      loading.value = false
      return
    }
    try {
      const detail = await fetchPersonDetail(props.scene, employeeId)
      form.empName = detail.empName
      form.empCode = detail.empCode
      form.departmentId = detail.departmentId
      form.jobId = detail.jobId
      form.phone = detail.phone ?? ''
      form.imei = detail.imei ?? ''
      form.employmentStatus = detail.employmentStatus
      form.remark = detail.remark ?? ''
    } catch (error) {
      const message = isMockApiError(error) ? `${error.message}（错误编号 ${error.requestId}）` : '人员资料加载失败'
      ElMessage.error(message)
    } finally {
      loading.value = false
    }
  },
)

function close() {
  emit('update:modelValue', false)
}

async function submit() {
  if (submitting.value) return
  submitting.value = true
  try {
    const payload: PersonWritePayload = {
      ...form,
      phone: form.phone || null,
      imei: form.imei || null,
      remark: form.remark || null,
    }
    if (props.mode === 'edit' && props.employeeId) {
      await updatePerson(props.scene, props.employeeId, payload)
      ElMessage.success('人员已保存（mock 测试数据）')
    } else {
      await createPerson(props.scene, payload)
      ElMessage.success('人员已新增（mock 测试数据）')
    }
    emit('saved')
    close()
  } catch (error) {
    const message = isMockApiError(error) ? `${error.message}（错误编号 ${error.requestId}）` : '保存失败'
    ElMessage.error(message)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <el-drawer
    :model-value="modelValue"
    :title="title"
    :size="drawerSize"
    append-to-body
    class="hn-incident-drawer"
    @close="close"
  >
    <div v-if="loading" class="form-state">正在加载人员资料…</div>
    <div v-else class="form-grid">
      <label>姓名</label>
      <el-input v-model="form.empName" maxlength="40" placeholder="姓名" />
      <label>工号</label>
      <el-input v-model="form.empCode" maxlength="20" placeholder="工号" />
      <label>部门</label>
      <el-select v-model="form.departmentId" placeholder="选择部门" class="full">
        <el-option v-for="item in DEPARTMENTS" :key="item.id" :label="item.name" :value="item.id" />
      </el-select>
      <label>工种</label>
      <el-select v-model="form.jobId" placeholder="选择工种" class="full">
        <el-option v-for="item in JOBS" :key="item.id" :label="item.name" :value="item.id" />
      </el-select>
      <label>手机号</label>
      <el-input v-model="form.phone" maxlength="20" placeholder="可空" />
      <label>IMEI</label>
      <el-input v-model="form.imei" maxlength="15" placeholder="可空，15 位；占用或已停用会被拒绝" />
      <label>在职状态</label>
      <el-select v-model="form.employmentStatus" class="full">
        <el-option label="在职" value="active" />
        <el-option label="请假" value="leave" />
        <el-option label="离职" value="resigned" />
      </el-select>
      <label>备注</label>
      <el-input v-model="form.remark" type="textarea" :rows="3" placeholder="可空" />
    </div>
    <template #footer>
      <div class="hn-actions">
        <button type="button" class="hn-btn hn-btn-ghost" @click="close">取消</button>
        <button type="button" class="hn-btn hn-btn-query" :disabled="submitting || loading" @click="submit">保存</button>
      </div>
    </template>
  </el-drawer>
</template>

<style scoped>
.form-grid {
  display: grid;
  grid-template-columns: 72px 1fr;
  gap: 12px 10px;
  align-items: center;
}

.form-grid label {
  font-size: 12px;
  color: var(--text-secondary);
}

.full {
  width: 100%;
}

.form-state {
  min-height: 160px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
}
</style>
