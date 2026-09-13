import { MockApiError } from './errors'
import { cloneJson } from './format'
import { buildDefaultDevices, createBlankDevice, DEVICE_MODELS } from './devices'
import { CURRENT_OPERATOR, TEST_CLOCK_ISO } from './session'
import type { DeviceDemoScene, DeviceRecord, PersonRecord } from './types'

interface DeviceStore {
  scene: DeviceDemoScene
  records: DeviceRecord[]
  seq: number
}

export const IMEI_PATTERN = /^\d{15}$/

const root = globalThis as typeof globalThis & { __hnDeviceStore?: DeviceStore }
export const deviceStore: DeviceStore = root.__hnDeviceStore ?? {
  scene: 'default',
  records: cloneJson(buildDefaultDevices()),
  seq: 400,
}
root.__hnDeviceStore = deviceStore

export function resetDeviceStoreIfNeeded(scene: DeviceDemoScene) {
  if (deviceStore.scene !== scene) {
    deviceStore.scene = scene
    deviceStore.records = scene === 'empty' ? [] : cloneJson(buildDefaultDevices())
    deviceStore.seq = 400
  }
}

export function peekDeviceRecords(): DeviceRecord[] {
  return deviceStore.records
}

export function findDeviceById(deviceId: string | null | undefined): DeviceRecord | undefined {
  if (!deviceId) return undefined
  return deviceStore.records.find((item) => item.deviceId === deviceId)
}

export function findDeviceByImei(imei: string | null | undefined): DeviceRecord | undefined {
  if (!imei) return undefined
  return deviceStore.records.find((item) => item.imei === imei)
}

export type PersonBindingPlan =
  | { action: 'none'; imei: string | null; deviceId: string | null }
  | { action: 'unbind'; imei: null; deviceId: null; previousDeviceId: string }
  | { action: 'attach'; imei: string; deviceId: string; previousDeviceId: string | null }
  | { action: 'update-imei'; imei: string; deviceId: string }
  | { action: 'register'; imei: string; deviceId: string }

function closeOpenBinding(device: DeviceRecord, note: string) {
  const open = device.bindings.find((item) => item.unboundAt === null)
  if (open) {
    open.unboundAt = TEST_CLOCK_ISO
    open.note = note
  }
}

function unbindDeviceRecord(deviceId: string, note: string) {
  const device = findDeviceById(deviceId)
  if (!device) return
  closeOpenBinding(device, note)
  device.employeeId = null
  device.employeeName = null
  device.empCode = null
  device.version += 1
}

function bindDeviceRecord(device: DeviceRecord, person: PersonRecord, note: string) {
  closeOpenBinding(device, '绑定关系变更')
  device.employeeId = person.employeeId
  device.employeeName = person.empName
  device.empCode = person.empCode
  device.departmentId = person.departmentId
  device.departmentName = person.departmentName
  device.bindings.push({
    id: `BH-${device.deviceId.slice(-4)}-${person.employeeId.slice(-4)}-${device.version + 1}`,
    employeeId: person.employeeId,
    employeeName: person.empName,
    empCode: person.empCode,
    boundAt: TEST_CLOCK_ISO,
    unboundAt: null,
    note,
  })
  device.version += 1
  device.maintenance.push({
    id: `MT-BIND-${device.version}`,
    at: TEST_CLOCK_ISO,
    actorName: CURRENT_OPERATOR.name,
    action: '绑定人员',
    note: `${person.empName} / ${person.empCode}`,
  })
}

