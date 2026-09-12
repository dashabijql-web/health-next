import type { MockApiErrorBody, MockErrorCode } from './types'

const HTTP_STATUS: Record<MockErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  VALIDATION: 400,
  UNAVAILABLE: 503,
}

export class MockApiError extends Error implements MockApiErrorBody {
  code: MockErrorCode
  httpStatus: number
  requestId: string
  field?: string

  constructor(init: Omit<MockApiErrorBody, 'httpStatus'> & { httpStatus?: number }) {
    super(init.message)
    this.name = 'MockApiError'
    this.code = init.code
    this.httpStatus = init.httpStatus ?? HTTP_STATUS[init.code]
    this.requestId = init.requestId
    this.field = init.field
  }
}

export function isMockApiError(error: unknown): error is MockApiError {
  return error instanceof MockApiError
}

export function newRequestId(code: MockErrorCode | 'OK' = 'OK'): string {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase()
  return `HN-MOCK-${code}-${rand}`
}
