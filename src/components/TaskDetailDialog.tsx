import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  TaskWithDetails, useUpdateTask, useTaskHistory, useProfiles,
  useSubtasks, useCreateSubtask, useUpdateSubtask, useDeleteSubtask,
  useTaskReminders, useCreateReminder, useDeleteReminder,
  useTaskFinancialItems, useCreateFinancialItem, useDeleteFinancialItem
} from "@/hooks/useSupabaseData";
import { useAuth } from "@/hooks/useAuth";
import { kanbanStatuses, priorityColors, statusColors, taskTypeLabels } from "@/lib/constants";
import type { TaskStatus, TaskPriority, TaskType } from "@/lib/constants";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Building2, User, Clock, Calendar, AlertTriangle, History,
  ArrowRight, Loader2, Plus, Trash2, Bell, ListTodo, Wallet, TrendingUp, TrendingDown, Lock
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
  const { role: authRole, user, profileId } = useAuth();
  const isAdmin = authRole === 'admin' || authRole === 'super_admin';

  const { data: financialItems, isLoading: finLoading, error: finError } = useTaskFinancialItems(task?.id || "");
  
  const createFinItem = useCreateFinancialItem();
  const deleteFinItem = useDeleteFinancialItem();

  const [closingComment, setClosingComment] = useState("");
  const [newFinItem, setNewFinItem] = useState({ description: "", amount: "", type: 'income' as 'income' | 'expense' });
  const [newCostItem, setNewCostItem] = useState({ description: "", amount: "", type: 'expense' as 'income' | 'expense' });

  // Poinformuj użytkownika, jeśli brakuje tabeli w bazie
  useEffect(() => {
    if (finError && (finError as any).code === "42P01") {
      toast({
        title: "Błąd bazy danych",
        description: "Brakuje tabeli 'task_financial_items'. Uruchom migrację SQL dostarczoną w plikach projektowych.",
        variant: "destructive"
      });
    }
  }, [finError]);

  const handleAddFinItem = async (type: 'income' | 'expense') => {
    const item = type === 'income' ? newFinItem : newCostItem;
    if (!item.description || !item.amount) return;

    try {
      await createFinItem.mutateAsync({
        task_id: task.id,
        type: type,
        description: item.description,
        amount: Math.abs(parseFloat(item.amount) || 0)
      });
      
      if (type === 'income') {
        setNewFinItem({ ...newFinItem, description: "", amount: "" });
      } else {
        setNewCostItem({ ...newCostItem, description: "", amount: "" });
      }
      toast({ title: "Dodano pozycję" });
    } catch (e: any) {
      toast({
        title: "Błąd dodawania",
        description: e.message || "Wystąpił nieoczekiwany błąd.",
        variant: "destructive"
      });
    }
  };

  // Automatyczna synchronizacja wyniku z głównym polem ceny zadania
  useEffect(() => {
    if (!financialItems) return;
    
    const totalIncome = financialItems.filter(i => i.type === 'income').reduce((acc, i) => acc + Number(i.amount || 0), 0);
    const totalCosts = financialItems.filter(i => i.type === 'expense').reduce((acc, i) => acc + Number(i.amount || 0), 0);
    const balance = totalIncome - totalCosts;

    // Aktualizuj tylko jeśli wartość się zmieniła i nie jest to pierwsze ładowanie
    if (Math.abs((task?.repair_price || 0) - balance) > 0.01) {
      const timer = setTimeout(() => {
        updateTask.mutate({ id: task.id, repair_price: balance });
      }, 1000); // Debounce, żeby nie bić w bazę co sekundę
      return () => clearTimeout(timer);
    }
  }, [financialItems, task?.id]);

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
        // updates.repair_price = parseFloat(repairPrice) || 0; // Handled by financial items total now
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

              {/* SEKCJA FINANSOWA - FULL EXCEL - TYLKO ADMIN */}
              {isAdmin && (
                <div className="mt-6 rounded-xl border border-primary/20 bg-background p-4 space-y-6 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Wallet className="h-5 w-5 text-primary" />
                      <h4 className="text-sm font-black uppercase tracking-tight text-primary">Arkusik Finansowy</h4>
                    </div>
                    <span className="flex items-center gap-1 text-[10px] bg-primary/20 text-primary px-3 py-1 rounded-full font-black">
                      <Lock className="h-3 w-3" /> TYLKO ADMINISTRATOR
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-1 gap-6">
                    {/* LEWA STRONA: PRZYCHODY (+) */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-black text-success uppercase tracking-widest flex items-center gap-1">
                          <TrendingUp className="h-3 w-3" /> Przychody (Dodatnie +)
                        </label>
                        <span className="text-[10px] font-bold text-success/60 bg-success/5 px-2 py-0.5 rounded">SUMA: {(financialItems ?? []).filter(i => i.type === 'income').reduce((acc, i) => acc + Number(i.amount || 0), 0).toFixed(2)} PLN</span>
                      </div>
                      <div className="rounded-lg border border-success/20 bg-success/5 overflow-hidden min-h-[50px] flex flex-col">
                        {finLoading ? (
                          <div className="flex-1 flex items-center justify-center p-4"><Loader2 className="h-4 w-4 animate-spin text-success" /></div>
                        ) : (
                          <table className="w-full text-xs">
                            <tbody className="divide-y divide-success/10">
                              {financialItems?.filter(i => i.type === 'income').map((item) => (
                                <tr key={item.id} className="hover:bg-success/10 transition-colors">
                                  <td className="px-3 py-1.5 text-muted-foreground">{item.description}</td>
                                  <td className="px-3 py-1.5 text-right font-bold text-success">+{Math.abs(item.amount).toFixed(2)}</td>
                                  <td className="px-1 py-1.5 text-right w-8">
                                    <button onClick={() => deleteFinItem.mutate({ id: item.id, taskId: task.id })} className="text-critical/50 hover:text-critical"><Trash2 className="h-3 w-3" /></button>
                                  </td>
                                </tr>
                              ))}
                              <tr className="bg-success/10">
                                <td className="px-2 py-1.5">
                                  <input 
                                    placeholder="Opis przychodu..." 
                                    value={newFinItem.description}
                                    onChange={(e) => setNewFinItem({...newFinItem, description: e.target.value})}
                                    onKeyDown={(e) => e.key === 'Enter' && handleAddFinItem('income')}
                                    className="w-full bg-background/50 rounded border border-success/30 text-foreground text-[11px] py-1 px-2 outline-none focus:border-success"
                                  />
                                </td>
                                <td className="px-2 py-1.5">
                                  <input 
                                    type="number" placeholder="0.00" step="any"
                                    value={newFinItem.amount}
                                    onChange={(e) => setNewFinItem({...newFinItem, amount: e.target.value})}
                                    onKeyDown={(e) => e.key === 'Enter' && handleAddFinItem('income')}
                                    className="w-full bg-background/50 rounded border border-success/30 text-foreground text-[11px] text-right py-1 px-2 font-bold outline-none focus:border-success"
                                  />
                                </td>
                                <td className="px-2 py-1.5 text-right">
                                  <button 
                                    disabled={!newFinItem.description || !newFinItem.amount || createFinItem.isPending}
                                    onClick={() => handleAddFinItem('income')}
                                    className="bg-success text-white rounded p-0.5 hover:scale-110 transition-transform disabled:opacity-20"
                                  >
                                    {createFinItem.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                                  </button>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>

                    {/* PRAWA STRONA: KOSZTY (-) */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-black text-critical uppercase tracking-widest flex items-center gap-1">
                          <TrendingDown className="h-3 w-3" /> Koszty (Odjemne -)
                        </label>
                        <span className="text-[10px] font-bold text-critical/60 bg-critical/5 px-2 py-0.5 rounded">SUMA: {(financialItems ?? []).filter(i => i.type === 'expense').reduce((acc, i) => acc + Number(Math.abs(i.amount || 0)), 0).toFixed(2)} PLN</span>
                      </div>
                      <div className="rounded-lg border border-critical/20 bg-critical/5 overflow-hidden min-h-[50px] flex flex-col">
                        {finLoading ? (
                          <div className="flex-1 flex items-center justify-center p-4"><Loader2 className="h-4 w-4 animate-spin text-critical" /></div>
                        ) : (
                          <table className="w-full text-xs">
                            <tbody className="divide-y divide-critical/10">
                              {financialItems?.filter(i => i.type === 'expense').map((item) => (
                                <tr key={item.id} className="hover:bg-critical/10 transition-colors">
                                  <td className="px-3 py-1.5 text-muted-foreground">{item.description}</td>
                                  <td className="px-3 py-1.5 text-right font-bold text-critical">-{Math.abs(item.amount).toFixed(2)}</td>
                                  <td className="px-1 py-1.5 text-right w-8">
                                    <button onClick={() => deleteFinItem.mutate({ id: item.id, taskId: task.id })} className="text-critical/50 hover:text-critical"><Trash2 className="h-3 w-3" /></button>
                                  </td>
                                </tr>
                              ))}
                              <tr className="bg-critical/10">
                                <td className="px-2 py-1.5">
                                  <input 
                                    placeholder="Opis kosztu..." 
                                    value={newCostItem.description}
                                    onChange={(e) => setNewCostItem({...newCostItem, description: e.target.value})}
                                    onKeyDown={(e) => e.key === 'Enter' && handleAddFinItem('expense')}
                                    className="w-full bg-background/50 rounded border border-critical/30 text-foreground text-[11px] py-1 px-2 outline-none focus:border-critical"
                                  />
                                </td>
                                <td className="px-2 py-1.5">
                                  <input 
                                    type="number" placeholder="0.00" step="any"
                                    value={newCostItem.amount}
                                    onChange={(e) => setNewCostItem({...newCostItem, amount: e.target.value})}
                                    onKeyDown={(e) => e.key === 'Enter' && handleAddFinItem('expense')}
                                    className="w-full bg-background/50 rounded border border-critical/30 text-foreground text-[11px] text-right py-1 px-2 font-bold outline-none focus:border-critical"
                                  />
                                </td>
                                <td className="px-2 py-1.5 text-right">
                                  <button 
                                    disabled={!newCostItem.description || !newCostItem.amount || createFinItem.isPending}
                                    onClick={() => handleAddFinItem('expense')}
                                    className="bg-critical text-white rounded p-0.5 hover:scale-110 transition-transform disabled:opacity-20"
                                  >
                                    {createFinItem.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                                  </button>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* PODSUMOWANIE KOŃCOWE */}
                  <div className="pt-4 border-t-2 border-dashed border-primary/10">
                    {(() => {
                      const totalIncome = financialItems?.filter(i => i.type === 'income').reduce((acc, i) => acc + Number(Math.abs(i.amount)), 0) || 0;
                      const totalCosts = financialItems?.filter(i => i.type === 'expense').reduce((acc, i) => acc + Number(Math.abs(i.amount)), 0) || 0;
                      const balance = totalIncome - totalCosts;
                      const margin = totalIncome > 0 ? (balance / totalIncome) * 100 : 0;

                      return (
                        <div className={cn(
                          "p-4 rounded-xl flex items-center justify-between transition-colors",
                          balance >= 0 ? "bg-success/20 border-2 border-success/30" : "bg-critical/20 border-2 border-critical/30"
                        )}>
                          <div>
                            <p className="text-[10px] font-black uppercase text-muted-foreground mb-1">Wynik Finansowy Zadania (Przychód - Koszty)</p>
                            <p className={cn(
                              "text-3xl font-black tracking-tighter",
                              balance >= 0 ? "text-success" : "text-critical"
                            )}>
                              {balance.toFixed(2)} PLN
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] font-bold text-muted-foreground mb-1 uppercase">Rentowność (Marża)</p>
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-24 bg-secondary rounded-full overflow-hidden shadow-inner">
                                <div 
                                  className={cn("h-full rounded-full transition-all duration-1000", balance >= 0 ? "bg-success" : "bg-critical")}
                                  style={{ width: `${Math.min(100, Math.max(0, margin))}%` }}
                                />
                              </div>
                              <span className="text-xs font-black">
                                {Math.round(margin)}%
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}

              {status !== "Zamknięte" && (
                <div className="space-y-3 pt-4">
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

              {status === "Zamknięte" && task.closing_comment && (
                <div className="space-y-3 pt-4">
                  <div className="rounded-md bg-success/10 border border-success/20 p-3">
                    <p className="text-xs font-medium text-success mb-1">Komentarz zamknięcia</p>
                    <p className="text-sm text-card-foreground">{task.closing_comment}</p>
                  </div>
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
