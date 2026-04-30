import { useState } from "react";
import { useTaskQuotes, useCreateQuote, useUpdateQuote } from "@/hooks/useCrmData";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { FileText, Plus, Loader2, Calendar } from "lucide-react";

interface Props {
  taskId: string;
  companyId?: string | null;
  buildingId?: string | null;
  contactId?: string | null;
  opportunityId?: string | null;
  taskTitle?: string;
}

const STATUS_OPTIONS: Array<{ value: string; label: string; tone: string }> = [
  { value: "szkic", label: "Szkic", tone: "bg-secondary text-foreground" },
  { value: "wyslana", label: "Wysłana", tone: "bg-blue-500/15 text-blue-500" },
  { value: "zaakceptowana", label: "Zaakceptowana", tone: "bg-emerald-500/15 text-emerald-500" },
  { value: "odrzucona", label: "Odrzucona", tone: "bg-destructive/15 text-destructive" },
];

const fmtPLN = (n: number | null | undefined) =>
  ((n ?? 0) as number).toLocaleString("pl-PL", { style: "currency", currency: "PLN" });
const fmtDate = (s?: string | null) => (s ? new Date(s).toLocaleDateString("pl-PL") : "—");

export default function TaskQuotesPanel({
  taskId, companyId, buildingId, contactId, opportunityId, taskTitle,
}: Props) {
  const { data: quotes, isLoading } = useTaskQuotes(taskId);
  const createQuote = useCreateQuote();
  const updateQuote = useUpdateQuote();
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!companyId) {
      toast({ title: "Brak firmy", description: "Zadanie nie ma przypisanej firmy.", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      const number = `OF/${new Date().getFullYear()}/${Math.floor(Math.random() * 9000 + 1000)}`;
      await createQuote.mutateAsync({
        company_id: companyId,
        contact_id: contactId || null,
        building_id: buildingId || null,
        task_id: taskId,
        opportunity_id: opportunityId || null,
        quote_number: number,
        status: "szkic",
        total: 0,
        notes: taskTitle ? `Oferta do zadania: ${taskTitle}` : null,
      });
      toast({ title: "Oferta utworzona", description: number });
    } catch (e: any) {
      toast({ title: "Błąd", description: e?.message || "Nie udało się utworzyć oferty", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await updateQuote.mutateAsync({ id, updates: { status } });
      toast({ title: "Status oferty zaktualizowany" });
    } catch (e: any) {
      toast({ title: "Błąd", description: e?.message || "", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            Oferty dla tego zadania
          </h3>
          <p className="text-xs text-muted-foreground">
            Każda zmiana statusu zapisuje znacznik czasu (wysłana / zaakceptowana / odrzucona).
          </p>
        </div>
        <Button onClick={handleCreate} disabled={creating || !companyId} size="sm">
          {creating ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-2" />}
          Nowa oferta
        </Button>
      </div>

      {isLoading ? (
        <div className="text-xs text-muted-foreground">Ładowanie ofert…</div>
      ) : !quotes || quotes.length === 0 ? (
        <div className="border border-dashed border-border rounded-md p-6 text-center text-xs text-muted-foreground">
          Brak ofert powiązanych z tym zadaniem. Utwórz pierwszą, aby śledzić ścieżkę sprzedażową.
        </div>
      ) : (
        <div className="space-y-2">
          {quotes.map((q: any) => {
            const tone = STATUS_OPTIONS.find((s) => s.value === q.status)?.tone || "bg-secondary";
            return (
              <div
                key={q.id}
                className="flex flex-wrap items-center gap-3 border border-border rounded-md p-3 bg-card hover:bg-accent/30 transition-colors"
              >
                <div className="flex-1 min-w-[200px]">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold">{q.quote_number}</span>
                    <Badge className={tone + " text-[10px] uppercase"}>
                      {STATUS_OPTIONS.find((s) => s.value === q.status)?.label || q.status}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-3 flex-wrap">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> Utworzono {fmtDate(q.created_at)}
                    </span>
                    {q.sent_at && <span>Wysłana {fmtDate(q.sent_at)}</span>}
                    {q.accepted_at && <span className="text-emerald-500">Zaakceptowana {fmtDate(q.accepted_at)}</span>}
                    {q.rejected_at && <span className="text-destructive">Odrzucona {fmtDate(q.rejected_at)}</span>}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold">{fmtPLN(q.total)}</div>
                  {q.valid_until && (
                    <div className="text-[10px] text-muted-foreground">Ważna do {fmtDate(q.valid_until)}</div>
                  )}
                </div>
                <Select value={q.status} onValueChange={(v) => handleStatusChange(q.id, v)}>
                  <SelectTrigger className="w-[160px] h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
