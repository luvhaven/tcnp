'use client'

import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

export type LiveTrackingLeafletLocation = {
  user_id: string
  full_name: string
  oscar: string
  role?: string | null
  latitude: number
  longitude: number
  accuracy: number
  speed: number | null
  battery_level: number | null
  updated_at: string
  papa_name?: string | null
}

export type LiveTrackingLeafletProps = {
  center: [number, number]
  locations: LiveTrackingLeafletLocation[]
  /** Route trails: map of user_id -> ordered [lat, lng] history points */
  trails?: Record<string, [number, number][]>
  getUserStatus: (updatedAt: string) => { label: string; color: string }
  getRoleDisplay: (role?: string | null) => { label: string; color: string }
  /** Show TomTom traffic flow overlay */
  showTraffic?: boolean
  /** TomTom API key — read from NEXT_PUBLIC_TOMTOM_API_KEY */
  tomtomKey?: string
}

delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

const escapeHtml = (value: string) =>
  value.replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  }[char] as string))

const buildPopupContent = (
  location: LiveTrackingLeafletLocation,
  status: { label: string; color: string },
  roleDisplay: { label: string; color: string }
) => {
  const name = escapeHtml(location.full_name)
  const oscar = escapeHtml(location.oscar || 'Unknown')
  const statusLabel = escapeHtml(status.label)
  const roleLabel = escapeHtml(roleDisplay.label)
  const papaName = location.papa_name ? escapeHtml(location.papa_name) : null
  const isDO = location.oscar?.toLowerCase().includes('do') || location.role === 'delta_oscar'
  const titleDisplay = (isDO && papaName) ? `${name} - Papa ${papaName}` : name
  const papaLine = (isDO && papaName)
    ? `<p style="font-size:11px;color:#2563EB;font-weight:600;margin:2px 0 6px">📋 Papa ${papaName}</p>`
    : ''

  const speedLine =
    location.speed !== null && location.speed !== undefined
      ? `<p style="font-size:11px;color:#666;margin:4px 0 0">🚗 Speed: ${Math.round(location.speed * 3.6)} km/h</p>`
      : `<p style="font-size:11px;color:#999;margin:4px 0 0">🚗 Speed: N/A</p>`

  let batteryLine = ''
  if (location.battery_level !== null && location.battery_level !== undefined) {
    const lvl = location.battery_level
    const col = lvl <= 20 ? '#EF4444' : lvl <= 50 ? '#F59E0B' : '#22C55E'
    batteryLine = `<p style="font-size:12px;font-weight:600;color:${col};margin:6px 0 0">🔋 Battery: ${lvl}%</p>`
  } else {
    batteryLine = `<p style="font-size:11px;color:#999;margin:6px 0 0">🔋 Battery: N/A</p>`
  }

  return `
    <div style="min-width:220px">
      <p style="font-weight:700;font-size:14px;margin-bottom:2px">${titleDisplay}</p>
      <p style="font-size:12px;color:#444;margin:0 0 4px">${oscar}</p>
      ${papaLine}
      <span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:10px;font-weight:600;color:#fff;background:${roleDisplay.color};margin-right:4px;margin-bottom:6px">${roleLabel}</span>
      <span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:10px;font-weight:600;color:#fff;background:${status.color}">${statusLabel}</span>
      ${batteryLine}
      ${speedLine}
      <p style="font-size:11px;color:#888;margin:8px 0 0">Updated: ${new Date(location.updated_at).toLocaleTimeString()}</p>
      <p style="font-size:10px;color:#999;margin:4px 0 0">📍 ${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}</p>
    </div>`
}

// Distinct trail colours for up to 8 simultaneous tracked users
const TRAIL_COLORS = ['#2563EB', '#16A34A', '#D97706', '#9333EA', '#DB2777', '#0891B2', '#DC2626', '#65A30D']

