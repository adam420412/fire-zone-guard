import { TaskWithDetails } from "@/hooks/useSupabaseData";
import { priorityColors, taskTypeLabels } from "@/lib/constants";
import type { TaskPriority, TaskType } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Clock, User, Building2, AlertTriangle, Bell } from "lucide-react";

interface TaskCardProps {
  task: TaskWithDetails;
  onClick?: () => void;
}

export default function TaskCard({ task, onClick }: TaskCardProps) {
  const priority = task.priority as TaskPriority;
  const type = task.type as TaskType;

  // Get initials for assignee
  const initials = task.assigneeName && task.assigneeName !== "Nieprzypisany"
    ? task.assigneeName.split(" ").map(n => n[0]).join("").toUpperCase().substring(0, 2)
    : "?";

  const now = new Date();
  const deadlineDate = task.deadline ? new Date(task.deadline) : null;
  const isSlaWarning = deadlineDate && !task.isOverdue && (deadlineDate.getTime() - now.getTime()) < 48 * 60 * 60 * 1000;

  return (
    <div
      onClick={onClick}
      className={cn(
        "rounded-lg border bg-card p-3.5 card-hover cursor-pointer",
        task.isOverdue && "border-critical/40 bg-critical/5",
        isSlaWarning && "border-warning/50 bg-warning/5",
        priority === "krytyczny" && !task.isOverdue && !isSlaWarning && "border-warning/30"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-mono font-medium text-muted-foreground">{task.id.slice(0, 8)}</span>
        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", priorityColors[priority])}>
          {priority}
        </span>
      </div>

      <h4 className="mt-2 text-sm font-medium leading-snug text-card-foreground line-clamp-2">{task.title}</h4>

      <div className="mt-2">
        <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground">
          {taskTypeLabels[type]}
        </span>
      </div>

      <div className="mt-3 space-y-1.5">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Building2 className="h-3 w-3" />
          <span className="truncate">{task.buildingName}</span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <User className="h-3 w-3" />
          <span>{task.assigneeName}</span>
        </div>
        {task.deadline && deadlineDate && (
          <div className={cn(
            "flex items-center gap-1.5 text-[11px]",
            task.isOverdue ? "text-critical font-medium" : isSlaWarning ? "text-warning font-medium" : "text-muted-foreground"
          )}>
            {task.isOverdue ? <AlertTriangle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
            <span>{deadlineDate.toLocaleDateString("pl-PL")}</span>
            {task.isOverdue && <span className="text-[9px] uppercase tracking-wider">przeterminowane</span>}
            {isSlaWarning && <span className="text-[9px] uppercase tracking-wider text-warning">blisko SLA</span>}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          {task.hasReminders && (
            <div className="flex items-center gap-1 text-[10px] font-medium text-primary">
              <Bell className="h-3 w-3 animate-pulse" /> Przypomnienie
            </div>
          )}
        </div>
        <div 
          className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-[9px] font-bold text-secondary-foreground border border-border shrink-0"
          title={task.assigneeName}
        >
          {initials}
        </div>
      </div>
    </div>
  );
}
