"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  AlertCircle,
  CalendarClock,
  Gauge,
  LocateFixed,
  MapPin,
  Plane,
  PlaneLanding,
  PlaneTakeoff,
  Radar,
  RefreshCw,
  Search,
  Signal,
  SignalLow,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import {
  formatLastContact,
  getFlightByIcao24,
  metersPerSecondToKnots,
  metersToFeet,
  searchFlightsByCallsign,
  type FlightState,
} from "@/lib/opensky-api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"

const supabase = createClient()

type PapaRow = {
  id: string
  title: string | null
  full_name: string
  program_id: string | null
  flight_number: string | null
  airline: string | null
  flight_departure_time: string | null
  flight_arrival_time: string | null
  arrival_city: string | null
}

type FlightEntry = {
  key: string
  legId: string | null
  papaId: string
  papaName: string
  papaTitle: string | null
  programId: string | null
  programName: string
  flightNumber: string
  adsbCallsign: string | null
  icao24: string | null
  airline: string | null
  departureAirport: string | null
  arrivalAirport: string | null
  scheduledDeparture: string | null
  scheduledArrival: string | null
  configuredSource: string | null
  configuredConfidence: string | null
  operationalStatus: string
  isLegacy: boolean
}

type LiveCheck = {
  state: FlightState | null
  checkedAt: string
  message: string | null
}

type Props = {
  title?: string
  description?: string
  className?: string
}

function normalizeFlightToken(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, "").toUpperCase()
}

