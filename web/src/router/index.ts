import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/login/index.vue'),
      meta: { title: '登录' },
    },
    {
      path: '/',
      component: () => import('@/layout/index.vue'),
      redirect: '/home',
      children: [
        {
          path: 'home',
          name: 'home',
          component: () => import('@/views/home/index.vue'),
          meta: { title: '工作台' },
        },
        {
          path: 'health-monitor/real-time',
          name: 'real-time-monitor',
          component: () => import('@/modules/monitor/RealTimeMonitorPage.vue'),
          meta: { title: '实时监控' },
        },
        {
          path: 'health-monitor/duty-roster',
          name: 'duty-roster',
          component: () => import('@/modules/duty-roster/DutyRosterPage.vue'),
          meta: { title: '值班名单' },
        },
        {
          path: 'health-monitor/employee-archive',
          name: 'employee-archive',
          component: () => import('@/modules/people/PeopleArchivePage.vue'),
          meta: { title: '人员档案' },
        },
        {
          path: 'health-monitor/employee-profile',
          name: 'employee-profile',
          component: () => import('@/modules/profile/EmployeeProfilePage.vue'),
          meta: { title: '职工健康画像' },
        },
        {
          path: 'admin/device-list',
          name: 'device-list',
          component: () => import('@/modules/devices/DeviceListPage.vue'),
          meta: { title: '设备管理' },
        },
        {
          path: 'health-monitor/warnings',
          name: 'warning-records',
          component: () => import('@/modules/warning-records/WarningRecordsPage.vue'),
          meta: { title: '预警记录' },
        },
        {
          path: 'alert-management/notifications',
          name: 'incident-todo',
          component: () => import('@/modules/incident-todo/IncidentTodoPage.vue'),
          meta: { title: '待办事件' },
        },
        {
          path: 'health-monitor/body-360',
          name: 'body-360',
          redirect: (to) => ({
            path: '/health-monitor/body-360-immersive',
            query: to.query,
            hash: to.hash,
          }),
        },
        {
          path: 'health-monitor/body-360-immersive',
          name: 'body-360-immersive',
          component: () => import('@/modules/human-body/Body360ImmersivePage.vue'),
          meta: { title: '沉浸人体', fill: true },
        },
        {
          path: 'mine/map',
          name: 'mine-map',
          component: () => import('@/modules/mine-map/MineMapPage.vue'),
          meta: { title: '井下态势', fill: true },
        },
      ],
    },
  ],
})

export default router
