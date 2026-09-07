import router from '@/router'
import { getToken } from '@/utils/auth'
import { useUserStore } from '@/stores/user'

const whiteList = ['/login']

router.beforeEach(async (to) => {
  const token = getToken()
  const userStore = useUserStore()

  if (token) {
    if (to.path === '/login') {
      return '/home'
    }
    if (userStore.roles.length > 0) {
      return true
    }
    try {
      await userStore.getInfo()
      return true
    } catch {
      userStore.resetToken()
      return '/login'
    }
  }

  if (whiteList.includes(to.path)) {
    return true
  }
  return `/login?redirect=${to.path}`
})