function formatMoment(value: string | null) {
  if (!value) return "Not supplied"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString([], {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function scheduleState(entry: FlightEntry, live: LiveCheck | undefined) {
  if (entry.operationalStatus === "cancelled") {
    return {
      key: "cancelled",
      label: "Cancelled",
      detail: "This itinerary leg is marked as cancelled",
      className: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400",
    }
  }

  if (live?.state) {
    const ageSeconds = Math.max(0, Math.floor(Date.now() / 1000) - live.state.last_contact)
    if (ageSeconds <= 300) {
      return {
        key: "live",
        label: live.state.on_ground ? "Live · on ground" : "Live · airborne",
        detail: `OpenSky contact ${formatLastContact(live.state.last_contact)}`,
        className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
      }
    }
  }

  if (entry.operationalStatus === "delayed") {
    return {
      key: "delayed",
      label: "Delayed · no live signal",
      detail: "The itinerary is marked delayed; no current ADS-B contact is verified",
      className: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    }
  }

  const now = Date.now()
  const departure = entry.scheduledDeparture ? new Date(entry.scheduledDeparture).getTime() : Number.NaN
  const arrival = entry.scheduledArrival ? new Date(entry.scheduledArrival).getTime() : Number.NaN

  if (Number.isFinite(departure) && now < departure) {
    return {
      key: "scheduled",
      label: "Scheduled · not live",
      detail: "Departure time has not passed",
      className: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    }
  }
  if (Number.isFinite(departure) && Number.isFinite(arrival) && now >= departure && now <= arrival) {
    return {
      key: "unavailable",
      label: "Live signal unavailable",
      detail: "Currently inside the scheduled flight window",
      className: "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-400",
    }
  }
  if (Number.isFinite(arrival) && now > arrival) {
    return {
      key: "schedule-passed",
      label: "Scheduled arrival passed",
      detail: "This is not confirmation that the flight landed",
      className: "border-slate-500/30 bg-slate-500/10 text-slate-600 dark:text-slate-300",
    }
  }
  return {
    key: "unavailable",
    label: "Telemetry unavailable",
    detail: live?.message || "Track the flight when its ADS-B callsign is known",
    className: "border-border bg-muted/50 text-muted-foreground",
  }
}

export default function PapaFlightMonitor({
  title = "Papa flight monitor",
  description = "Live ADS-B positions when available, with schedule-only states clearly identified.",
  className,
}: Props) {
  const [entries, setEntries] = useState<FlightEntry[]>([])
  const [programs, setPrograms] = useState<Array<{ id: string; name: string }>>([])
  const [loading, setLoading] = useState(true)
  const [loadWarning, setLoadWarning] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [programFilter, setProgramFilter] = useState("all")
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [liveChecks, setLiveChecks] = useState<Record<string, LiveCheck>>({})
  const [refreshingKey, setRefreshingKey] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)

  const loadFlights = useCallback(async () => {
    setLoading(true)
    setLoadWarning(null)
    try {
      const [papasResult, programsResult, itineraryResult] = await Promise.all([
        (supabase as any)
          .from("papas")
          .select("id,title,full_name,program_id,flight_number,airline,flight_departure_time,flight_arrival_time,arrival_city,is_deleted")
          .eq("is_deleted", false)
          .order("full_name"),
        (supabase as any).from("programs").select("id,name").order("name"),
        (supabase as any).from("flight_itineraries").select("*").order("created_at", { ascending: false }),
      ])

      if (papasResult.error) throw papasResult.error
      const papaRows = (papasResult.data ?? []) as PapaRow[]
      const activePapaIds = new Set(papaRows.map((p) => p.id))
      const papaById = new Map(papaRows.map((p) => [p.id, p]))
      const programRows = (programsResult.data ?? []) as Array<{ id: string; name: string }>
      const programById = new Map(programRows.map((program) => [program.id, program.name]))
      setPrograms(programRows)

      const itineraries = itineraryResult.error
        ? []
        : (itineraryResult.data ?? []).filter((item: any) => activePapaIds.has(item.papa_id))
      const itineraryById = new Map(itineraries.map((item: any) => [item.id, item]))
      let legs: any[] = []

      if (itineraries.length > 0) {
        const legResult = await (supabase as any)
          .from("flight_legs")
          .select("*")
          .in("itinerary_id", itineraries.map((item: any) => item.id))
          .order("scheduled_departure", { ascending: true })
        if (!legResult.error) legs = legResult.data ?? []
      }

      const normalizedEntries: FlightEntry[] = legs.flatMap((leg: any) => {
        const itinerary = itineraryById.get(leg.itinerary_id) as any
        const papa = itinerary ? papaById.get(itinerary.papa_id) : null
        if (!papa || !leg.flight_number) return []
        const programId = itinerary.program_id ?? papa.program_id ?? null
        return [{
          key: `leg:${leg.id}`,
          legId: leg.id,
          papaId: papa.id,
          papaName: papa.full_name,
          papaTitle: papa.title,
          programId,
          programName: programId ? (programById.get(programId) ?? "Unlabelled program") : "No program",
          flightNumber: leg.flight_number,
          adsbCallsign: leg.adsb_callsign ?? null,
          icao24: leg.icao24 ?? null,
          airline: leg.airline ?? papa.airline ?? null,
          departureAirport: leg.departure_airport ?? null,
          arrivalAirport: leg.arrival_airport ?? papa.arrival_city ?? null,
          scheduledDeparture: leg.scheduled_departure ?? null,
          scheduledArrival: leg.scheduled_arrival ?? null,
          configuredSource: leg.telemetry_source ?? null,
          configuredConfidence: leg.telemetry_confidence ?? null,
          operationalStatus: itinerary.status === "cancelled" ? "cancelled" : (leg.status ?? "scheduled"),
          isLegacy: false,
        }]
      })

      const papasWithNormalizedLegs = new Set(normalizedEntries.map((entry) => entry.papaId))
      const legacyEntries: FlightEntry[] = papaRows
        .filter((papa) => papa.flight_number && !papasWithNormalizedLegs.has(papa.id))
        .map((papa) => ({
          key: `legacy:${papa.id}`,
          legId: null,
          papaId: papa.id,
          papaName: papa.full_name,
          papaTitle: papa.title,
          programId: papa.program_id,
          programName: papa.program_id ? (programById.get(papa.program_id) ?? "Unlabelled program") : "No program",
          flightNumber: papa.flight_number!,
          adsbCallsign: null,
          icao24: null,
          airline: papa.airline,
          departureAirport: null,
          arrivalAirport: papa.arrival_city,
          scheduledDeparture: papa.flight_departure_time,
          scheduledArrival: papa.flight_arrival_time,
          configuredSource: null,
          configuredConfidence: null,
          operationalStatus: "scheduled",
          isLegacy: true,
        }))

      const nextEntries = [...normalizedEntries, ...legacyEntries].sort((a, b) => {
        const aTime = a.scheduledDeparture ? new Date(a.scheduledDeparture).getTime() : Number.MAX_SAFE_INTEGER
        const bTime = b.scheduledDeparture ? new Date(b.scheduledDeparture).getTime() : Number.MAX_SAFE_INTEGER
        return aTime - bTime
      })

      setEntries(nextEntries)
      setSelectedKey((current) => {
        if (current && nextEntries.some((entry) => entry.key === current)) return current
        const now = Date.now()
        const active = nextEntries.find((entry) => {
          if (entry.operationalStatus === "cancelled") return false
          const dep = entry.scheduledDeparture ? new Date(entry.scheduledDeparture).getTime() : Number.NaN
          const arr = entry.scheduledArrival ? new Date(entry.scheduledArrival).getTime() : Number.NaN
          return Number.isFinite(dep) && Number.isFinite(arr) && now >= dep && now <= arr
        })
        const upcoming = nextEntries.find((entry) => entry.operationalStatus !== "cancelled" && (!entry.scheduledDeparture || new Date(entry.scheduledDeparture).getTime() >= now))
        return active?.key ?? upcoming?.key ?? nextEntries[0]?.key ?? null
      })

      if (itineraryResult.error) {
        setLoadWarning("Normalized itineraries are not available yet. Showing legacy Papa flight details.")
      }
    } catch (error: any) {
      setEntries([])
      setLoadWarning(error?.message || "Flight records could not be loaded.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadFlights()
  }, [loadFlights])

  const selectedEntry = useMemo(
    () => entries.find((entry) => entry.key === selectedKey) ?? null,
    [entries, selectedKey]
  )

  const refreshLive = useCallback(async (entry: FlightEntry, silent = false) => {
    if (!silent) setRefreshingKey(entry.key)
    try {
      if (entry.operationalStatus === "cancelled") {
        setLiveChecks((current) => ({
          ...current,
          [entry.key]: { state: null, checkedAt: new Date().toISOString(), message: "Cancelled flights are not polled." },
        }))
        return
      }
      const now = Date.now()
      const departure = entry.scheduledDeparture ? new Date(entry.scheduledDeparture).getTime() : Number.NaN
      const arrival = entry.scheduledArrival ? new Date(entry.scheduledArrival).getTime() : Number.NaN
      const trackingStart = Number.isFinite(departure) ? departure - 6 * 60 * 60 * 1000 : Number.NEGATIVE_INFINITY
      const trackingEnd = Number.isFinite(arrival)
        ? arrival + 6 * 60 * 60 * 1000
        : Number.isFinite(departure) ? departure + 24 * 60 * 60 * 1000 : Number.POSITIVE_INFINITY

      // Callsigns are reused. Never attach today's aircraft state to a future or
      // historic itinerary occurrence simply because the text happens to match.
      if (now < trackingStart || now > trackingEnd) {
        setLiveChecks((current) => ({
          ...current,
          [entry.key]: {
            state: null,
            checkedAt: new Date().toISOString(),
            message: now < trackingStart
              ? "Live matching opens six hours before the scheduled departure."
              : "This itinerary is outside its live tracking window.",
          },
        }))
        return
      }

      let state: FlightState | null = null
      if (entry.icao24) {
        state = await getFlightByIcao24(entry.icao24)
      } else {
        const lookup = entry.adsbCallsign || entry.flightNumber
        const results = await searchFlightsByCallsign(lookup)
        const expected = normalizeFlightToken(lookup)
        state = results.find((candidate) => normalizeFlightToken(candidate.callsign) === expected) ?? null
      }

      if (state && entry.legId) {
        // Persist only against this itinerary leg. The legacy shared
        // `flight_tracking` table is intentionally not read or written because
        // recurring callsigns can otherwise leak yesterday's state into today.
        try {
          await (supabase as any).from("flight_legs").update({
            telemetry_source: "opensky",
            telemetry_confidence: "matched",
            last_seen_at: new Date(state.last_contact * 1000).toISOString(),
            current_latitude: state.latitude,
            current_longitude: state.longitude,
            altitude: state.baro_altitude,
            velocity: state.velocity,
            heading: state.true_track,
          }).eq("id", entry.legId)
        } catch (persistenceError) {
          console.warn("Flight leg telemetry could not be persisted:", persistenceError)
        }
      }

      setLiveChecks((current) => ({
        ...current,
        [entry.key]: {
          state,
          checkedAt: new Date().toISOString(),
          message: state
            ? null
            : entry.adsbCallsign || entry.icao24
              ? "No current ADS-B contact for the configured aircraft."
              : "No exact callsign match. Add the ADS-B callsign to the itinerary to avoid matching the wrong aircraft.",
        },
      }))
    } catch (error: any) {
      setLiveChecks((current) => ({
        ...current,
        [entry.key]: {
          state: null,
          checkedAt: new Date().toISOString(),
          message: error?.message || "The live flight provider is temporarily unavailable.",
        },
      }))
    } finally {
      if (!silent) setRefreshingKey(null)
    }
  }, [])

  useEffect(() => {
    if (!selectedEntry) return
    void refreshLive(selectedEntry, true)
    if (!autoRefresh) return
    const timer = window.setInterval(() => void refreshLive(selectedEntry, true), 90_000)
    return () => window.clearInterval(timer)
  }, [autoRefresh, refreshLive, selectedEntry])

  const filteredEntries = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return entries.filter((entry) => {
      if (programFilter !== "all" && entry.programId !== programFilter) return false
      if (!needle) return true
      return [
        entry.papaName,
        entry.papaTitle,
        entry.flightNumber,
        entry.adsbCallsign,
        entry.airline,
        entry.departureAirport,
        entry.arrivalAirport,
        entry.programName,
      ].filter(Boolean).join(" ").toLowerCase().includes(needle)
    })
  }, [entries, programFilter, query])

  const liveCount = entries.filter((entry) => scheduleState(entry, liveChecks[entry.key]).key === "live").length
  const selectedLive = selectedEntry ? liveChecks[selectedEntry.key] : undefined
  const selectedStatus = selectedEntry ? scheduleState(selectedEntry, selectedLive) : null

  return (
    <section className={cn("space-y-4", className)} aria-labelledby="papa-flight-monitor-title">
      <Card className="overflow-hidden border-border/60">
        <CardHeader className="border-b bg-muted/20 pb-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400">
                  <Radar className="h-[18px] w-[18px]" />
                </div>
                <div>
                  <CardTitle id="papa-flight-monitor-title" className="text-lg tracking-tight">{title}</CardTitle>
                  <CardDescription className="mt-0.5 text-xs leading-relaxed">{description}</CardDescription>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="h-7 gap-1.5 bg-background text-[10px] font-semibold uppercase tracking-wider">
                <Plane className="h-3 w-3" /> {entries.length} flight{entries.length === 1 ? "" : "s"}
              </Badge>
              <Badge variant="outline" className="h-7 gap-1.5 border-emerald-500/30 bg-emerald-500/10 text-[10px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                <Signal className="h-3 w-3" /> {liveCount} live
              </Badge>
              <Button
                type="button"
                size="sm"
                variant={autoRefresh ? "secondary" : "outline"}
                className="h-8 gap-1.5 text-xs"
                onClick={() => setAutoRefresh((value) => !value)}
              >
                <RefreshCw className={cn("h-3.5 w-3.5", autoRefresh && "text-emerald-500")} />
                Auto {autoRefresh ? "on" : "off"}
              </Button>
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_14rem_auto]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search Papa, flight, airline or airport"
                className="h-9 bg-background pl-9 text-xs"
              />
            </div>
            <Select value={programFilter} onValueChange={setProgramFilter}>
              <SelectTrigger className="h-9 bg-background text-xs"><SelectValue placeholder="Program" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All programs</SelectItem>
                {programs.map((program) => <SelectItem key={program.id} value={program.id}>{program.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5 text-xs" onClick={() => void loadFlights()} disabled={loading}>
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Refresh records
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {loadWarning && (
            <div className="flex items-start gap-2 border-b border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-800 dark:text-amber-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{loadWarning}</span>
            </div>
          )}

          {loading ? (
            <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_22rem]">
              <div className="space-y-2 p-4">
                {Array.from({ length: 4 }).map((_, index) => <div key={index} className="skeleton h-24 rounded-xl" />)}
              </div>
              <div className="border-t p-4 lg:border-l lg:border-t-0"><div className="skeleton h-72 rounded-xl" /></div>
            </div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground"><Plane className="h-6 w-6" /></div>
              <p className="mt-3 text-sm font-semibold">No Papa flights recorded</p>
              <p className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">Add a flight itinerary or a legacy flight number to a Papa dossier. The monitor will select the current or next flight automatically.</p>
            </div>
          ) : (
            <div className="grid min-h-[26rem] lg:grid-cols-[minmax(0,1fr)_22rem]">
              <div className="max-h-[38rem] overflow-y-auto p-3 sm:p-4">
                {filteredEntries.length === 0 ? (
                  <div className="flex h-48 items-center justify-center text-center text-sm text-muted-foreground">No flights match these filters.</div>
                ) : (
                  <div className="space-y-2">
                    {filteredEntries.map((entry) => {
                      const live = liveChecks[entry.key]
                      const status = scheduleState(entry, live)
                      const isSelected = selectedKey === entry.key
                      return (
                        <button
                          key={entry.key}
                          type="button"
                          onClick={() => setSelectedKey(entry.key)}
                          className={cn(
                            "w-full rounded-xl border p-3 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            isSelected ? "border-sky-500/40 bg-sky-500/5 shadow-sm" : "border-border/60 bg-card hover:border-sky-500/25 hover:bg-muted/20"
                          )}
                        >
                          <div className="flex items-start gap-3">
                            <div className={cn("mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", status.key === "live" ? "bg-emerald-500/10 text-emerald-500" : "bg-muted text-muted-foreground")}>
                              {status.key === "live" && live?.state?.on_ground ? <PlaneLanding className="h-[18px] w-[18px]" /> : <PlaneTakeoff className="h-[18px] w-[18px]" />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold">{entry.papaTitle ? `${entry.papaTitle} ` : ""}{entry.papaName}</p>
                                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{entry.programName}</p>
                                </div>
                                <Badge variant="outline" className={cn("shrink-0 text-[9px] font-semibold", status.className)}>{status.label}</Badge>
                              </div>
                              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                                <span className="font-mono font-semibold tabular-nums text-foreground">{entry.flightNumber}</span>
                                {entry.adsbCallsign && <span className="text-muted-foreground">ADS-B {entry.adsbCallsign}</span>}
                                <span className="text-muted-foreground">{entry.departureAirport || "Origin pending"} → {entry.arrivalAirport || "Destination pending"}</span>
                              </div>
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              <aside className="border-t bg-muted/10 p-4 lg:border-l lg:border-t-0">
                {selectedEntry && selectedStatus ? (
                  <div className="space-y-4">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Selected flight</p>
                      <div className="mt-2 flex items-start justify-between gap-2">
                        <div>
                          <p className="font-mono text-xl font-bold tracking-tight tabular-nums">{selectedEntry.flightNumber}</p>
                          <p className="text-xs text-muted-foreground">{selectedEntry.airline || "Airline not supplied"}</p>
                        </div>
                        <Badge variant="outline" className={cn("text-[9px] font-semibold", selectedStatus.className)}>{selectedStatus.label}</Badge>
                      </div>
                      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{selectedStatus.detail}</p>
                    </div>

                    <div className="rounded-xl border bg-background p-3">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="inline-flex items-center gap-1.5 text-muted-foreground"><PlaneTakeoff className="h-3.5 w-3.5" /> Departure</span>
                        <span className="font-medium tabular-nums">{formatMoment(selectedEntry.scheduledDeparture)}</span>
                      </div>
                      <div className="my-3 border-t border-dashed" />
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="inline-flex items-center gap-1.5 text-muted-foreground"><PlaneLanding className="h-3.5 w-3.5" /> Arrival</span>
                        <span className="font-medium tabular-nums">{formatMoment(selectedEntry.scheduledArrival)}</span>
                      </div>
                    </div>

                    {selectedLive?.state ? (
                      <div className="space-y-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                        <div className="flex items-center justify-between">
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300"><Signal className="h-3.5 w-3.5" /> Live telemetry</span>
                          <span className="text-[10px] text-muted-foreground">{formatLastContact(selectedLive.state.last_contact)}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div><p className="text-[9px] uppercase tracking-wider text-muted-foreground">Altitude</p><p className="mt-0.5 text-sm font-semibold tabular-nums">{metersToFeet(selectedLive.state.baro_altitude)?.toLocaleString() ?? "—"} <span className="text-[9px] font-normal">ft</span></p></div>
                          <div><p className="text-[9px] uppercase tracking-wider text-muted-foreground">Speed</p><p className="mt-0.5 text-sm font-semibold tabular-nums">{metersPerSecondToKnots(selectedLive.state.velocity)?.toLocaleString() ?? "—"} <span className="text-[9px] font-normal">kts</span></p></div>
                          <div><p className="text-[9px] uppercase tracking-wider text-muted-foreground">Heading</p><p className="mt-0.5 text-sm font-semibold tabular-nums">{selectedLive.state.true_track != null ? `${Math.round(selectedLive.state.true_track)}°` : "—"}</p></div>
                        </div>
                        {selectedLive.state.latitude != null && selectedLive.state.longitude != null && (
                          <div className="flex items-center gap-1.5 rounded-lg bg-background/70 px-2.5 py-2 text-[11px] text-muted-foreground">
                            <LocateFixed className="h-3.5 w-3.5 text-emerald-500" />
                            <span className="font-mono tabular-nums">{selectedLive.state.latitude.toFixed(4)}, {selectedLive.state.longitude.toFixed(4)}</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed p-3 text-xs text-muted-foreground">
                        <div className="flex items-center gap-2 font-medium text-foreground"><SignalLow className="h-4 w-4" /> No verified live contact</div>
                        <p className="mt-1.5 text-[11px] leading-relaxed">{selectedLive?.message || "The monitor will check OpenSky for an exact aircraft or ADS-B callsign match."}</p>
                      </div>
                    )}

                    <Button
                      type="button"
                      className="w-full gap-1.5 text-xs"
                      size="sm"
                      onClick={() => void refreshLive(selectedEntry)}
                      disabled={refreshingKey === selectedEntry.key}
                    >
                      <RefreshCw className={cn("h-3.5 w-3.5", refreshingKey === selectedEntry.key && "animate-spin")} />
                      Check live signal
                    </Button>

                    <div className="grid grid-cols-2 gap-2 text-[10px] text-muted-foreground">
                      <div className="rounded-lg bg-muted/50 p-2"><CalendarClock className="mb-1 h-3.5 w-3.5" />{selectedEntry.isLegacy ? "Legacy itinerary" : "Normalized leg"}</div>
                      <div className="rounded-lg bg-muted/50 p-2"><Gauge className="mb-1 h-3.5 w-3.5" />{selectedEntry.configuredConfidence || (selectedLive?.state ? "Live confidence" : "Unverified")}</div>
                    </div>
                  </div>
                ) : (
                  <div className="flex h-full min-h-64 flex-col items-center justify-center text-center text-muted-foreground">
                    <MapPin className="h-8 w-8 opacity-40" />
                    <p className="mt-2 text-xs">Select a flight to inspect its schedule and live signal.</p>
                  </div>
                )}
              </aside>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
