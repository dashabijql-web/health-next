import { commitPersonBinding, findDeviceById, planPersonImeiBinding, syncBoundPersonProfile } from './deviceStore'
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

const root = globalThis as typeof globalThis & { __hnPeopleStore?: PeopleStore }
const store: PeopleStore = root.__hnPeopleStore ?? {
  scene: 'default',
  records: cloneJson(DEFAULT_PEOPLE),
  seq: 200,
}
root.__hnPeopleStore = store

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

function boundImei(record: PersonRecord): string | null {
  if (record.deviceId) {
    const device = findDeviceById(record.deviceId)
    if (device) return device.imei
  }
  return record.imei
}

function toListItem(record: PersonRecord): PersonListItem {
  const imei = boundImei(record)
  return {
    employeeId: record.employeeId,
    empCode: record.empCode,
    empName: record.empName,
    departmentName: record.departmentName,
    jobName: record.jobName,
    phoneDisplay: displayPhone(record.phone, false),
    imei,
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
    const hay = [record.empName, record.empCode, record.phone ?? '', boundImei(record) ?? '', record.employeeId]
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
  if (!found) return null
  const copy = cloneJson(found)
  copy.imei = boundImei(found)
  return copy
}

export async function fetchPersonDetail(
  scene: PeopleDemoScene,
  employeeId: string,
  options?: { preserveStore?: boolean },
): Promise<PersonRecord & { phoneDisplay: string; contactMasked: boolean }> {
  if (!options?.preserveStore) resetIfNeeded(scene)
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
  const detail = cloneJson(found)
  detail.imei = boundImei(found)
  return {
    ...detail,
    phoneDisplay: displayPhone(found.phone, viewContact),
    contactMasked: !viewContact,
  }
}

function parsePersonFields(payload: PersonWritePayload, requestId: string) {
  const department = findDepartment(payload.departmentId)
  const job = findJob(payload.jobId)
  if (!payload.empName.trim()) {
    throw new MockApiError({ code: 'VALIDATION', requestId, message: '请填写姓名', field: 'empName' })
  }
  if (!payload.empCode.trim()) {
    throw new MockApiError({ code: 'VALIDATION', requestId, message: '请填写工号', field: 'empCode' })
  }
  if (!department) {
    throw new MockApiError({ code: 'VALIDATION', requestId, message: '请选择部门', field: 'departmentId' })
  }
  if (!job) {
    throw new MockApiError({ code: 'VALIDATION', requestId, message: '请选择工种', field: 'jobId' })
  }
  return {
    empName: payload.empName.trim(),
    empCode: payload.empCode.trim(),
    departmentId: department.id,
    departmentName: department.name,
    jobId: job.id,
    jobName: job.name,
    phone: payload.phone?.trim() || null,
    employmentStatus: payload.employmentStatus,
    remark: payload.remark?.trim() || null,
  }
}

function applyPersonFields(target: PersonRecord, fields: ReturnType<typeof parsePersonFields>) {
  target.empName = fields.empName
  target.empCode = fields.empCode
  target.departmentId = fields.departmentId
  target.departmentName = fields.departmentName
  target.jobId = fields.jobId
  target.jobName = fields.jobName
  target.phone = fields.phone
  target.employmentStatus = fields.employmentStatus
  target.remark = fields.remark
}

export async function createPerson(scene: PeopleDemoScene, payload: PersonWritePayload): Promise<PersonRecord> {
  resetIfNeeded(scene)
  await wait(240)
  const requestId = newRequestId('OK')
  assertWritable(scene, requestId)
  const fields = parsePersonFields(payload, requestId)
  const dup = store.records.some((item) => item.empCode === fields.empCode)
  if (dup) {
    throw new MockApiError({ code: 'VALIDATION', requestId, message: '工号已存在', field: 'empCode' })
  }
  const plan = planPersonImeiBinding(
    { employeeId: null, imei: null, deviceId: null },
    payload.imei,
    store.records,
    requestId,
  )
  store.seq += 1
  const created: PersonRecord = {
    employeeId: `EMP-NEW-${store.seq}`,
    empCode: fields.empCode,
    empName: fields.empName,
    departmentId: fields.departmentId,
    departmentName: fields.departmentName,
    jobId: fields.jobId,
    jobName: fields.jobName,
    phone: fields.phone,
    imei: plan.imei,
    deviceId: plan.deviceId,
    employmentStatus: fields.employmentStatus,
    lastOnlineAt: null,
    lastHealthAt: null,
    currentRisk: 'none',
    openIncidentId: null,
    remark: fields.remark,
  }
  store.records.unshift(created)
  commitPersonBinding(created, plan)
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
  const fields = parsePersonFields(payload, requestId)
  const dup = store.records.some((item) => item.employeeId !== employeeId && item.empCode === fields.empCode)
  if (dup) {
    throw new MockApiError({ code: 'VALIDATION', requestId, message: '工号已存在', field: 'empCode' })
  }
  const plan = planPersonImeiBinding(
    { employeeId: found.employeeId, imei: found.imei, deviceId: found.deviceId },
    payload.imei,
    store.records,
    requestId,
  )
  applyPersonFields(found, fields)
  found.imei = plan.imei
  found.deviceId = plan.deviceId
  commitPersonBinding(found, plan)
  syncBoundPersonProfile(found)
  return cloneJson(found)
}

/** 设备页读取当前人员台账，不切换人员演示场景。 */
export function peekPeopleRecords(): PersonRecord[] {
  return store.records
}

export function listPeopleForDeviceBind(): PersonRecord[] {
  const source = store.records.length > 0 ? store.records : DEFAULT_PEOPLE
  return source.map((item) => cloneJson(item))
}

function ensureMutablePerson(employeeId: string): PersonRecord | undefined {
  const found = store.records.find((item) => item.employeeId === employeeId)
  if (found) return found
  const seed = DEFAULT_PEOPLE.find((item) => item.employeeId === employeeId)
  if (!seed) return undefined
  const inserted = cloneJson(seed)
  store.records.push(inserted)
  return inserted
}

/** 设备绑定写入人员台账。人员已绑定其他设备时明确拒绝。 */
export function applyPersonDeviceBind(employeeId: string, deviceId: string, imei: string, requestId: string): PersonRecord {
  const person = ensureMutablePerson(employeeId)
  if (!person) {
    throw new MockApiError({ code: 'NOT_FOUND', requestId, message: '人员不存在或已失去查看权限' })
  }
  if (person.employmentStatus !== 'active') {
    throw new MockApiError({
      code: 'VALIDATION',
      requestId,
      message: `${person.empName} 当前不是在职状态，不能绑定设备`,
    })
  }
  const device = findDeviceById(deviceId)
  if (device?.lifecycleStatus === 'inactive') {
    throw new MockApiError({
      code: 'VALIDATION',
      requestId,
      message: '设备已停用，不能绑定',
    })
  }
  if (person.deviceId && person.deviceId !== deviceId) {
    throw new MockApiError({
      code: 'CONFLICT',
      requestId,
      message: `${person.empName} 已绑定设备 ${person.deviceId}，请先解绑`,
    })
  }
  const occupied = store.records.find(
    (item) => item.employeeId !== employeeId && (item.deviceId === deviceId || item.imei === imei),
  )
  if (occupied) {
    throw new MockApiError({
      code: 'CONFLICT',
      requestId,
      message: `设备已绑定给 ${occupied.empName}，不能重复绑定`,
    })
  }
  person.imei = imei
  person.deviceId = deviceId
  return person
}

export function applyPersonDeviceUnbind(employeeId: string, deviceId: string): PersonRecord | null {
  const person = store.records.find((item) => item.employeeId === employeeId)
    ?? ensureMutablePerson(employeeId)
  if (!person) return null
  if (person.deviceId && person.deviceId !== deviceId) return person
  person.imei = null
  person.deviceId = null
  return person
}

export function applyPersonImeiUpdate(employeeId: string, imei: string | null): void {
  const person = store.records.find((item) => item.employeeId === employeeId)
  if (!person) return
  person.imei = imei
}

export function syncImeiForDevice(deviceId: string, imei: string | null): void {
  for (const person of store.records) {
    if (person.deviceId === deviceId) person.imei = imei
  }
}
