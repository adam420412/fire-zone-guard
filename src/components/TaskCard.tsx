import { TaskWithDetails, useUpdateTask, useProfiles } from "@/hooks/useSupabaseData";
import { priorityColors, taskTypeLabels } from "@/lib/constants";
import type { TaskPriority, TaskType } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  Clock, User, Building2, AlertTriangle, Bell, Phone, Mail,
  ListTodo, FileText, Wallet, MoreHorizontal, CalendarDays, UserCog,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub,
  DropdownMenuSubTrigger, DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

interface TaskCardProps {
  task: TaskWithDetails;
  onClick?: () => void;
}

const quoteStatusBadge: Record<string, { label: string; cls: string }> = {
  "wersja robocza": { label: "Draft", cls: "bg-muted text-muted-foreground border border-border" },
  wyslana: { label: "Wysłana", cls: "bg-blue-500/15 text-blue-400 border border-blue-500/30" },
  wysłana: { label: "Wysłana", cls: "bg-blue-500/15 text-blue-400 border border-blue-500/30" },
  zaakceptowana: { label: "Zaakceptowana", cls: "bg-success/15 text-success border border-success/30" },
  odrzucona: { label: "Odrzucona", cls: "bg-destructive/15 text-destructive border border-destructive/30" },
  wygasla: { label: "Wygasła", cls: "bg-warning/15 text-warning border border-warning/30" },
  wygasła: { label: "Wygasła", cls: "bg-warning/15 text-warning border border-warning/30" },
};

