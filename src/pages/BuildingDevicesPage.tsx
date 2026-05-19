// =============================================================================
// BuildingDevicesPage — Kreator 2-etapowy
//
// Etap 1 (kategorie): operator zaznacza, które kategorie urządzeń ppoż.
//   w ogóle występują w obiekcie (G/H/SSP/PWP/OŚ.AWAR./DSO/DRZWI/KLAPY/ODDYM).
//   Dla każdej można dodać krótką notatkę. Stan trzymany w
//   `building_device_categories`.
//
// Etap 2 (szczegóły): per wybrana kategoria — pełna lista urządzeń (devices)
//   z bogatym dialogiem edycji (typ, nazwa, lokalizacja, nr seryjny, model,
//   producent, daty, status, notatki).
// =============================================================================
import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  useBuildingDetail,
  useBuildingDevices,
  useBuildingDeviceSummary,
  useBuildingDeviceCategories,
  useUpsertBuildingDeviceCategory,
  useConfirmBuildingDeviceCategories,
} from "@/hooks/useBuildingData";
import {
  DEVICE_CATEGORIES,
  DEVICE_TYPE_TO_CATEGORY,
} from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  ArrowLeft, ArrowRight, Loader2, CheckCircle2, Package,
  Building2, Plus, Pencil, Wrench, AlertTriangle, Layers, ListChecks,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import DeviceFormDialog from "@/components/DeviceFormDialog";
import ReportDeviceFaultButton from "@/components/ReportDeviceFaultButton";

type Step = "categories" | "details";

