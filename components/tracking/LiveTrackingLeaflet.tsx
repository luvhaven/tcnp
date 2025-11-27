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
}

export type LiveTrackingLeafletProps = {
  center: [number, number]
  locations: LiveTrackingLeafletLocation[]
  getUserStatus: (updatedAt: string) => { label: string; color: string }
  getRoleDisplay: (role?: string | null) => { label: string; color: string }
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

  const speedLine =
    location.speed !== null
      ? `<p style="font-size: 11px; color: #666; margin: 4px 0 0;">Speed: ${Math.round(
        location.speed * 3.6
      )} km/h</p>`
      : ''
  const batteryLine =
    location.battery_level !== null
      ? `<p style="font-size: 11px; color: #666; margin: 4px 0 0;">Battery: ${location.battery_level}%</p>`
      : ''

  return `
    <div style="min-width: 200px;">
      <p style="font-weight: 600; margin-bottom: 4px;">${name}</p>
      <p style="font-size: 12px; color: #444; margin: 0 0 8px;">${oscar}</p>
      <span style="display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 10px; font-weight: 600; color: #fff; background: ${roleDisplay.color}; margin-bottom: 6px;">
        ${roleLabel}
      </span>
      <span style="display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 10px; font-weight: 600; color: #fff; background: ${status.color};">
        ${statusLabel}
      </span>
      ${speedLine}
      ${batteryLine}
      <p style="font-size: 11px; color: #888; margin: 8px 0 0;">
        Updated: ${new Date(location.updated_at).toLocaleTimeString()}
      </p>
      <p style="font-size: 11px; color: #888; margin: 4px 0 0;">
        Lat: ${location.latitude.toFixed(5)}, Lng: ${location.longitude.toFixed(5)}
      </p>
    </div>
  `
}

export default function LiveTrackingLeaflet({ center, locations, getUserStatus, getRoleDisplay }: LiveTrackingLeafletProps) {
  const mapRef = useRef<L.Map | null>(null)
  const markersRef = useRef<Record<string, L.Marker>>({})
  const containerRef = useRef<HTMLDivElement>(null)
  const hasFitBoundsRef = useRef(false)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, {
      center,
      zoom: 12,
      preferCanvas: true,
    })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map)

    mapRef.current = map
  }, [center])

  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.setView(center, mapRef.current.getZoom() ?? 12)
    }
  }, [center])

  // Handle container resize
  useEffect(() => {
    if (!containerRef.current || !mapRef.current) return

    const resizeObserver = new ResizeObserver(() => {
      if (mapRef.current) {
        mapRef.current.invalidateSize()
      }
    })

    resizeObserver.observe(containerRef.current)

    return () => {
      resizeObserver.disconnect()
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const markers = markersRef.current
    // We'll store circles on the marker object itself or a separate ref. 
    // Let's use a separate property on the marker for simplicity if possible, 
    // or just a separate ref. A separate ref is cleaner.
    // However, to avoid complex ref management, let's attach the circle to the marker object 
    // if we can, or just maintain a parallel map.
    // Let's use a parallel map for circles.

    // Actually, let's just use a property on the marker instance to store the circle
    // to keep them coupled.

    // Remove markers that are no longer active
    Object.keys(markers).forEach((userId) => {
      if (!locations.find((loc) => loc.user_id === userId)) {
        const marker = markers[userId]
        if ((marker as any)._accuracyCircle) {
          (marker as any)._accuracyCircle.remove()
        }
        marker.remove()
        delete markers[userId]
      }
    })

    locations.forEach((location) => {
      const position: L.LatLngExpression = [location.latitude, location.longitude]
      const status = getUserStatus(location.updated_at)
      const roleDisplay = getRoleDisplay(location.role)
      const popupContent = buildPopupContent(location, status, roleDisplay)

      if (markers[location.user_id]) {
        const marker = markers[location.user_id]
        marker.setLatLng(position)
        marker.setPopupContent(popupContent)

        // Update circle
        if ((marker as any)._accuracyCircle) {
          (marker as any)._accuracyCircle.setLatLng(position);
          (marker as any)._accuracyCircle.setRadius(location.accuracy || 0);
        }
      } else {
        const marker = L.marker(position)
          .addTo(map)
          .bindPopup(popupContent)

        // Create accuracy circle
        // Only show if accuracy is available and reasonable (< 5000m)
        if (location.accuracy && location.accuracy > 0) {
          const circle = L.circle(position, {
            radius: location.accuracy,
            color: status.color,
            fillColor: status.color,
            fillOpacity: 0.15,
            weight: 1,
            opacity: 0.5
          }).addTo(map);
          (marker as any)._accuracyCircle = circle
        }

        markers[location.user_id] = marker
      }
    })

    if (locations.length > 0) {
      const bounds = L.latLngBounds(
        locations.map((loc) => [loc.latitude, loc.longitude] as L.LatLngExpression)
      )

      if (!hasFitBoundsRef.current) {
        map.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 })
        hasFitBoundsRef.current = true
      }
    }
  }, [locations, getUserStatus])

  useEffect(() => {
    return () => {
      Object.values(markersRef.current).forEach((marker) => {
        if ((marker as any)._accuracyCircle) {
          (marker as any)._accuracyCircle.remove()
        }
        marker.remove()
      })
      markersRef.current = {}

      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, [])

  return <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
}
