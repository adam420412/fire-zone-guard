import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, CheckCircle2, XCircle, Clock, AlertTriangle, Sparkles, Bot } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type LogRow = {
  id: string;
  user_id: string;
  company_id: string | null;
  action_type: string;
  action_label: string;
  action_description: string | null;
  confirmation_level: string;
  payload: any;
  context: any;
  status: "pending" | "approved" | "rejected" | "executed" | "failed";
  proposed_at: string;
  decided_at: string | null;
  decided_by: string | null;
  decision_note: string | null;
  executed_at: string | null;
  execution_error: string | null;
  source_page: string | null;
};

const STATUS_META: Record<string, { label: string; icon: any; cls: string }> = {
  pending:  { label: "Oczekuje",   icon: Clock,         cls: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
  approved: { label: "Zatwierdzona", icon: CheckCircle2, cls: "bg-blue-500/15 text-blue-600 border-blue-500/30" },
  executed: { label: "Wykonana",   icon: CheckCircle2,  cls: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" },
  rejected: { label: "Odrzucona",  icon: XCircle,       cls: "bg-muted text-muted-foreground border-border" },
  failed:   { label: "Błąd",       icon: AlertTriangle, cls: "bg-red-500/15 text-red-600 border-red-500/30" },
};

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? STATUS_META.pending;
  const Icon = meta.icon;
  return (
    <Badge variant="outline" className={`gap-1 ${meta.cls}`}>
      <Icon className="h-3 w-3" /> {meta.label}
    </Badge>
  );
}

export default function AiActionLogPage() {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [users, setUsers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selected, setSelected] = useState<LogRow | null>(null);
  const [decideMode, setDecideMode] = useState<"approve" | "reject" | null>(null);
  const [decisionNote, setDecisionNote] = useState("");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("ai_action_log")
      .select("*")
      .order("proposed_at", { ascending: false })
      .limit(500);
    if (error) {
      toast({ title: "Błąd ładowania", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }
    const list = (data ?? []) as LogRow[];
    setRows(list);

    const userIds = Array.from(new Set([
      ...list.map((r) => r.user_id),
      ...list.map((r) => r.decided_by).filter(Boolean) as string[],
    ]));
    if (userIds.length) {
      const { data: profs } = await supabase
        .from("profiles").select("user_id, name, email").in("user_id", userIds);
      const map: Record<string, string> = {};
      (profs ?? []).forEach((p: any) => { map[p.user_id] = p.name || p.email || p.user_id; });
      setUsers(map);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("ai-action-log")
      .on("postgres_changes", { event: "*", schema: "public", table: "ai_action_log" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const filtered = useMemo(() => rows.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (!filter.trim()) return true;
    const q = filter.toLowerCase();
    return (
      r.action_label.toLowerCase().includes(q) ||
      r.action_type.toLowerCase().includes(q) ||
      (r.action_description ?? "").toLowerCase().includes(q) ||
      (users[r.user_id] ?? "").toLowerCase().includes(q)
    );
  }), [rows, filter, statusFilter, users]);

  const counts = useMemo(() => {
    const c = { pending: 0, approved: 0, executed: 0, rejected: 0, failed: 0 } as Record<string, number>;
    rows.forEach((r) => { c[r.status] = (c[r.status] ?? 0) + 1; });
    return c;
  }, [rows]);

  const submitDecision = async () => {
    if (!selected || !decideMode) return;
    const { data: sessionData } = await supabase.auth.getSession();
    const decidedBy = sessionData.session?.user?.id ?? null;

    const status = decideMode === "approve" ? "approved" : "rejected";
    const { error } = await supabase.from("ai_action_log").update({
      status,
      decided_at: new Date().toISOString(),
      decided_by: decidedBy,
      decision_note: decisionNote || null,
    } as any).eq("id", selected.id);

    if (error) {
      toast({ title: "Błąd", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: decideMode === "approve" ? "Zatwierdzono propozycję" : "Odrzucono propozycję",
      description: "Decyzja zapisana w dzienniku AI.",
    });
    setDecideMode(null);
    setDecisionNote("");
    setSelected(null);
    load();
  };

  const fmt = (d: string | null) => d ? new Date(d).toLocaleString("pl-PL") : "—";

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bot className="h-6 w-6 text-primary" /> Dziennik akcji AI
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Pełna historia propozycji asystenta AI: kto, kiedy, co zatwierdził lub odrzucił.
          </p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Odśwież"}
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        {(["pending","approved","executed","rejected","failed"] as const).map((s) => (
          <Card
            key={s}
            className={`p-4 cursor-pointer transition-colors ${statusFilter === s ? "border-primary" : ""}`}
            onClick={() => setStatusFilter(statusFilter === s ? "all" : s)}
          >
            <div className="flex items-center justify-between">
              <StatusBadge status={s} />
              <span className="text-2xl font-bold">{counts[s] ?? 0}</span>
            </div>
          </Card>
        ))}
      </div>

      <div className="flex gap-2 items-center flex-wrap">
        <Input
          placeholder="Szukaj po akcji, typie, użytkowniku..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="max-w-sm"
        />
        {statusFilter !== "all" && (
          <Button variant="ghost" size="sm" onClick={() => setStatusFilter("all")}>
            Wyczyść filtr: {STATUS_META[statusFilter]?.label}
          </Button>
        )}
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Akcja</TableHead>
              <TableHead>Typ</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Zaproponowano przez</TableHead>
              <TableHead>Kiedy</TableHead>
              <TableHead>Decyzja</TableHead>
              <TableHead className="text-right">Szczegóły</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-10">
                <Loader2 className="h-5 w-5 animate-spin inline" />
              </TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                <Sparkles className="h-5 w-5 inline mr-2" />
                Brak propozycji asystenta AI w wybranym zakresie.
              </TableCell></TableRow>
            ) : filtered.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium max-w-xs truncate" title={r.action_label}>
                  {r.action_label}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{r.action_type}</TableCell>
                <TableCell><StatusBadge status={r.status} /></TableCell>
                <TableCell className="text-sm">{users[r.user_id] ?? r.user_id.slice(0, 8)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{fmt(r.proposed_at)}</TableCell>
                <TableCell className="text-xs">
                  {r.decided_at ? (
                    <div>
                      <div>{users[r.decided_by ?? ""] ?? "—"}</div>
                      <div className="text-muted-foreground">{fmt(r.decided_at)}</div>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">oczekuje</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" onClick={() => setSelected(r)}>
                    Otwórz
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => { if (!o) { setSelected(null); setDecideMode(null); setDecisionNote(""); } }}>
        <DialogContent className="max-w-2xl">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Bot className="h-5 w-5 text-primary" /> {selected.action_label}
                </DialogTitle>
                <DialogDescription>{selected.action_description}</DialogDescription>
              </DialogHeader>

              <div className="space-y-4 max-h-[60vh] overflow-y-auto">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Typ akcji</p>
                    <p className="font-mono">{selected.action_type}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Poziom potwierdzenia</p>
                    <p>{selected.confirmation_level === "hard" ? "Wymagane (hard)" : "Miękkie (soft)"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Status</p>
                    <StatusBadge status={selected.status} />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Strona źródłowa</p>
                    <p className="font-mono text-xs">{selected.source_page ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Zaproponował</p>
                    <p>{users[selected.user_id] ?? selected.user_id}</p>
                    <p className="text-xs text-muted-foreground">{fmt(selected.proposed_at)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Decyzja</p>
                    {selected.decided_at ? (
                      <>
                        <p>{users[selected.decided_by ?? ""] ?? selected.decided_by}</p>
                        <p className="text-xs text-muted-foreground">{fmt(selected.decided_at)}</p>
                      </>
                    ) : <p className="text-muted-foreground">—</p>}
                  </div>
                </div>

                {selected.decision_note && (
                  <div className="rounded-lg border bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground mb-1">Notatka decyzji</p>
                    <p className="text-sm">{selected.decision_note}</p>
                  </div>
                )}

                {selected.execution_error && (
                  <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3">
                    <p className="text-xs text-red-600 font-semibold mb-1">Błąd wykonania</p>
                    <p className="text-sm">{selected.execution_error}</p>
                  </div>
                )}

                <div>
                  <p className="text-xs text-muted-foreground mb-1">Dane akcji (payload)</p>
                  <pre className="text-xs bg-muted rounded p-3 overflow-x-auto">
{JSON.stringify(selected.payload ?? {}, null, 2)}
                  </pre>
                </div>

                {selected.context && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Kontekst</p>
                    <pre className="text-xs bg-muted rounded p-3 overflow-x-auto">
{JSON.stringify(selected.context, null, 2)}
                    </pre>
                  </div>
                )}

                {decideMode && (
                  <div className="space-y-2 rounded-lg border-2 border-primary/30 p-3">
                    <p className="text-sm font-semibold">
                      {decideMode === "approve" ? "Zatwierdź akcję" : "Odrzuć akcję"}
                    </p>
                    <Textarea
                      placeholder="Opcjonalna notatka decyzji..."
                      value={decisionNote}
                      onChange={(e) => setDecisionNote(e.target.value)}
                      rows={3}
                    />
                  </div>
                )}
              </div>

              <DialogFooter className="gap-2">
                {selected.status === "pending" && !decideMode && (
                  <>
                    <Button variant="outline" onClick={() => setDecideMode("reject")}>
                      <XCircle className="h-4 w-4 mr-1" /> Odrzuć
                    </Button>
                    <Button onClick={() => setDecideMode("approve")}>
                      <CheckCircle2 className="h-4 w-4 mr-1" /> Zatwierdź
                    </Button>
                  </>
                )}
                {decideMode && (
                  <>
                    <Button variant="ghost" onClick={() => { setDecideMode(null); setDecisionNote(""); }}>
                      Anuluj
                    </Button>
                    <Button onClick={submitDecision}>
                      Potwierdź {decideMode === "approve" ? "zatwierdzenie" : "odrzucenie"}
                    </Button>
                  </>
                )}
                {selected.status !== "pending" && !decideMode && (
                  <Button variant="outline" onClick={() => setSelected(null)}>Zamknij</Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
