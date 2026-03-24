import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useBuildings, useCreateProtocol } from "@/hooks/useSupabaseData";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export function CreateProtocolDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { user } = useAuth();
  const { data: buildings } = useBuildings();
  const { mutate: createProtocol, isPending } = useCreateProtocol();

  const [buildingId, setBuildingId] = useState("");
  const [type, setType] = useState("HYDRANTY ZEWNĘTRZNE");
  const [performedAt, setPerformedAt] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!buildingId) {
      toast.error("Wybierz obiekt");
      return;
    }

    createProtocol({
      building_id: buildingId,
      inspector_id: user?.id,
      type,
      status: "wersja robocza",
      performed_at: performedAt,
      overall_result: "pozytywny",
      notes
    }, {
      onSuccess: () => {
        toast.success("Protokół utworzony! Możesz teraz dodać pomiary.");
        onOpenChange(false);
        // Reset form
        setBuildingId("");
        setNotes("");
      },
      onError: (err) => {
        toast.error("Błąd podczas tworzenia protokołu: " + err.message);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Nowy protokół serwisowy</DialogTitle>
            <DialogDescription>
              Wybierz obiekt i rodzaj protokołu (np. z badania hydrantów), aby założyć nowy raport. Pomiary dodasz w kolejnym kroku.
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
              <Label>Rodzaj protokołu</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="HYDRANTY ZEWNĘTRZNE">Hydranty zewnętrzne (DN 80, DN 100)</SelectItem>
                  <SelectItem value="HYDRANTY WEWNĘTRZNE">Hydranty wewnętrzne (DN 25, DN 33, DN 52)</SelectItem>
                  <SelectItem value="ZBIORNIKI">Zbiorniki i pompownie ppoż.</SelectItem>
                  <SelectItem value="GAŚNICE">Gaśnice i urządzenia przenośne</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Data wykonania przeglądu</Label>
              <Input 
                type="date" 
                value={performedAt} 
                onChange={e => setPerformedAt(e.target.value)}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label>Dodatkowe uwagi (widoczne dla klienta)</Label>
              <Textarea 
                value={notes} 
                onChange={e => setNotes(e.target.value)} 
                placeholder="Ogólne wnioski lub zalecenia po serwisie..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Anuluj
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Utwórz protokół
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
