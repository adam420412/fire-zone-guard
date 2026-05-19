import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { History, Loader2 } from "lucide-react";
import { formatRelative } from "@/lib/relativeTime";

const FIELD_LABELS: Record<string, string> = {
  created: "Utworzono urządzenie",
  next_service_date: "Termin następnego serwisu",
  last_service_date: "Data ostatniego serwisu",
  assigned_to: "Osoba odpowiedzialna",
  inventory_number: "Numer ewidencyjny",
  serial_number: "Numer seryjny",
  status: "Status",
  photo_url: "Zdjęcie",
  location_in_building: "Lokalizacja w obiekcie",
};

function fmt(field: string, value: string | null) {
  if (!value) return <span className="text-muted-foreground italic">— brak —</span>;
  if (field === "photo_url") {
    return <a href={value} target="_blank" rel="noreferrer" className="underline text-primary">zdjęcie</a>;
  }
  return <span className="font-mono text-xs">{value}</span>;
}

export default function DeviceHistoryPanel({ deviceId }: { deviceId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["device-history", deviceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("device_history" as any)
        .select("*")
        .eq("device_id", deviceId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as any[];
    },
    enabled: !!deviceId,
  });

  return (
    <div className="rounded-lg border border-border p-3 bg-secondary/20">
      <div className="flex items-center gap-2 mb-2">
        <History className="h-4 w-4 text-primary" />
        <span className="text-xs uppercase tracking-wide font-semibold">Historia zmian</span>
      </div>
      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-3">
          <Loader2 className="h-3 w-3 animate-spin" /> Wczytywanie…
        </div>
      ) : !data || data.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">Brak zmian.</p>
      ) : (
        <ol className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {data.map((h) => (
            <li key={h.id} className="text-xs border-l-2 border-primary/40 pl-2">
              <div className="flex items-center justify-between gap-2">
                <strong className="text-foreground">{FIELD_LABELS[h.field_name] ?? h.field_name}</strong>
                <span className="text-muted-foreground whitespace-nowrap">{formatRelativeTime(h.created_at)}</span>
              </div>
              {h.field_name !== "created" && (
                <div className="mt-0.5 text-muted-foreground">
                  {fmt(h.field_name, h.old_value)} → {fmt(h.field_name, h.new_value)}
                </div>
              )}
              <div className="text-[10px] text-muted-foreground mt-0.5">
                {h.changed_by_name ?? "system"} • {new Date(h.created_at).toLocaleString("pl-PL")}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
