import {
  deviceStore,
  findDeviceById,
  IMEI_PATTERN,
  resetDeviceStoreIfNeeded,
} from './deviceStore'
import { MockApiError, newRequestId } from './errors'
import { cloneJson, wait } from './format'
import { LOW_BATTERY_THRESHOLD } from './labels'
import { findDepartment } from './org'
import {
  applyPersonDeviceBind,
  applyPersonDeviceUnbind,
  listPeopleForDeviceBind,
  peekPeopleRecords,
  syncImeiForDevice,
} from './peopleApi'
import { createBlankDevice, DEVICE_MODELS, isOnlineAt } from './devices'
import { CURRENT_OPERATOR, isWritableScene, TEST_CLOCK_ISO } from './session'
import type {
  BatchItemResult,
  BatchOpResult,
  DeviceAction,
  DeviceBindCandidate,
  DeviceDemoScene,
  DeviceDetail,
  DeviceImportRow,
  DeviceListItem,
  DeviceQuery,
  DeviceRecord,
  DeviceSummary,
  DeviceWritePayload,
  PageResult,
} from './types'

const CONTROL_UNAVAILABLE = '手表控制尚未接入。未向设备下发命令，也没有执行结果。'
const RAW_UNAVAILABLE = '原始报文尚未接入。当前不能查询手表收发记录。'
const DATA_NOTE = 'mock 测试数据，非正式接口统计，未连接手表与 Oracle'

const store = deviceStore

function resetIfNeeded(scene: DeviceDemoScene) {
  resetDeviceStoreIfNeeded(scene)
}

function assertReadable(scene: DeviceDemoScene) {
  if (scene === 'forbidden') {
    throw new MockApiError({
      code: 'FORBIDDEN',
      requestId: newRequestId('FORBIDDEN'),
      message: '当前账号无权查看设备管理',
    })
  }
}

function assertWritable(scene: DeviceDemoScene, requestId: string) {
  assertReadable(scene)
  if (!isWritableScene(scene)) {
    throw new MockApiError({
      code: 'FORBIDDEN',
      requestId,
      message: '当前账号为只读，不能登记、绑定、解绑或停用设备',
    })
  }
}

function maybeFail(scene: DeviceDemoScene) {
  if (scene === 'error') {
    throw new MockApiError({
      code: 'UNAVAILABLE',
      requestId: newRequestId('UNAVAILABLE'),
      message: '设备列表查询失败，演示数据源暂不可用',
    })
  }
}

function missingFields(record: DeviceRecord): string[] {
  const fields: string[] = []
  if (!record.firmware) fields.push('固件')
  if (!record.network) fields.push('网络')
  if (!record.lastCommAt) fields.push('最近通信')
  if (!record.lastDataAt) fields.push('最后数据时间')
  if (record.batteryPercent === null) fields.push('电量')
  return fields
}

export function computeDeviceActions(record: DeviceRecord, scene: DeviceDemoScene): DeviceAction[] {
  const actions: DeviceAction[] = ['view']
  if (!isWritableScene(scene)) return actions
  actions.push('edit')
  if (record.lifecycleStatus === 'active' && !record.employeeId) actions.push('bind')
  if (record.employeeId) actions.push('unbind')
  if (record.lifecycleStatus === 'active') actions.push('deactivate')
  return actions
}

function toListItem(record: DeviceRecord, scene: DeviceDemoScene): DeviceListItem {
  return {
    deviceId: record.deviceId,
    imei: record.imei,
    deviceName: record.deviceName,
    model: record.model,
    firmware: record.firmware,
    employeeId: record.employeeId,
    employeeName: record.employeeName,
    empCode: record.empCode,
    departmentName: record.departmentName,
    onlineStatus: record.onlineStatus,
    lifecycleStatus: record.lifecycleStatus,
    batteryPercent: record.batteryPercent,
    lastCommAt: record.lastCommAt,
    lastDataAt: record.lastDataAt,
    lastOnlineAt: record.lastOnlineAt,
    missingFields: missingFields(record),
    allowedActions: computeDeviceActions(record, scene),
    version: record.version,
  }
}

