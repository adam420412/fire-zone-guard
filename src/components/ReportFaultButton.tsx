import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Hammer, Loader2, AlertTriangle, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateTask } from "@/hooks/useSupabaseData";
import { useBuildingDevices } from "@/hooks/useBuildingData";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface DeviceLite {
  id: string;
  name: string;
  building_id: string;
  location_in_building?: string | null;
  serial_number?: string | null;
  model?: string | null;
}

interface Props {
  // Either pass a device (specific fault) or a building (general fault, optional device pick)
  device?: DeviceLite;
  buildingId?: string;
  variant?: "icon" | "default" | "prominent";
  className?: string;
}

const PRIORITY_OPTIONS = [
  { value: "krytyczny", label: "Krytyczny — natychmiast" },
  { value: "wysoki", label: "Wysoki — w ciągu doby" },
  { value: "średni", label: "Średni — standardowy" },
  { value: "niski", label: "Niski — przy okazji" },
];

export default function ReportFaultButton({ device, buildingId, variant = "icon", className }: Props) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("wysoki");
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>(device?.id ?? "none");
  const [deviceSearch, setDeviceSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const createTask = useCreateTask();
  const navigate = useNavigate();
  const { toast } = useToast();

  const effectiveBuildingId = device?.building_id ?? buildingId;
  const { data: devices = [] } = useBuildingDevices(effectiveBuildingId);

  const filteredDevices = useMemo(() => {
    const list = (devices as any[]) || [];
    if (!deviceSearch.trim()) return list.slice(0, 30);
    const q = deviceSearch.toLowerCase();
    return list.filter((d) =>
      d.name?.toLowerCase().includes(q) ||
      d.location_in_building?.toLowerCase().includes(q) ||
      d.serial_number?.toLowerCase().includes(q)
    ).slice(0, 30);
  }, [devices, deviceSearch]);

  const pickedDevice: DeviceLite | undefined = useMemo(() => {
    if (device) return device;
    if (selectedDeviceId === "none") return undefined;
    return (devices as any[])?.find((d) => d.id === selectedDeviceId);
  }, [device, selectedDeviceId, devices]);

  const findOnDutyAssignee = async (companyId: string): Promise<string | null> => {
    // Heuristic: pick serwisant from same company with the fewest open tasks
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, user_id")
      .eq("company_id", companyId);
    if (!profiles || profiles.length === 0) return null;

    const userIds = profiles.map((p) => p.user_id);
    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("user_id", userIds);

    const serwisantUserIds = new Set(
      (roles || []).filter((r: any) => r.role === "employee" || r.role === "inspektor").map((r: any) => r.user_id)
    );
    const candidates = profiles.filter((p) => serwisantUserIds.has(p.user_id));
    if (candidates.length === 0) return null;

    // Count open tasks per profile
    const { data: openTasks } = await supabase
      .from("tasks")
      .select("assignee_id")
      .in("assignee_id", candidates.map((c) => c.id))
      .neq("status", "Zamknięte");
    const counts = new Map<string, number>();
    candidates.forEach((c) => counts.set(c.id, 0));
    (openTasks || []).forEach((t: any) => {
      if (t.assignee_id) counts.set(t.assignee_id, (counts.get(t.assignee_id) ?? 0) + 1);
    });
    let best: string | null = null;
    let min = Infinity;
    counts.forEach((cnt, id) => { if (cnt < min) { min = cnt; best = id; } });
    return best;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      toast({ title: "Opis usterki jest wymagany", variant: "destructive" });
      return;
    }
    if (!effectiveBuildingId) {
      toast({ title: "Brak kontekstu obiektu", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const { data: building, error: bErr } = await supabase
        .from("buildings")
        .select("company_id, name")
        .eq("id", effectiveBuildingId)
        .single();
      if (bErr || !building) throw new Error("Nie udało się pobrać firmy obiektu");

      const assigneeId = await findOnDutyAssignee(building.company_id);

      const dev = pickedDevice;
      const locationInfo = dev?.location_in_building ? ` (${dev.location_in_building})` : "";
      const serialInfo = dev?.serial_number ? `\nNumer seryjny: ${dev.serial_number}` : "";
      const modelInfo = dev?.model ? `\nModel: ${dev.model}` : "";

      const title = dev
        ? `Naprawa: ${dev.name}${locationInfo}`
        : `Zgłoszenie usterki — ${building.name}`;

      const fullDescription = dev
        ? `Zgłoszenie usterki urządzenia: ${dev.name}${locationInfo}${serialInfo}${modelInfo}\n\nOpis problemu:\n${description.trim()}`
        : `Zgłoszenie usterki w obiekcie: ${building.name}\n\nOpis problemu:\n${description.trim()}`;

      const task = await createTask.mutateAsync({
        company_id: building.company_id,
        building_id: effectiveBuildingId,
        title,
        description: fullDescription,
        type: "usterka" as any,
        priority: priority as any,
        status: "Nowe" as any,
        sla_hours: priority === "krytyczny" ? 24 : priority === "wysoki" ? 48 : 72,
        source: dev ? "device" : "building" as any,
        source_id: dev?.id ?? effectiveBuildingId,
        assignee_id: assigneeId,
      } as any);

      toast({
        title: "Zgłoszenie utworzone",
        description: assigneeId ? "Przypisano dyżurnego serwisanta." : "Przydziel serwisanta w karcie zadania.",
      });
      setOpen(false);
      setDescription("");
      navigate(`/kanban?task=${(task as any).id}`);
    } catch (err: any) {
      toast({ title: "Błąd", description: err?.message || "Nie udało się utworzyć zgłoszenia", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const renderTrigger = () => {
    if (variant === "icon") {
      return (
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
      );
    }
    if (variant === "prominent") {
      return (
        <Button
          type="button"
          onClick={() => setOpen(true)}
          className={"gap-2 bg-warning text-warning-foreground hover:bg-warning/90 " + (className || "")}
        >
          <Hammer className="h-4 w-4" /> Zgłoś usterkę
        </Button>
      );
    }
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        className={"gap-2 " + (className || "")}
      >
        <Hammer className="h-3.5 w-3.5" /> Zgłoś usterkę
      </Button>
    );
  };

  return (
    <>
      {renderTrigger()}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" />
              Zgłoszenie usterki
            </DialogTitle>
            <DialogDescription className="text-xs">
              {pickedDevice ? (
                <>Urządzenie: <span className="font-semibold text-foreground">{pickedDevice.name}</span>
                  {pickedDevice.location_in_building && <> · {pickedDevice.location_in_building}</>}</>
              ) : (
                <>Zgłoszenie ogólne dla obiektu — opcjonalnie wybierz urządzenie</>
              )}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-3">
            {!device && (
              <div>
                <Label className="text-[11px] uppercase font-bold tracking-wider text-muted-foreground">
                  Urządzenie (opcjonalnie)
                </Label>
                <div className="relative mb-2">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Szukaj po nazwie, lokalizacji, S/N…"
                    value={deviceSearch}
                    onChange={(e) => setDeviceSearch(e.target.value)}
                    className="pl-8 h-9"
                  />
                </div>
                <Select value={selectedDeviceId} onValueChange={setSelectedDeviceId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Bez urządzenia (ogólne) —</SelectItem>
                    {filteredDevices.map((d: any) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}{d.location_in_building ? ` · ${d.location_in_building}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

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
            <p className="text-[11px] text-muted-foreground">
              💡 Zadanie zostanie automatycznie przypisane dyżurnemu serwisantowi (najmniej obciążonemu).
            </p>
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
