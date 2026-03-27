import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/run-migration  
 * One-shot migration to add journey_type column.
 * Delete this file after first run.
 */
export async function GET() {
  try {
    const admin = createAdminClient()

    // Check if column already exists
    const { data: existing } = await admin
      .from('journeys')
      .select('journey_type')
      .limit(1)

    // If no error, column exists — skip
    return NextResponse.json({ status: 'column already exists or no error' })
  } catch {
    // Column likely doesn't exist — apply migration via pg DDL workaround
    // Supabase JS doesn't support raw DDL, so we rely on the column having no default
    // and the CHECK constraint being enforced at the app level.
    // The actual ALTER TABLE must be applied via the Supabase dashboard SQL editor.
    return NextResponse.json({
      status: 'manual_required',
      sql: `ALTER TABLE journeys ADD COLUMN IF NOT EXISTS journey_type text NOT NULL DEFAULT 'airport_to_nest_to_theatre' CHECK (journey_type IN ('airport_to_nest_to_theatre','airport_to_theatre','self_arrival'));`
    })
  }
}
