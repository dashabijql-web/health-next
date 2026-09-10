/**
 * 值班名单 · 本地演示数据
 * 严格按照指定字段结构定义，无需后端与数据库
 */

export interface DutyWorkerItem {
  empCode: string // 工号
  empName: string // 姓名
  team: string // 班组（字符串）
  jobName: string // 工种（表上可以不显示，但数据里留着）
  imei: string | null // 手表号，没有则 null
  heartRate: number | null // 心率 bpm
  bloodOxygen: number | null // 血氧 %
  systolic: number | null // 收缩压 mmHg
  diastolic: number | null // 舒张压 mmHg
  temperature: number | null // 体温 ℃
  pressure: number | null // 压力指数
  status: 'normal' | 'warning' | 'stale' | 'no_data' // 状态
  collectedAt: string // 采集时间字符串，无数据可空
}

// 核心人员（与 360° 人体 demoWorkers 对齐）
const CORE_WORKERS: DutyWorkerItem[] = [
  {
    empCode: '005875008',
    empName: '张伟',
    team: '采掘一队',
    jobName: '采煤机司机',
    imei: '869234051029808',
    heartRate: 78,
    bloodOxygen: 98,
    systolic: 124,
    diastolic: 82,
    temperature: 36.6,
    pressure: 28,
    status: 'normal',
    collectedAt: '15:58:12',
  },
  {
    empCode: '005875012',
    empName: '李建国',
    team: '综采二队',
    jobName: '支架检修工',
    imei: '869234051029812',
    heartRate: 126,
    bloodOxygen: 96,
    systolic: 136,
    diastolic: 88,
    temperature: 37.2,
    pressure: 64,
    status: 'warning',
    collectedAt: '15:56:45',
  },
  {
    empCode: '005875019',
    empName: '赵铁柱',
    team: '掘进三队',
    jobName: '掘进机司机',
    imei: '869234051029819',
    heartRate: 84,
    bloodOxygen: 97,
    systolic: 120,
    diastolic: 80,
    temperature: 36.7,
    pressure: 35,
    status: 'stale',
    collectedAt: '14:20:10 (超1小时)',
  },
  {
    empCode: '005875034',
    empName: '王强',
    team: '通风防尘区',
    jobName: '瓦斯测定员',
    imei: null,
    heartRate: null,
    bloodOxygen: null,
    systolic: null,
    diastolic: null,
    temperature: null,
    pressure: null,
    status: 'no_data',
    collectedAt: '',
  },
]

