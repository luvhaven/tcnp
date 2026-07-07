"use client"

import { useEffect, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Plane, Search, RefreshCw, Gauge, TrendingUp, Globe, Loader2, PlaneLanding, PlaneTakeoff, Radar,
} from "lucide-react"
import {
  searchFlightsByCallsign,
  metersPerSecondToKnots,
  metersToFeet,
  formatLastContact,
  type FlightState,
} from "@/lib/opensky-api"

// Dynamic imports for Leaflet (SSR-unsafe)
const MapContainer = dynamic(() => import("react-leaflet").then(m => m.MapContainer), { ssr: false })
const TileLayer = dynamic(() => import("react-leaflet").then(m => m.TileLayer), { ssr: false })
const Marker = dynamic(() => import("react-leaflet").then(m => m.Marker), { ssr: false })
const Popup = dynamic(() => import("react-leaflet").then(m => m.Popup), { ssr: false })

/**
 * Ad-hoc live flight tracker — search any flight number / callsign (e.g. BA75,
 * ET900) and follow its live position, altitude, speed and heading via OpenSky.
 */
export default function FlightSearch() {
  const [query, setQuery] = useState("")
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<FlightState[]>([])
  const [tracked, setTracked] = useState<FlightState | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const runSearch = async (silent = false) => {
    const q = query.trim()
    if (!q) {
      if (!silent) toast.error("Enter a flight number or callsign, e.g. BA75")
      return
    }
    if (!silent) setSearching(true)
    try {
      const states = await searchFlightsByCallsign(q)
      setResults(states)
      setLastUpdated(new Date())
      if (states.length === 0 && !silent) {
        toast.info("No live aircraft found for that callsign right now. It may not be airborne yet or is out of receiver coverage.")
      }
      // Keep the tracked aircraft fresh if it's still in results
      if (tracked) {
        const updated = states.find(s => s.icao24 === tracked.icao24)
        if (updated) setTracked(updated)
      }
    } catch (err: any) {
      if (!silent) toast.error(err.message || "Flight search failed")
    } finally {
      if (!silent) setSearching(false)
    }
  }

  // Auto-refresh every 30s while tracking
  useEffect(() => {
    if (refreshTimer.current) clearInterval(refreshTimer.current)
    if (tracked) {
      refreshTimer.current = setInterval(() => { void runSearch(true) }, 30000)
    }
    return () => { if (refreshTimer.current) clearInterval(refreshTimer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracked, query])

  const FlightRow = ({ flight }: { flight: FlightState }) => {
    const knots = metersPerSecondToKnots(flight.velocity)
    const feet = metersToFeet(flight.baro_altitude)
    const isTracked = tracked?.icao24 === flight.icao24
    return (
      <button
        onClick={() => setTracked(isTracked ? null : flight)}
        className={`w-full rounded-xl border p-4 text-left transition-all hover:border-primary/40 hover:shadow-sm ${isTracked ? "border-primary bg-primary/5" : ""}`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-full ${flight.on_ground ? "bg-emerald-500/10 text-emerald-500" : "bg-sky-500/10 text-sky-500"}`}>
              {flight.on_ground ? <PlaneLanding className="h-5 w-5" /> : <PlaneTakeoff className="h-5 w-5" />}
            </div>
            <div>
              <p className="font-semibold tracking-wide">{flight.callsign?.trim() || flight.icao24.toUpperCase()}</p>
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Globe className="h-3 w-3" /> {flight.origin_country}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge className={flight.on_ground ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-0" : "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-0"}>
              {flight.on_ground ? "On Ground" : "In Air"}
            </Badge>
            <span className="text-[11px] text-muted-foreground">{formatLastContact(flight.last_contact)}</span>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5" /> {feet != null ? `${Math.round(feet).toLocaleString()} ft` : "—"}</span>
          <span className="inline-flex items-center gap-1"><Gauge className="h-3.5 w-3.5" /> {knots != null ? `${Math.round(knots)} kts` : "—"}</span>
          <span className="inline-flex items-center gap-1"><Radar className="h-3.5 w-3.5" /> {flight.true_track != null ? `${Math.round(flight.true_track)}°` : "—"}</span>
        </div>
      </button>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Search className="h-5 w-5 text-primary" /> Track Any Flight
        </CardTitle>
        <CardDescription>
          Search live by flight number or callsign — positions from the OpenSky network, refreshed every 30s while tracking.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          onSubmit={(e) => { e.preventDefault(); void runSearch() }}
          className="flex gap-2"
        >
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. BA75, ET900, VS411…"
            className="max-w-xs uppercase"
          />
          <Button type="submit" disabled={searching} className="gap-2">
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Search
          </Button>
          {results.length > 0 && (
            <Button type="button" variant="outline" size="icon" title="Refresh" onClick={() => void runSearch()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          )}
        </form>

        {lastUpdated && results.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {results.length} aircraft · updated {lastUpdated.toLocaleTimeString()}
            {tracked ? " · auto-refreshing" : ""}
          </p>
        )}

        {results.length > 0 && (
          <div className="grid gap-3 md:grid-cols-2">
            {results.slice(0, 6).map(f => <FlightRow key={f.icao24} flight={f} />)}
          </div>
        )}

        {/* Live position map for the tracked aircraft */}
        {tracked && tracked.latitude != null && tracked.longitude != null && (
          <div className="overflow-hidden rounded-xl border">
            <div className="h-[320px] w-full">
              <MapContainer
                key={`${tracked.icao24}-${tracked.latitude}-${tracked.longitude}`}
                center={[tracked.latitude, tracked.longitude]}
                zoom={6}
                style={{ height: "100%", width: "100%" }}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <Marker position={[tracked.latitude, tracked.longitude]}>
                  <Popup>
                    <strong>{tracked.callsign?.trim() || tracked.icao24.toUpperCase()}</strong>
                    <br />
                    {tracked.on_ground ? "On ground" : "In air"} · {formatLastContact(tracked.last_contact)}
                  </Popup>
                </Marker>
              </MapContainer>
            </div>
            <div className="flex items-center justify-between bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Plane className="h-3.5 w-3.5" />
                {tracked.callsign?.trim() || tracked.icao24.toUpperCase()} — live position
              </span>
              <button className="font-medium text-primary hover:underline" onClick={() => setTracked(null)}>
                Stop tracking
              </button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
