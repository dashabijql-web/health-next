import { CURRENT_OPERATOR, TEST_CLOCK_DATE, TEST_CLOCK_ISO } from './session'
import type { HandlingState, IncidentRecord, IncidentSource, RecoveryState, Severity } from './types'

function timeline(
  incidentId: string,
  items: Array<Omit<IncidentRecord['timeline'][number], 'id'>>,
): IncidentRecord['timeline'] {
  return items.map((item, index) => ({
    ...item,
    id: `${incidentId}-TL-${String(index + 1).padStart(2, '0')}`,
  }))
}

/** 四条固定起始样本。人名以“演示”开头。摘要：我的待办 2、高危未确认 1、未分派 2、已超时 1。 */
export const CORE_INCIDENTS: IncidentRecord[] = [
  {
    incidentId: 'INC-DEMO-001',
    employeeId: 'EMP-DEMO-001',
    employeeName: '演示职工甲',
    departmentId: 'D-ZC2',
    departmentName: '综采二队',
    jobName: '支架检修工',
    deviceId: 'DEV-869234051029801',
    locationText: null,
    locationMissingReason: '暂无位置',
    source: 'HEALTH_THRESHOLD',
    eventCode: 'HR_HIGH',
    eventName: '心率异常',
    severity: 'critical',
    occurredAt: '2026-09-12T14:20:18+08:00',
    evidence: [
      {
        metric: 'heartRate',
        metricLabel: '心率',
        value: 126,
        unit: 'bpm',
        measuredAt: '2026-09-12T14:20:18+08:00',
        valid: true,
        stale: false,
        thresholdNote: 'mock 测试数据：心率持续高于 100 bpm（非正式健康规则）',
      },
    ],
    recoveryState: 'abnormal',
    handlingState: 'new',
    assignee: null,
    dueAt: '2026-09-12T17:00:00+08:00',
    version: 1,
    remark: null,
    lastUpdatedAt: '2026-09-12T14:20:18+08:00',
    timeline: timeline('INC-DEMO-001', [
      {
        action: 'create',
        actorId: 'SYS',
        actorName: '规则引擎',
        at: '2026-09-12T14:20:18+08:00',
        remark: '连续异常过程建立（mock 测试数据）',
        result: '新建待办',
      },
    ]),
  },
  {
    incidentId: 'INC-DEMO-002',
    employeeId: 'EMP-DEMO-002',
    employeeName: '演示职工乙',
    departmentId: 'D-JD',
    departmentName: '机电运输队',
    jobName: '井下电工',
    deviceId: 'DEV-869234051029802',
    locationText: null,
    locationMissingReason: '暂无位置',
    source: 'DEVICE_ALARM',
    eventCode: 'DEVICE_LOW_BATTERY',
    eventName: '设备低电',
    severity: 'info',
    occurredAt: '2026-09-12T15:12:40+08:00',
    evidence: [
      {
        metric: 'battery',
        metricLabel: '电量',
        value: 8,
        unit: '%',
        measuredAt: '2026-09-12T15:12:40+08:00',
        valid: true,
        stale: false,
        thresholdNote: 'mock 测试数据：设备电量低于 10%（非正式设备策略）',
      },
    ],
    recoveryState: 'not_applicable',
    handlingState: 'new',
    assignee: null,
    dueAt: null,
    version: 1,
    remark: null,
    lastUpdatedAt: '2026-09-12T15:12:40+08:00',
    timeline: timeline('INC-DEMO-002', [
      {
        action: 'create',
        actorId: 'SYS',
        actorName: '设备网关',
        at: '2026-09-12T15:12:40+08:00',
        remark: '手表上报低电。此条不是 SOS，也不是体征超限。',
        result: '新建待办',
      },
    ]),
  },
  {
    incidentId: 'INC-DEMO-003',
    employeeId: 'EMP-DEMO-003',
    employeeName: '演示职工丙',
    departmentId: 'D-JJ3',
    departmentName: '掘进三队',
    jobName: '掘进机司机',
    deviceId: 'DEV-869234051029803',
    locationText: '演示巷道B（示意，非正式坐标）',
    locationMissingReason: null,
    source: 'HEALTH_THRESHOLD',
    eventCode: 'SPO2_LOW',
    eventName: '血氧异常',
    severity: 'critical',
    occurredAt: '2026-09-12T14:48:05+08:00',
    evidence: [
      {
        metric: 'bloodOxygen',
        metricLabel: '血氧',
        value: 91,
        unit: '%',
        measuredAt: '2026-09-12T14:48:05+08:00',
        valid: true,
        stale: false,
        thresholdNote: 'mock 测试数据：血氧持续低于 95%（非正式健康规则）',
      },
    ],
    recoveryState: 'recovering',
    handlingState: 'processing',
    assignee: { userId: CURRENT_OPERATOR.userId, name: CURRENT_OPERATOR.name },
    dueAt: '2026-09-12T15:20:00+08:00',
    version: 4,
    remark: '已安排就近观察，等待新的有效读数。',
    lastUpdatedAt: '2026-09-12T15:05:12+08:00',
    timeline: timeline('INC-DEMO-003', [
      {
        action: 'create',
        actorId: 'SYS',
        actorName: '规则引擎',
        at: '2026-09-12T14:48:05+08:00',
        remark: '连续低血氧过程建立（mock 测试数据）',
        result: '新建待办',
      },
      {
        action: 'confirm',
        actorId: CURRENT_OPERATOR.userId,
        actorName: CURRENT_OPERATOR.name,
        at: '2026-09-12T14:52:10+08:00',
        remark: '已核对测量时间与设备绑定',
        result: '已确认',
      },
      {
        action: 'assign',
        actorId: CURRENT_OPERATOR.userId,
        actorName: CURRENT_OPERATOR.name,
        at: '2026-09-12T14:52:40+08:00',
        remark: `分派给 ${CURRENT_OPERATOR.name}`,
        result: '已分派',
      },
      {
        action: 'start_handle',
        actorId: CURRENT_OPERATOR.userId,
        actorName: CURRENT_OPERATOR.name,
        at: '2026-09-12T15:05:12+08:00',
        remark: '开始现场观察',
        result: '处理中',
      },
    ]),
  },
  {
    incidentId: 'INC-DEMO-004',
    employeeId: 'EMP-DEMO-004',
    employeeName: '演示职工丁',
    departmentId: 'D-TF',
    departmentName: '通风防尘区',
    jobName: '瓦斯测定员',
    deviceId: 'DEV-869234051029804',
    locationText: '演示回风巷口（示意，非正式坐标）',
    locationMissingReason: null,
    source: 'HEALTH_THRESHOLD',
    eventCode: 'BP_HIGH',
    eventName: '血压异常',
    severity: 'warning',
    occurredAt: '2026-09-12T13:05:22+08:00',
    evidence: [
      {
        metric: 'bloodPressure',
        metricLabel: '血压',
        value: '162/102',
        unit: 'mmHg',
        measuredAt: '2026-09-12T13:05:22+08:00',
        valid: true,
        stale: false,
        thresholdNote: 'mock 测试数据：收缩压 ≥ 140 或舒张压 ≥ 90（非正式健康规则）',
      },
    ],
    recoveryState: 'recovered',
    handlingState: 'completed',
    assignee: { userId: CURRENT_OPERATOR.userId, name: CURRENT_OPERATOR.name },
    dueAt: '2026-09-12T19:00:00+08:00',
    version: 5,
    remark:
      '已安排休息并复测。复测血压 128/82 mmHg，连续有效读数达到 mock 恢复条件。关闭前需填写关闭说明。备注用于检查长文本折行：值班员已联系班组长确认人员状态，并在待办中保留完整处理经过，避免把体征恢复误写成已经关闭。',
    lastUpdatedAt: '2026-09-12T15:40:08+08:00',
    timeline: timeline('INC-DEMO-004', [
      {
        action: 'create',
        actorId: 'SYS',
        actorName: '规则引擎',
        at: '2026-09-12T13:05:22+08:00',
        remark: '血压连续异常（mock 测试数据）',
        result: '新建待办',
      },
      {
        action: 'assign',
        actorId: CURRENT_OPERATOR.userId,
        actorName: CURRENT_OPERATOR.name,
        at: '2026-09-12T13:18:00+08:00',
        remark: '直接分派，不补造独立确认记录',
        result: '已分派',
      },
      {
        action: 'start_handle',
        actorId: CURRENT_OPERATOR.userId,
        actorName: CURRENT_OPERATOR.name,
        at: '2026-09-12T13:22:16+08:00',
        remark: '通知班组观察',
        result: '处理中',
      },
      {
        action: 'complete',
        actorId: CURRENT_OPERATOR.userId,
        actorName: CURRENT_OPERATOR.name,
        at: '2026-09-12T15:40:08+08:00',
        remark: '安排休息并复测',
        result: '复测血压 128/82 mmHg，达到 mock 恢复条件',
      },
    ]),
  },
]

