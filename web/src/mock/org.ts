import type { AssigneeRef, Department, JobType } from './types'
import { CURRENT_OPERATOR } from './session'

export const DEPARTMENTS: Department[] = [
  { id: 'D-CJ1', name: '采掘一队' },
  { id: 'D-ZC2', name: '综采二队' },
  { id: 'D-JJ3', name: '掘进三队' },
  { id: 'D-TF', name: '通风防尘区' },
  { id: 'D-JD', name: '机电运输队' },
  { id: 'D-AQ', name: '安全巡检队' },
  { id: 'D-DZ', name: '地质防治水队' },
  { id: 'D-LONG', name: '综采工作面超长部门名称机电运输联合保障班' },
]

export const JOBS: JobType[] = [
  { id: 'J-CM', name: '采煤机司机' },
  { id: 'J-ZJ', name: '支架检修工' },
  { id: 'J-JJ', name: '掘进机司机' },
  { id: 'J-WS', name: '瓦斯测定员' },
  { id: 'J-DD', name: '井下电工' },
  { id: 'J-PD', name: '皮带巡检工' },
  { id: 'J-TF', name: '通风工' },
  { id: 'J-AQ', name: '安全监测工' },
  { id: 'J-TS', name: '探放水钻工' },
]

export const ASSIGNABLE_USERS: AssigneeRef[] = [
  { userId: CURRENT_OPERATOR.userId, name: CURRENT_OPERATOR.name },
  { userId: 'U-DUTY-01', name: '演示值班员甲' },
  { userId: 'U-DUTY-02', name: '演示值班员乙' },
  { userId: 'U-DUTY-03', name: '演示值班员丙' },
]

export function findDepartment(id: string): Department | undefined {
  return DEPARTMENTS.find((item) => item.id === id)
}

export function findJob(id: string): JobType | undefined {
  return JOBS.find((item) => item.id === id)
}

export function findAssignee(id: string): AssigneeRef | undefined {
  return ASSIGNABLE_USERS.find((item) => item.userId === id)
}
