import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useTasks, useBuildings } from "@/hooks/useSupabaseData";
import CreateTaskDialog from "@/components/CreateTaskDialog";
import TaskDetailDialog from "@/components/TaskDetailDialog";
import { TaskWithDetails } from "@/hooks/useSupabaseData";
import { safetyStatusConfig, priorityColors } from "@/lib/constants";
import type { SafetyStatus, TaskPriority } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  Building2, Plus, ClipboardList, Shield, Loader2, AlertTriangle
} from "lucide-react";

export default function ClientPanel() {
  const { user } = useAuth();
  const { data: tasks, isLoading: tasksLoading } = useTasks();
  const { data: buildings, isLoading: buildingsLoading } = useBuildings();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskWithDetails | null>(null);

  const activeTasks = (tasks ?? []).filter((t) => t.status !== "Zamknięte");
  const overdueTasks = activeTasks.filter((t) => t.isOverdue);

  if (tasksLoading || buildingsLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Panel Klienta</h1>
          <p className="text-sm text-muted-foreground">Podgląd statusu obiektów i zgłoszeń</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-md fire-gradient px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
        >
          <Plus className="h-4 w-4" />
          Nowe zgłoszenie
        </button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <ClipboardList className="h-4 w-4" />
            <span className="text-xs font-medium">Aktywne zgłoszenia</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-card-foreground">{activeTasks.length}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <span className="text-xs font-medium">Po terminie</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-warning">{overdueTasks.length}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Building2 className="h-4 w-4" />
            <span className="text-xs font-medium">Obiekty</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-card-foreground">{(buildings ?? []).length}</p>
        </div>
      </div>

      {/* Buildings Status */}
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-5 py-3">
          <Shield className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Status obiektów</h3>
        </div>
        <div className="divide-y divide-border">
          {(buildings ?? []).map((b) => {
            const status = (b.safetyStatus ?? "bezpieczny") as SafetyStatus;
            const conf = safetyStatusConfig[status];
            const Icon = conf.icon;
            return (
              <div key={b.id} className="flex items-center gap-3 px-5 py-3">
                <Icon className={cn("h-5 w-5 shrink-0", conf.color)} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-card-foreground">{b.name}</p>
                  <p className="text-xs text-muted-foreground">{b.address}</p>
                </div>
                <span className={cn("text-xs font-semibold", conf.color)}>{conf.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Active Tasks */}
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-5 py-3">
          <ClipboardList className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Aktywne zgłoszenia</h3>
        </div>
        <div className="divide-y divide-border">
          {activeTasks.length === 0 ? (
            <p className="px-5 py-6 text-center text-xs text-muted-foreground">Brak aktywnych zgłoszeń</p>
          ) : (
            activeTasks.map((task) => (
              <div
                key={task.id}
                onClick={() => setSelectedTask(task)}
                className="flex items-center gap-3 px-5 py-3 cursor-pointer card-hover"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-card-foreground">{task.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {task.buildingName} · {task.status}
                    {task.deadline && ` · ${new Date(task.deadline).toLocaleDateString("pl-PL")}`}
                  </p>
                </div>
                <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold", priorityColors[task.priority as TaskPriority])}>
                  {task.priority}
                </span>
                {task.isOverdue && (
                  <span className="text-[10px] font-medium text-critical uppercase">Przeterminowane</span>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <CreateTaskDialog open={showCreate} onOpenChange={setShowCreate} />
      <TaskDetailDialog task={selectedTask} open={!!selectedTask} onOpenChange={(o) => !o && setSelectedTask(null)} />
    </div>
  );
}
