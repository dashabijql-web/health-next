import { findDeviceById } from '@/mock/deviceStore'
import { cloneJson, formatDateTime } from '@/mock/format'
import { rawReadingsFor } from '@/mock/healthReadings'
import {
  computeIndicatorMap,
  computeOverallStatus,
  indicatorStatesOf,
  isOnlineAt,
} from '@/mock/healthStatus'
import { peekIncidentById, peekIncidentsForEmployee } from '@/mock/incidentApi'
import {
  EMPLOYMENT_LABELS,
  HANDLING_LABELS,
  METRIC_LABELS,
  SEVERITY_LABELS,
  SOURCE_LABELS,
} from '@/mock/labels'
import { peekPeopleRecords } from '@/mock/peopleApi'
import { getTestClock, TEST_CLOCK_ISO } from '@/mock/session'
import type {
  DeviceOnlineStatus,
  HandlingState,
  IncidentSource,
  IndicatorState,
  IndicatorView,
  MetricKey,
  PersonRecord,
  Severity,
} from '@/mock/types'
import { MOCK_WARNING_RECORDS } from '@/modules/warning-records/mockWarningsData'

export type ProfileScenarioKey =
  | 'normal'
  | 'anomaly'
  | 'unbound'
  | 'stale'
  | 'time_anomaly'
  | 'no_history'
  | 'refresh_fail'
  | 'not_found'

export type HistoryRangePreset = '7d' | '14d' | '30d' | 'custom'

export interface ProfileScenarioOption {
  key: ProfileScenarioKey
  label: string
  empCode: string
  description: string
  badgeType: 'success' | 'danger' | 'warning' | 'info'
}

export const PROFILE_SCENARIOS: ProfileScenarioOption[] = [
  {
    key: 'normal',
    label: '正常且有历史',
    empCode: '005875008',
    description: '张伟 · 各项体征平稳，7日历史完整，无待办预警',
    badgeType: 'success',
  },
  {
    key: 'anomaly',
    label: '存在异常及关联事件',
    empCode: 'DEMO0001',
    description: '演示职工甲 · 心率 126 bpm 偏高，关联 INC-DEMO-001 待办事件',
    badgeType: 'danger',
  },
  {
    key: 'unbound',
    label: '人员无设备',
    empCode: '005875034',
    description: '王强 · 未绑定手表，体征全无数据，禁用设备下发',
    badgeType: 'info',
  },
  {
    key: 'stale',
    label: '体征陈旧与缺失',
    empCode: '005875019',
    description: '赵铁柱 · 读数超 1 小时未更新，血氧无效 0%，走势含中断区间',
    badgeType: 'warning',
  },
  {
    key: 'time_anomaly',
    label: '时间异常',
    empCode: 'DEMO-FUTURE',
    description: '演示未来读数 · 采集时间晚于当前时钟，标为时间异常',
    badgeType: 'warning',
  },
  {
    key: 'no_history',
    label: '无历史数据',
    empCode: 'DEMO8888',
    description: '演示职工空号 · 离休人员无传感器记录，趋势图正规空态',
    badgeType: 'info',
  },
  {
    key: 'refresh_fail',
    label: '刷新失败但保留数据',
    empCode: '005875008',
    description: '模拟网络中断 · 手动刷新提示失败并保留上次缓存视图',
    badgeType: 'danger',
  },
  {
    key: 'not_found',
    label: '人员不存在',
    empCode: 'NOT_FOUND_999',
    description: '查询不存在工号 · 明确提示 404，不随意跳转他人',
    badgeType: 'info',
  },
]

export const CLOCK_DATE = TEST_CLOCK_ISO.slice(0, 10)
export const HISTORY_MAX_SPAN_DAYS = 90

export interface HistoryTrendPoint {
  timestamp: string
  fullTime: string
  heartRate: number | null
  systolic: number | null
  diastolic: number | null
  bloodOxygen: number | null
  temperature: number | null
  pressure: number | null
  isMissing: boolean
  missingReason?: string
  isSynthetic: boolean
}

export interface HistoryQueryInput {
  empCode: string
  metric: MetricKey
  startDate: string
  endDate: string
}

