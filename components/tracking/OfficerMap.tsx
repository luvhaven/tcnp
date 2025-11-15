'use client'

import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Fix for default marker icons in Next.js
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
})

type OfficerLocation = {
  id: string
  user_id: string
  latitude: number
  longitude: number
  accuracy: number
  speed: number
  battery_level: number
  is_online: boolean
  timestamp: string
  users: {
    full_name: string
    oscar: string
    role: string
  }
}

type OfficerMapProps = {
  locations: OfficerLocation[]
  height?: string
}

export default function OfficerMap({ locations, height = '600px' }: OfficerMapProps) {
  const mapRef = useRef<L.Map | null>(null)
  const markersRef = useRef<{ [key: string]: L.Marker }>({})
  const mapContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!mapContainerRef.current || typeof window === 'undefined') return

    // Initialize map only once
    if (!mapRef.current) {
      // Default center (Nigeria - Lagos)
      const map = L.map(mapContainerRef.current).setView([6.5244, 3.3792], 12)

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map)

      mapRef.current = map
    }

    // Update markers
    if (mapRef.current && locations.length > 0) {
      // Remove old markers that are no longer in the locations array
      Object.keys(markersRef.current).forEach((userId) => {
        if (!locations.find(loc => loc.user_id === userId)) {
          markersRef.current[userId].remove()
          delete markersRef.current[userId]
        }
      })

      // Add or update markers
      locations.forEach((location) => {
        const position: L.LatLngExpression = [location.latitude, location.longitude]

        if (markersRef.current[location.user_id]) {
          // Update existing marker
          markersRef.current[location.user_id].setLatLng(position)
          markersRef.current[location.user_id].setPopupContent(
            createPopupContent(location)
          )
        } else {
          // Create new marker with custom icon based on role
          const officerIcon = L.divIcon({
            html: `
              <div style="
                background: ${location.is_online ? '#10B981' : '#6B7280'};
                width: 40px;
                height: 40px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                border: 3px solid white;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                position: relative;
              ">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                </svg>
                ${location.is_online ? `
                  <div style="
                    position: absolute;
                    top: -2px;
                    right: -2px;
                    width: 12px;
                    height: 12px;
                    background: #10B981;
                    border: 2px solid white;
                    border-radius: 50%;
                    animation: pulse 2s ease-in-out infinite;
                  "></div>
                ` : ''}
              </div>
            `,
            className: 'custom-officer-marker',
            iconSize: [40, 40],
            iconAnchor: [20, 20],
          })

          const marker = L.marker(position, { icon: officerIcon })
            .addTo(mapRef.current!)
            .bindPopup(createPopupContent(location))

          markersRef.current[location.user_id] = marker

          // Add accuracy circle
          if (location.accuracy) {
            L.circle(position, {
              radius: location.accuracy,
              color: location.is_online ? '#10B981' : '#6B7280',
              fillColor: location.is_online ? '#10B981' : '#6B7280',
              fillOpacity: 0.1,
              weight: 1,
            }).addTo(mapRef.current!)
          }
        }
      })

      // Fit bounds to show all markers
      if (locations.length > 0) {
        const bounds = L.latLngBounds(
          locations.map(loc => [loc.latitude, loc.longitude] as L.LatLngExpression)
        )
        mapRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 })
      }
    }

    return () => {
      // Cleanup on unmount
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, [locations])

  const createPopupContent = (location: OfficerLocation) => {
    const timeDiff = new Date().getTime() - new Date(location.timestamp).getTime()
    const minutesAgo = Math.floor(timeDiff / 60000)
    const timeText = minutesAgo < 1 ? 'Just now' : minutesAgo < 60 ? `${minutesAgo}m ago` : `${Math.floor(minutesAgo / 60)}h ago`

    return `
      <div style="min-width: 220px;">
        <div style="display: flex; align-items: center; margin-bottom: 8px;">
          <div style="
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background: ${location.is_online ? '#10B981' : '#6B7280'};
            margin-right: 8px;
          "></div>
          <h3 style="font-weight: bold; margin: 0; color: #8B5CF6;">
            ${location.users.full_name}
          </h3>
        </div>
        <p style="font-size: 12px; color: #666; margin-bottom: 4px;">
          ${location.users.oscar} • ${location.users.role.replace(/_/g, ' ').toUpperCase()}
        </p>
        <div style="border-top: 1px solid #e5e7eb; padding-top: 8px; margin-top: 8px;">
          ${location.speed > 0 ? `
            <p style="font-size: 11px; color: #888; margin-bottom: 4px;">
              🚗 Speed: ${Math.round(location.speed)} km/h
            </p>
          ` : ''}
          ${location.battery_level ? `
            <p style="font-size: 11px; color: #888; margin-bottom: 4px;">
              🔋 Battery: ${location.battery_level}%
            </p>
          ` : ''}
          <p style="font-size: 11px; color: #888; margin-bottom: 4px;">
            📍 Accuracy: ±${Math.round(location.accuracy)}m
          </p>
          <p style="font-size: 11px; color: #888; margin-bottom: 8px;">
            🕐 Updated: ${timeText}
          </p>
        </div>
        <p style="font-size: 10px; color: #999; margin-bottom: 8px;">
          ${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}
        </p>
        <a 
          href="https://www.google.com/maps?q=${location.latitude},${location.longitude}" 
          target="_blank"
          style="
            display: inline-block;
            padding: 6px 12px;
            background: #8B5CF6;
            color: white;
            text-decoration: none;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 500;
          "
        >
          Open in Google Maps
        </a>
      </div>
    `
  }

  return (
    <div 
      ref={mapContainerRef} 
      style={{ height, width: '100%', borderRadius: '8px', overflow: 'hidden' }}
      className="z-0"
    />
  )
}
