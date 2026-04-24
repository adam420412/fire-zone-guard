// =============================================================================
// ChecklistRunPage — mobile-first odklikiwanie checklisty (iter 8).
//
// UX:
//   - Sticky header z postępem (np. "12 z 28 punktów")
//   - Sekcje (np. "Drogi ewakuacyjne", "Gaśnice")
//   - Każdy punkt: 3 wielkie buttony (OK / NIE OK / N/D), notatka, foto
//   - Sticky bottom bar: "Finalizuj" — generuje PDF + tworzy zadania per NIE_OK
// =============================================================================

import { useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft, CheckCircle2, XCircle, MinusCircle, Camera, Loader2,
  AlertTriangle, FileText, Building2, Clock, ListChecks, Sparkles,
  Trash2, X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { pl } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  useChecklistRun, useUpdateRunItem, useFinalizeRun, useDeleteRun,
  uploadAuditPhoto,
  ITEM_STATUS_LABELS, SEVERITY_LABELS,
  type ChecklistRunItem, type ChecklistRunItemStatus,
} from "@/hooks/useChecklists";
import { generateAuditProtocolPdf } from "@/lib/auditProtocolPdf";
import { uploadAuditProtocol } from "@/hooks/useChecklists";

const STATUS_COLOR: Record<ChecklistRunItemStatus, string> = {
  pending: "border-slate-700 bg-slate-900/50",
  ok:      "border-emerald-500/40 bg-emerald-500/5",
  nie_ok:  "border-red-500/50 bg-red-500/10",
  na:      "border-slate-600 bg-slate-800/30",
};

const SEVERITY_COLOR: Record<string, string> = {
  niski:     "bg-slate-500/20 text-slate-300",
  średni:    "bg-blue-500/20 text-blue-300",
  wysoki:    "bg-amber-500/20 text-amber-300",
  krytyczny: "bg-red-500/30 text-red-200",
};

