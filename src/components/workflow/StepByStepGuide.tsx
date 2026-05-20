import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check, ExternalLink } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { TUTORIAL_STEPS, type RoleFilter } from "@/lib/workflowSteps";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "fz:workflow:done-steps";

function loadDone(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

interface Props {
  defaultRole?: RoleFilter;
}

export function StepByStepGuide({ defaultRole = "admin" }: Props) {
  const [done, setDone] = useState<Set<string>>(() => loadDone());
  const [role, setRole] = useState<RoleFilter>(defaultRole);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...done]));
  }, [done]);

  const filtered = TUTORIAL_STEPS.filter((s) => s.roles.includes(role));
  const doneCount = filtered.filter((s) => done.has(s.id)).length;

  const toggle = (id: string) => {
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">Samouczek krok-po-kroku</h3>
          <p className="text-sm text-muted-foreground">
            Ukończone: <span className="text-primary font-medium">{doneCount}/{filtered.length}</span>
          </p>
        </div>
        <ToggleGroup type="single" value={role} onValueChange={(v) => v && setRole(v as RoleFilter)}>
          <ToggleGroupItem value="admin">Admin</ToggleGroupItem>
          <ToggleGroupItem value="serviceman">Serwisant</ToggleGroupItem>
          <ToggleGroupItem value="client">Klient</ToggleGroupItem>
        </ToggleGroup>
      </div>

      <Accordion type="multiple" className="space-y-2">
        {filtered.map((step, i) => {
          const isDone = done.has(step.id);
          const Icon = step.icon;
          return (
            <AccordionItem
              key={step.id}
              value={step.id}
              className={cn(
                "border rounded-lg px-4 bg-card/50",
                isDone && "border-primary/40 bg-primary/5",
              )}
            >
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-3 text-left flex-1 pr-2">
                  <div
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full border shrink-0",
                      isDone ? "border-primary bg-primary text-primary-foreground" : "border-border bg-muted/40",
                    )}
                  >
                    {isDone ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs shrink-0">Krok {i + 1}</Badge>
                      <span className="font-medium">{step.title}</span>
                    </div>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="pl-11 space-y-3">
                  <p className="text-sm text-muted-foreground">{step.description}</p>
                  <div className="flex items-center gap-3 flex-wrap">
                    <Button asChild size="sm" variant="secondary">
                      <Link to={step.cta.path}>
                        <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                        {step.cta.label}
                      </Link>
                    </Button>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox checked={isDone} onCheckedChange={() => toggle(step.id)} />
                      Oznacz jako zrobione
                    </label>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
