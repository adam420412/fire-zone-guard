// =============================================================================
// TrainingHistoryDialog — oś czasu zmian szkolenia i jego uczestników.
// =============================================================================
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { History, Plus, Pencil, Trash2, User } from "lucide-react";
import { format } from "date-fns";
import { pl } from "date-fns/locale";
import { useTrainingAuditLog, FIELD_LABELS, type TrainingAuditEntry } from "@/hooks/useTrainingAuditLog";
import { useTrainingParticipants, ATTENDANCE_LABELS, TRAINING_STATUS_LABELS, TRAINING_TYPE_LABELS } from "@/hooks/useBuildingTrainings";

interface Props {
  open: boolean;
  onClose: () => void;
  trainingId: string | null;
  trainingTitle?: string;
}

const ACTION_META: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; Icon: typeof Plus }> = {
  created: { label: "Utworzono", variant: "default", Icon: Plus },
  updated: { label: "Zmieniono", variant: "secondary", Icon: Pencil },
  deleted: { label: "Usunięto", variant: "destructive", Icon: Trash2 },
};

function prettify(field: string | null, value: string | null): string {
  if (value == null || value === "") return "—";
  if (!field) return value;
  if (field === "status") return TRAINING_STATUS_LABELS[value] ?? value;
  if (field === "type") return TRAINING_TYPE_LABELS[value] ?? value;
  if (field === "attendance_status") return ATTENDANCE_LABELS[value] ?? value;
  if (field === "passed") return value === "true" ? "tak" : "nie";
  if (field === "certificate_url" || field === "trainer_signed_at" || field === "signed_at" || field === "scheduled_at" || field === "completed_at") {
    // Try to format ISO dates; fallback raw
    const d = new Date(value);
    if (!isNaN(d.getTime())) return format(d, "d MMM yyyy, HH:mm", { locale: pl });
  }
  return value;
}

export function TrainingHistoryDialog({ open, onClose, trainingId, trainingTitle }: Props) {
  const { data: log = [], isLoading } = useTrainingAuditLog(trainingId);
  const { data: participants = [] } = useTrainingParticipants(trainingId ?? undefined);

  const participantLabel = (pid: string | null): string => {
    if (!pid) return "";
    const p = participants.find((x) => x.id === pid);
    if (!p) return "uczestnik";
    return p.guest_name ?? p.profile?.name ?? p.employee?.first_name
      ? `${p.employee?.first_name ?? ""} ${p.employee?.last_name ?? ""}`.trim() || (p.profile?.name ?? p.guest_name ?? "uczestnik")
      : "uczestnik";
  };

  // Group entries by date for nicer scanning
  const grouped = log.reduce<Record<string, TrainingAuditEntry[]>>((acc, e) => {
    const day = format(new Date(e.created_at), "yyyy-MM-dd");
    (acc[day] ||= []).push(e);
    return acc;
  }, {});

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" /> Historia zmian
          </DialogTitle>
          <DialogDescription>
            {trainingTitle ? `Szkolenie: ${trainingTitle}` : "Wszystkie zmiany szkolenia i jego uczestników."}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          {isLoading ? (
            <div className="text-sm text-muted-foreground py-8 text-center">Ładowanie historii…</div>
          ) : log.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">Brak zarejestrowanych zmian.</div>
          ) : (
            <div className="space-y-6">
              {Object.entries(grouped).map(([day, entries]) => (
                <div key={day}>
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
                    {format(new Date(day), "EEEE, d MMMM yyyy", { locale: pl })}
                  </div>
                  <div className="space-y-2 border-l-2 border-border pl-4 ml-1">
                    {entries.map((e) => {
                      const meta = ACTION_META[e.action] ?? ACTION_META.updated;
                      const Icon = meta.Icon;
                      const isParticipant = !!e.participant_id;
                      return (
                        <div key={e.id} className="relative rounded-lg border border-border bg-card p-3">
                          <div className="absolute -left-[22px] top-3 h-3 w-3 rounded-full bg-primary border-2 border-background" />
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <Badge variant={meta.variant} className="gap-1">
                              <Icon className="h-3 w-3" />
                              {meta.label}
                            </Badge>
                            {isParticipant && (
                              <Badge variant="outline" className="gap-1">
                                <User className="h-3 w-3" />
                                {participantLabel(e.participant_id)}
                              </Badge>
                            )}
                            {e.field_name && (
                              <span className="text-sm font-medium">
                                {FIELD_LABELS[e.field_name] ?? e.field_name}
                              </span>
                            )}
                            <span className="text-xs text-muted-foreground ml-auto">
                              {format(new Date(e.created_at), "HH:mm", { locale: pl })}
                            </span>
                          </div>
                          {e.action === "updated" && e.field_name && (
                            <div className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
                              <span className="line-through">{prettify(e.field_name, e.old_value)}</span>
                              <span>→</span>
                              <span className="text-foreground font-medium">{prettify(e.field_name, e.new_value)}</span>
                            </div>
                          )}
                          {e.action !== "updated" && (e.new_value || e.old_value) && (
                            <div className="text-sm text-muted-foreground">
                              {prettify(e.field_name, e.new_value ?? e.old_value)}
                            </div>
                          )}
                          <div className="text-xs text-muted-foreground mt-1">
                            przez {e.changed_by_name ?? "system"}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
