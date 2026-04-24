import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { pl } from "date-fns/locale";
import {
  ArrowLeft,
  ClipboardList,
  Phone,
  Truck,
  MapPin,
  FileSearch,
  CheckCircle2,
  FileText,
  Loader2,
  Plus,
  Image as ImageIcon,
  AlertTriangle,
  Clock,
  Flame,
  Ban,
  Sparkles,
} from "lucide-react";
import {
  useSlaTickets,
  useSlaTicket,
  useSlaTicketEvents,
  STATUS_LABELS,
  PRIORITY_LABELS,
  TYPE_LABELS,
  type SlaTicketStatus,
  type SlaTicket,
} from "@/hooks/useSlaTickets";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const STATUS_BAR_STEPS: {
  key: SlaTicketStatus;
  label: string;
  Icon: typeof ClipboardList;
}[] = [
  { key: "zgloszenie", label: "Zgłoszenie", Icon: ClipboardList },
  { key: "telefon",    label: "Kontakt",    Icon: Phone },
  { key: "wyjazd",     label: "Wyjazd",     Icon: Truck },
  { key: "na_miejscu", label: "Na miejscu", Icon: MapPin },
  { key: "diagnoza",   label: "Diagnoza",   Icon: FileSearch },
  { key: "naprawiono", label: "Naprawiono", Icon: CheckCircle2 },
  { key: "zamkniete",  label: "Protokół",   Icon: FileText },
];

const PRIORITY_BADGE: Record<string, string> = {
  low:      "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-400/30",
  normal:   "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-400/30",
  high:     "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-400/30",
  critical: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-400/30",
};

export default function ClientSlaPage() {
  const { id } = useParams<{ id?: string }>();
  if (id) return <ClientSlaDetail id={id} />;
  return <ClientSlaList />;
}

