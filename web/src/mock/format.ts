import { getTestClock } from './session'

export function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '--'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
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
  return `${pick('year')}-${pick('month')}-${pick('day')} ${pick('hour')}:${pick('minute')}:${pick('second')}`
}

export function formatClockTime(iso: string | null | undefined): string {
  const text = formatDateTime(iso)
  if (text === '--') return text
  return text.slice(11)
}

export interface SlaView {
  text: string
  overdue: boolean
  remainingMinutes: number | null
}

export function formatSla(dueAt: string | null | undefined, clock = getTestClock()): SlaView {
  if (!dueAt) {
    return { text: '未设置', overdue: false, remainingMinutes: null }
  }
  const due = new Date(dueAt).getTime()
  if (Number.isNaN(due)) {
    return { text: '未设置', overdue: false, remainingMinutes: null }
  }
  const diffMinutes = Math.floor((due - clock.getTime()) / 60000)
  if (diffMinutes < 0) {
    const overdue = Math.abs(diffMinutes)
    const hours = Math.floor(overdue / 60)
    const minutes = overdue % 60
    const text = hours > 0 ? `已超时 ${hours}小时${minutes}分钟` : `已超时 ${minutes}分钟`
    return { text, overdue: true, remainingMinutes: diffMinutes }
  }
  if (diffMinutes === 0) {
    return { text: '不足 1 分钟', overdue: false, remainingMinutes: 0 }
  }
  const hours = Math.floor(diffMinutes / 60)
  const minutes = diffMinutes % 60
  const text = hours > 0 ? `剩余 ${hours}小时${minutes}分钟` : `剩余 ${minutes}分钟`
  return { text, overdue: false, remainingMinutes: diffMinutes }
}

export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '--'
  const digits = phone.replace(/\s+/g, '')
  if (digits.length < 7) return '****'
  return `${digits.slice(0, 3)}****${digits.slice(-4)}`
}

export function displayPhone(phone: string | null | undefined, canView: boolean): string {
  if (!phone) return '--'
  return canView ? phone : maskPhone(phone)
}

export function evidenceSummary(items: { metricLabel: string; value: number | string | null; unit: string }[]): string {
  const first = items[0]
  if (!first) return '无测量证据'
  if (first.value === null || first.value === '') return `${first.metricLabel} 缺失`
  return `${first.metricLabel} ${first.value} ${first.unit}`.trim()
}

export function wait(ms = 220): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}
