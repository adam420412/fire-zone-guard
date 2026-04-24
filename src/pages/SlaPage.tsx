import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { format, parseISO, isPast } from "date-fns";
import { pl } from "date-fns/locale";
import { toast } from "sonner";
import {
  ArrowLeft, Search, Filter, Loader2, AlertTriangle, Phone, Truck, MapPin,
  CheckCircle2, Ban, Clock, Flame, FileText, Image as ImageIcon, Wrench,
  ClipboardList, FileSearch, User as UserIcon, Building2, Mail, PhoneCall,
  Sparkles, RefreshCw,
} from "lucide-react";
import {
  useSlaTickets,
  useSlaTicket,
  useSlaTicketEvents,
  useUpdateSlaTicket,
  STATUS_LABELS,
  STATUS_FLOW,
  PRIORITY_LABELS,
  TYPE_LABELS,
  nextAllowedStatuses,
  isTerminalStatus,
  type SlaTicketStatus,
  type SlaTicketPriority,
  type SlaTicket,
} from "@/hooks/useSlaTickets";
import { useProfiles } from "@/hooks/useSupabaseData";
import { useAnalyzeSlaPhoto } from "@/hooks/useAnalyzeSlaPhoto";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

const PRIORITY_BADGE: Record<SlaTicketPriority, string> = {
  low:      "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-400/30",
  normal:   "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-400/30",
  high:     "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-400/30",
  critical: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-400/30",
};

const STATUS_ICONS: Record<SlaTicketStatus, typeof Phone> = {
  zgloszenie: ClipboardList,
  telefon:    Phone,
  wyjazd:     Truck,
  na_miejscu: MapPin,
  diagnoza:   FileSearch,
  naprawiono: CheckCircle2,
  niezasadne: Ban,
  zamkniete:  FileText,
};

export default function SlaPage() {
  const { id } = useParams<{ id?: string }>();
  if (id) return <SlaDetail id={id} />;
  return <SlaList />;
}

