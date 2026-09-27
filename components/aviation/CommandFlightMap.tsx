"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import L from "leaflet"
import { AlertCircle, Clock3, Loader2, Plane, Radar, RefreshCw, Signal, SignalLow } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

const MapContainer = dynamic(() => import("react-leaflet").then((module) => module.MapContainer), { ssr: false })
const TileLayer = dynamic(() => import("react-leaflet").then((module) => module.TileLayer), { ssr: false })
const Marker = dynamic(() => import("react-leaflet").then((module) => module.Marker), { ssr: false })
const Popup = dynamic(() => import("react-leaflet").then((module) => module.Popup), { ssr: false })
const MapBounds = dynamic(() => import("./FlightMapBounds"), { ssr: false })

type TrackedFlight = {
  id: string
  papaName: string
  papaTitle: string | null
  flightNumber: string
  callsign: string | null
  airline: string | null
  departureAirport: string | null
  arrivalAirport: string | null
  scheduledDeparture: string | null
  scheduledArrival: string | null
  state: null | {
    icao24: string
    callsign: string | null
    latitude: number | null
    longitude: number | null
    altitudeMeters: number | null
    speedMetersPerSecond: number | null
    heading: number | null
    onGround: boolean
    lastContact: number | null
    ageSeconds: number | null
  }
}

type FlightWatch = {
  source: string
  authenticatedProvider: boolean
  refreshAfterSeconds: number
  providerDataAt: string | null
  flights: TrackedFlight[]
}

const EMPTY_FLIGHTS: TrackedFlight[] = []

function formatTimestamp(value: string | null) {
  if (!value) return "No provider timestamp"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })
}

function formatAge(ageSeconds: number | null | undefined) {
  if (ageSeconds == null) return "Position time unavailable"
  if (ageSeconds < 60) return `${ageSeconds}s ago`
  return `${Math.floor(ageSeconds / 60)}m ago`
}

function flightMarker(heading: number | null, stale: boolean, selected: boolean) {
  const rotation = Number.isFinite(heading) ? Math.round(heading as number) : 0
  const color = stale ? "#64748b" : "#0369a1"
  const ring = selected ? "0 0 0 4px rgba(14,165,233,.28)" : "0 4px 14px rgba(15,23,42,.25)"
  return L.divIcon({
    className: "tcnp-flight-marker",
    iconSize: [38, 38],
    iconAnchor: [19, 19],
    popupAnchor: [0, -18],
    html: `<span style="display:grid;place-items:center;width:36px;height:36px;border:2px solid #fff;border-radius:50%;background:${color};box-shadow:${ring};color:#fff"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style="transform:rotate(${rotation}deg)"><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"/></svg></span>`,
  })
}

function toFeet(meters: number | null) {
  return meters == null ? "—" : `${Math.round(meters * 3.28084).toLocaleString()} ft`
}

function toKnots(metersPerSecond: number | null) {
  return metersPerSecond == null ? "—" : `${Math.round(metersPerSecond * 1.94384)} kts`
}