export default function LiveTrackingLeaflet({
  center,
  locations,
  trails,
  getUserStatus,
  getRoleDisplay,
  showTraffic = false,
  tomtomKey,
}: LiveTrackingLeafletProps) {
  const mapRef = useRef<L.Map | null>(null)
  const markersRef = useRef<Record<string, L.Marker>>({})
  const polylinesRef = useRef<Record<string, L.Polyline>>({})
  const trafficRef = useRef<L.TileLayer | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const hasFitBoundsRef = useRef(false)

  // ── Init map ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, { center, zoom: 12, preferCanvas: true })

    const style = document.createElement('style')
    style.innerHTML = `
      @keyframes pulse-red {
        0%   { box-shadow: 0 0 0 0   rgba(239,68,68,0.7); }
        70%  { box-shadow: 0 0 0 10px rgba(239,68,68,0);   }
        100% { box-shadow: 0 0 0 0   rgba(239,68,68,0);   }
      }`
    document.head.appendChild(style)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map)

    mapRef.current = map
  }, [center])

  // ── Traffic overlay (TomTom flow tiles) ──────────────────────────────────
  // Standard traffic colours shown by TomTom:
  //   Green  = free flow   | Yellow = moderate
  //   Orange = heavy       | Red    = very heavy / standstill
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (showTraffic && tomtomKey) {
      if (!trafficRef.current) {
        trafficRef.current = L.tileLayer(
          `https://api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key=${tomtomKey}`,
          { attribution: '© TomTom', maxZoom: 19, opacity: 0.75 }
        ).addTo(map)
      }
    } else {
      trafficRef.current?.remove()
      trafficRef.current = null
    }
  }, [showTraffic, tomtomKey])

  useEffect(() => {
    if (mapRef.current) mapRef.current.setView(center, mapRef.current.getZoom() ?? 12)
  }, [center])

  // ── Resize observer ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || !mapRef.current) return
    const ro = new ResizeObserver(() => mapRef.current?.invalidateSize())
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  // ── Route trails (polylines) ──────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const lines = polylinesRef.current

    // Remove stale lines
    Object.keys(lines).forEach((uid) => {
      if (!trails || !trails[uid] || trails[uid].length < 2) {
        lines[uid].remove()
        delete lines[uid]
      }
    })

    if (!trails) return

    Object.entries(trails).forEach(([uid, points], idx) => {
      if (points.length < 2) return
      const color = TRAIL_COLORS[idx % TRAIL_COLORS.length]
      const latlngs: L.LatLngExpression[] = points.map(([lat, lng]) => [lat, lng])

      if (lines[uid]) {
        lines[uid].setLatLngs(latlngs)
      } else {
        lines[uid] = L.polyline(latlngs, {
          color,
          weight: 3,
          opacity: 0.65,
          dashArray: '6,6',
          lineCap: 'round',
        }).addTo(map)
      }
    })
  }, [trails])

  // ── Markers ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const markers = markersRef.current

    Object.keys(markers).forEach((uid) => {
      if (!locations.find((l) => l.user_id === uid)) {
        markers[uid].remove()
        delete markers[uid]
      }
    })

    locations.forEach((location) => {
      const position: L.LatLngExpression = [location.latitude, location.longitude]
      const status = getUserStatus(location.updated_at)
      const minutesSince = (Date.now() - new Date(location.updated_at).getTime()) / 60000
      const isStale = minutesSince > 5
      const roleDisplay = getRoleDisplay(location.role)
      const popupContent = buildPopupContent(location, status, roleDisplay)

      // Use traditional tear-drop pin unless stale
      let icon: L.Icon | L.DivIcon = new L.Icon.Default()

      if (isStale) {
        icon = L.divIcon({
          className: 'custom-div-icon',
          html: `<div style="background:#ef4444;width:12px;height:12px;border-radius:50%;border:2px solid white;box-shadow:0 0 0 4px rgba(239,68,68,0.4);animation:pulse-red 1.5s infinite"></div>`,
          iconSize: [12, 12],
          iconAnchor: [6, 6],
          popupAnchor: [0, -6],
        })
      }

      if (markers[location.user_id]) {
        markers[location.user_id].setLatLng(position).setPopupContent(popupContent).setIcon(icon)
      } else {
        markers[location.user_id] = L.marker(position, { icon }).addTo(map).bindPopup(popupContent)
      }
    })

    if (locations.length > 0 && !hasFitBoundsRef.current) {
      const bounds = L.latLngBounds(locations.map((l) => [l.latitude, l.longitude] as L.LatLngExpression))
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 })
      hasFitBoundsRef.current = true
    }
  }, [locations, getUserStatus])

  // ── Cleanup ───────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      Object.values(markersRef.current).forEach((m) => m.remove())
      markersRef.current = {}
      Object.values(polylinesRef.current).forEach((l) => l.remove())
      polylinesRef.current = {}
      trafficRef.current?.remove()
      trafficRef.current = null
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [])

  return <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
}
