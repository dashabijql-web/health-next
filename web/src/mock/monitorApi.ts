import { findDeviceById, peekDeviceRecords } from './deviceStore'
import { MockApiError, newRequestId } from './errors'
import { cloneJson, wait } from './format'
import { rawReadingsFor } from './healthReadings'
import {
  collectWarningReasons,
  computeIndicatorMap,
  computeOverallStatus,
  DEMO_THRESHOLDS,
  FRESHNESS_WINDOW_MINUTES,
  HEALTH_STATUS_SELF_CHECK,
  indicatorStatesOf,
  isOnlineAt,
  METRIC_KEYS,
  ONLINE_WINDOW_MINUTES,
} from './healthStatus'
import { resolveRelatedIncident } from './incidentApi'
import { INDICATOR_STATE_RANK } from './labels'
import { DEFAULT_PEOPLE } from './people'
import { peekPeopleRecords } from './peopleApi'
import { getTestClock, TEST_CLOCK_ISO } from './session'
import type {
  DeviceOnlineStatus,
  MetricKey,
  MonitorDemoScene,
  MonitorListItem,
  MonitorQuery,
  MonitorSummary,
  PageResult,
  PersonRecord,
} from './types'

interface MonitorStore {
  scene: MonitorDemoScene
  loadedOnce: boolean
}

const root = globalThis as typeof globalThis & { __hnMonitorStore?: MonitorStore }
const store: MonitorStore = root.__hnMonitorStore ?? {
  scene: 'default',
  loadedOnce: false,
}
root.__hnMonitorStore = store

function resetIfNeeded(scene: MonitorDemoScene) {
  if (store.scene !== scene) {
    store.scene = scene
    store.loadedOnce = false
  }
}

function assertReadable(scene: MonitorDemoScene) {
  if (scene === 'forbidden') {
    throw new MockApiError({
      code: 'FORBIDDEN',
      requestId: newRequestId('FORBIDDEN'),
      message: '当前账号无权查看实时监控',
    })
  }
}

function maybeFailLoad(scene: MonitorDemoScene, isRefresh: boolean) {
  if (scene === 'error') {
    throw new MockApiError({
      code: 'UNAVAILABLE',
      requestId: newRequestId('UNAVAILABLE'),
      message: '实时监控查询失败，演示数据源暂不可用',
    })
  }
  if (scene === 'cache-fail' && (isRefresh || store.loadedOnce)) {
    throw new MockApiError({
      code: 'UNAVAILABLE',
      requestId: newRequestId('UNAVAILABLE'),
      message: '刷新失败，已保留上次成功结果',
    })
  }
}

function peopleSource(): PersonRecord[] {
  const live = peekPeopleRecords()
  return live
}

function toRow(person: PersonRecord, forceOffline: boolean): MonitorListItem {
  const clock = getTestClock()
  const device = person.deviceId ? findDeviceById(person.deviceId) : undefined
  const lastOnlineAt = forceOffline
    ? '2026-09-12T14:00:00+08:00'
    : device?.lastCommAt ?? person.lastOnlineAt
  const indicators = computeIndicatorMap(rawReadingsFor(person), clock)
  const indicatorStates = indicatorStatesOf(indicators)
  const overallStatus = computeOverallStatus(indicatorStates)
  const related = resolveRelatedIncident(person.employeeId, person.openIncidentId)
  return {
    employeeId: person.employeeId,
    empCode: person.empCode,
    empName: person.empName,
    departmentId: person.departmentId,
    departmentName: person.departmentName,
    jobName: person.jobName,
    deviceId: person.deviceId,
    imei: device?.imei ?? person.imei,
    deviceName: device?.deviceName ?? null,
    onlineStatus: isOnlineAt(lastOnlineAt, clock) ? 'online' : 'offline',
    lastOnlineAt,
    indicators,
    indicatorStates,
    overallStatus,
    warningReasons: collectWarningReasons(indicators, overallStatus),
    relatedIncidentId: related?.incidentId ?? null,
    relatedIncidentName: related?.eventName ?? null,
    relatedIncidentHandling: related?.handlingState ?? null,
    relatedIncidentMissingReason: related ? null : '暂无关联事件',
  }
}

function buildRows(scene: MonitorDemoScene): MonitorListItem[] {
  if (scene === 'empty') return []
  const forceOffline = scene === 'empty-online'
  return peopleSource().map((person) => toRow(person, forceOffline))
}

function matchKeyword(row: MonitorListItem, keyword: string): boolean {
  const q = keyword.trim().toLowerCase()
  if (!q) return true
  return [row.empName, row.empCode, row.employeeId, row.imei ?? '', row.deviceId ?? '']
    .join(' ')
    .toLowerCase()
    .includes(q)
}

function resolvedOnlineStatus(query: MonitorQuery): DeviceOnlineStatus | 'all' {
  return query.onlineStatus ?? 'online'
}

function baseMatch(row: MonitorListItem, query: MonitorQuery): boolean {
  if (query.keyword && !matchKeyword(row, query.keyword)) return false
  if (query.departmentId && query.departmentId !== 'all' && row.departmentId !== query.departmentId) return false
  return true
}