export default function CommandFlightMap() {
  const [watch, setWatch] = useState<FlightWatch | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true)
    try {
      const response = await fetch("/api/flights/watch", { cache: "no-store" })
      const result = await response.json()
      if (!response.ok) throw new Error(result?.error || "Could not load live flights")
      setWatch(result as FlightWatch)
      setSelectedId((current) => current && result.flights.some((flight: TrackedFlight) => flight.id === current)
        ? current
        : result.flights[0]?.id ?? null)
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Flight tracking is temporarily unavailable")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  const refreshAfterSeconds = watch?.refreshAfterSeconds ?? 900
  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh()
    }, refreshAfterSeconds * 1000)
    return () => window.clearInterval(timer)
  }, [refresh, refreshAfterSeconds])

  const flights = watch?.flights ?? EMPTY_FLIGHTS
  const positionedFlights = useMemo(() => flights.filter((flight) =>
    flight.state?.latitude != null && flight.state.longitude != null
  ), [flights])
  const liveFlights = positionedFlights.filter((flight) => (flight.state?.ageSeconds ?? Infinity) <= 120)
  const selectedFlight = flights.find((flight) => flight.id === selectedId) ?? null

  return (
    <Card className="overflow-hidden border-border/70">
      <CardHeader className="gap-4 border-b bg-muted/20 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-lg tracking-tight">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400">
              <Radar className="h-[18px] w-[18px]" />
            </span>
            Live Papa flight map
          </CardTitle>
          <CardDescription className="max-w-2xl text-xs leading-relaxed">
            Live ADS-B positions for active Papa itineraries. Pins are matched by exact aircraft address or callsign; an itinerary or schedule alone is never shown as a live position.
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="h-7 gap-1.5 bg-background text-[10px] font-semibold uppercase tracking-wider">
            <Plane className="h-3 w-3" /> {flights.length} tracked
          </Badge>
          <Badge variant="outline" className="h-7 gap-1.5 border-emerald-500/30 bg-emerald-500/10 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
            <Signal className="h-3 w-3" /> {liveFlights.length} fresh positions
          </Badge>
          <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => void refresh(true)} disabled={refreshing}>
            {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Refresh
          </Button>
        </div>
      </CardHeader>

      {error && (
        <div role="status" className="flex items-start gap-2 border-b border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-800 dark:text-amber-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}{watch ? " Showing the last successful positions." : ""}</span>
        </div>
      )}

      <CardContent className="p-0">
        <div className="grid min-h-[28rem] lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="relative min-h-[28rem] bg-muted/30" role="region" aria-label="Map of live Papa flight positions">
            {loading && !watch ? (
              <div className="absolute inset-0 z-10 grid place-items-center bg-background/70 text-sm text-muted-foreground">
                <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Connecting to flight tracking…</span>
              </div>
            ) : null}
            <MapContainer center={[20, 0]} zoom={2} minZoom={2} maxZoom={12} worldCopyJump className="h-[28rem] w-full">
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                maxZoom={19}
              />
              <MapBounds positions={positionedFlights.map((flight) => [flight.state!.latitude!, flight.state!.longitude!] as [number, number])} />
              {positionedFlights.map((flight) => {
                const state = flight.state!
                const isStale = (state.ageSeconds ?? Infinity) > 120
                return (
                  <Marker
                    key={flight.id}
                    position={[state.latitude!, state.longitude!]}
                    icon={flightMarker(state.heading, isStale, selectedId === flight.id)}
                    eventHandlers={{ click: () => setSelectedId(flight.id) }}
                  >
                    <Popup>
                      <strong>{flight.papaTitle ? `${flight.papaTitle} ` : ""}{flight.papaName}</strong><br />
                      {flight.flightNumber} · {state.callsign || flight.callsign || "Callsign unavailable"}<br />
                      {state.onGround ? "On ground" : "Airborne"} · {formatAge(state.ageSeconds)}
                    </Popup>
                  </Marker>
                )
              })}
            </MapContainer>
            <div className="pointer-events-none absolute bottom-3 left-3 z-[400] rounded-lg border bg-background/95 px-2.5 py-2 text-[10px] text-muted-foreground shadow-sm backdrop-blur">
              © OpenStreetMap contributors
            </div>
          </div>

          <aside className="flex min-h-[28rem] flex-col border-t bg-card lg:border-l lg:border-t-0">
            <div className="border-b px-4 py-3">
              <p className="text-xs font-semibold">Papa flights in tracking window</p>
              <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                {watch?.authenticatedProvider ? "OpenSky authenticated · 2-minute provider refresh" : "OpenSky anonymous · 15-minute provider refresh to stay within the published free quota"}
              </p>
            </div>
            <div className="max-h-[21rem] flex-1 space-y-2 overflow-y-auto p-3">
              {flights.length === 0 && !loading ? (
                <div className="flex h-full min-h-40 flex-col items-center justify-center px-4 text-center">
                  <SignalLow className="h-7 w-7 text-muted-foreground/50" />
                  <p className="mt-2 text-xs font-semibold">No Papa flights to display</p>
                  <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">Active flight legs appear here within six hours of departure. Confirm the itinerary and ADS-B callsign in the Papa record.</p>
                </div>
              ) : flights.map((flight) => {
                const state = flight.state
                const positioned = state?.latitude != null && state.longitude != null
                const stale = (state?.ageSeconds ?? Infinity) > 120
                const selected = selectedId === flight.id
                return (
                  <button
                    key={flight.id}
                    type="button"
                    onClick={() => setSelectedId(flight.id)}
                    className={cn(
                      "w-full rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      selected ? "border-sky-500/40 bg-sky-500/5" : "border-border/60 hover:bg-muted/40"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold">{flight.papaTitle ? `${flight.papaTitle} ` : ""}{flight.papaName}</p>
                        <p className="mt-1 font-mono text-[11px] font-semibold">{flight.flightNumber}</p>
                      </div>
                      <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[9px] font-semibold", positioned && !stale ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-muted text-muted-foreground")}>
                        {positioned && !stale ? <Signal className="h-3 w-3" /> : <SignalLow className="h-3 w-3" />}
                        {positioned ? (stale ? "Last known" : state.onGround ? "On ground" : "Live") : "No contact"}
                      </span>
                    </div>
                    <p className="mt-2 truncate text-[10px] text-muted-foreground">
                      {flight.departureAirport || "Origin pending"} → {flight.arrivalAirport || "Destination pending"}
                    </p>
                    {selected && state && positioned && (
                      <div className="mt-3 grid grid-cols-3 gap-2 border-t pt-2 text-[10px]">
                        <span><span className="block text-muted-foreground">Altitude</span><strong>{toFeet(state.altitudeMeters)}</strong></span>
                        <span><span className="block text-muted-foreground">Speed</span><strong>{toKnots(state.speedMetersPerSecond)}</strong></span>
                        <span><span className="block text-muted-foreground">Track</span><strong>{state.heading == null ? "—" : `${Math.round(state.heading)}°`}</strong></span>
                      </div>
                    )}
                    {selected && <p className="mt-2 flex items-center gap-1 text-[9px] text-muted-foreground"><Clock3 className="h-3 w-3" />Position {formatAge(state?.ageSeconds)}</p>}
                  </button>
                )
              })}
            </div>
            <div className="border-t px-4 py-3 text-[10px] leading-relaxed text-muted-foreground">
              <p>Source: <a className="font-medium text-primary underline-offset-2 hover:underline" href="https://opensky-network.org/" target="_blank" rel="noreferrer">OpenSky Network</a>. ADS-B coverage varies by route; map positions are informational and may be delayed.</p>
              <p className="mt-1">Provider snapshot: {formatTimestamp(watch?.providerDataAt ?? null)}</p>
            </div>
          </aside>
        </div>
      </CardContent>
    </Card>
  )
}
