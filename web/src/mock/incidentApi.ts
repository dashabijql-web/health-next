import { MockApiError, newRequestId } from './errors'
import { cloneJson, evidenceSummary, wait } from './format'
import { fixturesForScene } from './incidents'
import { isTodoState, SEVERITY_RANK } from './labels'
import { ASSIGNABLE_USERS, findAssignee } from './org'
import { CURRENT_OPERATOR, getTestClock, isWritableScene, TEST_CLOCK_ISO } from './session'
import type {
  IncidentAction,
  IncidentActionPayload,
  IncidentDemoScene,
  IncidentListItem,
  IncidentQuery,
  IncidentRecord,
  IncidentSummary,
  PageResult,
} from './types'

interface IncidentStore {
  scene: IncidentDemoScene
  records: IncidentRecord[]
  loadedOnce: boolean
  actionCache: Map<string, IncidentRecord>
}

const store: IncidentStore = {
  scene: 'default',
  records: cloneJson(fixturesForScene('default')),
  loadedOnce: false,
  actionCache: new Map(),
}

function resetIfNeeded(scene: IncidentDemoScene) {
  if (store.scene !== scene) {
    store.scene = scene
    store.records = cloneJson(fixturesForScene(scene))
    store.loadedOnce = false
    store.actionCache.clear()
  }
}

export function peekIncidentScene(): IncidentDemoScene {
  return store.scene
}

/** 不切换事件演示场景，避免实时监控或人员详情重置待办样本。 */
export function peekIncidentById(incidentId: string | null | undefined): IncidentRecord | null {
  if (!incidentId) return null
  const found = store.records.find((item) => item.incidentId === incidentId)
  return found ? cloneJson(found) : null
}

export function peekIncidentForEmployee(employeeId: string): IncidentRecord | null {
  const open = store.records.find((item) => item.employeeId === employeeId && isTodoState(item.handlingState))
  const any = open ?? store.records.find((item) => item.employeeId === employeeId)
  return any ? cloneJson(any) : null
}

export function resolveRelatedIncident(employeeId: string, claimedId: string | null | undefined): IncidentRecord | null {
  if (claimedId) {
    const byId = peekIncidentById(claimedId)
    if (byId && byId.employeeId === employeeId) return byId
  }
  return peekIncidentForEmployee(employeeId)
}

export function seedIncidentScene(scene: IncidentDemoScene) {
  resetIfNeeded(scene)
}

function assertReadable(scene: IncidentDemoScene) {
  if (scene === 'forbidden') {
    throw new MockApiError({
      code: 'FORBIDDEN',
      requestId: newRequestId('FORBIDDEN'),
      message: '当前账号无权查看待办事件',
    })
  }
}

function assertWritable(scene: IncidentDemoScene, requestId: string) {
  assertReadable(scene)
  if (!isWritableScene(scene)) {
    throw new MockApiError({
      code: 'FORBIDDEN',
      requestId,
      message: '当前账号为只读，不能执行处理动作',
    })
  }
}

function missingFields(record: IncidentRecord): string[] {
  const fields: string[] = []
  if (!record.employeeName) fields.push('人员姓名')
  if (!record.eventName) fields.push('事件名称')
  if (record.evidence.some((item) => item.value === null || item.value === '' || !item.measuredAt)) {
    fields.push('测量证据')
  }
  return fields
}

export function computeAllowedActions(record: IncidentRecord, scene: IncidentDemoScene): IncidentAction[] {
  const actions: IncidentAction[] = ['view']
  if (!isWritableScene(scene)) return actions
  if (record.handlingState === 'closed' || record.handlingState === 'false_alarm') return actions
  if (record.handlingState === 'new') {
    actions.push('confirm', 'assign', 'false_alarm')
  } else if (record.handlingState === 'confirmed' || record.handlingState === 'assigned') {
    actions.push('assign', 'start_handle', 'false_alarm')
  } else if (record.handlingState === 'processing') {
    actions.push('assign', 'complete', 'false_alarm')
  } else if (record.handlingState === 'completed') {
    actions.push('close', 'false_alarm')
  }
  return actions
}

