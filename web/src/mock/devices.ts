import { DEFAULT_PEOPLE } from './people'
import { getTestClock } from './session'
import type { DeviceRecord, PersonRecord } from './types'

export const DEVICE_MODELS = ['HW-T10', 'HW-T20', 'HW-T30'] as const
export const LOW_BATTERY_MAX = 20
/** 与实时监控共用：15 分钟内有通信视为在线，含等于 15:00 边界。 */
export const ONLINE_WINDOW_MS = 15 * 60 * 1000

export function modelForImei(imei: string): string {
  const last = Number(imei.slice(-1))
  if (Number.isNaN(last)) return DEVICE_MODELS[0]
  return DEVICE_MODELS[last % DEVICE_MODELS.length]
}

export function ageMs(atIso: string | null | undefined, clock = getTestClock()): number | null {
  if (!atIso) return null
  const at = new Date(atIso).getTime()
  if (Number.isNaN(at)) return null
  return clock.getTime() - at
}

/** 含等于窗口上界；未来时间（age < 0）不在窗口内。 */
export function isWithinLookbackWindow(
  atIso: string | null | undefined,
  windowMs: number,
  clock = getTestClock(),
): boolean {
  const age = ageMs(atIso, clock)
  if (age === null) return false
  return age >= 0 && age <= windowMs
}

export function isOnlineAt(lastCommAt: string | null, clock = getTestClock()): boolean {
  return isWithinLookbackWindow(lastCommAt, ONLINE_WINDOW_MS, clock)
}

function batteryForPerson(person: PersonRecord, index: number): number | null {
  if (person.employeeId === 'EMP-DEMO-002') return 12
  if (person.employeeId === 'EMP-005875012') return 18
  if (person.employeeId === 'EMP-005875019') return null
  if (index % 9 === 4) return null
  if (index % 9 === 8) return 9
  return [91, 76, 54, 33, 64, 82, 47, 70, 25][index % 9]
}

function firmwareForPerson(person: PersonRecord, index: number): string | null {
  if (person.employeeId === 'EMP-005875019') return null
  if (index % 11 === 0) return null
  return ['1.4.2', '1.3.9', '1.2.0'][index % 3]
}

function networkForPerson(person: PersonRecord, index: number): string | null {
  if (person.employeeId === 'EMP-005875019') return null
  if (index % 11 === 0) return null
  return ['4G', 'NB-IoT', '4G'][index % 3]
}

function historyId(prefix: string, seed: string): string {
  return `${prefix}-${seed.slice(-6)}`
}

function deviceFromPerson(person: PersonRecord, index: number): DeviceRecord {
  const imei = person.imei as string
  const deviceId = person.deviceId as string
  const lastCommAt = person.lastOnlineAt
  const lastDataAt = person.lastHealthAt
  const model = modelForImei(imei)
  return {
    deviceId,
    imei,
    deviceName: `${model} · ${person.empName}`,
    model,
    firmware: firmwareForPerson(person, index),
    network: networkForPerson(person, index),
    departmentId: person.departmentId,
    departmentName: person.departmentName,
    employeeId: person.employeeId,
    employeeName: person.empName,
    empCode: person.empCode,
    onlineStatus: isOnlineAt(lastCommAt) ? 'online' : 'offline',
    lifecycleStatus: 'active',
    batteryPercent: batteryForPerson(person, index),
    lastCommAt,
    lastDataAt,
    lastOnlineAt: lastCommAt,
    remark: person.remark,
    version: 1,
    bindings: [
      {
        id: historyId('BH', deviceId),
        employeeId: person.employeeId,
        employeeName: person.empName,
        empCode: person.empCode,
        boundAt: '2026-08-01T08:00:00+08:00',
        unboundAt: null,
        note: '当前佩戴',
      },
    ],
    maintenance: [
      {
        id: historyId('MT', deviceId),
        at: '2026-07-15T10:00:00+08:00',
        actorName: '设备管理员',
        action: '入库登记',
        note: 'mock 测试数据',
      },
    ],
    errors: errorsFor(person, lastCommAt, batteryForPerson(person, index)),
  }
}