export function planPersonImeiBinding(
  current: { employeeId: string | null; imei: string | null; deviceId: string | null },
  nextImeiRaw: string | null | undefined,
  people: PersonRecord[],
  requestId: string,
): PersonBindingPlan {
  const nextImei = nextImeiRaw?.trim() || null
  if (nextImei && !IMEI_PATTERN.test(nextImei)) {
    throw new MockApiError({ code: 'VALIDATION', requestId, message: 'IMEI 必须是 15 位数字', field: 'imei' })
  }

  const currentDeviceId = current.deviceId
  const currentImei = current.imei
  const employeeId = current.employeeId
  const currentDevice = findDeviceById(currentDeviceId)

  if (!nextImei) {
    if (currentDeviceId) return { action: 'unbind', imei: null, deviceId: null, previousDeviceId: currentDeviceId }
    return { action: 'none', imei: null, deviceId: null }
  }

  const occupiedPerson = people.find((item) => item.employeeId !== employeeId && (item.imei === nextImei || (
    Boolean(item.deviceId) && findDeviceById(item.deviceId)?.imei === nextImei
  )))
  if (occupiedPerson) {
    throw new MockApiError({
      code: 'CONFLICT',
      requestId,
      message: `${occupiedPerson.empName} 已绑定 IMEI ${nextImei}，同一设备不能绑定多人`,
      field: 'imei',
    })
  }

  const deviceByImei = findDeviceByImei(nextImei)

  if (currentImei === nextImei) {
    return { action: 'none', imei: nextImei, deviceId: currentDeviceId }
  }

  if (deviceByImei) {
    if (deviceByImei.lifecycleStatus === 'inactive' && deviceByImei.deviceId !== currentDeviceId) {
      throw new MockApiError({
        code: 'VALIDATION',
        requestId,
        message: '设备已停用，不能从人员入口绑定',
        field: 'imei',
      })
    }
    if (deviceByImei.deviceId === currentDeviceId) {
      return { action: 'none', imei: nextImei, deviceId: currentDeviceId }
    }
    const boundOther = deviceByImei.employeeId && deviceByImei.employeeId !== employeeId
    const personOther = people.find((item) => item.employeeId !== employeeId && item.deviceId === deviceByImei.deviceId)
    if (boundOther || personOther) {
      throw new MockApiError({
        code: 'CONFLICT',
        requestId,
        message: `设备已绑定给 ${deviceByImei.employeeName || personOther?.empName}，不能重复绑定`,
        field: 'imei',
      })
    }
    if (deviceByImei.lifecycleStatus === 'inactive') {
      throw new MockApiError({
        code: 'VALIDATION',
        requestId,
        message: '设备已停用，不能从人员入口绑定',
        field: 'imei',
      })
    }
    return {
      action: 'attach',
      imei: nextImei,
      deviceId: deviceByImei.deviceId,
      previousDeviceId: currentDeviceId && currentDeviceId !== deviceByImei.deviceId ? currentDeviceId : null,
    }
  }

  if (currentDeviceId) {
    return { action: 'update-imei', imei: nextImei, deviceId: currentDeviceId }
  }

  return { action: 'register', imei: nextImei, deviceId: `DEV-${nextImei}` }
}

export function commitPersonBinding(person: PersonRecord, plan: PersonBindingPlan) {
  if (plan.action === 'none') {
    syncBoundPersonProfile(person)
    return
  }
  if (plan.action === 'unbind') {
    unbindDeviceRecord(plan.previousDeviceId, '人员档案解绑')
    return
  }
  if (plan.action === 'update-imei') {
    const device = findDeviceById(plan.deviceId)
    if (device) {
      device.imei = plan.imei
      device.version += 1
      syncBoundPersonProfile(person)
      return
    }
    registerBoundDevice(person, plan.deviceId, plan.imei)
    return
  }
  if (plan.action === 'attach') {
    if (plan.previousDeviceId) unbindDeviceRecord(plan.previousDeviceId, '人员改绑')
    const device = findDeviceById(plan.deviceId)
    if (!device) {
      registerBoundDevice(person, plan.deviceId, plan.imei)
      return
    }
    bindDeviceRecord(device, person, '人员档案绑定')
    return
  }
  registerBoundDevice(person, plan.deviceId, plan.imei)
}

function registerBoundDevice(person: PersonRecord, deviceId: string, imei: string) {
  if (findDeviceById(deviceId) || findDeviceByImei(imei)) {
    const existing = findDeviceById(deviceId) ?? findDeviceByImei(imei)
    if (existing) bindDeviceRecord(existing, person, '人员档案绑定')
    return
  }
  const created = createBlankDevice({
    deviceId,
    imei,
    deviceName: `${person.empName} 的手表`,
    model: DEVICE_MODELS[0],
    firmware: null,
    departmentId: person.departmentId,
    departmentName: person.departmentName,
    remark: '由人员档案登记（mock）',
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
    note: '人员档案登记',
  }]
  deviceStore.records.unshift(created)
}

export function syncBoundPersonProfile(person: PersonRecord) {
  if (!person.deviceId) return
  const device = findDeviceById(person.deviceId)
  if (!device) return
  device.employeeId = person.employeeId
  device.employeeName = person.empName
  device.empCode = person.empCode
  device.departmentId = person.departmentId
  device.departmentName = person.departmentName
}
