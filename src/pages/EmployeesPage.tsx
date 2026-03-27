import { useState } from "react";
import { UsersRound, Plus, AlertCircle, BriefcaseMedical, Settings, Save, Download, Loader2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEmployees, useBuildings, useCreateEmployee, useUpdateEmployee, useEmployeeTrainings, useCreateTraining } from "@/hooks/useSupabaseData";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function ManageEmployeeDialog({ open, onOpenChange, employee }: { open: boolean, onOpenChange: (o: boolean) => void, employee: any }) {
  const { data: buildings } = useBuildings();
  const { mutate: updateEmployee, isPending } = useUpdateEmployee();
  
  const [fullName, setFullName] = useState(employee?.name || `${employee?.first_name || ""} ${employee?.last_name || ""}`.trim());
  const [position, setPosition] = useState(employee?.position || "");
  const [buildingId, setBuildingId] = useState(employee?.building_id || "none");
  const [healthExamDate, setHealthExamDate] = useState(employee?.health_exam_valid_until?.split("T")[0] || "");
  const [trainingStatus, setTrainingStatus] = useState(employee?.training_status || "Brak");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!employee) return;
    
    updateEmployee({
      id: employee.id,
      updates: {
        position,
        building_id: buildingId === "none" ? null : buildingId,
        health_exam_valid_until: healthExamDate,
        training_status: trainingStatus
      },
      profileUpdates: {
        name: fullName
      }
    }, {
      onSuccess: () => {
        toast.success("Dane pracownika zaktualizowane!");
        onOpenChange(false);
      },
      onError: (err: any) => {
        toast.error("Błąd: " + err.message);
      }
    });
  };

  if (!employee) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Zarządzaj pracownikiem (Admin)</DialogTitle>
            <DialogDescription>Edytuj dane kadrowe i szkoleniowe pracownika.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto px-2">
            <div className="space-y-2">
              <Label>Imię i nazwisko</Label>
              <Input value={fullName} onChange={e => setFullName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Stanowisko</Label>
              <Input value={position} onChange={e => setPosition(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Ważność badań lekarskich</Label>
              <Input type="date" value={healthExamDate} onChange={e => setHealthExamDate(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Status szkolenia BHP</Label>
              <Select value={trainingStatus} onValueChange={setTrainingStatus}>
                <SelectTrigger><SelectValue placeholder="Status..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Aktualne">Aktualne</SelectItem>
                  <SelectItem value="Brak">Brak</SelectItem>
                  <SelectItem value="Wygasłe">Wygasłe</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Przypisany obiekt</Label>
              <Select value={buildingId} onValueChange={setBuildingId}>
                <SelectTrigger><SelectValue placeholder="Wybierz obiekt..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Brak (Centrala)</SelectItem>
                  {buildings?.map(b => (
                    <SelectItem key={(b as any).id} value={(b as any).id}>{(b as any).name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Anuluj</Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Zapisz zmiany
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EmployeeTrainingsDialog({ open, onOpenChange, employee }: { open: boolean, onOpenChange: (o: boolean) => void, employee: any }) {
  const { data: trainings, isLoading } = useEmployeeTrainings(employee?.user_id);
  const { mutate: createTraining, isPending } = useCreateTraining();
  
  const [trainingName, setTrainingName] = useState("");
  const [completedAt, setCompletedAt] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!employee || !trainingName || !completedAt) return;
    
    createTraining({
      user_id: employee.user_id,
      training_name: trainingName,
      completed_at: new Date(completedAt).toISOString()
    }, {
      onSuccess: () => {
        toast.success("Szkolenie / Certyfikat dodany!");
        setTrainingName("");
        setCompletedAt("");
      },
      onError: (err: any) => {
        toast.error("Błąd zapisu: " + err.message);
      }
    });
  };

  if (!employee) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-card">
        <DialogHeader>
          <DialogTitle>Ewidencja Szkoleń (SEP, BHP, Konserwator)</DialogTitle>
          <DialogDescription>Wykaz uprawnień: {employee?.profiles?.name || employee?.name || "Pracownik"}</DialogDescription>
        </DialogHeader>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
          <Card className="border-border">
            <CardContent className="pt-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>Nazwa Uprawnienia (np. SEP 1kV)</Label>
                  <Input value={trainingName} onChange={e => setTrainingName(e.target.value)} required placeholder="Wpisz nazwę..."/>
                </div>
                <div className="space-y-2">
                  <Label>Data uzyskania ważności</Label>
                  <Input type="date" value={completedAt} onChange={e => setCompletedAt(e.target.value)} required />
                </div>
                <Button type="submit" disabled={isPending} className="w-full">
                  {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                  Dodaj Wpis
                </Button>
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
                  <TableRow><TableCell colSpan={2} className="text-center py-4"><Loader2 className="animate-spin h-5 w-5 mx-auto text-primary" /></TableCell></TableRow>
                ) : !trainings || trainings.length === 0 ? (
                  <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground py-10 text-xs">Brak zarejestrowanych szkoleń</TableCell></TableRow>
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

function CreateEmployeeDialog({ open, onOpenChange }: { open: boolean, onOpenChange: (o: boolean) => void }) {
  const { data: buildings } = useBuildings();
  const { mutate: createEmployee, isPending } = useCreateEmployee();
  
  const [name, setName] = useState("");
  const [position, setPosition] = useState("");
  const [buildingId, setBuildingId] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createEmployee({
      first_name: name.split(" ")[0] || "",
      last_name: name.split(" ").slice(1).join(" ") || "",
      name: name, // Ensure name is passed
      position: position,
      building_id: buildingId || null,
      onboarding_progress: 0,
      training_status: "Brak",
      health_exam_valid_until: new Date(new Date().setFullYear(new Date().getFullYear() + 2)).toISOString().split("T")[0]
    }, {
      onSuccess: () => {
        toast.success("Pracownik dodany!");
        onOpenChange(false);
        setName("");
        setPosition("");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Dodaj pracownika</DialogTitle>
            <DialogDescription>Załóż kartotekę szkoleniowo-rozwojową dla pracownika.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Imię i nazwisko</Label>
              <Input value={name} onChange={e => setName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Stanowisko</Label>
              <Input value={position} onChange={e => setPosition(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Przypisany obiekt (opcjonalnie)</Label>
              <Select value={buildingId} onValueChange={setBuildingId}>
                <SelectTrigger><SelectValue placeholder="Wybierz obiekt..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Brak (Centrala)</SelectItem>
                  {buildings?.map(b => (
                    <SelectItem key={(b as any).id} value={(b as any).id}>{(b as any).name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Anuluj</Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Dodaj
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function EmployeesPage() {
  const { data: employees, isLoading, error } = useEmployees();
  const { role } = useAuth();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [manageEmp, setManageEmp] = useState<any>(null);
  const [trainingsEmp, setTrainingsEmp] = useState<any>(null);

  const handleExportCSV = () => {
    if (!employees) return;
    const headers = ["ID", "Nazwisko i Imie", "Stanowisko", "Obiekt", "Badania Lekarskie", "Szkolenie BHP", "Postep Onboarding"];
    const rows = employees.map((emp: any) => [
      emp.id.slice(0, 8),
      `"${(emp.profiles?.name || emp.name || "").replace(/"/g, '""')}"`,
      `"${(emp.position || "").replace(/"/g, '""')}"`,
      `"${(emp.building_name || "").replace(/"/g, '""')}"`,
      emp.health_exam_valid_until || "brak",
      emp.training_status || "Brak",
      emp.onboarding_progress || 0
    ]);
    
    const csvContent = [headers, ...rows].map(e => e.join(";")).join("\n");
    const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `firezone_pracownicy_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Eksport zakończony");
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
              <p className="text-sm">Uruchom migrację `database_update_v2.sql` w Supabase, aby odblokować ten moduł.</p>
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
          <p className="text-muted-foreground">Onboarding, szkolenia BHP i plany rozwoju.</p>
        </div>
        <div className="flex items-center gap-2">
          {role === 'super_admin' && (
            <Button variant="outline" onClick={handleExportCSV} className="gap-2">
              <Download className="h-4 w-4" />
              Eksportuj CSV
            </Button>
          )}
          <Button onClick={() => setIsCreateOpen(true)} className="w-full sm:w-auto fire-gradient">
            <Plus className="mr-2 h-4 w-4" />
            Dodaj pracownika
          </Button>
        </div>
      </div>

      <CreateEmployeeDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />
      {manageEmp && (
        <ManageEmployeeDialog 
          open={!!manageEmp} 
          onOpenChange={(open) => !open && setManageEmp(null)} 
          employee={manageEmp} 
        />
      )}
      {trainingsEmp && (
        <EmployeeTrainingsDialog 
          open={!!trainingsEmp} 
          onOpenChange={(open) => !open && setTrainingsEmp(null)} 
          employee={trainingsEmp} 
        />
      )}

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : employees?.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card">
          <UsersRound className="mx-auto h-10 w-10 text-muted-foreground opacity-20" />
          <h3 className="mt-4 text-lg font-semibold">Brak pracowników w systemie</h3>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {employees?.map((emp: any) => (
            <Card key={emp.id} className="relative overflow-hidden group border-border shadow-sm hover:shadow-md transition-shadow">
              <div className={`absolute top-0 left-0 w-1 h-full ${
                emp.training_status === 'Aktualne' ? 'bg-emerald-500' : 'bg-destructive'
              }`} />
              <CardContent className="p-5 pl-6 relative">
                
                {role === 'super_admin' && (
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                    onClick={() => setManageEmp(emp)}
                  >
                    <Settings className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                  </Button>
                )}

                <div className="flex justify-between items-start mb-4 pr-6">
                  <div className="min-w-0">
                    <h3 className="font-bold text-base truncate">{emp.profiles?.name || emp.name || "Pracownik"}</h3>
                    <p className="text-xs text-muted-foreground truncate">{emp.position}</p>
                    <p className="text-[10px] text-muted-foreground mt-1 bg-secondary inline-block px-1.5 py-0.5 rounded font-medium">
                      {emp.building_name}
                    </p>
                  </div>
                  <div className="h-9 w-9 shrink-0 rounded-full bg-secondary flex items-center justify-center text-muted-foreground font-bold text-xs uppercase">
                    {(emp.profiles?.name || emp.name || "? ?").split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                  </div>
                </div>

                <div className="space-y-4 text-xs mt-6">
                  <div>
                    <div className="flex justify-between mb-1 text-[10px] font-bold uppercase text-muted-foreground/70">
                      <span>Onboarding</span>
                      <span>{emp.onboarding_progress}%</span>
                    </div>
                    <Progress value={emp.onboarding_progress} className="h-1.5" />
                  </div>

                  <div className="flex justify-between items-center py-1 border-b border-border/50">
                    <span className="text-muted-foreground flex items-center gap-2">
                      <BriefcaseMedical className="h-3.5 w-3.5" /> Badania lekarskie
                    </span>
                    <span className="font-semibold">
                      {emp.health_exam_valid_until ? new Date(emp.health_exam_valid_until).toLocaleDateString("pl-PL") : '-'}
                    </span>
                  </div>

                  <div className="flex justify-between items-center py-1">
                    <span className="text-muted-foreground">Status PPOŻ</span>
                    <Badge variant={emp.training_status === 'Aktualne' ? 'default' : 'destructive'} className="text-[10px] h-5 px-1.5">
                      {emp.training_status}
                    </Badge>
                  </div>
                </div>

                <div className="mt-6">
                  <Button variant="outline" size="sm" className="w-full text-xs font-semibold h-8" onClick={() => setTrainingsEmp(emp)}>
                    Ewidencja Szkoleń i Uprawnień
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
