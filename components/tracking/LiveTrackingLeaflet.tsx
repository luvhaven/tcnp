'use client'

import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Layers, Locate, Maximize, Minimize, WifiOff } from 'lucide-react'

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

// Using completely native SVG DivIcons to guarantee offline/PWA rendering without cross-origin image blockades.

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

type BasemapId = 'auto' | 'streets' | 'dark' | 'satellite'

type TileSource = { url: string; attribution: string; subdomains?: string; maxZoom: number }

// Each style lists PRIMARY first, then fallback providers tried in order if
// the primary produces zero loaded tiles within TILE_TIMEOUT_MS. Different
// infrastructure per tier — if one CDN is unreachable on a given network,
// the next is a genuinely independent path, not just a mirrored subdomain.
const BASEMAPS: Record<Exclude<BasemapId, 'auto'>, { label: string; layers: TileSource[] }> = {
  streets: {
    label: 'Streets',
    layers: [
      {
        // CARTO Voyager — production-friendly, no API key
        url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
        attribution: '© OpenStreetMap contributors © CARTO',
        subdomains: 'abcd',
        maxZoom: 20,
      },
      {
        // Fallback: raw OSM tiles — independent infrastructure from CARTO
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: '© OpenStreetMap contributors',
        subdomains: 'abc',
        maxZoom: 19,
      },
    ],
  },
  dark: {
    label: 'Dark',
    layers: [
      {
        url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        attribution: '© OpenStreetMap contributors © CARTO',
        subdomains: 'abcd',
        maxZoom: 20,
      },
      {
        // Fallback: CARTO dark via the direct (non-lettered) host
        url: 'https://cartodb-basemaps-a.global.ssl.fastly.net/dark_all/{z}/{x}/{y}{r}.png',
        attribution: '© OpenStreetMap contributors © CARTO',
        maxZoom: 20,
      },
    ],
  },
  satellite: {
    label: 'Satellite',
    layers: [
      {
        // Esri World Imagery — free, no API key required
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        attribution: 'Esri, Maxar, Earthstar Geographics',
        maxZoom: 19,
      },
    ],
  },
}

