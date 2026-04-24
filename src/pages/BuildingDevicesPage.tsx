// =============================================================================
// BuildingDevicesPage — Faza 5
//
// Master checklist 9 kategorii ppoż. (G/H/SSP/PWP/Oś. awar./DSO/Drzwi/Klapy/
// Oddymianie) per spec PDF (str. 2). Każda kategoria pokazuje:
//   • liczbę zainstalowanych egzemplarzy z `devices`
//   • liczbę po terminie serwisu
//   • status sugestii (z `device_requirement_rules` + buildings.area_total)
//
// Suggestion engine: po wpisaniu klasy budynku (ZL III) i powierzchni (np.
// 1500 m²) reguły zwracają wymagane kategorie + propozycję ilości z
// `quantity_formula`. Klik "Dodaj sugerowane" → wstawia N egzemplarzy
// o nazwie `<typ> #1..N` z next_service_date = +interval.
// =============================================================================
import { useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  useBuildingDetail,
  useBuildingDevices,
  useDeviceTypes,
  useBuildingDeviceSummary,
  useDeviceRequirementRules,
  useBulkAddDevices,
} from "@/hooks/useBuildingData";
import { useUpdateBuilding } from "@/hooks/useSupabaseData";
import {
  BUILDING_CLASSES,
  DEVICE_CATEGORIES,
  DEVICE_TYPE_TO_CATEGORY,
  RULE_CODE_TO_CATEGORY,
  suggestQuantityFromFormula,
} from "@/lib/constants";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  ArrowLeft, Loader2, Save, Sparkles, Package, AlertTriangle,
  CheckCircle2, ChevronDown, ChevronRight, Plus, Building2, ScrollText,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function BuildingDevicesPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { role } = useAuth();
  const isSuperAdmin = role === "super_admin";
  const { toast } = useToast();

  const buildingQ = useBuildingDetail(id ?? "");
  const devicesQ = useBuildingDevices(id ?? "");
  const summaryQ = useBuildingDeviceSummary(id ?? "");
  const typesQ = useDeviceTypes();
  const updateBuilding = useUpdateBuilding();
  const bulkAdd = useBulkAddDevices();

  // Local form state for class/area (synced with building once loaded)
  const [classDraft, setClassDraft] = useState<string | null>(null);
  const [areaDraft, setAreaDraft] = useState<string>("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const building: any = buildingQ.data;
  const buildingClass: string | null = classDraft ?? building?.building_class ?? null;
  const buildingArea: number | null = areaDraft
    ? Number(areaDraft) || null
    : building?.area_total ?? null;

  const rulesQ = useDeviceRequirementRules({
    buildingClass: buildingClass ?? undefined,
    area: buildingArea,
  });

  // ---------------------------------------------------------------------------
  // Indeksuj sumę zainstalowanych per kategoria
  // ---------------------------------------------------------------------------
  const installedByCategory = useMemo(() => {
    const map: Record<string, { installed: number; overdue: number; types: Record<string, number> }> = {};
    DEVICE_CATEGORIES.forEach((c) => {
      map[c.code] = { installed: 0, overdue: 0, types: {} };
    });
    (summaryQ.data ?? []).forEach((row) => {
      const catCode = DEVICE_TYPE_TO_CATEGORY[row.device_type_name];
      if (!catCode) return;
      const slot = map[catCode];
      if (!slot) return;
      slot.installed += Number(row.installed_count ?? 0);
      slot.overdue += Number(row.overdue_count ?? 0);
      if (row.installed_count > 0) slot.types[row.device_type_name] = Number(row.installed_count);
    });
    return map;
  }, [summaryQ.data]);

  // ---------------------------------------------------------------------------
  // Złożenie sugestii: per reguła znajdź kategorię i sprawdź czy spełniona
  // ---------------------------------------------------------------------------
  const suggestions = useMemo(() => {
    if (!rulesQ.data) return [];
    return rulesQ.data
      .map((r) => {
        const catCode = RULE_CODE_TO_CATEGORY[r.required_device_type] ?? null;
        const cat = catCode ? DEVICE_CATEGORIES.find((c) => c.code === catCode) : null;
        const installed = catCode ? installedByCategory[catCode]?.installed ?? 0 : 0;
        const suggested = suggestQuantityFromFormula(r.quantity_formula, buildingArea);
        const gap = suggested !== null ? Math.max(0, suggested - installed) : null;
        // Pierwszy device_type z kategorii — domyślny do bulk-add
        const targetType =
          cat && (typesQ.data ?? []).find((t: any) => cat.deviceTypeNames.includes(t.name));
        return {
          rule: r,
          category: cat,
          installed,
          suggested,
          gap,
          targetType,
        };
      })
      .filter((s) => s.category); // tylko reguły dla których mamy kategorię UI
  }, [rulesQ.data, installedByCategory, buildingArea, typesQ.data]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------
  const saveClassArea = () => {
    if (!building) return;
    updateBuilding.mutate(
      {
        id: building.id,
        updates: {
          building_class: classDraft ?? building.building_class ?? null,
          area_total: areaDraft ? Number(areaDraft) : building.area_total ?? null,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Zapisano dane budynku", description: "Klasa i powierzchnia odświeżone." });
          setClassDraft(null);
          setAreaDraft("");
        },
        onError: (e: any) => toast({ title: "Błąd zapisu", description: e?.message ?? "", variant: "destructive" }),
      }
    );
  };

  // ---------------------------------------------------------------------------
  // Loading / 404
  // ---------------------------------------------------------------------------
  if (buildingQ.isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!building) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Nie znaleziono budynku.</p>
        <Button variant="ghost" onClick={() => navigate("/buildings")} className="mt-4">
          <ArrowLeft className="mr-2 h-4 w-4" /> Wróć
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* ------- HEADER ------- */}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/buildings/${id}`)}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Powrót do budynku
        </Button>
        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <Building2 className="h-4 w-4" />
          <span className="font-semibold">{building.name}</span>
          <span>•</span>
          <span>{building.address || "brak adresu"}</span>
        </div>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Lista urządzeń ppoż.</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Master checklist + silnik sugestii oparty o klasę zagrożenia ludzi i powierzchnię użytkową.
        </p>
      </div>

      {/* ------- KLASA + POWIERZCHNIA ------- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" />
            Parametry budynku do silnika sugestii
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-xs uppercase">Klasa zagrożenia ludzi</Label>
            <Select
              value={classDraft ?? building.building_class ?? ""}
              onValueChange={(v) => setClassDraft(v)}
              disabled={!isSuperAdmin}
            >
              <SelectTrigger>
                <SelectValue placeholder="Wybierz klasę..." />
              </SelectTrigger>
              <SelectContent>
                {BUILDING_CLASSES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase">Powierzchnia użytkowa (m²)</Label>
            <Input
              type="number"
              min="0"
              placeholder={building.area_total ? String(building.area_total) : "np. 1500"}
              value={areaDraft}
              onChange={(e) => setAreaDraft(e.target.value)}
              disabled={!isSuperAdmin}
            />
          </div>
          <div className="flex items-end">
            <Button
              onClick={saveClassArea}
              disabled={!isSuperAdmin || updateBuilding.isPending || (!classDraft && !areaDraft)}
              className="w-full"
            >
              {updateBuilding.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Zapisz parametry
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ------- SUGESTIE ------- */}
      {buildingClass && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ScrollText className="h-4 w-4 text-warning" />
              Wymagania prawne — sugestie aplikacji
              {rulesQ.isFetching && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {suggestions.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">
                Brak reguł dla klasy <code className="font-mono">{buildingClass}</code>
                {buildingArea ? ` (${buildingArea} m²)` : ""}. Skontaktuj się z administratorem aby uzupełnić bazę reguł.
              </p>
            ) : (
              suggestions.map((s) => {
                const ok = s.gap === 0 || s.gap === null;
                return (
                  <div
                    key={s.rule.id}
                    className={cn(
                      "flex flex-col md:flex-row md:items-center gap-3 rounded-lg border p-3",
                      ok ? "border-success/30 bg-success/5" : "border-warning/40 bg-warning/5"
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {ok ? (
                        <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
                      ) : (
                        <AlertTriangle className="h-5 w-5 text-warning shrink-0" />
                      )}
                      <div className="min-w-0">
                        <div className="font-semibold text-sm flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="font-mono">{s.category!.shortLabel}</Badge>
                          <span>{s.category!.label}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {s.rule.quantity_formula ?? "—"}
                          {s.rule.legal_basis && (
                            <span className="ml-2 italic">({s.rule.legal_basis})</span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <div className="text-right">
                        <div className="font-mono text-sm">
                          {s.installed} / {s.suggested ?? "?"}
                        </div>
                        <div className="text-[10px] uppercase text-muted-foreground">
                          zainst. / wymag.
                        </div>
                      </div>
                      {!ok && s.gap !== null && s.gap > 0 && s.targetType && isSuperAdmin && (
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => {
                            bulkAdd.mutate(
                              {
                                building_id: id!,
                                device_type_id: s.targetType.id,
                                base_name: s.targetType.name,
                                quantity: s.gap!,
                              },
                              {
                                onSuccess: () =>
                                  toast({
                                    title: `Dodano ${s.gap} × ${s.targetType.name}`,
                                    description: "Sprawdź zakładkę Urządzenia.",
                                  }),
                                onError: (e: any) =>
                                  toast({
                                    title: "Błąd",
                                    description: e?.message ?? "",
                                    variant: "destructive",
                                  }),
                              }
                            );
                          }}
                          disabled={bulkAdd.isPending}
                        >
                          <Plus className="mr-1 h-3.5 w-3.5" />
                          Dodaj {s.gap}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      )}

      {/* ------- MASTER CHECKLIST ------- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Package className="h-4 w-4 text-primary" />
            Master checklist — kategorie ppoż.
            {summaryQ.isFetching && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {DEVICE_CATEGORIES.map((cat) => {
              const stats = installedByCategory[cat.code];
              const installed = stats?.installed ?? 0;
              const overdue = stats?.overdue ?? 0;
              const isExpanded = expanded[cat.code];
              const hasInstance = installed > 0;
              return (
                <div
                  key={cat.code}
                  className={cn(
                    "rounded-lg border bg-card transition-colors",
                    hasInstance ? "border-primary/30" : "border-border"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setExpanded((p) => ({ ...p, [cat.code]: !p[cat.code] }))}
                    className="w-full flex items-center gap-3 p-3 text-left"
                  >
                    <Checkbox checked={hasInstance} className="pointer-events-none" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm font-mono text-primary">{cat.shortLabel}</span>
                        <span className="text-sm font-semibold">{cat.label}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
                        {cat.description}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-bold">
                        {installed}
                        {overdue > 0 && (
                          <span className="text-warning text-xs ml-1">({overdue} po term.)</span>
                        )}
                      </div>
                      <div className="text-[10px] uppercase text-muted-foreground">egz.</div>
                    </div>
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>
                  {isExpanded && (
                    <div className="border-t px-3 py-2 space-y-2 bg-muted/20">
                      {cat.deviceTypeNames.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">
                          Brak zdefiniowanych typów urządzeń dla tej kategorii w słowniku
                          <code className="font-mono ml-1">device_types</code>.
                        </p>
                      ) : (
                        cat.deviceTypeNames.map((typeName) => {
                          const count = stats?.types[typeName] ?? 0;
                          const list = (devicesQ.data ?? []).filter(
                            (d: any) => (d as any).device_types?.name === typeName
                          );
                          return (
                            <div key={typeName} className="space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-medium">{typeName}</span>
                                <span className="font-mono text-muted-foreground">{count}</span>
                              </div>
                              {list.length > 0 && (
                                <ul className="text-[11px] text-muted-foreground pl-3 space-y-0.5">
                                  {list.slice(0, 5).map((d: any) => (
                                    <li key={d.id} className="flex items-center justify-between">
                                      <span className="truncate">
                                        {d.name}
                                        {d.location_in_building ? ` · ${d.location_in_building}` : ""}
                                      </span>
                                      {d.next_service_date && (
                                        <span
                                          className={cn(
                                            "ml-2 font-mono",
                                            new Date(d.next_service_date) <= new Date()
                                              ? "text-warning"
                                              : ""
                                          )}
                                        >
                                          {d.next_service_date}
                                        </span>
                                      )}
                                    </li>
                                  ))}
                                  {list.length > 5 && (
                                    <li className="italic">…i {list.length - 5} kolejnych</li>
                                  )}
                                </ul>
                              )}
                            </div>
                          );
                        })
                      )}
                      <Link
                        to={`/buildings/${id}`}
                        className="block text-[11px] text-primary hover:underline pt-1"
                      >
                        Otwórz pełną ewidencję urządzeń →
                      </Link>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