function errorsFor(person: PersonRecord, lastCommAt: string | null, battery: number | null): DeviceRecord['errors'] {
  const errors: DeviceRecord['errors'] = []
  if (!isOnlineAt(lastCommAt)) {
    errors.push({
      id: `ER-OFF-${person.employeeId}`,
      at: lastCommAt ?? '2026-09-12T14:00:00+08:00',
      code: 'HEARTBEAT_TIMEOUT',
      message: '超过 15 分钟未收到心跳，当前按离线展示',
    })
  }
  if (battery === null) {
    errors.push({
      id: `ER-BAT-${person.employeeId}`,
      at: lastCommAt ?? '2026-09-12T14:00:00+08:00',
      code: 'BATTERY_UNKNOWN',
      message: '未收到有效电量，显示为未知，不能按 0% 处理',
    })
  } else if (battery <= LOW_BATTERY_MAX) {
    errors.push({
      id: `ER-LOW-${person.employeeId}`,
      at: lastCommAt ?? '2026-09-12T14:00:00+08:00',
      code: 'LOW_BATTERY',
      message: `权威电量 ${battery}%，低于 ${LOW_BATTERY_MAX}%`,
    })
  }
  return errors
}

function extraDevice(partial: Omit<DeviceRecord, 'version' | 'bindings' | 'maintenance' | 'errors'> & {
  bindings?: DeviceRecord['bindings']
  maintenance?: DeviceRecord['maintenance']
  errors?: DeviceRecord['errors']
}): DeviceRecord {
  const { bindings, maintenance, errors, ...rest } = partial
  return {
    ...rest,
    version: 1,
    bindings: bindings ?? [],
    maintenance: maintenance ?? [
      {
        id: `MT-${rest.deviceId.slice(-6)}`,
        at: '2026-07-20T09:30:00+08:00',
        actorName: '设备管理员',
        action: '入库登记',
        note: 'mock 测试数据',
      },
    ],
    errors: errors ?? [],
  }
}

