import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { pl } from "date-fns/locale";
import {
  Building2, Briefcase, ClipboardList, Flame, AlertTriangle,
  Clock, Shield, TrendingUp, Loader2, FileText, CalendarIcon, Filter, X
} from "lucide-react";
import StatCard from "@/components/StatCard";
import { useDashboardStats, useTasks, useBuildings, useCompanies } from "@/hooks/useSupabaseData";
import { safetyStatusConfig, priorityColors } from "@/lib/constants";
import type { SafetyStatus, TaskPriority } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import TaskDetailDialog from "@/components/TaskDetailDialog";
import DashboardCharts from "@/components/DashboardCharts";
import { TaskWithDetails } from "@/hooks/useSupabaseData";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export default function Dashboard() {
  const navigate = useNavigate();
  const { data: stats, isLoading: statsLoading, isError: statsError, error: sErr } = useDashboardStats();
  const { data: tasks, isLoading: tasksLoading, isError: tasksError, error: tErr } = useTasks();
  const { data: buildings, isLoading: buildingsLoading, isError: buildingsError, error: bErr } = useBuildings();
  const { data: companies } = useCompanies();
  const [selectedTask, setSelectedTask] = useState<TaskWithDetails | null>(null);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [chartCompany, setChartCompany] = useState<string>("");
  const [chartDateFrom, setChartDateFrom] = useState<Date | undefined>();
  const [chartDateTo, setChartDateTo] = useState<Date | undefined>();

  if (statsError || tasksError || buildingsError) {
    return (
      <div className="flex flex-col h-64 items-center justify-center p-4 text-center">
        <AlertTriangle className="h-8 w-8 text-destructive mb-2" />
        <p className="text-sm font-semibold text-destructive">Wystąpił błąd wczytywania danych.</p>
        <p className="text-xs text-muted-foreground break-all">{sErr?.message || tErr?.message || bErr?.message}</p>
      </div>
    );
  }

  if (statsLoading || tasksLoading || buildingsLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const s = stats ?? { totalCompanies: 0, totalBuildings: 0, activeTasks: 0, criticalTasks: 0, overdueTasks: 0, avgSLA: 0, safeBuildings: 0 };
  const criticalTasks = (tasks ?? []).filter(t => t.priority === "krytyczny" && t.status !== "Zamknięte");
  const overdueTasks = (tasks ?? []).filter(t => t.isOverdue);

  const handleGenerateReport = async () => {
    setGeneratingReport(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-report", {
        body: { type: "annual_report" },
      });
      if (error) throw error;

      // Generate PDF-like content and download
      const reportHtml = buildReportHtml(data);
      const blob = new Blob([reportHtml], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `raport-roczny-ppoz-${new Date().toISOString().split("T")[0]}.html`;
      a.click();
      URL.revokeObjectURL(url);

      toast({ title: "Raport wygenerowany", description: "Plik został pobrany." });
    } catch (err: any) {
      toast({ title: "Błąd", description: err.message, variant: "destructive" });
    } finally {
      setGeneratingReport(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Panel Super Admina – widok globalny systemu</p>
        </div>
        <Button onClick={handleGenerateReport} disabled={generatingReport} variant="outline" className="gap-2">
          {generatingReport ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
          Raport roczny
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Briefcase} title="Firmy" value={s.totalCompanies} variant="default" linkTo="/companies" />
        <StatCard icon={Building2} title="Obiekty" value={s.totalBuildings} variant="default" linkTo="/buildings" />
        <StatCard icon={ClipboardList} title="Aktywne zadania" value={s.activeTasks} variant="fire" linkTo="/kanban" />
        <StatCard icon={TrendingUp} title="Średni SLA" value={`${s.avgSLA}%`} variant={s.avgSLA >= 90 ? "success" : "warning"} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={Flame} title="Zadania krytyczne" value={s.criticalTasks} variant="critical" linkTo="/kanban" />
        <StatCard icon={AlertTriangle} title="Po terminie" value={s.overdueTasks} variant="warning" linkTo="/kanban" />
        <StatCard icon={Shield} title="Obiekty bezpieczne" value={s.safeBuildings} variant="success" linkTo="/buildings" />
      </div>

      {/* Chart Filters */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">Filtry wykresów:</span>

        <select
          value={chartCompany}
          onChange={(e) => setChartCompany(e.target.value)}
          className="rounded-md border border-border bg-secondary px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-primary"
        >
          <option value="">Wszystkie firmy</option>
          {(companies ?? []).map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn("h-8 gap-1.5 text-xs", !chartDateFrom && "text-muted-foreground")}>
              <CalendarIcon className="h-3 w-3" />
              {chartDateFrom ? format(chartDateFrom, "dd MMM yyyy", { locale: pl }) : "Od daty"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={chartDateFrom} onSelect={setChartDateFrom} initialFocus className="p-3 pointer-events-auto" />
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn("h-8 gap-1.5 text-xs", !chartDateTo && "text-muted-foreground")}>
              <CalendarIcon className="h-3 w-3" />
              {chartDateTo ? format(chartDateTo, "dd MMM yyyy", { locale: pl }) : "Do daty"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={chartDateTo} onSelect={setChartDateTo} initialFocus className="p-3 pointer-events-auto" />
          </PopoverContent>
        </Popover>

        {(chartCompany || chartDateFrom || chartDateTo) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => { setChartCompany(""); setChartDateFrom(undefined); setChartDateTo(undefined); }}
          >
            <X className="h-3 w-3" /> Wyczyść
          </Button>
        )}
      </div>

      <DashboardCharts
        tasks={tasks ?? []}
        companyId={chartCompany || undefined}
        dateFrom={chartDateFrom}
        dateTo={chartDateTo}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Critical & Overdue Tasks */}
        <div className="rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <div className="flex items-center gap-2">
              <Flame className="h-4 w-4 text-critical" />
              <h3 className="text-sm font-semibold">Zadania krytyczne & przeterminowane</h3>
            </div>
            <button onClick={() => navigate("/kanban")} className="text-xs text-primary hover:underline">
              Zobacz wszystkie →
            </button>
          </div>
          <div className="divide-y divide-border">
            {[...criticalTasks, ...overdueTasks.filter(t => t.priority !== "krytyczny")].slice(0, 5).map((task) => (
              <div
                key={task.id}
                onClick={() => setSelectedTask(task)}
                className="flex items-center gap-4 px-5 py-3 card-hover cursor-pointer"
              >
                <div className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                  task.isOverdue ? "bg-critical/20" : "bg-warning/20"
                )}>
                  {task.isOverdue ? <Clock className="h-4 w-4 text-critical" /> : <AlertTriangle className="h-4 w-4 text-warning" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-card-foreground">{task.title}</p>
                  <p className="text-xs text-muted-foreground">{task.buildingName} · {task.assigneeName}</p>
                </div>
                <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold", priorityColors[task.priority as TaskPriority])}>
                  {task.priority}
                </span>
              </div>
            ))}
            {criticalTasks.length === 0 && overdueTasks.length === 0 && (
              <p className="px-5 py-6 text-center text-xs text-muted-foreground">Brak zadań krytycznych</p>
            )}
          </div>
        </div>

        {/* Buildings Safety */}
        <div className="rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Status bezpieczeństwa obiektów</h3>
            </div>
            <button onClick={() => navigate("/buildings")} className="text-xs text-primary hover:underline">
              Zobacz wszystkie →
            </button>
          </div>
          <div className="divide-y divide-border">
            {(buildings ?? []).map((building) => {
              const status = (building.safetyStatus ?? "bezpieczny") as SafetyStatus;
              const statusConf = safetyStatusConfig[status];
              const StatusIcon = statusConf.icon;
              return (
                <div
                  key={building.id}
                  onClick={() => navigate("/buildings")}
                  className="flex items-center gap-3 px-5 py-3 card-hover cursor-pointer"
                >
                  <StatusIcon className={cn("h-5 w-5 shrink-0", statusConf.color)} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-card-foreground">{building.name}</p>
                    <p className="text-xs text-muted-foreground">{building.companyName}</p>
                  </div>
                  <div className="text-right">
                    <p className={cn("text-xs font-semibold", statusConf.color)}>{statusConf.label}</p>
                    {(building.overdueTasksCount ?? 0) > 0 && (
                      <p className="text-[10px] text-critical">{building.overdueTasksCount} zaległe</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <TaskDetailDialog task={selectedTask} open={!!selectedTask} onOpenChange={(o) => !o && setSelectedTask(null)} />
    </div>
  );
}

function buildReportHtml(data: any): string {
  const summary = data.summary ?? {};
  const buildings = data.buildings_status ?? [];
  return `<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="UTF-8">
<title>Raport Roczny PPOŻ – ${data.period?.from} – ${data.period?.to}</title>
<style>
  body{font-family:system-ui,sans-serif;max-width:800px;margin:40px auto;padding:0 20px;color:#1a1a1a}
  h1{color:#e63946;border-bottom:3px solid #e63946;padding-bottom:8px}
  h2{color:#333;margin-top:32px}
  table{width:100%;border-collapse:collapse;margin:16px 0}
  th,td{border:1px solid #ddd;padding:8px 12px;text-align:left}
  th{background:#f5f5f5;font-weight:600}
  .stat{display:inline-block;background:#f9f9f9;border:1px solid #eee;border-radius:8px;padding:16px 24px;margin:8px;text-align:center}
  .stat .val{font-size:28px;font-weight:700;color:#e63946}
  .stat .lbl{font-size:12px;color:#666;margin-top:4px}
  .safe{color:#2d6a4f}.warn{color:#e9c46a}.crit{color:#e63946}
  @media print{body{margin:0}}
</style>
</head>
<body>
<h1>🔥 Raport Roczny PPOŻ</h1>
<p>Okres: <strong>${data.period?.from}</strong> – <strong>${data.period?.to}</strong></p>
<p>Wygenerowano: ${new Date(data.generated_at).toLocaleString("pl-PL")}</p>

<h2>Podsumowanie</h2>
<div>
  <div class="stat"><div class="val">${summary.total_companies ?? 0}</div><div class="lbl">Firm</div></div>
  <div class="stat"><div class="val">${summary.total_buildings ?? 0}</div><div class="lbl">Obiektów</div></div>
  <div class="stat"><div class="val">${summary.total_tasks_created ?? 0}</div><div class="lbl">Zadań utworzonych</div></div>
  <div class="stat"><div class="val">${summary.tasks_closed ?? 0}</div><div class="lbl">Zadań zamkniętych</div></div>
  <div class="stat"><div class="val">${summary.sla_compliance_pct ?? 0}%</div><div class="lbl">Zgodność SLA</div></div>
  <div class="stat"><div class="val">${summary.inspections_performed ?? 0}</div><div class="lbl">Przeglądów</div></div>
  <div class="stat"><div class="val">${summary.evacuations_performed ?? 0}</div><div class="lbl">Ewakuacji</div></div>
</div>

<h2>Status obiektów</h2>
<table>
  <thead><tr><th>Obiekt</th><th>Firma</th><th>Adres</th><th>Status</th><th>IBP ważne do</th></tr></thead>
  <tbody>
    ${buildings.map((b: any) => `<tr>
      <td>${b.name}</td><td>${b.company}</td><td>${b.address}</td>
      <td class="${b.safety_status === 'bezpieczny' ? 'safe' : b.safety_status === 'ostrzeżenie' ? 'warn' : 'crit'}">${b.safety_status}</td>
      <td>${b.ibp_valid_until ?? '—'}</td>
    </tr>`).join("")}
  </tbody>
</table>

<p style="margin-top:40px;font-size:11px;color:#999">Wygenerowano automatycznie przez system FireZone PPOŻ</p>
</body></html>`;
}
