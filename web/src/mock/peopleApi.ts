import { MockApiError, newRequestId } from './errors'
import { cloneJson, displayPhone, wait } from './format'
import { findDepartment, findJob } from './org'
import { DEFAULT_PEOPLE } from './people'
import { canViewContact, isWritableScene } from './session'
import type {
  PageResult,
  PeopleDemoScene,
  PersonListItem,
  PersonQuery,
  PersonRecord,
  PersonWritePayload,
} from './types'

interface PeopleStore {
  scene: PeopleDemoScene
  records: PersonRecord[]
  seq: number
}

const store: PeopleStore = {
  scene: 'default',
  records: cloneJson(DEFAULT_PEOPLE),
  seq: 200,
}

function resetIfNeeded(scene: PeopleDemoScene) {
  if (store.scene !== scene) {
    store.scene = scene
    store.records = scene === 'empty' ? [] : cloneJson(DEFAULT_PEOPLE)
    store.seq = 200
  }
}

function assertReadable(scene: PeopleDemoScene) {
  if (scene === 'forbidden') {
    throw new MockApiError({
      code: 'FORBIDDEN',
      requestId: newRequestId('FORBIDDEN'),
      message: '当前账号无权查看人员档案',
    })
  }
}

function assertWritable(scene: PeopleDemoScene, requestId: string) {
  assertReadable(scene)
  if (!isWritableScene(scene)) {
    throw new MockApiError({
      code: 'FORBIDDEN',
      requestId,
      message: '当前账号为只读，不能新增或编辑人员',
    })
  }
}

function maybeFail(scene: PeopleDemoScene) {
  if (scene === 'error') {
    throw new MockApiError({
      code: 'UNAVAILABLE',
      requestId: newRequestId('UNAVAILABLE'),
      message: '人员档案查询失败，演示数据源暂不可用',
    })
  }
}

function toListItem(record: PersonRecord): PersonListItem {
  return {
    employeeId: record.employeeId,
    empCode: record.empCode,
    empName: record.empName,
    departmentName: record.departmentName,
    jobName: record.jobName,
    phoneDisplay: displayPhone(record.phone, false),
    imei: record.imei,
    deviceId: record.deviceId,
    deviceBinding: record.deviceId ? 'bound' : 'unbound',
    employmentStatus: record.employmentStatus,
    lastOnlineAt: record.lastOnlineAt,
    lastHealthAt: record.lastHealthAt,
    currentRisk: record.currentRisk,
    openIncidentId: record.openIncidentId,
    contactMasked: true,
  }
}

function matchPerson(record: PersonRecord, query: PersonQuery): boolean {
  const keyword = query.keyword?.trim().toLowerCase() ?? ''
  if (keyword) {
    const hay = [record.empName, record.empCode, record.phone ?? '', record.imei ?? '', record.employeeId]
      .join(' ')
      .toLowerCase()
    if (!hay.includes(keyword)) return false
  }
  if (query.departmentId && query.departmentId !== 'all' && record.departmentId !== query.departmentId) return false
  if (query.jobId && query.jobId !== 'all' && record.jobId !== query.jobId) return false
  if (query.employmentStatus && query.employmentStatus !== 'all' && record.employmentStatus !== query.employmentStatus) {
    return false
  }
  if (query.deviceBinding && query.deviceBinding !== 'all') {
    const bound = record.deviceId ? 'bound' : 'unbound'
    if (bound !== query.deviceBinding) return false
  }
  return true
}

export async function fetchPeopleList(
  scene: PeopleDemoScene,
  query: PersonQuery = {},
): Promise<PageResult<PersonListItem> & { requestId: string }> {
  resetIfNeeded(scene)
  await wait(220)
  const requestId = newRequestId('OK')
  assertReadable(scene)
  maybeFail(scene)
  const matched = store.records.filter((item) => matchPerson(item, query))
  const pageSize = query.pageSize === 50 ? 50 : 20
  const total = matched.length
  const maxPage = Math.max(1, Math.ceil(total / pageSize))
  const page = Math.min(Math.max(query.page ?? 1, 1), maxPage)
  const start = (page - 1) * pageSize
  return {
    list: matched.slice(start, start + pageSize).map((item) => toListItem(item)),
    page,
    pageSize,
    total,
    requestId,
  }
}

function findPersonRecord(employeeId: string): PersonRecord | undefined {
  return store.records.find((item) => item.employeeId === employeeId)
    ?? DEFAULT_PEOPLE.find((item) => item.employeeId === employeeId)
}