function overlayPeopleBinding(device: DeviceRecord) {
  const people = peekPeopleRecords()
  const bound = people.find((item) => item.deviceId === device.deviceId)
  if (bound) {
    device.employeeId = bound.employeeId
    device.employeeName = bound.empName
    device.empCode = bound.empCode
    device.departmentId = bound.departmentId
    device.departmentName = bound.departmentName
    const open = device.bindings.find((item) => item.unboundAt === null)
    if (!open) {
      device.bindings.push({
        id: `BH-SYNC-${device.deviceId.slice(-6)}`,
        employeeId: bound.employeeId,
        employeeName: bound.empName,
        empCode: bound.empCode,
        boundAt: TEST_CLOCK_ISO,
        unboundAt: null,
        note: '由人员档案同步',
      })
    } else if (open.employeeId !== bound.employeeId) {
      open.unboundAt = TEST_CLOCK_ISO
      open.note = '绑定关系已由人员档案变更'
      device.bindings.push({
        id: `BH-SYNC-${Date.now()}`,
        employeeId: bound.employeeId,
        employeeName: bound.empName,
        empCode: bound.empCode,
        boundAt: TEST_CLOCK_ISO,
        unboundAt: null,
        note: '由人员档案同步',
      })
    }
    return
  }
  if (device.employeeId) {
    const open = device.bindings.find((item) => item.unboundAt === null)
    if (open) {
      open.unboundAt = TEST_CLOCK_ISO
      open.note = open.note || '人员侧已解除绑定'
    }
    device.employeeId = null
    device.employeeName = null
    device.empCode = null
  }
}

function ensureDevicesForPeople() {
  const people = peekPeopleRecords()
  for (const person of people) {
    if (!person.deviceId || !person.imei) continue
    const exists = store.records.some((item) => item.deviceId === person.deviceId)
    if (exists) continue
    if (store.records.some((item) => item.imei === person.imei)) continue
    const created = createBlankDevice({
      deviceId: person.deviceId,
      imei: person.imei,
      deviceName: `${person.empName} 的手表`,
      model: DEVICE_MODELS[0],
      firmware: null,
      departmentId: person.departmentId,
      departmentName: person.departmentName,
      remark: '由人员档案 IMEI 同步生成（mock）',
    })
    created.employeeId = person.employeeId
    created.employeeName = person.empName
    created.empCode = person.empCode
    created.bindings = [{
      id: `BH-NEW-${person.employeeId}`,
      employeeId: person.employeeId,
      employeeName: person.empName,
      empCode: person.empCode,
      boundAt: TEST_CLOCK_ISO,
      unboundAt: null,
      note: '由人员档案同步',
    }]
    store.records.unshift(created)
  }
}

function hydrateFromPeople() {
  if (store.scene === 'empty') return
  ensureDevicesForPeople()
  for (const device of store.records) {
    overlayPeopleBinding(device)
    if (device.lifecycleStatus === 'inactive') {
      device.onlineStatus = 'offline'
    } else {
      device.onlineStatus = isOnlineAt(device.lastCommAt) ? 'online' : 'offline'
    }
  }
}

function matchDevice(record: DeviceRecord, query: DeviceQuery): boolean {
  const imei = query.imei?.trim() ?? ''
  if (imei) {
    const hay = [record.imei, record.deviceId, record.deviceName].join(' ').toLowerCase()
    if (!hay.includes(imei.toLowerCase())) return false
  }
  if (query.model && query.model !== 'all' && record.model !== query.model) return false
  if (query.onlineStatus && query.onlineStatus !== 'all' && record.onlineStatus !== query.onlineStatus) return false
  if (query.bindingStatus && query.bindingStatus !== 'all') {
    const bound = record.employeeId ? 'bound' : 'unbound'
    if (bound !== query.bindingStatus) return false
  }
  if (query.battery && query.battery !== 'all') {
    if (query.battery === 'unknown' && record.batteryPercent !== null) return false
    if (query.battery === 'low' && !(record.batteryPercent !== null && record.batteryPercent <= LOW_BATTERY_THRESHOLD)) return false
    if (query.battery === 'normal' && !(record.batteryPercent !== null && record.batteryPercent > LOW_BATTERY_THRESHOLD)) return false
  }
  if (query.departmentId && query.departmentId !== 'all' && record.departmentId !== query.departmentId) return false
  return true
}