function formatRelative(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const day = 24 * 60 * 60 * 1000;
  const diffDays = Math.floor(diffMs / day);
  if (diffDays <= 0) return "dziś";
  if (diffDays === 1) return "wczoraj";
  if (diffDays < 7) return `${diffDays} dni temu`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} tyg. temu`;
  return d.toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export default function TaskCard({ task, onClick }: TaskCardProps) {
  const priority = task.priority as TaskPriority;
  const type = task.type as TaskType;
  const updateTask = useUpdateTask();
  const { data: profiles } = useProfiles();
  const { toast } = useToast();
  const navigate = useNavigate();

  const initials = task.assigneeName && task.assigneeName !== "Nieprzypisany"
    ? task.assigneeName.split(" ").map(n => n[0]).join("").toUpperCase().substring(0, 2)
    : "?";

  const now = new Date();
  const deadlineDate = task.deadline ? new Date(task.deadline) : null;
  const isSlaWarning = deadlineDate && !task.isOverdue && (deadlineDate.getTime() - now.getTime()) < 48 * 60 * 60 * 1000;

  const handleQuickUpdate = (updates: any, label: string) => {
    updateTask.mutate(
      { id: task.id, ...updates },
      {
        onSuccess: () => toast({ title: label }),
        onError: () => toast({ title: "Błąd aktualizacji", variant: "destructive" }),
      }
    );
  };

  const shiftDeadline = (days: number) => {
    const base = task.deadline ? new Date(task.deadline) : new Date();
    base.setDate(base.getDate() + days);
    handleQuickUpdate({ deadline: base.toISOString() }, `Termin: ${base.toLocaleDateString("pl-PL")}`);
  };

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div
      onClick={onClick}
      className={cn(
        "group rounded-lg border bg-card p-3 card-hover cursor-pointer relative",
        task.isOverdue && "border-critical/40 bg-critical/5",
        isSlaWarning && "border-warning/50 bg-warning/5",
        priority === "krytyczny" && !task.isOverdue && !isSlaWarning && "border-warning/30"
      )}
    >
      {/* Header: ID + priority + quick menu */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-mono font-medium text-muted-foreground">{task.id.slice(0, 8)}</span>
        <div className="flex items-center gap-1">
          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", priorityColors[priority])}>
            {priority}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={stop}>
              <Button
                size="icon"
                variant="ghost"
                className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <MoreHorizontal className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={stop} className="w-56">
              <DropdownMenuLabel className="text-[10px] uppercase">Szybkie akcje</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <UserCog className="h-3.5 w-3.5 mr-2" /> Przypisz do…
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem onClick={() => handleQuickUpdate({ assignee_id: null }, "Odpięto przypisanie")}>
                    — Bez przypisania —
                  </DropdownMenuItem>
                  {(profiles ?? []).slice(0, 15).map((p: any) => (
                    <DropdownMenuItem
                      key={p.id}
                      onClick={() => handleQuickUpdate({ assignee_id: p.id }, `Przypisano: ${p.name}`)}
                    >
                      {p.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <CalendarDays className="h-3.5 w-3.5 mr-2" /> Przesuń termin
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem onClick={() => shiftDeadline(1)}>+1 dzień</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => shiftDeadline(3)}>+3 dni</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => shiftDeadline(7)}>+1 tydzień</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => shiftDeadline(-1)}>-1 dzień</DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[10px] uppercase">Priorytet</DropdownMenuLabel>
              {(["krytyczny", "wysoki", "średni", "niski"] as const).map((p) => (
                <DropdownMenuItem key={p} onClick={() => handleQuickUpdate({ priority: p }, `Priorytet: ${p}`)}>
                  <span className={cn("h-2 w-2 rounded-full mr-2", priorityColors[p as TaskPriority])} />
                  {p}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Title */}
      <h4 className="mt-2 text-sm font-medium leading-snug text-card-foreground line-clamp-2">{task.title}</h4>

      {/* Type + indicators row */}
      <div className="mt-2 flex items-center flex-wrap gap-1">
        <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground">
          {taskTypeLabels[type]}
        </span>
        {(task.subtasksTotal ?? 0) > 0 && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium",
              task.subtasksDone === task.subtasksTotal
                ? "bg-success/15 text-success"
                : "bg-secondary text-secondary-foreground"
            )}
            title={`${task.subtasksDone}/${task.subtasksTotal} podzadań ukończonych`}
          >
            <ListTodo className="h-2.5 w-2.5" />
            {task.subtasksDone}/{task.subtasksTotal}
          </span>
        )}
        {(task.quoteCount ?? 0) > 0 && task.quoteStatus && (() => {
          const meta = quoteStatusBadge[task.quoteStatus] ?? { label: task.quoteStatus, cls: "bg-secondary text-secondary-foreground border border-border" };
          const rel = formatRelative(task.quoteUpdatedAt);
          const tooltip = [
            `Oferta: ${meta.label}`,
            task.quoteNumber ? `Nr ${task.quoteNumber}` : null,
            (task.quoteCount ?? 0) > 1 ? `${task.quoteCount} ofert` : null,
            rel ? `Aktualizacja: ${rel}` : null,
          ].filter(Boolean).join(" · ");
          return (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const params = new URLSearchParams({ tab: "quotes", task: task.id });
                if ((task.quoteCount ?? 0) === 1 && task.quoteNumber) {
                  params.set("q", task.quoteNumber);
                }
                navigate(`/finance?${params.toString()}`);
              }}
              className={cn(
                "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium hover:ring-1 hover:ring-primary/40 transition",
                meta.cls
              )}
              title={`${tooltip} — kliknij, aby ${(task.quoteCount ?? 0) > 1 ? "zobaczyć listę ofert" : "otworzyć ofertę"}`}
            >
              <FileText className="h-2.5 w-2.5" />
              <span>{meta.label}</span>
              {(task.quoteCount ?? 0) > 1 && (
                <span className="opacity-70">×{task.quoteCount}</span>
              )}
              {rel && <span className="opacity-70">· {rel}</span>}
            </button>
          );
        })()}
        {(task.financialBalance ?? 0) !== 0 && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium",
              (task.financialBalance ?? 0) >= 0 ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
            )}
            title="Bilans finansowy zadania"
          >
            <Wallet className="h-2.5 w-2.5" />
            {Math.round(task.financialBalance ?? 0).toLocaleString("pl-PL")}
          </span>
        )}
        {task.hasReminders && (
          <span className="inline-flex items-center gap-0.5 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
            <Bell className="h-2.5 w-2.5" />
          </span>
        )}
      </div>

      {/* Client/building context */}
      <div className="mt-2.5 space-y-1">
        {task.companyName && (
          <div className="flex items-center gap-1.5 text-[11px] text-foreground/80 font-medium">
            <Building2 className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="truncate">{task.companyName}</span>
          </div>
        )}
        {task.buildingName && (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground pl-4">
            <span className="truncate">📍 {task.buildingName}</span>
          </div>
        )}
        {(task.contactPhone || task.contactEmail) && (
          <div className="flex items-center gap-2 text-[11px] pl-4">
            {task.contactPhone && (
              <a
                href={`tel:${task.contactPhone}`}
                onClick={stop}
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                <Phone className="h-2.5 w-2.5" /> {task.contactPhone}
              </a>
            )}
            {task.contactEmail && (
              <a
                href={`mailto:${task.contactEmail}`}
                onClick={stop}
                className="inline-flex items-center gap-1 text-primary hover:underline truncate"
                title={task.contactEmail}
              >
                <Mail className="h-2.5 w-2.5" />
              </a>
            )}
          </div>
        )}
      </div>

      {/* Footer: assignee + deadline */}
      <div className="flex items-center justify-between mt-3 pt-2 border-t border-border">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground min-w-0">
          <User className="h-3 w-3 shrink-0" />
          <span className="truncate">{task.assigneeName}</span>
        </div>
        <div className="flex items-center gap-2">
          {task.deadline && deadlineDate && (
            <div className={cn(
              "flex items-center gap-1 text-[10px] whitespace-nowrap",
              task.isOverdue ? "text-critical font-semibold" : isSlaWarning ? "text-warning font-medium" : "text-muted-foreground"
            )}>
              {task.isOverdue ? <AlertTriangle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
              <span>{deadlineDate.toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit" })}</span>
            </div>
          )}
          <div
            className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-[9px] font-bold text-secondary-foreground border border-border shrink-0"
            title={task.assigneeName}
          >
            {initials}
          </div>
        </div>
      </div>
    </div>
  );
}
