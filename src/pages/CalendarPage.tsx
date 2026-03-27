import { useState, useMemo } from "react";
import { useTasks } from "@/hooks/useSupabaseData";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, isToday, addMonths, subMonths, getDay } from "date-fns";
import { pl } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Calendar, AlertTriangle, Clock, CheckCircle2, Loader2 } from "lucide-react";
import { priorityColors } from "@/lib/constants";
import type { TaskPriority } from "@/lib/constants";
import TaskDetailDialog from "@/components/TaskDetailDialog";
import { useProtocols, useAudits, useMeetings, useCompanies, useBuildings, useCreateMeeting } from "@/hooks/useSupabaseData";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus } from "lucide-react";

const WEEKDAYS = ["Pon", "Wt", "Śr", "Czw", "Pt", "Sob", "Nie"];

function getTaskColor(task: any) {
  if (task._type === 'meeting') return "bg-purple-100 text-purple-700 border-purple-200";
  if (task._type === 'audit') return "bg-indigo-100 text-indigo-700 border-indigo-200";
  if (task._type === 'protocol') return "bg-orange-100 text-orange-700 border-orange-200";
  if (task.status === "Zamknięte") return "bg-success/20 text-success border-success/30";
  if (task.isOverdue) return "bg-critical/20 text-critical border-critical/30";
  if (task.priority === "krytyczny") return "bg-critical/10 text-critical border-critical/20";
  if (task.priority === "wysoki") return "bg-warning/10 text-warning border-warning/20";
  return "bg-primary/10 text-primary border-primary/20";
}

