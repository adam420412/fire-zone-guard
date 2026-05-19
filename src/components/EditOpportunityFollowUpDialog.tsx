import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Phone, Mail, Loader2, Building2, Trash2 } from "lucide-react";
import { useUpdateOpportunity, useCreateOpportunityUpdate, useDeleteOpportunity } from "@/hooks/useCrmData";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { format } from "date-fns";

interface Props {
  opportunity: any | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

function toLocalInput(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function EditOpportunityFollowUpDialog({ opportunity, open, onOpenChange }: Props) {
  const { user } = useAuth();
  const { mutate: updateOpp, isPending: updating } = useUpdateOpportunity();
  const { mutate: addUpdate, isPending: adding } = useCreateOpportunityUpdate();
  const { mutate: deleteOpp, isPending: deleting } = useDeleteOpportunity();

  const [followUpAt, setFollowUpAt] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("nowy_lead");

  useEffect(() => {
    if (opportunity) {
      setFollowUpAt(toLocalInput(opportunity.follow_up_at));
      setNote("");
      setStatus(opportunity.status ?? "nowy_lead");
    }
  }, [opportunity]);

  if (!opportunity) return null;

  const handleSave = () => {
    const updates: any = {
      follow_up_at: followUpAt ? new Date(followUpAt).toISOString() : null,
      status,
    };
    updateOpp(
      { id: opportunity.id, updates },
      {
        onSuccess: () => {
          if (note.trim()) {
            addUpdate({
              opportunity_id: opportunity.id,
              type: "note",
              content: note.trim(),
              author_id: user?.id,
              author_name: user?.email ?? "",
            } as any);
          }
          toast.success("Szansa zaktualizowana");
          onOpenChange(false);
        },
        onError: (e: any) => toast.error(e.message),
      }
    );
  };

  const handleDone = () => {
    updateOpp(
      { id: opportunity.id, updates: { status: "zamkniety_wygrany", follow_up_at: null } },
      {
        onSuccess: () => {
          toast.success("Szansa oznaczona jako załatwiona");
          onOpenChange(false);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-primary" />
            Szansa sprzedaży — przypomnienie
          </DialogTitle>
          <DialogDescription>
            {opportunity.title || opportunity.company_name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border border-border bg-secondary/30 p-3 space-y-1.5 text-sm">
            <div className="flex items-center gap-2 font-semibold">
              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
              {opportunity.linked_company_name || opportunity.company_name}
            </div>
            {opportunity.contact_name && (
              <div className="text-xs text-muted-foreground">Osoba: {opportunity.contact_name}</div>
            )}
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              {opportunity.contact_phone && (
                <a href={`tel:${opportunity.contact_phone}`} className="flex items-center gap-1 hover:text-primary">
                  <Phone className="h-3 w-3" /> {opportunity.contact_phone}
                </a>
              )}
              {opportunity.contact_email && (
                <a href={`mailto:${opportunity.contact_email}`} className="flex items-center gap-1 hover:text-primary">
                  <Mail className="h-3 w-3" /> {opportunity.contact_email}
                </a>
              )}
            </div>
            {opportunity.description && (
              <p className="text-xs text-muted-foreground whitespace-pre-wrap pt-1">{opportunity.description}</p>
            )}
            <Badge variant="outline" className="mt-1">{opportunity.status}</Badge>
          </div>

          <div className="space-y-2">
            <Label>Termin kontaktu (przypomnienie w kalendarzu)</Label>
            <Input
              type="datetime-local"
              value={followUpAt}
              onChange={(e) => setFollowUpAt(e.target.value)}
            />
            {opportunity.follow_up_at && (
              <p className="text-[11px] text-muted-foreground">
                Aktualnie: {format(new Date(opportunity.follow_up_at), "dd.MM.yyyy HH:mm")}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Status</Label>
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="nowy_lead">Nowy lead</option>
              <option value="kontakt">Kontakt</option>
              <option value="oferta">Oferta</option>
              <option value="negocjacje">Negocjacje</option>
              <option value="zamkniety_wygrany">Zamknięty — wygrany</option>
              <option value="zamkniety_przegrany">Zamknięty — przegrany</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label>Aktualizacja / notatka po kontakcie (opcjonalnie)</Label>
            <Textarea
              rows={3}
              placeholder="Np. Dzwoniłem o 10:00, oddzwoni jutro..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            type="button"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => {
              if (confirm("Usunąć szansę?")) {
                deleteOpp(opportunity.id, {
                  onSuccess: () => { toast.success("Usunięto"); onOpenChange(false); },
                });
              }
            }}
            disabled={deleting}
          >
            <Trash2 className="h-4 w-4 mr-1" /> Usuń
          </Button>
          <div className="flex-1" />
          <Button type="button" variant="outline" onClick={handleDone} disabled={updating}>
            Załatwione
          </Button>
          <Button type="button" onClick={handleSave} disabled={updating || adding}>
            {(updating || adding) && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Zapisz
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
