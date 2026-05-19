// =============================================================================
// ChecklistsPage — lista szablonów + aktywne / ostatnio zakończone runy.
//
// Iter 8. UX:
//   - Tabs: Szablony | W trakcie | Zakończone
//   - Szablony: filtr scope, klik → dialog wyboru obiektu → start runu
//   - Runy: link do mobile-first runnera (ChecklistRunPage)
// =============================================================================

import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ClipboardList, Plus, ChevronRight, ListChecks, Building2,
  Calendar, AlertCircle, Loader2, FileText, CheckCircle2, XCircle, Clock,
  Trash2, GripVertical, Sparkles,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { pl } from "date-fns/locale";
import {
  useChecklistTemplates, useChecklistRuns, useStartChecklistRun, useCreateChecklistTemplate,
  SCOPE_LABELS, RUN_STATUS_LABELS,
  type ChecklistScope, type ChecklistTemplate, type ChecklistSeverity,
} from "@/hooks/useChecklists";
import { useBuildings } from "@/hooks/useSupabaseData";
import { useAuth } from "@/hooks/useAuth";

const SCOPE_BADGE: Record<ChecklistScope, string> = {
  audyt:  "bg-blue-500/15 text-blue-300 border-blue-500/40",
  sprzet: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  bhp:    "bg-amber-500/15 text-amber-300 border-amber-500/40",
  inne:   "bg-slate-500/15 text-slate-300 border-slate-500/40",
};

type NewItem = {
  id: string;
  section: string;
  label: string;
  description: string;
  severity: ChecklistSeverity;
  requires_photo: boolean;
  requires_note_on_fail: boolean;
};

function makeBlankItem(): NewItem {
  return {
    id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    section: "",
    label: "",
    description: "",
    severity: "średni",
    requires_photo: false,
    requires_note_on_fail: true,
  };
}

