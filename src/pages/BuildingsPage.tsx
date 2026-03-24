import { useNavigate } from "react-router-dom";
import { useBuildings } from "@/hooks/useSupabaseData";
import { safetyStatusConfig } from "@/lib/constants";
import type { SafetyStatus } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Building2, MapPin, Clock, Shield, FileCheck, Loader2, ChevronRight } from "lucide-react";

export default function BuildingsPage() {
  const navigate = useNavigate();
  const { data: buildings, isLoading } = useBuildings();

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
        <h1 className="text-2xl font-bold tracking-tight">Obiekty</h1>
        <p className="text-sm text-muted-foreground">Lista wszystkich obiektów w systemie</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(buildings ?? []).map((building) => {
          const status = (building.safetyStatus ?? "bezpieczny") as SafetyStatus;
          const statusConf = safetyStatusConfig[status];
          const StatusIcon = statusConf.icon;
          const ibpValid = building.ibp_valid_until ? new Date(building.ibp_valid_until) >= new Date() : false;

          return (
            <div key={building.id} onClick={() => navigate(`/buildings/${building.id}`)} className="cursor-pointer rounded-lg border border-border bg-card p-5 card-hover">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
                    <Building2 className="h-5 w-5 text-secondary-foreground" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-card-foreground">{building.name}</h3>
                    <p className="text-xs text-muted-foreground">{building.companyName}</p>
                  </div>
                </div>
                <StatusIcon className={cn("h-5 w-5", statusConf.color)} />
              </div>

              <div className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3" />
                <span>{building.address}</span>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-4">
                <div className="text-center">
                  <p className="text-lg font-bold text-card-foreground">{building.activeTasksCount}</p>
                  <p className="text-[10px] text-muted-foreground">Aktywne</p>
                </div>
                <div className="text-center">
                  <p className={cn("text-lg font-bold", (building.overdueTasksCount ?? 0) > 0 ? "text-critical" : "text-success")}>
                    {building.overdueTasksCount}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Zaległe</p>
                </div>
                <div className="text-center">
                  {ibpValid ? (
                    <FileCheck className="mx-auto h-5 w-5 text-success" />
                  ) : (
                    <Shield className="mx-auto h-5 w-5 text-critical" />
                  )}
                  <p className="text-[10px] text-muted-foreground">IBP</p>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3 w-3" />
                  <span>IBP: {building.ibp_valid_until ?? "brak"}</span>
                </div>
                <span className={cn("text-xs font-semibold", statusConf.color)}>{statusConf.label}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