function CreateMeetingDialog({ open, onOpenChange }: { open: boolean, onOpenChange: (o: boolean) => void }) {
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
    
    createMeeting({
      title,
      meeting_date: new Date(meetingDate).toISOString(),
      company_id: companyId && companyId !== "none" ? companyId : null,
      organizer_id: user?.id
    }, {
      onSuccess: () => {
        toast.success("Spotkanie zaplanowane!");
        onOpenChange(false);
        setTitle("");
        setMeetingDate("");
      },
      onError: (err: any) => toast.error(err.message)
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Nowe Spotkanie</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Tytuł spotkania</Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Data i czas</Label>
              <Input type="datetime-local" value={meetingDate} onChange={e => setMeetingDate(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Wybierz klienta (opcjonalnie)</Label>
              <Select value={companyId} onValueChange={setCompanyId}>
                <SelectTrigger><SelectValue placeholder="Wybierz..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Brak (wewnętrzne)</SelectItem>
                  {companies?.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Anuluj</Button>
            <Button type="submit" disabled={isPending}>Dodaj spotkanie</Button>
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

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [isMeetingOpen, setIsMeetingOpen] = useState(false);

  const allTasks = (tasks ?? []) as any[];

  // Get tasks that have a deadline in the given day
  const getTasksForDay = (day: Date) => {
    const dayTasks = allTasks.filter(t => t.deadline && isSameDay(new Date(t.deadline), day)).map(t => ({ ...t, _type: 'task' }));
    
    const dayProtocols = (protocols ?? []).filter(p => p.performed_at && isSameDay(new Date(p.performed_at), day)).map(p => ({
      id: p.id, title: `Przegląd: ${p.type}`, status: p.status, deadline: p.performed_at, buildingName: p.building_name, priority: 'wysoki', _type: 'protocol'
    }));
    
    const dayAudits = (audits ?? []).filter(a => a.scheduled_for && isSameDay(new Date(a.scheduled_for), day)).map(a => ({
      id: a.id, title: `Audyt: ${a.type}`, status: a.status, deadline: a.scheduled_for, buildingName: a.building_name, priority: 'wysoki', _type: 'audit'
    }));

    const dayMeetings = (meetings ?? []).filter(m => m.meeting_date && isSameDay(new Date(m.meeting_date), day)).map(m => ({
      id: m.id, title: `Spotkanie: ${m.title}`, status: 'Otwarte', deadline: m.meeting_date, buildingName: m.buildings?.name || '', priority: 'normalny', _type: 'meeting'
    }));

    return [...dayTasks, ...dayProtocols, ...dayAudits, ...dayMeetings];
  };

  // Calendar grid days
  const calendarDays = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    const days = eachDayOfInterval({ start, end });

    // Pad start (Monday = 0)
    const startDow = (getDay(start) + 6) % 7; // Convert Sun=0 to Mon=0
    const padStart = Array.from({ length: startDow }, (_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() - (startDow - i));
      return d;
    });

    // Pad end to fill 6 rows
    const totalCells = Math.ceil((startDow + days.length) / 7) * 7;
    const padEnd = Array.from({ length: totalCells - days.length - startDow }, (_, i) => {
      const d = new Date(end);
      d.setDate(d.getDate() + i + 1);
      return d;
    });

    return [...padStart, ...days, ...padEnd];
  }, [currentMonth]);

  // Tasks for selected day or today
  const viewDay = selectedDay ?? new Date();
  const dayTasks = getTasksForDay(viewDay);

  // Monthly stats
  const monthTasks = allTasks.filter(t => t.deadline && isSameMonth(new Date(t.deadline), currentMonth));
  const monthOverdue = monthTasks.filter(t => t.isOverdue).length;
  const monthClosed = monthTasks.filter(t => t.status === "Zamknięte").length;

  if (tkL || prL || auL || mtL) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

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
            <p className="text-sm text-muted-foreground">Harmonogram zadań i terminów</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-3 text-sm text-muted-foreground mr-4">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-critical" />Zaległe: {monthOverdue}</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-success" />Zamknięte: {monthClosed}</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-primary" />Łącznie: {monthTasks.length}</span>
          </div>
          <Button onClick={() => setIsMeetingOpen(true)} className="fire-gradient">
            <Plus className="h-4 w-4 mr-2" />
            Nowe Spotkanie
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Calendar Grid */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {/* Month Navigation */}
          <div className="flex items-center justify-between border-b border-border px-5 py-4 bg-secondary/20">
            <button onClick={() => setCurrentMonth(m => subMonths(m, 1))} className="rounded-lg p-2 hover:bg-secondary transition-colors">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <h2 className="text-base font-bold capitalize">
              {format(currentMonth, "LLLL yyyy", { locale: pl })}
            </h2>
            <button onClick={() => setCurrentMonth(m => addMonths(m, 1))} className="rounded-lg p-2 hover:bg-secondary transition-colors">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 border-b border-border">
            {WEEKDAYS.map(d => (
              <div key={d} className="px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {d}
              </div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7">
            {calendarDays.map((day, i) => {
              const dayTasksCount = getTasksForDay(day);
              const overdueCount = dayTasksCount.filter(t => t.isOverdue).length;
              const isCurrentMonth = isSameMonth(day, currentMonth);
              const isSelected = selectedDay && isSameDay(day, selectedDay);
              const isTodayDay = isToday(day);

              return (
                <div
                  key={i}
                  onClick={() => setSelectedDay(prev => prev && isSameDay(prev, day) ? null : day)}
                  className={cn(
                    "min-h-[80px] border-b border-r border-border p-2 cursor-pointer transition-colors",
                    !isCurrentMonth && "opacity-30",
                    isSelected ? "bg-primary/10" : "hover:bg-secondary/40",
                  )}
                >
                  <div className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold mb-1",
                    isTodayDay ? "bg-primary text-primary-foreground" : "text-card-foreground",
                    isSelected && !isTodayDay && "ring-2 ring-primary text-primary"
                  )}>
                    {format(day, "d")}
                  </div>

                  <div className="space-y-0.5">
                    {dayTasksCount.slice(0, 3).map(task => (
                      <div
                        key={task.id}
                        onClick={e => { e.stopPropagation(); if(task._type === 'task') setSelectedTask(task); }}
                        className={cn("truncate rounded px-1 py-0.5 text-[9px] font-semibold border cursor-pointer hover:opacity-80 transition-opacity", getTaskColor(task))}
                      >
                        {task.title}
                      </div>
                    ))}
                    {dayTasksCount.length > 3 && (
                      <div className="text-[9px] text-muted-foreground font-medium pl-1">+{dayTasksCount.length - 3} więcej</div>
                    )}
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
            ) : dayTasks.map(task => (
              <button
                key={task.id}
                onClick={() => setSelectedTask(task)}
                className="w-full p-4 text-left hover:bg-secondary/50 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                    task.status === "Zamknięte" ? "bg-success/20" : task.isOverdue ? "bg-critical/20" : task._type === 'meeting' ? "bg-purple-200" : task._type === 'audit' ? "bg-indigo-200" : task._type === 'protocol' ? "bg-orange-200" : "bg-primary/20"
                  )}>
                    {task.status === "Zamknięte" ? <CheckCircle2 className="h-3 w-3 text-success" /> :
                      task.isOverdue ? <AlertTriangle className="h-3 w-3 text-critical" /> :
                      <Clock className={cn("h-3 w-3", task._type === 'meeting' ? "text-purple-700" : task._type === 'audit' ? "text-indigo-700" : task._type === 'protocol' ? "text-orange-700" : "text-primary")} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-card-foreground line-clamp-2">{task.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{task.buildingName}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className={cn("rounded-full px-1.5 py-0.5 text-[8px] font-extrabold uppercase", priorityColors[task.priority as TaskPriority])}>
                        {task.priority}
                      </span>
                      <span className="text-[10px] text-muted-foreground">{task.assigneeName}</span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <TaskDetailDialog task={selectedTask} open={!!selectedTask} onOpenChange={o => !o && setSelectedTask(null)} />
      <CreateMeetingDialog open={isMeetingOpen} onOpenChange={setIsMeetingOpen} />
    </div>
  );
}