export default function BuildingDevicesPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { role } = useAuth();
  const canEdit = role === "super_admin" || role === "admin";

  const [searchParams, setSearchParams] = useSearchParams();
  const step = (searchParams.get("step") as Step) || "categories";
  const activeCategory = searchParams.get("cat");

  const buildingQ = useBuildingDetail(id ?? "");
  const devicesQ = useBuildingDevices(id ?? "");
  const summaryQ = useBuildingDeviceSummary(id ?? "");
  const categoriesQ = useBuildingDeviceCategories(id ?? "");
  const upsertCat = useUpsertBuildingDeviceCategory();
  const confirmCats = useConfirmBuildingDeviceCategories();

  const [deviceDialog, setDeviceDialog] = useState<{ open: boolean; device?: any | null }>({ open: false });

  const building: any = buildingQ.data;

  // Index of categories already saved
  const catByCode = useMemo(() => {
    const map: Record<string, any> = {};
    (categoriesQ.data ?? []).forEach((r) => { map[r.category_code] = r; });
    return map;
  }, [categoriesQ.data]);

  // Devices grouped per category code
  const devicesByCategory = useMemo(() => {
    const map: Record<string, any[]> = {};
    DEVICE_CATEGORIES.forEach((c) => { map[c.code] = []; });
    (devicesQ.data ?? []).forEach((d: any) => {
      const typeName = (d as any).device_types?.name;
      const code = typeName ? DEVICE_TYPE_TO_CATEGORY[typeName] : null;
      if (code && map[code]) map[code].push(d);
    });
    return map;
  }, [devicesQ.data]);

  // Installed counts per category (from summary)
  const installedByCategory = useMemo(() => {
    const map: Record<string, { installed: number; overdue: number }> = {};
    DEVICE_CATEGORIES.forEach((c) => { map[c.code] = { installed: 0, overdue: 0 }; });
    (summaryQ.data ?? []).forEach((row) => {
      const code = DEVICE_TYPE_TO_CATEGORY[row.device_type_name];
      if (!code || !map[code]) return;
      map[code].installed += Number(row.installed_count ?? 0);
      map[code].overdue += Number(row.overdue_count ?? 0);
    });
    return map;
  }, [summaryQ.data]);

  const presentCategories = DEVICE_CATEGORIES.filter((c) => catByCode[c.code]?.is_present);

  // Auto-pick first present category when entering details step
  useEffect(() => {
    if (step === "details" && !activeCategory && presentCategories.length > 0) {
      const next = new URLSearchParams(searchParams);
      next.set("cat", presentCategories[0].code);
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, activeCategory, presentCategories.length]);

  const goToStep = (s: Step, cat?: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("step", s);
    if (cat) next.set("cat", cat); else next.delete("cat");
    setSearchParams(next, { replace: false });
  };

  const togglePresence = (code: string, present: boolean) => {
    if (!id) return;
    upsertCat.mutate(
      { building_id: id, category_code: code, is_present: present },
      { onError: (e: any) => toast.error(e?.message ?? "Błąd zapisu") }
    );
  };

  const saveCategoryNote = (code: string, notes: string) => {
    if (!id) return;
    upsertCat.mutate(
      { building_id: id, category_code: code, notes },
      { onError: (e: any) => toast.error(e?.message ?? "Błąd zapisu") }
    );
  };

  const confirmAndGo = () => {
    if (!id) return;
    const anyPresent = DEVICE_CATEGORIES.some((c) => catByCode[c.code]?.is_present);
    if (!anyPresent) {
      toast.error("Zaznacz przynajmniej jedną kategorię obecną w obiekcie.");
      return;
    }
    confirmCats.mutate(
      { building_id: id },
      {
        onSuccess: () => {
          toast.success("Inwentaryzacja kategorii zatwierdzona.");
          goToStep("details");
        },
        onError: (e: any) => toast.error(e?.message ?? "Błąd zapisu"),
      }
    );
  };

  if (buildingQ.isLoading) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }
  if (!building) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Nie znaleziono obiektu.</p>
        <Button variant="ghost" onClick={() => navigate("/buildings")} className="mt-4">
          <ArrowLeft className="mr-2 h-4 w-4" /> Wróć
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* HEADER */}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/buildings/${id}`)}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Powrót do obiektu
        </Button>
        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <Building2 className="h-4 w-4" />
          <span className="font-semibold">{building.name}</span>
          <span>•</span>
          <span>{building.address || "brak adresu"}</span>
        </div>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Ewidencja urządzeń ppoż.</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Kreator dwuetapowy — najpierw kategorie obecne w obiekcie, potem konkretne sztuki w każdej z nich.
        </p>
      </div>

      {/* STEPPER */}
      <div className="flex items-center gap-2 text-sm">
        <StepBadge active={step === "categories"} done={step === "details"} num={1} label="Kategorie urządzeń" onClick={() => goToStep("categories")} />
        <div className="flex-1 h-px bg-border" />
        <StepBadge active={step === "details"} done={false} num={2} label="Szczegóły urządzeń" disabled={presentCategories.length === 0} onClick={() => goToStep("details")} />
      </div>

      {/* STEP 1 — CATEGORIES */}
      {step === "categories" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ListChecks className="h-4 w-4 text-primary" />
              Krok 1 — zaznacz kategorie urządzeń obecne w obiekcie
              {categoriesQ.isFetching && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Zaznacz wszystkie kategorie, które fizycznie występują w obiekcie. Konkretne sztuki rozpiszesz w kroku 2.
            </p>

            <div className="grid gap-3 md:grid-cols-2">
              {DEVICE_CATEGORIES.map((cat) => {
                const row = catByCode[cat.code];
                const present = !!row?.is_present;
                const installed = installedByCategory[cat.code]?.installed ?? 0;
                return (
                  <div
                    key={cat.code}
                    className={cn(
                      "rounded-lg border bg-card p-3 transition-colors",
                      present ? "border-primary/50 ring-1 ring-primary/20" : "border-border"
                    )}
                  >
                    <label className="flex items-start gap-3 cursor-pointer">
                      <Checkbox
                        checked={present}
                        onCheckedChange={(v) => canEdit && togglePresence(cat.code, !!v)}
                        disabled={!canEdit}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="font-mono">{cat.shortLabel}</Badge>
                          <span className="font-semibold text-sm">{cat.label}</span>
                          {installed > 0 && (
                            <Badge variant="secondary" className="text-[10px]">{installed} sztuk</Badge>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{cat.description}</p>
                      </div>
                    </label>

                    {present && (
                      <div className="mt-3 pl-7">
                        <Textarea
                          placeholder="Notatka do tej kategorii (np. lokalizacje, ilości szacunkowe, charakterystyka)..."
                          rows={2}
                          className="text-xs"
                          defaultValue={row?.notes ?? ""}
                          onBlur={(e) => {
                            const v = e.target.value;
                            if (v !== (row?.notes ?? "")) saveCategoryNote(cat.code, v);
                          }}
                          disabled={!canEdit}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-border">
              <div className="text-xs text-muted-foreground">
                Zaznaczone: <strong className="text-foreground">{presentCategories.length}</strong> z {DEVICE_CATEGORIES.length}
              </div>
              <Button
                onClick={confirmAndGo}
                disabled={!canEdit || confirmCats.isPending || presentCategories.length === 0}
                className="fire-gradient"
              >
                {confirmCats.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                Zatwierdź i przejdź do szczegółów
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 2 — DETAILS */}
      {step === "details" && (
        presentCategories.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center space-y-3">
              <AlertTriangle className="h-10 w-10 mx-auto text-warning" />
              <p className="text-sm text-muted-foreground">Najpierw zaznacz kategorie obecne w obiekcie.</p>
              <Button onClick={() => goToStep("categories")} variant="outline"><ArrowLeft className="h-4 w-4 mr-1" /> Wróć do kroku 1</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
            {/* SIDEBAR */}
            <Card className="h-fit">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Layers className="h-4 w-4 text-primary" />
                  Kategorie ({presentCategories.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {presentCategories.map((cat) => {
                  const stats = installedByCategory[cat.code];
                  const isActive = activeCategory === cat.code;
                  return (
                    <button
                      key={cat.code}
                      onClick={() => goToStep("details", cat.code)}
                      className={cn(
                        "w-full flex items-center gap-2 px-2 py-2 rounded-md text-left text-sm transition-colors",
                        isActive ? "bg-primary/15 text-primary font-semibold" : "hover:bg-secondary text-foreground"
                      )}
                    >
                      <span className="font-mono text-xs w-12 shrink-0">{cat.shortLabel}</span>
                      <span className="flex-1 truncate">{cat.label}</span>
                      <Badge variant={isActive ? "default" : "secondary"} className="text-[10px]">
                        {stats?.installed ?? 0}
                      </Badge>
                    </button>
                  );
                })}
                <div className="pt-2 border-t border-border mt-2">
                  <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => goToStep("categories")}>
                    <Pencil className="h-3.5 w-3.5 mr-1" /> Edytuj listę kategorii
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* MAIN: devices in active category */}
            <CategoryDevicesPanel
              buildingId={id!}
              categoryCode={activeCategory ?? presentCategories[0].code}
              devicesByCategory={devicesByCategory}
              installedByCategory={installedByCategory}
              categoryNote={activeCategory ? catByCode[activeCategory]?.notes ?? null : null}
              canEdit={canEdit}
              onAdd={() => setDeviceDialog({ open: true, device: null })}
              onEdit={(d) => setDeviceDialog({ open: true, device: d })}
            />
          </div>
        )
      )}

      {/* DEVICE FORM DIALOG */}
      {activeCategory && (() => {
        const cat = DEVICE_CATEGORIES.find((c) => c.code === activeCategory);
        return cat ? (
          <DeviceFormDialog
            open={deviceDialog.open}
            onOpenChange={(o) => setDeviceDialog({ open: o, device: o ? deviceDialog.device : null })}
            buildingId={id!}
            allowedTypeNames={cat.deviceTypeNames}
            categoryLabel={`${cat.shortLabel} — ${cat.label}`}
            device={deviceDialog.device}
          />
        ) : null;
      })()}
    </div>
  );
}

// ---------- Helpers ----------

function StepBadge({
  active, done, num, label, onClick, disabled,
}: { active: boolean; done: boolean; num: number; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
        active ? "bg-primary text-primary-foreground" :
        done ? "bg-success/15 text-success" :
        "bg-secondary text-muted-foreground hover:text-foreground",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      <span className={cn("h-5 w-5 rounded-full flex items-center justify-center text-xs font-bold",
        active ? "bg-primary-foreground text-primary" :
        done ? "bg-success text-success-foreground" :
        "bg-background border border-border"
      )}>
        {done ? <CheckCircle2 className="h-3 w-3" /> : num}
      </span>
      {label}
    </button>
  );
}

function CategoryDevicesPanel({
  buildingId, categoryCode, devicesByCategory, installedByCategory, categoryNote, canEdit, onAdd, onEdit,
}: {
  buildingId: string;
  categoryCode: string;
  devicesByCategory: Record<string, any[]>;
  installedByCategory: Record<string, { installed: number; overdue: number }>;
  categoryNote: string | null;
  canEdit: boolean;
  onAdd: () => void;
  onEdit: (d: any) => void;
}) {
  const cat = DEVICE_CATEGORIES.find((c) => c.code === categoryCode);
  if (!cat) return null;
  const list = devicesByCategory[categoryCode] ?? [];
  const stats = installedByCategory[categoryCode];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Package className="h-4 w-4 text-primary" />
              <Badge variant="outline" className="font-mono">{cat.shortLabel}</Badge>
              {cat.label}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">{cat.description}</p>
            {categoryNote && (
              <p className="text-xs mt-2 italic text-muted-foreground border-l-2 border-primary/40 pl-2">
                {categoryNote}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="text-right">
              <div className="text-2xl font-bold">{stats?.installed ?? 0}</div>
              <div className="text-[10px] uppercase text-muted-foreground">egzemplarzy</div>
              {(stats?.overdue ?? 0) > 0 && (
                <Badge variant="destructive" className="mt-1 text-[10px]">{stats!.overdue} po term.</Badge>
              )}
            </div>
            {canEdit && (
              <Button onClick={onAdd} size="sm" className="fire-gradient">
                <Plus className="h-4 w-4 mr-1" /> Dodaj urządzenie
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {list.length === 0 ? (
          <div className="py-10 text-center space-y-3 border-2 border-dashed border-border rounded-lg">
            <Package className="h-10 w-10 mx-auto text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">Brak rozpisanych urządzeń w tej kategorii</p>
            {canEdit && (
              <Button onClick={onAdd} variant="outline" size="sm">
                <Plus className="h-4 w-4 mr-1" /> Dodaj pierwsze urządzenie
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {list.map((d: any) => {
              const overdue = d.next_service_date && new Date(d.next_service_date) < new Date();
              return (
                <div
                  key={d.id}
                  className={cn(
                    "flex items-start gap-3 rounded-lg border p-3 transition-colors",
                    overdue ? "border-warning/40 bg-warning/5" : "border-border bg-card hover:bg-secondary/30"
                  )}
                >
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{d.name}</span>
                      {d.quantity > 1 && <Badge variant="secondary" className="text-[10px]">×{d.quantity}</Badge>}
                      <Badge variant="outline" className="text-[10px]">{(d as any).device_types?.name ?? "?"}</Badge>
                      {d.status && d.status !== "aktywne" && (
                        <Badge variant={d.status === "uszkodzone" ? "destructive" : "secondary"} className="text-[10px]">{d.status}</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                      {d.location_in_building && <span>📍 {d.location_in_building}</span>}
                      {d.serial_number && <span>S/N: <code className="font-mono">{d.serial_number}</code></span>}
                      {d.manufacturer && <span>{d.manufacturer}{d.model ? ` ${d.model}` : ""}</span>}
                    </div>
                    {d.next_service_date && (
                      <div className={cn("text-xs flex items-center gap-1", overdue && "text-warning font-semibold")}>
                        <Wrench className="h-3 w-3" />
                        Następny serwis: {d.next_service_date}
                      </div>
                    )}
                    {d.notes && (
                      <p className="text-xs text-muted-foreground italic mt-1 line-clamp-2">{d.notes}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {canEdit && (
                      <Button size="sm" variant="ghost" onClick={() => onEdit(d)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <ReportDeviceFaultButton
                      device={{
                        id: d.id,
                        name: d.name,
                        building_id: d.building_id ?? buildingId,
                        location_in_building: d.location_in_building,
                        serial_number: d.serial_number,
                        model: d.model,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
