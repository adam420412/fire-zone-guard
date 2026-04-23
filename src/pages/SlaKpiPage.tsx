import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSlaTickets, type SlaTicket } from "@/hooks/useSlaTickets";
import { ShieldAlert, TrendingUp, TrendingDown, Building2, Briefcase, UserCircle2, Clock, CheckCircle2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend,
} from "recharts";
import { format, subMonths, startOfMonth, endOfMonth, isWithinInterval, isAfter } from "date-fns";
import { pl } from "date-fns/locale";

interface BreakdownRow {
  key: string;
  label: string;
  total: number;
  resolved: number;
  responseOk: number;
  resolutionOk: number;
  responseRate: number;
  resolutionRate: number;
  avgResolutionH: number | null;
  breached: number;
}

const TWELVE_MONTHS_AGO = subMonths(new Date(), 12);

function isResolved(t: SlaTicket): boolean {
  return !!(t.resolved_at || t.closed_at);
}
function isResponseOk(t: SlaTicket): boolean {
  if (!t.first_response_at || !t.sla_response_due) return false;
  return new Date(t.first_response_at) <= new Date(t.sla_response_due);
}
function isResolutionOk(t: SlaTicket): boolean {
  const closed = t.resolved_at || t.closed_at;
  if (!closed || !t.sla_resolution_due) return false;
  return new Date(closed) <= new Date(t.sla_resolution_due);
}
function isBreached(t: SlaTicket): boolean {
  if (t.sla_resolution_due) {
    const closed = t.resolved_at || t.closed_at;
    if (closed) return new Date(closed) > new Date(t.sla_resolution_due);
    return new Date() > new Date(t.sla_resolution_due);
  }
  return false;
}

function aggregate(tickets: SlaTicket[], keyFn: (t: SlaTicket) => { key: string; label: string } | null): BreakdownRow[] {
  const groups = new Map<string, { label: string; tickets: SlaTicket[] }>();
  tickets.forEach((t) => {
    const k = keyFn(t);
    if (!k) return;
    if (!groups.has(k.key)) groups.set(k.key, { label: k.label, tickets: [] });
    groups.get(k.key)!.tickets.push(t);
  });

  return Array.from(groups.entries()).map(([key, { label, tickets: ts }]) => {
    const resolved = ts.filter(isResolved);
    const responseOk = ts.filter(isResponseOk).length;
    const resolutionOk = ts.filter(isResolutionOk).length;
    const breached = ts.filter(isBreached).length;
    const responseTotal = ts.filter((t) => t.first_response_at).length;
    const durations = resolved
      .map((t) => {
        const closed = t.resolved_at || t.closed_at;
        if (!closed) return null;
        return (new Date(closed).getTime() - new Date(t.created_at).getTime()) / 3600000;
      })
      .filter((v): v is number => v !== null);
    const avgResolutionH = durations.length
      ? durations.reduce((s, v) => s + v, 0) / durations.length
      : null;

    return {
      key,
      label,
      total: ts.length,
      resolved: resolved.length,
      responseOk,
      resolutionOk,
      responseRate: responseTotal ? (responseOk / responseTotal) * 100 : 0,
      resolutionRate: resolved.length ? (resolutionOk / resolved.length) * 100 : 0,
      avgResolutionH,
      breached,
    };
  }).sort((a, b) => b.total - a.total);
}

function complianceColor(rate: number): string {
  if (rate >= 90) return "text-success";
  if (rate >= 70) return "text-warning";
  return "text-destructive";
}
function complianceBg(rate: number): string {
  if (rate >= 90) return "bg-success";
  if (rate >= 70) return "bg-warning";
  return "bg-destructive";
}

