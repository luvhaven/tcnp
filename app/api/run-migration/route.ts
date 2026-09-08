import { NextResponse } from 'next/server'

// Retired endpoint: schema changes are performed by versioned migrations.
export async function GET() {
  return NextResponse.json({ error: 'This maintenance endpoint has been retired.' }, { status: 410 })
}