const EXTRA_DEVICES: DeviceRecord[] = [
  extraDevice({
    deviceId: 'DEV-869234051040001',
    imei: '869234051040001',
    deviceName: '未绑定在线表',
    model: 'HW-T10',
    firmware: '1.4.2',
    network: '4G',
    departmentId: 'D-JD',
    departmentName: '机电运输队',
    employeeId: null,
    employeeName: null,
    empCode: null,
    onlineStatus: 'online',
    lifecycleStatus: 'active',
    batteryPercent: 88,
    lastCommAt: '2026-09-12T15:55:10+08:00',
    lastDataAt: '2026-09-12T15:50:00+08:00',
    lastOnlineAt: '2026-09-12T15:55:10+08:00',
    remark: '在线未绑定，可演示绑定。',
  }),
  extraDevice({
    deviceId: 'DEV-869234051040002',
    imei: '869234051040002',
    deviceName: '未绑定低电表',
    model: 'HW-T20',
    firmware: '1.3.9',
    network: 'NB-IoT',
    departmentId: 'D-AQ',
    departmentName: '安全巡检队',
    employeeId: null,
    employeeName: null,
    empCode: null,
    onlineStatus: 'offline',
    lifecycleStatus: 'active',
    batteryPercent: 8,
    lastCommAt: '2026-09-12T14:10:00+08:00',
    lastDataAt: '2026-09-12T14:08:00+08:00',
    lastOnlineAt: '2026-09-12T14:10:00+08:00',
    remark: '离线且低电。',
    errors: [
      {
        id: 'ER-040002-OFF',
        at: '2026-09-12T14:10:00+08:00',
        code: 'HEARTBEAT_TIMEOUT',
        message: '超过 15 分钟未收到心跳，当前按离线展示',
      },
      {
        id: 'ER-040002-LOW',
        at: '2026-09-12T14:08:00+08:00',
        code: 'LOW_BATTERY',
        message: '权威电量 8%，低于 20%',
      },
    ],
  }),
  extraDevice({
    deviceId: 'DEV-869234051040003',
    imei: '869234051040003',
    deviceName: '电量未知表',
    model: 'HW-T30',
    firmware: '1.4.2',
    network: '4G',
    departmentId: null,
    departmentName: null,
    employeeId: null,
    employeeName: null,
    empCode: null,
    onlineStatus: 'online',
    lifecycleStatus: 'active',
    batteryPercent: null,
    lastCommAt: '2026-09-12T15:57:40+08:00',
    lastDataAt: '2026-09-12T15:40:00+08:00',
    lastOnlineAt: '2026-09-12T15:57:40+08:00',
    remark: '电量字段缺失，必须显示未知。',
    errors: [
      {
        id: 'ER-040003-BAT',
        at: '2026-09-12T15:57:40+08:00',
        code: 'BATTERY_UNKNOWN',
        message: '未收到有效电量，显示为未知，不能按 0% 处理',
      },
    ],
  }),
  extraDevice({
    deviceId: 'DEV-869234051040004',
    imei: '869234051040004',
    deviceName: '已停用演示表',
    model: 'HW-T10',
    firmware: '1.2.0',
    network: 'NB-IoT',
    departmentId: 'D-CJ1',
    departmentName: '采掘一队',
    employeeId: null,
    employeeName: null,
    empCode: null,
    onlineStatus: 'offline',
    lifecycleStatus: 'inactive',
    batteryPercent: 41,
    lastCommAt: '2026-09-10T11:00:00+08:00',
    lastDataAt: '2026-09-10T10:50:00+08:00',
    lastOnlineAt: '2026-09-10T11:00:00+08:00',
    remark: '已停用，不能再绑定。',
    bindings: [
      {
        id: 'BH-040004-OLD',
        employeeId: 'EMP-005875008',
        employeeName: '张伟',
        empCode: '005875008',
        boundAt: '2026-06-01T08:00:00+08:00',
        unboundAt: '2026-08-20T18:00:00+08:00',
        note: '停用前已解绑',
      },
    ],
    maintenance: [
      {
        id: 'MT-040004-IN',
        at: '2026-06-01T08:00:00+08:00',
        actorName: '设备管理员',
        action: '入库登记',
        note: 'mock 测试数据',
      },
      {
        id: 'MT-040004-OFF',
        at: '2026-09-10T16:00:00+08:00',
        actorName: '值班员·管理员',
        action: '停用',
        note: '演示已停用设备',
      },
    ],
  }),
  extraDevice({
    deviceId: 'DEV-869234051040005',
    imei: '869234051040005',
    deviceName: '字段缺失演示表',
    model: 'HW-T20',
    firmware: null,
    network: null,
    departmentId: null,
    departmentName: null,
    employeeId: null,
    employeeName: null,
    empCode: null,
    onlineStatus: 'offline',
    lifecycleStatus: 'active',
    batteryPercent: null,
    lastCommAt: null,
    lastDataAt: null,
    lastOnlineAt: null,
    remark: '固件、网络、通信时间和电量均缺失。',
    errors: [
      {
        id: 'ER-040005-MISS',
        at: '2026-09-12T16:00:00+08:00',
        code: 'FIELDS_MISSING',
        message: '固件、网络、最近通信、最后数据和电量均缺失',
      },
    ],
  }),
  extraDevice({
    deviceId: 'DEV-869234051040006',
    imei: '869234051040006',
    deviceName: '超长设备名称用于检查列表折行与抽屉滚动的演示手表甲乙丙丁戊己庚辛壬癸',
    model: 'HW-T30',
    firmware: '1.4.2-long-build.20260912.hotfix.very-long-firmware-string',
    network: '4G / 井下分站中继 / 超长网络说明字段',
    departmentId: 'D-LONG',
    departmentName: '综采工作面超长部门名称机电运输联合保障班',
    employeeId: null,
    employeeName: null,
    empCode: null,
    onlineStatus: 'offline',
    lifecycleStatus: 'active',
    batteryPercent: 63,
    lastCommAt: '2026-09-12T15:20:00+08:00',
    lastDataAt: '2026-09-12T15:10:00+08:00',
    lastOnlineAt: '2026-09-12T15:20:00+08:00',
    remark:
      '长备注检查：该设备用于验证列表与详情对超长名称、超长固件、超长部门和超长说明的折行与横向滚动，不能为了视觉效果删除这些字段。',
    errors: [
      {
        id: 'ER-040006-PARSE',
        at: '2026-09-12T15:18:00+08:00',
        code: 'PARSE_FAILED',
        message: '最近一次状态报文解析失败，原始报文页尚未接入，不能查看内容',
      },
    ],
  }),
  extraDevice({
    deviceId: 'DEV-869234051040007',
    imei: '869234051040007',
    deviceName: '电量为零表',
    model: 'HW-T10',
    firmware: '1.3.9',
    network: 'NB-IoT',
    departmentId: 'D-TF',
    departmentName: '通风防尘区',
    employeeId: null,
    employeeName: null,
    empCode: null,
    onlineStatus: 'offline',
    lifecycleStatus: 'active',
    batteryPercent: 0,
    lastCommAt: '2026-09-12T13:40:00+08:00',
    lastDataAt: '2026-09-12T13:39:00+08:00',
    lastOnlineAt: '2026-09-12T13:40:00+08:00',
    remark: '已知电量 0%，与未知电量不是同一状态。',
    errors: [
      {
        id: 'ER-040007-ZERO',
        at: '2026-09-12T13:39:00+08:00',
        code: 'LOW_BATTERY',
        message: '权威电量 0%，低于 20%',
      },
    ],
  }),
]

