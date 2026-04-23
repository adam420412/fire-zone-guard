import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSlaTickets, STATUS_LABELS, PRIORITY_LABELS, type SlaTicket } from "@/hooks/useSlaTickets";
import { Search, Filter, ShieldAlert, ArrowRight, Plus, Activity, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";

interface SlaEventRow {
  id: string;
  ticket_id: string;
  actor_id: string | null;
  actor_label: string | null;
  event_type: string;
  payload: Record<string, unknown> | null;
  created_at: string;
}

interface TimelineEntry {
  id: string;
  ticket_id: string;
  ticket_number: string | null;
  building_name: string | null;
  event_type: string;
  actor_label: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
}

function useAllSlaEvents(limit = 1000) {
  return useQuery({
    queryKey: ["sla_ticket_events", "all", limit],
    queryFn: async (): Promise<SlaEventRow[]> => {
      // Order newest-first; tiebreak on id so events written in the same
      // transaction (e.g. created + status_change from the same trigger)
      // get a stable, deterministic order instead of bouncing around.
      const { data, error } = await (supabase.from as any)("sla_ticket_events")
        .select("*")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as SlaEventRow[];
    },
  });
}

const EVENT_LABELS: Record<string, string> = {
  created: "Utworzono zgłoszenie",
  status_change: "Zmiana statusu",
  task_created: "Utworzono zadanie naprawy",
  comment: "Komentarz",
  assignment: "Przypisanie",
};

const EVENT_ICONS: Record<string, typeof Activity> = {
  created: Plus,
  status_change: ArrowRight,
  task_created: ShieldAlert,
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("pl-PL", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function renderPayload(eventType: string, payload: Record<string, unknown> | null) {
  if (!payload) return null;
  if (eventType === "status_change") {
    const from = payload.from as string | undefined;
    const to = payload.to as string | undefined;
    return (
      <span className="inline-flex items-center gap-1.5 text-xs">
        <span className="rounded bg-muted px-1.5 py-0.5 font-medium">
          {from ? STATUS_LABELS[from as keyof typeof STATUS_LABELS] ?? from : "?"}
        </span>
        <ArrowRight className="h-3 w-3 text-muted-foreground" />
        <span className="rounded bg-primary/15 px-1.5 py-0.5 font-medium text-primary">
          {to ? STATUS_LABELS[to as keyof typeof STATUS_LABELS] ?? to : "?"}
        </span>
      </span>
    );
  }
  if (eventType === "created") {
    const status = payload.status as string | undefined;
    const priority = payload.priority as string | undefined;
    const type = payload.type as string | undefined;
    return (
      <span className="text-xs text-muted-foreground">
        {type && <span className="mr-2">Typ: <span className="text-foreground">{type}</span></span>}
        {priority && (
          <span className="mr-2">
            Priorytet: <span className="text-foreground">{PRIORITY_LABELS[priority as keyof typeof PRIORITY_LABELS] ?? priority}</span>
          </span>
        )}
        {status && (
          <span>Status: <span className="text-foreground">{STATUS_LABELS[status as keyof typeof STATUS_LABELS] ?? status}</span></span>
        )}
      </span>
    );
  }
  if (eventType === "task_created") {
    const taskId = payload.task_id as string | undefined;
    return taskId ? (
      <Link to="/repairs" className="text-xs text-primary hover:underline">
        Zadanie naprawy → /repairs
      </Link>
    ) : null;
  }
  return (
    <code className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
      {JSON.stringify(payload)}
    </code>
  );
}

export default function SlaAuditLogPage() {
  const { role } = useAuth();
  const { data: tickets = [], isLoading: ticketsLoading } = useSlaTickets();
  const { data: events = [], isLoading: eventsLoading } = useAllSlaEvents();

  const [search, setSearch] = useState("");
  const [eventFilter, setEventFilter] = useState<string>("all");

  const ticketIndex = useMemo(() => {
    const map = new Map<string, SlaTicket>();
    tickets.forEach((t) => map.set(t.id, t));
    return map;
  }, [tickets]);

  const timeline = useMemo<TimelineEntry[]>(() => {
    return events.map((e) => {
      const t = ticketIndex.get(e.ticket_id);
      return {
        id: e.id,
        ticket_id: e.ticket_id,
        ticket_number: t?.ticket_number ?? null,
        building_name: t?.building_name ?? null,
        event_type: e.event_type,
        actor_label: e.actor_label,
        payload: e.payload,
        created_at: e.created_at,
      };
    });
  }, [events, ticketIndex]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return timeline.filter((entry) => {
      if (eventFilter !== "all" && entry.event_type !== eventFilter) return false;
      if (!q) return true;
      return (
        (entry.ticket_number ?? "").toLowerCase().includes(q) ||
        (entry.building_name ?? "").toLowerCase().includes(q) ||
        (entry.actor_label ?? "").toLowerCase().includes(q) ||
        entry.event_type.toLowerCase().includes(q)
      );
    });
  }, [timeline, search, eventFilter]);

  const groupedByDay = useMemo(() => {
    const groups = new Map<string, TimelineEntry[]>();
    filtered.forEach((entry) => {
      const day = new Date(entry.created_at).toLocaleDateString("pl-PL", {
        weekday: "long", day: "2-digit", month: "long", year: "numeric",
      });
      if (!groups.has(day)) groups.set(day, []);
      groups.get(day)!.push(entry);
    });
    return Array.from(groups.entries());
  }, [filtered]);

  const eventTypeOptions = useMemo(() => {
    const set = new Set(events.map((e) => e.event_type));
    return Array.from(set);
  }, [events]);

  const isLoading = ticketsLoading || eventsLoading;
  const isAdmin = role === "super_admin" || role === "admin";

  if (!isAdmin) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <ShieldAlert className="h-12 w-12 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Brak dostępu</h2>
        <p className="text-sm text-muted-foreground">Ten widok jest dostępny tylko dla administratorów.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Audyt SLA</h1>
          <p className="text-sm text-muted-foreground">
            Chronologiczny log zmian statusów i zdarzeń zgłoszeń SLA
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 focus-within:border-primary transition-colors">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Szukaj po nr, obiekcie, autorze..."
              className="w-64 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <select
            value={eventFilter}
            onChange={(e) => setEventFilter(e.target.value)}
            className="rounded-md border border-border bg-card px-3 py-1.5 text-sm outline-none cursor-pointer"
          >
            <option value="all">Wszystkie zdarzenia</option>
            {eventTypeOptions.map((t) => (
              <option key={t} value={t}>{EVENT_LABELS[t] ?? t}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-[10px] font-bold uppercase text-muted-foreground">Wszystkich zdarzeń</div>
          <div className="mt-1 text-2xl font-bold">{events.length}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-[10px] font-bold uppercase text-muted-foreground">Zmian statusu</div>
          <div className="mt-1 text-2xl font-bold">
            {events.filter((e) => e.event_type === "status_change").length}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-[10px] font-bold uppercase text-muted-foreground">Eskalacji do napraw</div>
          <div className="mt-1 text-2xl font-bold">
            {events.filter((e) => e.event_type === "task_created").length}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-6 scrollbar-thin">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
            Ładowanie historii...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center opacity-50">
            <Filter className="h-8 w-8 mb-2" />
            <p className="text-sm">Brak zdarzeń pasujących do filtra</p>
          </div>
        ) : (
          <div className="space-y-6">
            {groupedByDay.map(([day, entries]) => (
              <div key={day}>
                <div className="sticky top-0 z-10 mb-2 flex items-center gap-2 bg-background/95 py-1 backdrop-blur">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    {day}
                  </h3>
                  <div className="flex-1 border-t border-border" />
                  <span className="text-[10px] font-medium text-muted-foreground">
                    {entries.length} {entries.length === 1 ? "zdarzenie" : "zdarzeń"}
                  </span>
                </div>
                <ul className="space-y-1.5">
                  {entries.map((entry) => {
                    const Icon = EVENT_ICONS[entry.event_type] ?? Activity;
                    return (
                      <li
                        key={entry.id}
                        className="group flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:border-primary/40 hover:bg-card/60"
                      >
                        <div
                          className={cn(
                            "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                            entry.event_type === "task_created" && "bg-warning/15 text-warning",
                            entry.event_type === "status_change" && "bg-primary/15 text-primary",
                            entry.event_type === "created" && "bg-success/15 text-success",
                            !["task_created","status_change","created"].includes(entry.event_type) && "bg-muted text-muted-foreground",
                          )}
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                            <span className="text-sm font-semibold">
                              {EVENT_LABELS[entry.event_type] ?? entry.event_type}
                            </span>
                            {entry.ticket_number && (
                              <Link
                                to={`/sla/${entry.ticket_id}`}
                                className="text-xs font-mono text-primary hover:underline"
                              >
                                {entry.ticket_number}
                              </Link>
                            )}
                            {entry.building_name && (
                              <span className="text-xs text-muted-foreground">
                                · {entry.building_name}
                              </span>
                            )}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                            {renderPayload(entry.event_type, entry.payload)}
                          </div>
                        </div>

                        <div className="shrink-0 text-right">
                          <div className="font-mono text-[11px] text-muted-foreground">
                            {formatDateTime(entry.created_at).split(", ")[1]}
                          </div>
                          {entry.actor_label && (
                            <div className="text-[10px] text-muted-foreground/70">
                              {entry.actor_label}
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
