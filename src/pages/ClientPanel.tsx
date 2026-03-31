import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useTasks, useBuildings, useProtocols, useAudits, useMeetings } from "@/hooks/useSupabaseData";
import CreateTicketDialog from "@/components/CreateTicketDialog";
import TaskDetailDialog from "@/components/TaskDetailDialog";
import { TaskWithDetails } from "@/hooks/useSupabaseData";
import { generateReportPDF } from "@/lib/pdfGenerator";
import { safetyStatusConfig, priorityColors } from "@/lib/constants";
import type { SafetyStatus, TaskPriority } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { format, parseISO, isPast, isToday } from "date-fns";
import { pl } from "date-fns/locale";
import {
  Building2, Plus, ClipboardList, Shield, Loader2, AlertTriangle, FileText, Download, Calendar, Clock, Users, MapPin
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function ClientPanel() {
  const { user } = useAuth();
  const { data: tasks, isLoading: tasksLoading } = useTasks();
  const { data: buildings, isLoading: buildingsLoading } = useBuildings();
  const { data: protocols, isLoading: protocolsLoading } = useProtocols();
  const { data: audits, isLoading: auditsLoading } = useAudits();
  const { data: meetings, isLoading: meetingsLoading } = useMeetings();

  const [showCreate, setShowCreate] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskWithDetails | null>(null);

  const activeTasks = (tasks ?? []).filter((t) => t.status !== "Zamknięte");
  const overdueTasks = activeTasks.filter((t) => t.isOverdue);

  // Upcoming meetings (today + future)
  const upcomingMeetings = (meetings ?? [])
    .filter((m: any) => {
      if (!m.meeting_date) return false;
      const d = parseISO(m.meeting_date);
      return isToday(d) || !isPast(d);
    })
    .sort((a: any, b: any) => new Date(a.meeting_date).getTime() - new Date(b.meeting_date).getTime());

  // Past meetings (last 10)
  const pastMeetings = (meetings ?? [])
    .filter((m: any) => {
      if (!m.meeting_date) return false;
      const d = parseISO(m.meeting_date);
      return isPast(d) && !isToday(d);
    })
    .sort((a: any, b: any) => new Date(b.meeting_date).getTime() - new Date(a.meeting_date).getTime())
    .slice(0, 10);

  const approvedDocs = [
    ...(protocols ?? []).filter((p: any) => p.status === "Zatwierdzony").map((p: any) => ({ ...p, docType: "Protokół Serwisowy", docTitle: p.type })),
    ...(audits ?? []).filter((a: any) => a.status === "Zatwierdzony").map((a: any) => ({ ...a, docType: "Audyt PPOŻ", docTitle: a.title }))
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const handleDownloadPdf = (doc: any) => {
    generateReportPDF({
      title: doc.docType === "Audyt PPOŻ" ? `Raport z Audytu: ${doc.docTitle}` : `Protokół: ${doc.docTitle}`,
      subtitle: doc.buildingName || "Obiekt Fire Zone",
      metadata: [
        { label: "Data wygenerowania", value: new Date(doc.created_at).toLocaleDateString("pl-PL") },
        { label: "Wykonawca", value: doc.inspectorName || "Fire Zone Guard" },
        { label: "Status", value: doc.status },
        { label: "Wynik końcowy", value: doc.overall_result || "Brak uwag" }
      ],
      tableColumns: doc.docType === "Audyt PPOŻ" ? ["Kategoria", "Pytanie", "Wynik"] : ["Typ Sprzętu", "Szczegół", "Wynik"],
      tableData: doc.docType === "Audyt PPOŻ" 
        ? (doc.items || []).map((i: any) => [i.category || "Ogólne", i.question, i.answer])
        : (doc.measurements || []).map((m: any) => [m.device_type || "Sprzęt", m.device_name || "-", m.result || "-"]),
      filename: `${doc.docType.replace(" ", "_")}_${new Date().getTime()}.pdf`
    });
  };

  if (tasksLoading || buildingsLoading || protocolsLoading || auditsLoading || meetingsLoading) {
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
          <p className="text-sm text-muted-foreground">Podgląd statusu obiektów, zgłoszeń i wizyt</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 transition-colors"
        >
          <AlertTriangle className="h-4 w-4" />
          Zgłoś Usterkę
        </button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
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
            <Calendar className="h-4 w-4 text-primary" />
            <span className="text-xs font-medium">Planowane wizyty</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-primary">{upcomingMeetings.length}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Building2 className="h-4 w-4" />
            <span className="text-xs font-medium">Obiekty</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-card-foreground">{(buildings ?? []).length}</p>
        </div>
      </div>

      {/* Upcoming Meetings / Visits */}
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-5 py-3">
          <Calendar className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Zaplanowane wizyty i spotkania</h3>
          <Badge variant="secondary" className="ml-auto text-[10px]">{upcomingMeetings.length}</Badge>
        </div>
        <div className="divide-y divide-border">
          {upcomingMeetings.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Calendar className="h-8 w-8 text-muted-foreground/20 mb-2" />
              <p className="text-xs text-muted-foreground">Brak zaplanowanych wizyt</p>
            </div>
          ) : (
            upcomingMeetings.map((m: any) => {
              const meetingDate = parseISO(m.meeting_date);
              const isTodayMeeting = isToday(meetingDate);

              return (
                <div key={m.id} className={cn(
                  "px-5 py-4 transition-colors",
                  isTodayMeeting && "bg-primary/5"
                )}>
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      "flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg text-center",
                      isTodayMeeting ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
                    )}>
                      <span className="text-[10px] font-bold uppercase leading-none">
                        {format(meetingDate, "MMM", { locale: pl })}
                      </span>
                      <span className="text-sm font-bold leading-none mt-0.5">
                        {format(meetingDate, "d")}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-card-foreground truncate">{m.title}</p>
                        {isTodayMeeting && (
                          <Badge variant="default" className="text-[9px] h-4 px-1.5 shrink-0">DZIŚ</Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {format(meetingDate, "HH:mm")}
                        </span>
                        {m.buildings?.name && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {m.buildings.name}
                          </span>
                        )}
                        {m.attendees && (
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {m.attendees}
                          </span>
                        )}
                      </div>
                      {m.notes && (
                        <p className="text-[11px] text-muted-foreground/70 mt-1.5 line-clamp-2">{m.notes}</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Past Meetings */}
      {pastMeetings.length > 0 && (
        <div className="rounded-lg border border-border bg-card">
          <div className="flex items-center gap-2 border-b border-border px-5 py-3">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-muted-foreground">Ostatnie wizyty</h3>
          </div>
          <div className="divide-y divide-border">
            {pastMeetings.map((m: any) => {
              const meetingDate = parseISO(m.meeting_date);
              return (
                <div key={m.id} className="px-5 py-3 flex items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-secondary text-[10px] font-bold text-muted-foreground">
                    {format(meetingDate, "d.MM")}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-card-foreground truncate">{m.title}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {m.buildings?.name || "Spotkanie ogólne"}
                      {m.attendees && ` · ${m.attendees}`}
                    </p>
                  </div>
                  <Badge variant="secondary" className="text-[9px] shrink-0">Zakończone</Badge>
                </div>
              );
            })}
          </div>
        </div>
      )}

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

      {/* Approved Docs */}
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-5 py-3">
          <FileText className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Zatwierdzona dokumentacja PPOŻ</h3>
        </div>
        <div className="divide-y divide-border">
          {approvedDocs.length === 0 ? (
            <p className="px-5 py-6 text-center text-xs text-muted-foreground">Brak utworzonej i zatwierdzonej dokumentacji</p>
          ) : (
            approvedDocs.map((doc: any) => (
              <div key={doc.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3 hover:bg-secondary/20 transition-colors">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-card-foreground flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-primary/20 text-primary uppercase">{doc.docType}</span>
                    {doc.docTitle}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {doc.buildingName} · Zakończono: {new Date(doc.created_at).toLocaleDateString("pl-PL")}
                  </p>
                </div>
                <button
                  onClick={() => handleDownloadPdf(doc)}
                  className="flex shrink-0 items-center justify-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:border-primary hover:text-primary transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />
                  Pobierz PDF
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      <CreateTicketDialog open={showCreate} onOpenChange={setShowCreate} />
      <TaskDetailDialog task={selectedTask} open={!!selectedTask} onOpenChange={(o) => !o && setSelectedTask(null)} />
    </div>
  );
}
