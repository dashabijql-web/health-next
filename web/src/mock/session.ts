import type {
  DeviceDemoScene,
  IncidentDemoScene,
  MonitorDemoScene,
  OperatorAccount,
  PeopleDemoScene,
} from './types'

/** 固定测试时钟，样板阶段所有超时 / SLA 均相对此时刻计算。 */
export const TEST_CLOCK_ISO = '2026-09-12T16:00:00+08:00'

export const CURRENT_OPERATOR: OperatorAccount = {
  userId: 'U-ADMIN',
  name: '值班员·管理员',
  username: 'admin',
}

export const INCIDENT_SCENE_OPTIONS: { value: IncidentDemoScene; label: string }[] = [
  { value: 'default', label: '默认四条样本' },
  { value: 'pagination', label: '分页样本（28 条）' },
  { value: 'empty', label: '无待办' },
  { value: 'error', label: '加载失败' },
  { value: 'cache-fail', label: '刷新失败保留缓存' },
  { value: 'forbidden', label: '无权限' },
  { value: 'readonly', label: '只读账号' },
]

export const PEOPLE_SCENE_OPTIONS: { value: PeopleDemoScene; label: string }[] = [
  { value: 'default', label: '默认档案' },
  { value: 'empty', label: '空档案' },
  { value: 'error', label: '加载失败' },
  { value: 'forbidden', label: '无权限' },
  { value: 'readonly', label: '只读（联系方式脱敏）' },
]

export const DEVICE_SCENE_OPTIONS: { value: DeviceDemoScene; label: string }[] = [
  { value: 'default', label: '默认设备' },
  { value: 'empty', label: '空设备' },
  { value: 'error', label: '加载失败' },
  { value: 'forbidden', label: '无权限' },
  { value: 'readonly', label: '只读账号' },
]

export const MONITOR_SCENE_OPTIONS: { value: MonitorDemoScene; label: string }[] = [
  { value: 'default', label: '默认实时名单' },
  { value: 'empty', label: '空名单' },
  { value: 'empty-online', label: '无在线人员' },
  { value: 'error', label: '首次加载失败' },
  { value: 'cache-fail', label: '刷新失败保留缓存' },
  { value: 'forbidden', label: '无权限' },
  { value: 'readonly', label: '只读账号' },
]

export function getTestClock(): Date {
  return new Date(TEST_CLOCK_ISO)
}

export function isWritableScene(
  scene: IncidentDemoScene | PeopleDemoScene | DeviceDemoScene | MonitorDemoScene,
): boolean {
  return scene !== 'readonly' && scene !== 'forbidden'
}

export function canViewContact(scene: PeopleDemoScene): boolean {
  return scene === 'default' || scene === 'empty' || scene === 'error'
}
