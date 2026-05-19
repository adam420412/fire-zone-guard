import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save, Trash2 } from "lucide-react";
import { useAddDevice, useUpdateDevice, useDeleteDevice, useDeviceTypes } from "@/hooks/useBuildingData";
import { toast } from "sonner";

const STATUSES = ["aktywne", "do serwisu", "uszkodzone", "wycofane"] as const;

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  buildingId: string;
  /** Names of device_types valid for this category */
  allowedTypeNames: string[];
  categoryLabel: string;
  /** Existing device to edit, or null for new */
  device?: any | null;
}

export default function DeviceFormDialog({
  open,
  onOpenChange,
  buildingId,
  allowedTypeNames,
  categoryLabel,
  device,
}: Props) {
  const { data: typesAll } = useDeviceTypes();
  const addMut = useAddDevice();
  const updateMut = useUpdateDevice();
  const deleteMut = useDeleteDevice();

  const isEdit = !!device;
  const allowedTypes = (typesAll ?? []).filter((t: any) => allowedTypeNames.includes(t.name));

  const [form, setForm] = useState({
    device_type_id: "",
    name: "",
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
    notes: "",
  });

  useEffect(() => {
    if (!open) return;
    if (device) {
      setForm({
        device_type_id: device.device_type_id ?? "",
        name: device.name ?? "",
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
        notes: device.notes ?? "",
      });
    } else {
      setForm({
        device_type_id: allowedTypes[0]?.id ?? "",
        name: "",
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
        notes: "",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, device?.id]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((s) => ({ ...s, [k]: v }));

  const handleSave = () => {
    if (!form.device_type_id) {
      toast.error("Wybierz typ urządzenia.");
      return;
    }
    if (!form.name.trim()) {
      toast.error("Podaj nazwę / oznaczenie urządzenia.");
      return;
    }

    const base: any = {
      device_type_id: form.device_type_id,
      name: form.name.trim(),
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
      notes: form.notes.trim() || null,
    };

    if (isEdit) {
      updateMut.mutate(
        { id: device.id, building_id: buildingId, updates: base },
        {
          onSuccess: () => {
            toast.success("Zaktualizowano urządzenie");
            onOpenChange(false);
          },
          onError: (e: any) => toast.error(e?.message ?? "Błąd zapisu"),
        }
      );
    } else {
      addMut.mutate(
        { building_id: buildingId, ...base },
        {
          onSuccess: () => {
            toast.success("Dodano urządzenie");
            onOpenChange(false);
          },
          onError: (e: any) => toast.error(e?.message ?? "Błąd dodawania"),
        }
      );
    }
  };

  const handleDelete = () => {
    if (!device) return;
    if (!confirm(`Usunąć urządzenie "${device.name}"?`)) return;
    deleteMut.mutate(
      { id: device.id, building_id: buildingId },
      {
        onSuccess: () => {
          toast.success("Usunięto urządzenie");
          onOpenChange(false);
        },
        onError: (e: any) => toast.error(e?.message ?? "Błąd usuwania"),
      }
    );
  };

  const pending = addMut.isPending || updateMut.isPending || deleteMut.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edytuj urządzenie" : "Nowe urządzenie"}</DialogTitle>
          <DialogDescription>Kategoria: <strong>{categoryLabel}</strong></DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Typ urządzenia *</Label>
              <Select value={form.device_type_id} onValueChange={(v) => set("device_type_id", v)}>
                <SelectTrigger><SelectValue placeholder="Wybierz typ..." /></SelectTrigger>
                <SelectContent>
                  {allowedTypes.length === 0 ? (
                    <div className="p-2 text-xs text-muted-foreground">Brak typów dla tej kategorii. Dodaj w słowniku.</div>
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
              <Label>Numer seryjny</Label>
              <Input value={form.serial_number} onChange={(e) => set("serial_number", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Rok produkcji</Label>
              <Input type="number" min={1980} max={new Date().getFullYear() + 1} value={form.production_year} onChange={(e) => set("production_year", e.target.value)} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Data instalacji</Label>
              <Input type="date" value={form.installed_at} onChange={(e) => set("installed_at", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Gwarancja do</Label>
              <Input type="date" value={form.warranty_until} onChange={(e) => set("warranty_until", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Ostatni serwis</Label>
              <Input type="date" value={form.last_service_date} onChange={(e) => set("last_service_date", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Następny serwis</Label>
              <Input type="date" value={form.next_service_date} onChange={(e) => set("next_service_date", e.target.value)} />
            </div>
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

          <div className="space-y-1.5">
            <Label>Notatki</Label>
            <Textarea rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Uwagi, defekty, historia, link do DTR..." />
          </div>
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
