import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useTasks, useBuildings, useProtocols, useAudits } from "@/hooks/useSupabaseData";
import CreateTicketDialog from "@/components/CreateTicketDialog";
import TaskDetailDialog from "@/components/TaskDetailDialog";
import { TaskWithDetails } from "@/hooks/useSupabaseData";
import { generateReportPDF } from "@/lib/pdfGenerator";
import { safetyStatusConfig, priorityColors } from "@/lib/constants";
import type { SafetyStatus, TaskPriority } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  Building2, Plus, ClipboardList, Shield, Loader2, AlertTriangle, FileText, Download
} from "lucide-react";

export default function ClientPanel() {
  const { user } = useAuth();
  const { data: tasks, isLoading: tasksLoading } = useTasks();
  const { data: buildings, isLoading: buildingsLoading } = useBuildings();
  const { data: protocols, isLoading: protocolsLoading } = useProtocols();
  const { data: audits, isLoading: auditsLoading } = useAudits();

  const [showCreate, setShowCreate] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskWithDetails | null>(null);

  const activeTasks = (tasks ?? []).filter((t) => t.status !== "Zamknięte");
  const overdueTasks = activeTasks.filter((t) => t.isOverdue);

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

  if (tasksLoading || buildingsLoading || protocolsLoading || auditsLoading) {
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
          className="flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors"
        >
          <AlertTriangle className="h-4 w-4" />
          Zgłoś Usterkę (Helpdesk)
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
