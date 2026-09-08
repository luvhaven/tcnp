import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(
    { available: Boolean(process.env.TOMTOM_API_KEY?.trim()) },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
