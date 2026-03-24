import { useCompaniesWithStats } from "@/hooks/useSupabaseData";
import { cn } from "@/lib/utils";
import { Briefcase, Building2, ClipboardList, TrendingUp, Loader2 } from "lucide-react";

export default function CompaniesPage() {
  const { data: companies, isLoading } = useCompaniesWithStats();

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Firmy</h1>
        <p className="text-sm text-muted-foreground">Zarządzanie firmami w systemie Fire Zone</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(companies ?? []).map((company) => (
          <div key={company.id} className="rounded-lg border border-border bg-card p-5 card-hover">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg fire-gradient">
                <Briefcase className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-card-foreground">{company.name}</h3>
              </div>
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
