import { ref } from 'vue'
import { defineStore } from 'pinia'
import { getInfo, login, logout } from '@/api/auth'
import { getToken, removeToken, setToken } from '@/utils/auth'

export const useUserStore = defineStore('user', () => {
  const token = ref(getToken() ?? '')
  const name = ref('')
  const roles = ref<string[]>([])

  async function loginByPassword(username: string, password: string) {
    const result = await login({ username: username.trim(), password })
    const nextToken = result.data?.token
    if (!nextToken) {
      throw new Error('登录成功但未返回 Token')
    }
    token.value = nextToken
    setToken(nextToken)
  }

  async function fetchUserInfo() {
    const result = await getInfo()
    const data = result.data
    if (!data) {
      throw new Error('获取用户信息失败')
    }
    name.value = data.name ?? ''
    roles.value = data.roles ?? []
    return data
  }

  async function logoutUser() {
    try {
      await logout()
    } finally {
      resetToken()
    }
  }

  function resetToken() {
    token.value = ''
    name.value = ''
    roles.value = []
    removeToken()
  }

  return {
    token,
    name,
    roles,
    login: loginByPassword,
    getInfo: fetchUserInfo,
    logout: logoutUser,
    resetToken,
  }
})