// ============================================================================
// LIST
// ============================================================================
function SlaList() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<SlaTicketStatus | "all" | "active">("active");
  const [priorityFilter, setPriorityFilter] = useState<SlaTicketPriority | "all">("all");
  const [search, setSearch] = useState("");

  const { data: tickets, isLoading } = useSlaTickets({
    status: statusFilter === "active" || statusFilter === "all" ? "all" : statusFilter,
    priority: priorityFilter,
  });

  const filtered = useMemo(() => {
    let arr = tickets ?? [];
    if (statusFilter === "active") {
      arr = arr.filter((t) => t.status !== "zamkniete" && t.status !== "niezasadne");
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      arr = arr.filter((t) =>
        (t.ticket_number ?? "").toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        (t.reporter_name ?? "").toLowerCase().includes(q) ||
        (t.building_name ?? "").toLowerCase().includes(q) ||
        (t.assigned_to_name ?? "").toLowerCase().includes(q)
      );
    }
    return arr;
  }, [tickets, statusFilter, search]);

  const breachedCount = (tickets ?? []).filter(
    (t) => (t.sla_response_breached || t.sla_resolution_breached) && !isTerminalStatus(t.status)
  ).length;

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* HEADER */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <Flame className="h-7 w-7 text-orange-500" />
            SLA — Zgłoszenia
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Tryb awaryjny: usterki, porady prawno-techniczne, kontrole.
          </p>
        </div>
        {breachedCount > 0 && (
          <Badge variant="destructive" className="gap-1 text-sm py-1 px-3">
            <AlertTriangle className="h-3.5 w-3.5" />
            {breachedCount} {breachedCount === 1 ? "zgłoszenie z naruszeniem SLA" : "zgłoszeń z naruszeniem SLA"}
          </Badge>
        )}
      </div>

      {/* FILTERS */}
      <Card className="p-4">
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Szukaj po numerze, opisie, zgłaszającym, obiekcie..."
              className="pl-9"
            />
          </div>
          <Select value={priorityFilter} onValueChange={(v) => setPriorityFilter(v as any)}>
            <SelectTrigger className="md:w-44">
              <SelectValue placeholder="Priorytet" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Wszystkie priorytety</SelectItem>
              <SelectItem value="critical">Krytyczny</SelectItem>
              <SelectItem value="high">Wysoki</SelectItem>
              <SelectItem value="normal">Normalny</SelectItem>
              <SelectItem value="low">Niski</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)} className="mt-4">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="active">Aktywne</TabsTrigger>
            <TabsTrigger value="all">Wszystkie</TabsTrigger>
            {STATUS_FLOW.filter((s) => s !== "zgloszenie").map((s) => (
              <TabsTrigger key={s} value={s}>{STATUS_LABELS[s]}</TabsTrigger>
            ))}
            <TabsTrigger value="niezasadne">Niezasadne</TabsTrigger>
          </TabsList>
        </Tabs>
      </Card>

      {/* TABLE */}
      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground border-dashed">
          <Filter className="h-10 w-10 mx-auto mb-2 opacity-50" />
          Brak zgłoszeń pasujących do filtrów.
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2.5 text-left">Numer</th>
                  <th className="px-3 py-2.5 text-left">Status</th>
                  <th className="px-3 py-2.5 text-left">Priorytet</th>
                  <th className="px-3 py-2.5 text-left">Opis</th>
                  <th className="px-3 py-2.5 text-left">Obiekt</th>
                  <th className="px-3 py-2.5 text-left">Zgłaszający</th>
                  <th className="px-3 py-2.5 text-left">Serwisant</th>
                  <th className="px-3 py-2.5 text-left">Reakcja</th>
                  <th className="px-3 py-2.5 text-left">Naprawa</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => {
                  const Icon = STATUS_ICONS[t.status];
                  const responseBreach = t.sla_response_breached;
                  const resolutionBreach = t.sla_resolution_breached;
                  return (
                    <tr
                      key={t.id}
                      onClick={() => navigate(`/sla/${t.id}`)}
                      className="border-t hover:bg-muted/30 cursor-pointer transition-colors"
                    >
                      <td className="px-3 py-2.5 font-mono text-xs whitespace-nowrap">{t.ticket_number ?? "—"}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 text-xs">
                          <Icon className="h-3.5 w-3.5" />
                          {STATUS_LABELS[t.status]}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge variant="outline" className={cn("text-xs", PRIORITY_BADGE[t.priority])}>
                          {PRIORITY_LABELS[t.priority]}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5 max-w-xs truncate">{t.description}</td>
                      <td className="px-3 py-2.5 max-w-[160px] truncate">{t.building_name ?? "—"}</td>
                      <td className="px-3 py-2.5 max-w-[140px] truncate">{t.reporter_name ?? t.reporter_email ?? "—"}</td>
                      <td className="px-3 py-2.5 max-w-[140px] truncate">
                        {t.assigned_to_name ?? <span className="text-muted-foreground italic">brak</span>}
                      </td>
                      <td className={cn("px-3 py-2.5 whitespace-nowrap text-xs", responseBreach && "text-destructive font-semibold")}>
                        {t.first_response_at
                          ? <span className="text-green-600 dark:text-green-400">✓</span>
                          : t.sla_response_due
                            ? format(parseISO(t.sla_response_due), "d MMM HH:mm", { locale: pl })
                            : "—"}
                      </td>
                      <td className={cn("px-3 py-2.5 whitespace-nowrap text-xs", resolutionBreach && "text-destructive font-semibold")}>
                        {t.resolved_at
                          ? <span className="text-green-600 dark:text-green-400">✓</span>
                          : t.sla_resolution_due
                            ? format(parseISO(t.sla_resolution_due), "d MMM HH:mm", { locale: pl })
                            : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// ============================================================================
// DETAIL
// ============================================================================
function SlaDetail({ id }: { id: string }) {
  const navigate = useNavigate();
  const { data: ticket, isLoading } = useSlaTicket(id);
  const { data: events } = useSlaTicketEvents(id);
  const { data: profiles } = useProfiles();
  const updateMut = useUpdateSlaTicket();
  const analyzeMut = useAnalyzeSlaPhoto();

  const [diagnosis, setDiagnosis] = useState("");
  const [notes, setNotes] = useState("");
  const [lightbox, setLightbox] = useState<string | null>(null);

  // Sync local edits when ticket loads
  useMemo(() => {
    if (ticket) {
      setDiagnosis(ticket.diagnosis ?? "");
      setNotes(ticket.notes ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket?.id]);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!ticket) {
    return (
      <div className="p-6">
        <Button variant="ghost" onClick={() => navigate("/sla")} className="gap-2 mb-4">
          <ArrowLeft className="h-4 w-4" /> Powrót
        </Button>
        <Card className="p-8 text-center text-muted-foreground">Nie znaleziono zgłoszenia.</Card>
      </div>
    );
  }

  const allowedNext = nextAllowedStatuses(ticket.status);
  const breachedRes = ticket.sla_response_breached;
  const breachedRez = ticket.sla_resolution_breached;

  const handleStatusChange = async (next: SlaTicketStatus) => {
    try {
      await updateMut.mutateAsync({ id: ticket.id, patch: { status: next } });
      toast.success(`Status: ${STATUS_LABELS[next]}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Nie udało się zmienić statusu");
    }
  };

  const handleAssign = async (userId: string) => {
    try {
      await updateMut.mutateAsync({ id: ticket.id, patch: { assigned_to: userId === "_none" ? null : userId } });
      toast.success("Przypisano serwisanta");
    } catch (e: any) {
      toast.error(e?.message ?? "Nie udało się przypisać");
    }
  };

  const handlePriorityChange = async (p: SlaTicketPriority) => {
    try {
      await updateMut.mutateAsync({ id: ticket.id, patch: { priority: p } });
      toast.success("Zmieniono priorytet");
    } catch (e: any) {
      toast.error(e?.message ?? "Błąd zapisu");
    }
  };

  const handleSaveDiagnosis = async () => {
    try {
      await updateMut.mutateAsync({ id: ticket.id, patch: { diagnosis, notes } });
      toast.success("Zapisano");
    } catch (e: any) {
      toast.error(e?.message ?? "Błąd zapisu");
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-6xl mx-auto">
      <div>
        <Button variant="ghost" onClick={() => navigate("/sla")} className="gap-2 mb-3 -ml-2">
          <ArrowLeft className="h-4 w-4" /> Lista zgłoszeń
        </Button>
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className="font-mono text-sm text-muted-foreground">{ticket.ticket_number ?? "—"}</span>
          <Badge variant="outline" className={cn("text-xs", PRIORITY_BADGE[ticket.priority])}>
            {PRIORITY_LABELS[ticket.priority]}
          </Badge>
          <Badge variant="secondary" className="text-xs">{TYPE_LABELS[ticket.type]}</Badge>
          {breachedRes && <Badge variant="destructive" className="text-xs gap-1"><AlertTriangle className="h-3 w-3" /> Reakcja przekroczona</Badge>}
          {breachedRez && <Badge variant="destructive" className="text-xs gap-1"><AlertTriangle className="h-3 w-3" /> Naprawa przekroczona</Badge>}
        </div>
        <h1 className="text-xl md:text-2xl font-bold">{ticket.description}</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Utworzono: {format(parseISO(ticket.created_at), "d MMM yyyy, HH:mm", { locale: pl })}
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* LEFT MAIN COLUMN */}
        <div className="lg:col-span-2 space-y-5">
          {/* STATUS ACTIONS */}
          <Card className="p-4">
            <div className="text-xs text-muted-foreground uppercase font-semibold tracking-wide mb-3">
              Aktualny status: <span className="text-foreground">{STATUS_LABELS[ticket.status]}</span>
            </div>
            {allowedNext.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {allowedNext.map((s) => {
                  const Icon = STATUS_ICONS[s];
                  const isReject = s === "niezasadne";
                  const isFix = s === "naprawiono";
                  return (
                    <Button
                      key={s}
                      onClick={() => handleStatusChange(s)}
                      disabled={updateMut.isPending}
                      variant={isReject ? "outline" : isFix ? "default" : "secondary"}
                      size="sm"
                      className={cn(
                        "gap-1.5",
                        isFix && "bg-green-600 hover:bg-green-700",
                        isReject && "border-amber-500 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10"
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {STATUS_LABELS[s]}
                    </Button>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Zgłoszenie zamknięte. Brak dalszych akcji.</p>
            )}
          </Card>

          {/* PHOTOS */}
          {ticket.photo_urls && ticket.photo_urls.length > 0 && (
            <Card className="p-4">
              <div className="text-xs text-muted-foreground uppercase font-semibold tracking-wide mb-3 flex items-center gap-1">
                <ImageIcon className="h-3 w-3" /> Zdjęcia ({ticket.photo_urls.length})
              </div>
              <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
                {ticket.photo_urls.map((url, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setLightbox(url)}
                    className="aspect-square rounded-md overflow-hidden bg-muted hover:opacity-80 transition"
                  >
                    <img src={url} alt={`Zdjęcie ${i + 1}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </Card>
          )}

          {/* AI VISION (Iter 7) */}
          {(ticket.ai_summary || ticket.ai_severity_suggestion ||
            ticket.ai_analysis_at || (ticket.photo_urls && ticket.photo_urls.length > 0)) && (
            <Card className="p-4 border-purple-500/30 bg-purple-500/5">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="text-xs uppercase font-semibold tracking-wide flex items-center gap-1.5 text-purple-700 dark:text-purple-300">
                  <Sparkles className="h-3.5 w-3.5" /> AI — analiza zdjęć
                </div>
                {ticket.photo_urls && ticket.photo_urls.length > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1 text-xs"
                    onClick={async () => {
                      try {
                        await analyzeMut.mutateAsync({ ticket_id: ticket.id });
                        toast.success("Analiza AI zakończona");
                      } catch (e: any) {
                        toast.error(e?.message ?? "Analiza AI nie powiodła się");
                      }
                    }}
                    disabled={analyzeMut.isPending}
                  >
                    {analyzeMut.isPending
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <RefreshCw className="h-3 w-3" />}
                    {ticket.ai_analysis_at ? "Powtórz analizę" : "Analizuj"}
                  </Button>
                )}
              </div>

              {ticket.ai_analysis_error && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 mb-3 text-xs text-amber-700 dark:text-amber-300">
                  Błąd analizy: {ticket.ai_analysis_error}
                </div>
              )}

              {ticket.ai_summary ? (
                <>
                  <p className="text-sm text-card-foreground leading-relaxed mb-3">
                    {ticket.ai_summary}
                  </p>

                  {/* Sugestia priorytetu vs aktualny */}
                  {ticket.ai_severity_suggestion && (
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <span className="text-xs text-muted-foreground">Sugestia priorytetu:</span>
                      <Badge
                        variant="outline"
                        className={cn("text-xs",
                          PRIORITY_BADGE[ticket.ai_severity_suggestion as SlaTicketPriority])}
                      >
                        {PRIORITY_LABELS[ticket.ai_severity_suggestion as SlaTicketPriority]}
                      </Badge>
                      {ticket.ai_severity_suggestion !== ticket.priority && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 text-xs"
                          onClick={() => handlePriorityChange(
                            ticket.ai_severity_suggestion as SlaTicketPriority,
                          )}
                        >
                          Zastosuj
                        </Button>
                      )}
                    </div>
                  )}

                  {/* Strukturalne kategoryzacje */}
                  {ticket.ai_category && (() => {
                    const c = ticket.ai_category as Record<string, unknown>;
                    const dev = typeof c.device_type === "string" ? c.device_type : null;
                    const issue = typeof c.issue === "string" ? c.issue : null;
                    const action = typeof c.recommended_action === "string"
                      ? c.recommended_action : null;
                    const damage = c.visible_damage === true;
                    const conf = typeof c.confidence === "string" ? c.confidence : null;
                    if (!dev && !issue && !action && !damage && !conf) return null;
                    return (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                        {dev && (
                          <div><span className="text-muted-foreground">Urządzenie: </span>
                            <span className="font-medium">{dev}</span></div>
                        )}
                        {issue && (
                          <div><span className="text-muted-foreground">Problem: </span>
                            <span className="font-medium">{issue}</span></div>
                        )}
                        {damage && (
                          <div className="text-amber-700 dark:text-amber-300">
                            <span className="font-medium">⚠ Widoczne uszkodzenie</span>
                          </div>
                        )}
                        {conf && (
                          <div><span className="text-muted-foreground">Pewność: </span>
                            <span className="font-medium">{conf}</span></div>
                        )}
                        {action && (
                          <div className="sm:col-span-2 mt-1 rounded bg-card p-2 border border-border">
                            <span className="text-muted-foreground">Rekomendacja: </span>
                            <span className="font-medium">{action}</span>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {ticket.ai_analysis_at && (
                    <p className="text-[10px] text-muted-foreground mt-3">
                      Analiza wykonana: {format(parseISO(ticket.ai_analysis_at),
                        "d MMM, HH:mm", { locale: pl })}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {ticket.photo_urls && ticket.photo_urls.length > 0
                    ? "Brak analizy. Kliknij \"Analizuj\" żeby wywołać gpt-4o vision."
                    : "Brak zdjęć do analizy."}
                </p>
              )}
            </Card>
          )}

          {/* DIAGNOSIS */}
          <Card className="p-4 space-y-3">
            <div className="text-xs text-muted-foreground uppercase font-semibold tracking-wide">
              Diagnoza serwisanta
            </div>
            <Textarea
              value={diagnosis}
              onChange={(e) => setDiagnosis(e.target.value)}
              placeholder="Opisz przyczynę usterki, wykonane czynności, użyte materiały..."
              rows={5}
            />
            <div className="text-xs text-muted-foreground uppercase font-semibold tracking-wide pt-2">
              Notatki wewnętrzne
            </div>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notatki widoczne tylko dla zespołu (nie dla klienta)..."
              rows={3}
            />
            <Button onClick={handleSaveDiagnosis} disabled={updateMut.isPending} className="gap-2">
              {updateMut.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Zapisz diagnozę i notatki
            </Button>
          </Card>

          {/* TIMELINE */}
          {events && events.length > 0 && (
            <Card className="p-4">
              <div className="text-xs text-muted-foreground uppercase font-semibold tracking-wide mb-3">
                Historia zdarzeń
              </div>
              <ol className="space-y-3">
                {events.map((ev) => (
                  <li key={ev.id} className="flex gap-3 text-sm">
                    <div className="w-2 h-2 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2 flex-wrap">
                        <span className="font-medium">{formatEventLabel(ev.event_type, ev.payload)}</span>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {format(parseISO(ev.created_at), "d MMM, HH:mm", { locale: pl })}
                        </span>
                      </div>
                      {ev.actor_label && (
                        <div className="text-xs text-muted-foreground">{ev.actor_label}</div>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </Card>
          )}
        </div>

        {/* RIGHT META COLUMN */}
        <div className="space-y-5">
          {/* SLA TIMING */}
          <Card className="p-4 space-y-3">
            <div className="text-xs text-muted-foreground uppercase font-semibold tracking-wide">
              SLA
            </div>
            <SlaRow
              label="Reakcja"
              due={ticket.sla_response_due}
              done={ticket.first_response_at}
              breached={!!breachedRes}
            />
            <SlaRow
              label="Naprawa"
              due={ticket.sla_resolution_due}
              done={ticket.resolved_at}
              breached={!!breachedRez}
            />
          </Card>

          {/* ASSIGNMENT */}
          <Card className="p-4 space-y-3">
            <div className="text-xs text-muted-foreground uppercase font-semibold tracking-wide">
              Przypisanie
            </div>
            <Select
              value={ticket.assigned_to ?? "_none"}
              onValueChange={handleAssign}
            >
              <SelectTrigger>
                <SelectValue placeholder="Wybierz serwisanta" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">— brak —</SelectItem>
                {(profiles ?? []).map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name ?? p.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="text-xs text-muted-foreground uppercase font-semibold tracking-wide pt-2">
              Priorytet
            </div>
            <Select value={ticket.priority} onValueChange={(v) => handlePriorityChange(v as SlaTicketPriority)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="critical">Krytyczny (24h)</SelectItem>
                <SelectItem value="high">Wysoki (48h)</SelectItem>
                <SelectItem value="normal">Normalny (72h)</SelectItem>
                <SelectItem value="low">Niski (72h)</SelectItem>
              </SelectContent>
            </Select>
          </Card>

          {/* REPORTER */}
          <Card className="p-4 space-y-2 text-sm">
            <div className="text-xs text-muted-foreground uppercase font-semibold tracking-wide mb-2">
              Zgłaszający
            </div>
            {ticket.reporter_name && (
              <div className="flex items-center gap-2"><UserIcon className="h-3.5 w-3.5 text-muted-foreground" />{ticket.reporter_name}</div>
            )}
            {ticket.reporter_email && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Mail className="h-3.5 w-3.5" />
                <a href={`mailto:${ticket.reporter_email}`} className="hover:text-primary truncate">
                  {ticket.reporter_email}
                </a>
              </div>
            )}
            {ticket.reporter_phone && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <PhoneCall className="h-3.5 w-3.5" />
                <a href={`tel:${ticket.reporter_phone}`} className="hover:text-primary">
                  {ticket.reporter_phone}
                </a>
              </div>
            )}
          </Card>

          {/* BUILDING */}
          {(ticket.building_name || ticket.company_name) && (
            <Card className="p-4 space-y-2 text-sm">
              <div className="text-xs text-muted-foreground uppercase font-semibold tracking-wide mb-2">
                Lokalizacja
              </div>
              {ticket.building_name && (
                <div className="flex items-start gap-2">
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground mt-0.5" />
                  <div className="min-w-0">
                    <div className="font-medium">{ticket.building_name}</div>
                    {ticket.building_address && (
                      <div className="text-xs text-muted-foreground">{ticket.building_address}</div>
                    )}
                  </div>
                </div>
              )}
              {ticket.company_name && (
                <div className="text-xs text-muted-foreground pt-1">Firma: {ticket.company_name}</div>
              )}
              {ticket.device_type && (
                <div className="text-xs text-muted-foreground pt-1">Urządzenie: {ticket.device_type}</div>
              )}
            </Card>
          )}
        </div>
      </div>

      {/* LIGHTBOX */}
      {lightbox && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setLightbox(null)}
        >
          <img src={lightbox} alt="Podgląd" className="max-w-full max-h-full object-contain" />
        </div>
      )}
    </div>
  );
}

function SlaRow({
  label, due, done, breached,
}: {
  label: string;
  due: string | null;
  done: string | null;
  breached: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-sm">
        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
        <span>{label}</span>
      </div>
      <div className="text-right text-xs">
        {done ? (
          <span className="text-green-600 dark:text-green-400 font-medium">
            ✓ {format(parseISO(done), "d MMM, HH:mm", { locale: pl })}
          </span>
        ) : due ? (
          <span className={cn(breached && "text-destructive font-semibold")}>
            do {format(parseISO(due), "d MMM, HH:mm", { locale: pl })}
            {breached && <AlertTriangle className="inline h-3 w-3 ml-1" />}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </div>
    </div>
  );
}

function formatEventLabel(eventType: string, payload: Record<string, unknown>): string {
  switch (eventType) {
    case "created": return "Zgłoszenie utworzone";
    case "status_changed": {
      const to = payload?.to as string | undefined;
      return to ? `Status: ${STATUS_LABELS[to as SlaTicketStatus] ?? to}` : "Zmiana statusu";
    }
    case "assigned":          return "Przypisano serwisanta";
    case "comment_added":     return "Dodano komentarz";
    case "diagnosis_added":   return "Dodano diagnozę";
    case "protocol_uploaded": return "Załączono protokół";
    default:                  return eventType;
  }
}