function buildSummary(records: DeviceRecord[]): DeviceSummary {
  return {
    total: records.length,
    online: records.filter((item) => item.onlineStatus === 'online').length,
    offline: records.filter((item) => item.onlineStatus === 'offline').length,
    lowBattery: records.filter((item) => item.batteryPercent !== null && item.batteryPercent <= LOW_BATTERY_THRESHOLD).length,
    unbound: records.filter((item) => !item.employeeId).length,
    generatedAt: TEST_CLOCK_ISO,
    dataNote: DATA_NOTE,
  }
}

function validateImei(imei: string, requestId: string, field = 'imei') {
  const value = imei.trim()
  if (!value) {
    throw new MockApiError({ code: 'VALIDATION', requestId, message: '请填写 IMEI', field })
  }
  if (!IMEI_PATTERN.test(value)) {
    throw new MockApiError({ code: 'VALIDATION', requestId, message: 'IMEI 必须是 15 位数字', field })
  }
  return value
}

function validateWrite(payload: DeviceWritePayload, requestId: string) {
  const imei = validateImei(payload.imei, requestId)
  const deviceName = payload.deviceName.trim()
  if (!deviceName) {
    throw new MockApiError({ code: 'VALIDATION', requestId, message: '请填写设备名称', field: 'deviceName' })
  }
  const model = payload.model.trim()
  if (!model) {
    throw new MockApiError({ code: 'VALIDATION', requestId, message: '请选择型号', field: 'model' })
  }
  let departmentId: string | null = payload.departmentId?.trim() || null
  let departmentName: string | null = null
  if (departmentId) {
    const department = findDepartment(departmentId)
    if (!department) {
      throw new MockApiError({ code: 'VALIDATION', requestId, message: '部门不存在', field: 'departmentId' })
    }
    departmentName = department.name
  }
  return {
    imei,
    deviceName,
    model,
    firmware: payload.firmware?.trim() || null,
    departmentId,
    departmentName,
    remark: payload.remark?.trim() || null,
  }
}

function findDevice(deviceId: string): DeviceRecord | undefined {
  return findDeviceById(deviceId)
}

function assertVersion(record: DeviceRecord, version: number | undefined, requestId: string) {
  if (version !== undefined && version !== record.version) {
    throw new MockApiError({
      code: 'CONFLICT',
      requestId,
      message: '设备资料已被其他人更新，请刷新后重试',
    })
  }
}

function toDetail(record: DeviceRecord, scene: DeviceDemoScene): DeviceDetail {
  return {
    ...cloneJson(record),
    missingFields: missingFields(record),
    allowedActions: computeDeviceActions(record, scene),
    controlUnavailableReason: CONTROL_UNAVAILABLE,
    rawUnavailableReason: RAW_UNAVAILABLE,
  }
}

export async function fetchDeviceList(
  scene: DeviceDemoScene,
  query: DeviceQuery = {},
): Promise<PageResult<DeviceListItem> & { summary: DeviceSummary; requestId: string }> {
  resetIfNeeded(scene)
  await wait(220)
  const requestId = newRequestId('OK')
  assertReadable(scene)
  maybeFail(scene)
  hydrateFromPeople()
  const matched = store.records.filter((item) => matchDevice(item, query))
  const pageSize = query.pageSize === 50 ? 50 : 20
  const total = matched.length
  const maxPage = Math.max(1, Math.ceil(total / pageSize))
  const page = Math.min(Math.max(query.page ?? 1, 1), maxPage)
  const start = (page - 1) * pageSize
  return {
    list: matched.slice(start, start + pageSize).map((item) => toListItem(item, scene)),
    page,
    pageSize,
    total,
    summary: buildSummary(store.records),
    requestId,
  }
}

