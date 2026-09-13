import { newRequestId, MockApiError } from '@/mock/errors'
import { formatDateTime, wait } from '@/mock/format'
import { peekDeviceCensus } from '@/mock/devicesApi'
import {
  listIncidentsUnpaged,
  peekIncidentSummarySync,
} from '@/mock/incidentApi'
import { SEVERITY_RANK } from '@/mock/labels'
import { peekMonitorCensus } from '@/mock/monitorApi'
import { CURRENT_OPERATOR, TEST_CLOCK_ISO, getTestClock } from '@/mock/session'
import type {
  DeviceSummary,
  IncidentListItem,
  IncidentSummary,
  MetricKey,
  MonitorSummary,
} from '@/mock/types'

export type WorkbenchDemoScene =
  | 'default'
  | 'empty'
  | 'loading'
  | 'error'
  | 'cache-fail'
  | 'forbidden'
  | 'empty-health'

export const WORKBENCH_SCENE_OPTIONS: { value: WorkbenchDemoScene; label: string }[] = [
  { value: 'default', label: '默认状态（有待办）' },
  { value: 'empty', label: '无待办事项' },
  { value: 'loading', label: '模拟加载中' },
  { value: 'error', label: '首次加载失败' },
  { value: 'cache-fail', label: '刷新失败保留缓存' },
  { value: 'forbidden', label: '无权限 (403)' },
  { value: 'empty-health', label: '健康数据为空' },
]

export const MY_TODO_QUERY = {
  handlingState: 'todo' as const,
  mineOnly: true,
}

export const TODAY_CRITICAL_QUERY = {
  severity: 'critical' as const,
  timeRange: 'today' as const,
  handlingState: 'all' as const,
}

export interface MetricDistribution {
  key: MetricKey
  label: string
  unit: string
  normalCount: number
  warningCount: number
  staleCount: number
  noDataCount: number
  totalMonitored: number
}

export interface TrendDayPoint {
  date: string
  dayLabel: string
  anomalyCount: number
  coveragePercent: number
  deviceOnlineRate: number
  isToday: boolean
}

export interface SystemCapabilityItem {
  id: string
  title: string
  code: string
  statusText: '未接入' | '模拟演示' | '正常连接'
  statusType: 'danger' | 'warning' | 'info' | 'success'
  detail: string
}

export interface WorkbenchAggregatedData {
  operator: typeof CURRENT_OPERATOR
  clockTime: string
  testClock: string
  shiftName: string
  mineAreaName: string
  incidentsSummary: IncidentSummary
  deviceSummary: DeviceSummary
  monitorSummary: MonitorSummary
  rosterCount: number
  myTodos: IncidentListItem[]
  totalTodosCount: number
  todayCriticalCount: number
  todayCriticalIds: string[]
  myTodoIds: string[]
  offlineDeviceIds: string[]
  metricDistributions: MetricDistribution[]
  sevenDayTrends: TrendDayPoint[]
  trendMetadata: {
    isDemo: boolean
    label: string
    disclaimer: string
    startDate: string
    endDate: string
  }
  systemCapabilities: SystemCapabilityItem[]
  dataScopeNote: string
  overlayNote: string | null
}

/** 7日稳定演示样本：显式标明为静态演示样本，绝不冒充真实后台聚合 */
export const STABLE_DEMO_7DAY_TRENDS: TrendDayPoint[] = [
  { date: '2026-09-06', dayLabel: '09-06', anomalyCount: 1, coveragePercent: 94, deviceOnlineRate: 88, isToday: false },
  { date: '2026-09-07', dayLabel: '09-07', anomalyCount: 2, coveragePercent: 96, deviceOnlineRate: 90, isToday: false },
  { date: '2026-09-08', dayLabel: '09-08', anomalyCount: 0, coveragePercent: 97, deviceOnlineRate: 92, isToday: false },
  { date: '2026-09-09', dayLabel: '09-09', anomalyCount: 3, coveragePercent: 91, deviceOnlineRate: 85, isToday: false },
  { date: '2026-09-10', dayLabel: '09-10', anomalyCount: 2, coveragePercent: 95, deviceOnlineRate: 89, isToday: false },
  { date: '2026-09-11', dayLabel: '09-11', anomalyCount: 1, coveragePercent: 97, deviceOnlineRate: 91, isToday: false },
  { date: '2026-09-12', dayLabel: '今日 (09-12)', anomalyCount: 2, coveragePercent: 95, deviceOnlineRate: 91, isToday: true },
]

