// =============================================================================
// BuildingTrainingsTab — szkolenia PPOŻ przypisane do obiektu z uczestnikami.
// Używana w BuildingDetailPage jako zakładka "Szkolenia".
// =============================================================================
import { useEffect, useState } from "react";
import {
  useBuildingTrainings, useTrainingParticipants, useCreateTraining, useUpdateTraining,
  useDeleteTraining, useAddParticipant, useUpdateParticipant, useRemoveParticipant,
  useCompanyEmployees,
  TRAINING_TYPE_LABELS, TRAINING_STATUS_LABELS, ATTENDANCE_LABELS,
  type BuildingTraining, type TrainingParticipant,
} from "@/hooks/useBuildingTrainings";
import TrainingAttendanceMatrix from "@/components/TrainingAttendanceMatrix";
import { SignatureDialog } from "@/components/SignatureDialog";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { GraduationCap, Plus, Calendar, Users, Trash2, Edit, UserPlus, CheckCircle2, ChevronDown, ChevronRight, Loader2, PenLine, Download } from "lucide-react";
import { format } from "date-fns";
import { pl } from "date-fns/locale";
import {
  generateAndDownloadCertificate, uploadSignature,
  generateCertificateBlob, uploadCertificatePdf,
} from "@/lib/trainingCertificates";

interface Props {
  buildingId: string;
  companyId: string | null;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  zaplanowane: "secondary",
  w_trakcie:   "default",
  zakonczone:  "outline",
  odwolane:    "destructive",
};