export async function fetchDeviceDetail(scene: DeviceDemoScene, deviceId: string): Promise<DeviceDetail> {
  resetIfNeeded(scene)
  await wait(160)
  assertReadable(scene)
  maybeFail(scene)
  hydrateFromPeople()
  const found = findDevice(deviceId)
  if (!found) {
    throw new MockApiError({
      code: 'NOT_FOUND',
      requestId: newRequestId('NOT_FOUND'),
      message: '设备不存在或已失去查看权限',
    })
  }
  return toDetail(found, scene)
}

export async function fetchDeviceModels(): Promise<string[]> {
  return [...DEVICE_MODELS]
}

export async function fetchBindCandidates(scene: DeviceDemoScene): Promise<DeviceBindCandidate[]> {
  resetIfNeeded(scene)
  await wait(120)
  assertReadable(scene)
  hydrateFromPeople()
  return listPeopleForDeviceBind().map((item) => ({
    employeeId: item.employeeId,
    empName: item.empName,
    empCode: item.empCode,
    departmentName: item.departmentName,
    jobName: item.jobName,
    boundDeviceId: item.deviceId,
  }))
}

export async function createDevice(scene: DeviceDemoScene, payload: DeviceWritePayload): Promise<DeviceRecord> {
  resetIfNeeded(scene)
  await wait(240)
  const requestId = newRequestId('OK')
  assertWritable(scene, requestId)
  const parsed = validateWrite(payload, requestId)
  if (store.records.some((item) => item.imei === parsed.imei) || peekPeopleRecords().some((item) => item.imei === parsed.imei)) {
    throw new MockApiError({ code: 'VALIDATION', requestId, message: 'IMEI 已存在', field: 'imei' })
  }
  store.seq += 1
  const created = createBlankDevice({
    deviceId: `DEV-${parsed.imei}`,
    imei: parsed.imei,
    deviceName: parsed.deviceName,
    model: parsed.model,
    firmware: parsed.firmware,
    departmentId: parsed.departmentId,
    departmentName: parsed.departmentName,
    remark: parsed.remark,
  })
  store.records.unshift(created)
  hydrateFromPeople()
  return cloneJson(created)
}

export async function updateDevice(
  scene: DeviceDemoScene,
  deviceId: string,
  payload: DeviceWritePayload,
): Promise<DeviceRecord> {
  resetIfNeeded(scene)
  await wait(240)
  const requestId = newRequestId('OK')
  assertWritable(scene, requestId)
  const found = findDevice(deviceId)
  if (!found) {
    throw new MockApiError({ code: 'NOT_FOUND', requestId, message: '设备不存在或已失去查看权限' })
  }
  const parsed = validateWrite(payload, requestId)
  if (store.records.some((item) => item.deviceId !== deviceId && item.imei === parsed.imei)) {
    throw new MockApiError({ code: 'VALIDATION', requestId, message: 'IMEI 已存在', field: 'imei' })
  }
  if (peekPeopleRecords().some((item) => item.imei === parsed.imei && item.deviceId !== deviceId)) {
    throw new MockApiError({ code: 'VALIDATION', requestId, message: 'IMEI 已绑定其他人员', field: 'imei' })
  }
  found.imei = parsed.imei
  found.deviceName = parsed.deviceName
  found.model = parsed.model
  found.firmware = parsed.firmware
  if (!found.employeeId) {
    found.departmentId = parsed.departmentId
    found.departmentName = parsed.departmentName
  }
  found.remark = parsed.remark
  found.version += 1
  syncImeiForDevice(found.deviceId, found.imei)
  hydrateFromPeople()
  return cloneJson(found)
}

