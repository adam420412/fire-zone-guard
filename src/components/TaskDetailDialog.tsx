import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  TaskWithDetails, useUpdateTask, useTaskHistory, useProfiles,
  useSubtasks, useCreateSubtask, useUpdateSubtask, useDeleteSubtask,
  useTaskReminders, useCreateReminder, useDeleteReminder
} from "@/hooks/useSupabaseData";
import { kanbanStatuses, priorityColors, statusColors, taskTypeLabels } from "@/lib/constants";
import type { TaskStatus, TaskPriority, TaskType } from "@/lib/constants";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Building2, User, Clock, Calendar, AlertTriangle, History,
  ArrowRight, Loader2, Plus, Trash2, Bell, ListTodo
} from "lucide-react";

interface Props {
  task: TaskWithDetails | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function TaskDetailDialog({ task, open, onOpenChange }: Props) {
  const updateTask = useUpdateTask();
  const { data: history, isLoading: historyLoading } = useTaskHistory(task?.id ?? "");
  const { data: profiles } = useProfiles();
  const { data: subtasks } = useSubtasks(task?.id ?? "");
  const { data: reminders } = useTaskReminders(task?.id ?? "");
  
  const createSubtask = useCreateSubtask();
  const updateSubtask = useUpdateSubtask();
  const deleteSubtask = useDeleteSubtask();
  const createReminder = useCreateReminder();
  const deleteReminder = useDeleteReminder();

  const { toast } = useToast();
  const [closingComment, setClosingComment] = useState("");
  const [repairPrice, setRepairPrice] = useState(task ? ((task as any).repair_price?.toString() || "") : "");

  const [newSubtask, setNewSubtask] = useState({ title: "", description: "", deadline: "", assignee_id: "" });
  const [newReminder, setNewReminder] = useState({ remind_at: "", recipient_email: "", message: "", subtask_id: "" });
  const [showReminderForm, setShowReminderForm] = useState(false);

  if (!task) return null;

  const priority = task.priority as TaskPriority;
  const type = task.type as TaskType;
  const status = task.status as TaskStatus;

  // Przechwytuj tylko profile z firmy przypisanej do zadania lub puste (np. super admin)
  const companyProfiles = (profiles ?? []).filter(p => p.company_id === task.company_id || p.company_id === null);

  const handleStatusChange = async (newStatus: string) => {
    try {
      const updates: any = { id: task.id, status: newStatus };
      if (newStatus === "Zamknięte") {
        if (closingComment.trim()) updates.closing_comment = closingComment.trim();
        if (repairPrice) updates.repair_price = parseFloat(repairPrice) || 0;
      }
      await updateTask.mutateAsync(updates);
      toast({ title: `Status zmieniony na: ${newStatus}` });
    } catch (err: any) {
      toast({ title: "Błąd", description: err.message, variant: "destructive" });
    }
  };

  const handleAssigneeChange = async (assigneeId: string) => {
    try {
      await updateTask.mutateAsync({ id: task.id, assignee_id: assigneeId || null });
      toast({ title: "Przypisanie zmienione" });
    } catch (err: any) {
      toast({ title: "Błąd", description: err.message, variant: "destructive" });
    }
  };

  const handleAddSubtask = async () => {
    if (!newSubtask.title.trim()) return;
    try {
      await createSubtask.mutateAsync({
        task_id: task.id,
        title: newSubtask.title,
        description: newSubtask.description || null,
        deadline: newSubtask.deadline || null,
        assignee_id: newSubtask.assignee_id || null,
      });
      setNewSubtask({ title: "", description: "", deadline: "", assignee_id: "" });
      toast({ title: "Podzadanie dodane" });
    } catch (err: any) {
      toast({ title: "Błąd", description: err.message, variant: "destructive" });
    }
  };

  const handleAddReminder = async () => {
    if (!newReminder.remind_at || !newReminder.recipient_email) return;
    try {
      await createReminder.mutateAsync({
        task_id: newReminder.subtask_id ? null : task.id,
        subtask_id: newReminder.subtask_id || null,
        remind_at: new Date(newReminder.remind_at).toISOString(),
        recipient_email: newReminder.recipient_email,
        message: newReminder.message || null,
      });
      setNewReminder({ remind_at: "", recipient_email: "", message: "", subtask_id: "" });
      setShowReminderForm(false);
      toast({ title: "Przypomnienie zaplanowane" });
    } catch (err: any) {
      toast({ title: "Błąd", description: err.message, variant: "destructive" });
    }
  };

  const inputCls = "w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm text-foreground outline-none focus:border-primary";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-card border-border max-h-[85vh] overflow-y-auto scrollbar-thin">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", priorityColors[priority])}>
              {priority}
            </span>
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", statusColors[status])}>
              {status}
            </span>
            <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground">
              {taskTypeLabels[type]}
            </span>
          </div>
          <DialogTitle className="text-lg text-card-foreground">{task.title}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="details" className="mt-2">
          <TabsList className="w-full">
            <TabsTrigger value="details" className="flex-1">Szczegóły</TabsTrigger>
            <TabsTrigger value="subtasks" className="flex-1">
              <ListTodo className="mr-1.5 h-3.5 w-3.5" /> Podzadania
            </TabsTrigger>
            <TabsTrigger value="history" className="flex-1">
              <History className="mr-1.5 h-3.5 w-3.5" /> Historia
            </TabsTrigger>
          </TabsList>

          {/* SZCZEGÓŁY ZADANIA */}
          <TabsContent value="details" className="space-y-4 mt-4">
            {task.description && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Opis</p>
                <p className="text-sm text-card-foreground whitespace-pre-wrap">{task.description}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Building2 className="h-4 w-4" />
                <div>
                  <p className="text-xs text-muted-foreground">Obiekt</p>
                  <p className="text-sm text-card-foreground">{task.buildingName}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <User className="h-4 w-4" />
                <div>
                  <p className="text-xs text-muted-foreground">Firma</p>
                  <p className="text-sm text-card-foreground">{task.companyName}</p>
                </div>
              </div>
              {task.deadline && (
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Termin</p>
                    <p className={cn("text-sm", task.isOverdue ? "text-critical font-medium" : "text-card-foreground")}>
                      {new Date(task.deadline).toLocaleDateString("pl-PL")}
                      {task.isOverdue && " – PRZETERMINOWANE"}
                    </p>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">SLA</p>
                  <p className="text-sm text-card-foreground">{task.sla_hours}h</p>
                </div>
              </div>
            </div>

            <div className="border-t border-border pt-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Zmień status</label>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {kanbanStatuses.map((s) => (
                    <button
                      key={s}
                      disabled={s === status || updateTask.isPending}
                      onClick={() => handleStatusChange(s)}
                      className={cn(
                        "rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-30",
                        s === status
                          ? "ring-2 ring-primary"
                          : "border border-border hover:border-primary/50"
                      )}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Przypisz do</label>
                <select
                  value={task.assignee_id ?? ""}
                  onChange={(e) => handleAssigneeChange(e.target.value)}
                  className={inputCls + " mt-1"}
                >
                  <option value="">Nieprzypisany</option>
                  {companyProfiles.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              {status !== "Zamknięte" && (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Koszty naprawy netto (PLN) - wpisz przed zamknięciem</label>
                    <input 
                      type="number" 
                      min="0" step="0.01" 
                      value={repairPrice} 
                      onChange={(e) => setRepairPrice(e.target.value)} 
                      placeholder="0.00"
                      className={inputCls + " mt-1"} 
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Komentarz zamknięcia</label>
                    <textarea
                      value={closingComment}
                      onChange={(e) => setClosingComment(e.target.value)}
                      placeholder="Opcjonalny komentarz przy zamknięciu..."
                      className={inputCls + " mt-1 min-h-[60px]"}
                      maxLength={2000}
                    />
                  </div>
                </div>
              )}

              {status === "Zamknięte" && (
                <div className="space-y-3">
                  {(task as any).repair_price > 0 && (
                    <div className="rounded-md bg-primary/10 border border-primary/20 p-3">
                      <p className="text-xs font-medium text-primary mb-1">Rozliczony koszt netto</p>
                      <p className="text-lg font-bold text-card-foreground">{(task as any).repair_price} PLN</p>
                    </div>
                  )}
                  {task.closing_comment && (
                    <div className="rounded-md bg-success/10 border border-success/20 p-3">
                      <p className="text-xs font-medium text-success mb-1">Komentarz zamknięcia</p>
                      <p className="text-sm text-card-foreground">{task.closing_comment}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* SEKCYJA PRZYPOMNIEŃ (Reminders) */}
            <div className="border-t border-border pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-card-foreground flex items-center gap-1.5">
                  <Bell className="h-4 w-4" /> Przypomnienia email
                </h3>
                <button
                  type="button"
                  onClick={() => setShowReminderForm(!showReminderForm)}
                  className="text-xs text-primary hover:underline"
                >
                  {showReminderForm ? "Anuluj" : "+ Dodaj przypomnienie"}
                </button>
              </div>

              {showReminderForm && (
                <div className="rounded-md border border-border bg-secondary/20 p-3 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground">Data i czas</label>
                      <input 
                        type="datetime-local" 
                        value={newReminder.remind_at}
                        onChange={e => setNewReminder(r => ({ ...r, remind_at: e.target.value }))}
                        className={inputCls} 
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Email odbiorcy</label>
                      <input 
                        type="email" 
                        value={newReminder.recipient_email}
                        onChange={e => setNewReminder(r => ({ ...r, recipient_email: e.target.value }))}
                        placeholder="np. jan@kowalski.pl"
                        className={inputCls} 
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Wiadomość (opcjonalnie)</label>
                    <textarea 
                      value={newReminder.message}
                      onChange={e => setNewReminder(r => ({ ...r, message: e.target.value }))}
                      className={inputCls + " min-h-[50px]"} 
                    />
                  </div>
                  <button
                    onClick={handleAddReminder}
                    disabled={createReminder.isPending || !newReminder.remind_at || !newReminder.recipient_email}
                    className="rounded-md fire-gradient px-4 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
                  >
                    Zaplanuj wysyłkę
                  </button>
                </div>
              )}

              {reminders && reminders.length > 0 && (
                <div className="space-y-2">
                  {reminders.map(r => (
                    <div key={r.id} className="flex flex-col gap-1 rounded-md border border-border p-2 bg-secondary/10">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-medium text-foreground">{r.recipient_email}</span>
                        <div className="flex items-center gap-2">
                          <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded", r.sent ? "bg-success/20 text-success" : "bg-warning/20 text-warning")}>
                            {r.sent ? "Wysłane" : "Zaplanowane"}
                          </span>
                          {!r.sent && (
                            <button onClick={() => deleteReminder.mutate(r.id)} className="text-muted-foreground hover:text-critical" title="Usuń">
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </div>
                      <span className="text-[10px] text-muted-foreground">Data: {new Date(r.remind_at).toLocaleString("pl-PL")}</span>
                      {r.message && <p className="text-[11px] mt-1 text-muted-foreground border-l-2 pl-2 italic">"{r.message}"</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* PODZADANIA (Subtasks) */}
          <TabsContent value="subtasks" className="space-y-4 mt-4">
            <div className="rounded-md border border-border bg-secondary/20 p-3 space-y-3">
              <h4 className="text-xs font-semibold text-card-foreground">Nowe podzadanie</h4>
              <div className="grid gap-3 sm:grid-cols-2">
                <input 
                  type="text" 
                  placeholder="Tytuł podzadania" 
                  value={newSubtask.title}
                  onChange={e => setNewSubtask(s => ({ ...s, title: e.target.value }))}
                  className={inputCls} 
                />
                <select
                  value={newSubtask.assignee_id}
                  onChange={e => setNewSubtask(s => ({ ...s, assignee_id: e.target.value }))}
                  className={inputCls}
                >
                  <option value="">Przypisz (opcjonalnie)</option>
                  {companyProfiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <button
                onClick={handleAddSubtask}
                disabled={!newSubtask.title.trim() || createSubtask.isPending}
                className="rounded-md fire-gradient px-4 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                + Dodaj podzadanie
              </button>
            </div>

            <div className="space-y-2 mt-4">
              {(subtasks ?? []).length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">Brak utworzonych podzadań</p>
              ) : (
                subtasks?.map(sub => (
                  <div key={sub.id} className="rounded-md border border-border p-3 grid gap-3 sm:grid-cols-12 items-center bg-card">
                    <div className="sm:col-span-5 flex items-center gap-2">
                      <ListTodo className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className={cn("text-sm font-medium", sub.status === "Zamknięte" && "line-through opacity-50")}>
                        {sub.title}
                      </span>
                    </div>
                    
                    <div className="sm:col-span-3">
                      <select
                        value={sub.status}
                        onChange={e => updateSubtask.mutate({ id: sub.id, status: e.target.value as TaskStatus })}
                        className={cn(inputCls, "h-8 py-0", statusColors[sub.status as TaskStatus] ? "font-semibold" : "")}
                      >
                        {kanbanStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>

                    <div className="sm:col-span-3">
                      <select
                        value={sub.assignee_id ?? ""}
                        onChange={e => updateSubtask.mutate({ id: sub.id, assignee_id: e.target.value || null })}
                        className={cn(inputCls, "h-8 py-0")}
                      >
                        <option value="">Nieprzypisany</option>
                        {companyProfiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>

                    <div className="sm:col-span-1 flex justify-end">
                      <button 
                        onClick={() => deleteSubtask.mutate(sub.id)}
                        className="text-muted-foreground hover:text-critical p-1"
                        title="Usuń podzadanie"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            {historyLoading ? (
               <div className="flex justify-center py-8">
                 <Loader2 className="h-5 w-5 animate-spin text-primary" />
               </div>
            ) : (history ?? []).length === 0 ? (
               <p className="py-8 text-center text-xs text-muted-foreground">Brak historii zmian</p>
            ) : (
               <div className="space-y-3">
                 {(history ?? []).map((h) => (
                   <div key={h.id} className="flex gap-3 rounded-md border border-border bg-secondary/30 p-3">
                     <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
                       {h.action === "status_change" ? (
                         <ArrowRight className="h-3 w-3 text-primary" />
                       ) : h.action === "assignee_change" ? (
                         <User className="h-3 w-3 text-primary" />
                       ) : (
                         <AlertTriangle className="h-3 w-3 text-warning" />
                       )}
                     </div>
                     <div className="min-w-0 flex-1">
                       <p className="text-xs font-medium text-card-foreground">
                         {h.action === "status_change" && `Status: ${h.old_value} → ${h.new_value}`}
                         {h.action === "assignee_change" && `Przypisanie zmienione`}
                         {h.action === "priority_change" && `Priorytet: ${h.old_value} → ${h.new_value}`}
                       </p>
                       {h.comment && (
                         <p className="mt-1 text-xs text-muted-foreground">{h.comment}</p>
                       )}
                       <p className="mt-1 text-[10px] text-muted-foreground">
                         {new Date(h.created_at).toLocaleString("pl-PL")}
                       </p>
                     </div>
                   </div>
                 ))}
               </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