export default function BuildingTrainingsTab({ buildingId, companyId }: Props) {
  const { data: trainings = [], isLoading } = useBuildingTrainings(buildingId);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<BuildingTraining | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const deleteTraining = useDeleteTraining();
  const { toast } = useToast();

  const handleDelete = (t: BuildingTraining) => {
    if (!confirm(`Usunąć szkolenie "${t.title}"?`)) return;
    deleteTraining.mutate(
      { id: t.id, building_id: t.building_id },
      { onSuccess: () => toast({ title: "Szkolenie usunięte" }) },
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-primary" />
            Szkolenia PPOŻ w obiekcie
          </h3>
          <p className="text-sm text-muted-foreground">
            Plan szkoleń z przypisanymi pracownikami i kontrolą frekwencji.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Nowe szkolenie
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : trainings.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center text-muted-foreground">
          <GraduationCap className="h-10 w-10 mx-auto mb-3 opacity-40" />
          Brak zaplanowanych szkoleń. Kliknij "Nowe szkolenie" aby dodać.
        </div>
      ) : (
        <div className="space-y-2">
          {trainings.map((t) => (
            <div key={t.id} className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4">
                <button
                  onClick={() => setExpanded(expanded === t.id ? null : t.id)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Rozwiń"
                >
                  {expanded === t.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{t.title}</div>
                  <div className="flex flex-wrap gap-2 mt-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {format(new Date(t.scheduled_at), "d MMM yyyy, HH:mm", { locale: pl })}
                    </span>
                    <span>· {TRAINING_TYPE_LABELS[t.type]}</span>
                    {t.trainer_name && <span>· Prowadzący: {t.trainer_name}</span>}
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3 w-3" /> {t.participants_count ?? 0}
                    </span>
                    {t.next_due_date && (
                      <span>· Kolejne: {format(new Date(t.next_due_date), "d MMM yyyy", { locale: pl })}</span>
                    )}
                  </div>
                </div>
                <Badge variant={STATUS_VARIANT[t.status] ?? "secondary"}>
                  {TRAINING_STATUS_LABELS[t.status]}
                </Badge>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => setEditing(t)} aria-label="Edytuj">
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => handleDelete(t)} aria-label="Usuń">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>

              {expanded === t.id && (
                <div className="border-t border-border bg-muted/30 p-4">
                  <ParticipantsSection training={t} companyId={companyId} buildingId={buildingId} />
                  {t.description && (
                    <p className="text-sm text-muted-foreground mt-4 italic">{t.description}</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <TrainingAttendanceMatrix buildingId={buildingId} />

      <TrainingDialog
        open={createOpen || !!editing}
        onClose={() => { setCreateOpen(false); setEditing(null); }}
        buildingId={buildingId}
        companyId={companyId}
        training={editing}
      />
    </div>
  );
}

// -------------------------- Participants section -----------------------------
function ParticipantsSection({
  training, companyId, buildingId,
}: { training: BuildingTraining; companyId: string | null; buildingId: string }) {
  const trainingId = training.id;
  const { data: participants = [], isLoading } = useTrainingParticipants(trainingId);
  const { data: employees = [] } = useCompanyEmployees(companyId);
  const addParticipant = useAddParticipant();
  const updateParticipant = useUpdateParticipant();
  const removeParticipant = useRemoveParticipant();
  const updateTraining = useUpdateTraining();
  const { toast } = useToast();

  const [pickedEmployeeId, setPickedEmployeeId] = useState<string>("");
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");

  // Signature dialog state
  const [trainerSigOpen, setTrainerSigOpen] = useState(false);
  const [participantSig, setParticipantSig] = useState<TrainingParticipant | null>(null);
  const [busyCertId, setBusyCertId] = useState<string | null>(null);

  // Building info for certificate
  const [building, setBuilding] = useState<{ name: string; address: string | null } | null>(null);
  useEffect(() => {
    let active = true;
    supabase.from("buildings").select("name, address").eq("id", buildingId).maybeSingle()
      .then(({ data }) => { if (active && data) setBuilding(data as any); });
    return () => { active = false; };
  }, [buildingId]);

  const isCompleted = training.status === "zakonczone";
  const addedEmpIds = new Set(participants.map((p) => p.employee_id).filter(Boolean) as string[]);
  const availableEmployees = employees.filter((e) => !addedEmpIds.has(e.id));

  const participantName = (p: TrainingParticipant) =>
    p.employee
      ? `${p.employee.first_name ?? ""} ${p.employee.last_name ?? ""}`.trim() || p.employee.email || "—"
      : p.profile?.name ?? p.guest_name ?? "—";

  const handleAddEmployee = () => {
    if (!pickedEmployeeId) return;
    const emp = employees.find((e) => e.id === pickedEmployeeId);
    addParticipant.mutate(
      { training_id: trainingId, employee_id: pickedEmployeeId, user_id: emp?.user_id ?? null, attendance_status: "zaplanowany" },
      { onSuccess: () => { toast({ title: "Pracownik dodany" }); setPickedEmployeeId(""); } },
    );
  };

  const handleAddGuest = () => {
    if (!guestName.trim()) return;
    addParticipant.mutate(
      { training_id: trainingId, guest_name: guestName.trim(), guest_email: guestEmail.trim() || null, attendance_status: "zaplanowany" },
      { onSuccess: () => { toast({ title: "Uczestnik dodany" }); setGuestName(""); setGuestEmail(""); } },
    );
  };

  // Trener: zlozenie podpisu
  const handleTrainerSignature = async (dataUrl: string) => {
    try {
      const url = await uploadSignature(dataUrl, "trainer", trainingId);
      await updateTraining.mutateAsync({
        id: trainingId,
        updates: { trainer_signature_url: url, trainer_signed_at: new Date().toISOString() } as any,
      });
      toast({ title: "Podpis prowadzącego zapisany" });
      setTrainerSigOpen(false);
    } catch (e: any) {
      toast({ title: "Błąd zapisu podpisu", description: e.message, variant: "destructive" });
    }
  };

  // Uczestnik: zlozenie podpisu
  const handleParticipantSignature = async (dataUrl: string) => {
    if (!participantSig) return;
    try {
      const url = await uploadSignature(dataUrl, "participant", participantSig.id);
      await updateParticipant.mutateAsync({
        id: participantSig.id,
        updates: { signature_url: url, signed_at: new Date().toISOString() } as any,
      });
      toast({ title: "Podpis uczestnika zapisany" });
      setParticipantSig(null);
    } catch (e: any) {
      toast({ title: "Błąd zapisu podpisu", description: e.message, variant: "destructive" });
    }
  };

  // Pobierz certyfikat
  const handleDownloadCertificate = async (p: TrainingParticipant) => {
    setBusyCertId(p.id);
    try {
      await generateAndDownloadCertificate({
        participantName: participantName(p),
        trainingTitle: training.title,
        trainingType: TRAINING_TYPE_LABELS[training.type] ?? String(training.type),
        buildingName: building?.name ?? "—",
        buildingAddress: building?.address ?? null,
        performedAt: training.completed_at ?? training.scheduled_at,
        durationMinutes: training.duration_minutes,
        trainerName: training.trainer_name,
        trainerSignatureUrl: training.trainer_signature_url,
        participantSignatureUrl: p.signature_url,
        certificateNumber: `${training.id.slice(0, 8).toUpperCase()}-${p.id.slice(0, 4).toUpperCase()}`,
      });
    } catch (e: any) {
      toast({ title: "Błąd generowania certyfikatu", description: e.message, variant: "destructive" });
    } finally {
      setBusyCertId(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-sm font-semibold flex items-center gap-2">
          <Users className="h-4 w-4" /> Uczestnicy ({participants.length})
        </div>
        {isCompleted && (
          <div className="flex items-center gap-2 flex-wrap">
            {training.trainer_signature_url ? (
              <Badge variant="default" className="gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Trener podpisał
                {training.trainer_signed_at && (
                  <span className="opacity-80">
                    · {format(new Date(training.trainer_signed_at), "d MMM yyyy, HH:mm", { locale: pl })}
                  </span>
                )}
              </Badge>
            ) : (
              <Badge variant="outline">Brak podpisu trenera</Badge>
            )}
            <Button size="sm" variant="outline" onClick={() => setTrainerSigOpen(true)}>
              <PenLine className="h-4 w-4 mr-1" />
              {training.trainer_signature_url ? "Podpisz ponownie" : "Podpis prowadzącego"}
            </Button>
          </div>
        )}
      </div>

      {!isCompleted && (
        <div className="text-xs text-muted-foreground italic">
          Podpisy elektroniczne i certyfikaty będą dostępne po oznaczeniu szkolenia jako „Zakończone".
        </div>
      )}

      {isLoading ? (
        <div className="text-xs text-muted-foreground">Ładowanie...</div>
      ) : participants.length === 0 ? (
        <div className="text-xs text-muted-foreground italic">Brak uczestników. Dodaj poniżej.</div>
      ) : (
        <div className="space-y-1.5">
          {participants.map((p) => {
            const name = participantName(p);
            const email = p.employee?.email ?? p.profile?.email ?? p.guest_email ?? "";
            const canCertificate =
              isCompleted && (p.attendance_status === "obecny" || p.passed === true);
            return (
              <div key={p.id} className="flex items-center gap-2 bg-card border border-border rounded-md px-3 py-2 text-sm flex-wrap">
                <div className="flex-1 min-w-[160px]">
                  <div className="truncate font-medium">{name}</div>
                  {email && <div className="text-xs text-muted-foreground truncate">{email}</div>}
                </div>
                <Select
                  value={p.attendance_status}
                  onValueChange={(v) =>
                    updateParticipant.mutate({ id: p.id, updates: { attendance_status: v as any } })
                  }
                >
                  <SelectTrigger className="h-8 w-[150px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ATTENDANCE_LABELS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="icon" variant="ghost" className="h-8 w-8"
                  onClick={() =>
                    updateParticipant.mutate({ id: p.id, updates: { passed: p.passed === true ? null : true } })
                  }
                  aria-label="Zaliczył"
                  title={p.passed === true ? "Zaliczone" : "Oznacz jako zaliczone"}
                >
                  <CheckCircle2 className={`h-4 w-4 ${p.passed === true ? "text-success" : "text-muted-foreground"}`} />
                </Button>

                {/* Podpis uczestnika */}
                {isCompleted && (
                  <Button
                    size="sm"
                    variant={p.signature_url ? "secondary" : "outline"}
                    className="h-8"
                    onClick={() => setParticipantSig(p)}
                    title={p.signature_url ? "Podpisany — kliknij aby podpisać ponownie" : "Złóż podpis uczestnika"}
                  >
                    <PenLine className="h-3.5 w-3.5 mr-1" />
                    {p.signature_url ? "Podpisany" : "Podpis"}
                  </Button>
                )}

                {/* Certyfikat */}
                {isCompleted && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    disabled={!canCertificate || busyCertId === p.id}
                    onClick={() => handleDownloadCertificate(p)}
                    title={!canCertificate ? "Wymagana obecność lub zaliczenie" : "Pobierz certyfikat PDF"}
                  >
                    {busyCertId === p.id
                      ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      : <Download className="h-3.5 w-3.5 mr-1" />}
                    Certyfikat
                  </Button>
                )}

                <Button
                  size="icon" variant="ghost" className="h-8 w-8"
                  onClick={() => {
                    if (!confirm("Usunąć uczestnika?")) return;
                    removeParticipant.mutate({ id: p.id, training_id: trainingId });
                  }}
                  aria-label="Usuń"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* Add employee */}
      <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-border">
        <Select value={pickedEmployeeId} onValueChange={setPickedEmployeeId}>
          <SelectTrigger className="h-9 flex-1">
            <SelectValue placeholder={availableEmployees.length ? "Wybierz pracownika firmy..." : "Brak dostępnych pracowników"} />
          </SelectTrigger>
          <SelectContent>
            {availableEmployees.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {`${e.first_name ?? ""} ${e.last_name ?? ""}`.trim() || e.email || "—"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={handleAddEmployee} disabled={!pickedEmployeeId || addParticipant.isPending}>
          <UserPlus className="h-4 w-4 mr-1" /> Dodaj
        </Button>
      </div>

      {/* Add guest */}
      <div className="flex flex-col sm:flex-row gap-2">
        <Input placeholder="Gość: imię i nazwisko" value={guestName} onChange={(e) => setGuestName(e.target.value)} className="h-9 flex-1" />
        <Input placeholder="Email (opcjonalnie)" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} className="h-9 flex-1" />
        <Button size="sm" variant="outline" onClick={handleAddGuest} disabled={!guestName.trim()}>
          <Plus className="h-4 w-4 mr-1" /> Gość
        </Button>
      </div>

      {/* Signature dialogs */}
      <SignatureDialog
        open={trainerSigOpen}
        onOpenChange={setTrainerSigOpen}
        onConfirm={handleTrainerSignature}
        title={`Podpis prowadzącego: ${training.trainer_name ?? "—"}`}
      />
      <SignatureDialog
        open={!!participantSig}
        onOpenChange={(o) => !o && setParticipantSig(null)}
        onConfirm={handleParticipantSignature}
        title={participantSig ? `Podpis uczestnika: ${participantName(participantSig)}` : "Podpis uczestnika"}
      />
    </div>
  );
}

// -------------------------- Create / Edit dialog -----------------------------
function TrainingDialog({
  open, onClose, buildingId, companyId, training,
}: {
  open: boolean; onClose: () => void;
  buildingId: string; companyId: string | null;
  training: BuildingTraining | null;
}) {
  const create = useCreateTraining();
  const update = useUpdateTraining();
  const { toast } = useToast();

  const [title, setTitle]                 = useState(training?.title ?? "");
  const [type, setType]                   = useState<string>(training?.type ?? "ogolne_ppoz");
  const [scheduledAt, setScheduledAt]     = useState(
    training?.scheduled_at ? training.scheduled_at.slice(0, 16) : new Date().toISOString().slice(0, 16),
  );
  const [trainerName, setTrainerName]     = useState(training?.trainer_name ?? "");
  const [duration, setDuration]           = useState(training?.duration_minutes?.toString() ?? "60");
  const [recurrence, setRecurrence]       = useState(training?.recurrence_months?.toString() ?? "12");
  const [status, setStatus]               = useState<string>(training?.status ?? "zaplanowane");
  const [description, setDescription]     = useState(training?.description ?? "");

  // Reset on training change
  useState(() => { /* noop, handled via key prop */ });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !scheduledAt) {
      toast({ title: "Wpisz tytuł i datę", variant: "destructive" });
      return;
    }
    const payload: any = {
      building_id: buildingId,
      company_id: companyId,
      title: title.trim(),
      type: type as any,
      scheduled_at: new Date(scheduledAt).toISOString(),
      trainer_name: trainerName.trim() || null,
      duration_minutes: duration ? Number(duration) : null,
      recurrence_months: recurrence ? Number(recurrence) : null,
      status: status as any,
      description: description.trim() || null,
    };

    if (training) {
      update.mutate(
        { id: training.id, updates: payload },
        { onSuccess: () => { toast({ title: "Zaktualizowano szkolenie" }); onClose(); } },
      );
    } else {
      create.mutate(payload, {
        onSuccess: () => { toast({ title: "Utworzono szkolenie" }); onClose(); },
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{training ? "Edytuj szkolenie" : "Nowe szkolenie PPOŻ"}</DialogTitle>
            <DialogDescription>
              Szkolenie zostanie powiązane z obiektem. Po zapisaniu możesz dodać uczestników.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">Tytuł *</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Typ szkolenia *</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(TRAINING_TYPE_LABELS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(TRAINING_STATUS_LABELS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sched">Data i godzina *</Label>
              <Input id="sched" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="dur">Czas trwania (min)</Label>
                <Input id="dur" type="number" min={0} value={duration} onChange={(e) => setDuration(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rec">Powtarzanie (miesiące)</Label>
                <Input id="rec" type="number" min={0} value={recurrence} onChange={(e) => setRecurrence(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="trainer">Prowadzący</Label>
              <Input id="trainer" value={trainerName} onChange={(e) => setTrainerName(e.target.value)} placeholder="np. Jan Kowalski (uprawnienia ppoż.)" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="desc">Opis / agenda</Label>
              <Textarea id="desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Anuluj</Button>
            <Button type="submit" disabled={create.isPending || update.isPending}>
              {(create.isPending || update.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {training ? "Zapisz zmiany" : "Utwórz szkolenie"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
