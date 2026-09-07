import axios from 'axios'
import type { AxiosRequestConfig } from 'axios'
import { ElMessage } from 'element-plus'
import { getToken } from '@/utils/auth'

export interface ApiResult<T = unknown> {
  code: number
  message: string
  data: T
}

const service = axios.create({
  baseURL: import.meta.env.VITE_BASE_API || '/dev-api',
  timeout: 20000,
})

service.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    config.headers.satoken = token
  }
  return config
})

export default async function request<T>(config: AxiosRequestConfig): Promise<ApiResult<T>> {
  try {
    const response = await service.request<ApiResult<T>>(config)
    const result = response.data
    if (result && typeof result.code === 'number' && result.code !== 200) {
      ElMessage.error(result.message || '请求失败')
      throw new Error(result.message || '请求失败')
    }
    return result
  } catch (error) {
    if (axios.isAxiosError(error)) {
      ElMessage.error(error.message || '网络错误')
    }
    throw error
  }
}