export default function ChecklistsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [scope, setScope] = useState<ChecklistScope | "all">("all");
  const [search, setSearch] = useState("");
  const [pickedTemplate, setPickedTemplate] = useState<ChecklistTemplate | null>(null);
  const [pickedBuildingId, setPickedBuildingId] = useState<string>("");
  const [performerName, setPerformerName] = useState<string>(user?.email?.split("@")[0] ?? "");
  const [notes, setNotes] = useState("");

  // ---- New template dialog state ----
  const [newTemplateOpen, setNewTemplateOpen] = useState(false);
  const [tplCode, setTplCode] = useState("");
  const [tplName, setTplName] = useState("");
  const [tplDescription, setTplDescription] = useState("");
  const [tplScope, setTplScope] = useState<ChecklistScope>("audyt");
  const [tplItems, setTplItems] = useState<NewItem[]>([makeBlankItem()]);

  const { data: templates = [], isLoading: tLoading, error: tErr } =
    useChecklistTemplates({ scope, active: true });
  const { data: runsInProgress = [], isLoading: rLoadingA } =
    useChecklistRuns({ status: "in_progress", limit: 100 });
  const { data: runsCompleted = [], isLoading: rLoadingC } =
    useChecklistRuns({ status: "completed", limit: 100 });
  const { data: buildings = [] } = useBuildings();
  const startRun = useStartChecklistRun();
  const createTemplate = useCreateChecklistTemplate();

  const filteredTemplates = useMemo(() => {
    if (!search) return templates;
    const lower = search.toLowerCase();
    return templates.filter((t) =>
      t.name.toLowerCase().includes(lower) ||
      t.code.toLowerCase().includes(lower) ||
      (t.description ?? "").toLowerCase().includes(lower)
    );
  }, [templates, search]);

  function openStart(t: ChecklistTemplate) {
    setPickedTemplate(t);
    setPickedBuildingId("");
    setNotes("");
  }

  async function confirmStart() {
    if (!pickedTemplate || !pickedBuildingId) {
      toast.error("Wybierz obiekt aby rozpocząć checklistę.");
      return;
    }
    const building = buildings.find((b) => b.id === pickedBuildingId);
    try {
      const run = await startRun.mutateAsync({
        template_id: pickedTemplate.id,
        building_id: pickedBuildingId,
        company_id: (building as any)?.company_id ?? null,
        performer_name: performerName.trim() || null,
        notes: notes.trim() || null,
      });
      toast.success("Checklista rozpoczęta — przejdź do odklikiwania.");
      setPickedTemplate(null);
      navigate(`/checklists/runs/${run.id}`);
    } catch (e: any) {
      toast.error(`Nie udało się rozpocząć: ${e?.message ?? e}`);
    }
  }

  function resetNewTemplate() {
    setTplCode("");
    setTplName("");
    setTplDescription("");
    setTplScope("audyt");
    setTplItems([makeBlankItem()]);
  }

  function updateItem(id: string, patch: Partial<NewItem>) {
    setTplItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  function removeItem(id: string) {
    setTplItems((prev) => (prev.length <= 1 ? prev : prev.filter((it) => it.id !== id)));
  }

  async function confirmCreateTemplate() {
    const trimmedName = tplName.trim();
    const trimmedCode = tplCode.trim();
    const validItems = tplItems.filter((it) => it.label.trim().length > 0);
    if (!trimmedName || !trimmedCode) {
      toast.error("Podaj kod i nazwę szablonu.");
      return;
    }
    if (validItems.length === 0) {
      toast.error("Dodaj przynajmniej jeden punkt checklisty z nazwą.");
      return;
    }
    try {
      await createTemplate.mutateAsync({
        code: trimmedCode,
        name: trimmedName,
        description: tplDescription.trim() || null,
        scope: tplScope,
        items: validItems.map((it, idx) => ({
          sort_order: (idx + 1) * 10,
          section: it.section.trim() || null,
          label: it.label.trim(),
          description: it.description.trim() || null,
          default_severity: it.severity,
          requires_photo: it.requires_photo,
          requires_note_on_fail: it.requires_note_on_fail,
        })),
      });
      toast.success("✅ Szablon utworzony!");
      setNewTemplateOpen(false);
      resetNewTemplate();
    } catch (e: any) {
      toast.error(`Nie udało się utworzyć szablonu: ${e?.message ?? e}`);
    }
  }

  // Tabela tabela_szablonów lub error 42P01 (przed migracją)
  if (tErr && (tErr as any).code === "42P01") {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Checklisty</h1>
        <Card className="border-destructive/50 bg-destructive/10">
          <CardContent className="flex items-center gap-4 py-6 text-destructive">
            <AlertCircle className="h-6 w-6" />
            <div>
              <p className="font-semibold">Migracja iter8 nie jest jeszcze uruchomiona</p>
              <p className="text-sm">
                Uruchom <code>20260424220000_iter8_checklists.sql</code> w Supabase aby aktywować moduł.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Checklisty</h1>
          <p className="text-muted-foreground">
            Audyty PPOŻ, przeglądy sprzętu, BHP — wszystko jako odklikiwalne listy z auto-tworzeniem napraw.
          </p>
        </div>
        <Button onClick={() => { resetNewTemplate(); setNewTemplateOpen(true); }} className="fire-gradient shrink-0">
          <Sparkles className="mr-1.5 h-4 w-4" />
          Nowy szablon
        </Button>
      </div>

      <Tabs defaultValue="templates" className="space-y-4">
        <TabsList>
          <TabsTrigger value="templates">
            <ClipboardList className="mr-2 h-4 w-4" />
            Szablony ({templates.length})
          </TabsTrigger>
          <TabsTrigger value="in_progress">
            <Clock className="mr-2 h-4 w-4" />
            W trakcie ({runsInProgress.length})
          </TabsTrigger>
          <TabsTrigger value="completed">
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Zakończone ({runsCompleted.length})
          </TabsTrigger>
        </TabsList>

        {/* ---- SZABLONY ---- */}
        <TabsContent value="templates" className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Select value={scope} onValueChange={(v) => setScope(v as any)}>
              <SelectTrigger className="w-full sm:w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Wszystkie typy</SelectItem>
                <SelectItem value="audyt">{SCOPE_LABELS.audyt}</SelectItem>
                <SelectItem value="sprzet">{SCOPE_LABELS.sprzet}</SelectItem>
                <SelectItem value="bhp">{SCOPE_LABELS.bhp}</SelectItem>
                <SelectItem value="inne">{SCOPE_LABELS.inne}</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder="Szukaj nazwy lub kodu szablonu…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full sm:max-w-xs"
            />
          </div>

          {tLoading ? (
            <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : filteredTemplates.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
                <ClipboardList className="mb-3 h-10 w-10 opacity-30" />
                <p className="font-medium">Brak szablonów dla wybranych filtrów</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {filteredTemplates.map((t) => (
                <Card key={t.id} className="flex flex-col">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base">{t.name}</CardTitle>
                      <Badge variant="outline" className={SCOPE_BADGE[t.scope]}>
                        {SCOPE_LABELS[t.scope]}
                      </Badge>
                    </div>
                    <CardDescription className="line-clamp-2 mt-1">
                      {t.description ?? "Brak opisu"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="mt-auto flex items-center justify-between pt-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <code className="rounded bg-muted px-1.5 py-0.5">{t.code}</code>
                      {t.is_system && <Badge variant="secondary" className="text-[10px]">SYSTEM</Badge>}
                    </div>
                    <Button size="sm" onClick={() => openStart(t)}>
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      Rozpocznij
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ---- W TRAKCIE ---- */}
        <TabsContent value="in_progress" className="space-y-3">
          {rLoadingA ? (
            <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : runsInProgress.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
                <ListChecks className="mb-3 h-10 w-10 opacity-30" />
                <p className="font-medium">Brak aktywnych checklist</p>
                <p className="text-sm">Rozpocznij nową w zakładce Szablony.</p>
              </CardContent>
            </Card>
          ) : (
            runsInProgress.map((r) => (
              <Link key={r.id} to={`/checklists/runs/${r.id}`} className="block">
                <Card className="transition-colors hover:border-primary/40">
                  <CardContent className="flex items-center justify-between gap-4 py-4">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <Clock className="h-5 w-5 text-amber-400 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{r.template_name}</p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Building2 className="h-3 w-3" />
                            {r.building_name ?? "Bez budynku"}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {format(parseISO(r.started_at), "d MMM yyyy, HH:mm", { locale: pl })}
                          </span>
                          {r.performer_name && <span>• {r.performer_name}</span>}
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </CardContent>
                </Card>
              </Link>
            ))
          )}
        </TabsContent>

        {/* ---- ZAKOŃCZONE ---- */}
        <TabsContent value="completed" className="space-y-3">
          {rLoadingC ? (
            <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : runsCompleted.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
                <CheckCircle2 className="mb-3 h-10 w-10 opacity-30" />
                <p className="font-medium">Brak zakończonych checklist</p>
              </CardContent>
            </Card>
          ) : (
            runsCompleted.map((r) => (
              <Link key={r.id} to={`/checklists/runs/${r.id}`} className="block">
                <Card className="transition-colors hover:border-primary/40">
                  <CardContent className="flex items-center justify-between gap-4 py-4">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{r.template_name}</p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Building2 className="h-3 w-3" />
                            {r.building_name ?? "Bez budynku"}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {format(parseISO(r.completed_at ?? r.started_at), "d MMM yyyy", { locale: pl })}
                          </span>
                          {r.protocol_url && (
                            <span className="inline-flex items-center gap-1 text-blue-400">
                              <FileText className="h-3 w-3" />
                              PDF
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </CardContent>
                </Card>
              </Link>
            ))
          )}
        </TabsContent>
      </Tabs>

      {/* ---- DIALOG: wybór obiektu i start runu ---- */}
      <Dialog open={!!pickedTemplate} onOpenChange={(open) => !open && setPickedTemplate(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Rozpocznij checklistę</DialogTitle>
            <DialogDescription>{pickedTemplate?.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Obiekt</label>
              <Select value={pickedBuildingId} onValueChange={setPickedBuildingId}>
                <SelectTrigger><SelectValue placeholder="Wybierz obiekt…" /></SelectTrigger>
                <SelectContent>
                  {buildings.map((b: any) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name} {b.address ? `— ${b.address}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Wykonawca audytu (Twoje imię / podpis)
              </label>
              <Input
                value={performerName}
                onChange={(e) => setPerformerName(e.target.value)}
                placeholder="np. Jan Kowalski"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Notatki początkowe (opcjonalne)</label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="np. Audyt po incydencie ppoż. 18 kwietnia"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPickedTemplate(null)}>Anuluj</Button>
            <Button onClick={confirmStart} disabled={!pickedBuildingId || startRun.isPending}>
              {startRun.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Rozpocznij
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- DIALOG: nowy szablon checklisty ---- */}
      <Dialog open={newTemplateOpen} onOpenChange={(open) => { setNewTemplateOpen(open); if (!open) resetNewTemplate(); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nowy szablon checklisty</DialogTitle>
            <DialogDescription>
              Utwórz własny szablon audytu / przeglądu — możesz potem uruchamiać go dla dowolnego obiektu.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Kod szablonu *</label>
                <Input
                  value={tplCode}
                  onChange={(e) => setTplCode(e.target.value)}
                  placeholder="np. AUD-WLASNY-01"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Zakres *</label>
                <Select value={tplScope} onValueChange={(v) => setTplScope(v as ChecklistScope)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="audyt">{SCOPE_LABELS.audyt}</SelectItem>
                    <SelectItem value="sprzet">{SCOPE_LABELS.sprzet}</SelectItem>
                    <SelectItem value="bhp">{SCOPE_LABELS.bhp}</SelectItem>
                    <SelectItem value="inne">{SCOPE_LABELS.inne}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Nazwa szablonu *</label>
              <Input
                value={tplName}
                onChange={(e) => setTplName(e.target.value)}
                placeholder="np. Mój audyt półroczny — dom jednorodzinny"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Opis (opcjonalny)</label>
              <Textarea
                value={tplDescription}
                onChange={(e) => setTplDescription(e.target.value)}
                placeholder="Krótki opis kiedy używać tego szablonu"
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">
                  Punkty checklisty ({tplItems.length})
                </label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setTplItems((prev) => [...prev, makeBlankItem()])}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Dodaj punkt
                </Button>
              </div>

              <div className="space-y-2">
                {tplItems.map((it, idx) => (
                  <div
                    key={it.id}
                    className="rounded-lg border border-border bg-secondary/30 p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <GripVertical className="h-3.5 w-3.5" />
                        <span className="font-mono font-semibold text-primary">#{idx + 1}</span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeItem(it.id)}
                        disabled={tplItems.length <= 1}
                        className="h-6 px-2 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <Input
                        value={it.section}
                        onChange={(e) => updateItem(it.id, { section: e.target.value })}
                        placeholder="Sekcja (np. Gaśnice)"
                        className="sm:col-span-1"
                      />
                      <Input
                        value={it.label}
                        onChange={(e) => updateItem(it.id, { label: e.target.value })}
                        placeholder="Punkt kontrolny *"
                        className="sm:col-span-2"
                      />
                    </div>
                    <Textarea
                      value={it.description}
                      onChange={(e) => updateItem(it.id, { description: e.target.value })}
                      placeholder="Szczegóły / wskazówki dla audytora (opcjonalne)"
                      rows={1}
                      className="text-sm"
                    />
                    <div className="flex flex-wrap items-center gap-3 text-xs">
                      <Select
                        value={it.severity}
                        onValueChange={(v) => updateItem(it.id, { severity: v as ChecklistSeverity })}
                      >
                        <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="niski">Niski</SelectItem>
                          <SelectItem value="średni">Średni</SelectItem>
                          <SelectItem value="wysoki">Wysoki</SelectItem>
                          <SelectItem value="krytyczny">Krytyczny</SelectItem>
                        </SelectContent>
                      </Select>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={it.requires_photo}
                          onChange={(e) => updateItem(it.id, { requires_photo: e.target.checked })}
                          className="h-3.5 w-3.5 accent-primary"
                        />
                        <span>📷 Wymagane zdjęcie</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={it.requires_note_on_fail}
                          onChange={(e) => updateItem(it.id, { requires_note_on_fail: e.target.checked })}
                          className="h-3.5 w-3.5 accent-primary"
                        />
                        <span>📝 Notatka przy NIE OK</span>
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setNewTemplateOpen(false); resetNewTemplate(); }}>
              Anuluj
            </Button>
            <Button onClick={confirmCreateTemplate} disabled={createTemplate.isPending}>
              {createTemplate.isPending
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                : <Sparkles className="mr-2 h-4 w-4" />}
              Utwórz szablon
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Suppressed noUnusedLocals helper imports
void XCircle;
