import { useMemo, useState } from "react";
import { useCompaniesWithStats, useTasks, useBuildings } from "@/hooks/useSupabaseData";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, ResponsiveContainer, AreaChart, Area,
  RadarChart, Radar, PolarGrid, PolarAngleAxis
} from "recharts";
import { format, subMonths, startOfMonth, endOfMonth, isWithinInterval, eachDayOfInterval, subDays } from "date-fns";
import { pl } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  TrendingUp, Shield, Building2, AlertTriangle,
  Award, Activity, ChevronDown
} from "lucide-react";
import { StatCardsSkeleton } from "@/components/PageSkeleton";

const CHART_BG = "hsl(220 18% 12%)";
const CHART_BORDER = "hsl(220 14% 18%)";
const CHART_MUTED = "hsl(220 10% 50%)";
const tooltipStyle = {
  contentStyle: { background: CHART_BG, border: `1px solid ${CHART_BORDER}`, borderRadius: 8, fontSize: 12, color: "hsl(40 10% 92%)" },
  itemStyle: { color: "hsl(40 10% 92%)" },
};

function getSlaColor(sla: number) {
  if (sla >= 90) return "text-success";
  if (sla >= 70) return "text-warning";
  return "text-critical";
}

function getSlaBarColor(sla: number) {
  if (sla >= 90) return "bg-success";
  if (sla >= 70) return "bg-warning";
  return "bg-critical";
}

