import { DEFAULT_PEOPLE } from './people'
import type { MetricKey, PersonRecord, RawMetricReading } from './types'

/** 逐指标原始读数。采集时间独立保存，不与页面刷新时间混淆。 */
export const SPECIAL_READINGS: Record<string, Partial<Record<MetricKey, RawMetricReading>>> = {
  'EMP-DEMO-001': {
    heartRate: { value: 126, unit: 'bpm', measuredAt: '2026-09-12T15:57:40+08:00', valid: true },
    bloodPressure: { value: '122/78', unit: 'mmHg', measuredAt: '2026-09-12T15:50:00+08:00', valid: true },
    bloodOxygen: { value: null, unit: '%', measuredAt: null, valid: true },
    temperature: { value: 36.6, unit: '°C', measuredAt: '2026-09-12T15:57:40+08:00', valid: true },
  },
  'EMP-DEMO-002': {
    heartRate: { value: 0, unit: 'bpm', measuredAt: '2026-09-12T12:40:00+08:00', valid: true },
  },
  'EMP-DEMO-003': {
    heartRate: { value: 76, unit: 'bpm', measuredAt: '2026-09-12T15:50:02+08:00', valid: true },
    bloodOxygen: { value: 91, unit: '%', measuredAt: '2026-09-12T14:48:05+08:00', valid: true },
    pressure: { value: 55, unit: '', measuredAt: '2026-09-12T15:49:00+08:00', valid: true },
  },
  'EMP-DEMO-004': {
    bloodPressure: { value: '128/82', unit: 'mmHg', measuredAt: '2026-09-12T15:36:10+08:00', valid: true },
  },
  'EMP-005875008': {
    heartRate: { value: 72, unit: 'bpm', measuredAt: '2026-09-12T15:58:12+08:00', valid: true },
    bloodPressure: { value: '118/76', unit: 'mmHg', measuredAt: '2026-09-12T15:58:12+08:00', valid: true },
    bloodOxygen: { value: 98, unit: '%', measuredAt: '2026-09-12T15:58:12+08:00', valid: true },
    temperature: { value: 36.5, unit: '°C', measuredAt: '2026-09-12T15:58:12+08:00', valid: true },
  },
  'EMP-005875012': {
    heartRate: { value: 108, unit: 'bpm', measuredAt: '2026-09-12T15:56:45+08:00', valid: true },
    bloodPressure: { value: '120/80', unit: 'mmHg', measuredAt: '2026-09-12T15:55:00+08:00', valid: true },
    bloodOxygen: { value: 97, unit: '%', measuredAt: '2026-09-12T15:54:59+08:00', valid: true },
    pressure: { value: 42, unit: '', measuredAt: '2026-09-12T15:56:45+08:00', valid: true },
  },
  'EMP-005875019': {
    bloodOxygen: {
      value: 0,
      unit: '%',
      measuredAt: '2026-09-12T14:20:10+08:00',
      valid: false,
      invalidReason: '未佩戴占位值，不能按血氧 0% 或正常处理',
    },
  },
  'EMP-005875034': {},
  'EMP-LONG': {
    heartRate: { value: 0, unit: 'bpm', measuredAt: '2026-09-12T14:11:11+08:00', valid: true },
    temperature: { value: 36.4, unit: '°C', measuredAt: '2026-09-12T14:11:11+08:00', valid: true },
  },
  'EMP-EMPTY-PHONE': {},
  'EMP-ONLINE-NODATA': {},
  'EMP-FUTURE-COMM': {
    heartRate: { value: 72, unit: 'bpm', measuredAt: '2026-09-13T09:00:00+08:00', valid: true },
  },
  'EMP-FUTURE-READ': {
    heartRate: { value: 126, unit: 'bpm', measuredAt: '2026-09-13T08:00:00+08:00', valid: true },
    bloodPressure: { value: '118/76', unit: 'mmHg', measuredAt: '2026-09-12T15:57:20+08:00', valid: true },
    bloodOxygen: { value: 97, unit: '%', measuredAt: '2026-09-12T15:57:20+08:00', valid: true },
  },
}

function generatedReadings(person: PersonRecord, index: number): Partial<Record<MetricKey, RawMetricReading>> {
  if (!person.deviceId || !person.lastHealthAt) return {}
  const at = person.lastHealthAt
  const hr = 62 + (index % 18)
  const sys = 110 + (index % 12)
  const dia = 70 + (index % 8)
  const spo2 = 96 + (index % 3)
  const usePressure = index % 3 === 2
  const missingBp = index % 4 === 1
  const metrics: Partial<Record<MetricKey, RawMetricReading>> = {
    heartRate: { value: hr, unit: 'bpm', measuredAt: at, valid: true },
    bloodOxygen: { value: spo2, unit: '%', measuredAt: at, valid: true },
  }
  if (!missingBp) {
    metrics.bloodPressure = { value: `${sys}/${dia}`, unit: 'mmHg', measuredAt: at, valid: true }
  }
  if (usePressure) {
    metrics.pressure = { value: 28 + (index % 20), unit: '', measuredAt: at, valid: true }
  } else {
    metrics.temperature = { value: Number((36.2 + (index % 5) * 0.1).toFixed(1)), unit: '°C', measuredAt: at, valid: true }
  }
  return metrics
}

export function rawReadingsFor(person: PersonRecord): Partial<Record<MetricKey, RawMetricReading>> {
  if (Object.prototype.hasOwnProperty.call(SPECIAL_READINGS, person.employeeId)) {
    return SPECIAL_READINGS[person.employeeId]
  }
  const index = DEFAULT_PEOPLE.findIndex((item) => item.employeeId === person.employeeId)
  return generatedReadings(person, index < 0 ? 0 : index)
}