/** 系统能力名称与未接入状态。不写未经确认的实现细节。 */
export const SYSTEM_CAPABILITIES: SystemCapabilityItem[] = [
  {
    id: 'cap-push',
    title: '实时推送',
    code: 'REALTIME_PUSH',
    statusText: '未接入',
    statusType: 'info',
    detail: '未接入实时推送能力。页面使用定时刷新与本地演示数据，不能当作现场实时流。',
  },
  {
    id: 'cap-notify',
    title: '通知',
    code: 'NOTIFY',
    statusText: '未接入',
    statusType: 'info',
    detail: '未接入外部通知能力。告警只在系统内流转，不会真正外呼或推送到其他渠道。',
  },
  {
    id: 'cap-location',
    title: '定位',
    code: 'LOCATION',
    statusText: '未接入',
    statusType: 'info',
    detail: '未接入定位能力。事件与人员位置为测试占位，不能当作现场坐标。',
  },
  {
    id: 'cap-device-ctrl',
    title: '设备控制',
    code: 'DEVICE_CONTROL',
    statusText: '未接入',
    statusType: 'info',
    detail: '未接入设备控制能力。当前不能向手表下发测量、提醒或其他指令。',
  },
]

const PREVIEW_LIMIT = 5

let workbenchCache: WorkbenchAggregatedData | null = null
let lastLoadedTime = formatDateTime(new Date().toISOString())

export function getLastRefreshTime(): string {
  return lastLoadedTime
}

const METRIC_KEYS: MetricKey[] = ['heartRate', 'bloodPressure', 'bloodOxygen', 'temperature', 'pressure']
const METRIC_LABELS: Record<MetricKey, { label: string; unit: string }> = {
  heartRate: { label: '心率', unit: 'bpm' },
  bloodPressure: { label: '血压', unit: 'mmHg' },
  bloodOxygen: { label: '血氧', unit: '%' },
  temperature: { label: '体温', unit: '℃' },
  pressure: { label: '压力', unit: '' },
}

function emptyMonitorSummary(): MonitorSummary {
  return {
    online: 0,
    warning: 0,
    stale: 0,
    noData: 0,
    generatedAt: TEST_CLOCK_ISO,
    dataNote: 'mock 测试数据，非正式接口统计，未连接手表与 Oracle',
    scopeNote: '',
    onlineWindowMinutes: 15,
    freshnessWindowMinutes: 5,
  }
}

function sortMyTodos(items: IncidentListItem[]): IncidentListItem[] {
  const clock = getTestClock().getTime()
  return [...items].sort((a, b) => {
    const severityDiff = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]
    if (severityDiff !== 0) return severityDiff
    const aDue = a.dueAt ? new Date(a.dueAt).getTime() : Number.POSITIVE_INFINITY
    const bDue = b.dueAt ? new Date(b.dueAt).getTime() : Number.POSITIVE_INFINITY
    const aOverdue = aDue < clock
    const bOverdue = bDue < clock
    if (aOverdue !== bOverdue) return aOverdue ? -1 : 1
    if (aDue !== bDue) return aDue - bDue
    if (a.occurredAt !== b.occurredAt) return a.occurredAt < b.occurredAt ? -1 : 1
    return a.incidentId < b.incidentId ? -1 : 1
  })
}

function distributionsFromRows(
  rows: { indicatorStates: Record<MetricKey, string> }[],
): MetricDistribution[] {
  return METRIC_KEYS.map((key) => {
    let normal = 0
    let warning = 0
    let stale = 0
    let noData = 0
    for (const row of rows) {
      const state = row.indicatorStates[key]
      if (state === 'normal') normal += 1
      else if (state === 'warning') warning += 1
      else if (state === 'stale') stale += 1
      else noData += 1
    }
    return {
      key,
      label: METRIC_LABELS[key].label,
      unit: METRIC_LABELS[key].unit,
      normalCount: normal,
      warningCount: warning,
      staleCount: stale,
      noDataCount: noData,
      totalMonitored: rows.length,
    }
  })
}

function emptyDistributions(): MetricDistribution[] {
  return METRIC_KEYS.map((key) => ({
    key,
    label: METRIC_LABELS[key].label,
    unit: METRIC_LABELS[key].unit,
    normalCount: 0,
    warningCount: 0,
    staleCount: 0,
    noDataCount: 0,
    totalMonitored: 0,
  }))
}

