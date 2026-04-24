// =============================================================================
// ClientPanel — mobile-first dashboard for the customer (zarządca obiektu).
//
// Design priorities (Iter 4 / Faza 4 task #41):
//   1. Top SLA / safety status card aggregating across the customer's buildings.
//   2. Big sticky "Zgłoś usterkę" CTA visible on mobile at all times.
//   3. One-tap call do serwisanta + 998 (alarmowo).
//   4. Najbliższe terminy: protokoły z bliską next_inspection_due, audyty,
//      spotkania serwisowe — wszystko w jednej liście chronologicznie.
//   5. Skrót do dokumentacji zatwierdzonej (PDF download).
//   6. Aktywne zgłoszenia + Status obiektów.
//
// All sections are stacked vertically on mobile (<sm) and arrange in a 2-col
// grid from `md:` upwards. Sticky bottom CTA bar shows on `< md` only.
// =============================================================================
import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  useTasks, useBuildings, useProtocols, useAudits, useMeetings,
} from "@/hooks/useSupabaseData";
import CreateTicketDialog from "@/components/CreateTicketDialog";
import TaskDetailDialog from "@/components/TaskDetailDialog";
import { TaskWithDetails } from "@/hooks/useSupabaseData";
import { generateReportPDF } from "@/lib/pdfGenerator";
import {
  safetyStatusConfig, priorityColors,
  SUPPORT_PHONE, SUPPORT_PHONE_TEL, SUPPORT_EMERGENCY_PHONE, SUPPORT_EMERGENCY_TEL,
} from "@/lib/constants";
import type { SafetyStatus, TaskPriority } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { format, parseISO, isPast, isToday, differenceInDays } from "date-fns";
import { pl } from "date-fns/locale";
import {
  Building2, ClipboardList, Shield, Loader2, AlertTriangle, FileText, Download,
  Calendar, Clock, MapPin, Phone, Siren, ChevronRight, CheckCircle2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------
type DeadlineKind = "protocol" | "audit" | "meeting";
interface UpcomingDeadline {
  id: string;
  kind: DeadlineKind;
  title: string;
  date: Date;
  buildingName?: string;
  daysLeft: number; // negative = overdue
}

function deadlineKindLabel(k: DeadlineKind): string {
  switch (k) {
    case "protocol": return "Protokół";
    case "audit":    return "Audyt";
    case "meeting":  return "Wizyta";
  }
}

function deadlineKindIcon(k: DeadlineKind) {
  switch (k) {
    case "protocol": return ClipboardList;
    case "audit":    return Shield;
    case "meeting":  return Calendar;
  }
}

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------
export default function ClientPanel() {
  useAuth(); // session guard

  const { data: tasks, isLoading: tasksLoading } = useTasks();
  const { data: buildings, isLoading: buildingsLoading } = useBuildings();
  const { data: protocols, isLoading: protocolsLoading } = useProtocols();
  const { data: audits, isLoading: auditsLoading } = useAudits();
  const { data: meetings, isLoading: meetingsLoading } = useMeetings();

  const [showCreate, setShowCreate] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskWithDetails | null>(null);

  const activeTasks = (tasks ?? []).filter((t) => t.status !== "Zamknięte");
  const overdueTasks = activeTasks.filter((t) => t.isOverdue);

  // Aggregate safety status across all buildings (worst wins)
  const overallStatus: SafetyStatus = useMemo(() => {
    const statuses = (buildings ?? []).map((b: any) => b.safetyStatus as SafetyStatus);
    if (statuses.includes("krytyczny")) return "krytyczny";
    if (statuses.includes("ostrzeżenie")) return "ostrzeżenie";
    return "bezpieczny";
  }, [buildings]);
  const overallConf = safetyStatusConfig[overallStatus];
  const OverallIcon = overallConf.icon;

  // Unified upcoming deadline list — protocols + audits + meetings — sorted by date asc
  const upcomingDeadlines = useMemo<UpcomingDeadline[]>(() => {
    const today = new Date();
    const out: UpcomingDeadline[] = [];

    (protocols ?? []).forEach((p: any) => {
      const d = p.next_inspection_due ? parseISO(p.next_inspection_due) : null;
      if (!d) return;
      out.push({
        id: `p-${p.id}`,
        kind: "protocol",
        title: p.type ?? "Protokół serwisowy",
        date: d,
        buildingName: p.buildingName ?? p.buildings?.name,
        daysLeft: differenceInDays(d, today),
      });
    });

    (audits ?? []).forEach((a: any) => {
      const d = a.next_audit_due ? parseISO(a.next_audit_due) : null;
      if (!d) return;
      out.push({
        id: `a-${a.id}`,
        kind: "audit",
        title: a.title ?? "Audyt PPOŻ",
        date: d,
        buildingName: a.buildingName ?? a.buildings?.name,
        daysLeft: differenceInDays(d, today),
      });
    });

    (meetings ?? []).forEach((m: any) => {
      const d = m.meeting_date ? parseISO(m.meeting_date) : null;
      if (!d) return;
      if (isPast(d) && !isToday(d)) return;
      out.push({
        id: `m-${m.id}`,
        kind: "meeting",
        title: m.title ?? "Wizyta",
        date: d,
        buildingName: m.buildings?.name,
        daysLeft: differenceInDays(d, today),
      });
    });

    return out
      .sort((x, y) => x.date.getTime() - y.date.getTime())
      .slice(0, 8);
  }, [protocols, audits, meetings]);

  const approvedDocs = useMemo(() => [
    ...(protocols ?? [])
      .filter((p: any) => p.status === "Zatwierdzony")
      .map((p: any) => ({ ...p, docType: "Protokół Serwisowy", docTitle: p.type })),
    ...(audits ?? [])
      .filter((a: any) => a.status === "Zatwierdzony")
      .map((a: any) => ({ ...a, docType: "Audyt PPOŻ", docTitle: a.title })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 6),
  [protocols, audits]);

  const handleDownloadPdf = (doc: any) => {
    generateReportPDF({
      title: doc.docType === "Audyt PPOŻ" ? `Raport z Audytu: ${doc.docTitle}` : `Protokół: ${doc.docTitle}`,
      subtitle: doc.buildingName || "Obiekt Fire Zone",
      metadata: [
        { label: "Data wygenerowania", value: new Date(doc.created_at).toLocaleDateString("pl-PL") },
        { label: "Wykonawca", value: doc.inspectorName || "Fire Zone Guard" },
        { label: "Status", value: doc.status },
        { label: "Wynik końcowy", value: doc.overall_result || "Brak uwag" },
      ],
      tableColumns: doc.docType === "Audyt PPOŻ"
        ? ["Kategoria", "Pytanie", "Wynik"]
        : ["Typ Sprzętu", "Szczegół", "Wynik"],
      tableData: doc.docType === "Audyt PPOŻ"
        ? (doc.items || []).map((i: any) => [i.category || "Ogólne", i.question, i.answer])
        : (doc.measurements || []).map((m: any) => [m.device_type || "Sprzęt", m.device_name || "-", m.result || "-"]),
      filename: `${doc.docType.replace(" ", "_")}_${new Date().getTime()}.pdf`,
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
    <div className="pb-24 md:pb-0 space-y-4 md:space-y-6">
      {/* HEADER ----------------------------------------------------------- */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold tracking-tight">Panel Klienta</h1>
          <p className="text-xs md:text-sm text-muted-foreground">
            Status obiektów, nadchodzące terminy i kontakt z serwisantem
          </p>
        </div>
        {/* Hide CTA in header on mobile — sticky bottom bar replaces it */}
        <button
          onClick={() => setShowCreate(true)}
          className="hidden md:flex items-center gap-2 rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 transition-colors"
        >
          <AlertTriangle className="h-4 w-4" />
          Zgłoś usterkę
        </button>
      </div>

      {/* TOP SLA / SAFETY STATUS CARD ----------------------------------- */}
      <div className={cn(
        "rounded-xl border p-4 md:p-5",
        overallStatus === "krytyczny" && "border-critical/40 bg-critical/10",
        overallStatus === "ostrzeżenie" && "border-warning/40 bg-warning/10",
        overallStatus === "bezpieczny" && "border-success/40 bg-success/10",
      )}>
        <div className="flex items-start gap-3 md:gap-4">
          <div className={cn(
            "flex h-12 w-12 md:h-14 md:w-14 shrink-0 items-center justify-center rounded-full",
            overallStatus === "krytyczny" && "bg-critical/20",
            overallStatus === "ostrzeżenie" && "bg-warning/20",
            overallStatus === "bezpieczny" && "bg-success/20",
          )}>
            <OverallIcon className={cn("h-7 w-7 md:h-8 md:w-8", overallConf.color)} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] md:text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Status bezpieczeństwa
            </p>
            <p className={cn("text-lg md:text-2xl font-bold leading-tight", overallConf.color)}>
              {overallConf.label}
            </p>
            <p className="text-xs md:text-sm text-muted-foreground mt-1">
              {overdueTasks.length > 0
                ? `${overdueTasks.length} zgłoszeń po terminie · ${activeTasks.length} aktywnych`
                : activeTasks.length > 0
                  ? `${activeTasks.length} aktywnych zgłoszeń, brak przeterminowanych`
                  : "Wszystko aktualne. Brak otwartych zgłoszeń."}
            </p>
          </div>
        </div>
        {/* Mini KPI strip */}
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-md bg-background/60 py-2 px-1">
            <p className="text-lg md:text-xl font-bold">{(buildings ?? []).length}</p>
            <p className="text-[10px] text-muted-foreground">Obiektów</p>
          </div>
          <div className="rounded-md bg-background/60 py-2 px-1">
            <p className="text-lg md:text-xl font-bold">{activeTasks.length}</p>
            <p className="text-[10px] text-muted-foreground">Zgłoszeń</p>
          </div>
          <div className="rounded-md bg-background/60 py-2 px-1">
            <p className={cn("text-lg md:text-xl font-bold", overdueTasks.length > 0 && "text-warning")}>
              {overdueTasks.length}
            </p>
            <p className="text-[10px] text-muted-foreground">Po terminie</p>
          </div>
        </div>
      </div>

      {/* CALL ROW (mobile-first one-tap) -------------------------------- */}
      <div className="grid grid-cols-2 gap-2">
        <a
          href={SUPPORT_PHONE_TEL}
          className="flex items-center justify-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-3 text-sm font-semibold text-primary active:bg-primary/20 transition-colors"
        >
          <Phone className="h-4 w-4" />
          <span className="text-left leading-tight">
            <span className="block text-[10px] font-normal opacity-70">Serwisant</span>
            {SUPPORT_PHONE}
          </span>
        </a>
        <a
          href={SUPPORT_EMERGENCY_TEL}
          className="flex items-center justify-center gap-2 rounded-lg border border-critical/30 bg-critical/10 px-3 py-3 text-sm font-semibold text-critical active:bg-critical/20 transition-colors"
        >
          <Siren className="h-4 w-4" />
          <span className="text-left leading-tight">
            <span className="block text-[10px] font-normal opacity-70">Alarmowy</span>
            {SUPPORT_EMERGENCY_PHONE}
          </span>
        </a>
      </div>

      {/* MAIN GRID — single column on mobile, 2-col on md+ -------------- */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* UPCOMING DEADLINES ------------------------------------------- */}
        <section className="rounded-lg border border-border bg-card md:col-span-2">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Calendar className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Najbliższe terminy</h3>
            <Badge variant="secondary" className="ml-auto text-[10px]">{upcomingDeadlines.length}</Badge>
          </div>
          <div className="divide-y divide-border">
            {upcomingDeadlines.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <CheckCircle2 className="h-8 w-8 text-success/40 mb-2" />
                <p className="text-xs text-muted-foreground">Brak nadchodzących terminów</p>
              </div>
            ) : (
              upcomingDeadlines.map((d) => {
                const Icon = deadlineKindIcon(d.kind);
                const overdue = d.daysLeft < 0;
                const soon = !overdue && d.daysLeft <= 7;
                return (
                  <div key={d.id} className={cn(
                    "flex items-center gap-3 px-4 py-3",
                    overdue && "bg-critical/5",
                    soon && "bg-warning/5",
                  )}>
                    <div className={cn(
                      "flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg text-center",
                      overdue ? "bg-critical text-critical-foreground"
                        : soon ? "bg-warning text-warning-foreground"
                        : "bg-secondary text-secondary-foreground",
                    )}>
                      <span className="text-[9px] font-bold uppercase leading-none">
                        {format(d.date, "MMM", { locale: pl })}
                      </span>
                      <span className="text-sm font-bold leading-none mt-0.5">
                        {format(d.date, "d")}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Icon className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wide">
                          {deadlineKindLabel(d.kind)}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-card-foreground truncate">{d.title}</p>
                      {d.buildingName && (
                        <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                          <MapPin className="h-3 w-3" />
                          {d.buildingName}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      {overdue ? (
                        <span className="text-[11px] font-bold text-critical uppercase">
                          {Math.abs(d.daysLeft)} dni po
                        </span>
                      ) : d.daysLeft === 0 ? (
                        <span className="text-[11px] font-bold text-warning uppercase">Dziś</span>
                      ) : (
                        <span className={cn(
                          "text-[11px] font-medium",
                          soon ? "text-warning" : "text-muted-foreground",
                        )}>
                          za {d.daysLeft} dni
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* BUILDINGS STATUS --------------------------------------------- */}
        <section className="rounded-lg border border-border bg-card">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Shield className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Status obiektów</h3>
          </div>
          <div className="divide-y divide-border">
            {(buildings ?? []).length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted-foreground">Brak przypisanych obiektów</p>
            ) : (
              (buildings ?? []).map((b: any) => {
                const status = (b.safetyStatus ?? "bezpieczny") as SafetyStatus;
                const conf = safetyStatusConfig[status];
                const Icon = conf.icon;
                return (
                  <div key={b.id} className="flex items-center gap-3 px-4 py-3">
                    <Icon className={cn("h-5 w-5 shrink-0", conf.color)} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-card-foreground truncate">{b.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{b.address}</p>
                    </div>
                    <span className={cn("text-[11px] font-semibold uppercase shrink-0", conf.color)}>
                      {conf.label}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* ACTIVE TASKS ------------------------------------------------- */}
        <section className="rounded-lg border border-border bg-card">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <ClipboardList className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Aktywne zgłoszenia</h3>
            <Badge variant="secondary" className="ml-auto text-[10px]">{activeTasks.length}</Badge>
          </div>
          <div className="divide-y divide-border">
            {activeTasks.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted-foreground">Brak aktywnych zgłoszeń</p>
            ) : (
              activeTasks.slice(0, 8).map((task) => (
                <button
                  key={task.id}
                  onClick={() => setSelectedTask(task)}
                  className="w-full text-left flex items-center gap-3 px-4 py-3 active:bg-secondary/40 hover:bg-secondary/20 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-card-foreground truncate">{task.title}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {task.buildingName} · {task.status}
                      {task.deadline && ` · ${new Date(task.deadline).toLocaleDateString("pl-PL")}`}
                    </p>
                  </div>
                  <span className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                    priorityColors[task.priority as TaskPriority],
                  )}>
                    {task.priority}
                  </span>
                  {task.isOverdue && (
                    <span className="hidden sm:inline text-[10px] font-medium text-critical uppercase shrink-0">
                      Po terminie
                    </span>
                  )}
                  <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                </button>
              ))
            )}
          </div>
        </section>

        {/* APPROVED DOCS ------------------------------------------------- */}
        <section className="rounded-lg border border-border bg-card md:col-span-2">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <FileText className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Zatwierdzona dokumentacja PPOŻ</h3>
            <Badge variant="secondary" className="ml-auto text-[10px]">{approvedDocs.length}</Badge>
          </div>
          <div className="divide-y divide-border">
            {approvedDocs.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                Brak zatwierdzonej dokumentacji
              </p>
            ) : (
              approvedDocs.map((doc: any) => (
                <div
                  key={doc.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 hover:bg-secondary/20 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-card-foreground flex items-start sm:items-center gap-2 flex-wrap">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-primary/20 text-primary uppercase shrink-0">
                        {doc.docType}
                      </span>
                      <span className="break-words">{doc.docTitle}</span>
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {doc.buildingName} · {new Date(doc.created_at).toLocaleDateString("pl-PL")}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDownloadPdf(doc)}
                    className="self-stretch sm:self-auto flex shrink-0 items-center justify-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs font-medium hover:border-primary hover:text-primary transition-colors"
                  >
                    <Download className="h-3.5 w-3.5" />
                    PDF
                  </button>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {/* STICKY MOBILE CTA ---------------------------------------------- */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 px-4 py-3">
        <button
          onClick={() => setShowCreate(true)}
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-destructive px-4 py-3 text-sm font-bold text-destructive-foreground active:bg-destructive/90 shadow-lg"
        >
          <AlertTriangle className="h-5 w-5" />
          Zgłoś usterkę
        </button>
      </div>

      <CreateTicketDialog open={showCreate} onOpenChange={setShowCreate} />
      <TaskDetailDialog
        task={selectedTask}
        open={!!selectedTask}
        onOpenChange={(o) => !o && setSelectedTask(null)}
      />
    </div>
  );
}
