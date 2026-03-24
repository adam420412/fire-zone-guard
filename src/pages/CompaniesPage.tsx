import { useState } from "react";
import { useCompaniesWithStats, useUpdateCompany, useBuildings } from "@/hooks/useSupabaseData";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { Briefcase, Building2, ClipboardList, TrendingUp, Loader2, Settings, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

function ManageCompanyDialog({ open, onOpenChange, company }: { open: boolean; onOpenChange: (o: boolean) => void; company: any }) {
  const { mutate: updateCompany, isPending } = useUpdateCompany();
  const { data: buildings } = useBuildings();
  const [name, setName] = useState(company?.name || "");

  // Find all buildings belonging to this company
  const companyBuildings = buildings?.filter((b: any) => b.company_id === company?.id) || [];

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!company) return;
    
    updateCompany({ id: company.id, updates: { name } }, {
      onSuccess: () => {
        toast.success("Dane firmy zaktualizowane.");
        onOpenChange(false);
      },
      onError: (err) => {
        toast.error("Błąd zapisu: " + err.message);
      }
    });
  };

  if (!company) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <form onSubmit={handleSave}>
          <DialogHeader>
            <DialogTitle>Karta Klienta (Admin)</DialogTitle>
            <DialogDescription>Zarządzaj ustawieniami i obiektami firmy {company.name}.</DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-6">
            <div className="space-y-2">
              <Label>Nazwa Firmy</Label>
              <Input value={name} onChange={e => setName(e.target.value)} required />
            </div>

            <div className="space-y-2 pt-4">
              <Label className="flex justify-between items-center mb-2">
                Przypisane Obiekty ({companyBuildings.length})
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs">Dodaj obiekt</Button>
              </Label>
              <div className="border rounded-md p-2 bg-muted/20 min-h-24 max-h-48 overflow-y-auto space-y-2">
                {companyBuildings.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">Brak dopisanych obiektów do tej firmy.</p>
                ) : (
                  companyBuildings.map((b: any) => (
                    <div key={b.id} className="flex justify-between items-center bg-card border px-3 py-2 rounded-md text-sm">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                        {b.name}
                      </div>
                      <Badge variant="secondary">Aktywny</Badge>
                    </div>
                  ))
                )}
              </div>
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

export default function CompaniesPage() {
  const { data: companies, isLoading } = useCompaniesWithStats();
  const { role } = useAuth();
  
  const [selectedCompany, setSelectedCompany] = useState<any>(null);
  const [manageOpen, setManageOpen] = useState(false);

  const handleManageClick = (company: any) => {
    setSelectedCompany(company);
    setManageOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Firmy (Klienci)</h1>
          <p className="text-sm text-muted-foreground">Rejestr spółek i kontrahentów w systemie.</p>
        </div>
        {role === 'super_admin' && (
          <Button>Dodaj Klienta</Button>
        )}
      </div>

      <ManageCompanyDialog 
        open={manageOpen} 
        onOpenChange={setManageOpen} 
        company={selectedCompany} 
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(companies ?? []).map((company: any) => (
          <div key={company.id} className="rounded-lg border border-border bg-card p-5 card-hover relative group">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg fire-gradient">
                  <Briefcase className="h-5 w-5 text-primary-foreground" />
                </div>
                <div>
                  <h3 className="font-semibold text-card-foreground line-clamp-1 pr-8">{company.name}</h3>
                </div>
              </div>
              {role === 'super_admin' && (
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => handleManageClick(company)}
                >
                  <Settings className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                </Button>
              )}
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-4">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-lg font-bold text-card-foreground">{company.buildingsCount}</p>
                  <p className="text-[10px] text-muted-foreground">Obiekty</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-lg font-bold text-card-foreground">{company.activeTasksCount}</p>
                  <p className="text-[10px] text-muted-foreground">Zadania</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className={cn(
                    "text-lg font-bold",
                    company.sla >= 90 ? "text-success" : company.sla >= 80 ? "text-warning" : "text-critical"
                  )}>
                    {company.sla}%
                  </p>
                  <p className="text-[10px] text-muted-foreground">SLA</p>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
