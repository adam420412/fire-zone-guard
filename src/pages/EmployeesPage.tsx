import { useMemo, useState } from "react";
import {
  UsersRound,
  Plus,
  AlertCircle,
  BriefcaseMedical,
  Settings,
  Save,
  Download,
  Loader2,
  Trash2,
  Search,
  Mail,
  Phone,
  Calendar,
  Building2,
  GraduationCap,
  ShieldCheck,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useEmployees,
  useBuildings,
  useCreateEmployee,
  useUpdateEmployee,
  useDeleteEmployee,
  useEmployeeTrainings,
  useCreateTraining,
  type EmployeeRecord,
  type CreateEmployeeInput,
} from "@/hooks/useSupabaseData";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import StatCard from "@/components/StatCard";

// =============================================================================
// Helpers
// =============================================================================

const TRAINING_STATUS_OPTIONS = ["Aktualne", "W trakcie", "Brak", "Wygasłe"] as const;
const NONE_VALUE = "__none__"; // Radix <Select> nie akceptuje value="" w SelectItem

function formatDate(date: string | null | undefined) {
  if (!date) return "-";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("pl-PL");
}

function healthBadge(status: EmployeeRecord["health_exam_status"]) {
  switch (status) {
    case "ok":
      return <Badge variant="default" className="text-[10px] h-5 px-1.5 bg-emerald-600 hover:bg-emerald-600">Aktualne</Badge>;
    case "expiring":
      return <Badge variant="default" className="text-[10px] h-5 px-1.5 bg-amber-500 hover:bg-amber-500 text-white">Kończą się</Badge>;
    case "expired":
      return <Badge variant="destructive" className="text-[10px] h-5 px-1.5">Wygasłe</Badge>;
    default:
      return <Badge variant="outline" className="text-[10px] h-5 px-1.5">Brak</Badge>;
  }
}

function trainingBadge(value: string | null | undefined) {
  const v = (value || "Brak").toLowerCase();
  if (v.includes("aktual")) return <Badge variant="default" className="text-[10px] h-5 px-1.5 bg-emerald-600 hover:bg-emerald-600">{value}</Badge>;
  if (v.includes("trakc")) return <Badge variant="default" className="text-[10px] h-5 px-1.5 bg-blue-600 hover:bg-blue-600 text-white">{value}</Badge>;
  if (v.includes("wyga")) return <Badge variant="destructive" className="text-[10px] h-5 px-1.5">{value}</Badge>;
  return <Badge variant="outline" className="text-[10px] h-5 px-1.5">{value || "Brak"}</Badge>;
}

// =============================================================================
// EmployeeFormDialog (shared by create + edit)
// =============================================================================

interface EmployeeFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  employee?: EmployeeRecord | null;
}

