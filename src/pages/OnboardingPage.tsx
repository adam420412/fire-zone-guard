// OnboardingPage — wizard krok-po-kroku dla nowego klienta:
// 1. Powitanie
// 2. Firma (NIP lookup z Białej Listy + KRS, lub ręcznie)
// 3. Obiekt (budynek)
// 4. Urządzenia ppoż. (szybki add inline + skrót do bulk import)
// 5. Pracownicy (imię, email, stanowisko)
// Korzysta z istniejących hooków useCreateCompany / useCreateBuilding
// i bezpośrednio z supabase dla devices i employee_development_plans.
import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  CheckCircle2, Building2, MapPin, Wrench, Users, Sparkles,
  ArrowRight, ArrowLeft, Loader2, Search, Plus, Trash2, Rocket, Upload,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useCreateCompany, useCreateBuilding } from "@/hooks/useSupabaseData";
import { fetchCompanyByNIP, validateNip } from "@/lib/nipLookup";
import { supabase } from "@/integrations/supabase/client";

type StepId = "welcome" | "company" | "building" | "devices" | "employees" | "done";

const STEPS: { id: StepId; title: string; icon: any }[] = [
  { id: "welcome",   title: "Start",        icon: Sparkles },
  { id: "company",   title: "Firma",        icon: Building2 },
  { id: "building",  title: "Obiekt",       icon: MapPin },
  { id: "devices",   title: "Urządzenia",   icon: Wrench },
  { id: "employees", title: "Pracownicy",   icon: Users },
  { id: "done",      title: "Gotowe",       icon: Rocket },
];

interface DeviceRow {
  device_type_id: string;
  name: string;
  location_in_building: string;
  serial_number: string;
}
interface EmployeeRow {
  first_name: string;
  last_name: string;
  email: string;
  position: string;
}