// 11 位其余异常人员（合计 12 位异常）
const WARNING_WORKERS: DutyWorkerItem[] = [
  {
    empCode: '005875023',
    empName: '刘德华',
    team: '采掘一队',
    jobName: '采煤机司机',
    imei: '869234051029823',
    heartRate: 132,
    bloodOxygen: 97,
    systolic: 142,
    diastolic: 92,
    temperature: 37.1,
    pressure: 72,
    status: 'warning',
    collectedAt: '15:55:18',
  },
  {
    empCode: '005875031',
    empName: '陈国强',
    team: '掘进三队',
    jobName: '掘进机司机',
    imei: '869234051029831',
    heartRate: 118,
    bloodOxygen: 93,
    systolic: 138,
    diastolic: 86,
    temperature: 36.9,
    pressure: 68,
    status: 'warning',
    collectedAt: '15:54:02',
  },
  {
    empCode: '005875045',
    empName: '孙永胜',
    team: '机电运输队',
    jobName: '井下电工',
    imei: '869234051029845',
    heartRate: 104,
    bloodOxygen: 98,
    systolic: 162,
    diastolic: 102,
    temperature: 36.8,
    pressure: 75,
    status: 'warning',
    collectedAt: '15:57:30',
  },
  {
    empCode: '005875052',
    empName: '郭少峰',
    team: '采掘一队',
    jobName: '采煤机司机',
    imei: '869234051029852',
    heartRate: 122,
    bloodOxygen: 95,
    systolic: 144,
    diastolic: 90,
    temperature: 37.6,
    pressure: 80,
    status: 'warning',
    collectedAt: '15:53:14',
  },
  {
    empCode: '005875061',
    empName: '郑洪海',
    team: '通风防尘区',
    jobName: '瓦斯测定员',
    imei: '869234051029861',
    heartRate: 112,
    bloodOxygen: 92,
    systolic: 130,
    diastolic: 84,
    temperature: 36.7,
    pressure: 60,
    status: 'warning',
    collectedAt: '15:52:40',
  },
  {
    empCode: '005875073',
    empName: '陆建华',
    team: '安全巡检队',
    jobName: '安全监测工',
    imei: '869234051029873',
    heartRate: 128,
    bloodOxygen: 96,
    systolic: 148,
    diastolic: 94,
    temperature: 37.4,
    pressure: 78,
    status: 'warning',
    collectedAt: '15:58:05',
  },
  {
    empCode: '005875084',
    empName: '冯世杰',
    team: '综采二队',
    jobName: '支架检修工',
    imei: '869234051029884',
    heartRate: 52,
    bloodOxygen: 97,
    systolic: 108,
    diastolic: 68,
    temperature: 36.4,
    pressure: 45,
    status: 'warning',
    collectedAt: '15:51:22',
  },
  {
    empCode: '005875095',
    empName: '韩立明',
    team: '掘进三队',
    jobName: '锚杆支护工',
    imei: '869234051029895',
    heartRate: 135,
    bloodOxygen: 94,
    systolic: 150,
    diastolic: 96,
    temperature: 37.8,
    pressure: 82,
    status: 'warning',
    collectedAt: '15:56:10',
  },
  {
    empCode: '005875102',
    empName: '曹广义',
    team: '地质防治水队',
    jobName: '探放水钻工',
    imei: '869234051029902',
    heartRate: 120,
    bloodOxygen: 95,
    systolic: 140,
    diastolic: 88,
    temperature: 37.3,
    pressure: 69,
    status: 'warning',
    collectedAt: '15:55:50',
  },
  {
    empCode: '005875111',
    empName: '彭小军',
    team: '机电运输队',
    jobName: '皮带巡检工',
    imei: '869234051029911',
    heartRate: 124,
    bloodOxygen: 96,
    systolic: 146,
    diastolic: 92,
    temperature: 36.9,
    pressure: 74,
    status: 'warning',
    collectedAt: '15:50:33',
  },
  {
    empCode: '005875118',
    empName: '薛志远',
    team: '采掘一队',
    jobName: '采煤机司机',
    imei: '869234051029918',
    heartRate: 116,
    bloodOxygen: 93,
    systolic: 134,
    diastolic: 86,
    temperature: 37.5,
    pressure: 71,
    status: 'warning',
    collectedAt: '15:53:55',
  },
]

