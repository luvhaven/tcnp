import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/security/rate-limit'

export const dynamic = 'force-dynamic'

type RouteContext = {
  params: Promise<{ z: string; x: string; y: string }>
}

const validTileCoordinate = (value: string) => /^\d+$/.test(value)

export async function GET(request: NextRequest, context: RouteContext) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in to view traffic.' }, { status: 401 })
  const { data: profile } = await supabase.from('users').select('activation_status, is_active').eq('id', user.id).single()
  if (!profile || profile.is_active === false || profile.activation_status !== 'active') return NextResponse.json({ error: 'Account is inactive.' }, { status: 403 })
  if (!checkRateLimit(request, 'traffic', 180, 60_000).success) return NextResponse.json({ error: 'Please wait before refreshing traffic.' }, { status: 429 })
  const apiKey = process.env.TOMTOM_API_KEY?.trim()
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Live traffic is not configured.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    )
  }

  const { z, x, y } = await context.params
  if (![z, x, y].every(validTileCoordinate)) {
    return NextResponse.json({ error: 'Invalid tile coordinates.' }, { status: 400 })
  }

  const zoom = Number(z)
  const tileX = Number(x)
  const tileY = Number(y)
  const limit = 2 ** zoom
  if (zoom < 0 || zoom > 22 || tileX < 0 || tileY < 0 || tileX >= limit || tileY >= limit) {
    return NextResponse.json({ error: 'Tile coordinates are out of range.' }, { status: 400 })
  }

  const style = request.nextUrl.searchParams.get('theme') === 'dark' ? 'relative0-dark' : 'relative0'
  const url = new URL(`https://api.tomtom.com/traffic/map/4/tile/flow/${style}/${z}/${x}/${y}.png`)
  url.searchParams.set('key', apiKey)

  try {
    const upstream = await fetch(url, {
      headers: { Accept: 'image/png' },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    })

    if (!upstream.ok || !upstream.body) {
      return NextResponse.json(
        { error: 'Traffic provider is temporarily unavailable.' },
        { status: upstream.status === 429 ? 429 : 502, headers: { 'Cache-Control': 'no-store' } }
      )
    }

    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'private, no-cache, no-store, max-age=0, must-revalidate',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return NextResponse.json(
      { error: 'Traffic provider request timed out.' },
      { status: 504, headers: { 'Cache-Control': 'no-store' } }
    )
  }
}