export default function OnboardingPage() {
  const navigate = useNavigate();
  const [stepIdx, setStepIdx] = useState(0);
  const step = STEPS[stepIdx].id;

  // Company state
  const [nip, setNip] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [nipLoading, setNipLoading] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);

  // Building state
  const [buildingName, setBuildingName] = useState("");
  const [buildingAddress, setBuildingAddress] = useState("");
  const [buildingId, setBuildingId] = useState<string | null>(null);

  // Device types
  const [deviceTypes, setDeviceTypes] = useState<{ id: string; name: string }[]>([]);
  const [devices, setDevices] = useState<DeviceRow[]>([
    { device_type_id: "", name: "", location_in_building: "", serial_number: "" },
  ]);
  const [devicesSaved, setDevicesSaved] = useState(0);

  // Employees
  const [employees, setEmployees] = useState<EmployeeRow[]>([
    { first_name: "", last_name: "", email: "", position: "Serwisant" },
  ]);
  const [employeesSaved, setEmployeesSaved] = useState(0);

  const [submitting, setSubmitting] = useState(false);

  const createCompany = useCreateCompany();
  const createBuilding = useCreateBuilding();

  const progress = Math.round((stepIdx / (STEPS.length - 1)) * 100);

  // ── NIP lookup ─────────────────────────────────────────────
  const handleNipLookup = async () => {
    const v = validateNip(nip);
    if (!v.ok) { toast.error((v as { ok: false; reason: string }).reason); return; }
    setNipLoading(true);
    try {
      const result = await fetchCompanyByNIP(nip);
      setCompanyName(result.name);
      setCompanyAddress(result.address);
      toast.success(`Znaleziono: ${result.name}`);
    } catch (e: any) {
      toast.error(e.message || "Nie udało się pobrać danych z Białej Listy");
    } finally {
      setNipLoading(false);
    }
  };

  // ── Step 2: create company ────────────────────────────────
  const handleSaveCompany = async () => {
    if (!companyName.trim()) { toast.error("Podaj nazwę firmy"); return; }
    setSubmitting(true);
    try {
      const c = await createCompany.mutateAsync({
        name: companyName.trim(),
        nip: nip.replace(/\D/g, "") || undefined,
        address: companyAddress || undefined,
      });
      setCompanyId(c.id);
      toast.success("Firma utworzona");
      setStepIdx(stepIdx + 1);
    } catch (e: any) {
      toast.error(e.message || "Błąd zapisu firmy");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Step 3: create building ───────────────────────────────
  const handleSaveBuilding = async () => {
    if (!companyId) { toast.error("Brak firmy"); return; }
    if (!buildingName.trim()) { toast.error("Podaj nazwę obiektu"); return; }
    setSubmitting(true);
    try {
      const b = await createBuilding.mutateAsync({
        name: buildingName.trim(),
        address: buildingAddress.trim() || "",
        company_id: companyId,
      } as any);
      setBuildingId(b.id);
      toast.success("Obiekt dodany");
      // Pre-load device types for next step
      const { data: types } = await supabase.from("device_types").select("id, name").order("name");
      setDeviceTypes(types ?? []);
      setStepIdx(stepIdx + 1);
    } catch (e: any) {
      toast.error(e.message || "Błąd zapisu obiektu");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Step 4: save devices ──────────────────────────────────
  const handleSaveDevices = async () => {
    if (!buildingId) { toast.error("Brak obiektu"); return; }
    const valid = devices.filter(d => d.device_type_id && d.name.trim());
    if (valid.length === 0) {
      // Allow skip
      toast.info("Pominięto dodawanie urządzeń — możesz je zaimportować później");
      setStepIdx(stepIdx + 1);
      return;
    }
    setSubmitting(true);
    try {
      const rows = valid.map(d => ({
        building_id: buildingId,
        device_type_id: d.device_type_id,
        name: d.name.trim(),
        location_in_building: d.location_in_building.trim() || "",
        serial_number: d.serial_number.trim() || "",
        status: "aktywne",
      }));
      const { error } = await supabase.from("devices").insert(rows as any);
      if (error) throw error;
      setDevicesSaved(rows.length);
      toast.success(`Dodano ${rows.length} urządzeń`);
      setStepIdx(stepIdx + 1);
    } catch (e: any) {
      toast.error(e.message || "Błąd zapisu urządzeń");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Step 5: save employees ────────────────────────────────
  const handleSaveEmployees = async () => {
    if (!companyId) { toast.error("Brak firmy"); return; }
    const valid = employees.filter(e => e.first_name.trim() && e.email.trim());
    if (valid.length === 0) {
      toast.info("Pominięto dodawanie pracowników");
      setStepIdx(stepIdx + 1);
      return;
    }
    setSubmitting(true);
    try {
      const rows = valid.map(e => ({
        company_id: companyId,
        building_id: buildingId,
        first_name: e.first_name.trim(),
        last_name: e.last_name.trim() || "",
        email: e.email.trim(),
        position: e.position || "Serwisant",
        status: "aktywny",
        is_active: true,
      }));
      const { error } = await supabase.from("employee_development_plans").insert(rows as any);
      if (error) throw error;
      setEmployeesSaved(rows.length);
      toast.success(`Dodano ${rows.length} pracowników`);
      setStepIdx(stepIdx + 1);
    } catch (e: any) {
      toast.error(e.message || "Błąd zapisu pracowników");
    } finally {
      setSubmitting(false);
    }
  };

  // ── helpers ───────────────────────────────────────────────
  const addDeviceRow = () =>
    setDevices([...devices, { device_type_id: "", name: "", location_in_building: "", serial_number: "" }]);
  const removeDeviceRow = (i: number) =>
    setDevices(devices.filter((_, idx) => idx !== i));
  const updateDevice = (i: number, patch: Partial<DeviceRow>) =>
    setDevices(devices.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));

  const addEmployeeRow = () =>
    setEmployees([...employees, { first_name: "", last_name: "", email: "", position: "Serwisant" }]);
  const removeEmployeeRow = (i: number) =>
    setEmployees(employees.filter((_, idx) => idx !== i));
  const updateEmployee = (i: number, patch: Partial<EmployeeRow>) =>
    setEmployees(employees.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));

  // ───────────────────────── UI ──────────────────────────────
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div className="rounded-2xl bg-gradient-to-br from-primary/15 via-card to-card p-6 shadow-lg border border-border/50">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
              <Sparkles className="h-7 w-7 text-primary" />
              Onboarding Fire Zone
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Skonfiguruj swoją firmę w 5 prostych krokach
            </p>
          </div>
          <Badge variant="outline" className="text-xs">
            Krok {stepIdx + 1} z {STEPS.length}
          </Badge>
        </div>
        <div className="mt-4">
          <Progress value={progress} className="h-2" />
        </div>
        {/* Stepper */}
        <div className="mt-4 grid grid-cols-3 md:grid-cols-6 gap-2">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const done = i < stepIdx;
            const active = i === stepIdx;
            return (
              <div
                key={s.id}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-lg p-2 text-xs transition-colors",
                  active && "bg-primary/10 border border-primary/40",
                  done && "text-success",
                  !active && !done && "text-muted-foreground"
                )}
              >
                <div className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full",
                  done ? "bg-success/20" : active ? "bg-primary/20" : "bg-muted"
                )}>
                  {done ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </div>
                <span className="hidden md:inline font-medium">{s.title}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* STEP CONTENT */}
      <Card>
        {step === "welcome" && (
          <>
            <CardHeader>
              <CardTitle>Witaj w Fire Zone! 🔥</CardTitle>
              <CardDescription>
                Pomożemy Ci uruchomić system w kilka minut. W kolejnych krokach założymy firmę,
                pierwszy obiekt, kilka urządzeń ppoż. i dodamy pracowników. Wszystko możesz później edytować.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <Sparkles className="h-4 w-4" />
                <AlertDescription>
                  <strong>Wskazówka:</strong> Jeśli masz NIP firmy, dane uzupełnimy automatycznie z Białej Listy MF.
                </AlertDescription>
              </Alert>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                {STEPS.slice(1, -1).map((s) => {
                  const Icon = s.icon;
                  return (
                    <div key={s.id} className="flex items-center gap-2 rounded-md border border-border/50 p-3">
                      <Icon className="h-5 w-5 text-primary shrink-0" />
                      <span>{s.title}</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </>
        )}

        {step === "company" && (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" /> Krok 1: Twoja firma
              </CardTitle>
              <CardDescription>
                Wpisz NIP, by pobrać dane automatycznie, lub wypełnij ręcznie.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>NIP (opcjonalnie)</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    placeholder="np. 5252344078"
                    value={nip}
                    onChange={(e) => setNip(e.target.value)}
                    maxLength={13}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleNipLookup}
                    disabled={nipLoading || !nip}
                  >
                    {nipLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    <span className="ml-1 hidden sm:inline">Pobierz dane</span>
                  </Button>
                </div>
              </div>
              <div>
                <Label>Nazwa firmy *</Label>
                <Input
                  placeholder="np. Fire Protect Sp. z o.o."
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Adres siedziby</Label>
                <Input
                  placeholder="ul. Strażacka 1, 00-001 Warszawa"
                  value={companyAddress}
                  onChange={(e) => setCompanyAddress(e.target.value)}
                  className="mt-1"
                />
              </div>
            </CardContent>
          </>
        )}

        {step === "building" && (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-primary" /> Krok 2: Pierwszy obiekt
              </CardTitle>
              <CardDescription>
                Dodaj budynek, którym będziesz zarządzać. Kolejne obiekty dodasz w module „Obiekty”.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Nazwa obiektu *</Label>
                <Input
                  placeholder="np. Biurowiec Centrum"
                  value={buildingName}
                  onChange={(e) => setBuildingName(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Adres</Label>
                <Input
                  placeholder="ul. Marszałkowska 100, Warszawa"
                  value={buildingAddress}
                  onChange={(e) => setBuildingAddress(e.target.value)}
                  className="mt-1"
                />
              </div>
            </CardContent>
          </>
        )}

        {step === "devices" && (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wrench className="h-5 w-5 text-primary" /> Krok 3: Urządzenia ppoż.
              </CardTitle>
              <CardDescription>
                Dodaj kilka kluczowych urządzeń, by zacząć. Cały rejestr możesz zaimportować z Excela później.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {devices.map((d, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 rounded-md border border-border/50 p-3">
                  <div className="col-span-12 md:col-span-3">
                    <Label className="text-xs">Typ *</Label>
                    <Select value={d.device_type_id} onValueChange={(v) => updateDevice(i, { device_type_id: v })}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder="Wybierz" /></SelectTrigger>
                      <SelectContent>
                        {deviceTypes.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-12 md:col-span-3">
                    <Label className="text-xs">Nazwa *</Label>
                    <Input className="mt-1" placeholder="np. Gaśnica G-1" value={d.name}
                      onChange={(e) => updateDevice(i, { name: e.target.value })} />
                  </div>
                  <div className="col-span-6 md:col-span-3">
                    <Label className="text-xs">Lokalizacja</Label>
                    <Input className="mt-1" placeholder="Parter, hol" value={d.location_in_building}
                      onChange={(e) => updateDevice(i, { location_in_building: e.target.value })} />
                  </div>
                  <div className="col-span-5 md:col-span-2">
                    <Label className="text-xs">Nr seryjny</Label>
                    <Input className="mt-1" placeholder="SN-001" value={d.serial_number}
                      onChange={(e) => updateDevice(i, { serial_number: e.target.value })} />
                  </div>
                  <div className="col-span-1 flex items-end justify-end">
                    {devices.length > 1 && (
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeDeviceRow(i)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={addDeviceRow}>
                  <Plus className="h-4 w-4 mr-1" /> Dodaj kolejne
                </Button>
                <Button type="button" variant="ghost" size="sm" asChild>
                  <Link to="/admin/import" target="_blank">
                    <Upload className="h-4 w-4 mr-1" /> Import masowy z Excel
                  </Link>
                </Button>
              </div>
            </CardContent>
          </>
        )}

        {step === "employees" && (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" /> Krok 4: Pracownicy
              </CardTitle>
              <CardDescription>
                Dodaj zespół. Pełne konta logowania można utworzyć później w module „Pracownicy”.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {employees.map((e, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 rounded-md border border-border/50 p-3">
                  <div className="col-span-6 md:col-span-3">
                    <Label className="text-xs">Imię *</Label>
                    <Input className="mt-1" value={e.first_name}
                      onChange={(ev) => updateEmployee(i, { first_name: ev.target.value })} />
                  </div>
                  <div className="col-span-6 md:col-span-3">
                    <Label className="text-xs">Nazwisko</Label>
                    <Input className="mt-1" value={e.last_name}
                      onChange={(ev) => updateEmployee(i, { last_name: ev.target.value })} />
                  </div>
                  <div className="col-span-12 md:col-span-3">
                    <Label className="text-xs">E-mail *</Label>
                    <Input type="email" className="mt-1" placeholder="jan@firma.pl" value={e.email}
                      onChange={(ev) => updateEmployee(i, { email: ev.target.value })} />
                  </div>
                  <div className="col-span-11 md:col-span-2">
                    <Label className="text-xs">Stanowisko</Label>
                    <Select value={e.position} onValueChange={(v) => updateEmployee(i, { position: v })}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Serwisant">Serwisant</SelectItem>
                        <SelectItem value="Ekspert PPOŻ">Ekspert PPOŻ</SelectItem>
                        <SelectItem value="Admin">Admin</SelectItem>
                        <SelectItem value="Inny">Inny</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-1 flex items-end justify-end">
                    {employees.length > 1 && (
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeEmployeeRow(i)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addEmployeeRow}>
                <Plus className="h-4 w-4 mr-1" /> Dodaj kolejnego
              </Button>
            </CardContent>
          </>
        )}

        {step === "done" && (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Rocket className="h-6 w-6 text-success" /> Gotowe! Możesz startować 🚀
              </CardTitle>
              <CardDescription>
                Twoje konto Fire Zone jest skonfigurowane. Oto co właśnie utworzyliśmy:
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div className="rounded-lg bg-success/10 border border-success/30 p-3">
                  <Building2 className="h-5 w-5 text-success mb-1" />
                  <div className="font-semibold">{companyName || "—"}</div>
                  <div className="text-xs text-muted-foreground">Firma</div>
                </div>
                <div className="rounded-lg bg-success/10 border border-success/30 p-3">
                  <MapPin className="h-5 w-5 text-success mb-1" />
                  <div className="font-semibold">{buildingName || "—"}</div>
                  <div className="text-xs text-muted-foreground">Obiekt</div>
                </div>
                <div className="rounded-lg bg-success/10 border border-success/30 p-3">
                  <Wrench className="h-5 w-5 text-success mb-1" />
                  <div className="font-semibold">{devicesSaved}</div>
                  <div className="text-xs text-muted-foreground">Urządzenia</div>
                </div>
                <div className="rounded-lg bg-success/10 border border-success/30 p-3">
                  <Users className="h-5 w-5 text-success mb-1" />
                  <div className="font-semibold">{employeesSaved}</div>
                  <div className="text-xs text-muted-foreground">Pracownicy</div>
                </div>
              </div>
              <Alert>
                <Sparkles className="h-4 w-4" />
                <AlertDescription>
                  <strong>Co dalej?</strong> Wejdź na Dashboard, by zobaczyć status bezpieczeństwa, lub od razu
                  utwórz pierwsze zadania w Kanbanie.
                </AlertDescription>
              </Alert>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => navigate("/")}><Sparkles className="h-4 w-4 mr-1" /> Dashboard</Button>
                <Button variant="secondary" onClick={() => navigate("/kanban")}>Otwórz Kanban</Button>
                <Button variant="outline" asChild>
                  <Link to={buildingId ? `/buildings/${buildingId}` : "/buildings"}>Zobacz obiekt</Link>
                </Button>
              </div>
            </CardContent>
          </>
        )}
      </Card>

      {/* Nav buttons */}
      {step !== "done" && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            onClick={() => setStepIdx(Math.max(0, stepIdx - 1))}
            disabled={stepIdx === 0 || submitting}
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Wstecz
          </Button>

          <Button
            onClick={() => {
              if (step === "welcome") setStepIdx(stepIdx + 1);
              else if (step === "company") handleSaveCompany();
              else if (step === "building") handleSaveBuilding();
              else if (step === "devices") handleSaveDevices();
              else if (step === "employees") handleSaveEmployees();
            }}
            disabled={submitting}
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            {step === "welcome" ? "Zaczynamy" : "Dalej"}
            <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}
