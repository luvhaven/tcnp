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

type VehicleLocation = {
  id: string
  cheetah_id: string
  latitude: number
  longitude: number
  speed: number
  heading: number
  cheetahs: {
    call_sign: string
    registration_number: string
  }
  users: {
    full_name: string
    oscar: string
  } | null
}

type CheetahMapProps = {
  locations: VehicleLocation[]
  height?: string
}

export default function CheetahMap({ locations, height = '600px' }: CheetahMapProps) {
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
      Object.keys(markersRef.current).forEach((cheetahId) => {
        if (!locations.find(loc => loc.cheetah_id === cheetahId)) {
          markersRef.current[cheetahId].remove()
          delete markersRef.current[cheetahId]
        }
      })

      // Add or update markers
      locations.forEach((location) => {
        const position: L.LatLngExpression = [location.latitude, location.longitude]

        if (markersRef.current[location.cheetah_id]) {
          // Update existing marker
          markersRef.current[location.cheetah_id].setLatLng(position)
          markersRef.current[location.cheetah_id].setPopupContent(
            createPopupContent(location)
          )
        } else {
          // Create new marker with custom icon
          const carIcon = L.divIcon({
            html: `
              <div style="
                background: #8B5CF6;
                width: 32px;
                height: 32px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                border: 3px solid white;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                transform: rotate(${location.heading}deg);
              ">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                  <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/>
                </svg>
              </div>
            `,
            className: 'custom-car-marker',
            iconSize: [32, 32],
            iconAnchor: [16, 16],
          })

          const marker = L.marker(position, { icon: carIcon })
            .addTo(mapRef.current!)
            .bindPopup(createPopupContent(location))

          markersRef.current[location.cheetah_id] = marker
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

  const createPopupContent = (location: VehicleLocation) => {
    return `
      <div style="min-width: 200px;">
        <h3 style="font-weight: bold; margin-bottom: 8px; color: #8B5CF6;">
          ${location.cheetahs.call_sign}
        </h3>
        <p style="font-size: 12px; color: #666; margin-bottom: 4px;">
          ${location.cheetahs.registration_number}
        </p>
        ${location.users ? `
          <p style="font-size: 11px; color: #888; margin-bottom: 4px;">
            Driver: ${location.users.full_name} (${location.users.oscar})
          </p>
        ` : ''}
        ${location.speed > 0 ? `
          <p style="font-size: 11px; color: #888; margin-bottom: 4px;">
            Speed: ${Math.round(location.speed)} km/h
          </p>
        ` : ''}
        <p style="font-size: 11px; color: #888;">
          Coordinates: ${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}
        </p>
        <a 
          href="https://www.google.com/maps?q=${location.latitude},${location.longitude}" 
          target="_blank"
          style="
            display: inline-block;
            margin-top: 8px;
            padding: 4px 12px;
            background: #8B5CF6;
            color: white;
            text-decoration: none;
            border-radius: 4px;
            font-size: 11px;
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
