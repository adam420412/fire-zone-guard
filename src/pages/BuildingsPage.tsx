import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useBuildings, useCompanies, useCreateBuilding } from "@/hooks/useSupabaseData";
import { useAuth } from "@/hooks/useAuth";
import { safetyStatusConfig } from "@/lib/constants";
import type { SafetyStatus } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Building2, MapPin, Clock, Shield, FileCheck, Loader2, ChevronRight, Plus, Save, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { CardGridSkeleton, PageHeaderSkeleton } from "@/components/PageSkeleton";

function CreateBuildingDialog({ open, onOpenChange }: { open: boolean, onOpenChange: (o: boolean) => void }) {
  const { data: companies } = useCompanies();
  const { mutate: createBuilding, isPending } = useCreateBuilding();
  
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [ibpDate, setIbpDate] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId) {
      toast.error("Wybierz firmę!");
      return;
    }
    createBuilding({
      name,
      address,
      company_id: companyId,
      ibp_valid_until: ibpDate || null,
    }, {
      onSuccess: () => {
        toast.success("Obiekt został dodany!");
        onOpenChange(false);
        setName("");
        setAddress("");
        setCompanyId("");
        setIbpDate("");
      },
      onError: (err: any) => {
        toast.error("Błąd: " + err.message);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Dodaj nowy obiekt</DialogTitle>
            <DialogDescription>Wprowadź dane budynku i przypisz go do kontrahenta.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="b-name">Nazwa obiektu</Label>
              <Input id="b-name" value={name} onChange={e => setName(e.target.value)} placeholder="np. Biurowiec Alfa" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="b-company">Firma / Kontrahent</Label>
              <Select value={companyId} onValueChange={setCompanyId}>
                <SelectTrigger><SelectValue placeholder="Wybierz firmę..." /></SelectTrigger>
                <SelectContent>
                  {companies?.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="b-address">Adres</Label>
              <Input id="b-address" value={address} onChange={e => setAddress(e.target.value)} placeholder="ul. Przykładowa 1, Miasto" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="b-ibp">Ważność IBP (opcjonalnie)</Label>
              <Input id="b-ibp" type="date" value={ibpDate} onChange={e => setIbpDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Anuluj</Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Dodaj obiekt
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function BuildingsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const companyFilter = searchParams.get("company");
  const { data: buildings, isLoading } = useBuildings();
  const { data: companies } = useCompanies();
  const { role } = useAuth();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const filteredBuildings = companyFilter
    ? (buildings ?? []).filter((b: any) => b.company_id === companyFilter)
    : (buildings ?? []);
  
  const filterCompanyName = companyFilter
    ? companies?.find(c => c.id === companyFilter)?.name
    : null;

  const handleExportCSV = () => {
    if (!buildings) return;
    const headers = ["ID", "Nazwa", "Firma", "Adres", "Status", "Waznosc IBP", "Zalegle Zadania"];
    const rows = buildings.map((b: any) => [
      b.id.slice(0, 8),
      `"${b.name.replace(/"/g, '""')}"`,
      `"${(b.companyName || "").replace(/"/g, '""')}"`,
      `"${(b.address || "").replace(/"/g, '""')}"`,
      b.safetyStatus || "bezpieczny",
      b.ibp_valid_until || "brak",
      b.overdueTasksCount || 0
    ]);
    
    const csvContent = [headers, ...rows].map(e => e.join(";")).join("\n");
    const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `firezone_obiekty_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Eksport zakończony");
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeaderSkeleton />
        <CardGridSkeleton count={6} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Obiekty {filterCompanyName && <span className="text-primary">— {filterCompanyName}</span>}
          </h1>
          <p className="text-sm text-muted-foreground">
            {filterCompanyName ? (
              <button onClick={() => setSearchParams({})} className="hover:underline text-primary">
                ← Pokaż wszystkie obiekty
              </button>
            ) : "Lista wszystkich obiektów w systemie"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {role === 'super_admin' && (
            <Button variant="outline" onClick={handleExportCSV} className="gap-2">
              <Download className="h-4 w-4" />
              Eksportuj CSV
            </Button>
          )}
          {role === 'super_admin' && (
            <Button onClick={() => setIsCreateOpen(true)} className="fire-gradient">
              <Plus className="mr-2 h-4 w-4" />
              Dodaj nowy obiekt
            </Button>
          )}
        </div>
      </div>

      <CreateBuildingDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(buildings ?? []).map((building: any) => {
          const status = ((building.safetyStatus in safetyStatusConfig) ? building.safetyStatus : "bezpieczny") as SafetyStatus;
          const statusConf = safetyStatusConfig[status];
          const StatusIcon = statusConf?.icon ?? Shield;
          const ibpValid = building.ibp_valid_until ? new Date(building.ibp_valid_until) >= new Date() : false;

          return (
            <div key={building.id} onClick={() => navigate(`/buildings/${building.id}`)} className="cursor-pointer rounded-lg border border-border bg-card p-5 card-hover relative group">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
                    <Building2 className="h-5 w-5 text-secondary-foreground" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-card-foreground line-clamp-1">{building.name}</h3>
                    <p className="text-xs text-muted-foreground line-clamp-1">{building.companyName}</p>
                  </div>
                </div>
                <StatusIcon className={cn("h-5 w-5 shrink-0", statusConf.color)} />
              </div>

              <div className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="line-clamp-1">{building.address}</span>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-4">
                <div className="text-center">
                  <p className="text-lg font-bold text-card-foreground">{building.activeTasksCount}</p>
                  <p className="text-[10px] text-muted-foreground uppercase">Aktywne</p>
                </div>
                <div className="text-center">
                  <p className={cn("text-lg font-bold", (building.overdueTasksCount ?? 0) > 0 ? "text-critical" : "text-success")}>
                    {building.overdueTasksCount}
                  </p>
                  <p className="text-[10px] text-muted-foreground uppercase">Zaległe</p>
                </div>
                <div className="text-center">
                  {ibpValid ? (
                    <FileCheck className="mx-auto h-5 w-5 text-success" />
                  ) : (
                    <Shield className="mx-auto h-5 w-5 text-critical" />
                  )}
                  <p className="text-[10px] text-muted-foreground uppercase">IBP</p>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between text-[11px] text-muted-foreground border-t border-border pt-4">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Clock className="h-3 w-3 shrink-0" />
                  <span className="truncate">IBP: {building.ibp_valid_until ? new Date(building.ibp_valid_until).toLocaleDateString("pl-PL") : "brak"}</span>
                </div>
                <span className={cn("text-xs font-semibold shrink-0 ml-2", statusConf.color)}>{statusConf.label}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