/** 不切换人员演示场景，避免事件详情读取人员时重置档案页。 */
export function lookupPerson(employeeId: string): PersonRecord | null {
  const found = findPersonRecord(employeeId)
  return found ? cloneJson(found) : null
}

export async function fetchPersonDetail(scene: PeopleDemoScene, employeeId: string): Promise<PersonRecord & { phoneDisplay: string; contactMasked: boolean }> {
  resetIfNeeded(scene)
  await wait(160)
  assertReadable(scene)
  maybeFail(scene)
  const found = findPersonRecord(employeeId)
  if (!found) {
    throw new MockApiError({
      code: 'NOT_FOUND',
      requestId: newRequestId('NOT_FOUND'),
      message: '人员不存在或已失去查看权限',
    })
  }
  const viewContact = canViewContact(scene)
  return {
    ...cloneJson(found),
    phoneDisplay: displayPhone(found.phone, viewContact),
    contactMasked: !viewContact,
  }
}

function applyWrite(target: PersonRecord, payload: PersonWritePayload) {
  const department = findDepartment(payload.departmentId)
  const job = findJob(payload.jobId)
  if (!payload.empName.trim()) {
    throw new MockApiError({ code: 'VALIDATION', requestId: newRequestId('VALIDATION'), message: '请填写姓名', field: 'empName' })
  }
  if (!payload.empCode.trim()) {
    throw new MockApiError({ code: 'VALIDATION', requestId: newRequestId('VALIDATION'), message: '请填写工号', field: 'empCode' })
  }
  if (!department) {
    throw new MockApiError({ code: 'VALIDATION', requestId: newRequestId('VALIDATION'), message: '请选择部门', field: 'departmentId' })
  }
  if (!job) {
    throw new MockApiError({ code: 'VALIDATION', requestId: newRequestId('VALIDATION'), message: '请选择工种', field: 'jobId' })
  }
  target.empName = payload.empName.trim()
  target.empCode = payload.empCode.trim()
  target.departmentId = department.id
  target.departmentName = department.name
  target.jobId = job.id
  target.jobName = job.name
  target.phone = payload.phone?.trim() || null
  target.imei = payload.imei?.trim() || null
  target.deviceId = target.imei ? `DEV-${target.imei}` : null
  target.employmentStatus = payload.employmentStatus
  target.remark = payload.remark?.trim() || null
}

export async function createPerson(scene: PeopleDemoScene, payload: PersonWritePayload): Promise<PersonRecord> {
  resetIfNeeded(scene)
  await wait(240)
  const requestId = newRequestId('OK')
  assertWritable(scene, requestId)
  const dup = store.records.some((item) => item.empCode === payload.empCode.trim())
  if (dup) {
    throw new MockApiError({ code: 'VALIDATION', requestId, message: '工号已存在', field: 'empCode' })
  }
  store.seq += 1
  const created: PersonRecord = {
    employeeId: `EMP-NEW-${store.seq}`,
    empCode: payload.empCode.trim(),
    empName: payload.empName.trim(),
    departmentId: payload.departmentId,
    departmentName: findDepartment(payload.departmentId)?.name ?? '',
    jobId: payload.jobId,
    jobName: findJob(payload.jobId)?.name ?? '',
    phone: payload.phone?.trim() || null,
    imei: payload.imei?.trim() || null,
    deviceId: payload.imei?.trim() ? `DEV-${payload.imei.trim()}` : null,
    employmentStatus: payload.employmentStatus,
    lastOnlineAt: null,
    lastHealthAt: null,
    currentRisk: 'none',
    openIncidentId: null,
    remark: payload.remark?.trim() || null,
  }
  applyWrite(created, payload)
  store.records.unshift(created)
  return cloneJson(created)
}

export async function updatePerson(scene: PeopleDemoScene, employeeId: string, payload: PersonWritePayload): Promise<PersonRecord> {
  resetIfNeeded(scene)
  await wait(240)
  const requestId = newRequestId('OK')
  assertWritable(scene, requestId)
  const found = store.records.find((item) => item.employeeId === employeeId)
  if (!found) {
    throw new MockApiError({ code: 'NOT_FOUND', requestId, message: '人员不存在或已失去查看权限' })
  }
  const dup = store.records.some((item) => item.employeeId !== employeeId && item.empCode === payload.empCode.trim())
  if (dup) {
    throw new MockApiError({ code: 'VALIDATION', requestId, message: '工号已存在', field: 'empCode' })
  }
  applyWrite(found, payload)
  return cloneJson(found)
}
