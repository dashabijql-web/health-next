import { isWithinLookbackWindow, ONLINE_WINDOW_MS } from './devices'
import { INDICATOR_STATE_LABELS, INDICATOR_STATE_RANK, METRIC_LABELS } from './labels'
import { getTestClock, TEST_CLOCK_ISO } from './session'
import type { IndicatorState, IndicatorView, MetricKey, RawMetricReading } from './types'

/** 体征新鲜度窗口：5 分钟，含等于 5:00 边界。 */
export const FRESHNESS_WINDOW_MS = 5 * 60 * 1000
export const ONLINE_WINDOW_MINUTES = 15
export const FRESHNESS_WINDOW_MINUTES = 5
export const MONITOR_REFRESH_MS = 30 * 1000

export const METRIC_KEYS: MetricKey[] = [
  'heartRate',
  'bloodPressure',
  'bloodOxygen',
  'temperature',
  'pressure',
]

/**
 * 演示阈值，非正式健康规则，也不是后台已发布配置。
 * 心率/血氧/血压边界与现有 mock 事件口径一致：心率持续高于 100、血氧持续低于 95、
 * 收缩压 ≥ 140 或舒张压 ≥ 90。
 */
export const DEMO_THRESHOLDS = {
  source: '演示阈值，非正式健康规则，未连接真实后台配置',
  heartRate: { min: 50, max: 100, unit: 'bpm', note: '演示：50–100 bpm 为正常，高于 100 或低于 50 为异常' },
  bloodOxygen: { min: 95, max: 100, unit: '%', note: '演示：≥ 95% 为正常，低于 95% 为异常' },
  bloodPressure: {
    systolicMax: 140,
    diastolicMax: 90,
    unit: 'mmHg',
    note: '演示：收缩压 ≥ 140 或舒张压 ≥ 90 为异常',
  },
  temperature: { min: 36, max: 37.5, unit: '°C', note: '演示：36.0–37.5 °C 为正常' },
  pressure: { min: 0, max: 70, unit: '', note: '演示：设备压力指数 0–70 为正常，不表示情绪或医学诊断' },
} as const

export function emptyIndicator(key: MetricKey, reason = '无数据'): IndicatorView {
  return {
    key,
    label: METRIC_LABELS[key],
    value: null,
    display: '无数据',
    unit: unitFor(key),
    measuredAt: null,
    state: 'no_data',
    stateLabel: INDICATOR_STATE_LABELS.no_data,
    reason,
  }
}

function unitFor(key: MetricKey): string {
  if (key === 'heartRate') return DEMO_THRESHOLDS.heartRate.unit
  if (key === 'bloodOxygen') return DEMO_THRESHOLDS.bloodOxygen.unit
  if (key === 'bloodPressure') return DEMO_THRESHOLDS.bloodPressure.unit
  if (key === 'temperature') return DEMO_THRESHOLDS.temperature.unit
  return DEMO_THRESHOLDS.pressure.unit
}

export function parseBloodPressure(value: number | string | null): { systolic: number; diastolic: number } | null {
  if (typeof value !== 'string') return null
  const match = value.trim().match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/)
  if (!match) return null
  const systolic = Number(match[1])
  const diastolic = Number(match[2])
  if (Number.isNaN(systolic) || Number.isNaN(diastolic)) return null
  return { systolic, diastolic }
}

export function isOnlineAt(lastOnlineAt: string | null | undefined, clock = getTestClock()): boolean {
  return isWithinLookbackWindow(lastOnlineAt, ONLINE_WINDOW_MS, clock)
}

export function isFreshAt(measuredAt: string | null | undefined, clock = getTestClock()): boolean {
  return isWithinLookbackWindow(measuredAt, FRESHNESS_WINDOW_MS, clock)
}

export function isFutureAt(atIso: string | null | undefined, clock = getTestClock()): boolean {
  if (!atIso) return false
  const at = new Date(atIso).getTime()
  if (Number.isNaN(at)) return false
  return at > clock.getTime()
}

