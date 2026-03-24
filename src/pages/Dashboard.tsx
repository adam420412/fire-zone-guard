import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { pl } from "date-fns/locale";
import {
  Building2, Briefcase, ClipboardList, Flame, AlertTriangle,
  Clock, Shield, TrendingUp, Loader2, FileText, CalendarIcon, Filter, X,
  CheckCircle2, Activity, Info, ChevronRight
} from "lucide-react";
import StatCard from "@/components/StatCard";
import { useDashboardStats, useTasks, useBuildings, useCompanies, useAudits, useProtocols } from "@/hooks/useSupabaseData";
import { safetyStatusConfig, priorityColors } from "@/lib/constants";
import type { SafetyStatus, TaskPriority } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import TaskDetailDialog from "@/components/TaskDetailDialog";
import DashboardCharts from "@/components/DashboardCharts";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export default function Dashboard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: stats, isLoading: statsLoading, isError: statsError, error: sErr } = useDashboardStats();
  const { data: tasks, isLoading: tasksLoading } = useTasks();
  const { data: buildings } = useBuildings(); // no blocking on buildings
  const { data: companies } = useCompanies();
  const { data: audits } = useAudits();
  const { data: protocols } = useProtocols();

  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [chartCompany, setChartCompany] = useState<string>("");
  const [chartDateFrom, setChartDateFrom] = useState<Date | undefined>();
  const [chartDateTo, setChartDateTo] = useState<Date | undefined>();

  const recentActivity = useMemo(() => {
    const act: any[] = [];
    if (tasks) tasks.slice(0, 5).forEach((t: any) => act.push({ type: 'task', date: new Date(t.created_at), title: t.title, building: t.buildingName, icon: ClipboardList, color: 'text-primary' }));
    if (audits) audits.slice(0, 3).forEach((a: any) => act.push({ type: 'audit', date: new Date(a.scheduled_for || a.created_at), title: `Audyt: ${a.type || 'Ogólny'}`, building: a.building_name, icon: Shield, color: 'text-success' }));
    if (protocols) protocols.slice(0, 3).forEach((p: any) => act.push({ type: 'protocol', date: new Date(p.performed_at), title: `Protokół: ${p.type}`, building: p.building_name, icon: FileText, color: 'text-warning' }));
    return act.sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 6);
  }, [tasks, audits, protocols]);

  const globalSafetyScore = useMemo(() => {
    if (!buildings || buildings.length === 0) return 100;
    const safeCount = buildings.filter((b: any) => b.safetyStatus === 'bezpieczny').length;
    return Math.round((safeCount / buildings.length) * 100);
  }, [buildings]);

  if (statsError) {
    return (
      <div className="flex flex-col h-64 items-center justify-center p-4 text-center">
        <AlertTriangle className="h-8 w-8 text-destructive mb-2" />
        <p className="text-sm font-semibold text-destructive">Błąd wczytywania danych.</p>
        <p className="text-xs text-muted-foreground break-all">{(sErr as any)?.message}</p>
      </div>
    );
  }

  if (statsLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const s = stats ?? { totalCompanies: 0, totalBuildings: 0, activeTasks: 0, criticalTasks: 0, overdueTasks: 0, avgSLA: 0, safeBuildings: 0 };
  const allTasks = (tasks ?? []) as any[];
  const criticalTasks = allTasks.filter(t => t.priority === "krytyczny" && t.status !== "Zamknięte");
  const overdueTasks = allTasks.filter(t => t.isOverdue);

  return (
    <div className="space-y-6">
      {/* Premium Hero Header */}
      <div className="relative overflow-hidden rounded-2xl bg-slate-900 px-6 py-8 text-white shadow-2xl">
        <div className="absolute right-0 top-0 h-full w-1/3 bg-gradient-to-l from-primary/20 to-transparent opacity-50" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <p className="text-xs font-medium uppercase tracking-widest text-slate-400">System Monitoringu PPOŻ</p>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl text-white">System Operacyjny<br/><span className="fire-gradient-text">Fire Zone Operator</span></h1>
            <p className="max-w-md text-sm text-slate-400">Widok globalny bezpieczeństwa pożarowego dla wszystkich kontrahentów i nadzorowanych obiektów.</p>
          </div>
          
          <div className="flex items-center gap-6 rounded-xl bg-white/5 p-4 backdrop-blur-md border border-white/10">
            <div className="text-center">
              <div className="relative inline-flex items-center justify-center">
                <svg className="h-20 w-20 transform -rotate-90">
                  <circle cx="40" cy="40" r="34" stroke="currentColor" strokeWidth="4" fill="transparent" className="text-white/10" />
                  <circle cx="40" cy="40" r="34" stroke="currentColor" strokeWidth="4" fill="transparent" strokeDasharray={213} strokeDashoffset={213 - (213 * globalSafetyScore) / 100} className="text-primary transition-all duration-1000 ease-out" />
                </svg>
                <span className="absolute text-lg font-bold">{globalSafetyScore}%</span>
              </div>
              <p className="mt-1 text-[10px] uppercase font-bold text-slate-400">Safety Score</p>
            </div>
            <div className="h-12 w-px bg-white/10 hidden sm:block" />
            <div className="hidden sm:block">
              <p className="text-2xl font-bold">{s.safeBuildings} / {s.totalBuildings}</p>
              <p className="text-[10px] uppercase font-bold text-slate-400">Obiekty Bezpieczne</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Briefcase} title="Firmy" value={s.totalCompanies} variant="default" linkTo="/companies" trend={{ value: 4, positive: true }} />
        <StatCard icon={Building2} title="Obiekty" value={s.totalBuildings} variant="default" linkTo="/buildings" trend={{ value: 12, positive: true }} />
        <StatCard icon={ClipboardList} title="Zadania" value={s.activeTasks} variant="fire" linkTo="/kanban" subtitle="Aktywne zlecenia" />
        <StatCard icon={TrendingUp} title="Średni SLA" value={`${s.avgSLA}%`} variant={s.avgSLA >= 90 ? "success" : "warning"} trend={{ value: 2.5, positive: true }} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={Flame} title="Krytyczne" value={s.criticalTasks} variant="critical" linkTo="/kanban" subtitle="Wymagają uwagi!" />
        <StatCard icon={AlertTriangle} title="Po terminie" value={s.overdueTasks} variant="warning" linkTo="/kanban" />
        <StatCard icon={Shield} title="Certyfikaty" value={8} variant="success" linkTo="/certificates" subtitle="Ważne licencje" />
      </div>

      {/* Analytics Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-bold">Analityka Operacyjna</h2>
          </div>
          
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("h-8 gap-1.5 text-xs", !chartDateFrom && "text-muted-foreground")}>
                  <CalendarIcon className="h-3 w-3" />
                  {chartDateFrom ? format(chartDateFrom, "dd.MM.yy", { locale: pl }) : "Zakres dat"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar mode="single" selected={chartDateFrom} onSelect={setChartDateFrom} initialFocus className="p-3" />
              </PopoverContent>
            </Popover>
            <select
              value={chartCompany}
              onChange={(e) => setChartCompany(e.target.value)}
              className="rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-primary"
            >
              <option value="">Wszystkie firmy</option>
              {(companies ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {(chartCompany || chartDateFrom) && (
              <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => { setChartCompany(""); setChartDateFrom(undefined); }}>
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        <DashboardCharts
          tasks={allTasks}
          companyId={chartCompany || undefined}
          dateFrom={chartDateFrom}
          dateTo={chartDateTo}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent Activity */}
        <div className="lg:col-span-1 rounded-xl border border-border bg-card overflow-hidden shadow-sm">
          <div className="flex items-center justify-between border-b border-border px-5 py-4 bg-secondary/20">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-bold uppercase tracking-tight">Ostatnia aktywność</h3>
            </div>
          </div>
          <div className="p-2 space-y-1">
            {recentActivity.map((act, i) => (
              <div key={i} className="flex items-start gap-3 rounded-lg p-3 hover:bg-secondary/50 transition-colors">
                <div className={cn("mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary", act.color)}>
                  <act.icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-card-foreground leading-tight line-clamp-1">{act.title}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{act.building}</p>
                  <p className="text-[9px] text-muted-foreground/60 mt-1 uppercase font-medium">
                    {format(act.date, "dd MMM HH:mm", { locale: pl })}
                  </p>
                </div>
              </div>
            ))}
            {recentActivity.length === 0 && (
              <p className="p-10 text-center text-xs text-muted-foreground italic">Brak nowych zdarzeń</p>
            )}
          </div>
        </div>

        {/* Critical Tasks */}
        <div className="lg:col-span-2 rounded-xl border border-border bg-card overflow-hidden shadow-sm">
          <div className="flex items-center justify-between border-b border-border px-5 py-4 bg-secondary/20">
            <div className="flex items-center gap-2">
              <Flame className="h-4 w-4 text-critical" />
              <h3 className="text-sm font-bold uppercase tracking-tight">Krytyczne i przeterminowane</h3>
            </div>
            <Button variant="ghost" size="sm" className="text-[10px] font-bold uppercase" onClick={() => navigate("/kanban")}>
              Zarządzaj <ChevronRight className="ml-1 h-3 w-3" />
            </Button>
          </div>

          {tasksLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : (
            <div className="divide-y divide-border">
              {[...criticalTasks, ...overdueTasks.filter((t: any) => t.priority !== "krytyczny")].slice(0, 5).map((task: any) => (
                <div
                  key={task.id}
                  onClick={() => setSelectedTask(task)}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-secondary/50 cursor-pointer transition-colors group"
                >
                  <div className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                    task.isOverdue ? "bg-critical/10 text-critical" : "bg-warning/10 text-warning"
                  )}>
                    {task.isOverdue ? <Clock className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-bold text-card-foreground group-hover:text-primary transition-colors">{task.title}</p>
                      <span className={cn("shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-extrabold uppercase", priorityColors[task.priority as TaskPriority])}>
                        {task.priority}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{task.buildingName} · {task.assigneeName}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-muted-foreground">{task.deadline ? format(new Date(task.deadline), "dd.MM.yyyy") : '—'}</p>
                    {task.isOverdue && <p className="text-[9px] font-bold text-critical uppercase">Spóźnione!</p>}
                  </div>
                </div>
              ))}
              {criticalTasks.length === 0 && overdueTasks.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <CheckCircle2 className="h-10 w-10 text-success/20 mb-3" />
                  <p className="text-sm font-medium text-muted-foreground">Wszystkie zadania krytyczne zostały wykonane!</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <TaskDetailDialog task={selectedTask} open={!!selectedTask} onOpenChange={(o) => !o && setSelectedTask(null)} />
    </div>
  );
}
