// =============================================================================
// ServicemanDashboard — mobilny widok dla serwisanta.
// Priorytet: "co mam dziś zrobić" — lista zleceń + szybkie akcje.
// =============================================================================
import { useState, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useTasks, useUpdateTask } from "@/hooks/useSupabaseData";
import TaskDetailDialog from "@/components/TaskDetailDialog";
import type { TaskWithDetails } from "@/hooks/useSupabaseData";
import { format, isToday, isTomorrow, isPast, differenceInHours } from "date-fns";
import { pl } from "date-fns/locale";
import {
  MapPin, Phone, Clock, CheckCircle2, AlertTriangle, Navigation,
  Wrench, ChevronRight, Flame, Calendar, User,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const STATUS_FLOW: Record<string, string> = {
  "Nowe": "W realizacji",
  "W realizacji": "Zamknięte",
};

const STATUS_LABEL: Record<string, string> = {
  "Nowe": "Zacznij",
  "W realizacji": "Zakończ",
};

const STATUS_COLORS: Record<string, string> = {
  "Nowe": "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800",
  "W realizacji": "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800",
  "Zamknięte": "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800",
};

const PRIORITY_DOT: Record<string, string> = {
  krytyczny: "bg-red-500",
  wysoki: "bg-orange-500",
  średni: "bg-yellow-500",
  niski: "bg-slate-400",
};

function urgencyLabel(deadline?: string | null): { label: string; color: string } | null {
  if (!deadline) return null;
  const d = new Date(deadline);
  if (isPast(d)) return { label: "Przeterminowane", color: "text-red-600 dark:text-red-400" };
  if (isToday(d)) return { label: "Dziś", color: "text-amber-600 dark:text-amber-400" };
  if (isTomorrow(d)) return { label: "Jutro", color: "text-yellow-600 dark:text-yellow-400" };
  return null;
}

function TaskRow({ task, onOpen }: { task: TaskWithDetails; onOpen: () => void }) {
  const updateTask = useUpdateTask();
  const urgency = urgencyLabel(task.deadline);
  const nextStatus = STATUS_FLOW[task.status ?? ""];

  const handleAdvance = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!nextStatus) return;
    try {
      await updateTask.mutateAsync({ id: task.id, status: nextStatus as any });
      if (nextStatus === "Zamknięte") {
        toast.success("Zlecenie zamknięte!", {
          description: "AI generuje projekt protokołu...",
          action: { label: "Zobacz", onClick: onOpen },
        });
      } else {
        toast.success(`Status zmieniony na: ${nextStatus}`);
      }
    } catch {
      toast.error("Nie udało się zaktualizować statusu");
    }
  };

  return (
    <button
      onClick={onOpen}
      className="w-full text-left rounded-xl border bg-card p-4 shadow-sm transition-all active:scale-[0.99] hover:border-primary/30 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          {/* Priority dot */}
          <span className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", PRIORITY_DOT[task.priority ?? "niski"])} />
          <div className="min-w-0">
            <p className="font-semibold text-sm leading-snug line-clamp-2">{task.title}</p>
            {task.buildingName && (
              <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="truncate">{task.buildingName}</span>
              </p>
            )}
          </div>
        </div>

        {/* Status badge */}
        <Badge variant="outline" className={cn("shrink-0 text-[10px] font-medium", STATUS_COLORS[task.status ?? "Nowe"])}>
          {task.status}
        </Badge>
      </div>

      {/* Meta row */}
      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {task.deadline && (
            <span className={cn("flex items-center gap-1", urgency?.color)}>
              <Clock className="h-3 w-3" />
              {urgency?.label ?? format(new Date(task.deadline), "d MMM", { locale: pl })}
            </span>
          )}
          {task.assigneeName && (
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" />
              {task.assigneeName}
            </span>
          )}
        </div>

        {nextStatus && (
          <Button
            size="sm"
            variant={nextStatus === "Zamknięte" ? "default" : "secondary"}
            className="h-7 text-xs gap-1 shrink-0"
            onClick={handleAdvance}
            disabled={updateTask.isPending}
          >
            {nextStatus === "Zamknięte" ? (
              <><CheckCircle2 className="h-3.5 w-3.5" /> {STATUS_LABEL[task.status ?? "Nowe"]}</>
            ) : (
              <><Wrench className="h-3.5 w-3.5" /> {STATUS_LABEL[task.status ?? "Nowe"]}</>
            )}
          </Button>
        )}
      </div>
    </button>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function ServicemanDashboard() {
  const { user } = useAuth();
  const { data: allTasks, isLoading } = useTasks();
  const [selectedTask, setSelectedTask] = useState<TaskWithDetails | null>(null);
  const [filter, setFilter] = useState<"today" | "active" | "all">("today");

  // Only show tasks assigned to this serviceman
  const myTasks = useMemo(() => {
    return (allTasks ?? []).filter((t) => t.status !== "Zamknięte");
  }, [allTasks]);

  const filteredTasks = useMemo(() => {
    const today = new Date();
    switch (filter) {
      case "today":
        return myTasks.filter((t) => {
          if (!t.deadline) return false;
          const d = new Date(t.deadline);
          return isToday(d) || isPast(d) || t.status === "W trakcie";
        });
      case "active":
        return myTasks.filter((t) => t.status === "W trakcie");
      default:
        return myTasks;
    }
  }, [myTasks, filter]);

  const inProgress = myTasks.filter((t) => t.status === "W trakcie");
  const overdue = myTasks.filter((t) => t.isOverdue);
  const todayCount = myTasks.filter((t) => t.deadline && isToday(new Date(t.deadline))).length;

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Dzień dobry";
    if (h < 18) return "Cześć";
    return "Dobry wieczór";
  };

  return (
    <div className="min-h-screen bg-background pb-28">
      {/* Header */}
      <div className="bg-gradient-to-br from-primary/90 to-primary px-4 pt-8 pb-6 text-primary-foreground">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20">
            <Flame className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm opacity-80">{greeting()}</p>
            <h1 className="text-lg font-bold leading-tight">Moje zlecenia</h1>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Na dziś", value: todayCount, color: "bg-white/20" },
            { label: "W realizacji", value: inProgress.length, color: "bg-amber-400/30" },
            { label: "Przeterminowane", value: overdue.length, color: overdue.length > 0 ? "bg-red-400/30" : "bg-white/10" },
          ].map((stat) => (
            <div key={stat.label} className={cn("rounded-xl p-3 text-center", stat.color)}>
              <p className="text-2xl font-bold">{stat.value}</p>
              <p className="text-[10px] opacity-80 mt-0.5">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-4 py-2">
        <div className="flex gap-2">
          {(["today", "active", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                filter === f
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80",
              )}
            >
              {f === "today" && `Dziś (${todayCount})`}
              {f === "active" && `W trakcie (${inProgress.length})`}
              {f === "all" && `Wszystkie (${myTasks.length})`}
            </button>
          ))}
        </div>
      </div>

      {/* Task list */}
      <div className="px-4 pt-4 space-y-3">
        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
        )}

        {!isLoading && filteredTasks.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
            <CheckCircle2 className="h-12 w-12 mb-3 opacity-30" />
            <p className="font-medium">Brak zleceń</p>
            <p className="text-sm mt-1">
              {filter === "today" ? "Nie masz nic zaplanowanego na dziś" : "Wszystko wykonane"}
            </p>
          </div>
        )}

        {filteredTasks.map((task) => (
          <TaskRow key={task.id} task={task} onOpen={() => setSelectedTask(task)} />
        ))}
      </div>

      {/* Task detail dialog */}
      {selectedTask && (
        <TaskDetailDialog
          task={selectedTask}
          open={!!selectedTask}
          onOpenChange={(o) => { if (!o) setSelectedTask(null); }}
        />
      )}
    </div>
  );
}