const EXTRA_NAMES = [
  '演示职工戊',
  '演示职工己',
  '演示职工庚',
  '演示职工辛',
  '演示职工壬',
  '演示职工癸',
  '演示职工子',
  '演示职工丑',
  '演示职工寅',
  '演示职工卯',
  '演示职工辰',
  '演示职工巳',
  '演示职工午',
  '演示职工未',
  '演示职工申',
  '演示职工酉',
  '演示职工戌',
  '演示职工亥',
  '演示职工乾',
  '演示职工坤',
  '演示职工震',
  '演示职工巽',
  '演示职工坎',
  '演示职工·超长姓名测试甲乙丙丁戊己庚辛',
  ...Array.from({ length: 36 }, (_, index) => `演示职工聚合${String(index + 1).padStart(2, '0')}`),
]

const EXTRA_DEPTS: Array<[string, string]> = [
  ['D-CJ1', '采掘一队'],
  ['D-ZC2', '综采二队'],
  ['D-JJ3', '掘进三队'],
  ['D-TF', '通风防尘区'],
  ['D-JD', '机电运输队'],
  ['D-AQ', '安全巡检队'],
  ['D-DZ', '地质防治水队'],
  ['D-LONG', '综采工作面超长部门名称机电运输联合保障班'],
]

const EXTRA_EVENTS: Array<{
  source: IncidentSource
  eventCode: string
  eventName: string
  metric: string
  metricLabel: string
  value: number | string
  unit: string
  recovery: RecoveryState
  note: string
}> = [
  {
    source: 'HEALTH_THRESHOLD',
    eventCode: 'HR_HIGH',
    eventName: '心率异常',
    metric: 'heartRate',
    metricLabel: '心率',
    value: 118,
    unit: 'bpm',
    recovery: 'abnormal',
    note: 'mock 测试数据：心率持续高于 100 bpm（非正式健康规则）',
  },
  {
    source: 'HEALTH_THRESHOLD',
    eventCode: 'SPO2_LOW',
    eventName: '血氧异常',
    metric: 'bloodOxygen',
    metricLabel: '血氧',
    value: 93,
    unit: '%',
    recovery: 'recovering',
    note: 'mock 测试数据：血氧持续低于 95%（非正式健康规则）',
  },
  {
    source: 'HEALTH_THRESHOLD',
    eventCode: 'TEMP_HIGH',
    eventName: '体温异常',
    metric: 'temperature',
    metricLabel: '体温',
    value: 37.8,
    unit: '℃',
    recovery: 'abnormal',
    note: 'mock 测试数据：体温 ≥ 37.3 ℃（非正式健康规则）',
  },
  {
    source: 'DEVICE_ALARM',
    eventCode: 'DEVICE_LOW_BATTERY',
    eventName: '设备低电',
    metric: 'battery',
    metricLabel: '电量',
    value: 9,
    unit: '%',
    recovery: 'not_applicable',
    note: 'mock 测试数据：设备电量低于 10%（非正式设备策略）',
  },
  {
    source: 'TREND_WARNING',
    eventCode: 'HR_TREND',
    eventName: '心率趋势风险',
    metric: 'heartRate',
    metricLabel: '心率',
    value: 108,
    unit: 'bpm',
    recovery: 'not_applicable',
    note: 'mock 测试数据：短时上升趋势（非正式趋势规则）',
  },
]

