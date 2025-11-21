/**
 * OpenSky Network API Integration
 * Documentation: https://opensky-network.org/apidoc/
 */

export interface FlightState {
  icao24: string
  callsign: string | null
  origin_country: string
  time_position: number | null
  last_contact: number
  longitude: number | null
  latitude: number | null
  baro_altitude: number | null
  on_ground: boolean
  velocity: number | null
  true_track: number | null
  vertical_rate: number | null
  sensors: number[] | null
  geo_altitude: number | null
  squawk: string | null
  spi: boolean
  position_source: number
}

export interface OpenSkyResponse {
  time: number
  states: FlightState[] | null
}

const OPENSKY_BASE_URL = 'https://opensky-network.org/api'

/**
 * Get all flights currently in the air
 */
export async function getAllFlights(): Promise<OpenSkyResponse> {
  try {
    const response = await fetch(`${OPENSKY_BASE_URL}/states/all`)
    
    if (!response.ok) {
      throw new Error(`OpenSky API error: ${response.status}`)
    }
    
    const data = await response.json()
    return data
  } catch (error) {
    console.error('❌ Error fetching flights:', error)
    throw error
  }
}

/**
 * Get flight by ICAO24 address (unique aircraft identifier)
 */
export async function getFlightByIcao24(icao24: string): Promise<FlightState | null> {
  try {
    const response = await fetch(`${OPENSKY_BASE_URL}/states/all?icao24=${icao24}`)
    
    if (!response.ok) {
      throw new Error(`OpenSky API error: ${response.status}`)
    }
    
    const data: OpenSkyResponse = await response.json()
    
    if (!data.states || data.states.length === 0) {
      return null
    }
    
    return parseFlightState(data.states[0])
  } catch (error) {
    console.error('❌ Error fetching flight by ICAO24:', error)
    throw error
  }
}

/**
 * Search flights by callsign
 */
export async function searchFlightsByCallsign(callsign: string): Promise<FlightState[]> {
  try {
    const response = await fetch(`${OPENSKY_BASE_URL}/states/all`)
    
    if (!response.ok) {
      throw new Error(`OpenSky API error: ${response.status}`)
    }
    
    const data: OpenSkyResponse = await response.json()
    
    if (!data.states) {
      return []
    }
    
    // Filter by callsign (case-insensitive, partial match)
    const searchTerm = callsign.toLowerCase().trim()
    const matchingFlights = data.states
      .filter(state => state.callsign?.toLowerCase().trim().includes(searchTerm))
      .map(parseFlightState)
    
    return matchingFlights
  } catch (error) {
    console.error('❌ Error searching flights:', error)
    throw error
  }
}

/**
 * Get flights in a bounding box
 */
export async function getFlightsInBounds(
  latMin: number,
  lonMin: number,
  latMax: number,
  lonMax: number
): Promise<FlightState[]> {
  try {
    const url = `${OPENSKY_BASE_URL}/states/all?lamin=${latMin}&lomin=${lonMin}&lamax=${latMax}&lomax=${lonMax}`
    const response = await fetch(url)
    
    if (!response.ok) {
      throw new Error(`OpenSky API error: ${response.status}`)
    }
    
    const data: OpenSkyResponse = await response.json()
    
    if (!data.states) {
      return []
    }
    
    return data.states.map(parseFlightState)
  } catch (error) {
    console.error('❌ Error fetching flights in bounds:', error)
    throw error
  }
}

/**
 * Parse raw flight state array into typed object
 */
function parseFlightState(state: any): FlightState {
  return {
    icao24: state[0],
    callsign: state[1],
    origin_country: state[2],
    time_position: state[3],
    last_contact: state[4],
    longitude: state[5],
    latitude: state[6],
    baro_altitude: state[7],
    on_ground: state[8],
    velocity: state[9],
    true_track: state[10],
    vertical_rate: state[11],
    sensors: state[12],
    geo_altitude: state[13],
    squawk: state[14],
    spi: state[15],
    position_source: state[16]
  }
}

/**
 * Convert meters/second to knots
 */
export function metersPerSecondToKnots(mps: number | null): number | null {
  if (mps === null) return null
  return Math.round(mps * 1.94384)
}

/**
 * Convert meters to feet
 */
export function metersToFeet(meters: number | null): number | null {
  if (meters === null) return null
  return Math.round(meters * 3.28084)
}

/**
 * Format last contact time as "X minutes ago"
 */
export function formatLastContact(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000)
  const secondsAgo = now - timestamp
  
  if (secondsAgo < 60) {
    return `${secondsAgo}s ago`
  }
  
  const minutesAgo = Math.floor(secondsAgo / 60)
  if (minutesAgo < 60) {
    return `${minutesAgo}m ago`
  }
  
  const hoursAgo = Math.floor(minutesAgo / 60)
  return `${hoursAgo}h ago`
}

/**
 * Store flight data in Supabase
 */
export async function storeFlightData(supabase: any, flight: FlightState) {
  try {
    const { error } = await supabase
      .from('flight_tracking')
      .upsert({
        flight_id: flight.callsign || flight.icao24,
        icao24: flight.icao24,
        callsign: flight.callsign,
        origin_country: flight.origin_country,
        latitude: flight.latitude,
        longitude: flight.longitude,
        altitude: flight.baro_altitude,
        velocity: flight.velocity,
        heading: flight.true_track,
        vertical_rate: flight.vertical_rate,
        on_ground: flight.on_ground,
        last_contact: new Date(flight.last_contact * 1000).toISOString(),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'flight_id'
      })

    if (error) {
      console.error('❌ Error storing flight data:', error)
      throw error
    }

    console.log('✅ Flight data stored:', flight.callsign || flight.icao24)
  } catch (error) {
    console.error('❌ Error in storeFlightData:', error)
    throw error
  }
}
