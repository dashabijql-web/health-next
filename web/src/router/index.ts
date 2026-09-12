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