// ============================================================================
// LIST VIEW
// ============================================================================
function ClientSlaList() {
  const navigate = useNavigate();
  const { data: tickets, isLoading } = useSlaTickets({ reporterOnly: true });

  const sorted = useMemo(
    () => [...(tickets ?? [])].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    ),
    [tickets]
  );

  const open = sorted.filter((t) => t.status !== "zamkniete" && t.status !== "niezasadne");
  const closed = sorted.filter((t) => t.status === "zamkniete" || t.status === "niezasadne");

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <Flame className="h-7 w-7 text-orange-500" />
            Moje zgłoszenia SLA
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Status Twoich zgłoszeń serwisowych w czasie rzeczywistym.
          </p>
        </div>
        <Button onClick={() => window.open("/zgloszenie", "_blank")} className="gap-2">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Nowe zgłoszenie</span>
          <span className="sm:hidden">Nowe</span>
        </Button>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Aktywne ({open.length})
        </h2>
        {open.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground border-dashed">
            <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-green-500" />
            Brak aktywnych zgłoszeń. Wszystko działa!
          </Card>
        ) : (
          <div className="grid gap-3">
            {open.map((t) => (
              <TicketCard key={t.id} ticket={t} onClick={() => navigate(`/client/sla/${t.id}`)} />
            ))}
          </div>
        )}
      </section>

      {closed.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Zakończone ({closed.length})
          </h2>
          <div className="grid gap-3">
            {closed.slice(0, 10).map((t) => (
              <TicketCard
                key={t.id}
                ticket={t}
                onClick={() => navigate(`/client/sla/${t.id}`)}
                muted
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function TicketCard({
  ticket,
  onClick,
  muted = false,
}: {
  ticket: SlaTicket;
  onClick: () => void;
  muted?: boolean;
}) {
  const breached = ticket.sla_resolution_breached || ticket.sla_response_breached;
  const stepIdx = STATUS_BAR_STEPS.findIndex((s) => s.key === ticket.status);
  const isUnjustified = ticket.status === "niezasadne";

  return (
    <Card
      onClick={onClick}
      className={cn(
        "p-4 cursor-pointer hover:shadow-md transition group",
        muted && "opacity-70 hover:opacity-100"
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-mono text-xs text-muted-foreground">
              {ticket.ticket_number ?? "—"}
            </span>
            <Badge variant="outline" className={cn("text-xs", PRIORITY_BADGE[ticket.priority])}>
              {PRIORITY_LABELS[ticket.priority]}
            </Badge>
            {breached && (
              <Badge variant="destructive" className="text-xs gap-1">
                <AlertTriangle className="h-3 w-3" /> SLA przekroczone
              </Badge>
            )}
            {isUnjustified && (
              <Badge variant="outline" className="text-xs gap-1 bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-400/30">
                <Ban className="h-3 w-3" /> Niezasadne
              </Badge>
            )}
          </div>
          <p className="text-sm font-medium line-clamp-2 group-hover:text-primary transition-colors">
            {ticket.description}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {TYPE_LABELS[ticket.type]}
            {ticket.building_name && ` • ${ticket.building_name}`}
          </p>
        </div>
        <div className="text-xs text-muted-foreground text-right whitespace-nowrap">
          {format(parseISO(ticket.created_at), "d MMM, HH:mm", { locale: pl })}
        </div>
      </div>

      {!isUnjustified && <MiniStatusBar currentIdx={stepIdx} />}
    </Card>
  );
}

function MiniStatusBar({ currentIdx }: { currentIdx: number }) {
  return (
    <div className="flex items-center gap-1 mt-2">
      {STATUS_BAR_STEPS.map((step, i) => {
        const done = i <= currentIdx;
        return (
          <div
            key={step.key}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors",
              done
                ? i === currentIdx
                  ? "bg-orange-500"
                  : "bg-green-500"
                : "bg-muted"
            )}
          />
        );
      })}
    </div>
  );
}

// ============================================================================
// DETAIL VIEW
// ============================================================================
function ClientSlaDetail({ id }: { id: string }) {
  const navigate = useNavigate();
  const { data: ticket, isLoading } = useSlaTicket(id);
  const { data: events } = useSlaTicketEvents(id);
  const [lightbox, setLightbox] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!ticket) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <Button variant="ghost" onClick={() => navigate("/client/sla")} className="gap-2 mb-4">
          <ArrowLeft className="h-4 w-4" /> Powrót
        </Button>
        <Card className="p-8 text-center text-muted-foreground">Zgłoszenie nie znalezione.</Card>
      </div>
    );
  }

  const stepIdx = STATUS_BAR_STEPS.findIndex((s) => s.key === ticket.status);
  const isUnjustified = ticket.status === "niezasadne";
  const breached = ticket.sla_resolution_breached || ticket.sla_response_breached;

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6 space-y-6">
      <div>
        <Button variant="ghost" onClick={() => navigate("/client/sla")} className="gap-2 mb-3 -ml-2">
          <ArrowLeft className="h-4 w-4" /> Wszystkie zgłoszenia
        </Button>
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className="font-mono text-sm text-muted-foreground">{ticket.ticket_number ?? "—"}</span>
          <Badge variant="outline" className={cn("text-xs", PRIORITY_BADGE[ticket.priority])}>
            {PRIORITY_LABELS[ticket.priority]}
          </Badge>
          <Badge variant="secondary" className="text-xs">{TYPE_LABELS[ticket.type]}</Badge>
          {breached && (
            <Badge variant="destructive" className="gap-1 text-xs">
              <AlertTriangle className="h-3 w-3" /> SLA przekroczone
            </Badge>
          )}
        </div>
        <h1 className="text-xl md:text-2xl font-bold">{ticket.description}</h1>
        {ticket.building_name && (
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" />
            {ticket.building_name}
            {ticket.building_address && ` — ${ticket.building_address}`}
          </p>
        )}
      </div>

      {/* STATUS BAR */}
      {!isUnjustified ? (
        <Card className="p-5">
          <div className="text-xs text-muted-foreground uppercase font-semibold tracking-wide mb-4">
            Status
          </div>
          <FullStatusBar currentIdx={stepIdx} />
          <div className="mt-4 text-center">
            <div className="text-lg font-semibold">{STATUS_LABELS[ticket.status]}</div>
            {ticket.assigned_to_name && (
              <div className="text-xs text-muted-foreground mt-1">
                Obsługuje: {ticket.assigned_to_name}
              </div>
            )}
          </div>
        </Card>
      ) : (
        <Card className="p-5 bg-amber-500/5 border-amber-500/30">
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 font-semibold">
            <Ban className="h-5 w-5" />
            Zgłoszenie oznaczone jako niezasadne
          </div>
          {ticket.diagnosis && (
            <p className="text-sm text-muted-foreground mt-2">{ticket.diagnosis}</p>
          )}
        </Card>
      )}

      {/* SLA TIMING */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
            <Clock className="h-3 w-3" /> Reakcja do
          </div>
          <div className={cn(
            "text-sm font-semibold",
            ticket.sla_response_breached && "text-destructive"
          )}>
            {ticket.sla_response_due
              ? format(parseISO(ticket.sla_response_due), "d MMM, HH:mm", { locale: pl })
              : "—"}
          </div>
          {ticket.first_response_at && (
            <div className="text-xs text-green-600 dark:text-green-400 mt-1">
              ✓ {format(parseISO(ticket.first_response_at), "d MMM, HH:mm", { locale: pl })}
            </div>
          )}
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
            <Clock className="h-3 w-3" /> Naprawa do
          </div>
          <div className={cn(
            "text-sm font-semibold",
            ticket.sla_resolution_breached && "text-destructive"
          )}>
            {ticket.sla_resolution_due
              ? format(parseISO(ticket.sla_resolution_due), "d MMM, HH:mm", { locale: pl })
              : "—"}
          </div>
          {ticket.resolved_at && (
            <div className="text-xs text-green-600 dark:text-green-400 mt-1">
              ✓ {format(parseISO(ticket.resolved_at), "d MMM, HH:mm", { locale: pl })}
            </div>
          )}
        </Card>
      </div>

      {/* PHOTOS */}
      {ticket.photo_urls && ticket.photo_urls.length > 0 && (
        <Card className="p-4">
          <div className="text-xs text-muted-foreground uppercase font-semibold tracking-wide mb-3 flex items-center gap-1">
            <ImageIcon className="h-3 w-3" /> Zdjęcia ({ticket.photo_urls.length})
          </div>
          <div className="grid grid-cols-3 gap-2">
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

      {/* AI VISION (Iter 7) — read-only dla klienta */}
      {ticket.ai_summary && !isUnjustified && (
        <Card className="p-4 border-purple-500/30 bg-purple-500/5">
          <div className="text-xs uppercase font-semibold tracking-wide flex items-center gap-1.5 mb-2 text-purple-700 dark:text-purple-300">
            <Sparkles className="h-3.5 w-3.5" /> Wstępna analiza AI
          </div>
          <p className="text-sm leading-relaxed">{ticket.ai_summary}</p>
          {ticket.ai_category && (() => {
            const c = ticket.ai_category as Record<string, unknown>;
            const action = typeof c.recommended_action === "string" ? c.recommended_action : null;
            if (!action) return null;
            return (
              <div className="mt-3 rounded-md bg-card border border-border p-2 text-xs">
                <span className="text-muted-foreground">Wstępna rekomendacja: </span>
                <span className="font-medium">{action}</span>
              </div>
            );
          })()}
          <p className="mt-2 text-[10px] text-muted-foreground">
            Analiza automatyczna — ostateczna ocena po wizycie serwisanta.
          </p>
        </Card>
      )}

      {/* DIAGNOSIS */}
      {ticket.diagnosis && !isUnjustified && (
        <Card className="p-4">
          <div className="text-xs text-muted-foreground uppercase font-semibold tracking-wide mb-2">
            Diagnoza serwisanta
          </div>
          <p className="text-sm whitespace-pre-wrap">{ticket.diagnosis}</p>
        </Card>
      )}

      {/* TIMELINE */}
      {events && events.length > 0 && (
        <Card className="p-4">
          <div className="text-xs text-muted-foreground uppercase font-semibold tracking-wide mb-3">
            Historia
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

      {/* PROTOCOL LINK */}
      {ticket.protocol_url && (
        <Button asChild className="w-full gap-2" variant="outline">
          <a href={ticket.protocol_url} target="_blank" rel="noreferrer">
            <FileText className="h-4 w-4" /> Pobierz protokół
          </a>
        </Button>
      )}

      {/* LIGHTBOX */}
      {lightbox && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setLightbox(null)}
        >
          <img
            src={lightbox}
            alt="Podgląd"
            className="max-w-full max-h-full object-contain"
          />
        </div>
      )}
    </div>
  );
}

function FullStatusBar({ currentIdx }: { currentIdx: number }) {
  return (
    <div className="relative">
      {/* connecting line */}
      <div className="absolute top-5 left-0 right-0 h-1 bg-muted rounded" />
      <div
        className="absolute top-5 left-0 h-1 bg-gradient-to-r from-orange-500 to-green-500 rounded transition-all duration-700"
        style={{
          width: currentIdx <= 0
            ? "0%"
            : `${(currentIdx / (STATUS_BAR_STEPS.length - 1)) * 100}%`,
        }}
      />

      <div className="relative flex justify-between">
        {STATUS_BAR_STEPS.map((step, i) => {
          const done = i < currentIdx;
          const active = i === currentIdx;
          const Icon = step.Icon;
          return (
            <div key={step.key} className="flex flex-col items-center gap-1.5 z-10">
              <div
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300",
                  done && "bg-green-500 border-green-500 text-white",
                  active && "bg-orange-500 border-orange-500 text-white scale-110 shadow-lg shadow-orange-500/40 animate-pulse",
                  !done && !active && "bg-background border-muted text-muted-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
              </div>
              <div
                className={cn(
                  "text-[10px] md:text-xs text-center leading-tight max-w-[60px]",
                  (done || active) ? "text-foreground font-medium" : "text-muted-foreground"
                )}
              >
                {step.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatEventLabel(eventType: string, payload: Record<string, unknown>): string {
  switch (eventType) {
    case "created":          return "Zgłoszenie utworzone";
    case "status_changed": {
      const to = payload?.to as string | undefined;
      return to ? `Status: ${STATUS_LABELS[to as SlaTicketStatus] ?? to}` : "Zmiana statusu";
    }
    case "assigned":         return "Przypisano serwisanta";
    case "comment_added":    return "Dodano komentarz";
    case "diagnosis_added":  return "Dodano diagnozę";
    case "protocol_uploaded":return "Załączono protokół";
    default:                 return eventType;
  }
}
