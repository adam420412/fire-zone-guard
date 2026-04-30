import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Hammer, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateTask } from "@/hooks/useSupabaseData";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Props {
  device: {
    id: string;
    name: string;
    building_id: string;
    location_in_building?: string | null;
    serial_number?: string | null;
    model?: string | null;
  };
  variant?: "icon" | "default";
  className?: string;
}

const PRIORITY_OPTIONS = [
  { value: "krytyczny", label: "Krytyczny — natychmiast" },
  { value: "wysoki", label: "Wysoki — w ciągu doby" },
  { value: "średni", label: "Średni — standardowy" },
  { value: "niski", label: "Niski — przy okazji" },
];

export default function ReportDeviceFaultButton({ device, variant = "icon", className }: Props) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("wysoki");
  const [submitting, setSubmitting] = useState(false);
  const createTask = useCreateTask();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      toast({ title: "Opis usterki jest wymagany", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      // pobierz company_id obiektu
      const { data: building, error: bErr } = await supabase
        .from("buildings")
        .select("company_id")
        .eq("id", device.building_id)
        .single();
      if (bErr || !building) throw new Error("Nie udało się pobrać firmy obiektu");

      const locationInfo = device.location_in_building ? ` (${device.location_in_building})` : "";
      const serialInfo = device.serial_number ? `\nNumer seryjny: ${device.serial_number}` : "";
      const modelInfo = device.model ? `\nModel: ${device.model}` : "";

      const task = await createTask.mutateAsync({
        company_id: building.company_id,
        building_id: device.building_id,
        title: `Naprawa: ${device.name}${locationInfo}`,
        description: `Zgłoszenie usterki urządzenia: ${device.name}${locationInfo}${serialInfo}${modelInfo}\n\nOpis problemu:\n${description.trim()}`,
        type: "usterka" as any,
        priority: priority as any,
        status: "Nowe" as any,
        sla_hours: priority === "krytyczny" ? 24 : priority === "wysoki" ? 48 : 72,
        source: "device" as any,
        source_id: device.id,
      } as any);

      toast({ title: "Zgłoszenie utworzone", description: "Otwieram zadanie naprawy…" });
      setOpen(false);
      setDescription("");
      navigate(`/kanban?task=${(task as any).id}`);
    } catch (err: any) {
      toast({ title: "Błąd", description: err?.message || "Nie udało się utworzyć zgłoszenia", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {variant === "icon" ? (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={(e) => { e.stopPropagation(); setOpen(true); }}
          className={"h-7 w-7 text-warning hover:bg-warning/15 hover:text-warning " + (className || "")}
          title="Zgłoś usterkę / naprawę"
        >
          <Hammer className="h-3.5 w-3.5" />
        </Button>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setOpen(true)}
          className={"gap-2 " + (className || "")}
        >
          <Hammer className="h-3.5 w-3.5" /> Zgłoś usterkę
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" />
              Zgłoszenie usterki
            </DialogTitle>
            <DialogDescription className="text-xs">
              Urządzenie: <span className="font-semibold text-foreground">{device.name}</span>
              {device.location_in_building && <> · {device.location_in_building}</>}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <Label className="text-[11px] uppercase font-bold tracking-wider text-muted-foreground">
                Opis problemu *
              </Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="np. Brak ciśnienia w hydrancie, manometr poniżej normy"
                rows={4}
                autoFocus
              />
            </div>
            <div>
              <Label className="text-[11px] uppercase font-bold tracking-wider text-muted-foreground">
                Priorytet
              </Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Anuluj</Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Hammer className="h-4 w-4 mr-2" />}
                Utwórz zadanie naprawy
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
