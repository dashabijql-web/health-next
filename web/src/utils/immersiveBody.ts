export const IMMERSIVE_BODY_PATH = '/health-monitor/body-360-immersive'

export function immersiveBodyLocation(empCode: string, empName?: string | null) {
  const query: Record<string, string> = { empCode }
  if (empName) query.empName = empName
  return { path: IMMERSIVE_BODY_PATH, query }
}