// 8 位其余陈旧人员（合计 9 位陈旧）
const STALE_WORKERS: DutyWorkerItem[] = [
  {
    empCode: '005875027',
    empName: '魏向阳',
    team: '综采二队',
    jobName: '综采检修工',
    imei: '869234051029827',
    heartRate: 76,
    bloodOxygen: 98,
    systolic: 122,
    diastolic: 82,
    temperature: 36.5,
    pressure: 30,
    status: 'stale',
    collectedAt: '15:22:15',
  },
  {
    empCode: '005875039',
    empName: '董文斌',
    team: '采掘一队',
    jobName: '采煤机司机',
    imei: '869234051029839',
    heartRate: 80,
    bloodOxygen: 97,
    systolic: 118,
    diastolic: 78,
    temperature: 36.6,
    pressure: 38,
    status: 'stale',
    collectedAt: '15:18:40',
  },
  {
    empCode: '005875048',
    empName: '梁大山',
    team: '通风防尘区',
    jobName: '通风工',
    imei: '869234051029848',
    heartRate: 82,
    bloodOxygen: 96,
    systolic: 124,
    diastolic: 80,
    temperature: 36.7,
    pressure: 42,
    status: 'stale',
    collectedAt: '15:10:05',
  },
  {
    empCode: '005875058',
    empName: '范春雷',
    team: '安全巡检队',
    jobName: '安全监测工',
    imei: '869234051029858',
    heartRate: 74,
    bloodOxygen: 98,
    systolic: 120,
    diastolic: 76,
    temperature: 36.4,
    pressure: 26,
    status: 'stale',
    collectedAt: '15:15:30',
  },
  {
    empCode: '005875069',
    empName: '金宝生',
    team: '掘进三队',
    jobName: '掘进机司机',
    imei: '869234051029869',
    heartRate: 88,
    bloodOxygen: 97,
    systolic: 126,
    diastolic: 82,
    temperature: 36.8,
    pressure: 40,
    status: 'stale',
    collectedAt: '15:08:22',
  },
  {
    empCode: '005875080',
    empName: '邱继先',
    team: '机电运输队',
    jobName: '井下电工',
    imei: '869234051029880',
    heartRate: 79,
    bloodOxygen: 97,
    systolic: 122,
    diastolic: 80,
    temperature: 36.5,
    pressure: 33,
    status: 'stale',
    collectedAt: '15:20:45',
  },
  {
    empCode: '005875091',
    empName: '贺明远',
    team: '地质防治水队',
    jobName: '探放水钻工',
    imei: '869234051029891',
    heartRate: 85,
    bloodOxygen: 96,
    systolic: 125,
    diastolic: 82,
    temperature: 36.6,
    pressure: 37,
    status: 'stale',
    collectedAt: '15:12:18',
  },
  {
    empCode: '005875107',
    empName: '丁万年',
    team: '综采二队',
    jobName: '井下电工',
    imei: '869234051029907',
    heartRate: 72,
    bloodOxygen: 98,
    systolic: 116,
    diastolic: 76,
    temperature: 36.3,
    pressure: 25,
    status: 'stale',
    collectedAt: '15:05:50',
  },
]

// 6 位其余无数据人员（合计 7 位无数据）
const NO_DATA_WORKERS: DutyWorkerItem[] = [
  {
    empCode: '005875042',
    empName: '卢天顺',
    team: '采掘一队',
    jobName: '采煤机司机',
    imei: null,
    heartRate: null,
    bloodOxygen: null,
    systolic: null,
    diastolic: null,
    temperature: null,
    pressure: null,
    status: 'no_data',
    collectedAt: '',
  },
  {
    empCode: '005875065',
    empName: '康振邦',
    team: '综采二队',
    jobName: '支架检修工',
    imei: null,
    heartRate: null,
    bloodOxygen: null,
    systolic: null,
    diastolic: null,
    temperature: null,
    pressure: null,
    status: 'no_data',
    collectedAt: '',
  },
  {
    empCode: '005875078',
    empName: '谭志忠',
    team: '机电运输队',
    jobName: '胶轮车司机',
    imei: null,
    heartRate: null,
    bloodOxygen: null,
    systolic: null,
    diastolic: null,
    temperature: null,
    pressure: null,
    status: 'no_data',
    collectedAt: '',
  },
  {
    empCode: '005875088',
    empName: '熊宝庆',
    team: '掘进三队',
    jobName: '锚杆支护工',
    imei: null,
    heartRate: null,
    bloodOxygen: null,
    systolic: null,
    diastolic: null,
    temperature: null,
    pressure: null,
    status: 'no_data',
    collectedAt: '',
  },
  {
    empCode: '005875105',
    empName: '邹长青',
    team: '安全巡检队',
    jobName: '安全监测工',
    imei: null,
    heartRate: null,
    bloodOxygen: null,
    systolic: null,
    diastolic: null,
    temperature: null,
    pressure: null,
    status: 'no_data',
    collectedAt: '',
  },
  {
    empCode: '005875115',
    empName: '秦培元',
    team: '地质防治水队',
    jobName: '探放水钻工',
    imei: null,
    heartRate: null,
    bloodOxygen: null,
    systolic: null,
    diastolic: null,
    temperature: null,
    pressure: null,
    status: 'no_data',
    collectedAt: '',
  },
]

