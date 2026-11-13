import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { canDownloadOfficerStatusReport } from '@/lib/officer-status-access'
import { createOfficerStatusWorkbook, officerReportDate, type ReportOfficer } from '@/lib/officer-status-workbook'

const CACHE_HEADERS = { 'Cache-Control': 'private, no-store' }
const PAGE_SIZE = 500
const REPORT_FIELDS = 'id, full_name, email, created_at, role, oscar, team, is_active, activation_status, photo_url, phone, date_of_birth, gender, city, local_government_area, state, nearest_bus_stop_landmark, bio'

function reportError(error: string, status: number) {
  return Response.json({ error }, { status, headers: CACHE_HEADERS })
}

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return reportError('Sign in to download the officer status report.', 401)

    const { data: caller, error: callerError } = await supabase.from('users')
      .select('role, activation_status, is_active')
      .eq('id', user.id)
      .maybeSingle()

    if (callerError) throw callerError
    if (!caller || caller.activation_status !== 'active' || caller.is_active === false) {
      return reportError('Only active admins and executives can download this report.', 403)
    }
    if (!canDownloadOfficerStatusReport(caller.role)) {
      const { data: grant, error: grantError } = await supabase.from('users')
        .select('has_admin_access')
        .eq('id', user.id)
        .maybeSingle()
        .overrideTypes<{ has_admin_access: boolean | null } | null, { merge: false }>()
      // Older installations have role-based access only.
      if (grantError && grantError.code !== '42703' && grantError.code !== 'PGRST204') throw grantError
      if (!canDownloadOfficerStatusReport(caller.role, grant?.has_admin_access === true)) {
        return reportError('Only active admins and executives can download this report.', 403)
      }
    }

    const admin = createAdminClient()
    const officers: ReportOfficer[] = []
    let cursor: string | undefined
    while (true) {
      const page = admin.from('users').select(REPORT_FIELDS)
        .eq('is_directory_hidden', false)
        .order('id', { ascending: true })
        .limit(PAGE_SIZE)
      if (cursor) page.gt('id', cursor)
      const { data, error } = await page
      if (error) throw error
      officers.push(...data)
      if (data.length < PAGE_SIZE) break
      cursor = data[data.length - 1].id
    }

    const generatedAt = new Date()
    const logo = await readFile(join(process.cwd(), 'public', 'tcnp_logo.png'))
    const workbook = createOfficerStatusWorkbook(officers, generatedAt, logo)
    return new Response(new Uint8Array(workbook), {
      headers: {
        ...CACHE_HEADERS,
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="TCNP_Officer_Status_' + officerReportDate(generatedAt) + '.xlsx"',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    console.error('Unable to generate officer status report')
    return reportError('Could not generate the officer status report. Try again.', 500)
  }
}