function toListItem(record: IncidentRecord, scene: IncidentDemoScene): IncidentListItem {
  return {
    incidentId: record.incidentId,
    employeeId: record.employeeId,
    employeeName: record.employeeName,
    departmentId: record.departmentId,
    departmentName: record.departmentName,
    eventName: record.eventName,
    eventCode: record.eventCode,
    source: record.source,
    severity: record.severity,
    occurredAt: record.occurredAt,
    handlingState: record.handlingState,
    recoveryState: record.recoveryState,
    assigneeName: record.assignee?.name ?? null,
    dueAt: record.dueAt,
    locationText: record.locationText,
    locationMissingReason: record.locationMissingReason,
    evidenceSummary: evidenceSummary(record.evidence),
    allowedActions: computeAllowedActions(record, scene),
    version: record.version,
    missingFields: missingFields(record),
  }
}

function inTimeRange(occurredAt: string, timeRange: IncidentQuery['timeRange']): boolean {
  if (!timeRange || timeRange === 'all') return true
  const day = occurredAt.slice(0, 10)
  if (timeRange === 'today') return day === '2026-09-12'
  if (timeRange === '3d') return day >= '2026-09-10' && day <= '2026-09-12'
  if (timeRange === '7d') return day >= '2026-09-06' && day <= '2026-09-12'
  return true
}

function isOverdue(record: IncidentRecord): boolean {
  if (!record.dueAt) return false
  return new Date(record.dueAt).getTime() < getTestClock().getTime()
}

function matchKeyword(record: IncidentRecord, keyword: string): boolean {
  const q = keyword.trim().toLowerCase()
  if (!q) return true
  return [record.employeeName, record.employeeId, record.incidentId, record.eventName, record.eventCode]
    .join(' ')
    .toLowerCase()
    .includes(q)
}

function baseMatch(record: IncidentRecord, query: IncidentQuery): boolean {
  if (query.keyword && !matchKeyword(record, query.keyword)) return false
  if (query.departmentId && query.departmentId !== 'all' && record.departmentId !== query.departmentId) return false
  if (query.source && query.source !== 'all' && record.source !== query.source) return false
  if (!inTimeRange(record.occurredAt, query.timeRange ?? 'all')) return false
  return true
}

function listMatch(record: IncidentRecord, query: IncidentQuery): boolean {
  if (!baseMatch(record, query)) return false
  const stateFilter = query.handlingState ?? 'todo'
  if (stateFilter === 'todo') {
    if (!isTodoState(record.handlingState)) return false
  } else if (stateFilter !== 'all' && record.handlingState !== stateFilter) {
    return false
  }
  if (query.severity && query.severity !== 'all' && record.severity !== query.severity) return false
  if (query.mineOnly && record.assignee?.userId !== CURRENT_OPERATOR.userId) return false
  if (query.unassignedOnly && record.assignee) return false
  if (query.overdueOnly && !isOverdue(record)) return false
  if (query.criticalUnconfirmedOnly && !(record.severity === 'critical' && record.handlingState === 'new')) return false
  return true
}

function sortRecords(records: IncidentRecord[]): IncidentRecord[] {
  return [...records].sort((a, b) => {
    const severityDiff = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]
    if (severityDiff !== 0) return severityDiff
    if (a.occurredAt !== b.occurredAt) return a.occurredAt < b.occurredAt ? -1 : 1
    return a.incidentId < b.incidentId ? -1 : 1
  })
}

function computeSummary(records: IncidentRecord[]): IncidentSummary {
  const todos = records.filter((item) => isTodoState(item.handlingState))
  return {
    totalTodo: todos.length,
    mine: todos.filter((item) => item.assignee?.userId === CURRENT_OPERATOR.userId).length,
    criticalUnconfirmed: todos.filter((item) => item.severity === 'critical' && item.handlingState === 'new').length,
    unassigned: todos.filter((item) => !item.assignee).length,
    overdue: todos.filter((item) => isOverdue(item)).length,
    generatedAt: TEST_CLOCK_ISO,
    dataNote: 'mock 测试数据，非正式接口统计',
  }
}

