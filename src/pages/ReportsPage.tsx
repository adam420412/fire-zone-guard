import { useMemo, useRef, useState } from "react";
import { useSlaTickets } from "@/hooks/useSlaTickets";
import { useTasks, useBuildings, useAudits } from "@/hooks/useSupabaseData";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  BarChart3, Download, TrendingUp, AlertTriangle, CheckCircle2, Clock,
  FileBarChart, Building2, Wrench, Loader2, Trophy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, Cell,
} from "recharts";
import { format, subMonths, startOfMonth, parseISO, differenceInHours } from "date-fns";
import { pl } from "date-fns/locale";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";

// =============================================================================
// Faza 5 — Raporty / KPI / wykresy / PDF
// =============================================================================

const PRIORITY_LABEL: Record<string, string> = {
  critical: "Krytyczny",
  high:     "Wysoki",
  normal:   "Średni",
  low:      "Niski",
};

const PRIORITY_COLOR: Record<string, string> = {
  critical: "#ef4444",
  high:     "#f97316",
  normal:   "#3b82f6",
  low:      "#10b981",
};

export default function ReportsPage() {
  const { data: tickets, isLoading: t1 } = useSlaTickets();
  const { data: tasks,   isLoading: t2 } = useTasks();
  const { data: buildings, isLoading: t3 } = useBuildings();
  const { data: audits,    isLoading: t4 } = useAudits();
  const [exporting, setExporting] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  const kpis = useMemo(() => {
    const allSla = tickets ?? [];
    const openSla = allSla.filter((t) => t.status !== "zamkniete" && t.status !== "niezasadne");
    const breachedSla = openSla.filter((t) => t.sla_response_breached || t.sla_resolution_breached);
    const closedThisMonth = allSla.filter((t) => {
      if (!t.closed_at) return false;
      const d = new Date(t.closed_at);
      const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });

    const allTasks = tasks ?? [];
    const openTasks = allTasks.filter((t: any) => t.status !== "Zamknięte");
    const overdueTasks = allTasks.filter((t: any) => t.isOverdue);

    const totalBuildings = (buildings ?? []).length;
    const auditsThisYear = (audits ?? []).filter((a: any) => {
      if (!a.created_at) return false;
      return new Date(a.created_at).getFullYear() === new Date().getFullYear();
    }).length;

    const closedTotal = allSla.filter((t) => t.closed_at).length;
    const closedOnTime = allSla.filter((t) => t.closed_at && !t.sla_resolution_breached).length;
    const slaCompliance = closedTotal > 0 ? Math.round((closedOnTime / closedTotal) * 100) : 100;

    return {
      openSla: openSla.length,
      breachedSla: breachedSla.length,
      closedThisMonth: closedThisMonth.length,
      openTasks: openTasks.length,
      overdueTasks: overdueTasks.length,
      totalBuildings,
      auditsThisYear,
      slaCompliance,
    };
  }, [tickets, tasks, buildings, audits]);

  // -----------------------------------------------------------------
  // Chart 1: Trend SLA - 12 miesięcy
  // -----------------------------------------------------------------
  const slaTrend = useMemo(() => {
    const allSla = tickets ?? [];
    const now = new Date();
    const months: { month: string; key: string; nowe: number; zamkniete: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = startOfMonth(subMonths(now, i));
      months.push({
        month: format(d, "LLL yy", { locale: pl }),
        key: format(d, "yyyy-MM"),
        nowe: 0,
        zamkniete: 0,
      });
    }
    const byKey = new Map(months.map((m) => [m.key, m]));
    allSla.forEach((t) => {
      const created = t.created_at ? format(parseISO(t.created_at), "yyyy-MM") : null;
      if (created && byKey.has(created)) byKey.get(created)!.nowe += 1;
      const closed = t.closed_at ? format(parseISO(t.closed_at), "yyyy-MM") : null;
      if (closed && byKey.has(closed)) byKey.get(closed)!.zamkniete += 1;
    });
    return months;
  }, [tickets]);

  // -----------------------------------------------------------------
  // Chart 2: Średni czas naprawy wg priorytetu (godziny)
  // -----------------------------------------------------------------
  const repairTimeByPriority = useMemo(() => {
    const buckets: Record<string, { sum: number; count: number }> = {
      critical: { sum: 0, count: 0 },
      high:     { sum: 0, count: 0 },
      normal:   { sum: 0, count: 0 },
      low:      { sum: 0, count: 0 },
    };
    (tickets ?? []).forEach((t) => {
      if (!t.created_at || !t.resolved_at) return;
      const hours = differenceInHours(parseISO(t.resolved_at), parseISO(t.created_at));
      if (hours < 0) return;
      const b = buckets[t.priority];
      if (!b) return;
      b.sum += hours;
      b.count += 1;
    });
    return (["critical", "high", "normal", "low"] as const).map((p) => ({
      priority: PRIORITY_LABEL[p],
      key: p,
      hours: buckets[p].count > 0 ? Math.round(buckets[p].sum / buckets[p].count) : 0,
      count: buckets[p].count,
    }));
  }, [tickets]);

  // -----------------------------------------------------------------
  // Chart 3: Top 10 obiektów wg liczby zgłoszeń
  // -----------------------------------------------------------------
  const topBuildings = useMemo(() => {
    const counts = new Map<string, { name: string; count: number }>();
    (tickets ?? []).forEach((t) => {
      if (!t.building_id) return;
      const name = t.building_name ?? "—";
      const cur = counts.get(t.building_id) ?? { name, count: 0 };
      cur.count += 1;
      counts.set(t.building_id, cur);
    });
    return Array.from(counts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [tickets]);

  // -----------------------------------------------------------------
  // PDF export
  // -----------------------------------------------------------------
  const handleExportPdf = () => {
    setExporting(true);
    try {
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = doc.internal.pageSize.getWidth();
      const today = format(new Date(), "d MMMM yyyy", { locale: pl });

      // Header
      doc.setFillColor(234, 88, 12); // orange-600
      doc.rect(0, 0, pageW, 22, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text("Fire Zone Guard - Raport operacyjny", 14, 14);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(today, pageW - 14, 14, { align: "right" });

      // KPIs
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("Kluczowe wskaźniki", 14, 32);

      autoTable(doc, {
        startY: 36,
        theme: "grid",
        styles: { fontSize: 9, cellPadding: 2 },
        headStyles: { fillColor: [234, 88, 12], textColor: [255, 255, 255] },
        head: [["Wskaźnik", "Wartość"]],
        body: [
          ["Otwarte zgłoszenia SLA", String(kpis.openSla)],
          ["Przekroczone SLA", String(kpis.breachedSla)],
          ["Zgodność SLA (%)", `${kpis.slaCompliance}%`],
          ["Zamknięte w bieżącym miesiącu", String(kpis.closedThisMonth)],
          ["Aktywne zadania", String(kpis.openTasks)],
          ["Przeterminowane zadania", String(kpis.overdueTasks)],
          ["Liczba obiektów", String(kpis.totalBuildings)],
          ["Audyty w bieżącym roku", String(kpis.auditsThisYear)],
        ],
      });

      // Trend SLA - tabela
      const trendY = (doc as any).lastAutoTable.finalY + 10;
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("Trend zgłoszeń SLA - ostatnie 12 miesięcy", 14, trendY);
      autoTable(doc, {
        startY: trendY + 4,
        theme: "striped",
        styles: { fontSize: 8 },
        headStyles: { fillColor: [234, 88, 12], textColor: [255, 255, 255] },
        head: [["Miesiąc", "Nowe", "Zamknięte"]],
        body: slaTrend.map((m) => [m.month, String(m.nowe), String(m.zamkniete)]),
      });

      // Średni czas naprawy
      const ptY = (doc as any).lastAutoTable.finalY + 10;
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("Średni czas naprawy wg priorytetu", 14, ptY);
      autoTable(doc, {
        startY: ptY + 4,
        theme: "striped",
        styles: { fontSize: 8 },
        headStyles: { fillColor: [234, 88, 12], textColor: [255, 255, 255] },
        head: [["Priorytet", "Średnio (godz.)", "Liczba zgłoszeń"]],
        body: repairTimeByPriority.map((r) => [r.priority, String(r.hours), String(r.count)]),
      });

      // Top 10
      if (topBuildings.length > 0) {
        const tbY = (doc as any).lastAutoTable.finalY + 10;
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.text("Top obiekty wg liczby zgłoszeń", 14, tbY);
        autoTable(doc, {
          startY: tbY + 4,
          theme: "striped",
          styles: { fontSize: 8 },
          headStyles: { fillColor: [234, 88, 12], textColor: [255, 255, 255] },
          head: [["#", "Obiekt", "Zgłoszenia"]],
          body: topBuildings.map((b, i) => [String(i + 1), b.name, String(b.count)]),
        });
      }

      // Footer
      const pageH = doc.internal.pageSize.getHeight();
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text("Wygenerowano przez Fire Zone Guard V2", 14, pageH - 8);
      doc.text(`Strona 1 / 1`, pageW - 14, pageH - 8, { align: "right" });

      doc.save(`raport-firezone-${format(new Date(), "yyyy-MM-dd")}.pdf`);
      toast.success("Raport PDF wygenerowany");
    } catch (err: any) {
      toast.error(err?.message ?? "Błąd generowania PDF");
    } finally {
      setExporting(false);
    }
  };

  if (t1 || t2 || t3 || t4) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const maxBuildingCount = Math.max(...topBuildings.map((b) => b.count), 1);

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-6xl mx-auto" ref={reportRef}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <BarChart3 className="h-7 w-7 text-orange-500" />
            Raporty i KPI
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Wskaźniki operacyjne, zgodność SLA, status obiektów.
          </p>
        </div>
        <Button
          onClick={handleExportPdf}
          disabled={exporting}
          variant="outline"
          className="gap-2"
        >
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Eksport raportu PDF
        </Button>
      </div>

      {/* KPI GRID */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Otwarte SLA"        value={kpis.openSla}            Icon={Wrench}         color="text-blue-500" />
        <KpiCard label="Przekroczone SLA"   value={kpis.breachedSla}        Icon={AlertTriangle}  color="text-red-500"
                 danger={kpis.breachedSla > 0} />
        <KpiCard label="Zgodność SLA"       value={`${kpis.slaCompliance}%`} Icon={CheckCircle2}
                 color={kpis.slaCompliance >= 90 ? "text-green-500" : kpis.slaCompliance >= 70 ? "text-orange-500" : "text-red-500"} />
        <KpiCard label="Zamknięte (mies.)"  value={kpis.closedThisMonth}    Icon={TrendingUp}     color="text-green-500" />
        <KpiCard label="Aktywne zadania"    value={kpis.openTasks}          Icon={Clock}          color="text-purple-500" />
        <KpiCard label="Przeterminowane"    value={kpis.overdueTasks}       Icon={AlertTriangle}  color="text-orange-500"
                 danger={kpis.overdueTasks > 0} />
        <KpiCard label="Obiekty"            value={kpis.totalBuildings}     Icon={Building2}      color="text-cyan-500" />
        <KpiCard label="Audyty (rok)"       value={kpis.auditsThisYear}     Icon={FileBarChart}   color="text-indigo-500" />
      </div>

      {/* CHARTS */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card className="p-5">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-orange-500" />
            Trend zgłoszeń SLA (12 miesięcy)
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={slaTrend} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="nowe"       name="Nowe"        fill="#f97316" radius={[4, 4, 0, 0]} />
                <Bar dataKey="zamkniete"  name="Zamknięte"   fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4 text-orange-500" />
            Średni czas naprawy wg priorytetu (godz.)
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={repairTimeByPriority} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="priority" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(value: any, _name, props: any) => [
                    `${value} godz. (${props.payload.count} zgł.)`,
                    "Średnio",
                  ]}
                />
                <Bar dataKey="hours" name="Średnio (godz.)" radius={[4, 4, 0, 0]}>
                  {repairTimeByPriority.map((entry) => (
                    <Cell key={entry.key} fill={PRIORITY_COLOR[entry.key]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          {repairTimeByPriority.every((r) => r.count === 0) && (
            <p className="text-xs text-muted-foreground text-center mt-2 italic">
              Brak danych — żadne SLA nie zostało jeszcze zamknięte.
            </p>
          )}
        </Card>

        <Card className="p-5 md:col-span-2">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Trophy className="h-4 w-4 text-orange-500" />
            Top 10 obiektów wg liczby zgłoszeń
          </h3>
          {topBuildings.length === 0 ? (
            <div className="h-32 flex items-center justify-center text-muted-foreground text-sm border border-dashed rounded">
              Brak zgłoszeń — żadne obiekty nie mają jeszcze zarejestrowanych SLA.
            </div>
          ) : (
            <div className="space-y-2">
              {topBuildings.map((b, i) => {
                const pct = Math.round((b.count / maxBuildingCount) * 100);
                return (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-6 text-xs font-bold text-muted-foreground text-right">
                      {i + 1}.
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <p className="text-sm font-medium truncate">{b.name}</p>
                        <span className="text-xs text-muted-foreground flex-shrink-0">
                          {b.count} {b.count === 1 ? "zgł." : "zgł."}
                        </span>
                      </div>
                      <div className="h-2 bg-secondary rounded overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded transition-all",
                            i === 0 ? "bg-red-500" : i < 3 ? "bg-orange-500" : "bg-blue-500"
                          )}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function KpiCard({
  label, value, Icon, color, danger = false,
}: {
  label: string;
  value: string | number;
  Icon: typeof BarChart3;
  color: string;
  danger?: boolean;
}) {
  return (
    <Card className={cn("p-4", danger && "border-destructive/40 bg-destructive/5")}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground uppercase font-semibold tracking-wide">{label}</span>
        <Icon className={cn("h-4 w-4", color)} />
      </div>
      <div className="text-2xl font-bold">{value}</div>
    </Card>
  );
}
