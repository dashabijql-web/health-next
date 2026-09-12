import type {
  EmploymentStatus,
  HandlingState,
  IncidentAction,
  IncidentSource,
  PersonRisk,
  RecoveryState,
  Severity,
} from './types'

export const SOURCE_LABELS: Record<IncidentSource, string> = {
  HEALTH_THRESHOLD: '体征超限',
  DEVICE_ALARM: '设备主动报警',
  TREND_WARNING: '趋势风险',
}

export const SEVERITY_LABELS: Record<Severity, string> = {
  critical: '高危',
  warning: '关注',
  info: '普通',
}

export const SEVERITY_RANK: Record<Severity, number> = {
  critical: 3,
  warning: 2,
  info: 1,
}

export const HANDLING_LABELS: Record<HandlingState, string> = {
  new: '新建',
  confirmed: '已确认',
  assigned: '已分派',
  processing: '处理中',
  completed: '处理完成',
  closed: '已关闭',
  false_alarm: '误报',
}

export const RECOVERY_LABELS: Record<RecoveryState, string> = {
  abnormal: '正在异常',
  recovering: '恢复观察中',
  recovered: '已经稳定恢复',
  unknown: '无法判断',
  not_applicable: '不适用',
}

export const ACTION_LABELS: Record<IncidentAction, string> = {
  view: '查看',
  confirm: '确认',
  assign: '分派',
  start_handle: '开始处理',
  complete: '处理完成',
  close: '关闭',
  false_alarm: '误报',
}

export const EMPLOYMENT_LABELS: Record<EmploymentStatus, string> = {
  active: '在职',
  leave: '请假',
  resigned: '离职',
}

export const RISK_LABELS: Record<PersonRisk, string> = {
  none: '无当前风险',
  attention: '关注',
  critical: '高危',
  unknown: '未知',
}

export const TODO_STATES: HandlingState[] = ['new', 'confirmed', 'assigned', 'processing', 'completed']

export function isTodoState(state: HandlingState): boolean {
  return TODO_STATES.includes(state)
}
