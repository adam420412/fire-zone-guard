import { useEffect, useState } from "react";
import { useBuildings } from "@/hooks/useSupabaseData";
import {
  useRecurringEvents,
  useCreateRecurringEvent,
  useUpdateRecurringEvent,
  useDeleteRecurringEvent,
  useMarkRecurringEventDone,
  RECURRENCE_LABELS,
  DEFAULT_INTERVAL_MONTHS,
  type RecurringEvent,
  type RecurrenceType,
} from "@/hooks/useRecurringEvents";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Loader2, CalendarClock, BookOpen, ShieldCheck, Wrench, RefreshCw,
  FileSignature, GraduationCap, AlertCircle, Plus, CheckCircle2, Pencil, Trash2, Check,
} from "lucide-react";
import { format, parseISO, differenceInDays } from "date-fns";
import { pl } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const TYPE_META: Record<RecurrenceType, { label: string; Icon: typeof CalendarClock; color: string }> = {
  training:         { label: "Szkolenie",          Icon: GraduationCap,  color: "text-blue-500" },
  audit:            { label: "Audyt PPOŻ",         Icon: ShieldCheck,    color: "text-purple-500" },
  service:          { label: "Serwis okresowy",    Icon: Wrench,         color: "text-orange-500" },
  document_update:  { label: "Aktualizacja IBP",   Icon: BookOpen,       color: "text-cyan-500" },
  insurance:        { label: "Ubezpieczenie",      Icon: FileSignature,  color: "text-green-500" },
  contract_renewal: { label: "Wznowienie umowy",   Icon: RefreshCw,      color: "text-indigo-500" },
  custom:           { label: "Inne",               Icon: CalendarClock,  color: "text-slate-500" },
};

export default function OfficeTasksPage() {
  const { data: events, isLoading } = useRecurringEvents();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RecurringEvent | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (ev: RecurringEvent) => {
    setEditing(ev);
    setDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const now = new Date();
  const all = events ?? [];
  const overdue = all.filter((e) => e.next_due_date && parseISO(e.next_due_date) < now);
  const upcoming30 = all.filter((e) => {
    if (!e.next_due_date) return false;
    const d = parseISO(e.next_due_date);
    const days = differenceInDays(d, now);
    return days >= 0 && days <= 30;
  });
  const later = all.filter((e) => {
    if (!e.next_due_date) return false;
    const d = parseISO(e.next_due_date);
    return differenceInDays(d, now) > 30;
  });
  const noDate = all.filter((e) => !e.next_due_date);

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <CalendarClock className="h-7 w-7 text-orange-500" />
            Terminarz biurowy
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cykliczne wydarzenia: szkolenia, audyty, serwisy, IBP, ubezpieczenia, umowy.
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          Nowe wydarzenie
        </Button>
      </div>

      {overdue.length > 0 && (
        <Section
          title={`Przeterminowane (${overdue.length})`}
          titleClass="text-destructive"
          Icon={AlertCircle}
        >
          <div className="grid md:grid-cols-2 gap-3">
            {overdue.map((e) => (
              <EventCard key={e.id} ev={e} variant="overdue" onEdit={openEdit} onDelete={setDeleteId} />
            ))}
          </div>
        </Section>
      )}

      <Section title={`Najbliższe 30 dni (${upcoming30.length})`}>
        {upcoming30.length === 0 ? (
          <Card className="p-6 text-center text-muted-foreground border-dashed">
            Spokojnie — najbliższe 30 dni masz wolne.
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 gap-3">
            {upcoming30.map((e) => (
              <EventCard key={e.id} ev={e} variant="upcoming" onEdit={openEdit} onDelete={setDeleteId} />
            ))}
          </div>
        )}
      </Section>

      {later.length > 0 && (
        <Section title={`Później (${later.length})`}>
          <div className="grid md:grid-cols-2 gap-3">
            {later.slice(0, 20).map((e) => (
              <EventCard key={e.id} ev={e} variant="later" onEdit={openEdit} onDelete={setDeleteId} />
            ))}
          </div>
        </Section>
      )}

      {noDate.length > 0 && (
        <Section title={`Bez daty (${noDate.length})`}>
          <div className="grid md:grid-cols-2 gap-3">
            {noDate.map((e) => (
              <EventCard key={e.id} ev={e} variant="later" onEdit={openEdit} onDelete={setDeleteId} />
            ))}
          </div>
        </Section>
      )}

      {all.length === 0 && (
        <Card className="p-12 text-center text-muted-foreground border-dashed">
          <CalendarClock className="h-10 w-10 mx-auto mb-2 opacity-50" />
          <p className="font-medium">Brak zaplanowanych wydarzeń</p>
          <p className="text-sm mt-1">Dodaj pierwsze wydarzenie cykliczne.</p>
          <Button onClick={openCreate} className="gap-2 mt-4">
            <Plus className="h-4 w-4" />
            Nowe wydarzenie
          </Button>
        </Card>
      )}

      {/* DIALOGS */}
      <RecurringEventDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
      />
      <DeleteDialog
        id={deleteId}
        onClose={() => setDeleteId(null)}
      />
    </div>
  );
}