export async function bindDevice(
  scene: DeviceDemoScene,
  deviceId: string,
  employeeId: string,
  version?: number,
): Promise<DeviceRecord> {
  resetIfNeeded(scene)
  await wait(240)
  const requestId = newRequestId('OK')
  assertWritable(scene, requestId)
  hydrateFromPeople()
  const device = findDevice(deviceId)
  if (!device) {
    throw new MockApiError({ code: 'NOT_FOUND', requestId, message: '设备不存在或已失去查看权限' })
  }
  assertVersion(device, version, requestId)
  if (device.lifecycleStatus === 'inactive') {
    throw new MockApiError({ code: 'VALIDATION', requestId, message: '设备已停用，不能绑定' })
  }
  if (device.employeeId && device.employeeId !== employeeId) {
    throw new MockApiError({
      code: 'CONFLICT',
      requestId,
      message: `设备已绑定给 ${device.employeeName}，请先解绑`,
    })
  }
  const person = applyPersonDeviceBind(employeeId, device.deviceId, device.imei, requestId)
  const open = device.bindings.find((item) => item.unboundAt === null)
  if (open && open.employeeId !== employeeId) {
    open.unboundAt = TEST_CLOCK_ISO
  }
  if (!device.bindings.some((item) => item.unboundAt === null && item.employeeId === employeeId)) {
    device.bindings.push({
      id: `BH-${device.deviceId.slice(-4)}-${person.employeeId.slice(-4)}-${device.version + 1}`,
      employeeId: person.employeeId,
      employeeName: person.empName,
      empCode: person.empCode,
      boundAt: TEST_CLOCK_ISO,
      unboundAt: null,
      note: '设备管理绑定',
    })
  }
  device.employeeId = person.employeeId
  device.employeeName = person.empName
  device.empCode = person.empCode
  device.departmentId = person.departmentId
  device.departmentName = person.departmentName
  device.version += 1
  device.maintenance.push({
    id: `MT-BIND-${device.version}`,
    at: TEST_CLOCK_ISO,
    actorName: CURRENT_OPERATOR.name,
    action: '绑定人员',
    note: `${person.empName} / ${person.empCode}`,
  })
  return cloneJson(device)
}

export async function unbindDevice(
  scene: DeviceDemoScene,
  deviceId: string,
  version?: number,
): Promise<DeviceRecord> {
  resetIfNeeded(scene)
  await wait(240)
  const requestId = newRequestId('OK')
  assertWritable(scene, requestId)
  hydrateFromPeople()
  const device = findDevice(deviceId)
  if (!device) {
    throw new MockApiError({ code: 'NOT_FOUND', requestId, message: '设备不存在或已失去查看权限' })
  }
  assertVersion(device, version, requestId)
  if (!device.employeeId) {
    throw new MockApiError({ code: 'VALIDATION', requestId, message: '设备当前未绑定人员' })
  }
  const employeeId = device.employeeId
  const employeeName = device.employeeName
  applyPersonDeviceUnbind(employeeId, device.deviceId)
  const open = device.bindings.find((item) => item.unboundAt === null)
  if (open) {
    open.unboundAt = TEST_CLOCK_ISO
    open.note = '设备管理解绑'
  }
  device.employeeId = null
  device.employeeName = null
  device.empCode = null
  device.version += 1
  device.maintenance.push({
    id: `MT-UNBIND-${device.version}`,
    at: TEST_CLOCK_ISO,
    actorName: CURRENT_OPERATOR.name,
    action: '解除绑定',
    note: employeeName,
  })
  return cloneJson(device)
}