function outOfThreshold(key: MetricKey, value: number | string | null): string | null {
  if (value === null || value === undefined || value === '') return '数值缺失'
  if (key === 'bloodPressure') {
    const bp = parseBloodPressure(value)
    if (!bp) return '血压格式无效'
    if (bp.systolic >= DEMO_THRESHOLDS.bloodPressure.systolicMax || bp.diastolic >= DEMO_THRESHOLDS.bloodPressure.diastolicMax) {
      return `${METRIC_LABELS.bloodPressure} ${value} ${DEMO_THRESHOLDS.bloodPressure.unit}，达到演示阈值（收缩压 ≥ ${DEMO_THRESHOLDS.bloodPressure.systolicMax} 或舒张压 ≥ ${DEMO_THRESHOLDS.bloodPressure.diastolicMax}）`
    }
    return null
  }
  const numeric = typeof value === 'number' ? value : Number(value)
  if (Number.isNaN(numeric)) return `${METRIC_LABELS[key]}数值无效`
  if (key === 'heartRate') {
    if (numeric > DEMO_THRESHOLDS.heartRate.max || numeric < DEMO_THRESHOLDS.heartRate.min) {
      return `${METRIC_LABELS.heartRate} ${numeric} ${DEMO_THRESHOLDS.heartRate.unit}，超出演示范围 ${DEMO_THRESHOLDS.heartRate.min}–${DEMO_THRESHOLDS.heartRate.max}`
    }
    return null
  }
  if (key === 'bloodOxygen') {
    if (numeric < DEMO_THRESHOLDS.bloodOxygen.min) {
      return `${METRIC_LABELS.bloodOxygen} ${numeric}${DEMO_THRESHOLDS.bloodOxygen.unit}，低于演示下限 ${DEMO_THRESHOLDS.bloodOxygen.min}%`
    }
    return null
  }
  if (key === 'temperature') {
    if (numeric < DEMO_THRESHOLDS.temperature.min || numeric > DEMO_THRESHOLDS.temperature.max) {
      return `${METRIC_LABELS.temperature} ${numeric} ${DEMO_THRESHOLDS.temperature.unit}，超出演示范围 ${DEMO_THRESHOLDS.temperature.min}–${DEMO_THRESHOLDS.temperature.max}`
    }
    return null
  }
  if (numeric > DEMO_THRESHOLDS.pressure.max || numeric < DEMO_THRESHOLDS.pressure.min) {
    return `${METRIC_LABELS.pressure} ${numeric}，超出演示范围 ${DEMO_THRESHOLDS.pressure.min}–${DEMO_THRESHOLDS.pressure.max}`
  }
  return null
}

function formatDisplay(key: MetricKey, value: number | string | null, unit: string): string {
  if (value === null || value === undefined || value === '') return '无数据'
  if (key === 'bloodPressure') return `${value} ${unit}`.trim()
  if (key === 'bloodOxygen') return `${value}${unit}`
  if (unit) return `${value} ${unit}`
  return String(value)
}

/**
 * 单指标状态：
 * - valid=false 或 value 为 null → no_data（0 且 valid=true 不是无数据）
 * - 缺少采集时间 → stale（不能用页面刷新时间冒充采集时间）
 * - 采集时间晚于测试时钟 → stale / 时间异常，不计正常或当前异常
 * - 采集时间超过 5 分钟 → stale（即使数值超限，实时口径也不再算当前异常）
 * - 新鲜且超限 → warning
 * - 新鲜且在演示范围内 → normal
 */