function maybeFailLoad(scene: IncidentDemoScene, isRefresh: boolean) {
  if (scene === 'error') {
    throw new MockApiError({
      code: 'UNAVAILABLE',
      requestId: newRequestId('UNAVAILABLE'),
      message: '待办事件查询失败，演示数据源暂不可用',
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

export async function fetchIncidentSummary(scene: IncidentDemoScene, query: IncidentQuery = {}): Promise<IncidentSummary> {
  resetIfNeeded(scene)
  await wait()
  assertReadable(scene)
  maybeFailLoad(scene, false)
  const scoped = store.records.filter((item) => baseMatch(item, query))
  return computeSummary(scoped)
}

export async function fetchIncidentList(
  scene: IncidentDemoScene,
  query: IncidentQuery = {},
  options: { refresh?: boolean } = {},
): Promise<PageResult<IncidentListItem> & { summary: IncidentSummary; requestId: string }> {
  resetIfNeeded(scene)
  await wait(options.refresh ? 280 : 220)
  const requestId = newRequestId('OK')
  assertReadable(scene)
  maybeFailLoad(scene, Boolean(options.refresh))

  const matched = sortRecords(store.records.filter((item) => listMatch(item, query)))
  const pageSize = query.pageSize === 50 ? 50 : 20
  const total = matched.length
  const maxPage = Math.max(1, Math.ceil(total / pageSize))
  const page = Math.min(Math.max(query.page ?? 1, 1), maxPage)
  const start = (page - 1) * pageSize
  store.loadedOnce = true
  return {
    list: matched.slice(start, start + pageSize).map((item) => toListItem(item, scene)),
    page,
    pageSize,
    total,
    summary: computeSummary(store.records.filter((item) => baseMatch(item, query))),
    requestId,
  }
}

export async function fetchIncidentDetail(scene: IncidentDemoScene, incidentId: string): Promise<IncidentRecord> {
  resetIfNeeded(scene)
  await wait(180)
  assertReadable(scene)
  maybeFailLoad(scene, false)
  const found = store.records.find((item) => item.incidentId === incidentId)
  if (!found) {
    throw new MockApiError({
      code: 'NOT_FOUND',
      requestId: newRequestId('NOT_FOUND'),
      message: '事件不存在或已失去查看权限',
    })
  }
  return cloneJson(found)
}

export async function fetchAssignees(keyword = ''): Promise<{ userId: string; name: string }[]> {
  await wait(120)
  const q = keyword.trim().toLowerCase()
  return ASSIGNABLE_USERS.filter((item) => !q || item.name.toLowerCase().includes(q) || item.userId.toLowerCase().includes(q))
}

function closeBlockReason(record: IncidentRecord): string | null {
  if (record.handlingState !== 'completed') return '需要先完成处理才能关闭'
  if (record.source === 'HEALTH_THRESHOLD') {
    if (record.recoveryState !== 'recovered') {
      return `当前体征为「${record.recoveryState}」，未满足 mock 恢复条件，不能关闭`
    }
    if (record.evidence.some((item) => item.stale || !item.valid)) {
      return '测量证据无效或过旧，不能关闭'
    }
  }
  return null
}

function appendTimeline(record: IncidentRecord, action: IncidentAction, remark: string | null, result: string | null) {
  record.timeline.push({
    id: `${record.incidentId}-TL-${String(record.timeline.length + 1).padStart(2, '0')}`,
    action,
    actorId: CURRENT_OPERATOR.userId,
    actorName: CURRENT_OPERATOR.name,
    at: TEST_CLOCK_ISO,
    remark,
    result,
  })
  record.lastUpdatedAt = TEST_CLOCK_ISO
  record.version += 1
}

function applyAction(record: IncidentRecord, payload: IncidentActionPayload) {
  const notifyResult = '已记录待发送通知（外部通知未接入，未真正发送）'
  switch (payload.action) {
    case 'confirm': {
      if (record.handlingState !== 'new') {
        throw new MockApiError({ code: 'VALIDATION', requestId: payload.requestId, message: '仅新建事件可以确认' })
      }
      record.handlingState = 'confirmed'
      appendTimeline(record, 'confirm', payload.reason ?? null, notifyResult)
      return
    }
    case 'assign': {
      if (!['new', 'confirmed', 'assigned', 'processing'].includes(record.handlingState)) {
        throw new MockApiError({ code: 'VALIDATION', requestId: payload.requestId, message: '当前状态不能分派' })
      }
      if (!payload.assigneeId) {
        throw new MockApiError({ code: 'VALIDATION', requestId: payload.requestId, message: '请选择处理人', field: 'assigneeId' })
      }
      const assignee = findAssignee(payload.assigneeId)
      if (!assignee) {
        throw new MockApiError({ code: 'VALIDATION', requestId: payload.requestId, message: '处理人不在可分派名单中' })
      }
      const from = record.assignee?.name ?? '未分派'
      record.assignee = { ...assignee }
      if (record.handlingState === 'new' || record.handlingState === 'confirmed') {
        record.handlingState = 'assigned'
      }
      appendTimeline(record, 'assign', `由 ${from} 分派给 ${assignee.name}`, notifyResult)
      return
    }
    case 'start_handle': {
      if (record.handlingState === 'new') {
        throw new MockApiError({
          code: 'VALIDATION',
          requestId: payload.requestId,
          message: '新建事件请先确认或分派，之后才能开始处理',
        })
      }
      if (!['confirmed', 'assigned'].includes(record.handlingState)) {
        throw new MockApiError({ code: 'VALIDATION', requestId: payload.requestId, message: '当前状态不能开始处理' })
      }
      if (!record.assignee) {
        record.assignee = { userId: CURRENT_OPERATOR.userId, name: CURRENT_OPERATOR.name }
        appendTimeline(record, 'assign', `未分派，先分给 ${CURRENT_OPERATOR.name}`, notifyResult)
      }
      record.handlingState = 'processing'
      appendTimeline(record, 'start_handle', payload.reason ?? '开始处理', notifyResult)
      return
    }
    case 'complete': {
      if (record.handlingState !== 'processing') {
        throw new MockApiError({ code: 'VALIDATION', requestId: payload.requestId, message: '仅处理中的事件可以完成' })
      }
      if (!payload.measures?.trim() || !payload.result?.trim()) {
        throw new MockApiError({ code: 'VALIDATION', requestId: payload.requestId, message: '处理完成必须填写措施和结果' })
      }
      record.handlingState = 'completed'
      record.remark = payload.measures.trim()
      appendTimeline(record, 'complete', payload.measures.trim(), payload.result.trim())
      return
    }
    case 'close': {
      const blocked = closeBlockReason(record)
      if (blocked) {
        throw new MockApiError({ code: 'VALIDATION', requestId: payload.requestId, message: blocked })
      }
      if (!payload.closeNote?.trim()) {
        throw new MockApiError({ code: 'VALIDATION', requestId: payload.requestId, message: '关闭必须填写说明', field: 'closeNote' })
      }
      record.handlingState = 'closed'
      appendTimeline(record, 'close', payload.closeNote.trim(), '事件关闭，不再出现在待办')
      return
    }
    case 'false_alarm': {
      if (record.handlingState === 'closed' || record.handlingState === 'false_alarm') {
        throw new MockApiError({ code: 'VALIDATION', requestId: payload.requestId, message: '终结事件不能再标记误报' })
      }
      if (!payload.reason?.trim()) {
        throw new MockApiError({ code: 'VALIDATION', requestId: payload.requestId, message: '误报必须填写理由', field: 'reason' })
      }
      record.handlingState = 'false_alarm'
      appendTimeline(record, 'false_alarm', payload.reason.trim(), '终结当前处置；健康记录保留，规则监测不停止')
      return
    }
    default:
      throw new MockApiError({ code: 'VALIDATION', requestId: payload.requestId, message: '不支持的动作' })
  }
}

export async function submitIncidentAction(
  scene: IncidentDemoScene,
  incidentId: string,
  payload: IncidentActionPayload,
): Promise<IncidentRecord> {
  resetIfNeeded(scene)
  await wait(260)
  assertWritable(scene, payload.requestId)

  const cached = store.actionCache.get(payload.requestId)
  if (cached) return cloneJson(cached)

  const record = store.records.find((item) => item.incidentId === incidentId)
  if (!record) {
    throw new MockApiError({ code: 'NOT_FOUND', requestId: payload.requestId, message: '事件不存在或已失去查看权限' })
  }
  if (payload.version !== record.version) {
    throw new MockApiError({
      code: 'CONFLICT',
      requestId: newRequestId('CONFLICT'),
      message: '此事件已被其他人更新，请重新读取后再操作',
    })
  }
  if (payload.action === 'view') return cloneJson(record)

  applyAction(record, payload)
  store.actionCache.set(payload.requestId, cloneJson(record))
  return cloneJson(record)
}

/** 仅用于样板：在不改变处理状态的前提下提升版本，模拟他人更新。 */
export async function simulateForeignUpdate(scene: IncidentDemoScene, incidentId: string): Promise<void> {
  resetIfNeeded(scene)
  await wait(80)
  const record = store.records.find((item) => item.incidentId === incidentId)
  if (!record) return
  record.version += 1
  record.lastUpdatedAt = TEST_CLOCK_ISO
}

export function getCloseBlockReason(record: IncidentRecord): string | null {
  return closeBlockReason(record)
}
