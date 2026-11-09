import { isExecutiveRole } from '@/lib/utils'

export function canDownloadOfficerStatusReport(role: string | null, hasAdminAccess = false) {
  return hasAdminAccess || role === 'admin' || role === 'dev_admin' || role === 'super_admin' || isExecutiveRole(role)
}