export async function deactivateDevice(
  scene: DeviceDemoScene,
  deviceId: string,
  version?: number,
): Promise<DeviceRecord> {
  resetIfNeeded(scene)
  await wait(240)
  const requestId = newRequestId('OK')
  assertWritable(scene, requestId)
  hydrateFromPeople()
  const device = findDevice(deviceId)
  if (!device) {
    throw new MockApiError({ code: 'NOT_FOUND', requestId, message: '设备不存在或已失去查看权限' })
  }
  assertVersion(device, version, requestId)
  if (device.lifecycleStatus === 'inactive') {
    throw new MockApiError({ code: 'VALIDATION', requestId, message: '设备已停用' })
  }
  device.lifecycleStatus = 'inactive'
  device.onlineStatus = 'offline'
  device.version += 1
  device.maintenance.push({
    id: `MT-OFF-${device.version}`,
    at: TEST_CLOCK_ISO,
    actorName: CURRENT_OPERATOR.name,
    action: '停用',
    note: device.employeeId ? '停用后仍保留当前佩戴关系，可再解绑' : '停用未绑定设备',
  })
  return cloneJson(device)
}

function runBatch(
  requestId: string,
  deviceIds: string[],
  runner: (deviceId: string) => void,
): BatchOpResult {
  const results: BatchItemResult[] = []
  for (const deviceId of deviceIds) {
    const device = findDevice(deviceId)
    const label = device ? `${device.deviceName} / ${device.imei}` : deviceId
    try {
      runner(deviceId)
      const latest = findDevice(deviceId)
      results.push({
        key: deviceId,
        label,
        success: true,
        message: latest ? `已处理（版本 ${latest.version}）` : '已处理',
      })
    } catch (error) {
      const message = error instanceof MockApiError ? error.message : '处理失败'
      results.push({ key: deviceId, label, success: false, message })
    }
  }
  return {
    requestId,
    results,
    successCount: results.filter((item) => item.success).length,
    failCount: results.filter((item) => !item.success).length,
  }
}

export async function batchUnbindDevices(scene: DeviceDemoScene, deviceIds: string[]): Promise<BatchOpResult> {
  resetIfNeeded(scene)
  await wait(280)
  const requestId = newRequestId('OK')
  assertWritable(scene, requestId)
  hydrateFromPeople()
  if (deviceIds.length === 0) {
    throw new MockApiError({ code: 'VALIDATION', requestId, message: '请选择要解绑的设备' })
  }
  return runBatch(requestId, deviceIds, (deviceId) => {
    const device = findDevice(deviceId)
    if (!device) {
      throw new MockApiError({ code: 'NOT_FOUND', requestId, message: '设备不存在' })
    }
    if (!device.employeeId) {
      throw new MockApiError({ code: 'VALIDATION', requestId, message: '设备当前未绑定人员' })
    }
    applyPersonDeviceUnbind(device.employeeId, device.deviceId)
    const open = device.bindings.find((item) => item.unboundAt === null)
    if (open) {
      open.unboundAt = TEST_CLOCK_ISO
      open.note = '批量解绑'
    }
    const name = device.employeeName
    device.employeeId = null
    device.employeeName = null
    device.empCode = null
    device.version += 1
    device.maintenance.push({
      id: `MT-BUNBIND-${device.version}`,
      at: TEST_CLOCK_ISO,
      actorName: CURRENT_OPERATOR.name,
      action: '解除绑定',
      note: `批量：${name}`,
    })
  })
}

export async function batchDeactivateDevices(scene: DeviceDemoScene, deviceIds: string[]): Promise<BatchOpResult> {
  resetIfNeeded(scene)
  await wait(280)
  const requestId = newRequestId('OK')
  assertWritable(scene, requestId)
  hydrateFromPeople()
  if (deviceIds.length === 0) {
    throw new MockApiError({ code: 'VALIDATION', requestId, message: '请选择要停用的设备' })
  }
  return runBatch(requestId, deviceIds, (deviceId) => {
    const device = findDevice(deviceId)
    if (!device) {
      throw new MockApiError({ code: 'NOT_FOUND', requestId, message: '设备不存在' })
    }
    if (device.lifecycleStatus === 'inactive') {
      throw new MockApiError({ code: 'VALIDATION', requestId, message: '设备已停用' })
    }
    device.lifecycleStatus = 'inactive'
    device.onlineStatus = 'offline'
    device.version += 1
    device.maintenance.push({
      id: `MT-BOFF-${device.version}`,
      at: TEST_CLOCK_ISO,
      actorName: CURRENT_OPERATOR.name,
      action: '停用',
      note: '批量停用',
    })
  })
}

