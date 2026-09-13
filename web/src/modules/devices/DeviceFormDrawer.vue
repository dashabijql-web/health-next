<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { isMockApiError } from '@/mock/errors'
import { createDevice, fetchDeviceDetail, fetchDeviceModels, updateDevice } from '@/mock/devicesApi'
import { DEPARTMENTS } from '@/mock/org'
import type { DeviceDemoScene, DeviceWritePayload } from '@/mock/types'
import '@/styles/list-page.css'

defineOptions({ name: 'DeviceFormDrawer' })

const props = defineProps<{
  modelValue: boolean
  mode: 'create' | 'edit'
  deviceId: string | null
  scene: DeviceDemoScene
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  saved: []
}>()

const submitting = ref(false)
const loading = ref(true)
const models = ref<string[]>([])
const form = reactive<DeviceWritePayload>({
  imei: '',
  deviceName: '',
  model: '',
  firmware: '',
  departmentId: '',
  remark: '',
})

const title = computed(() => (props.mode === 'create' ? '新增设备' : '编辑设备'))
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
  form.imei = ''
  form.deviceName = ''
  form.model = ''
  form.firmware = ''
  form.departmentId = ''
  form.remark = ''
}

watch(
  () => [props.modelValue, props.mode, props.deviceId] as const,
  async ([open, mode, deviceId]) => {
    if (!open) return
    loading.value = true
    models.value = await fetchDeviceModels()
    if (mode === 'create' || !deviceId) {
      resetForm()
      loading.value = false
      return
    }
    try {
      const detail = await fetchDeviceDetail(props.scene, deviceId)
      form.imei = detail.imei
      form.deviceName = detail.deviceName
      form.model = detail.model
      form.firmware = detail.firmware ?? ''
      form.departmentId = detail.departmentId ?? ''
      form.remark = detail.remark ?? ''
      if (detail.model && !models.value.includes(detail.model)) models.value = [...models.value, detail.model]
    } catch (error) {
      const message = isMockApiError(error) ? `${error.message}（错误编号 ${error.requestId}）` : '设备资料加载失败'
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
    const payload: DeviceWritePayload = {
      imei: form.imei,
      deviceName: form.deviceName,
      model: form.model,
      firmware: form.firmware || null,
      departmentId: form.departmentId || null,
      remark: form.remark || null,
    }
    if (props.mode === 'edit' && props.deviceId) {
      await updateDevice(props.scene, props.deviceId, payload)
      ElMessage.success('设备已保存（mock 测试数据，未写入 Oracle）')
    } else {
      await createDevice(props.scene, payload)
      ElMessage.success('设备已登记（mock 测试数据，未连接手表）')
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
    destroy-on-close
    class="hn-incident-drawer"
    @close="close"
  >
    <div v-if="loading" class="form-state">正在加载设备资料…</div>
    <div v-else class="form-grid">
      <label>IMEI</label>
      <el-input v-model="form.imei" maxlength="15" placeholder="15 位数字" />
      <label>名称</label>
      <el-input v-model="form.deviceName" maxlength="80" placeholder="设备名称" />
      <label>型号</label>
      <el-select v-model="form.model" placeholder="选择型号" class="full" filterable allow-create>
        <el-option v-for="item in models" :key="item" :label="item" :value="item" />
      </el-select>
      <label>固件</label>
      <el-input v-model="form.firmware" maxlength="80" placeholder="可空" />
      <label>部门</label>
      <el-select v-model="form.departmentId" placeholder="可空，绑定后跟人员部门" class="full" clearable>
        <el-option v-for="item in DEPARTMENTS" :key="item.id" :label="item.name" :value="item.id" />
      </el-select>
      <label>备注</label>
      <el-input v-model="form.remark" type="textarea" :rows="3" placeholder="可空" />
    </div>
    <p class="hint">登记只写入 mock 设备台账，不会向手表发命令，也不会写入 Oracle。</p>
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

.hint {
  margin: 16px 0 0;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.5;
}
</style>