export default function ChecklistRunPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: run, isLoading, error } = useChecklistRun(id);
  const updateItem = useUpdateRunItem();
  const finalize = useFinalizeRun();
  const deleteRun = useDeleteRun();

  const [summaryDialog, setSummaryDialog] = useState(false);
  const [finalSummary, setFinalSummary] = useState("");
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Pogrupuj items po sekcjach (zachowując kolejność pierwszego wystąpienia sekcji)
  const grouped = useMemo(() => {
    if (!run) return [];
    const order: string[] = [];
    const map: Record<string, ChecklistRunItem[]> = {};
    for (const it of run.items) {
      const key = it.section ?? "Bez sekcji";
      if (!(key in map)) {
        map[key] = [];
        order.push(key);
      }
      map[key].push(it);
    }
    return order.map((section) => ({ section, items: map[section] }));
  }, [run]);

  const total = run?.items.length ?? 0;
  const done = run?.items.filter((i) => i.status !== "pending").length ?? 0;
  const failed = run?.items.filter((i) => i.status === "nie_ok").length ?? 0;
  const isCompleted = run?.status === "completed";

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !run) {
    return (
      <div className="space-y-4">
        <Button asChild variant="ghost"><Link to="/checklists"><ArrowLeft className="mr-2 h-4 w-4" />Wróć</Link></Button>
        <Card className="border-destructive/50 bg-destructive/10">
          <CardContent className="flex items-center gap-4 py-6 text-destructive">
            <AlertTriangle className="h-6 w-6" />
            <div>
              <p className="font-semibold">Nie znaleziono checklisty</p>
              <p className="text-sm">{(error as any)?.message ?? "Sprawdź adres lub uprawnienia."}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  async function setStatus(item: ChecklistRunItem, status: ChecklistRunItemStatus) {
    if (isCompleted) return;
    try {
      await updateItem.mutateAsync({ id: item.id, patch: { status } });
    } catch (e: any) {
      toast.error(`Błąd zapisu: ${e?.message ?? e}`);
    }
  }

  async function setNote(item: ChecklistRunItem, note: string) {
    if (isCompleted) return;
    try {
      await updateItem.mutateAsync({ id: item.id, patch: { note } });
    } catch (e: any) {
      toast.error(`Błąd zapisu notatki: ${e?.message ?? e}`);
    }
  }

  async function addPhoto(item: ChecklistRunItem, file: File) {
    if (isCompleted) return;
    try {
      const url = await uploadAuditPhoto(file, run!.id);
      const next = [...(item.photo_urls ?? []), url];
      await updateItem.mutateAsync({ id: item.id, patch: { photo_urls: next } });
    } catch (e: any) {
      toast.error(`Upload zdjęcia: ${e?.message ?? e}`);
    }
  }

  async function removePhoto(item: ChecklistRunItem, url: string) {
    if (isCompleted) return;
    try {
      const next = (item.photo_urls ?? []).filter((u) => u !== url);
      await updateItem.mutateAsync({ id: item.id, patch: { photo_urls: next } });
    } catch (e: any) {
      toast.error(`Błąd: ${e?.message ?? e}`);
    }
  }

  async function doFinalize() {
    if (!run) return;
    // walidacja: przy NIE_OK + requires_note_on_fail wymagaj notatki
    const missingNote = run.items.find(
      (i) => i.status === "nie_ok" && i.requires_note_on_fail && !i.note?.trim(),
    );
    if (missingNote) {
      toast.error(`Punkt „${missingNote.label}" wymaga notatki przy NIE OK.`);
      return;
    }
    const stillPending = run.items.some((i) => i.status === "pending");
    if (stillPending) {
      const ok = window.confirm(
        'Niektóre punkty są jeszcze w stanie "Do sprawdzenia". Sfinalizować mimo to?',
      );
      if (!ok) return;
    }

    setIsFinalizing(true);
    try {
      // 1. wygeneruj PDF
      let protocolUrl: string | null = null;
      try {
        const blob = await generateAuditProtocolPdf({
          ...run,
          summary: finalSummary,
          completed_at: new Date().toISOString(),
        });
        protocolUrl = await uploadAuditProtocol(blob, run.id);
      } catch (e: any) {
        toast.warning(`PDF nie wygenerowany: ${e?.message ?? e}. Finalizuję bez PDF.`);
      }

      // 2. finalize → backend tworzy zadania per NIE_OK
      const result = await finalize.mutateAsync({
        run_id: run.id,
        summary: finalSummary || null,
        protocol_url: protocolUrl,
      });
      toast.success(
        `Checklista zamknięta. Utworzono ${result.created_tasks} ${
          result.created_tasks === 1 ? "naprawę" : "napraw"
        } w Kanbanie.${result.failed_tasks > 0 ? ` (${result.failed_tasks} błędów)` : ""}`,
      );
      setSummaryDialog(false);
    } catch (e: any) {
      toast.error(`Finalizacja nie powiodła się: ${e?.message ?? e}`);
    } finally {
      setIsFinalizing(false);
    }
  }

  async function handleDelete() {
    if (!run) return;
    try {
      await deleteRun.mutateAsync(run.id);
      toast.success("Checklista usunięta.");
      navigate("/checklists");
    } catch (e: any) {
      toast.error(`Błąd: ${e?.message ?? e}`);
    }
  }

  return (
    <div className="space-y-6 pb-24">
      {/* ---- BACK + TYTUŁ ---- */}
      <div className="space-y-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/checklists"><ArrowLeft className="mr-2 h-4 w-4" />Lista checklist</Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{run.template_name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Building2 className="h-4 w-4" />{run.building_name ?? "Bez budynku"}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="h-4 w-4" />
                {format(parseISO(run.started_at), "d MMM yyyy, HH:mm", { locale: pl })}
              </span>
              {run.performer_name && <span>• {run.performer_name}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isCompleted && (
              <Badge variant="outline" className="bg-emerald-500/15 text-emerald-300 border-emerald-500/40">
                <CheckCircle2 className="mr-1 h-3 w-3" />Zakończona
              </Badge>
            )}
            {run.protocol_url && (
              <Button asChild size="sm" variant="outline">
                <a href={run.protocol_url} target="_blank" rel="noreferrer">
                  <FileText className="mr-2 h-4 w-4" />PDF
                </a>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ---- POSTĘP ---- */}
      <Card>
        <CardContent className="flex flex-col gap-2 py-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">
              {done} z {total} {done === 1 ? "punktu" : "punktów"} sprawdzone
            </span>
            <span className="text-muted-foreground">
              {failed > 0 && (
                <span className="mr-3 font-medium text-red-400">{failed} NIE OK</span>
              )}
              {total > 0 ? Math.round((done / total) * 100) : 0}%
            </span>
          </div>
          <Progress value={total > 0 ? (done / total) * 100 : 0} />
        </CardContent>
      </Card>

      {/* ---- SEKCJE Z PUNKTAMI ---- */}
      {grouped.map(({ section, items }) => (
        <Card key={section}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-primary" />
              {section}
            </CardTitle>
            <CardDescription>
              {items.filter((i) => i.status !== "pending").length} z {items.length} sprawdzonych
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-3">
            {items.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                disabled={isCompleted}
                onSetStatus={(s) => setStatus(item, s)}
                onSetNote={(n) => setNote(item, n)}
                onAddPhoto={(f) => addPhoto(item, f)}
                onRemovePhoto={(u) => removePhoto(item, u)}
              />
            ))}
          </CardContent>
        </Card>
      ))}

      {/* ---- STICKY BOTTOM BAR (Finalizuj) ---- */}
      {!isCompleted && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="mx-auto flex max-w-screen-xl items-center justify-between gap-2 px-4 py-3">
            <div className="text-xs text-muted-foreground sm:text-sm">
              <span className="font-medium text-foreground">{done}/{total}</span> punktów
              {failed > 0 && <span className="ml-2 text-red-400">• {failed} NIE OK → {failed} {failed === 1 ? "naprawa" : "napraw"}</span>}
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="mr-1 h-4 w-4" />Usuń
              </Button>
              <Button
                size="sm"
                onClick={() => { setFinalSummary(run.summary ?? ""); setSummaryDialog(true); }}
              >
                <Sparkles className="mr-2 h-4 w-4" />Finalizuj
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ---- DIALOG: finalizacja ---- */}
      <Dialog open={summaryDialog} onOpenChange={setSummaryDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Finalizacja checklisty</DialogTitle>
            <DialogDescription>
              {failed > 0
                ? `Wygeneruję PDF protokołu i utworzę ${failed} ${failed === 1 ? "naprawę" : "napraw"} w Kanbanie (po jednej dla każdego NIE OK).`
                : "Wszystkie punkty OK / N/D. Wygeneruję PDF protokołu — żadne naprawy nie zostaną utworzone."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Podsumowanie audytora (pojawi się w PDF)
              </label>
              <Textarea
                value={finalSummary}
                onChange={(e) => setFinalSummary(e.target.value)}
                placeholder="np. Stan ogólny dobry. Wymiana 2 gaśnic do dn. 30.05."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSummaryDialog(false)} disabled={isFinalizing}>
              Anuluj
            </Button>
            <Button onClick={doFinalize} disabled={isFinalizing}>
              {isFinalizing
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                : <CheckCircle2 className="mr-2 h-4 w-4" />}
              Zatwierdź i zamknij
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- DIALOG: usuwanie ---- */}
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Usunąć tę checklistę?</DialogTitle>
            <DialogDescription>
              Skasuje to wszystkie punkty i odpowiedzi. Operacja nieodwracalna.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>Anuluj</Button>
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="mr-2 h-4 w-4" />Usuń
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================================
// Pojedynczy wiersz checklisty
// ============================================================================
function ItemRow({
  item, disabled,
  onSetStatus, onSetNote, onAddPhoto, onRemovePhoto,
}: {
  item: ChecklistRunItem;
  disabled: boolean;
  onSetStatus: (s: ChecklistRunItemStatus) => void;
  onSetNote: (n: string) => void;
  onAddPhoto: (f: File) => void;
  onRemovePhoto: (url: string) => void;
}) {
  const [localNote, setLocalNote] = useState(item.note ?? "");
  const noteRequired = item.status === "nie_ok" && item.requires_note_on_fail && !localNote.trim();

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onAddPhoto(file);
    e.target.value = "";
  };

  return (
    <div className={cn("rounded-lg border p-3 transition-colors", STATUS_COLOR[item.status])}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium leading-snug">{item.label}</p>
          {item.description && (
            <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className={cn("text-[10px]", SEVERITY_COLOR[item.default_severity])}>
              {SEVERITY_LABELS[item.default_severity]}
            </Badge>
            {item.requires_photo && (
              <Badge variant="outline" className="text-[10px]">
                <Camera className="mr-1 h-2.5 w-2.5" />Wymaga zdjęcia
              </Badge>
            )}
            {item.task_id && (
              <Badge variant="outline" className="text-[10px] bg-orange-500/15 text-orange-300 border-orange-500/30">
                Naprawa utworzona
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Buttony OK / NIE OK / N/D */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <StatusButton
          active={item.status === "ok"}
          onClick={() => onSetStatus("ok")}
          icon={<CheckCircle2 className="h-4 w-4" />}
          label={ITEM_STATUS_LABELS.ok}
          color="emerald"
          disabled={disabled}
        />
        <StatusButton
          active={item.status === "nie_ok"}
          onClick={() => onSetStatus("nie_ok")}
          icon={<XCircle className="h-4 w-4" />}
          label={ITEM_STATUS_LABELS.nie_ok}
          color="red"
          disabled={disabled}
        />
        <StatusButton
          active={item.status === "na"}
          onClick={() => onSetStatus("na")}
          icon={<MinusCircle className="h-4 w-4" />}
          label={ITEM_STATUS_LABELS.na}
          color="slate"
          disabled={disabled}
        />
      </div>

      {/* Notatka (zawsze widoczna gdy NIE_OK lub gdy ktoś coś napisał) */}
      {(item.status === "nie_ok" || localNote || item.note) && (
        <div className="mt-3">
          <Textarea
            value={localNote}
            onChange={(e) => setLocalNote(e.target.value)}
            onBlur={() => { if (localNote !== (item.note ?? "")) onSetNote(localNote); }}
            placeholder={noteRequired ? "Wymagana notatka opisująca problem…" : "Notatka (opcjonalna)"}
            rows={2}
            disabled={disabled}
            className={cn(noteRequired && "border-destructive/50")}
          />
          {noteRequired && (
            <p className="mt-1 text-xs text-destructive">Notatka wymagana przy statusie NIE OK</p>
          )}
        </div>
      )}

      {/* Zdjęcia */}
      {(item.photo_urls.length > 0 || item.status === "nie_ok" || item.requires_photo) && (
        <div className="mt-3 space-y-2">
          {item.photo_urls.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {item.photo_urls.map((url) => (
                <div key={url} className="group relative">
                  <a href={url} target="_blank" rel="noreferrer">
                    <img
                      src={url}
                      alt="Zdjęcie z audytu"
                      className="h-20 w-20 rounded-md border border-border object-cover"
                      loading="lazy"
                    />
                  </a>
                  {!disabled && (
                    <button
                      type="button"
                      onClick={() => onRemovePhoto(url)}
                      className="absolute -right-1.5 -top-1.5 rounded-full bg-destructive p-0.5 text-destructive-foreground opacity-0 transition-opacity group-hover:opacity-100"
                      aria-label="Usuń zdjęcie"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {!disabled && (
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-3 py-1.5 text-xs hover:bg-accent">
              <Camera className="h-3.5 w-3.5" />
              Dodaj zdjęcie
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={onPickFile}
                className="hidden"
              />
            </label>
          )}
        </div>
      )}
    </div>
  );
}

function StatusButton({
  active, onClick, icon, label, color, disabled,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  color: "emerald" | "red" | "slate";
  disabled?: boolean;
}) {
  const colors = {
    emerald: active
      ? "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-600"
      : "border-emerald-600/40 text-emerald-300 hover:bg-emerald-600/10",
    red: active
      ? "bg-red-600 text-white border-red-600 hover:bg-red-600"
      : "border-red-600/40 text-red-300 hover:bg-red-600/10",
    slate: active
      ? "bg-slate-600 text-white border-slate-600 hover:bg-slate-600"
      : "border-slate-500/40 text-slate-300 hover:bg-slate-600/10",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-11 items-center justify-center gap-1.5 rounded-md border-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        colors[color],
      )}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