export function parseDeviceImportText(text: string): DeviceImportRow[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const rows: DeviceImportRow[] = []
  lines.forEach((line, index) => {
    if (index === 0 && /imei/i.test(line) && line.includes(',')) return
    const parts = line.split(',').map((item) => item.trim())
    rows.push({
      line: index + 1,
      imei: parts[0] ?? '',
      deviceName: parts[1] ?? '',
      model: parts[2] ?? '',
      firmware: parts[3] || null,
      departmentId: parts[4] || null,
    })
  })
  return rows
}

export async function importDevices(scene: DeviceDemoScene, rows: DeviceImportRow[]): Promise<BatchOpResult> {
  resetIfNeeded(scene)
  await wait(280)
  const requestId = newRequestId('OK')
  assertWritable(scene, requestId)
  hydrateFromPeople()
  if (rows.length === 0) {
    throw new MockApiError({ code: 'VALIDATION', requestId, message: '没有可导入的行' })
  }
  const seen = new Set<string>()
  const results: BatchItemResult[] = []
  for (const row of rows) {
    const label = row.imei || `第 ${row.line} 行`
    try {
      if (!row.imei.trim()) {
        throw new MockApiError({ code: 'VALIDATION', requestId, message: 'IMEI 为空' })
      }
      if (!IMEI_PATTERN.test(row.imei.trim())) {
        throw new MockApiError({ code: 'VALIDATION', requestId, message: 'IMEI 必须是 15 位数字' })
      }
      if (!row.deviceName.trim()) {
        throw new MockApiError({ code: 'VALIDATION', requestId, message: '设备名称为空' })
      }
      if (!row.model.trim()) {
        throw new MockApiError({ code: 'VALIDATION', requestId, message: '型号为空' })
      }
      const imei = row.imei.trim()
      if (seen.has(imei)) {
        throw new MockApiError({ code: 'VALIDATION', requestId, message: '文件内 IMEI 重复' })
      }
      seen.add(imei)
      if (store.records.some((item) => item.imei === imei) || peekPeopleRecords().some((item) => item.imei === imei)) {
        throw new MockApiError({ code: 'VALIDATION', requestId, message: 'IMEI 已存在' })
      }
      let departmentId: string | null = row.departmentId?.trim() || null
      let departmentName: string | null = null
      if (departmentId) {
        const department = findDepartment(departmentId)
        if (!department) {
          throw new MockApiError({ code: 'VALIDATION', requestId, message: '部门不存在' })
        }
        departmentName = department.name
      }
      const created = createBlankDevice({
        deviceId: `DEV-${imei}`,
        imei,
        deviceName: row.deviceName.trim(),
        model: row.model.trim(),
        firmware: row.firmware?.trim() || null,
        departmentId,
        departmentName,
        remark: `批量导入第 ${row.line} 行`,
      })
      store.records.unshift(created)
      results.push({ key: imei, label: `${created.deviceName} / ${imei}`, success: true, message: '已登记' })
    } catch (error) {
      const message = error instanceof MockApiError ? error.message : '导入失败'
      results.push({ key: `${row.line}-${row.imei}`, label, success: false, message })
    }
  }
  hydrateFromPeople()
  return {
    requestId,
    results,
    successCount: results.filter((item) => item.success).length,
    failCount: results.filter((item) => !item.success).length,
  }
}

export const DEVICE_IMPORT_SAMPLE = `imei,deviceName,model
869234051050001,导入成功表甲,HW-T10
869234051029801,重复IMEI表,HW-T10
12345,IMEI位数错误,HW-T20
,缺少IMEI,HW-T10
869234051050002,导入成功表乙,HW-T20
869234051050001,文件内重复IMEI,HW-T30`
