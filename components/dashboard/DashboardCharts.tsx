"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

type JourneyStatusDatum = {
  status: string;
  count: number;
};

type IncidentSeverityDatum = {
  severity: string;
  count: number;
};

type RoleDatum = {
  role: string;
  count: number;
};

type TimeSeriesDatum = {
  date: string;
  label: string;
  count: number;
};

const JOURNEY_STATUS_LABELS: Record<string, string> = {
  planned: "Planned",
  in_progress: "In Progress",
  first_course: "First Course",
  chapman: "Chapman",
  dessert: "Dessert",
  completed: "Completed",
  cancelled: "Cancelled",
  broken_arrow: "Broken Arrow",
};

const INCIDENT_SEVERITY_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

const CHART_COLORS = {
  primary: "#F26522",
  primarySoft: "#FED7AA",
  amber: "#F59E0B",
  green: "#22C55E",
  red: "#EF4444",
  purple: "#A855F7",
  slate: "#64748B",
};

export function DashboardCharts() {
  const supabase = createClient();

  const [journeyStatusData, setJourneyStatusData] = useState<JourneyStatusDatum[]>([]);
  const [incidentSeverityData, setIncidentSeverityData] = useState<IncidentSeverityDatum[]>([]);
  const [roleData, setRoleData] = useState<RoleDatum[]>([]);
  const [journeyTrendData, setJourneyTrendData] = useState<TimeSeriesDatum[]>([]);
  const [incidentTrendData, setIncidentTrendData] = useState<TimeSeriesDatum[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [animationKey, setAnimationKey] = useState(0);
  const animationFrameRef = useRef<number | null>(null);
  const [animationProgress, setAnimationProgress] = useState(0);

  const startValueAnimation = () => {
    if (animationFrameRef.current != null) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    setAnimationProgress(0);

    const duration = 700;
    const start = performance.now();

    const animate = (time: number) => {
      const t = Math.min((time - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setAnimationProgress(eased);
      if (t < 1) {
        animationFrameRef.current = requestAnimationFrame(animate);
      }
    };

    animationFrameRef.current = requestAnimationFrame(animate);
  };

  useEffect(
    () => () => {
      if (animationFrameRef.current != null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    },
    [],
  );

  // Trigger animation when the analytics section enters the viewport
  useEffect(() => {
    if (loading) return;

    const target = containerRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setAnimationKey((prev) => prev + 1);
          startValueAnimation();
        }
      },
      { threshold: 0.25 },
    );

    observer.observe(target);

    return () => {
      observer.disconnect();
    };
  }, [loading]);

  // Ensure a one-time animation from zero after data loads, even on reload
  useEffect(() => {
    if (loading) return;

    // On the client, delay to the next tick so charts first paint, then animate
    if (typeof window === "undefined") {
      setAnimationKey((prev) => prev + 1);
      startValueAnimation();
      return;
    }

    const id = window.setTimeout(() => {
      setAnimationKey((prev) => prev + 1);
      startValueAnimation();
    }, 80);

    return () => window.clearTimeout(id);
  }, [loading]);

  useEffect(() => {
    const load = async () => {
      try {
        const [{ data: journeys }, { data: incidents }, { data: users }] = await Promise.all([
          supabase.from("journeys").select("status, created_at"),
          supabase.from("incidents").select("severity, created_at"),
          supabase.from("users").select("role"),
        ]);

        const journeysArr = journeys ?? [];
        const incidentsArr = incidents ?? [];
        const usersArr = users ?? [];

        const journeyCounts = new Map<string, number>();
        journeysArr.forEach((j: any) => {
          if (!j.status) return;
          journeyCounts.set(j.status, (journeyCounts.get(j.status) ?? 0) + 1);
        });

        const orderedStatuses = [
          "planned",
          "in_progress",
          "first_course",
          "chapman",
          "dessert",
          "completed",
          "cancelled",
          "broken_arrow",
        ];

        const unsortedJourneyData = Array.from(journeyCounts.entries()).map(([status, count]) => ({
          status,
          count,
        }));

        const sortedJourneyData = unsortedJourneyData
          .slice()
          .sort((a, b) => {
            const ai = orderedStatuses.indexOf(a.status);
            const bi = orderedStatuses.indexOf(b.status);
            if (ai === -1 && bi === -1) return a.status.localeCompare(b.status);
            if (ai === -1) return 1;
            if (bi === -1) return -1;
            return ai - bi;
          });

        setJourneyStatusData(sortedJourneyData);

        const incidentCounts = new Map<string, number>();
        incidentsArr.forEach((i: any) => {
          if (!i.severity) return;
          incidentCounts.set(i.severity, (incidentCounts.get(i.severity) ?? 0) + 1);
        });

        const incidentData = Array.from(incidentCounts.entries()).map(([severity, count]) => ({
          severity,
          count,
        }));
        setIncidentSeverityData(incidentData);

        const roleCounts = new Map<string, number>();
        usersArr.forEach((u: any) => {
          const role = u.role || "unknown";
          roleCounts.set(role, (roleCounts.get(role) ?? 0) + 1);
        });

        const roleDataArr = Array.from(roleCounts.entries()).map(([role, count]) => ({
          role,
          count,
        }));
        setRoleData(roleDataArr);

        const now = new Date();
        const start = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);

        const makeKey = (d: Date) => d.toISOString().slice(0, 10);

        const buildBaseSeries = (): TimeSeriesDatum[] => {
          const series: TimeSeriesDatum[] = [];
          for (let i = 6; i >= 0; i--) {
            const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
            const date = makeKey(d);
            const label = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
            series.push({ date, label, count: 0 });
          }
          return series;
        };

        const journeySeries = buildBaseSeries();
        const journeyIndex = new Map(journeySeries.map((pt, idx) => [pt.date, idx]));

        journeysArr.forEach((j: any) => {
          if (!j.created_at) return;
          const d = new Date(j.created_at);
          if (d < start || d > now) return;
          const key = makeKey(d);
          const idx = journeyIndex.get(key);
          if (idx === undefined) return;
          journeySeries[idx].count += 1;
        });

        setJourneyTrendData(journeySeries);

        const incidentSeries = buildBaseSeries();
        const incidentIndex = new Map(incidentSeries.map((pt, idx) => [pt.date, idx]));

        incidentsArr.forEach((i: any) => {
          if (!i.created_at) return;
          const d = new Date(i.created_at);
          if (d < start || d > now) return;
          const key = makeKey(d);
          const idx = incidentIndex.get(key);
          if (idx === undefined) return;
          incidentSeries[idx].count += 1;
        });

        setIncidentTrendData(incidentSeries);
      } catch (err) {
        console.error("Error loading dashboard analytics:", err);
        setError("Unable to load analytics right now.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [supabase]);

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="h-56 rounded-xl skeleton" />
        <div className="h-56 rounded-xl skeleton" />
        <div className="h-56 rounded-xl skeleton" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Operational Analytics</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const progress = animationProgress;

  const animatedJourneyStatusData =
    progress === 0
      ? journeyStatusData.map((d) => ({ ...d, count: 0 }))
      : journeyStatusData.map((d) => ({ ...d, count: d.count * progress }));

  const animatedIncidentSeverityData =
    progress === 0
      ? incidentSeverityData.map((d) => ({ ...d, count: 0 }))
      : incidentSeverityData.map((d) => ({ ...d, count: d.count * progress }));

  const animatedRoleData =
    progress === 0
      ? roleData.map((d) => ({ ...d, count: 0 }))
      : roleData.map((d) => ({ ...d, count: d.count * progress }));

  const animatedJourneyTrendData =
    progress === 0
      ? journeyTrendData.map((d) => ({ ...d, count: 0 }))
      : journeyTrendData.map((d) => ({ ...d, count: d.count * progress }));

  const animatedIncidentTrendData =
    progress === 0
      ? incidentTrendData.map((d) => ({ ...d, count: 0 }))
      : incidentTrendData.map((d) => ({ ...d, count: d.count * progress }));

  return (
    <div
      ref={containerRef}
      className="space-y-6 rounded-2xl border border-orange-100/60 bg-card/95 p-4 shadow-sm backdrop-blur-sm animate-fade-in dark:border-orange-500/20"
    >
      <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Operational Analytics</h2>
          <p className="text-xs text-muted-foreground">
            Live overview of journeys, incidents, and officers across TCNP operations.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="group relative overflow-hidden border border-orange-100/60 bg-white/90 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-primary/60 dark:bg-slate-900/80 dark:border-orange-500/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Journeys by Status</CardTitle>
            <CardDescription className="text-xs">Distribution of journeys across key stages</CardDescription>
          </CardHeader>
          <CardContent className="h-56">
            {journeyStatusData.length === 0 ? (
              <p className="text-xs text-muted-foreground">No journeys yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart key={animationKey} data={animatedJourneyStatusData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.3)" />
                  <XAxis
                    dataKey="status"
                    tickFormatter={(v) => JOURNEY_STATUS_LABELS[v] ?? v}
                    tick={{ fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    cursor={{ fill: "rgba(148, 163, 184, 0.15)" }}
                    formatter={(value: any) => [value, "Journeys"]}
                    labelFormatter={(label) => JOURNEY_STATUS_LABELS[label] ?? label}
                  />
                  <Bar
                    dataKey="count"
                    fill={CHART_COLORS.primary}
                    radius={[6, 6, 0, 0]}
                    isAnimationActive={true}
                    animationDuration={700}
                    animationEasing="ease-out"
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="group relative overflow-hidden border border-orange-100/60 bg-white/90 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-primary/60 dark:bg-slate-900/80 dark:border-orange-500/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Incidents by Severity</CardTitle>
            <CardDescription className="text-xs">Open and historical incident distribution</CardDescription>
          </CardHeader>
          <CardContent className="h-56">
            {incidentSeverityData.length === 0 ? (
              <p className="text-xs text-muted-foreground">No incidents recorded yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart key={animationKey}>
                  <Pie
                    data={animatedIncidentSeverityData}
                    dataKey="count"
                    nameKey="severity"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={4}
                    isAnimationActive={true}
                    animationDuration={800}
                    animationEasing="ease-out"
                  >
                    {incidentSeverityData.map((entry, index) => {
                      const severity = entry.severity;
                      const color =
                        severity === "low"
                          ? CHART_COLORS.green
                          : severity === "medium"
                          ? CHART_COLORS.amber
                          : severity === "high"
                          ? CHART_COLORS.red
                          : CHART_COLORS.purple;
                      return <Cell key={`cell-${index}`} fill={color} />;
                    })}
                  </Pie>
                  <Tooltip
                    formatter={(value: any, _name, ctx: any) => {
                      const severity = ctx?.payload?.severity;
                      return [value, INCIDENT_SEVERITY_LABELS[severity] ?? severity];
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="group relative overflow-hidden border border-orange-100/60 bg-white/90 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-primary/60 dark:bg-slate-900/80 dark:border-orange-500/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Officers by Role</CardTitle>
            <CardDescription className="text-xs">Distribution of command and protocol roles</CardDescription>
          </CardHeader>
          <CardContent className="h-56">
            {roleData.length === 0 ? (
              <p className="text-xs text-muted-foreground">No officers found.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart key={animationKey} data={animatedRoleData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.3)" />
                  <XAxis dataKey="role" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    formatter={(value: any) => [value, "Officers"]}
                    cursor={{ stroke: CHART_COLORS.primary, strokeWidth: 1 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke={CHART_COLORS.primary}
                    strokeWidth={2}
                    dot={{ r: 3, strokeWidth: 1, stroke: "#ffffff" }}
                    activeDot={{ r: 5 }}
                    isAnimationActive={true}
                    animationDuration={700}
                    animationEasing="ease-out"
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {(journeyTrendData.length > 0 || incidentTrendData.length > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="group relative overflow-hidden border border-orange-100/60 bg-white/90 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-primary/60 dark:bg-slate-900/80 dark:border-orange-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Journey Volume (7 days)</CardTitle>
              <CardDescription className="text-xs">Daily journeys created</CardDescription>
            </CardHeader>
            <CardContent className="h-56">
              {journeyTrendData.length === 0 ? (
                <p className="text-xs text-muted-foreground">No journeys in the last 7 days.</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart key={animationKey} data={animatedJourneyTrendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.3)" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(value: any) => [value, "Journeys"]} />
                    <Line
                      type="monotone"
                      dataKey="count"
                      stroke={CHART_COLORS.primary}
                      strokeWidth={2}
                      dot={{ r: 3, strokeWidth: 1, stroke: "#ffffff" }}
                      activeDot={{ r: 5 }}
                      isAnimationActive={true}
                      animationDuration={700}
                      animationEasing="ease-out"
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card className="group relative overflow-hidden border border-orange-100/60 bg-white/90 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-primary/60 dark:bg-slate-900/80 dark:border-orange-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Incident Volume (7 days)</CardTitle>
              <CardDescription className="text-xs">Daily incidents logged</CardDescription>
            </CardHeader>
            <CardContent className="h-56">
              {incidentTrendData.length === 0 ? (
                <p className="text-xs text-muted-foreground">No incidents in the last 7 days.</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart key={animationKey} data={animatedIncidentTrendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.3)" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(value: any) => [value, "Incidents"]} />
                    <Bar
                      dataKey="count"
                      fill={CHART_COLORS.red}
                      radius={[6, 6, 0, 0]}
                      isAnimationActive={true}
                      animationDuration={700}
                      animationEasing="ease-out"
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