export interface TrendMetadata {
  totalPoints: number
  validPoints: number
  missingPoints: number
  samplingInterval: string
  aggregationMethod: string
  dateRangeLabel: string
  startDate: string
  endDate: string
  intervalHours: number
  metric: MetricKey
  metricLabel: string
  syntheticNote: string
}

export interface TodayActivityData {
  steps: number | null
  wearingMinutes: number | null
  activeStateLabel: string
  battery: number | null
  batteryDisplay: string
  batteryKnown: boolean
  signal: string
  netty: 'online' | 'offline'
  wearing: 'confirmed' | 'unworn' | 'unknown'
  dataAvailable: boolean
  activityNote: string
}

export interface WarningTrajectoryItem {
  id: string
  occurredAt: string
  source: IncidentSource | 'ARCHIVE_WARNING'
  sourceLabel: string
  severity: Severity | 'attention'
  severityLabel: string
  eventName: string
  evidenceText: string
  handlingState: HandlingState | 'archive_open' | 'archive_done'
  handlingStateLabel: string
  relatedIncidentId: string | null
}

export interface EmployeeProfileModel {
  person: PersonRecord
  isNotFound: boolean
  indicators: Record<MetricKey, IndicatorView>
  indicatorStates: Record<MetricKey, IndicatorState>
  overallStatus: IndicatorState
  trendPoints: HistoryTrendPoint[]
  trendMetadata: TrendMetadata
  todayActivity: TodayActivityData
  warningTrajectory: WarningTrajectoryItem[]
  locationSource: {
    available: boolean
    text: string
    note: string
  }
  deviceInfo: {
    isBound: boolean
    deviceId: string | null
    imei: string | null
    modelName: string
    onlineStatus: DeviceOnlineStatus
    batteryPercent: number | null
    batteryDisplay: string
    network: string | null
  }
}

const FUTURE_PERSON: PersonRecord = {
  employeeId: 'EMP-FUTURE-READ',
  empCode: 'DEMO-FUTURE',
  empName: '未来时钟测试员',
  departmentId: 'D-JD',
  departmentName: '机电运输队',
  jobId: 'J-DD',
  jobName: '井下电工',
  phone: '13800009991',
  imei: '869234051029891',
  deviceId: 'DEV-869234051029891',
  employmentStatus: 'active',
  lastOnlineAt: '2026-09-12T15:58:00+08:00',
  lastHealthAt: '2026-09-13T08:00:00+08:00',
  currentRisk: 'unknown',
  openIncidentId: null,
  remark: '体征时间晚于当前时钟测试样本',
}

const NO_HISTORY_CODES = new Set(['DEMO8888', '005875034'])