function Section({
  title, children, titleClass, Icon,
}: {
  title: string;
  children: React.ReactNode;
  titleClass?: string;
  Icon?: typeof AlertCircle;
}) {
  return (
    <section>
      <h2 className={cn(
        "text-sm font-semibold uppercase tracking-wide mb-2 text-muted-foreground flex items-center gap-2",
        titleClass
      )}>
        {Icon && <Icon className="h-4 w-4" />}
        {title}
      </h2>
      {children}
    </section>
  );
}

function EventCard({
  ev, variant, onEdit, onDelete,
}: {
  ev: RecurringEvent;
  variant: "overdue" | "upcoming" | "later";
  onEdit: (e: RecurringEvent) => void;
  onDelete: (id: string) => void;
}) {
  const meta = TYPE_META[ev.recurrence_type] ?? TYPE_META.custom;
  const Icon = meta.Icon;
  const due = ev.next_due_date ? parseISO(ev.next_due_date) : null;
  const days = due ? differenceInDays(due, new Date()) : null;

  const markDone = useMarkRecurringEventDone();

  const handleMarkDone = async () => {
    try {
      await markDone.mutateAsync({ id: ev.id });
      toast.success(`Oznaczono jako wykonane${ev.interval_months ? ` — kolejny termin zaplanowany` : ""}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Błąd zapisu");
    }
  };

  return (
    <Card className={cn(
      "p-4 group hover:shadow-md transition",
      variant === "overdue" && "border-destructive/50 bg-destructive/5"
    )}>
      <div className="flex items-start gap-3">
        <Icon className={cn("h-5 w-5 flex-shrink-0 mt-0.5", meta.color)} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <p className="font-semibold text-sm">{ev.title}</p>
            <Badge variant="outline" className="text-[10px] whitespace-nowrap">{meta.label}</Badge>
          </div>
          {due && (
            <p className={cn(
              "text-xs mt-1",
              variant === "overdue" ? "text-destructive font-semibold" : "text-muted-foreground"
            )}>
              {format(due, "d MMM yyyy", { locale: pl })}
              {days !== null && (
                <span className="ml-2">
                  ({days < 0 ? `${Math.abs(days)} dni temu` : days === 0 ? "dziś" : `za ${days} dni`})
                </span>
              )}
            </p>
          )}
          {ev.interval_months && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Powtarzanie co {ev.interval_months} mies.
            </p>
          )}
          {ev.last_done_date && (
            <p className="text-xs text-green-600 dark:text-green-400 mt-1">
              ✓ Ostatnio: {format(parseISO(ev.last_done_date), "d MMM yyyy", { locale: pl })}
            </p>
          )}
          {ev.notes && <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{ev.notes}</p>}

          <div className="flex gap-1 mt-3 opacity-60 group-hover:opacity-100 transition">
            <Button
              size="sm"
              variant="default"
              onClick={handleMarkDone}
              disabled={markDone.isPending}
              className="h-7 text-xs gap-1"
            >
              <Check className="h-3 w-3" />
              Wykonane
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onEdit(ev)} className="h-7 text-xs gap-1">
              <Pencil className="h-3 w-3" />
              Edytuj
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onDelete(ev.id)} className="h-7 text-xs text-destructive hover:text-destructive">
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

// ============================================================================
// CREATE / EDIT DIALOG
// ============================================================================
function RecurringEventDialog({
  open, onOpenChange, editing,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: RecurringEvent | null;
}) {
  const { data: buildings } = useBuildings();
  const create = useCreateRecurringEvent();
  const update = useUpdateRecurringEvent();

  const [title, setTitle] = useState("");
  const [type, setType] = useState<RecurrenceType>("training");
  const [buildingId, setBuildingId] = useState<string>("_none");
  const [nextDue, setNextDue] = useState<string>("");
  const [intervalMonths, setIntervalMonths] = useState<string>("12");
  const [notes, setNotes] = useState("");

  // Sync form state when editing changes
  useEffect(() => {
    if (editing) {
      setTitle(editing.title);
      setType(editing.recurrence_type);
      setBuildingId(editing.building_id ?? "_none");
      setNextDue(editing.next_due_date ?? "");
      setIntervalMonths(String(editing.interval_months ?? DEFAULT_INTERVAL_MONTHS[editing.recurrence_type]));
      setNotes(editing.notes ?? "");
    } else {
      setTitle("");
      setType("training");
      setBuildingId("_none");
      setNextDue("");
      setIntervalMonths("12");
      setNotes("");
    }
  }, [editing, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const payload = {
      title: title.trim(),
      recurrence_type: type,
      building_id: buildingId === "_none" ? null : buildingId,
      next_due_date: nextDue || null,
      interval_months: intervalMonths ? parseInt(intervalMonths, 10) : null,
      notes: notes.trim() || null,
    };

    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, patch: payload });
        toast.success("Zaktualizowano wydarzenie");
      } else {
        await create.mutateAsync(payload);
        toast.success("Utworzono wydarzenie cykliczne");
      }
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message ?? "Błąd zapisu");
    }
  };

  const pending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Edytuj wydarzenie cykliczne" : "Nowe wydarzenie cykliczne"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="title" className="text-xs">Nazwa *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="np. Szkolenie PPOŻ — budynek A"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Typ *</Label>
              <Select value={type} onValueChange={(v) => {
                setType(v as RecurrenceType);
                // Auto-fill interval
                setIntervalMonths(String(DEFAULT_INTERVAL_MONTHS[v as RecurrenceType]));
              }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(RECURRENCE_LABELS) as RecurrenceType[]).map((t) => (
                    <SelectItem key={t} value={t}>{RECURRENCE_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="interval" className="text-xs">Co ile mies.</Label>
              <Input
                id="interval"
                type="number"
                min={1}
                max={120}
                value={intervalMonths}
                onChange={(e) => setIntervalMonths(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="due" className="text-xs">Następny termin</Label>
            <Input
              id="due"
              type="date"
              value={nextDue}
              onChange={(e) => setNextDue(e.target.value)}
            />
          </div>

          <div>
            <Label className="text-xs">Obiekt (opcjonalnie)</Label>
            <Select value={buildingId} onValueChange={setBuildingId}>
              <SelectTrigger>
                <SelectValue placeholder="Wybierz obiekt" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">— dotyczy firmy / brak obiektu —</SelectItem>
                {(buildings ?? []).map((b: any) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="notes" className="text-xs">Notatki</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Dodatkowe informacje, kontakt, numer polisy..."
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Anuluj
            </Button>
            <Button type="submit" disabled={pending || !title.trim()}>
              {pending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
              {editing ? "Zapisz" : "Dodaj"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const del = useDeleteRecurringEvent();
  const handleDelete = async () => {
    if (!id) return;
    try {
      await del.mutateAsync(id);
      toast.success("Usunięto wydarzenie");
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Błąd usuwania");
    }
  };
  return (
    <AlertDialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Usunąć wydarzenie?</AlertDialogTitle>
          <AlertDialogDescription>
            Tej operacji nie można cofnąć. Historia wykonań zostanie utracona.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Anuluj</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Usuń
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

