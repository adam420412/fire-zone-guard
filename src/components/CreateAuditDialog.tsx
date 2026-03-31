import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useBuildings, useCreateAudit } from "@/hooks/useSupabaseData";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export function CreateAuditDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { user } = useAuth();
  const { data: buildings } = useBuildings();
  const { mutate: createAudit, isPending } = useCreateAudit();

  const [buildingId, setBuildingId] = useState("");
  const [scheduledFor, setScheduledFor] = useState(new Date().toISOString().split("T")[0]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!buildingId) {
      toast.error("Wybierz obiekt");
      return;
    }

    createAudit({
      building_id: buildingId,
      auditor_id: user?.id,
      status: "zaplanowany",
      type: "PPOŻ",
      performed_at: scheduledFor,
    }, {
      onSuccess: () => {
        toast.success("Audyt zaplanowany.");
        onOpenChange(false);
        setBuildingId("");
      },
      onError: (err) => {
        toast.error("Błąd podczas planowania: " + err.message);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Utwórz nowy audyt</DialogTitle>
            <DialogDescription>
              Wybierz obiekt i datę planowanego audytu. Dokument ekspertyzy będzie można generować na podstronie audytu.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Obiekt</Label>
              <Select value={buildingId} onValueChange={setBuildingId}>
                <SelectTrigger>
                  <SelectValue placeholder="Wybierz obiekt..." />
                </SelectTrigger>
                <SelectContent>
                  {buildings?.map(b => (
                    <SelectItem key={(b as any).id} value={(b as any).id}>{(b as any).name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Data audytu</Label>
              <Input 
                type="date" 
                value={scheduledFor} 
                onChange={e => setScheduledFor(e.target.value)}
                required
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Anuluj</Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Utwórz
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
