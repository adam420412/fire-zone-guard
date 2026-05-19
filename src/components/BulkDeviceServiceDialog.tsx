// =============================================================================
// BulkDeviceServiceDialog
// Grupowa aktualizacja dat serwisów dla wielu urządzeń jednocześnie.
// Firma serwisowa odwiedza obiekt raz i serwisuje całą kategorię — więc daty
// muszą dać się ustawić jednym ruchem.
//
// Aktualizuje pola: last_service_date, next_service_date, status (opcjonalnie),
// oraz wpisuje do device_services historię (po jednym wpisie na urządzenie).
// =============================================================================
import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Wrench } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  buildingId: string;
  categoryLabel: string;
  deviceIds: string[];
  /** Default service interval (months) hint, used to suggest next service date. */
  defaultIntervalMonths?: number;
}

function addMonths(dateIso: string, months: number): string {
  const d = new Date(dateIso);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

export default function BulkDeviceServiceDialog({
  open, onOpenChange, buildingId, categoryLabel, deviceIds, defaultIntervalMonths = 12,
}: Props) {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);

  const [performedAt, setPerformedAt] = useState(today);
  const [intervalMonths, setIntervalMonths] = useState<number>(defaultIntervalMonths);
  const [nextServiceDate, setNextServiceDate] = useState(addMonths(today, defaultIntervalMonths));
  const [updateStatus, setUpdateStatus] = useState(false);
  const [status, setStatus] = useState("aktywne");
  const [logHistory, setLogHistory] = useState(true);
  const [notes, setNotes] = useState("");
  const [result, setResult] = useState<"sprawny" | "uszkodzony" | "wymieniony">("sprawny");

  // Recompute next date when interval or performed_at changes
  useEffect(() => {
    if (performedAt && intervalMonths > 0) {
      setNextServiceDate(addMonths(performedAt, intervalMonths));
    }
  }, [performedAt, intervalMonths]);

  // Reset when reopening
  useEffect(() => {
    if (open) {
      setPerformedAt(today);
      setIntervalMonths(defaultIntervalMonths);
      setNextServiceDate(addMonths(today, defaultIntervalMonths));
      setUpdateStatus(false);
      setStatus("aktywne");
      setLogHistory(true);
      setNotes("");
      setResult("sprawny");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const m = useMutation({
    mutationFn: async () => {
      if (deviceIds.length === 0) throw new Error("Nie wybrano żadnego urządzenia.");

      const updates: Record<string, any> = {
        last_service_date: performedAt,
        next_service_date: nextServiceDate || null,
      };
      if (updateStatus) updates.status = status;

      const { error: upErr } = await supabase
        .from("devices")
        .update(updates)
        .in("id", deviceIds);
      if (upErr) throw upErr;

      if (logHistory) {
        const { data: u } = await supabase.auth.getUser();
        const rows = deviceIds.map((id) => ({
          device_id: id,
          performed_at: performedAt,
          performed_by: u?.user?.id ?? null,
          result,
          notes: notes || "",
          next_service_date: nextServiceDate || null,
        }));
        const { error: hErr } = await supabase.from("device_services").insert(rows);
        if (hErr) throw hErr;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["devices", buildingId] });
      qc.invalidateQueries({ queryKey: ["building_device_summary", buildingId] });
      toast.success(`Zaktualizowano ${deviceIds.length} urządz.`);
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Błąd zapisu"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-primary" />
            Grupowy serwis urządzeń
          </DialogTitle>
          <DialogDescription>
            Kategoria: <Badge variant="outline" className="ml-1">{categoryLabel}</Badge>
            <span className="ml-2">— ustaw daty serwisu dla <strong>{deviceIds.length}</strong> egzemplarzy jednym ruchem.</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="performed_at" className="text-xs">Data wykonania serwisu *</Label>
              <Input
                id="performed_at"
                type="date"
                value={performedAt}
                onChange={(e) => setPerformedAt(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="interval" className="text-xs">Interwał kolejnego (mies.)</Label>
              <Input
                id="interval"
                type="number"
                min={0}
                value={intervalMonths}
                onChange={(e) => setIntervalMonths(Number(e.target.value) || 0)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="next" className="text-xs">Data kolejnego serwisu</Label>
            <Input
              id="next"
              type="date"
              value={nextServiceDate}
              onChange={(e) => setNextServiceDate(e.target.value)}
            />
            <p className="text-[10px] text-muted-foreground">
              Wyliczana automatycznie z interwału — możesz nadpisać.
            </p>
          </div>

          <div className="rounded-md border p-3 space-y-3 bg-secondary/30">
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={updateStatus} onCheckedChange={(v) => setUpdateStatus(!!v)} />
              <span className="text-sm">Zmień status wszystkich urządzeń</span>
            </label>
            {updateStatus && (
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="aktywne">aktywne</SelectItem>
                  <SelectItem value="uszkodzone">uszkodzone</SelectItem>
                  <SelectItem value="wycofane">wycofane</SelectItem>
                  <SelectItem value="serwis">w serwisie</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="rounded-md border p-3 space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={logHistory} onCheckedChange={(v) => setLogHistory(!!v)} />
              <span className="text-sm">Dopisz wpis do historii serwisów</span>
            </label>
            {logHistory && (
              <div className="space-y-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Wynik</Label>
                  <Select value={result} onValueChange={(v: any) => setResult(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sprawny">sprawny</SelectItem>
                      <SelectItem value="uszkodzony">uszkodzony</SelectItem>
                      <SelectItem value="wymieniony">wymieniony</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="notes" className="text-xs">Notatka wspólna</Label>
                  <Textarea
                    id="notes"
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Np. przegląd okresowy całej kategorii…"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={m.isPending}>Anuluj</Button>
          <Button
            className="fire-gradient"
            onClick={() => m.mutate()}
            disabled={m.isPending || deviceIds.length === 0}
          >
            {m.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Wrench className="h-4 w-4 mr-1" />}
            Zapisz dla {deviceIds.length} urządz.
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
