import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Loader2, CalendarClock, BookOpen, ShieldCheck, Wrench,
  RefreshCw, FileSignature, GraduationCap, AlertCircle, Plus,
} from "lucide-react";
import { format, parseISO, differenceInDays } from "date-fns";
import { pl } from "date-fns/locale";
import { cn } from "@/lib/utils";

// Faza 3 — Terminarz biurowy / cykliczne wydarzenia
type RecurrenceType =
  | "training"
  | "audit"
  | "service"
  | "document_update"
  | "insurance"
  | "contract_renewal"
  | "custom";

interface RecurringEvent {
  id: string;
  title: string;
  recurrence_type: RecurrenceType;
  building_id: string | null;
  company_id: string | null;
  next_due_date: string | null;
  last_done_date: string | null;
  interval_months: number | null;
  notes: string | null;
  created_at: string;
}

const TYPE_META: Record<RecurrenceType, { label: string; Icon: typeof CalendarClock; color: string }> = {
  training:         { label: "Szkolenie",          Icon: GraduationCap,  color: "text-blue-500" },
  audit:            { label: "Audyt PPOŻ",         Icon: ShieldCheck,    color: "text-purple-500" },
  service:          { label: "Serwis okresowy",    Icon: Wrench,         color: "text-orange-500" },
  document_update:  { label: "Aktualizacja IBP",   Icon: BookOpen,       color: "text-cyan-500" },
  insurance:        { label: "Ubezpieczenie",      Icon: FileSignature,  color: "text-green-500" },
  contract_renewal: { label: "Wznowienie umowy",   Icon: RefreshCw,      color: "text-indigo-500" },
  custom:           { label: "Inne",               Icon: CalendarClock,  color: "text-slate-500" },
};

function useRecurringEvents() {
  return useQuery({
    queryKey: ["recurring_events"],
    queryFn: async (): Promise<RecurringEvent[]> => {
      const { data, error } = await (supabase.from as any)("recurring_events")
        .select("*")
        .order("next_due_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as RecurringEvent[];
    },
  });
}

export default function OfficeTasksPage() {
  const { data: events, isLoading } = useRecurringEvents();

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const now = new Date();
  const overdue = (events ?? []).filter((e) => e.next_due_date && parseISO(e.next_due_date) < now);
  const upcoming30 = (events ?? []).filter((e) => {
    if (!e.next_due_date) return false;
    const d = parseISO(e.next_due_date);
    const days = differenceInDays(d, now);
    return days >= 0 && days <= 30;
  });
  const later = (events ?? []).filter((e) => {
    if (!e.next_due_date) return false;
    const d = parseISO(e.next_due_date);
    return differenceInDays(d, now) > 30;
  });

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <CalendarClock className="h-7 w-7 text-orange-500" />
            Terminarz biurowy
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cykliczne wydarzenia: szkolenia, audyty, serwisy okresowe, aktualizacje IBP, ubezpieczenia.
          </p>
        </div>
        <Button className="gap-2" disabled>
          <Plus className="h-4 w-4" />
          Nowe wydarzenie
        </Button>
      </div>

      {/* OVERDUE */}
      {overdue.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide mb-2 text-destructive flex items-center gap-2">
            <AlertCircle className="h-4 w-4" /> Przeterminowane ({overdue.length})
          </h2>
          <div className="grid md:grid-cols-2 gap-3">
            {overdue.map((e) => <EventCard key={e.id} ev={e} variant="overdue" />)}
          </div>
        </section>
      )}

      {/* UPCOMING */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Najbliższe 30 dni ({upcoming30.length})
        </h2>
        {upcoming30.length === 0 ? (
          <Card className="p-6 text-center text-muted-foreground border-dashed">
            Spokojnie — najbliższe 30 dni masz wolne.
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 gap-3">
            {upcoming30.map((e) => <EventCard key={e.id} ev={e} variant="upcoming" />)}
          </div>
        )}
      </section>

      {/* LATER */}
      {later.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Później ({later.length})
          </h2>
          <div className="grid md:grid-cols-2 gap-3">
            {later.slice(0, 20).map((e) => <EventCard key={e.id} ev={e} variant="later" />)}
          </div>
        </section>
      )}

      {(events ?? []).length === 0 && (
        <Card className="p-12 text-center text-muted-foreground border-dashed">
          <CalendarClock className="h-10 w-10 mx-auto mb-2 opacity-50" />
          <p className="font-medium">Brak zaplanowanych wydarzeń</p>
          <p className="text-sm mt-1">
            Tabela <code className="text-xs">recurring_events</code> jest pusta.
            Dodawanie / edycja wkrótce w dedykowanym formularzu.
          </p>
        </Card>
      )}

      <Card className="p-4 bg-blue-500/5 border-blue-500/30">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-blue-700 dark:text-blue-300">Scaffold Faza 3</p>
            <p className="text-muted-foreground mt-1">
              Widok read-only gotowy nad tabelą <code>recurring_events</code>. CRUD +
              automatyczne planowanie kolejnego terminu po wykonaniu (last_done_date + interval_months) +
              powiadomienia (Telegram / email z tabeli <code>notifications_outbox</code>) — w kolejnej iteracji.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

function EventCard({ ev, variant }: { ev: RecurringEvent; variant: "overdue" | "upcoming" | "later" }) {
  const meta = TYPE_META[ev.recurrence_type] ?? TYPE_META.custom;
  const Icon = meta.Icon;
  const due = ev.next_due_date ? parseISO(ev.next_due_date) : null;
  const days = due ? differenceInDays(due, new Date()) : null;

  return (
    <Card className={cn(
      "p-4",
      variant === "overdue" && "border-destructive/50 bg-destructive/5"
    )}>
      <div className="flex items-start gap-3">
        <Icon className={cn("h-5 w-5 flex-shrink-0 mt-0.5", meta.color)} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2 flex-wrap">
            <p className="font-semibold text-sm truncate">{ev.title}</p>
            <Badge variant="outline" className="text-[10px]">{meta.label}</Badge>
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
          {ev.notes && <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{ev.notes}</p>}
        </div>
      </div>
    </Card>
  );
}