/**
 * 汇总工作台数据。
 * 始终读取当前共享 mock store 的完整台账，不切换事件/设备/监控演示场景，也不按第一页截断。
 * 无待办、健康空态只覆盖本页展示，不清空共享业务数据。
 */
export async function fetchWorkbenchData(
  scene: WorkbenchDemoScene = 'default',
  options: { refresh?: boolean } = {},
): Promise<WorkbenchAggregatedData> {
  await wait(options.refresh ? 280 : 220)
  if (scene === 'loading') await wait(900)

  if (scene === 'forbidden') {
    throw new MockApiError({
      code: 'FORBIDDEN',
      requestId: newRequestId('FORBIDDEN'),
      message: '当前账号无权访问工作台 (403)',
    })
  }

  if (scene === 'error') {
    throw new MockApiError({
      code: 'UNAVAILABLE',
      requestId: newRequestId('UNAVAILABLE'),
      message: '工作台数据服务响应超时，演示服务不可用',
    })
  }

  if (scene === 'cache-fail' && options.refresh && workbenchCache) {
    throw new MockApiError({
      code: 'UNAVAILABLE',
      requestId: newRequestId('UNAVAILABLE'),
      message: '工作台数据刷新失败，已保留上次成功加载结果',
    })
  }

  const myTodoItems = sortMyTodos(listIncidentsUnpaged(MY_TODO_QUERY))
  const todayCriticalItems = listIncidentsUnpaged(TODAY_CRITICAL_QUERY)
  const incidentSummary = peekIncidentSummarySync()
  const deviceCensus = peekDeviceCensus()
  const monitorCensus = peekMonitorCensus({ onlineStatus: 'online' })

  let displayMine = myTodoItems
  let overlayNote: string | null = null
  if (scene === 'empty') {
    displayMine = []
    overlayNote = '当前为无待办演示，只覆盖本页展示，没有切换或清空共享事件台账。'
  }

  let metricDistributions = distributionsFromRows(monitorCensus.rows)
  let monitorSummary = monitorCensus.summary
  let sevenDayTrends = STABLE_DEMO_7DAY_TRENDS
  if (scene === 'empty-health') {
    metricDistributions = emptyDistributions()
    monitorSummary = emptyMonitorSummary()
    sevenDayTrends = []
    overlayNote = overlayNote
      ? `${overlayNote} 健康空态同样只覆盖本页。`
      : '当前为健康空态演示，只覆盖本页展示，没有切换或清空共享人员与设备台账。'
  }

  lastLoadedTime = formatDateTime(new Date().toISOString())

  const data: WorkbenchAggregatedData = {
    operator: CURRENT_OPERATOR,
    clockTime: lastLoadedTime,
    testClock: TEST_CLOCK_ISO,
    shiftName: '未配置/未接入',
    mineAreaName: '未接入',
    incidentsSummary: {
      ...incidentSummary,
      mine: scene === 'empty' ? 0 : myTodoItems.length,
    },
    deviceSummary: deviceCensus.summary,
    monitorSummary,
    rosterCount: monitorCensus.rosterCount,
    myTodos: displayMine.slice(0, PREVIEW_LIMIT),
    totalTodosCount: displayMine.length,
    todayCriticalCount: todayCriticalItems.length,
    todayCriticalIds: todayCriticalItems.map((item) => item.incidentId),
    myTodoIds: myTodoItems.map((item) => item.incidentId),
    offlineDeviceIds: deviceCensus.offline.map((item) => item.deviceId),
    metricDistributions,
    sevenDayTrends,
    trendMetadata: {
      isDemo: true,
      label: '7日健康与异常走势',
      disclaimer: '演示样本数据：基于固定离线测试样本生成，非真实后端聚合统计',
      startDate: '2026-09-06',
      endDate: '2026-09-12',
    },
    systemCapabilities: SYSTEM_CAPABILITIES,
    dataScopeNote: scene === 'empty-health'
      ? `健康空态为页面演示。共享台账仍在：在册 ${monitorCensus.rosterCount} 人。统计口径按人去重，15 分钟在线窗口，5 分钟体征新鲜度。`
      : `统计口径：按人去重，15 分钟在线窗口，5 分钟体征新鲜度。全矿在册 ${monitorCensus.rosterCount} 人，当前在线 ${monitorCensus.summary.online} 人，体征异常 ${monitorCensus.summary.warning} 人，陈旧 ${monitorCensus.summary.stale} 人，无数据 ${monitorCensus.summary.noData} 人。`,
    overlayNote,
  }

  workbenchCache = data
  return data
}