const BASEMAP_STORAGE_KEY = 'tcnp-map-basemap'
// If a tile provider hasn't successfully loaded a single tile within this
// window, treat it as unreachable (covers hung/silently-dropped requests
// that never fire a `tileerror` event) and try the next one in the chain.
const TILE_TIMEOUT_MS = 7000

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
  const baseLayerRef = useRef<L.TileLayer | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const hasFitBoundsRef = useRef(false)
  const tileErrorCountRef = useRef(0)

  const [basemap, setBasemap] = useState<BasemapId>(() => {
    if (typeof window === 'undefined') return 'auto'
    try {
      return (localStorage.getItem(BASEMAP_STORAGE_KEY) as BasemapId) || 'auto'
    } catch {
      return 'auto'
    }
  })
  const [layerMenuOpen, setLayerMenuOpen] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [tilesFailing, setTilesFailing] = useState(false)
  const [activeStyleLabel, setActiveStyleLabel] = useState<string | null>(null)
  const tileTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loadedTileCountRef = useRef(0)
  const currentModeRef = useRef<BasemapId>(basemap)

  const resolveActiveStyle = (mode: BasemapId): Exclude<BasemapId, 'auto'> => {
    if (mode !== 'auto') return mode
    return document.documentElement.classList.contains('dark') ? 'dark' : 'streets'
  }

  /**
   * Attaches the tile source at `layerIndex` in the style's fallback chain.
   * If zero tiles load within TILE_TIMEOUT_MS, automatically advances to the
   * next source — this is what catches hung/silently-dropped requests that
   * never fire a `tileerror` event (the classic "grey map, no error" case).
   */
  const attachTileSource = (map: L.Map, mode: BasemapId, layerIndex: number) => {
    const style = BASEMAPS[resolveActiveStyle(mode)]
    const source = style.layers[layerIndex]
    if (!source) {
      // Exhausted every provider in the chain — nothing left to try
      setTilesFailing(true)
      return
    }

    if (tileTimeoutRef.current) clearTimeout(tileTimeoutRef.current)
    if (baseLayerRef.current) baseLayerRef.current.remove()

    tileErrorCountRef.current = 0
    loadedTileCountRef.current = 0
    setActiveStyleLabel(style.label)

    const layer = L.tileLayer(source.url, {
      attribution: source.attribution,
      subdomains: source.subdomains ?? 'abc',
      maxZoom: source.maxZoom,
      // Transparent 1x1 gif — avoids the broken-image glyph on failed tiles
      errorTileUrl: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7',
    })

    layer.on('tileerror', () => {
      tileErrorCountRef.current += 1
      // A flood of explicit errors (not just silence) — advance immediately
      // rather than waiting out the full timeout
      if (tileErrorCountRef.current > 6 && loadedTileCountRef.current === 0) {
        attachTileSource(map, mode, layerIndex + 1)
      }
    })
    layer.on('tileload', () => {
      loadedTileCountRef.current += 1
      setTilesFailing(false)
      if (tileTimeoutRef.current) {
        clearTimeout(tileTimeoutRef.current)
        tileTimeoutRef.current = null
      }
    })
    layer.addTo(map)
    baseLayerRef.current = layer

    // Silence guard: hung/dropped requests fire neither tileload nor tileerror
    tileTimeoutRef.current = setTimeout(() => {
      if (loadedTileCountRef.current === 0) {
        attachTileSource(map, mode, layerIndex + 1)
      }
    }, TILE_TIMEOUT_MS)
  }

  const applyBasemap = (map: L.Map, mode: BasemapId) => {
    currentModeRef.current = mode
    setTilesFailing(false)
    attachTileSource(map, mode, 0)
  }

  /** Manual retry — restarts the fallback chain from the primary provider */
  const retryTiles = () => {
    const map = mapRef.current
    if (!map) return
    applyBasemap(map, currentModeRef.current)
  }

  // ── Init map ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, {
      center,
      zoom: 12,
      preferCanvas: true,
      zoomControl: false, // custom-positioned below
    })

    L.control.zoom({ position: 'bottomright' }).addTo(map)
    L.control.scale({ position: 'bottomleft', imperial: false }).addTo(map)

    const style = document.createElement('style')
    style.innerHTML = `
      @keyframes pulse-red {
        0%   { box-shadow: 0 0 0 0   rgba(239,68,68,0.7); }
        70%  { box-shadow: 0 0 0 10px rgba(239,68,68,0);   }
        100% { box-shadow: 0 0 0 0   rgba(239,68,68,0);   }
      }`
    document.head.appendChild(style)

    applyBasemap(map, basemap)

    mapRef.current = map

    // Guard against the classic "grey map" bug: if the container's height
    // wasn't finalized (CSS transition/animation, tab switch) at init time,
    // Leaflet caches a stale size. Re-measure shortly after mount and again
    // after the page-enter animation settles.
    const t1 = setTimeout(() => map.invalidateSize(), 150)
    const t2 = setTimeout(() => map.invalidateSize(), 500)

    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      style.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Cleanup map instance only on unmount
  useEffect(() => {
    return () => {
      if (tileTimeoutRef.current) clearTimeout(tileTimeoutRef.current)
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [])

  // ── Basemap switching (manual selection + auto theme-follow) ─────────────
  useEffect(() => {
    try { localStorage.setItem(BASEMAP_STORAGE_KEY, basemap) } catch { /* ignore */ }
    const map = mapRef.current
    if (!map) return
    applyBasemap(map, basemap)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basemap])

  useEffect(() => {
    if (basemap !== 'auto') return
    const map = mapRef.current
    if (!map) return
    const observer = new MutationObserver(() => applyBasemap(map, 'auto'))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basemap])

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

  // ── Fullscreen toggle ──────────────────────────────────────────────────────
  useEffect(() => {
    const handler = () => {
      setIsFullscreen(!!document.fullscreenElement)
      setTimeout(() => mapRef.current?.invalidateSize(), 100)
    }
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  const toggleFullscreen = () => {
    const el = containerRef.current?.parentElement
    if (!el) return
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
    } else {
      el.requestFullscreen?.().catch(() => {})
    }
  }

  const locateMe = () => {
    const map = mapRef.current
    if (!map || !('geolocation' in navigator)) return
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        map.setView([pos.coords.latitude, pos.coords.longitude], Math.max(map.getZoom(), 14), { animate: true })
      },
      () => { /* silent — user may have denied, banner elsewhere already covers this */ },
      { enableHighAccuracy: true, timeout: 8000 }
    )
  }

  const fitAllMarkers = () => {
    const map = mapRef.current
    if (!map || locations.length === 0) return
    const bounds = L.latLngBounds(locations.map((l) => [l.latitude, l.longitude] as L.LatLngExpression))
    map.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 })
  }

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

      // Use highly stylized inline SVG rather than L.Icon.Default() (which fails in NextJS PWA)
      const svgMarker = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${roleDisplay.color}" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0px 4px 6px rgba(0,0,0,0.3));">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
          <circle cx="12" cy="10" r="3" fill="white"></circle>
        </svg>
      `

      let icon: L.Icon | L.DivIcon = L.divIcon({
        className: 'custom-div-icon',
        html: `<div style="width:28px;height:28px;margin-top:-14px;margin-left:-14px;">${svgMarker}</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 28],
        popupAnchor: [0, -28],
      })

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

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} style={{ height: '100%', width: '100%' }} />

      {/* Tile-load failure banner — replaces silent grey with an honest message.
          Fires on explicit tile errors AND on silent/hung requests that never
          fire an event at all (the classic "blank map, no warning" case). */}
      {tilesFailing && (
        <div className="pointer-events-none absolute inset-x-0 top-2 z-[500] flex justify-center px-3">
          <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/95 px-3 py-1.5 text-xs font-medium text-white shadow-lg">
            <WifiOff className="h-3.5 w-3.5 shrink-0" />
            <span>Map tiles couldn&apos;t load — check your internet or firewall</span>
            <button
              type="button"
              onClick={retryTiles}
              className="ml-1 shrink-0 rounded-full bg-white/20 px-2 py-0.5 font-semibold hover:bg-white/30"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Top-right control cluster: layers, locate, fit-all, fullscreen */}
      <div className="absolute right-2.5 top-2.5 z-[500] flex flex-col items-end gap-1.5">
        <div className="relative">
          <button
            type="button"
            onClick={() => setLayerMenuOpen((v) => !v)}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-black/10 bg-white text-slate-700 shadow-md transition-colors hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            aria-label="Change map style"
            title={activeStyleLabel ? `Map style: ${activeStyleLabel}` : 'Map style'}
          >
            <Layers className="h-4 w-4" />
          </button>
          {layerMenuOpen && (
            <div className="absolute right-0 top-11 w-36 overflow-hidden rounded-md border border-black/10 bg-white shadow-lg dark:border-white/10 dark:bg-slate-900">
              {([
                { id: 'auto' as BasemapId, label: 'Auto (theme)' },
                { id: 'streets' as BasemapId, label: 'Streets' },
                { id: 'dark' as BasemapId, label: 'Dark' },
                { id: 'satellite' as BasemapId, label: 'Satellite' },
              ]).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => { setBasemap(opt.id); setLayerMenuOpen(false) }}
                  className={`block w-full px-3 py-2 text-left text-xs transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 ${basemap === opt.id ? 'bg-primary/10 font-semibold text-primary' : 'text-slate-700 dark:text-slate-200'
                    }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={locateMe}
          className="flex h-9 w-9 items-center justify-center rounded-md border border-black/10 bg-white text-slate-700 shadow-md transition-colors hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          aria-label="Center on my location"
          title="Locate me"
        >
          <Locate className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={fitAllMarkers}
          disabled={locations.length === 0}
          className="flex h-9 items-center justify-center rounded-md border border-black/10 bg-white px-2 text-[10px] font-semibold text-slate-700 shadow-md transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          title="Fit all markers in view"
        >
          FIT ALL
        </button>

        <button
          type="button"
          onClick={toggleFullscreen}
          className="flex h-9 w-9 items-center justify-center rounded-md border border-black/10 bg-white text-slate-700 shadow-md transition-colors hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        >
          {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}
