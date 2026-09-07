import request from '@/utils/request'

export interface LoginPayload {
  username: string
  password: string
}

export interface UserProfile {
  token?: string
  name: string
  username?: string
  avatar?: string
  roles: string[]
  routes: string[]
  buttons: string[]
}

export function login(data: LoginPayload) {
  return request<UserProfile>({
    url: '/auth/login',
    method: 'post',
    data,
  })
}

export function getInfo() {
  return request<UserProfile>({
    url: '/auth/info',
    method: 'get',
  })
}

export function logout() {
  return request<void>({
    url: '/auth/logout',
    method: 'post',
  })
}
