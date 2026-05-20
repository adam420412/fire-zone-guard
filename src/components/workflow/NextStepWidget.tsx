import { useState } from "react";
import { Link } from "react-router-dom";
import { Sparkles, ArrowRight, X, BookOpen } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useWorkflowProgress } from "@/hooks/useWorkflowProgress";

const STORAGE_KEY = "fz:workflow:next-step-hidden";

function pickNext(counts: ReturnType<typeof useWorkflowProgress>["data"]) {
  if (!counts) return null;
  if (!counts.companies) return { label: "Dodaj pierwszą firmę", path: "/onboarding" };
  if (!counts.buildings) return { label: "Dodaj pierwszy obiekt", path: "/buildings" };
  if (!counts.devices) return { label: "Zinwentaryzuj urządzenia", path: "/admin/import" };
  if (!counts.employees) return { label: "Dodaj zespół", path: "/employees" };
  if (!counts.tasks) return { label: "Utwórz pierwsze zadanie z szablonu", path: "/kanban" };
  if (!counts.audits) return { label: "Zaplanuj pierwszy audyt", path: "/audits" };
  return { label: "Zobacz pełny przewodnik workflow", path: "/workflow" };
}

export function NextStepWidget() {
  const [hidden, setHidden] = useState(() => localStorage.getItem(STORAGE_KEY) === "1");
  const { data, isLoading } = useWorkflowProgress();

  if (hidden || isLoading) return null;
  const next = pickNext(data);
  if (!next) return null;

  const hide = () => {
    localStorage.setItem(STORAGE_KEY, "1");
    setHidden(true);
  };

  return (
    <Card className="p-4 border-primary/40 bg-gradient-to-r from-primary/10 to-transparent">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-primary shrink-0">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-[200px]">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Następny krok</p>
          <p className="font-semibold">{next.label}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild size="sm">
            <Link to={next.path}>
              Zacznij <ArrowRight className="h-4 w-4 ml-1" />
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/workflow">
              <BookOpen className="h-4 w-4 mr-1" /> Przewodnik
            </Link>
          </Button>
          <Button size="icon" variant="ghost" onClick={hide} aria-label="Ukryj">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