function EmployeeFormDialog({ open, onOpenChange, mode, employee }: EmployeeFormDialogProps) {
  const { data: buildings } = useBuildings();
  const { mutate: createEmployee, isPending: creating } = useCreateEmployee();
  const { mutate: updateEmployee, isPending: updating } = useUpdateEmployee();
  const isPending = creating || updating;

  const [firstName, setFirstName] = useState(employee?.first_name ?? "");
  const [lastName, setLastName] = useState(employee?.last_name ?? "");
  const [email, setEmail] = useState(employee?.email ?? "");
  const [phone, setPhone] = useState(employee?.phone ?? "");
  const [position, setPosition] = useState(employee?.position ?? "");
  const [buildingId, setBuildingId] = useState<string>(employee?.building_id ?? NONE_VALUE);
  const [employmentDate, setEmploymentDate] = useState(
    employee?.employment_date?.slice(0, 10) ?? ""
  );
  const [healthDate, setHealthDate] = useState(
    employee?.health_exam_valid_until?.slice(0, 10) ?? ""
  );
  const [trainingStatus, setTrainingStatus] = useState(employee?.training_status ?? "Brak");
  const [progress, setProgress] = useState<number>(employee?.onboarding_progress ?? 0);
  const [notes, setNotes] = useState(employee?.notes ?? "");

  // Reset stanu gdy dialog otwiera się dla innego pracownika
  // (przy kliknięciu Anuluj / zamknięciu też)
  const resetForm = () => {
    setFirstName("");
    setLastName("");
    setEmail("");
    setPhone("");
    setPosition("");
    setBuildingId(NONE_VALUE);
    setEmploymentDate("");
    setHealthDate("");
    setTrainingStatus("Brak");
    setProgress(0);
    setNotes("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() && !lastName.trim()) {
      toast.error("Podaj imię i nazwisko pracownika.");
      return;
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast.error("Nieprawidłowy adres email.");
      return;
    }
    const payload: CreateEmployeeInput & { is_active?: boolean; status?: string } = {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      email: email.trim() || null,
      phone: phone.trim() || null,
      position: position.trim() || null,
      building_id: buildingId === NONE_VALUE ? null : buildingId,
      employment_date: employmentDate || null,
      health_exam_valid_until: healthDate || null,
      training_status: trainingStatus,
      onboarding_progress: Number.isFinite(progress) ? Math.max(0, Math.min(100, Math.round(progress))) : 0,
      notes: notes.trim() || null,
    };

    const onError = (err: any) => {
      toast.error("Nie udało się zapisać pracownika: " + (err?.message ?? "nieznany błąd"));
    };

    if (mode === "create") {
      createEmployee(payload, {
        onSuccess: () => {
          toast.success("Pracownik dodany do bazy.");
          resetForm();
          onOpenChange(false);
        },
        onError,
      });
    } else if (employee) {
      updateEmployee(
        { id: employee.id, updates: payload },
        {
          onSuccess: () => {
            toast.success("Zapisano zmiany.");
            onOpenChange(false);
          },
          onError,
        }
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { /* zostaw stan, edytujemy */ } onOpenChange(o); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {mode === "create" ? "Dodaj pracownika" : `Edytuj pracownika: ${employee?.full_name}`}
            </DialogTitle>
            <DialogDescription>
              {mode === "create"
                ? "Wprowadź dane kadrowe nowego pracownika. Tylko imię i nazwisko jest wymagane - resztę można uzupełnić później."
                : "Zaktualizuj dane kadrowe i szkoleniowe."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 py-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="emp-first">Imię *</Label>
                <Input
                  id="emp-first"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="emp-last">Nazwisko *</Label>
                <Input
                  id="emp-last"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="emp-email">E-mail</Label>
                <Input
                  id="emp-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jan.kowalski@firma.pl"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="emp-phone">Telefon</Label>
                <Input
                  id="emp-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+48 600 000 000"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="emp-position">Stanowisko</Label>
                <Input
                  id="emp-position"
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                  placeholder="np. Inspektor PPOŻ"
                />
              </div>
              <div className="space-y-2">
                <Label>Przypisany obiekt</Label>
                <Select value={buildingId} onValueChange={setBuildingId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Wybierz obiekt..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_VALUE}>Brak (Centrala)</SelectItem>
                    {buildings?.map((b) => (
                      <SelectItem key={(b as any).id} value={(b as any).id}>
                        {(b as any).name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="emp-emp-date">Data zatrudnienia</Label>
                <Input
                  id="emp-emp-date"
                  type="date"
                  value={employmentDate}
                  onChange={(e) => setEmploymentDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="emp-health">Ważność badań lekarskich</Label>
                <Input
                  id="emp-health"
                  type="date"
                  value={healthDate}
                  onChange={(e) => setHealthDate(e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Status szkolenia BHP / PPOŻ</Label>
                <Select value={trainingStatus} onValueChange={setTrainingStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TRAINING_STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="emp-progress">Postęp onboardingu (%)</Label>
                <Input
                  id="emp-progress"
                  type="number"
                  min={0}
                  max={100}
                  value={progress}
                  onChange={(e) => setProgress(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="emp-notes">Notatki</Label>
              <Textarea
                id="emp-notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Dodatkowe informacje (np. uprawnienia, ograniczenia, uwagi BHP)..."
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Anuluj
            </Button>
            <Button type="submit" disabled={isPending} className="gap-2">
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {mode === "create" ? "Dodaj pracownika" : "Zapisz zmiany"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// Trainings dialog (kept from previous version, slimmed down)
// =============================================================================

function EmployeeTrainingsDialog({
  open,
  onOpenChange,
  employee,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: EmployeeRecord | null;
}) {
  const { data: trainings, isLoading } = useEmployeeTrainings(employee?.user_id ?? "");
  const { mutate: createTraining, isPending } = useCreateTraining();

  const [trainingName, setTrainingName] = useState("");
  const [completedAt, setCompletedAt] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!employee || !trainingName || !completedAt) return;
    if (!employee.user_id) {
      toast.error("Pracownik nie ma jeszcze konta w systemie - przypisz go najpierw do profilu.");
      return;
    }
    createTraining(
      {
        user_id: employee.user_id,
        training_name: trainingName,
        completed_at: new Date(completedAt).toISOString(),
      },
      {
        onSuccess: () => {
          toast.success("Szkolenie / certyfikat dodane.");
          setTrainingName("");
          setCompletedAt("");
        },
        onError: (err: any) => {
          toast.error("Błąd zapisu: " + err?.message);
        },
      }
    );
  };

  if (!employee) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-card">
        <DialogHeader>
          <DialogTitle>Ewidencja szkoleń (SEP, BHP, Konserwator)</DialogTitle>
          <DialogDescription>Wykaz uprawnień: {employee.full_name}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
          <Card className="border-border">
            <CardContent className="pt-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>Nazwa uprawnienia (np. SEP 1kV)</Label>
                  <Input
                    value={trainingName}
                    onChange={(e) => setTrainingName(e.target.value)}
                    required
                    placeholder="Wpisz nazwę..."
                  />
                </div>
                <div className="space-y-2">
                  <Label>Data uzyskania ważności</Label>
                  <Input
                    type="date"
                    value={completedAt}
                    onChange={(e) => setCompletedAt(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" disabled={isPending || !employee.user_id} className="w-full">
                  {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                  Dodaj wpis
                </Button>
                {!employee.user_id && (
                  <p className="text-xs text-muted-foreground">
                    Aby ewidencjonować szkolenia, pracownik musi posiadać profil użytkownika w systemie.
                  </p>
                )}
              </form>
            </CardContent>
          </Card>

          <div className="overflow-y-auto max-h-[300px] border border-border rounded-md bg-secondary/10">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nazwa</TableHead>
                  <TableHead>Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center py-4">
                      <Loader2 className="animate-spin h-5 w-5 mx-auto text-primary" />
                    </TableCell>
                  </TableRow>
                ) : !trainings || trainings.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center text-muted-foreground py-10 text-xs">
                      Brak zarejestrowanych szkoleń
                    </TableCell>
                  </TableRow>
                ) : (
                  trainings.map((t: any) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium text-sm">{t.training_name}</TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground whitespace-nowrap">
                        {t.completed_at ? new Date(t.completed_at).toLocaleDateString("pl-PL") : "-"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// EmployeeCard
// =============================================================================

function EmployeeCard({
  emp,
  isAdmin,
  onEdit,
  onTrainings,
  onDelete,
}: {
  emp: EmployeeRecord;
  isAdmin: boolean;
  onEdit: () => void;
  onTrainings: () => void;
  onDelete: () => void;
}) {
  const accent =
    emp.health_exam_status === "expired" || emp.training_status === "Wygasłe"
      ? "bg-destructive"
      : emp.health_exam_status === "expiring"
        ? "bg-amber-500"
        : emp.training_status === "Aktualne"
          ? "bg-emerald-500"
          : "bg-muted-foreground/40";

  return (
    <Card className="relative overflow-hidden group border-border shadow-sm hover:shadow-md transition-shadow">
      <div className={`absolute top-0 left-0 w-1 h-full ${accent}`} />
      <CardContent className="p-5 pl-6 relative">
        {isAdmin && (
          <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
            <Button variant="ghost" size="icon" onClick={onEdit} title="Edytuj pracownika">
              <Settings className="h-4 w-4 text-muted-foreground hover:text-foreground" />
            </Button>
            <Button variant="ghost" size="icon" onClick={onDelete} title="Usuń pracownika">
              <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
            </Button>
          </div>
        )}

        <div className="flex justify-between items-start mb-4 pr-12">
          <div className="min-w-0">
            <h3 className="font-bold text-base truncate">{emp.full_name}</h3>
            <p className="text-xs text-muted-foreground truncate">{emp.position || "-"}</p>
            {emp.building_name && (
              <p className="text-[10px] text-muted-foreground mt-1 bg-secondary inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-medium">
                <Building2 className="h-3 w-3" /> {emp.building_name}
              </p>
            )}
          </div>
          <div className="h-9 w-9 shrink-0 rounded-full bg-secondary flex items-center justify-center text-muted-foreground font-bold text-xs uppercase">
            {emp.initials}
          </div>
        </div>

        {(emp.email || emp.phone) && (
          <div className="space-y-1 mb-4 text-xs">
            {emp.email && (
              <a
                href={`mailto:${emp.email}`}
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground truncate"
              >
                <Mail className="h-3 w-3 shrink-0" /> <span className="truncate">{emp.email}</span>
              </a>
            )}
            {emp.phone && (
              <a
                href={`tel:${emp.phone}`}
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
              >
                <Phone className="h-3 w-3 shrink-0" /> {emp.phone}
              </a>
            )}
          </div>
        )}

        <div className="space-y-3 text-xs">
          <div>
            <div className="flex justify-between mb-1 text-[10px] font-bold uppercase text-muted-foreground/70">
              <span>Onboarding</span>
              <span>{emp.onboarding_progress ?? 0}%</span>
            </div>
            <Progress value={emp.onboarding_progress ?? 0} className="h-1.5" />
          </div>

          <div className="flex justify-between items-center py-1 border-b border-border/50">
            <span className="text-muted-foreground flex items-center gap-2">
              <BriefcaseMedical className="h-3.5 w-3.5" /> Badania lekarskie
            </span>
            <div className="flex items-center gap-2">
              <span className="font-semibold">{formatDate(emp.health_exam_valid_until)}</span>
              {healthBadge(emp.health_exam_status)}
            </div>
          </div>

          <div className="flex justify-between items-center py-1 border-b border-border/50">
            <span className="text-muted-foreground flex items-center gap-2">
              <ShieldCheck className="h-3.5 w-3.5" /> Szkolenie BHP/PPOŻ
            </span>
            {trainingBadge(emp.training_status)}
          </div>

          {emp.employment_date && (
            <div className="flex justify-between items-center py-1">
              <span className="text-muted-foreground flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5" /> Zatrudniono
              </span>
              <span className="font-semibold">{formatDate(emp.employment_date)}</span>
            </div>
          )}
        </div>

        <div className="mt-4">
          <Button variant="outline" size="sm" className="w-full text-xs font-semibold h-8 gap-2" onClick={onTrainings}>
            <GraduationCap className="h-3.5 w-3.5" />
            Ewidencja szkoleń i uprawnień
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Main page
// =============================================================================

export default function EmployeesPage() {
  const { data: employees, isLoading, error } = useEmployees();
  const { role } = useAuth();
  const { data: buildings } = useBuildings();
  const { mutate: deleteEmployee, isPending: deleting } = useDeleteEmployee();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editEmp, setEditEmp] = useState<EmployeeRecord | null>(null);
  const [trainingsEmp, setTrainingsEmp] = useState<EmployeeRecord | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<EmployeeRecord | null>(null);

  const [search, setSearch] = useState("");
  const [filterBuilding, setFilterBuilding] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const isAdmin = role === "super_admin" || role === "admin" || role === "coordinator";

  const filtered = useMemo(() => {
    if (!employees) return [];
    const q = search.trim().toLowerCase();
    return employees.filter((e) => {
      if (filterBuilding !== "all") {
        if (filterBuilding === "none" && e.building_id) return false;
        if (filterBuilding !== "none" && e.building_id !== filterBuilding) return false;
      }
      if (filterStatus !== "all" && (e.training_status || "Brak") !== filterStatus) return false;
      if (!q) return true;
      const haystack = [
        e.full_name,
        e.first_name,
        e.last_name,
        e.email,
        e.phone,
        e.position,
        e.building_name,
        e.notes,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [employees, search, filterBuilding, filterStatus]);

  const stats = useMemo(() => {
    const all = employees ?? [];
    return {
      total: all.length,
      active: all.filter((e) => e.is_active).length,
      missingTraining: all.filter((e) => (e.training_status || "Brak") !== "Aktualne").length,
      expiringHealth: all.filter((e) => e.health_exam_status === "expiring" || e.health_exam_status === "expired").length,
    };
  }, [employees]);

  const handleExportCSV = () => {
    if (!filtered.length) {
      toast.info("Brak danych do eksportu.");
      return;
    }
    const headers = [
      "ID",
      "Imię",
      "Nazwisko",
      "Email",
      "Telefon",
      "Stanowisko",
      "Obiekt",
      "Data zatrudnienia",
      "Badania lekarskie",
      "Szkolenie BHP",
      "Onboarding %",
    ];
    const rows = filtered.map((emp) => [
      emp.id.slice(0, 8),
      `"${(emp.first_name ?? "").replace(/"/g, '""')}"`,
      `"${(emp.last_name ?? "").replace(/"/g, '""')}"`,
      `"${(emp.email ?? "").replace(/"/g, '""')}"`,
      `"${(emp.phone ?? "").replace(/"/g, '""')}"`,
      `"${(emp.position ?? "").replace(/"/g, '""')}"`,
      `"${(emp.building_name ?? "").replace(/"/g, '""')}"`,
      emp.employment_date ?? "",
      emp.health_exam_valid_until ?? "",
      emp.training_status ?? "Brak",
      emp.onboarding_progress ?? 0,
    ]);
    const csv = [headers, ...rows].map((r) => r.join(";")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `firezone_pracownicy_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success(`Wyeksportowano ${filtered.length} pracowników.`);
  };

  if (error && (error as any).code === "42P01") {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Zespół i Szkolenia</h1>
        <Card className="border-destructive/50 bg-destructive/10">
          <CardContent className="flex items-center gap-4 py-6 text-destructive">
            <AlertCircle className="h-6 w-6" />
            <div>
              <p className="font-semibold">Baza danych nie jest gotowa</p>
              <p className="text-sm">
                Uruchom migrację <code>20260423120000_employees_module_v2.sql</code> w Supabase, aby odblokować ten moduł.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Zarządzanie Zespołem</h1>
          <p className="text-muted-foreground">Onboarding, szkolenia BHP/PPOŻ i kontakty pracowników.</p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button variant="outline" onClick={handleExportCSV} className="gap-2">
              <Download className="h-4 w-4" />
              Eksport CSV
            </Button>
          )}
          {isAdmin && (
            <Button onClick={() => setIsCreateOpen(true)} className="w-full sm:w-auto fire-gradient">
              <Plus className="mr-2 h-4 w-4" />
              Dodaj pracownika
            </Button>
          )}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Pracownicy ogółem"
          value={String(stats.total)}
          icon={UsersRound}
          subtitle={`${stats.active} aktywnych`}
        />
        <StatCard
          title="Bez aktualnego BHP"
          value={String(stats.missingTraining)}
          icon={ShieldCheck}
          subtitle="Wymaga szkolenia"
        />
        <StatCard
          title="Badania na ukończeniu"
          value={String(stats.expiringHealth)}
          icon={BriefcaseMedical}
          subtitle="Kończą się <30 dni lub wygasły"
        />
        <StatCard
          title="Obiekty z personelem"
          value={String(new Set((employees ?? []).map((e) => e.building_id).filter(Boolean)).size)}
          icon={Building2}
          subtitle="Liczba lokalizacji"
        />
      </div>

      {/* Filters */}
      <Card className="border-border">
        <CardContent className="flex flex-col md:flex-row gap-3 items-stretch md:items-center py-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Szukaj po imieniu, mailu, telefonie, stanowisku..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Filter className="h-4 w-4" />
            </div>
            <Select value={filterBuilding} onValueChange={setFilterBuilding}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Obiekt" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Wszystkie obiekty</SelectItem>
                <SelectItem value="none">Bez obiektu (Centrala)</SelectItem>
                {buildings?.map((b) => (
                  <SelectItem key={(b as any).id} value={(b as any).id}>
                    {(b as any).name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Status BHP" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Każdy status</SelectItem>
                {TRAINING_STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Dialogs */}
      {isCreateOpen && (
        <EmployeeFormDialog
          key="create-dialog"
          open={isCreateOpen}
          onOpenChange={setIsCreateOpen}
          mode="create"
        />
      )}
      {editEmp && (
        <EmployeeFormDialog
          key={`edit-${editEmp.id}`}
          open={!!editEmp}
          onOpenChange={(o) => !o && setEditEmp(null)}
          mode="edit"
          employee={editEmp}
        />
      )}
      {trainingsEmp && (
        <EmployeeTrainingsDialog
          open={!!trainingsEmp}
          onOpenChange={(o) => !o && setTrainingsEmp(null)}
          employee={trainingsEmp}
        />
      )}
      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Usunąć pracownika {confirmDelete?.full_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Operacja jest nieodwracalna. Wraz z kartą pracownika usunięte zostaną wszystkie powiązane szkolenia i wpisy.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Anuluj</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={() => {
                if (!confirmDelete) return;
                deleteEmployee(confirmDelete.id, {
                  onSuccess: () => {
                    toast.success("Pracownik usunięty.");
                    setConfirmDelete(null);
                  },
                  onError: (err: any) => {
                    toast.error("Nie udało się usunąć: " + err?.message);
                  },
                });
              }}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Usuń
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (employees?.length ?? 0) === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card text-center px-6">
          <UsersRound className="h-10 w-10 text-muted-foreground opacity-30 mb-3" />
          <h3 className="text-lg font-semibold">Brak pracowników w systemie</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">
            Zacznij od dodania pierwszej osoby - wystarczy podać imię i nazwisko, resztę uzupełnisz później.
          </p>
          {isAdmin && (
            <Button onClick={() => setIsCreateOpen(true)} className="mt-5 fire-gradient">
              <Plus className="mr-2 h-4 w-4" /> Dodaj pierwszego pracownika
            </Button>
          )}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex h-40 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card text-center px-6">
          <Search className="h-8 w-8 text-muted-foreground opacity-30 mb-2" />
          <h3 className="text-base font-semibold">Brak wyników</h3>
          <p className="text-sm text-muted-foreground mt-1">Spróbuj zmienić kryteria filtrowania.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((emp) => (
            <EmployeeCard
              key={emp.id}
              emp={emp}
              isAdmin={isAdmin}
              onEdit={() => setEditEmp(emp)}
              onTrainings={() => setTrainingsEmp(emp)}
              onDelete={() => setConfirmDelete(emp)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