export function createBlankDevice(payload: {
  deviceId: string
  imei: string
  deviceName: string
  model: string
  firmware: string | null
  departmentId: string | null
  departmentName: string | null
  remark: string | null
}): DeviceRecord {
  return {
    deviceId: payload.deviceId,
    imei: payload.imei,
    deviceName: payload.deviceName,
    model: payload.model,
    firmware: payload.firmware,
    network: null,
    departmentId: payload.departmentId,
    departmentName: payload.departmentName,
    employeeId: null,
    employeeName: null,
    empCode: null,
    onlineStatus: 'offline',
    lifecycleStatus: 'active',
    batteryPercent: null,
    lastCommAt: null,
    lastDataAt: null,
    lastOnlineAt: null,
    remark: payload.remark,
    version: 1,
    bindings: [],
    maintenance: [
      {
        id: `MT-NEW-${payload.imei.slice(-6)}`,
        at: '2026-09-12T16:00:00+08:00',
        actorName: '值班员·管理员',
        action: '入库登记',
        note: 'mock 新增，尚未收到通信',
      },
    ],
    errors: [],
  }
}

export function buildDefaultDevices(): DeviceRecord[] {
  const fromPeople = DEFAULT_PEOPLE
    .filter((item) => item.deviceId && item.imei)
    .map((item, index) => deviceFromPerson(item, index))

  const zhangwei = fromPeople.find((item) => item.employeeId === 'EMP-005875008')
  if (zhangwei) {
    zhangwei.bindings = [
      {
        id: 'BH-808-OLD',
        employeeId: 'EMP-DEMO-001',
        employeeName: '演示职工甲',
        empCode: 'DEMO0001',
        boundAt: '2026-05-01T08:00:00+08:00',
        unboundAt: '2026-07-31T18:00:00+08:00',
        note: '历史佩戴，已解绑',
      },
      ...zhangwei.bindings,
    ]
  }

  return [...fromPeople, ...EXTRA_DEVICES.map((item) => ({
    ...item,
    bindings: item.bindings.map((row) => ({ ...row })),
    maintenance: item.maintenance.map((row) => ({ ...row })),
    errors: item.errors.map((row) => ({ ...row })),
  }))]
}