// 91 位其余正常人员（合计 92 位正常，总名单 120 人）
const SURNAMES = [
  '赵', '钱', '孙', '李', '周', '吴', '郑', '王', '冯', '陈', '褚', '卫', '蒋', '沈', '韩', '杨',
  '朱', '秦', '尤', '许', '何', '吕', '施', '张', '孔', '曹', '严', '华', '金', '魏', '陶', '姜',
  '戚', '谢', '邹', '喻', '柏', '水', '窦', '章', '云', '苏', '潘', '葛', '奚', '范', '彭', '郎',
]
const GIVEN_NAMES = [
  '浩然', '志明', '树人', '文博', '建新', '国柱', '继海', '春雨', '富贵', '全胜', '铁锤', '小松',
  '海波', '庆功', '立言', '保民', '振宇', '少华', '志刚', '延安', '长胜', '玉峰', '顺昌', '培明',
  '万祥', '成林', '德生', '青松', '东海', '朝晖', '天柱', '洪斌', '金堂', '广成', '运来', '兆发',
  '敬轩', '文斌', '学文', '继光', '铁桥', '春林', '有才', '广军', '文治', '家骏', '建民', '云生',
]

const TEAMS = [
  '采掘一队',
  '综采二队',
  '掘进三队',
  '通风防尘区',
  '机电运输队',
  '安全巡检队',
  '地质防治水队',
]

const JOBS = [
  '采煤机司机',
  '支架检修工',
  '掘进机司机',
  '瓦斯测定员',
  '井下电工',
  '皮带巡检工',
  '通风工',
  '安全监测工',
  '探放水钻工',
  '胶轮车司机',
  '锚杆支护工',
]

function generateNormalWorkers(count = 91): DutyWorkerItem[] {
  const workers: DutyWorkerItem[] = []
  for (let i = 1; i <= count; i += 1) {
    const codeNum = 200 + i
    const empCode = `005875${String(codeNum).padStart(3, '0')}`
    const sName = SURNAMES[(i * 7 + 3) % SURNAMES.length]
    const gName = GIVEN_NAMES[(i * 11 + 5) % GIVEN_NAMES.length]
    const team = TEAMS[(i + 2) % TEAMS.length]
    const jobName = JOBS[(i * 3 + 1) % JOBS.length]

    // 95% 有手表，个别无手表
    const hasWatch = i % 18 !== 0
    const imei = hasWatch ? `8692340510${String(3000 + i).padStart(5, '0')}` : null

    // 正常体征数据（在健康参考区间平稳浮动）
    const heartRate = 65 + ((i * 3) % 24) // 65 ~ 88 bpm
    const bloodOxygen = 97 + (i % 3) // 97 ~ 99 %
    const systolic = 114 + ((i * 2) % 15) // 114 ~ 128 mmHg
    const diastolic = 72 + (i % 12) // 72 ~ 83 mmHg
    const temperature = Number((36.3 + (i % 6) * 0.1).toFixed(1)) // 36.3 ~ 36.8 ℃
    const pressure = 18 + ((i * 4) % 25) // 18 ~ 42

    const mm = String(50 + (i % 9)).padStart(2, '0')
    const ss = String((i * 13) % 60).padStart(2, '0')
    const collectedAt = `15:${mm}:${ss}`

    workers.push({
      empCode,
      empName: `${sName}${gName}`,
      team,
      jobName,
      imei,
      heartRate,
      bloodOxygen,
      systolic,
      diastolic,
      temperature,
      pressure,
      status: 'normal',
      collectedAt,
    })
  }
  return workers
}

// 汇总 120 人完整值班名单
export const MOCK_DUTY_WORKERS: DutyWorkerItem[] = [
  ...CORE_WORKERS, // 4 人（张伟-正常, 李建国-异常, 赵铁柱-陈旧, 王强-无数据）
  ...WARNING_WORKERS, // 11 人异常（合计 12 人异常）
  ...STALE_WORKERS, // 8 人陈旧（合计 9 人陈旧）
  ...NO_DATA_WORKERS, // 6 人无数据（合计 7 人无数据）
  ...generateNormalWorkers(91), // 91 人正常（合计 92 人正常）
]

// 汇总固定指标胶囊数（全量统计基准，与 120 条数据严格对齐）
export const DUTY_SUMMARY_STATS = {
  totalMonitored: 120, // 在册被测总数
  online: 104, // 在线 104 人 (normal 92 + warning 12，最近 15 分钟内上报活跃)
  warning: 12, // 当前异常 12 人
  stale: 9, // 数据陈旧 9 人
  noData: 7, // 无有效体征 7 人
}