export function computeIndicatorState(
  key: MetricKey,
  reading: RawMetricReading | null | undefined,
  clock = getTestClock(),
): IndicatorView {
  if (!reading || reading.value === null || reading.value === undefined || reading.value === '') {
    return emptyIndicator(key, reading?.invalidReason || '无数据')
  }
  if (!reading.valid) {
    return {
      ...emptyIndicator(key, reading.invalidReason || '读数无效，不按正常或 0 值处理'),
      value: reading.value,
      measuredAt: reading.measuredAt,
      display: '无效',
    }
  }

  const unit = reading.unit || unitFor(key)
  const display = formatDisplay(key, reading.value, unit)
  const thresholdReason = outOfThreshold(key, reading.value)

  if (!reading.measuredAt) {
    return {
      key,
      label: METRIC_LABELS[key],
      value: reading.value,
      display,
      unit,
      measuredAt: null,
      state: 'stale',
      stateLabel: INDICATOR_STATE_LABELS.stale,
      reason: `${METRIC_LABELS[key]}缺少采集时间，无法判断新鲜度，不把页面刷新时间当作采集时间`,
    }
  }

  const measuredAtMs = new Date(reading.measuredAt).getTime()
  if (Number.isNaN(measuredAtMs)) {
    return {
      key,
      label: METRIC_LABELS[key],
      value: reading.value,
      display,
      unit,
      measuredAt: reading.measuredAt,
      state: 'stale',
      stateLabel: INDICATOR_STATE_LABELS.stale,
      reason: `${METRIC_LABELS[key]}采集时间无效`,
    }
  }

  if (isFutureAt(reading.measuredAt, clock)) {
    return {
      key,
      label: METRIC_LABELS[key],
      value: reading.value,
      display,
      unit,
      measuredAt: reading.measuredAt,
      state: 'stale',
      stateLabel: '时间异常',
      reason: `${METRIC_LABELS[key]}采集时间晚于测试时钟，时间异常，不能作为当前正常或异常体征，未用页面刷新时间修补`,
    }
  }

  if (!isFreshAt(reading.measuredAt, clock)) {
    const extra = thresholdReason ? `；上次读数${thresholdReason}` : ''
    return {
      key,
      label: METRIC_LABELS[key],
      value: reading.value,
      display,
      unit,
      measuredAt: reading.measuredAt,
      state: 'stale',
      stateLabel: INDICATOR_STATE_LABELS.stale,
      reason: `${METRIC_LABELS[key]}采集时间已超过 ${FRESHNESS_WINDOW_MINUTES} 分钟新鲜度窗口${extra}`,
    }
  }

  if (thresholdReason) {
    return {
      key,
      label: METRIC_LABELS[key],
      value: reading.value,
      display,
      unit,
      measuredAt: reading.measuredAt,
      state: 'warning',
      stateLabel: INDICATOR_STATE_LABELS.warning,
      reason: thresholdReason,
    }
  }

  return {
    key,
    label: METRIC_LABELS[key],
    value: reading.value,
    display,
    unit,
    measuredAt: reading.measuredAt,
    state: 'normal',
    stateLabel: INDICATOR_STATE_LABELS.normal,
    reason: null,
  }
}

export function computeIndicatorMap(
  metrics: Partial<Record<MetricKey, RawMetricReading>> | null | undefined,
  clock = getTestClock(),
): Record<MetricKey, IndicatorView> {
  const result = {} as Record<MetricKey, IndicatorView>
  for (const key of METRIC_KEYS) {
    result[key] = computeIndicatorState(key, metrics?.[key], clock)
  }
  return result
}

export function indicatorStatesOf(indicators: Record<MetricKey, IndicatorView>): Record<MetricKey, IndicatorState> {
  const result = {} as Record<MetricKey, IndicatorState>
  for (const key of METRIC_KEYS) result[key] = indicators[key].state
  return result
}

/**
 * 总体状态优先级：warning > stale > normal > no_data。
 * 部分指标缺失时，已有正常读数仍为 normal；全部无数据才是 no_data。
 */
export function computeOverallStatus(states: Record<MetricKey, IndicatorState>): IndicatorState {
  let best: IndicatorState | null = null
  for (const key of METRIC_KEYS) {
    const state = states[key]
    if (!best || INDICATOR_STATE_RANK[state] > INDICATOR_STATE_RANK[best]) best = state
  }
  return best ?? 'no_data'
}