function scopeMatch(row: MonitorListItem, query: MonitorQuery): boolean {
  if (!baseMatch(row, query)) return false
  const onlineStatus = resolvedOnlineStatus(query)
  if (onlineStatus === 'online' && row.onlineStatus !== 'online') return false
  if (onlineStatus === 'offline' && row.onlineStatus !== 'offline') return false
  return true
}

function listMatch(row: MonitorListItem, query: MonitorQuery): boolean {
  if (!scopeMatch(row, query)) return false
  if (query.overallStatus && query.overallStatus !== 'all' && row.overallStatus !== query.overallStatus) return false
  if (query.metric && query.metric !== 'all') {
    if (row.indicatorStates[query.metric] !== 'warning') return false
  }
  return true
}

function scopeNoteFor(query: MonitorQuery): string {
  const onlineStatus = resolvedOnlineStatus(query)
  const window = `在线窗口 ${ONLINE_WINDOW_MINUTES} 分钟，体征新鲜度 ${FRESHNESS_WINDOW_MINUTES} 分钟，相对测试时钟 ${TEST_CLOCK_ISO}。${DEMO_THRESHOLDS.source}。`
  if (onlineStatus === 'all') {
    return `当前为扩展筛选：全部台账（含离线）。摘要与名单均按此范围按人去重，不是默认在线窗口，也不是当前页。${window}`
  }
  if (onlineStatus === 'offline') {
    return `当前为扩展筛选：仅离线人员。摘要与名单均按此范围按人去重。${window}`
  }
  return `按人去重，默认统计 15 分钟在线窗口内人员，不是全部台账，也不是当前页。异常、陈旧、无数据均在此范围内。${window}`
}

function sortRows(rows: MonitorListItem[]): MonitorListItem[] {
  return [...rows].sort((a, b) => {
    const statusDiff = INDICATOR_STATE_RANK[b.overallStatus] - INDICATOR_STATE_RANK[a.overallStatus]
    if (statusDiff !== 0) return statusDiff
    if (a.onlineStatus !== b.onlineStatus) return a.onlineStatus === 'online' ? -1 : 1
    if (a.empCode !== b.empCode) return a.empCode < b.empCode ? -1 : 1
    return a.employeeId < b.employeeId ? -1 : 1
  })
}

function computeSummary(rows: MonitorListItem[]): MonitorSummary {
  const seen = new Set<string>()
  let online = 0
  let warning = 0
  let stale = 0
  let noData = 0
  for (const row of rows) {
    if (seen.has(row.employeeId)) continue
    seen.add(row.employeeId)
    if (row.onlineStatus === 'online') online += 1
    if (row.overallStatus === 'warning') warning += 1
    else if (row.overallStatus === 'stale') stale += 1
    else if (row.overallStatus === 'no_data') noData += 1
  }
  return {
    online,
    warning,
    stale,
    noData,
    generatedAt: TEST_CLOCK_ISO,
    dataNote: 'mock 测试数据，非正式接口统计，未连接手表与 Oracle',
    scopeNote: '',
    onlineWindowMinutes: ONLINE_WINDOW_MINUTES,
    freshnessWindowMinutes: FRESHNESS_WINDOW_MINUTES,
  }
}

export function peekMonitorPerson(employeeId: string): MonitorListItem | null {
  const person = peopleSource().find((item) => item.employeeId === employeeId)
    ?? DEFAULT_PEOPLE.find((item) => item.employeeId === employeeId)
  if (!person) return null
  return toRow(person, false)
}

export async function fetchMonitorList(
  scene: MonitorDemoScene,
  query: MonitorQuery = {},
  options: { refresh?: boolean } = {},
): Promise<PageResult<MonitorListItem> & { summary: MonitorSummary; requestId: string; selfCheckFailed: number }> {
  resetIfNeeded(scene)
  await wait(options.refresh ? 280 : 220)
  const requestId = newRequestId('OK')
  assertReadable(scene)
  maybeFailLoad(scene, Boolean(options.refresh))

  const all = buildRows(scene)
  const scoped = all.filter((item) => scopeMatch(item, query))
  const matched = sortRows(all.filter((item) => listMatch(item, query)))
  const pageSize = query.pageSize === 50 ? 50 : 20
  const total = matched.length
  const maxPage = Math.max(1, Math.ceil(total / pageSize))
  const page = Math.min(Math.max(query.page ?? 1, 1), maxPage)
  const start = (page - 1) * pageSize
  store.loadedOnce = true
  return {
    list: matched.slice(start, start + pageSize).map((item) => cloneJson(item)),
    page,
    pageSize,
    total,
    summary: { ...computeSummary(scoped), scopeNote: scopeNoteFor(query) },
    requestId,
    selfCheckFailed: HEALTH_STATUS_SELF_CHECK.filter((item) => !item.ok).length,
  }
}

export function monitorMetricKeys(): MetricKey[] {
  return [...METRIC_KEYS]
}

export function peekDeviceCount(): number {
  return peekDeviceRecords().length
}
