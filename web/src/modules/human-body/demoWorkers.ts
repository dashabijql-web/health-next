/**
 * 演示名单 · 未接后端
 * 仅用于前端 360° 人体健康信号展示与多状态切换调试
 */

export interface TelemetryState {
  battery: number | null
  netty: 'online' | 'offline' | 'reconnecting'
  signal: '5G' | '4G' | 'weak' | 'none'
  wearing: 'confirmed' | 'unworn' | 'unknown'
}

export interface WorkerVitals {
  heartRate: number | null
  bloodOxygen: number | null
  bloodPressure: string | null
  temperature: number | null
  stress: number | null
}

export interface TrendPoint {
  time: string // 时刻 "13:00"
  heartRate: number
  systolic: number // 收缩压
  diastolic: number // 舒张压
  bloodOxygen: number
  temperature: number
  stress: number
}

export interface DemoWorker {
  id: string
  name: string
  team: string
  role: string
  freshnessStatus: 'fresh' | 'stale' | 'no_data'
  lastCollected: string
  telemetry: TelemetryState
  vitals: WorkerVitals
  trend: TrendPoint[]
}

// 辅助生成 6 小时内（间隔 15 分钟，共 25 个时间点）的拟真生理曲线
function generateTrendPoints(
  baseTime: string, // 结束时间 e.g. "16:00"
  generator: (stepIndex: number, total: number) => {
    heartRate: number
    systolic: number
    diastolic: number
    bloodOxygen: number
    temperature: number
    stress: number
  },
  count = 25,
): TrendPoint[] {
  const [endH, endM] = baseTime.split(':').map(Number)
  const totalMinutesEnd = endH * 60 + endM
  const points: TrendPoint[] = []

  for (let i = 0; i < count; i += 1) {
    const minOffset = (count - 1 - i) * 15
    const ptMinutes = totalMinutesEnd - minOffset
    const h = Math.floor(ptMinutes / 60) % 24
    const m = ptMinutes % 60
    const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    const val = generator(i, count)
    points.push({
      time: timeStr,
      heartRate: val.heartRate,
      systolic: val.systolic,
      diastolic: val.diastolic,
      bloodOxygen: val.bloodOxygen,
      temperature: Number(val.temperature.toFixed(1)),
      stress: val.stress,
    })
  }

  return points
}

// 张伟近 6 小时走势（正常平稳）
const zhangweiTrend = generateTrendPoints('16:00', (i, total) => {
  const phase = (i / total) * Math.PI * 2
  return {
    heartRate: Math.round(74 + Math.sin(phase) * 4 + (i % 3)),
    systolic: Math.round(122 + Math.sin(phase * 1.5) * 3),
    diastolic: Math.round(80 + Math.cos(phase) * 2),
    bloodOxygen: Math.min(99, Math.max(97, Math.round(98 + Math.sin(phase * 2) * 0.8))),
    temperature: 36.5 + Math.sin(phase * 0.8) * 0.2,
    stress: Math.round(26 + Math.sin(phase * 2.5) * 4),
  }
})
// 确保最新点与当前读数完全吻合
if (zhangweiTrend.length > 0) {
  const last = zhangweiTrend[zhangweiTrend.length - 1]
  last.heartRate = 78
  last.systolic = 124
  last.diastolic = 82
  last.bloodOxygen = 98
  last.temperature = 36.6
  last.stress = 28
}

// 李建国近 6 小时走势（负荷升高，心率突破 100 警戒线）
const lijianguoTrend = generateTrendPoints('16:00', (i, total) => {
  const progress = i / total
  return {
    heartRate: Math.round(86 + progress * 38 + Math.sin(i) * 3),
    systolic: Math.round(126 + progress * 10 + Math.sin(i * 1.2) * 2),
    diastolic: Math.round(82 + progress * 6 + Math.cos(i) * 2),
    bloodOxygen: Math.round(97 - progress * 1.5),
    temperature: 36.8 + progress * 0.4,
    stress: Math.round(42 + progress * 22),
  }
})
if (lijianguoTrend.length > 0) {
  const last = lijianguoTrend[lijianguoTrend.length - 1]
  last.heartRate = 126
  last.systolic = 136
  last.diastolic = 88
  last.bloodOxygen = 96
  last.temperature = 37.2
  last.stress = 64
}

// 赵铁柱近 6 小时走势（数据截至 14:20，后段中断陈旧）
const zhaotiezhuTrend = generateTrendPoints('14:20', (i) => ({
  heartRate: Math.round(80 + (i % 4) * 2),
  systolic: 120,
  diastolic: 80,
  bloodOxygen: 97,
  temperature: 36.7,
  stress: Math.round(33 + (i % 3)),
}), 16)
if (zhaotiezhuTrend.length > 0) {
  const last = zhaotiezhuTrend[zhaotiezhuTrend.length - 1]
  last.heartRate = 84
  last.systolic = 120
  last.diastolic = 80
  last.bloodOxygen = 97
  last.temperature = 36.7
  last.stress = 35
}

export const DEMO_WORKERS: DemoWorker[] = [
  {
    id: '005875008',
    name: '张伟',
    team: '采掘一队',
    role: '采煤机司机',
    freshnessStatus: 'fresh',
    lastCollected: '15:58:12',
    telemetry: {
      battery: 82,
      netty: 'online',
      signal: '5G',
      wearing: 'confirmed',
    },
    vitals: {
      heartRate: 78,
      bloodOxygen: 98,
      bloodPressure: '124/82',
      temperature: 36.6,
      stress: 28,
    },
    trend: zhangweiTrend,
  },
  {
    id: '005875012',
    name: '李建国',
    team: '综采二队',
    role: '支架检修工',
    freshnessStatus: 'fresh',
    lastCollected: '15:56:45',
    telemetry: {
      battery: 46,
      netty: 'online',
      signal: '4G',
      wearing: 'confirmed',
    },
    vitals: {
      heartRate: 126,
      bloodOxygen: 96,
      bloodPressure: '136/88',
      temperature: 37.2,
      stress: 64,
    },
    trend: lijianguoTrend,
  },
  {
    id: '005875019',
    name: '赵铁柱',
    team: '掘进三队',
    role: '掘进机司机',
    freshnessStatus: 'stale',
    lastCollected: '14:20:10 (超1小时)',
    telemetry: {
      battery: 18,
      netty: 'reconnecting',
      signal: 'weak',
      wearing: 'confirmed',
    },
    vitals: {
      heartRate: 84,
      bloodOxygen: 97,
      bloodPressure: '120/80',
      temperature: 36.7,
      stress: 35,
    },
    trend: zhaotiezhuTrend,
  },
  {
    id: '005875034',
    name: '王强',
    team: '通风防尘区',
    role: '瓦斯测定员',
    freshnessStatus: 'no_data',
    lastCollected: '暂无记录',
    telemetry: {
      battery: null,
      netty: 'offline',
      signal: 'none',
      wearing: 'unworn',
    },
    vitals: {
      heartRate: null,
      bloodOxygen: null,
      bloodPressure: null,
      temperature: null,
      stress: null,
    },
    trend: [], // 无数据人员严格为空态，不画假直线
  },
]
