/** HealthNext 第一批页面共用类型。字段与后台实施计划 16.2 / 16.3 对齐，供 mock 与未来真实接口复用。 */

export type IncidentSource = 'HEALTH_THRESHOLD' | 'DEVICE_ALARM' | 'TREND_WARNING'
export type Severity = 'critical' | 'warning' | 'info'
export type RecoveryState = 'abnormal' | 'recovering' | 'recovered' | 'unknown' | 'not_applicable'
export type HandlingState =
  | 'new'
  | 'confirmed'
  | 'assigned'
  | 'processing'
  | 'completed'
  | 'closed'
  | 'false_alarm'

export type IncidentAction =
  | 'view'
  | 'confirm'
  | 'assign'
  | 'start_handle'
  | 'complete'
  | 'close'
  | 'false_alarm'

export type EmploymentStatus = 'active' | 'leave' | 'resigned'
export type DeviceBindingStatus = 'bound' | 'unbound'
export type PersonRisk = 'none' | 'attention' | 'critical' | 'unknown'

export type IncidentDemoScene =
  | 'default'
  | 'pagination'
  | 'empty'
  | 'error'
  | 'cache-fail'
  | 'forbidden'
  | 'readonly'

export type PeopleDemoScene = 'default' | 'empty' | 'error' | 'forbidden' | 'readonly'
export type DeviceDemoScene = 'default' | 'empty' | 'error' | 'forbidden' | 'readonly'
export type MonitorDemoScene =
  | 'default'
  | 'empty'
  | 'empty-online'
  | 'error'
  | 'cache-fail'
  | 'forbidden'
  | 'readonly'

export interface OperatorAccount {
  userId: string
  name: string
  username: string
}

export interface Department {
  id: string
  name: string
}

export interface JobType {
  id: string
  name: string
}

export interface EvidenceItem {
  metric: string
  metricLabel: string
  value: number | string | null
  unit: string
  measuredAt: string | null
  valid: boolean
  stale: boolean
  /** 明确标记为 mock 测试数据，非正式健康规则 */
  thresholdNote: string | null
}

export interface TimelineItem {
  id: string
  action: IncidentAction | 'create'
  actorId: string
  actorName: string
  at: string
  remark: string | null
  result: string | null
}

export interface AssigneeRef {
  userId: string
  name: string
}

export interface IncidentRecord {
  incidentId: string
  employeeId: string
  employeeName: string
  departmentId: string
  departmentName: string
  jobName: string
  deviceId: string | null
  locationText: string | null
  locationMissingReason: string | null
  source: IncidentSource
  eventCode: string
  eventName: string
  severity: Severity
  occurredAt: string
  evidence: EvidenceItem[]
  recoveryState: RecoveryState
  handlingState: HandlingState
  assignee: AssigneeRef | null
  dueAt: string | null
  version: number
  timeline: TimelineItem[]
  remark: string | null
  lastUpdatedAt: string
}

export interface IncidentListItem {
  incidentId: string
  employeeId: string
  employeeName: string
  departmentId: string
  departmentName: string
  eventName: string
  eventCode: string
  source: IncidentSource
  severity: Severity
  occurredAt: string
  handlingState: HandlingState
  recoveryState: RecoveryState
  assigneeName: string | null
  dueAt: string | null
  locationText: string | null
  locationMissingReason: string | null
  evidenceSummary: string
  allowedActions: IncidentAction[]
  version: number
  missingFields: string[]
}

export interface IncidentSummary {
  totalTodo: number
  mine: number
  criticalUnconfirmed: number
  unassigned: number
  overdue: number
  generatedAt: string
  dataNote: string
}

export interface IncidentQuery {
  keyword?: string
  departmentId?: string
  source?: IncidentSource | 'all'
  severity?: Severity | 'all'
  handlingState?: HandlingState | 'all' | 'todo'
  timeRange?: 'all' | 'today' | '3d' | '7d'
  mineOnly?: boolean
  unassignedOnly?: boolean
  overdueOnly?: boolean
  criticalUnconfirmedOnly?: boolean
  page?: number
  pageSize?: number
}

export interface PageResult<T> {
  list: T[]
  page: number
  pageSize: number
  total: number
}

export interface IncidentActionPayload {
  action: IncidentAction
  version: number
  requestId: string
  assigneeId?: string
  measures?: string
  result?: string
  reason?: string
  closeNote?: string
}

export interface PersonRecord {
  employeeId: string
  empCode: string
  empName: string
  departmentId: string
  departmentName: string
  jobId: string
  jobName: string
  phone: string | null
  imei: string | null
  deviceId: string | null
  employmentStatus: EmploymentStatus
  lastOnlineAt: string | null
  lastHealthAt: string | null
  currentRisk: PersonRisk
  openIncidentId: string | null
  remark: string | null
}

export interface PersonListItem {
  employeeId: string
  empCode: string
  empName: string
  departmentName: string
  jobName: string
  phoneDisplay: string
  imei: string | null
  deviceId: string | null
  deviceBinding: DeviceBindingStatus
  employmentStatus: EmploymentStatus
  lastOnlineAt: string | null
  lastHealthAt: string | null
  currentRisk: PersonRisk
  openIncidentId: string | null
  contactMasked: boolean
}

export interface PersonQuery {
  keyword?: string
  departmentId?: string
  jobId?: string
  employmentStatus?: EmploymentStatus | 'all'
  deviceBinding?: DeviceBindingStatus | 'all'
  page?: number
  pageSize?: number
}

