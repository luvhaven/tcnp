// Run with: node migrate.cjs
const { createClient } = require('./node_modules/@supabase/supabase-js/dist/main/index.js')

const url = 'https://swyvftqciilslyzfdoli.supabase.co'
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN3eXZmdHFjaWlsc2x5emZkb2xpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjE3MzA3NSwiZXhwIjoyMDc3NzQ5MDc1fQ.pI5fmnA3KobvKlGZKwraMn5cll3ETr2WFgEGVIPhMy4'

const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

async function run() {
  console.log('Applying journey_type migration...')

  // Try exec_sql RPC first
  const { data, error } = await sb.rpc('exec_sql', {
    sql: `ALTER TABLE journeys ADD COLUMN IF NOT EXISTS journey_type text NOT NULL DEFAULT 'airport_to_nest_to_theatre' CHECK (journey_type IN ('airport_to_nest_to_theatre','airport_to_theatre','self_arrival'))`
  })

  if (error) {
    console.error('RPC exec_sql failed (expected if not defined):', error.message)

    // Try direct management API
    const res = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ sql: `ALTER TABLE journeys ADD COLUMN IF NOT EXISTS journey_type text NOT NULL DEFAULT 'airport_to_nest_to_theatre' CHECK (journey_type IN ('airport_to_nest_to_theatre','airport_to_theatre','self_arrival'))` })
    })
    const text = await res.text()
    console.log('Direct REST result:', res.status, text)

    // Also check column existence
    const { data: cols, error: colErr } = await sb
      .from('information_schema.columns')
      .select('column_name')
      // @ts-ignore
      .eq('table_name', 'journeys')
      .eq('column_name', 'journey_type')
    console.log('Column check:', cols, colErr?.message)
  } else {
    console.log('Migration applied OK:', data)
  }
}

run().catch(e => { console.error(e); process.exit(1) })
