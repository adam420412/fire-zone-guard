import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBuildings } from "@/hooks/useSupabaseData";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Shield, CheckCircle, XCircle, AlertTriangle, Loader2,
  FileCheck, Calendar, Building2
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

function useCertificates() {
  return useQuery({
    queryKey: ["certificates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("certificates")
        .select("*, buildings(name, company_id, companies(name))")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

interface CertConditions {
  no_critical_tasks: boolean;
  ibp_valid: boolean;
  recent_evacuation: boolean;
  no_overdue_inspections: boolean;
}

export default function CertificatesPage() {
  const { data: certificates, isLoading, refetch } = useCertificates();
  const { data: buildings } = useBuildings();
  const { role } = useAuth();
  const { toast } = useToast();
  const [generating, setGenerating] = useState(false);
  const [selectedBuilding, setSelectedBuilding] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleGenerate = async () => {
    if (!selectedBuilding) return;
    setGenerating(true);
    setResult(null);

    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-report`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ type: "certificate", building_id: selectedBuilding }),
        }
      );

      const data = await res.json();
      setResult(data);

      if (data.can_issue) {
        toast({ title: "Certyfikat wydany!" });
        refetch();
      } else {
        toast({ title: "Nie spełniono warunków", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Błąd", description: err.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const inputCls = "w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm text-foreground outline-none focus:border-primary";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Certyfikaty</h1>
          <p className="text-sm text-muted-foreground">Lista wydanych certyfikatów bezpieczeństwa PPOŻ</p>
        </div>
        {role === "super_admin" && (
          <button
            onClick={() => { setShowDialog(true); setResult(null); setSelectedBuilding(""); }}
            className="flex items-center gap-2 rounded-md fire-gradient px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
          >
            <FileCheck className="h-4 w-4" />
            Nowy certyfikat
          </button>
        )}
      </div>

      {/* Certificates List */}
      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-5 py-3">
          <Shield className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Wydane certyfikaty ({(certificates ?? []).length})</h3>
        </div>

        {(certificates ?? []).length === 0 ? (
          <p className="px-5 py-8 text-center text-xs text-muted-foreground">Brak wydanych certyfikatów</p>
        ) : (
          <div className="divide-y divide-border">
            {(certificates ?? []).map((cert: any) => {
              const isValid = new Date(cert.valid_until) >= new Date();
              return (
                <div key={cert.id} className="flex items-center gap-4 px-5 py-4 card-hover">
                  <div className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                    isValid ? "bg-success/10" : "bg-critical/10"
                  )}>
                    {isValid ? (
                      <CheckCircle className="h-5 w-5 text-success" />
                    ) : (
                      <XCircle className="h-5 w-5 text-critical" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-card-foreground font-mono">
                        {cert.certificate_number}
                      </p>
                      <span className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                        isValid ? "bg-success/20 text-success" : "bg-critical/20 text-critical"
                      )}>
                        {isValid ? "Aktywny" : "Wygasły"}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Building2 className="h-3 w-3" />
                        {cert.buildings?.name ?? "—"}
                      </span>
                      <span>{cert.buildings?.companies?.name ?? ""}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Ważny do</p>
                    <p className={cn("text-sm font-medium", isValid ? "text-success" : "text-critical")}>
                      {new Date(cert.valid_until).toLocaleDateString("pl-PL")}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Generate Certificate Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-card-foreground">Generuj certyfikat bezpieczeństwa</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Wybierz obiekt</label>
              <select
                value={selectedBuilding}
                onChange={(e) => { setSelectedBuilding(e.target.value); setResult(null); }}
                className={inputCls + " mt-1"}
              >
                <option value="">Wybierz obiekt...</option>
                {(buildings ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} – {b.companyName}
                  </option>
                ))}
              </select>
            </div>

            {!result && (
              <button
                onClick={handleGenerate}
                disabled={!selectedBuilding || generating}
                className="w-full rounded-md fire-gradient py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {generating ? (
                  <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                ) : (
                  "Sprawdź warunki i generuj"
                )}
              </button>
            )}

            {result && (
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-card-foreground">Warunki certyfikatu:</h4>
                <div className="space-y-2">
                  <ConditionRow
                    label="Brak zadań krytycznych"
                    passed={result.conditions?.no_critical_tasks}
                  />
                  <ConditionRow
                    label="Ważna IBP"
                    passed={result.conditions?.ibp_valid}
                  />
                  <ConditionRow
                    label="Ewakuacja w ciągu 12 mies."
                    passed={result.conditions?.recent_evacuation}
                  />
                  <ConditionRow
                    label="Brak zaległych przeglądów"
                    passed={result.conditions?.no_overdue_inspections}
                  />
                </div>

                {result.can_issue ? (
                  <div className="rounded-md bg-success/10 border border-success/20 p-4 text-center">
                    <CheckCircle className="mx-auto h-8 w-8 text-success" />
                    <p className="mt-2 text-sm font-semibold text-success">Certyfikat wydany!</p>
                    <p className="mt-1 text-xs text-muted-foreground font-mono">
                      {result.certificate?.certificate_number}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Ważny do: {new Date(result.certificate?.valid_until).toLocaleDateString("pl-PL")}
                    </p>
                  </div>
                ) : (
                  <div className="rounded-md bg-critical/10 border border-critical/20 p-4 text-center">
                    <XCircle className="mx-auto h-8 w-8 text-critical" />
                    <p className="mt-2 text-sm font-semibold text-critical">
                      Nie spełniono warunków
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Rozwiąż powyższe problemy i spróbuj ponownie.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ConditionRow({ label, passed }: { label: string; passed: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-secondary/30 px-3 py-2">
      {passed ? (
        <CheckCircle className="h-4 w-4 shrink-0 text-success" />
      ) : (
        <XCircle className="h-4 w-4 shrink-0 text-critical" />
      )}
      <span className={cn("text-sm", passed ? "text-card-foreground" : "text-critical font-medium")}>
        {label}
      </span>
    </div>
  );
}