export default function AnalyticsPage() {
  const { data: companies, isLoading: companiesLoading } = useCompaniesWithStats();
  const { data: tasks } = useTasks();
  const { data: buildings } = useBuildings();
  const [selectedMonths, setSelectedMonths] = useState(6);

  const allTasks = (tasks ?? []) as any[];

  // --- Trend zadań (wybrana liczba miesięcy) ---
  const trendData = useMemo(() => {
    const now = new Date();
    return Array.from({ length: selectedMonths }, (_, i) => {
      const month = subMonths(now, selectedMonths - 1 - i);
      const start = startOfMonth(month);
      const end = endOfMonth(month);
      const created = allTasks.filter(t => isWithinInterval(new Date(t.created_at), { start, end })).length;
      const closed = allTasks.filter(t => t.closed_at && isWithinInterval(new Date(t.closed_at), { start, end })).length;
      const overdue = allTasks.filter(t => t.isOverdue && isWithinInterval(new Date(t.created_at), { start, end })).length;
      return { name: format(month, "LLL", { locale: pl }), Utworzone: created, Zamknięte: closed, Zaległe: overdue };
    });
  }, [allTasks, selectedMonths]);

  // --- SLA per month ---
  const slaData = useMemo(() => {
    const now = new Date();
    return Array.from({ length: selectedMonths }, (_, i) => {
      const month = subMonths(now, selectedMonths - 1 - i);
      const start = startOfMonth(month);
      const end = endOfMonth(month);
      const closed = allTasks.filter(t => t.closed_at && isWithinInterval(new Date(t.closed_at), { start, end }));
      const slaOk = closed.filter(t => {
        const hours = (new Date(t.closed_at).getTime() - new Date(t.created_at).getTime()) / 3600000;
        return hours <= t.sla_hours;
      }).length;
      return { name: format(month, "LLL", { locale: pl }), SLA: closed.length > 0 ? Math.round((slaOk / closed.length) * 100) : 100 };
    });
  }, [allTasks, selectedMonths]);

  // --- Activity Heatmap (last 12 weeks) ---
  const heatmapData = useMemo(() => {
    const days = eachDayOfInterval({ start: subDays(new Date(), 83), end: new Date() });
    return days.map(day => {
      const dayStr = format(day, "yyyy-MM-dd");
      const count = allTasks.filter(t => t.created_at?.startsWith(dayStr)).length;
      return { date: day, count, label: format(day, "d MMM", { locale: pl }) };
    });
  }, [allTasks]);

  const maxCount = Math.max(...heatmapData.map(d => d.count), 1);

  // --- Company ranking ---
  const companyRanking = useMemo(() => {
    return [...(companies ?? [])]
      .sort((a, b) => (b as any).sla - (a as any).sla)
      .slice(0, 8)
      .map((c: any, i) => ({ ...c, rank: i + 1 }));
  }, [companies]);

  // --- Status breakdown ---
  const statusData = useMemo(() => {
    const counts: Record<string, number> = {};
    allTasks.forEach(t => { counts[t.status] = (counts[t.status] || 0) + 1; });
    const colors: Record<string, string> = {
      "Nowe": "hsl(28 100% 50%)",
      "Zaplanowane": "hsl(220 70% 60%)",
      "W trakcie": "hsl(38 92% 50%)",
      "Oczekuje": "hsl(220 10% 50%)",
      "Do weryfikacji": "hsl(270 60% 60%)",
      "Zamknięte": "hsl(142 71% 45%)",
    };
    return Object.entries(counts).map(([name, value]) => ({ name, value, color: colors[name] ?? "#888" }));
  }, [allTasks]);

  // --- Building safety breakdown ---
  const buildingSafety = useMemo(() => {
    const list = buildings ?? [];
    const safe = list.filter((b: any) => b.safetyStatus === "bezpieczny").length;
    const warn = list.filter((b: any) => b.safetyStatus === "ostrzeżenie").length;
    const crit = list.filter((b: any) => b.safetyStatus === "krytyczny").length;
    return [
      { name: "Bezpieczne", value: safe, color: "hsl(142 71% 45%)" },
      { name: "Ostrzeżenie", value: warn, color: "hsl(38 92% 50%)" },
      { name: "Krytyczne", value: crit, color: "hsl(0 84% 60%)" },
    ].filter(d => d.value > 0);
  }, [buildings]);

  // Global stats
  const totalTasks = allTasks.length;
  const closedTasks = allTasks.filter(t => t.status === "Zamknięte").length;
  const overdueTasks = allTasks.filter(t => t.isOverdue).length;
  const avgSLA = useMemo(() => {
    if (!companies || companies.length === 0) return 0;
    return Math.round((companies as any[]).reduce((s, c) => s + (c.sla ?? 0), 0) / companies.length);
  }, [companies]);

  if (companiesLoading) return <StatCardsSkeleton count={4} />;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <TrendingUp className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Analityka</h1>
            <p className="text-sm text-muted-foreground">Zaawansowane raporty i wskaźniki KPI</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Zakres:</span>
          <div className="relative">
            <select
              value={selectedMonths}
              onChange={e => setSelectedMonths(Number(e.target.value))}
              className="appearance-none rounded-lg border border-border bg-card px-3 py-1.5 pr-7 text-xs font-medium outline-none focus:border-primary"
            >
              <option value={3}>3 miesiące</option>
              <option value={6}>6 miesięcy</option>
              <option value={12}>12 miesięcy</option>
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Wszystkie zadania", value: totalTasks, icon: Activity, color: "text-primary", sub: `${closedTasks} zamkniętych` },
          { label: "Zaległe zadania", value: overdueTasks, icon: AlertTriangle, color: overdueTasks > 0 ? "text-critical" : "text-success", sub: overdueTasks > 0 ? "Wymagają uwagi!" : "Zero zaległości ✓" },
          { label: "Średni SLA", value: `${avgSLA}%`, icon: TrendingUp, color: avgSLA >= 90 ? "text-success" : avgSLA >= 70 ? "text-warning" : "text-critical", sub: avgSLA >= 90 ? "Znakomity" : "Do poprawy" },
          { label: "Obiekty bezpieczne", value: buildingSafety.find(s => s.name === "Bezpieczne")?.value ?? 0, icon: Shield, color: "text-success", sub: `z ${(buildings ?? []).length} łącznie` },
        ].map(({ label, value, icon: Icon, color, sub }) => (
          <div key={label} className="rounded-xl border border-border bg-card p-5 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
              <Icon className={cn("h-4 w-4", color)} />
            </div>
            <p className={cn("text-3xl font-extrabold tracking-tight", color)}>{value}</p>
            <p className="text-xs text-muted-foreground">{sub}</p>
          </div>
        ))}
      </div>

      {/* Charts row 1 */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Task Trend */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-4 text-sm font-semibold">Trend zadań — {selectedMonths} miesięcy</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={trendData} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_BORDER} />
              <XAxis dataKey="name" tick={{ fill: CHART_MUTED, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: CHART_MUTED, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip {...tooltipStyle} />
              <Bar dataKey="Utworzone" fill="hsl(28 100% 50%)" radius={[4,4,0,0]} maxBarSize={28} />
              <Bar dataKey="Zamknięte" fill="hsl(142 71% 45%)" radius={[4,4,0,0]} maxBarSize={28} />
              <Bar dataKey="Zaległe" fill="hsl(0 84% 60%)" radius={[4,4,0,0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-4 text-[11px] text-muted-foreground">
            {[["hsl(28 100% 50%)", "Utworzone"], ["hsl(142 71% 45%)", "Zamknięte"], ["hsl(0 84% 60%)", "Zaległe"]].map(([c, l]) => (
              <span key={l} className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-sm" style={{ background: c }} />{l}</span>
            ))}
          </div>
        </div>

        {/* SLA Trend */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-4 text-sm font-semibold">SLA Compliance — trend</h3>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={slaData}>
              <defs>
                <linearGradient id="slaGrad2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(142 71% 45%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(142 71% 45%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_BORDER} />
              <XAxis dataKey="name" tick={{ fill: CHART_MUTED, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fill: CHART_MUTED, fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip {...tooltipStyle} formatter={(v: number) => [`${v}%`, "SLA"]} />
              <Area type="monotone" dataKey="SLA" stroke="hsl(142 71% 45%)" fill="url(#slaGrad2)" strokeWidth={2.5} dot={{ r: 4, fill: "hsl(142 71% 45%)", strokeWidth: 0 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Charts row 2: Pie charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Status breakdown */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-4 text-sm font-semibold">Rozkład statusów zadań</h3>
          <div className="flex items-center gap-4">
            <ResponsiveContainer width={180} height={180}>
              <PieChart>
                <Pie data={statusData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value" stroke="none">
                  {statusData.map(e => <Cell key={e.name} fill={e.color} />)}
                </Pie>
                <Tooltip {...tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-2">
              {statusData.map(d => (
                <div key={d.name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: d.color }} />
                    <span className="text-muted-foreground">{d.name}</span>
                  </div>
                  <span className="font-semibold text-card-foreground">{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Building Safety */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-4 text-sm font-semibold flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" /> Status obiektów
          </h3>
          <div className="flex items-center gap-4">
            <ResponsiveContainer width={180} height={180}>
              <PieChart>
                <Pie data={buildingSafety} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value" stroke="none">
                  {buildingSafety.map(e => <Cell key={e.name} fill={e.color} />)}
                </Pie>
                <Tooltip {...tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-3">
              {buildingSafety.map(d => (
                <div key={d.name} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{d.name}</span>
                    <span className="font-bold" style={{ color: d.color }}>{d.value}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${Math.round(d.value / (buildings ?? [{ id: "x" }]).length * 100)}%`, background: d.color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Activity Heatmap */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="mb-4 text-sm font-semibold flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" /> Heatmapa aktywności — ostatnie 12 tygodni
        </h3>
        <div className="flex flex-wrap gap-1">
          {heatmapData.map((d, i) => {
            const intensity = d.count === 0 ? 0 : Math.ceil((d.count / maxCount) * 4);
            const bgMap = ["bg-secondary", "bg-primary/20", "bg-primary/40", "bg-primary/70", "bg-primary"];
            return (
              <div
                key={i}
                title={`${d.label}: ${d.count} zadań`}
                className={cn("h-3 w-3 rounded-sm transition-transform hover:scale-125 cursor-default", bgMap[intensity])}
              />
            );
          })}
        </div>
        <div className="mt-3 flex items-center gap-2 text-[10px] text-muted-foreground">
          <span>Mniej</span>
          {["bg-secondary", "bg-primary/20", "bg-primary/40", "bg-primary/70", "bg-primary"].map((c, i) => (
            <div key={i} className={cn("h-3 w-3 rounded-sm", c)} />
          ))}
          <span>Więcej</span>
        </div>
      </div>

      {/* Company Ranking */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border px-5 py-4 bg-secondary/20">
          <Award className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-bold uppercase tracking-tight">Ranking Firm wg SLA</h3>
        </div>
        <div className="divide-y divide-border">
          {companyRanking.map((c: any) => (
            <div key={c.id} className="flex items-center gap-4 px-5 py-4 hover:bg-secondary/30 transition-colors">
              <div className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-black",
                c.rank === 1 ? "bg-yellow-500/20 text-yellow-400" :
                c.rank === 2 ? "bg-slate-400/20 text-slate-400" :
                c.rank === 3 ? "bg-amber-700/20 text-amber-600" : "bg-secondary text-muted-foreground"
              )}>
                {c.rank}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-card-foreground truncate">{c.name}</p>
                <p className="text-xs text-muted-foreground">{c.buildingsCount} obiektów · {c.activeTasksCount} aktywnych zadań</p>
              </div>
              <div className="text-right">
                <p className={cn("text-lg font-extrabold", getSlaColor(c.sla))}>{c.sla}%</p>
                <p className="text-[10px] text-muted-foreground uppercase font-bold">SLA</p>
              </div>
              <div className="w-20 hidden sm:block">
                <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                  <div className={cn("h-full rounded-full transition-all", getSlaBarColor(c.sla))} style={{ width: `${c.sla}%` }} />
                </div>
              </div>
            </div>
          ))}
          {companyRanking.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground italic">Brak danych do rankingu</p>
          )}
        </div>
      </div>
    </div>
  );
}