export interface PersonWritePayload {
  empName: string
  empCode: string
  departmentId: string
  jobId: string
  phone?: string | null
  imei?: string | null
  employmentStatus: EmploymentStatus
  remark?: string | null
}

export type DeviceOnlineStatus = 'online' | 'offline'
export type DeviceLifecycleStatus = 'active' | 'inactive'
export type DeviceBatteryFilter = 'all' | 'low' | 'normal' | 'unknown'
export type DeviceAction = 'view' | 'edit' | 'bind' | 'unbind' | 'deactivate'

export interface DeviceBindingHistoryItem {
  id: string
  employeeId: string | null
  employeeName: string
  empCode: string | null
  boundAt: string
  unboundAt: string | null
  note: string | null
}

export interface DeviceMaintenanceItem {
  id: string
  at: string
  actorName: string
  action: string
  note: string | null
}

export interface DeviceErrorItem {
  id: string
  at: string
  code: string
  message: string
}

export interface DeviceRecord {
  deviceId: string
  imei: string
  deviceName: string
  model: string
  firmware: string | null
  network: string | null
  departmentId: string | null
  departmentName: string | null
  employeeId: string | null
  employeeName: string | null
  empCode: string | null
  onlineStatus: DeviceOnlineStatus
  lifecycleStatus: DeviceLifecycleStatus
  batteryPercent: number | null
  lastCommAt: string | null
  lastDataAt: string | null
  lastOnlineAt: string | null
  remark: string | null
  version: number
  bindings: DeviceBindingHistoryItem[]
  maintenance: DeviceMaintenanceItem[]
  errors: DeviceErrorItem[]
}

export interface DeviceListItem {
  deviceId: string
  imei: string
  deviceName: string
  model: string
  firmware: string | null
  employeeId: string | null
  employeeName: string | null
  empCode: string | null
  departmentName: string | null
  onlineStatus: DeviceOnlineStatus
  lifecycleStatus: DeviceLifecycleStatus
  batteryPercent: number | null
  lastCommAt: string | null
  lastDataAt: string | null
  lastOnlineAt: string | null
  missingFields: string[]
  allowedActions: DeviceAction[]
  version: number
}

export interface DeviceDetail extends DeviceRecord {
  missingFields: string[]
  allowedActions: DeviceAction[]
  controlUnavailableReason: string
  rawUnavailableReason: string
}

export interface DeviceSummary {
  total: number
  online: number
  offline: number
  lowBattery: number
  unbound: number
  generatedAt: string
  dataNote: string
}

export interface DeviceQuery {
  imei?: string
  model?: string | 'all'
  onlineStatus?: DeviceOnlineStatus | 'all'
  bindingStatus?: DeviceBindingStatus | 'all'
  battery?: DeviceBatteryFilter
  departmentId?: string
  page?: number
  pageSize?: number
}

export interface DeviceWritePayload {
  imei: string
  deviceName: string
  model: string
  firmware?: string | null
  departmentId?: string | null
  remark?: string | null
}

export interface DeviceImportRow {
  line: number
  imei: string
  deviceName: string
  model: string
  firmware?: string | null
  departmentId?: string | null
}

export interface DeviceBindCandidate {
  employeeId: string
  empName: string
  empCode: string
  departmentName: string
  jobName: string
  boundDeviceId: string | null
}

export interface BatchItemResult {
  key: string
  label: string
  success: boolean
  message: string
}

export interface BatchOpResult {
  requestId: string
  results: BatchItemResult[]
  successCount: number
  failCount: number
}

export type MetricKey = 'heartRate' | 'bloodPressure' | 'bloodOxygen' | 'temperature' | 'pressure'
export type IndicatorState = 'normal' | 'warning' | 'stale' | 'no_data'

export interface RawMetricReading {
  value: number | string | null
  unit: string
  measuredAt: string | null
  valid: boolean
  invalidReason?: string | null
}

export interface IndicatorView {
  key: MetricKey
  label: string
  value: number | string | null
  display: string
  unit: string
  measuredAt: string | null
  state: IndicatorState
  stateLabel: string
  reason: string | null
}

export interface MonitorListItem {
  employeeId: string
  empCode: string
  empName: string
  departmentId: string
  departmentName: string
  jobName: string
  deviceId: string | null
  imei: string | null
  deviceName: string | null
  onlineStatus: DeviceOnlineStatus
  lastOnlineAt: string | null
  indicators: Record<MetricKey, IndicatorView>
  indicatorStates: Record<MetricKey, IndicatorState>
  overallStatus: IndicatorState
  warningReasons: string[]
  relatedIncidentId: string | null
  relatedIncidentName: string | null
  relatedIncidentHandling: HandlingState | null
  relatedIncidentMissingReason: string | null
}

export interface MonitorSummary {
  online: number
  warning: number
  stale: number
  noData: number
  generatedAt: string
  dataNote: string
  scopeNote: string
  onlineWindowMinutes: number
  freshnessWindowMinutes: number
}

export interface MonitorQuery {
  keyword?: string
  departmentId?: string
  overallStatus?: IndicatorState | 'all'
  metric?: MetricKey | 'all'
  onlineStatus?: DeviceOnlineStatus | 'all'
  page?: number
  pageSize?: number
}

export type MockErrorCode =
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'VALIDATION'
  | 'UNAVAILABLE'
  | 'UNAUTHORIZED'

export interface MockApiErrorBody {
  code: MockErrorCode
  httpStatus: number
  message: string
  requestId: string
  field?: string
}
