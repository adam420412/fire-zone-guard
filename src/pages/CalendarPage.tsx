import { useState, useMemo } from "react";
import { useTasks, useProfiles, useProtocols, useAudits, useMeetings, useCompanies, useBuildings, useCreateMeeting, useAllSubtasks } from "@/hooks/useSupabaseData";
import { useAuth } from "@/hooks/useAuth";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, isToday, addMonths, subMonths, getDay } from "date-fns";
import { pl } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Calendar, AlertTriangle, Clock, CheckCircle2, Loader2, Plus, Users, User } from "lucide-react";
import { priorityColors } from "@/lib/constants";
import type { TaskPriority } from "@/lib/constants";
import TaskDetailDialog from "@/components/TaskDetailDialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const WEEKDAYS = ["Pon", "Wt", "Śr", "Czw", "Pt", "Sob", "Nie"];

function getDeadlineColor(deadline: string | null, status: string | null) {
  if (status === "Zamknięte") return "bg-success/20 text-success border-success/30";
  if (!deadline) return "bg-primary/10 text-primary border-primary/20";
  const now = new Date();
  const dl = new Date(deadline);
  const diffMs = dl.getTime() - now.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  if (diffDays < 0) return "bg-critical/20 text-critical border-critical/30"; // overdue
  if (diffDays <= 2) return "bg-red-500/20 text-red-400 border-red-500/30"; // 2 days
  if (diffDays <= 4) return "bg-orange-500/20 text-orange-400 border-orange-500/30"; // 4 days
  if (diffDays <= 7) return "bg-yellow-500/20 text-yellow-500 border-yellow-500/30"; // 7 days
  return "bg-emerald-500/15 text-emerald-500 border-emerald-500/30"; // safe
}

function getTaskColor(task: any) {
  if (task._type === 'meeting') return "bg-accent/30 text-accent-foreground border-accent/40";
  if (task._type === 'audit') return "bg-secondary text-secondary-foreground border-border";
  if (task._type === 'protocol') return "bg-muted text-muted-foreground border-border";
  return getDeadlineColor(task.deadline, task.status);
}

function CreateMeetingDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data: companies } = useCompanies();
  const { data: buildings } = useBuildings();
  const { mutate: createMeeting, isPending } = useCreateMeeting();
  const { user } = useAuth();

  const [title, setTitle] = useState("");
  const [meetingDate, setMeetingDate] = useState("");
  const [companyId, setCompanyId] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !meetingDate) return;

    createMeeting(
      {
        title,
        meeting_date: new Date(meetingDate).toISOString(),
        company_id: companyId && companyId !== "none" ? companyId : companies?.[0]?.id,
        organizer_id: user?.id,
      },
      {
        onSuccess: () => {
          toast.success("Spotkanie zaplanowane!");
          onOpenChange(false);
          setTitle("");
          setMeetingDate("");
        },
        onError: (err: any) => toast.error(err.message),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Nowe Spotkanie</DialogTitle>
            <DialogDescription>Zaplanuj nowe spotkanie lub wizję lokalną.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Tytuł spotkania</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Data i czas</Label>
              <Input type="datetime-local" value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Wybierz klienta (opcjonalnie)</Label>
              <Select value={companyId} onValueChange={setCompanyId}>
                <SelectTrigger>
                  <SelectValue placeholder="Wybierz..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Brak (wewnętrzne)</SelectItem>
                  {companies?.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Anuluj
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Dodaj spotkanie
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function CalendarPage() {
  const { data: tasks, isLoading: tkL } = useTasks();
  const { data: protocols, isLoading: prL } = useProtocols();
  const { data: audits, isLoading: auL } = useAudits();
  const { data: meetings, isLoading: mtL } = useMeetings();
  const { data: profiles, isLoading: pfL } = useProfiles();
  const { data: allSubtasks } = useAllSubtasks();
  const { role, profileId } = useAuth();

  const isAdmin = role === "super_admin" || role === "admin";

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [isMeetingOpen, setIsMeetingOpen] = useState(false);
  // Employee filter: "all" for admins seeing everything, or a profile id
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("all");

  // Active employee filter id (non-admins always see own)
  const activeFilterId = isAdmin ? selectedEmployeeId : profileId;

  const allTasks = (tasks ?? []) as any[];

  // Filter items by employee (assignee)
  const filterByEmployee = (items: any[], assigneeField: string = "assignee_id") => {
    if (activeFilterId === "all") return items;
    if (!activeFilterId) return items;
    return items.filter((item) => {
      // For tasks: check assignee_id (which is a profile id)
      if (item[assigneeField] === activeFilterId) return true;
      // For meetings: check organizer_id  
      if (item.organizer_id === activeFilterId) return true;
      // Also check if the employee name is in attendees
      if (item.attendees) {
        const emp = profiles?.find((p) => p.id === activeFilterId);
        if (emp && item.attendees.toLowerCase().includes(emp.name.toLowerCase())) return true;
      }
      return false;
    });
  };

  const filteredTasks = useMemo(() => {
    if (activeFilterId === "all") return allTasks;
    return allTasks.filter((t) => t.assignee_id === activeFilterId);
  }, [allTasks, activeFilterId]);

  const filteredMeetings = useMemo(() => {
    const m = meetings ?? [];
    if (activeFilterId === "all") return m;
    return m.filter((mt: any) => {
      if (mt.organizer_id === activeFilterId) return true;
      if (mt.attendees) {
        const emp = profiles?.find((p) => p.id === activeFilterId);
        if (emp && mt.attendees.toLowerCase().includes(emp.name.toLowerCase())) return true;
      }
      return false;
    });
  }, [meetings, activeFilterId, profiles]);

  // Get items for a specific day
  const getTasksForDay = (day: Date) => {
    const dayTasks = filteredTasks
      .filter((t) => t.deadline && isSameDay(new Date(t.deadline), day))
      .map((t) => ({ ...t, _type: "task" }));

    const dayProtocols = (activeFilterId === "all" ? protocols ?? [] : [])
      .filter((p: any) => p.performed_at && isSameDay(new Date(p.performed_at), day))
      .map((p: any) => ({
        id: p.id,
        title: `Przegląd: ${p.type}`,
        status: p.status,
        deadline: p.performed_at,
        buildingName: p.building_name,
        priority: "wysoki",
        _type: "protocol",
      }));

    const dayAudits = (activeFilterId === "all" ? audits ?? [] : (audits ?? []).filter((a: any) => a.auditor_id === activeFilterId))
      .filter((a: any) => (a.performed_at || a.scheduled_for) && isSameDay(new Date(a.performed_at || a.scheduled_for), day))
      .map((a: any) => ({
        id: a.id,
        title: `Audyt: ${a.type}`,
        status: a.status,
        deadline: a.performed_at || a.scheduled_for,
        buildingName: a.building_name,
        priority: "wysoki",
        _type: "audit",
      }));

    const dayMeetings = filteredMeetings
      .filter((m: any) => m.meeting_date && isSameDay(new Date(m.meeting_date), day))
      .map((m: any) => ({
        id: m.id,
        title: `Spotkanie: ${m.title}`,
        status: "Otwarte",
        deadline: m.meeting_date,
        buildingName: m.buildings?.name || "",
        priority: "normalny",
        _type: "meeting",
        attendees: m.attendees,
      }));

    const daySubtasks = (allSubtasks ?? [])
      .filter((s: any) => {
        if (!s.deadline || !isSameDay(new Date(s.deadline), day)) return false;
        if (activeFilterId === "all") return true;
        return s.assignee_id === activeFilterId || s.created_by === activeFilterId;
      })
      .map((s: any) => ({
        id: s.id,
        title: `📋 ${s.title}`,
        status: s.status ?? "Nowe",
        deadline: s.deadline,
        buildingName: "",
        priority: "średni",
        _type: "subtask",
        taskTitle: s.taskTitle,
        assigneeName: s.assigneeName,
      }));

    return [...dayTasks, ...daySubtasks, ...dayProtocols, ...dayAudits, ...dayMeetings];
  };

  // Calendar grid
  const calendarDays = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    const days = eachDayOfInterval({ start, end });
    const startDow = (getDay(start) + 6) % 7;
    const padStart = Array.from({ length: startDow }, (_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() - (startDow - i));
      return d;
    });
    const totalCells = Math.ceil((startDow + days.length) / 7) * 7;
    const padEnd = Array.from({ length: totalCells - days.length - startDow }, (_, i) => {
      const d = new Date(end);
      d.setDate(d.getDate() + i + 1);
      return d;
    });
    return [...padStart, ...days, ...padEnd];
  }, [currentMonth]);

  const viewDay = selectedDay ?? new Date();
  const dayTasks = getTasksForDay(viewDay);

  const monthTasks = filteredTasks.filter((t) => t.deadline && isSameMonth(new Date(t.deadline), currentMonth));
  const monthOverdue = monthTasks.filter((t) => t.isOverdue).length;
  const monthClosed = monthTasks.filter((t) => t.status === "Zamknięte").length;

  const selectedEmployeeName = useMemo(() => {
    if (selectedEmployeeId === "all") return "Wszyscy";
    const p = profiles?.find((pr) => pr.id === selectedEmployeeId);
    return p?.name || "Pracownik";
  }, [selectedEmployeeId, profiles]);

  if (tkL || prL || auL || mtL || pfL)
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Calendar className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Kalendarz</h1>
            <p className="text-sm text-muted-foreground">
              {isAdmin
                ? `Harmonogram: ${selectedEmployeeName}`
                : "Twój harmonogram wizyt i zadań"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Employee Switcher — admin only */}
          {isAdmin && (
            <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
              <SelectTrigger className="w-[220px] h-9">
                <Users className="h-4 w-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Wybierz pracownika..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  <span className="flex items-center gap-2">
                    <Users className="h-3.5 w-3.5" />
                    Wszyscy pracownicy
                  </span>
                </SelectItem>
                {profiles?.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <span className="flex items-center gap-2">
                      <User className="h-3.5 w-3.5" />
                      {p.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <div className="hidden sm:flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              &gt;7 dni
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-yellow-500" />
              ≤7 dni
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-orange-500" />
              ≤4 dni
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              ≤2 dni
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-critical" />
              Zaległe: {monthOverdue}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-success" />
              Zamknięte: {monthClosed}
            </span>
          </div>
          <Button onClick={() => setIsMeetingOpen(true)} className="fire-gradient">
            <Plus className="h-4 w-4 mr-2" />
            Nowe Spotkanie
          </Button>
        </div>
      </div>

      {/* Active filter badge */}
      {activeFilterId !== "all" && (
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1.5 text-xs py-1 px-3">
            <User className="h-3 w-3" />
            Filtr: {selectedEmployeeName}
          </Badge>
          {isAdmin && (
            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setSelectedEmployeeId("all")}>
              Wyczyść filtr
            </Button>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Calendar Grid */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {/* Month Navigation */}
          <div className="flex items-center justify-between border-b border-border px-5 py-4 bg-secondary/20">
            <button onClick={() => setCurrentMonth((m) => subMonths(m, 1))} className="rounded-lg p-2 hover:bg-secondary transition-colors">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <h2 className="text-base font-bold capitalize">{format(currentMonth, "LLLL yyyy", { locale: pl })}</h2>
            <button onClick={() => setCurrentMonth((m) => addMonths(m, 1))} className="rounded-lg p-2 hover:bg-secondary transition-colors">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 border-b border-border">
            {WEEKDAYS.map((d) => (
              <div key={d} className="px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {d}
              </div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7">
            {calendarDays.map((day, i) => {
              const dayItems = getTasksForDay(day);
              const isCurrentMonth = isSameMonth(day, currentMonth);
              const isSelected = selectedDay && isSameDay(day, selectedDay);
              const isTodayDay = isToday(day);

              return (
                <div
                  key={i}
                  onClick={() => setSelectedDay((prev) => (prev && isSameDay(prev, day) ? null : day))}
                  className={cn(
                    "min-h-[80px] border-b border-r border-border p-2 cursor-pointer transition-colors",
                    !isCurrentMonth && "opacity-30",
                    isSelected ? "bg-primary/10" : "hover:bg-secondary/40"
                  )}
                >
                  <div
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold mb-1",
                      isTodayDay ? "bg-primary text-primary-foreground" : "text-card-foreground",
                      isSelected && !isTodayDay && "ring-2 ring-primary text-primary"
                    )}
                  >
                    {format(day, "d")}
                  </div>

                  <div className="space-y-0.5">
                    {dayItems.slice(0, 3).map((task) => (
                      <div
                        key={task.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (task._type === "task") setSelectedTask(task);
                        }}
                        className={cn(
                          "truncate rounded px-1 py-0.5 text-[9px] font-semibold border cursor-pointer hover:opacity-80 transition-opacity",
                          getTaskColor(task)
                        )}
                      >
                        {task.title}
                      </div>
                    ))}
                    {dayItems.length > 3 && <div className="text-[9px] text-muted-foreground font-medium pl-1">+{dayItems.length - 3} więcej</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Day Detail Panel */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="border-b border-border px-4 py-4 bg-secondary/20">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Zadania na dzień</p>
            <p className="text-lg font-bold capitalize">{format(viewDay, "EEEE, d MMMM", { locale: pl })}</p>
          </div>

          <div className="divide-y divide-border overflow-y-auto max-h-[500px]">
            {dayTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                <CheckCircle2 className="h-8 w-8 text-success/30 mb-3" />
                <p className="text-sm text-muted-foreground">Brak zadań na ten dzień</p>
                {!selectedDay && <p className="text-xs text-muted-foreground/60 mt-1">Kliknij w dzień aby zobaczyć zadania</p>}
              </div>
            ) : (
                <button
                  key={task.id}
                  onClick={() => { if (task._type === "task") setSelectedTask(task); }}
                  className="w-full p-4 text-left hover:bg-secondary/50 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      "mt-0.5 flex h-2 w-2 shrink-0 rounded-full",
                      getTaskColor(task).split(" ").find(c => c.startsWith("bg-")) ?? "bg-primary/20"
                    )} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "rounded px-1.5 py-0.5 text-[8px] font-bold uppercase",
                          task._type === "subtask" ? "bg-indigo-500/15 text-indigo-400" :
                          task._type === "meeting" ? "bg-accent/30 text-accent-foreground" :
                          task._type === "audit" ? "bg-secondary text-secondary-foreground" :
                          task._type === "protocol" ? "bg-muted text-muted-foreground" :
                          "bg-primary/10 text-primary"
                        )}>
                          {task._type === "subtask" ? "Podzadanie" :
                           task._type === "meeting" ? "Spotkanie" :
                           task._type === "audit" ? "Audyt" :
                           task._type === "protocol" ? "Protokół" : "Zadanie"}
                        </span>
                        {task.deadline && (
                          <span className={cn(
                            "text-[9px] font-bold",
                            getDeadlineColor(task.deadline, task.status).split(" ").find(c => c.startsWith("text-")) ?? "text-primary"
                          )}>
                            {format(new Date(task.deadline), "HH:mm", { locale: pl })}
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-card-foreground line-clamp-2 mt-1">{task.title}</p>
                      {task.buildingName && <p className="text-xs text-muted-foreground mt-0.5">{task.buildingName}</p>}
                      {task.taskTitle && <p className="text-[10px] text-muted-foreground/70 mt-0.5">↳ {task.taskTitle}</p>}
                      <div className="flex items-center gap-2 mt-1.5">
                        {task.assigneeName && (
                          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <User className="h-3 w-3" /> {task.assigneeName}
                          </span>
                        )}
                        {task.attendees && <span className="text-[10px] text-muted-foreground">{task.attendees}</span>}
                      </div>
                    </div>
                  </div>
                </button>
            )}
          </div>
        </div>
      </div>

      <TaskDetailDialog task={selectedTask} open={!!selectedTask} onOpenChange={(o) => !o && setSelectedTask(null)} />
      <CreateMeetingDialog open={isMeetingOpen} onOpenChange={setIsMeetingOpen} />
    </div>
  );
}
