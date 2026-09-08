import { NextResponse } from 'next/server'

// Cache responses for 60 seconds to respect OpenSky rate limits and improve performance
export const revalidate = 60

const OPENSKY_BASE_URL = 'https://opensky-network.org/api'

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const icao24 = searchParams.get('icao24')
    const callsign = searchParams.get('callsign')
    const bounds = searchParams.get('bounds') // lamin,lomin,lamax,lomax
    if (icao24 && !/^[a-f0-9]{6}$/i.test(icao24)) return NextResponse.json({ error: 'Invalid aircraft address.' }, { status: 400 })
    if (callsign && !/^[a-z0-9\s]{2,12}$/i.test(callsign)) return NextResponse.json({ error: 'Invalid callsign.' }, { status: 400 })
    if (bounds) {
        const coordinates = bounds.split(',').map(Number)
        if (coordinates.length !== 4 || coordinates.some(value => !Number.isFinite(value)) ||
            Math.abs(coordinates[0]) > 90 || Math.abs(coordinates[2]) > 90 ||
            Math.abs(coordinates[1]) > 180 || Math.abs(coordinates[3]) > 180 ||
            coordinates[0] >= coordinates[2] || coordinates[1] >= coordinates[3]) {
            return NextResponse.json({ error: 'Invalid map bounds.' }, { status: 400 })
        }
    }

    try {
        let apiUrl = `${OPENSKY_BASE_URL}/states/all`

        if (icao24) {
            apiUrl += `?icao24=${icao24}`
        } else if (bounds) {
            const [lamin, lomin, lamax, lomax] = bounds.split(',')
            apiUrl += `?lamin=${lamin}&lomin=${lomin}&lamax=${lamax}&lomax=${lomax}`
        }

        // Next.js will cache this fetch on the server side for 60 seconds
        const response = await fetch(apiUrl, {
            headers: {
                // Required by OpenSky to identify traffic, anonymous is fine but custom is better
                'User-Agent': 'TCNP-Journey-Management/1.0'
            },
            next: { revalidate: 60 },
            signal: AbortSignal.timeout(10000)
        })

        if (!response.ok) {
            console.warn(`OpenSky API error (Route Handler): ${response.status} - ${response.statusText}`)
            return NextResponse.json(
                { error: `OpenSky API error: ${response.status}`, states: null },
                { status: response.status }
            )
        }

        const data = await response.json()

        // If client requested a specific callsign, we filter it server-side to avoid sending 30MB of data
        if (callsign && data.states) {
            const searchTerm = callsign.toLowerCase().trim()
            const matchingStates = data.states.filter((state: any[]) =>
                state[1] !== null && state[1].toLowerCase().replace(/\s/g, '') === searchTerm.replace(/\s/g, '')
            )
            return NextResponse.json({
                time: data.time,
                states: matchingStates
            })
        }

        return NextResponse.json(data)
    } catch (error) {
        console.error('Failed to fetch from OpenSky:', error)
        return NextResponse.json(
            { error: 'Failed to fetch flight data', states: null },
            { status: 500 }
        )
    }
}
