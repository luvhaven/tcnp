"use client"

import { useEffect, useRef } from "react"
import { useMap } from "react-leaflet"

export default function FlightMapBounds({ positions }: { positions: Array<[number, number]> }) {
  const map = useMap()
  const hasFitted = useRef(false)

  useEffect(() => {
    if (!positions.length || hasFitted.current) return
    hasFitted.current = true
    if (positions.length === 1) {
      map.setView(positions[0], 5)
      return
    }
    map.fitBounds(positions, { padding: [36, 36], maxZoom: 5 })
  }, [map, positions])

  return null
}
