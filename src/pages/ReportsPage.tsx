import { useMemo } from "react";
import { useSlaTickets } from "@/hooks/useSlaTickets";
import { useTasks, useBuildings, useAudits } from "@/hooks/useSupabaseData";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  BarChart3, Download, TrendingUp, AlertTriangle, CheckCircle2, Clock,
  FileBarChart, Building2, Wrench, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Faza 5 — Raporty / KPI
export default function ReportsPage() {
  const { data: tickets, isLoading: t1 } = useSlaTickets();
  const { data: tasks, isLoading: t2 } = useTasks();
  const { data: buildings, isLoading: t3 } = useBuildings();
  const { data: audits, isLoading: t4 } = useAudits();

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

    // SLA compliance %
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

  if (t1 || t2 || t3 || t4) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-6xl mx-auto">
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
        <Button variant="outline" className="gap-2" disabled>
          <Download className="h-4 w-4" />
          Eksport raportu PDF
        </Button>
      </div>

      {/* KPI GRID */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          label="Otwarte SLA"
          value={kpis.openSla}
          Icon={Wrench}
          color="text-blue-500"
        />
        <KpiCard
          label="Przekroczone SLA"
          value={kpis.breachedSla}
          Icon={AlertTriangle}
          color="text-red-500"
          danger={kpis.breachedSla > 0}
        />
        <KpiCard
          label="Zgodność SLA"
          value={`${kpis.slaCompliance}%`}
          Icon={CheckCircle2}
          color={kpis.slaCompliance >= 90 ? "text-green-500" : kpis.slaCompliance >= 70 ? "text-orange-500" : "text-red-500"}
        />
        <KpiCard
          label="Zamknięte (mies.)"
          value={kpis.closedThisMonth}
          Icon={TrendingUp}
          color="text-green-500"
        />
        <KpiCard
          label="Aktywne zadania"
          value={kpis.openTasks}
          Icon={Clock}
          color="text-purple-500"
        />
        <KpiCard
          label="Przeterminowane"
          value={kpis.overdueTasks}
          Icon={AlertTriangle}
          color="text-orange-500"
          danger={kpis.overdueTasks > 0}
        />
        <KpiCard
          label="Obiekty"
          value={kpis.totalBuildings}
          Icon={Building2}
          color="text-cyan-500"
        />
        <KpiCard
          label="Audyty (rok)"
          value={kpis.auditsThisYear}
          Icon={FileBarChart}
          color="text-indigo-500"
        />
      </div>

      {/* PLACEHOLDER PANELS */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card className="p-5">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Trend zgłoszeń SLA (12 miesięcy)
          </h3>
          <div className="h-48 flex items-center justify-center text-muted-foreground text-sm border border-dashed rounded">
            Wykres słupkowy — recharts (do dorobienia)
          </div>
        </Card>
        <Card className="p-5">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Czas naprawy wg priorytetu
          </h3>
          <div className="h-48 flex items-center justify-center text-muted-foreground text-sm border border-dashed rounded">
            Box plot — średni czas (do dorobienia)
          </div>
        </Card>
        <Card className="p-5 md:col-span-2">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Top 10 obiektów wg liczby zgłoszeń
          </h3>
          <div className="h-48 flex items-center justify-center text-muted-foreground text-sm border border-dashed rounded">
            Lista rankingowa (do dorobienia)
          </div>
        </Card>
      </div>

      <Card className="p-4 bg-blue-500/5 border-blue-500/30">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-blue-700 dark:text-blue-300">Scaffold Faza 5</p>
            <p className="text-muted-foreground mt-1">
              KPI cards działają na żywych danych. Wykresy (recharts), eksport PDF (jspdf),
              raport miesięczny dla zarządcy + raport dla klienta — w kolejnej iteracji.
            </p>
          </div>
        </div>
      </Card>
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