function BreakdownTable({ title, icon: Icon, rows }: { title: string; icon: typeof Building2; rows: BreakdownRow[] }) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Icon className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="ml-auto text-xs text-muted-foreground">{rows.length} {rows.length === 1 ? "pozycja" : "pozycji"}</span>
      </div>
      {rows.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-muted-foreground">Brak danych w okresie</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2 text-left font-bold">Nazwa</th>
                <th className="px-3 py-2 text-right font-bold">Zgł.</th>
                <th className="px-3 py-2 text-right font-bold">Rozw.</th>
                <th className="px-3 py-2 text-right font-bold" title="Reakcja w SLA">Reakcja %</th>
                <th className="px-3 py-2 text-right font-bold" title="Rozwiązanie w SLA">Rozw. %</th>
                <th className="px-3 py-2 text-right font-bold" title="Średni czas rozwiązania">Śr. czas</th>
                <th className="px-3 py-2 text-right font-bold" title="Przekroczenia SLA">Naruszenia</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-b border-border/50 transition-colors hover:bg-muted/30 last:border-b-0">
                  <td className="px-4 py-2.5 font-medium">{row.label}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{row.total}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">{row.resolved}</td>
                  <td className={cn("px-3 py-2.5 text-right font-mono font-semibold", complianceColor(row.responseRate))}>
                    {row.responseRate.toFixed(0)}%
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="h-1.5 w-12 overflow-hidden rounded-full bg-muted">
                        <div className={cn("h-full transition-all", complianceBg(row.resolutionRate))} style={{ width: `${row.resolutionRate}%` }} />
                      </div>
                      <span className={cn("font-mono font-semibold tabular-nums", complianceColor(row.resolutionRate))}>
                        {row.resolutionRate.toFixed(0)}%
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs text-muted-foreground">
                    {row.avgResolutionH !== null ? `${row.avgResolutionH.toFixed(1)}h` : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {row.breached > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded bg-destructive/15 px-1.5 py-0.5 font-mono text-xs font-semibold text-destructive">
                        <AlertTriangle className="h-3 w-3" />
                        {row.breached}
                      </span>
                    ) : (
                      <span className="font-mono text-xs text-muted-foreground">0</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface AssigneeProfile { id: string; name: string; email: string; }

function useProfiles() {
  return useQuery({
    queryKey: ["profiles", "all"],
    queryFn: async (): Promise<AssigneeProfile[]> => {
      const { data, error } = await supabase.from("profiles").select("id, name, email");
      if (error) throw error;
      return (data ?? []) as AssigneeProfile[];
    },
  });
}

export default function SlaKpiPage() {
  const { role } = useAuth();
  const { data: tickets = [], isLoading: ticketsLoading } = useSlaTickets();
  const { data: profiles = [], isLoading: profilesLoading } = useProfiles();

  const isAdmin = role === "super_admin" || role === "admin";

  const profileIndex = useMemo(() => {
    const m = new Map<string, AssigneeProfile>();
    profiles.forEach((p) => m.set(p.id, p));
    return m;
  }, [profiles]);

  const ticketsLast12Months = useMemo(
    () => tickets.filter((t) => isAfter(new Date(t.created_at), TWELVE_MONTHS_AGO)),
    [tickets],
  );

  const overall = useMemo(() => {
    const ts = ticketsLast12Months;
    const total = ts.length;
    const resolved = ts.filter(isResolved).length;
    const responseOk = ts.filter(isResponseOk).length;
    const responseTotal = ts.filter((t) => t.first_response_at).length;
    const resolutionOk = ts.filter(isResolutionOk).length;
    const breached = ts.filter(isBreached).length;
    return {
      total, resolved, breached,
      responseRate: responseTotal ? (responseOk / responseTotal) * 100 : 0,
      resolutionRate: resolved ? (resolutionOk / resolved) * 100 : 0,
    };
  }, [ticketsLast12Months]);

  const byCompany = useMemo(
    () => aggregate(ticketsLast12Months, (t) =>
      t.company_id ? { key: t.company_id, label: t.company_name ?? "—" } : { key: "_none", label: "Bez firmy" }
    ),
    [ticketsLast12Months],
  );

  const byBuilding = useMemo(
    () => aggregate(ticketsLast12Months, (t) =>
      t.building_id ? { key: t.building_id, label: t.building_name ?? "—" } : null
    ),
    [ticketsLast12Months],
  );

  const byAssignee = useMemo(
    () => aggregate(ticketsLast12Months, (t) => {
      if (!t.assigned_to) return { key: "_unassigned", label: "Nieprzypisane" };
      const p = profileIndex.get(t.assigned_to);
      return { key: t.assigned_to, label: p?.name ?? t.assigned_to_name ?? "—" };
    }),
    [ticketsLast12Months, profileIndex],
  );

  const monthlyTrend = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const month = subMonths(new Date(), 11 - i);
      const start = startOfMonth(month);
      const end = endOfMonth(month);
      const inMonth = ticketsLast12Months.filter((t) =>
        isWithinInterval(new Date(t.created_at), { start, end })
      );
      const resolved = inMonth.filter(isResolved);
      const resolutionOk = inMonth.filter(isResolutionOk).length;
      const responseOk = inMonth.filter(isResponseOk).length;
      const responseTotal = inMonth.filter((t) => t.first_response_at).length;
      return {
        name: format(month, "LLL", { locale: pl }),
        Zgloszenia: inMonth.length,
        Rozwiazane: resolved.length,
        ReakcjaPct: responseTotal ? Math.round((responseOk / responseTotal) * 100) : 0,
        RozwiazaniePct: resolved.length ? Math.round((resolutionOk / resolved.length) * 100) : 0,
      };
    });
  }, [ticketsLast12Months]);

  const tooltipStyle = {
    contentStyle: {
      background: "hsl(var(--card))",
      border: "1px solid hsl(var(--border))",
      borderRadius: 8,
      fontSize: 12,
      color: "hsl(var(--foreground))",
    },
    itemStyle: { color: "hsl(var(--foreground))" },
  };

  if (!isAdmin) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <ShieldAlert className="h-12 w-12 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Brak dostępu</h2>
        <p className="text-sm text-muted-foreground">Ten widok jest dostępny tylko dla administratorów.</p>
      </div>
    );
  }

  const isLoading = ticketsLoading || profilesLoading;

  return (
    <div className="flex h-full flex-col">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">KPI SLA</h1>
        <p className="text-sm text-muted-foreground">
          Wskaźniki zgodności SLA w podziale na firmy, obiekty i osoby przypisane (ostatnie 12 miesięcy)
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">Ładowanie KPI...</div>
      ) : (
        <div className="flex-1 space-y-6 overflow-y-auto pb-6 scrollbar-thin">
          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase text-muted-foreground">Zgłoszeń</span>
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <div className="mt-2 text-3xl font-bold">{overall.total}</div>
              <div className="mt-1 text-[11px] text-muted-foreground">w ostatnich 12 mies.</div>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase text-muted-foreground">Rozwiązane</span>
                <CheckCircle2 className="h-3.5 w-3.5 text-success" />
              </div>
              <div className="mt-2 text-3xl font-bold text-success">{overall.resolved}</div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                {overall.total ? Math.round((overall.resolved / overall.total) * 100) : 0}% wszystkich
              </div>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase text-muted-foreground">Reakcja w SLA</span>
                <TrendingUp className={cn("h-3.5 w-3.5", complianceColor(overall.responseRate))} />
              </div>
              <div className={cn("mt-2 text-3xl font-bold", complianceColor(overall.responseRate))}>
                {overall.responseRate.toFixed(1)}%
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">first response on time</div>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase text-muted-foreground">Rozw. w SLA</span>
                <TrendingUp className={cn("h-3.5 w-3.5", complianceColor(overall.resolutionRate))} />
              </div>
              <div className={cn("mt-2 text-3xl font-bold", complianceColor(overall.resolutionRate))}>
                {overall.resolutionRate.toFixed(1)}%
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">resolution on time</div>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase text-muted-foreground">Naruszenia</span>
                <TrendingDown className="h-3.5 w-3.5 text-destructive" />
              </div>
              <div className="mt-2 text-3xl font-bold text-destructive">{overall.breached}</div>
              <div className="mt-1 text-[11px] text-muted-foreground">przekroczone deadline'y</div>
            </div>
          </div>

          {/* Trend charts */}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-border bg-card p-5">
              <h3 className="mb-4 text-sm font-semibold">Wolumen zgłoszeń (12 mies.)</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={monthlyTrend} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip {...tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Zgloszenia" name="Zgłoszone" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Rozwiazane" name="Rozwiązane" fill="hsl(142 71% 45%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="rounded-lg border border-border bg-card p-5">
              <h3 className="mb-4 text-sm font-semibold">Compliance % (12 mies.)</h3>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={monthlyTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip {...tooltipStyle} formatter={(v: number) => `${v}%`} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="ReakcjaPct" name="Reakcja" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="RozwiazaniePct" name="Rozwiązanie" stroke="hsl(142 71% 45%)" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Breakdown tables */}
          <BreakdownTable title="Wg firmy" icon={Briefcase} rows={byCompany} />
          <BreakdownTable title="Wg obiektu" icon={Building2} rows={byBuilding} />
          <BreakdownTable title="Wg osoby przypisanej" icon={UserCircle2} rows={byAssignee} />
        </div>
      )}
    </div>
  );
}