function ymdInShanghai(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function addDaysYmd(ymd: string, days: number): string {
  const date = new Date(`${ymd}T12:00:00+08:00`)
  date.setTime(date.getTime() + days * 86400000)
  return ymdInShanghai(date)
}

function diffDaysInclusive(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T12:00:00+08:00`).getTime()
  const end = new Date(`${endDate}T12:00:00+08:00`).getTime()
  return Math.floor((end - start) / 86400000) + 1
}

function formatPlus8Parts(date: Date): { timestamp: string; fullTime: string; hour: number; ymd: string } {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ''
  const ymd = `${pick('year')}-${pick('month')}-${pick('day')}`
  const time = `${pick('hour')}:${pick('minute')}:${pick('second')}`
  return {
    timestamp: `${pick('month')}-${pick('day')} ${pick('hour')}:${pick('minute')}`,
    fullTime: `${ymd} ${time}`,
    hour: Number(pick('hour')),
    ymd,
  }
}

export function presetDateRange(preset: Exclude<HistoryRangePreset, 'custom'>): [string, string] {
  const end = CLOCK_DATE
  const back = preset === '7d' ? 6 : preset === '14d' ? 13 : 29
  return [addDaysYmd(end, -back), end]
}

export function historyIntervalHours(startDate: string, endDate: string): number {
  const days = diffDaysInclusive(startDate, endDate)
  if (days <= 7) return 1
  if (days <= 14) return 2
  return 4
}

export function emptyTrendMetadata(metric: MetricKey, startDate = '', endDate = ''): TrendMetadata {
  return {
    totalPoints: 0,
    validPoints: 0,
    missingPoints: 0,
    samplingInterval: '--',
    aggregationMethod: '未生成',
    dateRangeLabel: startDate && endDate ? `${startDate} 至 ${endDate}（无点）` : '无有效历史区间',
    startDate,
    endDate,
    intervalHours: 0,
    metric,
    metricLabel: METRIC_LABELS[metric],
    syntheticNote: '该区间没有演示合成点，也没有原始采样。',
  }
}

export function validateHistoryQuery(startDate: string | null | undefined, endDate: string | null | undefined): string | null {
  const start = startDate?.trim() ?? ''
  const end = endDate?.trim() ?? ''
  if (!start || !end) return '请选择开始日期和结束日期'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return '日期格式无效'
  if (start > end) return '开始日期不能晚于结束日期'
  if (end > CLOCK_DATE) return `结束日期不能晚于测试时钟日期 ${CLOCK_DATE}`
  if (diffDaysInclusive(start, end) > HISTORY_MAX_SPAN_DAYS) return `查询跨度不能超过 ${HISTORY_MAX_SPAN_DAYS} 天`
  return null
}

export function formatBatteryDisplay(percent: number | null | undefined): string {
  if (percent === null || percent === undefined) return '未知'
  return `${percent}%`
}

function hydratePerson(person: PersonRecord): PersonRecord {
  const copy = cloneJson(person)
  if (copy.deviceId) {
    const device = findDeviceById(copy.deviceId)
    if (device) copy.imei = device.imei
  }
  return copy
}

export function getAllProfilePeople(): PersonRecord[] {
  const seen = new Set<string>()
  const list: PersonRecord[] = []
  for (const person of peekPeopleRecords()) {
    if (seen.has(person.empCode)) continue
    seen.add(person.empCode)
    list.push(hydratePerson(person))
  }
  if (!seen.has(FUTURE_PERSON.empCode)) {
    list.push(cloneJson(FUTURE_PERSON))
  }
  return list
}

export function findProfilePersonByCode(codeOrId: string): PersonRecord | null {
  const trimmed = codeOrId.trim()
  if (!trimmed) return null
  const needle = trimmed.toLowerCase()
  const all = getAllProfilePeople()
  return (
    all.find(
      (person) =>
        person.empCode.toLowerCase() === needle
        || person.employeeId.toLowerCase() === needle
        || person.empName === trimmed,
    ) ?? null
  )
}

function seedFromCode(empCode: string): number {
  let hash = 0
  for (let i = 0; i < empCode.length; i += 1) {
    hash = (hash * 31 + empCode.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

function buildSyntheticPoint(
  empCode: string,
  at: Date,
  index: number,
  total: number,
): HistoryTrendPoint {
  const stamp = formatPlus8Parts(at)
  const isStaleWorker = empCode === '005875019'
  const isHighWorker = empCode === '005875012' || empCode === 'DEMO0001'
  const isFutureWorker = empCode === 'DEMO-FUTURE'
  const clock = getTestClock().getTime()
  const hoursToClock = (clock - at.getTime()) / 3600000

  if (isStaleWorker && hoursToClock >= 0 && hoursToClock < 2) {
    return {
      timestamp: stamp.timestamp,
      fullTime: stamp.fullTime,
      heartRate: null,
      systolic: null,
      diastolic: null,
      bloodOxygen: null,
      temperature: null,
      pressure: null,
      isMissing: true,
      missingReason: '设备信号中断，未佩戴',
      isSynthetic: true,
    }
  }

  const hourOfDay = stamp.hour
  const isWorkHour = hourOfDay >= 8 && hourOfDay <= 17
  const progress = total <= 1 ? 1 : index / (total - 1)
  const seed = seedFromCode(empCode)

  let heartRate = Math.round(72 + Math.sin(index * 0.3 + seed) * 5 + (isWorkHour ? 6 : 0))
  let systolic = Math.round(118 + Math.cos(index * 0.25 + seed) * 4 + (isWorkHour ? 4 : 0))
  let diastolic = Math.round(76 + Math.sin(index * 0.2 + seed) * 3)
  let bloodOxygen = Math.round(98 - (index % 5 === 0 ? 1 : 0))
  let temperature = Number((36.5 + Math.sin(index * 0.15 + seed) * 0.15).toFixed(1))
  let pressure = Math.round(28 + Math.cos(index * 0.4 + seed) * 6 + (isWorkHour ? 8 : 0))

  if (isHighWorker) {
    const lift = Math.max(0, (progress - 0.6) / 0.4)
    heartRate = Math.round(heartRate + lift * 42)
    systolic = Math.round(systolic + lift * 15)
    diastolic = Math.round(diastolic + lift * 8)
    pressure = Math.round(pressure + lift * 32)
    bloodOxygen = Math.max(94, Math.round(bloodOxygen - lift * 2))
  }

  if (isFutureWorker) {
    heartRate = 74
    systolic = 120
    diastolic = 80
    bloodOxygen = 98
    temperature = 36.6
    pressure = 30
  }

  return {
    timestamp: stamp.timestamp,
    fullTime: stamp.fullTime,
    heartRate,
    systolic,
    diastolic,
    bloodOxygen,
    temperature,
    pressure,
    isMissing: false,
    isSynthetic: true,
  }
}

export function queryEmployeeHistory(input: HistoryQueryInput, clock = getTestClock()): {
  points: HistoryTrendPoint[]
  metadata: TrendMetadata
} {
  const metric = input.metric
  const startDate = input.startDate
  const endDate = input.endDate
  const invalid = validateHistoryQuery(startDate, endDate)
  if (invalid) {
    return { points: [], metadata: emptyTrendMetadata(metric, startDate, endDate) }
  }

  if (NO_HISTORY_CODES.has(input.empCode)) {
    return { points: [], metadata: emptyTrendMetadata(metric, startDate, endDate) }
  }

  const intervalHours = historyIntervalHours(startDate, endDate)
  const startMs = new Date(`${startDate}T00:00:00+08:00`).getTime()
  const endCap = new Date(`${endDate}T23:00:00+08:00`).getTime()
  const lastMs = Math.min(endCap, clock.getTime())
  const step = intervalHours * 3600000
  const times: number[] = []
  for (let t = startMs; t <= lastMs; t += step) {
    times.push(t)
  }

  const points = times.map((t, index) =>
    buildSyntheticPoint(input.empCode, new Date(t), index, times.length),
  )
  const validPoints = points.filter((point) => !point.isMissing).length
  const missingPoints = points.length - validPoints
  const first = points[0]
  const last = points[points.length - 1]
  const dateRangeLabel =
    first && last ? `${first.fullTime.slice(0, 16)} 至 ${last.fullTime.slice(0, 16)}` : `${startDate} 至 ${endDate}（无点）`

  return {
    points,
    metadata: {
      totalPoints: points.length,
      validPoints,
      missingPoints,
      samplingInterval: `演示间隔 ${intervalHours} 小时`,
      aggregationMethod: '演示合成点，不是原始采样，也未经聚合',
      dateRangeLabel,
      startDate,
      endDate,
      intervalHours,
      metric,
      metricLabel: METRIC_LABELS[metric],
      syntheticNote: '图中点为按日期范围生成的演示合成点，不表示手表原始采样或后台聚合结果。',
    },
  }
}

function demoActivityFor(person: PersonRecord): Pick<TodayActivityData, 'steps' | 'wearingMinutes' | 'activeStateLabel' | 'wearing'> {
  if (person.empCode === '005875019') {
    return {
      steps: 4520,
      wearingMinutes: 260,
      activeStateLabel: '设备脱落中断',
      wearing: 'unworn',
    }
  }
  if (person.empCode === '005875012' || person.empCode === 'DEMO0001') {
    return {
      steps: 9280,
      wearingMinutes: 420,
      activeStateLabel: '高负荷巡检检修中',
      wearing: 'confirmed',
    }
  }
  return {
    steps: 7640,
    wearingMinutes: 460,
    activeStateLabel: '常态班中巡查作业',
    wearing: 'confirmed',
  }
}

export function getEmployeeTodayActivity(person: PersonRecord, clock = getTestClock()): TodayActivityData {
  const device = person.deviceId ? findDeviceById(person.deviceId) ?? null : null
  if (!person.deviceId) {
    return {
      steps: null,
      wearingMinutes: null,
      activeStateLabel: '无设备记录',
      battery: null,
      batteryDisplay: '未知',
      batteryKnown: false,
      signal: '无',
      netty: 'offline',
      wearing: 'unknown',
      dataAvailable: false,
      activityNote: '未绑定设备，无电量、在线状态与活动记录。',
    }
  }

  const demo = demoActivityFor(person)
  const battery = device?.batteryPercent ?? null
  const online = device
    ? device.onlineStatus
    : isOnlineAt(person.lastOnlineAt, clock)
      ? 'online'
      : 'offline'

  return {
    ...demo,
    battery,
    batteryDisplay: formatBatteryDisplay(battery),
    batteryKnown: battery !== null,
    signal: device?.network ?? '未知',
    netty: online,
    dataAvailable: true,
    activityNote: '步数与佩戴时长为演示字段；电量、信号与在线状态来自设备台账。',
  }
}

function formatOccurredAt(value: string): string {
  if (/^\d{4}-\d{2}-\d{2} /.test(value)) return value.slice(0, 19)
  return formatDateTime(value)
}

function withinLastDays(occurredAt: string, days: number, clock: Date): boolean {
  const normalized = occurredAt.includes('T') ? occurredAt : occurredAt.replace(' ', 'T') + (occurredAt.endsWith('+08:00') ? '' : '+08:00')
  const at = new Date(normalized).getTime()
  if (Number.isNaN(at)) return false
  return clock.getTime() - at <= days * 86400000 && at <= clock.getTime() + 86400000
}

export function getEmployeeWarningTrajectory(person: PersonRecord, clock = getTestClock()): WarningTrajectoryItem[] {
  const list: WarningTrajectoryItem[] = []
  const incidents = peekIncidentsForEmployee(person.employeeId)
  if (person.openIncidentId && !incidents.some((item) => item.incidentId === person.openIncidentId)) {
    const extra = peekIncidentById(person.openIncidentId)
    if (extra) incidents.push(extra)
  }

  for (const incident of incidents) {
    if (!withinLastDays(incident.occurredAt, 30, clock)) continue
    const evidence = incident.evidence[0]
    list.push({
      id: incident.incidentId,
      occurredAt: formatOccurredAt(incident.occurredAt),
      source: incident.source,
      sourceLabel: SOURCE_LABELS[incident.source],
      severity: incident.severity,
      severityLabel: SEVERITY_LABELS[incident.severity],
      eventName: incident.eventName,
      evidenceText: evidence
        ? `${evidence.metricLabel}: ${evidence.value ?? '--'} ${evidence.unit}`.trim()
        : '无测量证据',
      handlingState: incident.handlingState,
      handlingStateLabel: HANDLING_LABELS[incident.handlingState],
      relatedIncidentId: incident.incidentId,
    })
  }

  for (const warning of MOCK_WARNING_RECORDS) {
    if (warning.empCode !== person.empCode) continue
    if (list.some((item) => item.id === warning.warningId)) continue
    if (!withinLastDays(warning.occurredAt, 30, clock)) continue
    list.push({
      id: warning.warningId,
      occurredAt: formatOccurredAt(warning.occurredAt),
      source: 'ARCHIVE_WARNING',
      sourceLabel: '历史预警归档',
      severity: warning.metric === 'heartRate' && Number.parseInt(warning.valueText, 10) > 120 ? 'critical' : 'warning',
      severityLabel: warning.metric === 'heartRate' && Number.parseInt(warning.valueText, 10) > 120 ? SEVERITY_LABELS.critical : SEVERITY_LABELS.warning,
      eventName: `${warning.metricLabel}超限记录`,
      evidenceText: `${warning.metricLabel}读数: ${warning.valueText}`,
      handlingState: warning.handled ? 'archive_done' : 'archive_open',
      handlingStateLabel: warning.handled ? '归档已处理' : '归档未处理',
      relatedIncidentId: null,
    })
  }

  return list.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
}

function buildDeviceInfo(person: PersonRecord, clock: Date): EmployeeProfileModel['deviceInfo'] {
  const device = person.deviceId ? findDeviceById(person.deviceId) ?? null : null
  if (!person.deviceId) {
    return {
      isBound: false,
      deviceId: null,
      imei: null,
      modelName: '未绑定设备',
      onlineStatus: 'offline',
      batteryPercent: null,
      batteryDisplay: '未知',
      network: null,
    }
  }

  const online = device
    ? device.onlineStatus
    : isOnlineAt(person.lastOnlineAt, clock)
      ? 'online'
      : 'offline'
  const battery = device?.batteryPercent ?? null

  return {
    isBound: true,
    deviceId: person.deviceId,
    imei: device?.imei ?? person.imei,
    modelName: device?.deviceName ?? device?.model ?? '设备台账无记录',
    onlineStatus: online,
    batteryPercent: battery,
    batteryDisplay: formatBatteryDisplay(battery),
    network: device?.network ?? null,
  }
}

function unknownPerson(empCodeOrId: string): PersonRecord {
  return {
    employeeId: 'UNKNOWN',
    empCode: empCodeOrId,
    empName: '人员未找到',
    departmentId: '--',
    departmentName: '--',
    jobId: '--',
    jobName: '--',
    phone: null,
    imei: null,
    deviceId: null,
    employmentStatus: 'resigned',
    lastOnlineAt: null,
    lastHealthAt: null,
    currentRisk: 'unknown',
    openIncidentId: null,
    remark: '未在系统中检索到该人员档案',
  }
}

export interface BuildProfileOptions {
  clock?: Date
  historyQuery?: Pick<HistoryQueryInput, 'startDate' | 'endDate' | 'metric'>
  reuseHistory?: {
    trendPoints: HistoryTrendPoint[]
    trendMetadata: TrendMetadata
  }
}

export function buildEmployeeProfile(
  empCodeOrId: string,
  options: BuildProfileOptions = {},
): EmployeeProfileModel {
  const clock = options.clock ?? getTestClock()
  const person = findProfilePersonByCode(empCodeOrId)
  const defaultRange = presetDateRange('7d')
  const historyQuery: HistoryQueryInput = {
    empCode: person?.empCode ?? empCodeOrId,
    metric: options.historyQuery?.metric ?? 'heartRate',
    startDate: options.historyQuery?.startDate ?? defaultRange[0],
    endDate: options.historyQuery?.endDate ?? defaultRange[1],
  }

  if (!person) {
    const emptyIndicators = computeIndicatorMap({}, clock)
    return {
      person: unknownPerson(empCodeOrId),
      isNotFound: true,
      indicators: emptyIndicators,
      indicatorStates: indicatorStatesOf(emptyIndicators),
      overallStatus: 'no_data',
      trendPoints: [],
      trendMetadata: emptyTrendMetadata(historyQuery.metric, historyQuery.startDate, historyQuery.endDate),
      todayActivity: {
        steps: null,
        wearingMinutes: null,
        activeStateLabel: '未接入',
        battery: null,
        batteryDisplay: '未知',
        batteryKnown: false,
        signal: '无',
        netty: 'offline',
        wearing: 'unknown',
        dataAvailable: false,
        activityNote: '人员不存在，无设备与活动记录。',
      },
      warningTrajectory: [],
      locationSource: {
        available: false,
        text: '未接入',
        note: '未在井下基站定位网络中检索到该职工位置',
      },
      deviceInfo: {
        isBound: false,
        deviceId: null,
        imei: null,
        modelName: '未绑定设备',
        onlineStatus: 'offline',
        batteryPercent: null,
        batteryDisplay: '未知',
        network: null,
      },
    }
  }

  const rawMetrics = rawReadingsFor(person)
  const indicators = computeIndicatorMap(rawMetrics, clock)
  const indicatorStates = indicatorStatesOf(indicators)
  const overallStatus = computeOverallStatus(indicatorStates)
  const history = options.reuseHistory
    ? { points: options.reuseHistory.trendPoints, metadata: options.reuseHistory.trendMetadata }
    : queryEmployeeHistory({ ...historyQuery, empCode: person.empCode }, clock)

  return {
    person,
    isNotFound: false,
    indicators,
    indicatorStates,
    overallStatus,
    trendPoints: history.points,
    trendMetadata: history.metadata,
    todayActivity: getEmployeeTodayActivity(person, clock),
    warningTrajectory: getEmployeeWarningTrajectory(person, clock),
    locationSource: {
      available: false,
      text: '未接入',
      note: '井下定位基站未接入或未上报实时坐标，严格展示未接入，不虚构井下位置。',
    },
    deviceInfo: buildDeviceInfo(person, clock),
  }
}

export { EMPLOYMENT_LABELS }
