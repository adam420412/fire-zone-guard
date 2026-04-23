import { useMemo, useState, useEffect, useRef } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSlaTickets, STATUS_LABELS, PRIORITY_LABELS, type SlaTicket } from "@/hooks/useSlaTickets";
import { Search, Filter, ShieldAlert, ArrowRight, Plus, Activity, Clock, Loader2, Download, Eye, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

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
  company_id: string | null;
  company_name: string | null;
  event_type: string;
  actor_label: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
}

const PAGE_SIZE = 100;

interface PageCursor {
  created_at: string;
  id: string;
}

interface EventsPage {
  rows: SlaEventRow[];
  nextCursor: PageCursor | null;
}

/**
 * Keyset pagination on (created_at DESC, id DESC).
 *
 * OFFSET is unsafe here because new events stream in at the top while the
 * user scrolls. Instead, each page asks for rows strictly older than the
 * last (created_at, id) tuple of the previous page. Stable across inserts
 * and matches the deterministic order used by the timeline grouping.
 *
 * Filter expresses: created_at < cursor.created_at
 *                OR (created_at = cursor.created_at AND id < cursor.id)
 */
function useAllSlaEvents() {
  return useInfiniteQuery<EventsPage>({
    queryKey: ["sla_ticket_events", "infinite"],
    initialPageParam: null,
    queryFn: async ({ pageParam }): Promise<EventsPage> => {
      const cursor = pageParam as PageCursor | null;
      let query = (supabase.from as any)("sla_ticket_events")
        .select("*")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(PAGE_SIZE);

      if (cursor) {
        query = query.or(
          `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`,
        );
      }

      const { data, error } = await query;
      if (error) throw error;
      const rows = (data ?? []) as SlaEventRow[];
      const last = rows[rows.length - 1];
      const nextCursor: PageCursor | null =
        rows.length === PAGE_SIZE && last
          ? { created_at: last.created_at, id: last.id }
          : null;
      return { rows, nextCursor };
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
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
  const {
    data: eventPages,
    isLoading: eventsLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useAllSlaEvents();

  // Flatten all loaded pages into a single chronological array. Order is
  // already DESC because each page is queried that way.
  const events = useMemo<SlaEventRow[]>(
    () => eventPages?.pages.flatMap((p) => p.rows) ?? [],
    [eventPages],
  );

  const [search, setSearch] = useState("");
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [companyFilter, setCompanyFilter] = useState<string>("all");
  const [selectedEntry, setSelectedEntry] = useState<TimelineEntry | null>(null);

  const ticketIndex = useMemo(() => {
    const map = new Map<string, SlaTicket>();
    tickets.forEach((t) => map.set(t.id, t));
    return map;
  }, [tickets]);

  // Build a sorted, deduped list of companies from currently-known tickets so
  // the filter dropdown only shows companies the admin actually has tickets for.
  const companyOptions = useMemo(() => {
    const map = new Map<string, string>();
    tickets.forEach((t) => {
      if (t.company_id && t.company_name) map.set(t.company_id, t.company_name);
    });
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "pl"));
  }, [tickets]);

  const timeline = useMemo<TimelineEntry[]>(() => {
    return events.map((e) => {
      const t = ticketIndex.get(e.ticket_id);
      return {
        id: e.id,
        ticket_id: e.ticket_id,
        ticket_number: t?.ticket_number ?? null,
        building_name: t?.building_name ?? null,
        company_id: t?.company_id ?? null,
        company_name: t?.company_name ?? null,
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
      // Company filter — events whose ticket has no company match only "all".
      // Note: events for tickets that haven't been loaded by useSlaTickets yet
      // (e.g. very old, paginated out) will have null company_id and won't
      // match a specific company filter. This is intentional — the alternative
      // is to fetch ticket metadata per-event which would defeat pagination.
      if (companyFilter !== "all" && entry.company_id !== companyFilter) return false;
      if (!q) return true;
      return (
        (entry.ticket_number ?? "").toLowerCase().includes(q) ||
        (entry.building_name ?? "").toLowerCase().includes(q) ||
        (entry.company_name ?? "").toLowerCase().includes(q) ||
        (entry.actor_label ?? "").toLowerCase().includes(q) ||
        entry.event_type.toLowerCase().includes(q)
      );
    });
  }, [timeline, search, eventFilter, companyFilter]);

  const groupedByDay = useMemo(() => {
    const groups = new Map<string, { label: string; entries: TimelineEntry[] }>();
    filtered.forEach((entry) => {
      const d = new Date(entry.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const label = d.toLocaleDateString("pl-PL", {
        weekday: "long", day: "2-digit", month: "long", year: "numeric",
      });
      let bucket = groups.get(key);
      if (!bucket) {
        bucket = { label, entries: [] };
        groups.set(key, bucket);
      }
      bucket.entries.push(entry);
    });
    groups.forEach((bucket) => {
      bucket.entries.sort((a, b) => {
        const diff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        if (diff !== 0) return diff;
        return b.id.localeCompare(a.id);
      });
    });
    return Array.from(groups.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([, bucket]) => [bucket.label, bucket.entries] as const);
  }, [filtered]);

  const eventTypeOptions = useMemo(() => {
    const set = new Set(events.map((e) => e.event_type));
    return Array.from(set);
  }, [events]);

  // Auto-load older pages when the sentinel scrolls into view. Re-creates the
  // observer when fetch state changes so it doesn't double-fire mid-flight.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasNextPage || isFetchingNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          fetchNextPage();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, filtered.length]);

  const isLoading = ticketsLoading || eventsLoading;
  const isAdmin = role === "super_admin" || role === "admin";

  // CSV export of the currently filtered timeline. Excel-friendly: UTF-8 BOM,
  // CRLF line endings, fields wrapped in quotes with internal quotes doubled.
  const handleExportCsv = () => {
    const headers = ["ticket_number", "building", "company", "event_type", "actor", "created_at", "payload"];
    const escape = (v: unknown) => {
      const s = v == null ? "" : typeof v === "string" ? v : JSON.stringify(v);
      return `"${s.replace(/"/g, '""')}"`;
    };
    const rows = filtered.map((e) => [
      e.ticket_number ?? "",
      e.building_name ?? "",
      e.company_name ?? "",
      EVENT_LABELS[e.event_type] ?? e.event_type,
      e.actor_label ?? "",
      e.created_at,
      e.payload ?? "",
    ].map(escape).join(","));
    const csv = "\uFEFF" + [headers.join(","), ...rows].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    a.download = `audyt-sla-${ts}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

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
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            className="rounded-md border border-border bg-card px-3 py-1.5 text-sm outline-none cursor-pointer max-w-[14rem]"
            title="Filtruj po firmie"
          >
            <option value="all">Wszystkie firmy</option>
            {companyOptions.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
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
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={filtered.length === 0}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium transition-colors hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
            title="Eksportuj przefiltrowane zdarzenia do CSV"
          >
            <Download className="h-3.5 w-3.5" />
            Eksport CSV
          </button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-[10px] font-bold uppercase text-muted-foreground">
            Wczytanych zdarzeń{hasNextPage && " (więcej dostępnych)"}
          </div>
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
                        onClick={() => setSelectedEntry(entry)}
                        className="group flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:border-primary/40 hover:bg-card/60"
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
                                onClick={(e) => e.stopPropagation()}
                                className="text-xs font-mono text-primary hover:underline"
                              >
                                {entry.ticket_number}
                              </Link>
                            )}
                            {entry.company_name && (
                              <span className="text-xs text-muted-foreground">
                                · {entry.company_name}
                              </span>
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

                        <div className="flex shrink-0 items-start gap-2">
                          <div className="text-right">
                            <div className="font-mono text-[11px] text-muted-foreground">
                              {formatDateTime(entry.created_at).split(", ")[1]}
                            </div>
                            {entry.actor_label && (
                              <div className="text-[10px] text-muted-foreground/70">
                                {entry.actor_label}
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setSelectedEntry(entry); }}
                            className="rounded-md border border-transparent p-1.5 text-muted-foreground opacity-0 transition-all hover:border-primary/40 hover:text-primary group-hover:opacity-100"
                            title="Pokaż szczegóły"
                            aria-label="Pokaż szczegóły"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}

            {/* Infinite-scroll sentinel + manual fallback. The IntersectionObserver
                in the effect above triggers fetchNextPage when this element scrolls
                near the viewport. The button is a fallback for keyboard / a11y. */}
            {hasNextPage && (
              <div ref={sentinelRef} className="flex justify-center py-4">
                <button
                  type="button"
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                  className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:cursor-wait disabled:opacity-60"
                >
                  {isFetchingNextPage ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Ładowanie starszych zdarzeń...
                    </>
                  ) : (
                    "Załaduj starsze zdarzenia"
                  )}
                </button>
              </div>
            )}
            {!hasNextPage && events.length > 0 && (
              <div className="py-4 text-center text-[11px] text-muted-foreground/70">
                Wczytano wszystkie zdarzenia ({events.length})
              </div>
            )}
          </div>
        )}
      </div>

      <Dialog open={!!selectedEntry} onOpenChange={(open) => !open && setSelectedEntry(null)}>
        <DialogContent className="max-w-2xl">
          {selectedEntry && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {(() => {
                    const Icon = EVENT_ICONS[selectedEntry.event_type] ?? Activity;
                    return <Icon className="h-4 w-4 text-primary" />;
                  })()}
                  {EVENT_LABELS[selectedEntry.event_type] ?? selectedEntry.event_type}
                </DialogTitle>
                <DialogDescription className="font-mono text-xs">
                  {formatDateTime(selectedEntry.created_at)}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-3 gap-3 rounded-md border border-border bg-muted/30 p-3">
                  <div>
                    <div className="text-[10px] font-bold uppercase text-muted-foreground">Zgłoszenie</div>
                    <div className="mt-0.5 font-mono text-xs">
                      {selectedEntry.ticket_number ?? "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase text-muted-foreground">Firma</div>
                    <div className="mt-0.5 truncate text-xs">{selectedEntry.company_name ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase text-muted-foreground">Obiekt</div>
                    <div className="mt-0.5 truncate text-xs">{selectedEntry.building_name ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase text-muted-foreground">Autor</div>
                    <div className="mt-0.5 truncate text-xs">{selectedEntry.actor_label ?? "system"}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase text-muted-foreground">Typ zdarzenia</div>
                    <div className="mt-0.5 font-mono text-xs">{selectedEntry.event_type}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase text-muted-foreground">Event ID</div>
                    <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                      {selectedEntry.id}
                    </div>
                  </div>
                </div>

                <div>
                  <div className="mb-1.5 text-[10px] font-bold uppercase text-muted-foreground">
                    Sformatowany kontekst
                  </div>
                  <div className="rounded-md border border-border bg-card p-3">
                    {renderPayload(selectedEntry.event_type, selectedEntry.payload) ?? (
                      <span className="text-xs text-muted-foreground">Brak danych kontekstowych</span>
                    )}
                  </div>
                </div>

                <div>
                  <div className="mb-1.5 text-[10px] font-bold uppercase text-muted-foreground">
                    Pełny payload (JSON)
                  </div>
                  <pre className="max-h-60 overflow-auto rounded-md border border-border bg-muted/40 p-3 text-[11px] leading-relaxed">
                    {selectedEntry.payload
                      ? JSON.stringify(selectedEntry.payload, null, 2)
                      : "null"}
                  </pre>
                </div>
              </div>

              <DialogFooter className="gap-2 sm:gap-2">
                <Button variant="outline" onClick={() => setSelectedEntry(null)}>
                  Zamknij
                </Button>
                <Button asChild>
                  <Link to={`/sla/${selectedEntry.ticket_id}`}>
                    <ExternalLink className="h-4 w-4" />
                    Otwórz zgłoszenie
                  </Link>
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