export function collectWarningReasons(indicators: Record<MetricKey, IndicatorView>, overall: IndicatorState): string[] {
  const reasons: string[] = []
  for (const key of METRIC_KEYS) {
    const item = indicators[key]
    if (item.state === 'warning' && item.reason) reasons.push(item.reason)
  }
  if (overall === 'warning') return reasons
  for (const key of METRIC_KEYS) {
    const item = indicators[key]
    if (item.state === 'stale' && item.reason) reasons.push(item.reason)
  }
  if (overall === 'stale') return reasons
  if (overall === 'no_data') {
    const missing = METRIC_KEYS.filter((key) => indicators[key].state === 'no_data').map((key) => METRIC_LABELS[key])
    return [`全部指标无有效新鲜读数：${missing.join('、')}`]
  }
  return reasons
}

export interface HealthStatusCheck {
  name: string
  ok: boolean
  detail: string
}

function check(name: string, ok: boolean, detail: string): HealthStatusCheck {
  return { name, ok, detail }
}

function reading(partial: Partial<RawMetricReading> & Pick<RawMetricReading, 'value'>): RawMetricReading {
  return {
    unit: '',
    measuredAt: TEST_CLOCK_ISO,
    valid: true,
    ...partial,
  }
}

/** 数据层自检：新鲜度/在线边界、0/null/无效、混合状态优先级。页面只呈现这些结果。 */
export function runHealthStatusSelfCheck(clock = new Date(TEST_CLOCK_ISO)): HealthStatusCheck[] {
  const exactFresh = '2026-09-12T15:55:00+08:00'
  const staleByOneSecond = '2026-09-12T15:54:59+08:00'
  const exactOnline = '2026-09-12T15:45:00+08:00'
  const offlineByOneSecond = '2026-09-12T15:44:59+08:00'
  const futureAt = '2026-09-13T09:00:00+08:00'
  const hrFuture = computeIndicatorState('heartRate', reading({ value: 126, unit: 'bpm', measuredAt: futureAt }), clock)
  const fresh = (value: number | string, extra: Partial<RawMetricReading> = {}) =>
    reading({ value, measuredAt: '2026-09-12T15:58:00+08:00', ...extra })

  const hrFresh = computeIndicatorState('heartRate', fresh(72), clock)
  const hrZero = computeIndicatorState('heartRate', fresh(0), clock)
  const hrNull = computeIndicatorState('heartRate', null, clock)
  const hrInvalidZero = computeIndicatorState(
    'heartRate',
    reading({ value: 0, valid: false, invalidReason: '未佩戴占位', measuredAt: '2026-09-12T15:58:00+08:00' }),
    clock,
  )
  const hrExactFresh = computeIndicatorState('heartRate', reading({ value: 72, unit: 'bpm', measuredAt: exactFresh }), clock)
  const hrStaleBoundary = computeIndicatorState(
    'heartRate',
    reading({ value: 72, unit: 'bpm', measuredAt: staleByOneSecond }),
    clock,
  )
  const hrNoTime = computeIndicatorState('heartRate', reading({ value: 80, measuredAt: null }), clock)
  const hrHigh = computeIndicatorState('heartRate', fresh(101), clock)
  const hrMax = computeIndicatorState('heartRate', fresh(100), clock)
  const spo2Min = computeIndicatorState('bloodOxygen', fresh(95), clock)
  const spo2Low = computeIndicatorState('bloodOxygen', fresh(94), clock)
  const bpWarn = computeIndicatorState('bloodPressure', fresh('140/90'), clock)
  const bpOk = computeIndicatorState('bloodPressure', fresh('139/89'), clock)

  const mixedWarn = computeOverallStatus({
    heartRate: 'warning',
    bloodPressure: 'stale',
    bloodOxygen: 'no_data',
    temperature: 'normal',
    pressure: 'normal',
  })
  const mixedStale = computeOverallStatus({
    heartRate: 'stale',
    bloodPressure: 'no_data',
    bloodOxygen: 'no_data',
    temperature: 'normal',
    pressure: 'no_data',
  })
  const mixedNormal = computeOverallStatus({
    heartRate: 'normal',
    bloodPressure: 'no_data',
    bloodOxygen: 'normal',
    temperature: 'no_data',
    pressure: 'no_data',
  })
  const allMissing = computeOverallStatus({
    heartRate: 'no_data',
    bloodPressure: 'no_data',
    bloodOxygen: 'no_data',
    temperature: 'no_data',
    pressure: 'no_data',
  })

  return [
    check('fresh-inclusive-5min', hrExactFresh.state === 'normal', `15:55:00 → ${hrExactFresh.state}`),
    check('stale-after-5min', hrStaleBoundary.state === 'stale', `15:54:59 → ${hrStaleBoundary.state}`),
    check('online-inclusive-15min', isOnlineAt(exactOnline, clock) === true, `15:45:00 online=${isOnlineAt(exactOnline, clock)}`),
    check('offline-after-15min', isOnlineAt(offlineByOneSecond, clock) === false, `15:44:59 online=${isOnlineAt(offlineByOneSecond, clock)}`),
    check('clock-equal-is-online', isOnlineAt(TEST_CLOCK_ISO, clock) === true, 'age 0 online'),
    check('clock-equal-is-fresh', computeIndicatorState('heartRate', reading({ value: 72, measuredAt: TEST_CLOCK_ISO }), clock).state === 'normal', 'age 0 fresh'),
    check('future-comm-not-online', isOnlineAt(futureAt, clock) === false, `next-day online=${isOnlineAt(futureAt, clock)}`),
    check('future-reading-not-warning', hrFuture.state !== 'warning' && hrFuture.state !== 'normal', `future 126 → ${hrFuture.state}/${hrFuture.stateLabel}`),
    check('future-reading-time-anomaly', hrFuture.stateLabel === '时间异常' && (hrFuture.reason || '').includes('时间异常'), hrFuture.reason || ''),
    check('future-keeps-measured-at', hrFuture.measuredAt === futureAt, String(hrFuture.measuredAt)),
    check('zero-valid-is-warning', hrZero.state === 'warning', `HR 0 → ${hrZero.state}`),
    check('null-is-no-data', hrNull.state === 'no_data', `HR null → ${hrNull.state}`),
    check('invalid-zero-is-no-data', hrInvalidZero.state === 'no_data', `HR invalid 0 → ${hrInvalidZero.state}`),
    check('missing-measured-at-is-stale', hrNoTime.state === 'stale', `no time → ${hrNoTime.state}`),
    check('hr-100-normal', hrMax.state === 'normal', `HR 100 → ${hrMax.state}`),
    check('hr-101-warning', hrHigh.state === 'warning', `HR 101 → ${hrHigh.state}`),
    check('spo2-95-normal', spo2Min.state === 'normal', `SpO2 95 → ${spo2Min.state}`),
    check('spo2-94-warning', spo2Low.state === 'warning', `SpO2 94 → ${spo2Low.state}`),
    check('bp-140-90-warning', bpWarn.state === 'warning', `140/90 → ${bpWarn.state}`),
    check('bp-139-89-normal', bpOk.state === 'normal', `139/89 → ${bpOk.state}`),
    check('mix-warning-beats-stale', mixedWarn === 'warning', `mixed → ${mixedWarn}`),
    check('mix-stale-beats-no-data', mixedStale === 'stale', `mixed → ${mixedStale}`),
    check('mix-normal-with-missing', mixedNormal === 'normal', `mixed → ${mixedNormal}`),
    check('all-missing-no-data', allMissing === 'no_data', `all → ${allMissing}`),
    check('fresh-normal-hr', hrFresh.state === 'normal', `HR 72 → ${hrFresh.state}`),
    check('refresh-does-not-change-measured-at', hrStaleBoundary.measuredAt === staleByOneSecond, String(hrStaleBoundary.measuredAt)),
  ]
}

export const HEALTH_STATUS_SELF_CHECK = runHealthStatusSelfCheck()

if (typeof window !== 'undefined') {
  ;(window as Window & { __hnRunHealthStatusSelfCheck?: typeof runHealthStatusSelfCheck }).__hnRunHealthStatusSelfCheck =
    runHealthStatusSelfCheck
}
