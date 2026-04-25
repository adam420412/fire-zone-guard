// MapPage — Iter 9
// Mapa wszystkich obiektow z RLS-rozsadnym filtrem (super_admin/operator widzi
// wszystko, klient — tylko swoje). Geocodowanie wsadowe przez Nominatim
// (cache w buildings.lat/lng/geocoded_at). Pinki kolorowane po safetyStatus
// albo override z buildings.map_color.
import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Link } from "react-router-dom";
import { useBuildings } from "@/hooks/useSupabaseData";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2, MapPin, Search, Sparkles, ExternalLink } from "lucide-react";

// Leaflet w bundlerze nie laduje obrazkow markerow z node_modules — patch:
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// Kolorowe pinki SVG (uciekamy od dependency leaflet-color-markers):
const colorIcon = (color: string) =>
  L.divIcon({
    className: "fire-marker",
    html: `<div style="
      width:24px;height:24px;border-radius:50% 50% 50% 0;
      background:${color};border:2px solid white;
      transform:rotate(-45deg);
      box-shadow:0 2px 6px rgba(0,0,0,0.4);
    "></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 24],
    popupAnchor: [0, -22],
  });

const STATUS_COLOR: Record<string, string> = {
  bezpieczny:  "#22c55e",
  ostrzezenie: "#f59e0b",
  ostrzeżenie: "#f59e0b",
  krytyczny:   "#ef4444",
};

// Polska — domyslny widok
const POLAND_CENTER: [number, number] = [52.0693, 19.4803];
const POLAND_ZOOM = 6;

// Helper: react-leaflet hook do auto-fit po zmianie bounds
function FitBounds({ bounds }: { bounds: L.LatLngBoundsExpression | null }) {
  const map = useMap();
  useEffect(() => {
    if (!bounds) return;
    try {
      map.fitBounds(bounds as any, { padding: [40, 40], maxZoom: 14 });
    } catch { /* ignore */ }
  }, [bounds, map]);
  return null;
}

// Geocoder Nominatim (1 req/sec rate limit; chunk z opoznieniem)
async function geocodeOne(query: string): Promise<{ lat: number; lng: number } | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { "Accept-Language": "pl" } });
  if (!res.ok) return null;
  const arr = await res.json();
  const hit = arr?.[0];
  if (!hit) return null;
  return { lat: parseFloat(hit.lat), lng: parseFloat(hit.lon) };
}

export default function MapPage() {
  const { data: buildings, isLoading, refetch } = useBuildings();
  const [search, setSearch] = useState("");
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeProgress, setGeocodeProgress] = useState({ done: 0, total: 0 });

  const list = buildings ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((b: any) =>
      String(b.name).toLowerCase().includes(q) ||
      String(b.address ?? "").toLowerCase().includes(q) ||
      String(b.city ?? "").toLowerCase().includes(q) ||
      String(b.companyName ?? "").toLowerCase().includes(q)
    );
  }, [list, search]);

  const geocoded = filtered.filter((b: any) => b.lat != null && b.lng != null);
  const missing = filtered.filter((b: any) => b.lat == null || b.lng == null);

  const bounds = useMemo<L.LatLngBoundsExpression | null>(() => {
    if (geocoded.length === 0) return null;
    return geocoded.map((b: any) => [b.lat as number, b.lng as number] as [number, number]);
  }, [geocoded]);

  const runGeocoding = async () => {
    if (missing.length === 0) {
      toast.info("Wszystkie obiekty maja juz wspolrzedne.");
      return;
    }
    setGeocoding(true);
    setGeocodeProgress({ done: 0, total: missing.length });
    let okCount = 0;
    let failCount = 0;
    try {
      for (let i = 0; i < missing.length; i++) {
        const b: any = missing[i];
        const q = [b.address, b.city, "Polska"].filter(Boolean).join(", ") || b.name;
        try {
          const hit = await geocodeOne(q);
          if (hit) {
            const { error } = await supabase.from("buildings").update({
              lat: hit.lat,
              lng: hit.lng,
              geocoded_at: new Date().toISOString(),
            } as any).eq("id", b.id);
            if (error) throw error;
            okCount++;
          } else {
            failCount++;
          }
        } catch (e) {
          failCount++;
        }
        setGeocodeProgress({ done: i + 1, total: missing.length });
        // Nominatim rate-limit: 1 req/sec
        await new Promise(r => setTimeout(r, 1100));
      }
      toast.success(`Geocodowanie: ${okCount} OK, ${failCount} nieudane.`);
      await refetch();
    } finally {
      setGeocoding(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <MapPin className="h-6 w-6 text-primary" />
            Mapa obiektow
          </h1>
          <p className="text-muted-foreground text-sm">
            {geocoded.length} z {filtered.length} obiektow zlokalizowanych. Pinki kolorowane wg statusu bezpieczenstwa.
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Szukaj obiektow..."
              className="pl-7 h-8 text-xs w-56"
            />
          </div>
          <Button size="sm" variant="outline" onClick={runGeocoding} disabled={geocoding || missing.length === 0}>
            {geocoding
              ? <><Loader2 className="mr-2 h-3 w-3 animate-spin" /> {geocodeProgress.done}/{geocodeProgress.total}</>
              : <><Sparkles className="mr-2 h-3 w-3" /> Geocoduj brakujace ({missing.length})</>}
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-4">
        <Card className="overflow-hidden">
          <div className="h-[70vh] min-h-[500px]">
            {isLoading ? (
              <div className="h-full flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <MapContainer
                center={POLAND_CENTER}
                zoom={POLAND_ZOOM}
                scrollWheelZoom
                style={{ height: "100%", width: "100%" }}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <FitBounds bounds={bounds} />
                {geocoded.map((b: any) => {
                  const color = b.map_color
                    ?? STATUS_COLOR[String(b.safetyStatus ?? "").toLowerCase()]
                    ?? "#3b82f6";
                  return (
                    <Marker
                      key={b.id}
                      position={[b.lat, b.lng]}
                      icon={colorIcon(color)}
                    >
                      <Popup>
                        <div className="text-xs space-y-1 min-w-[180px]">
                          <div className="font-semibold text-sm">{b.name}</div>
                          {b.address && <div>{b.address}</div>}
                          {b.city && <div>{b.city}</div>}
                          <div className="flex items-center gap-2 pt-1">
                            <Badge variant="outline" className="text-[10px]">{b.safetyStatus}</Badge>
                            {(b.activeTasksCount ?? 0) > 0 && (
                              <Badge variant="secondary" className="text-[10px]">
                                {b.activeTasksCount} aktywnych
                              </Badge>
                            )}
                          </div>
                          <Link
                            to={`/buildings/${b.id}`}
                            className="text-primary hover:underline text-xs flex items-center gap-1 pt-1"
                          >
                            <ExternalLink className="h-3 w-3" /> Szczegoly obiektu
                          </Link>
                        </div>
                      </Popup>
                    </Marker>
                  );
                })}
              </MapContainer>
            )}
          </div>
        </Card>

        <Card>
          <CardContent className="p-3 space-y-2 max-h-[70vh] overflow-y-auto scrollbar-thin">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Lista obiektow ({filtered.length})
              </h3>
            </div>
            {filtered.length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-6">
                Brak obiektow do wyswietlenia.
              </div>
            )}
            {filtered.map((b: any) => {
              const color = b.map_color
                ?? STATUS_COLOR[String(b.safetyStatus ?? "").toLowerCase()]
                ?? "#3b82f6";
              const located = b.lat != null && b.lng != null;
              return (
                <Link
                  key={b.id}
                  to={`/buildings/${b.id}`}
                  className="flex items-start gap-2 p-2 rounded-md hover:bg-secondary transition-colors text-xs"
                >
                  <span
                    className="mt-1 h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ background: color }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{b.name}</div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {b.city ?? b.address ?? "—"} · {b.companyName || "brak firmy"}
                    </div>
                  </div>
                  {!located && (
                    <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0">brak GPS</Badge>
                  )}
                </Link>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
