import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save, Trash2, Upload, ImageIcon, X, ListPlus } from "lucide-react";
import { useAddDevice, useUpdateDevice, useDeleteDevice, useDeviceTypes } from "@/hooks/useBuildingData";
import { useProfiles, useCreateTask } from "@/hooks/useSupabaseData";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import DeviceHistoryPanel from "./DeviceHistoryPanel";

const STATUSES = ["aktywne", "do serwisu", "uszkodzone", "wycofane"] as const;
const UNASSIGNED = "__none__";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  buildingId: string;
  allowedTypeNames: string[];
  categoryLabel: string;
  device?: any | null;
}

export default function DeviceFormDialog({
  open, onOpenChange, buildingId, allowedTypeNames, categoryLabel, device,
}: Props) {
  const { data: typesAll } = useDeviceTypes();
  const { data: profiles } = useProfiles();
  const addMut = useAddDevice();
  const updateMut = useUpdateDevice();
  const deleteMut = useDeleteDevice();
  const createTask = useCreateTask();
  const qc = useQueryClient();

  const isEdit = !!device;
  const allowedTypes = (typesAll ?? []).filter((t: any) => allowedTypeNames.includes(t.name));

  const [form, setForm] = useState({
    device_type_id: "",
    name: "",
    inventory_number: "",
    quantity: 1,
    location_in_building: "",
    serial_number: "",
    manufacturer: "",
    model: "",
    production_year: "",
    installed_at: "",
    last_service_date: "",
    next_service_date: "",
    warranty_until: "",
    status: "aktywne",
    assigned_to: UNASSIGNED,
    photo_url: "" as string,
    notes: "",
  });
  const [uploading, setUploading] = useState(false);
  const [creatingTask, setCreatingTask] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (device) {
      setForm({
        device_type_id: device.device_type_id ?? "",
        name: device.name ?? "",
        inventory_number: device.inventory_number ?? "",
        quantity: device.quantity ?? 1,
        location_in_building: device.location_in_building ?? "",
        serial_number: device.serial_number ?? "",
        manufacturer: device.manufacturer ?? "",
        model: device.model ?? "",
        production_year: device.production_year ? String(device.production_year) : "",
        installed_at: device.installed_at ?? "",
        last_service_date: device.last_service_date ?? "",
        next_service_date: device.next_service_date ?? "",
        warranty_until: device.warranty_until ?? "",
        status: device.status ?? "aktywne",
        assigned_to: device.assigned_to ?? UNASSIGNED,
        photo_url: device.photo_url ?? "",
        notes: device.notes ?? "",
      });
    } else {
      setForm({
        device_type_id: allowedTypes[0]?.id ?? "",
        name: "",
        inventory_number: "",
        quantity: 1,
        location_in_building: "",
        serial_number: "",
        manufacturer: "",
        model: "",
        production_year: "",
        installed_at: "",
        last_service_date: "",
        next_service_date: "",
        warranty_until: "",
        status: "aktywne",
        assigned_to: UNASSIGNED,
        photo_url: "",
        notes: "",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, device?.id]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((s) => ({ ...s, [k]: v }));

  const handlePhotoUpload = async (file: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${buildingId}/${device?.id ?? "new"}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("device-photos").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from("device-photos").getPublicUrl(path);
      set("photo_url", data.publicUrl);
      toast.success("Zdjęcie wgrane");
    } catch (e: any) {
      toast.error(e?.message ?? "Błąd wgrywania zdjęcia");
    } finally {
      setUploading(false);
    }
  };

  const buildPayload = () => ({
    device_type_id: form.device_type_id,
    name: form.name.trim(),
    inventory_number: form.inventory_number.trim() || null,
    quantity: Math.max(1, Number(form.quantity) || 1),
    location_in_building: form.location_in_building.trim() || null,
    serial_number: form.serial_number.trim() || null,
    manufacturer: form.manufacturer.trim() || null,
    model: form.model.trim() || null,
    production_year: form.production_year ? Number(form.production_year) : null,
    installed_at: form.installed_at || null,
    last_service_date: form.last_service_date || null,
    next_service_date: form.next_service_date || null,
    warranty_until: form.warranty_until || null,
    status: form.status,
    assigned_to: form.assigned_to !== UNASSIGNED ? form.assigned_to : null,
    photo_url: form.photo_url || null,
    notes: form.notes.trim() || null,
  });

  const handleSave = () => {
    if (!form.device_type_id) { toast.error("Wybierz typ urządzenia."); return; }
    if (!form.name.trim()) { toast.error("Podaj nazwę / oznaczenie urządzenia."); return; }
    const base = buildPayload();
    if (isEdit) {
      updateMut.mutate(
        { id: device.id, building_id: buildingId, updates: base },
        { onSuccess: () => { toast.success("Zaktualizowano urządzenie"); onOpenChange(false); },
          onError: (e: any) => toast.error(e?.message ?? "Błąd zapisu") }
      );
    } else {
      addMut.mutate(
        { building_id: buildingId, ...base },
        { onSuccess: () => { toast.success("Dodano urządzenie"); onOpenChange(false); },
          onError: (e: any) => toast.error(e?.message ?? "Błąd dodawania") }
      );
    }
  };

  const handleDelete = () => {
    if (!device) return;
    if (!confirm(`Usunąć urządzenie "${device.name}"?`)) return;
    deleteMut.mutate(
      { id: device.id, building_id: buildingId },
      { onSuccess: () => { toast.success("Usunięto urządzenie"); onOpenChange(false); },
        onError: (e: any) => toast.error(e?.message ?? "Błąd usuwania") }
    );
  };

  // "Utwórz zadanie serwisowe" — używa next_service_date jako deadline'a; przydziela
  // wybraną osobę. Wykonanie może być wcześniejsze niż termin.
  const handleCreateTask = async () => {
    if (!form.next_service_date) {
      toast.error("Ustaw najpierw datę następnego serwisu.");
      return;
    }
    setCreatingTask(true);
    try {
      const { data: b, error: bErr } = await supabase
        .from("buildings").select("company_id").eq("id", buildingId).single();
      if (bErr) throw bErr;
      const label = [form.inventory_number, form.name].filter(Boolean).join(" • ") || "urządzenie";
      const assigneeId = form.assigned_to !== UNASSIGNED ? form.assigned_to : null;
      await createTask.mutateAsync({
        company_id: b.company_id,
        building_id: buildingId,
        type: "serwis" as any,
        title: `Serwis: ${label}`,
        description: [
          form.location_in_building ? `Lokalizacja: ${form.location_in_building}` : null,
          form.serial_number ? `S/N: ${form.serial_number}` : null,
          form.inventory_number ? `Nr ewidencyjny: ${form.inventory_number}` : null,
          `Termin maksymalny: ${form.next_service_date} (wykonanie może być wcześniejsze).`,
        ].filter(Boolean).join("\n"),
        priority: "średni" as any,
        status: "Nowe" as any,
        deadline: new Date(form.next_service_date + "T17:00:00").toISOString(),
        assignee_id: assigneeId,
        sla_hours: 72,
        source: "service",
        source_id: device?.id ?? null,
      });
      toast.success("Zadanie serwisowe utworzone — widoczne w ewidencji urządzenia");
      qc.invalidateQueries({ queryKey: ["device-service-tasks"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Błąd tworzenia zadania");
    } finally {
      setCreatingTask(false);
    }
  };

  const pending = addMut.isPending || updateMut.isPending || deleteMut.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edytuj urządzenie" : "Nowe urządzenie"}</DialogTitle>
          <DialogDescription>Kategoria: <strong>{categoryLabel}</strong></DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* PHOTO */}
          <div className="rounded-lg border border-border p-3 bg-secondary/20">
            <Label className="text-xs uppercase tracking-wide">Zdjęcie urządzenia</Label>
            <div className="mt-2 flex items-center gap-3">
              {form.photo_url ? (
                <div className="relative">
                  <img src={form.photo_url} alt="device" className="h-24 w-24 object-cover rounded border border-border" />
                  <button
                    type="button"
                    onClick={() => set("photo_url", "")}
                    className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-0.5"
                    title="Usuń zdjęcie"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <div className="h-24 w-24 rounded border-2 border-dashed border-border flex items-center justify-center text-muted-foreground">
                  <ImageIcon className="h-8 w-8" />
                </div>
              )}
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handlePhotoUpload(e.target.files[0])}
                />
                <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card hover:bg-secondary px-3 py-2 text-xs font-semibold">
                  {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  {form.photo_url ? "Zmień zdjęcie" : "Dodaj zdjęcie"}
                </span>
              </label>
            </div>
          </div>

          {/* IDENTYFIKACJA */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Typ urządzenia *</Label>
              <Select value={form.device_type_id} onValueChange={(v) => set("device_type_id", v)}>
                <SelectTrigger><SelectValue placeholder="Wybierz typ..." /></SelectTrigger>
                <SelectContent>
                  {allowedTypes.length === 0 ? (
                    <div className="p-2 text-xs text-muted-foreground">Brak typów dla tej kategorii.</div>
                  ) : allowedTypes.map((t: any) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Nazwa / oznaczenie *</Label>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="np. Gaśnica G-1" />
            </div>
            <div className="space-y-1.5">
              <Label>Numer ewidencyjny</Label>
              <Input
                value={form.inventory_number}
                onChange={(e) => set("inventory_number", e.target.value)}
                placeholder="np. G-001/2024"
                className="font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Numer seryjny</Label>
              <Input value={form.serial_number} onChange={(e) => set("serial_number", e.target.value)} className="font-mono" />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Ilość</Label>
              <Input type="number" min={1} value={form.quantity} onChange={(e) => set("quantity", Number(e.target.value))} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Lokalizacja w obiekcie</Label>
              <Input value={form.location_in_building} onChange={(e) => set("location_in_building", e.target.value)} placeholder="np. Klatka B, parter, przy windzie" />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Producent</Label>
              <Input value={form.manufacturer} onChange={(e) => set("manufacturer", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Model</Label>
              <Input value={form.model} onChange={(e) => set("model", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Rok produkcji</Label>
              <Input type="number" min={1980} max={new Date().getFullYear() + 1} value={form.production_year} onChange={(e) => set("production_year", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => set("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* TERMINY + ODPOWIEDZIALNY */}
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-3">
            <Label className="text-xs uppercase tracking-wide text-primary">Serwis i odpowiedzialność</Label>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Data instalacji</Label>
                <Input type="date" value={form.installed_at} onChange={(e) => set("installed_at", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Gwarancja do</Label>
                <Input type="date" value={form.warranty_until} onChange={(e) => set("warranty_until", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Ostatni serwis</Label>
                <Input type="date" value={form.last_service_date} onChange={(e) => set("last_service_date", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Następny serwis (termin)</Label>
                <Input type="date" value={form.next_service_date} onChange={(e) => set("next_service_date", e.target.value)} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs">Osoba odpowiedzialna</Label>
                <Select value={form.assigned_to} onValueChange={(v) => set("assigned_to", v)}>
                  <SelectTrigger><SelectValue placeholder="Wybierz osobę…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNASSIGNED}>— nieprzypisane —</SelectItem>
                    {(profiles ?? []).map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>{p.name ?? p.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-start gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCreateTask}
                disabled={creatingTask || !form.next_service_date}
                className="border-primary/50"
                title="Tworzy zadanie z terminem = data następnego serwisu. Wykonanie może być wcześniejsze."
              >
                {creatingTask ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <ListPlus className="h-3.5 w-3.5 mr-1" />}
                Utwórz zadanie z terminu serwisu
              </Button>
              <p className="text-[10px] text-muted-foreground pt-1.5">
                Termin = data następnego serwisu. Osoba odpowiedzialna trafi jako wykonawca. Wykonanie może być wcześniejsze.
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Notatki</Label>
            <Textarea rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Uwagi, defekty, historia, link do DTR..." />
          </div>

          {isEdit && device?.id && <DeviceHistoryPanel deviceId={device.id} />}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {isEdit && (
            <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={handleDelete} disabled={pending}>
              <Trash2 className="h-4 w-4 mr-1" /> Usuń
            </Button>
          )}
          <div className="flex-1" />
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Anuluj</Button>
          <Button onClick={handleSave} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
            {isEdit ? "Zapisz zmiany" : "Dodaj urządzenie"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
