import { NextResponse } from 'next/server'

// Cache for 10 minutes — IP-based location doesn't change frequently
export const revalidate = 600

export async function GET(request: Request) {
    // Forward the real client IP so ipapi.co resolves the requester, not the server
    const forwarded = request.headers.get('x-forwarded-for')
    const ip = forwarded ? forwarded.split(',')[0].trim() : ''

    try {
        const url = ip ? `https://ipapi.co/${ip}/json/` : 'https://ipapi.co/json/'
        const res = await fetch(url, {
            headers: { 'User-Agent': 'TCNP-Journey-Management/1.0' },
            next: { revalidate: 600 }
        })

        if (!res.ok) {
            return NextResponse.json({ error: 'GeoIP lookup failed' }, { status: res.status })
        }

        const data = await res.json()

        // Only surface the fields we actually need
        return NextResponse.json({
            latitude: data.latitude ?? null,
            longitude: data.longitude ?? null,
            city: data.city ?? null,
            country: data.country_name ?? null,
        })
    } catch (err) {
        console.error('GeoIP proxy error:', err)
        return NextResponse.json({ error: 'Failed to resolve IP location' }, { status: 500 })
    }
}