const EXTRA_STATES: HandlingState[] = ['new', 'confirmed', 'assigned', 'processing', 'completed']
const EXTRA_SEVERITY: Severity[] = ['critical', 'warning', 'info', 'warning']

function pad(num: number): string {
  return String(num).padStart(2, '0')
}

function extraOccurredAt(index: number): string {
  const minute = 10 + ((index * 7) % 40)
  const hour = 10 + (index % 5)
  return `${TEST_CLOCK_DATE}T${pad(hour)}:${pad(minute)}:00+08:00`
}

function extraDueAt(index: number, state: HandlingState): string | null {
  if (index === 6) return null
  if (state === 'processing' && index % 5 === 0) return '2026-09-12T15:10:00+08:00'
  return `2026-09-12T${pad(17 + (index % 3))}:30:00+08:00`
}

export function buildPaginationIncidents(): IncidentRecord[] {
  const extras: IncidentRecord[] = EXTRA_NAMES.map((name, offset) => {
    const index = offset + 5
    const incidentId = `INC-DEMO-${String(index).padStart(3, '0')}`
    const dept = EXTRA_DEPTS[offset % EXTRA_DEPTS.length]
    const event = EXTRA_EVENTS[offset % EXTRA_EVENTS.length]
    const handlingState = offset < 6 ? 'new' : EXTRA_STATES[(offset % 4) + 1]
    const severity = EXTRA_SEVERITY[offset % EXTRA_SEVERITY.length]
    const missingLocation = offset === 2 || offset === 23
    const missingValue = offset === 8
    const assignee =
      handlingState === 'new'
        ? null
        : { userId: CURRENT_OPERATOR.userId, name: CURRENT_OPERATOR.name }
    const occurredAt = extraOccurredAt(offset)
    const value = missingValue ? null : event.value
    const dueAt = extraDueAt(offset, handlingState)

    return {
      incidentId,
      employeeId: `EMP-DEMO-${String(index).padStart(3, '0')}`,
      employeeName: name,
      departmentId: dept[0],
      departmentName: dept[1],
      jobName: offset === 23 ? '支架检修工' : '采煤机司机',
      deviceId: offset === 4 ? null : `DEV-8692340510298${String(10 + offset).padStart(2, '0')}`,
      locationText: missingLocation ? null : '演示巷道（示意，非正式坐标）',
      locationMissingReason: missingLocation ? '暂无位置' : null,
      source: event.source,
      eventCode: event.eventCode,
      eventName: event.eventName,
      severity,
      occurredAt,
      evidence: [
        {
          metric: event.metric,
          metricLabel: event.metricLabel,
          value,
          unit: event.unit,
          measuredAt: missingValue ? null : occurredAt,
          valid: !missingValue,
          stale: offset === 11,
          thresholdNote: event.note,
        },
      ],
      recoveryState: event.recovery,
      handlingState,
      assignee,
      dueAt,
      version: 1,
      remark: offset === 23 ? '超长备注用于检查折行：本条记录同时包含超长姓名与超长部门，列表应可横向滚动，详情中完整展示，不能用省略号丢掉业务字段。' : null,
      lastUpdatedAt: occurredAt,
      timeline: timeline(incidentId, [
        {
          action: 'create',
          actorId: 'SYS',
          actorName: '规则引擎',
          at: occurredAt,
          remark: '分页演示样本',
          result: '新建待办',
        },
      ]),
    }
  })

  const closed: IncidentRecord[] = [
    {
      ...CORE_INCIDENTS[0],
      incidentId: 'INC-DEMO-090',
      employeeName: '演示职工甲',
      employeeId: 'EMP-DEMO-001',
      handlingState: 'closed',
      recoveryState: 'recovered',
      assignee: { userId: CURRENT_OPERATOR.userId, name: CURRENT_OPERATOR.name },
      version: 8,
      lastUpdatedAt: TEST_CLOCK_ISO,
      remark: '历史关闭样本，不属于待办。',
    },
    {
      ...CORE_INCIDENTS[1],
      incidentId: 'INC-DEMO-091',
      handlingState: 'false_alarm',
      version: 3,
      lastUpdatedAt: TEST_CLOCK_ISO,
      remark: '历史误报样本，不属于待办。',
    },
  ]

  return [...CORE_INCIDENTS, ...extras, ...closed]
}

export function fixturesForScene(scene: string): IncidentRecord[] {
  if (scene === 'empty') return []
  return buildPaginationIncidents()
}
