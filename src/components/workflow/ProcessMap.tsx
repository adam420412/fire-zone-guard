import { Link } from "react-router-dom";
import { CheckCircle2, ChevronRight, Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { PHASES, type WorkflowCounts } from "@/lib/workflowSteps";

interface Props {
  counts?: WorkflowCounts;
  loading?: boolean;
}

export function ProcessMap({ counts, loading }: Props) {
  const completedIds = new Set<string>();
  PHASES.forEach((p) => {
    if (!counts || !p.countKey) return;
    const val = counts[p.countKey] ?? 0;
    if (val >= (p.threshold ?? 1)) completedIds.add(p.id);
  });

  return (
    <div className="relative">
      {/* pionowa linia */}
      <div className="absolute left-[19px] top-2 bottom-2 w-px bg-border md:left-[27px]" />

      <div className="space-y-4">
        {PHASES.map((phase, idx) => {
          const Icon = phase.icon;
          const done = completedIds.has(phase.id);
          const blocked = (phase.requires ?? []).some((r) => !completedIds.has(r));
          const count = phase.countKey && counts ? counts[phase.countKey] : undefined;
          const threshold = phase.threshold ?? 1;
          const pct = count === undefined
            ? 0
            : Math.min(100, Math.round((count / Math.max(threshold, 1)) * 100));

          return (
            <div key={phase.id} className="relative pl-12 md:pl-16">
              <div
                className={cn(
                  "absolute left-0 top-1 flex h-10 w-10 items-center justify-center rounded-full border-2 md:h-14 md:w-14",
                  done
                    ? "border-primary bg-primary/20 text-primary"
                    : blocked
                    ? "border-muted bg-muted/30 text-muted-foreground"
                    : "border-accent bg-accent/20 text-accent-foreground",
                )}
              >
                {done ? (
                  <CheckCircle2 className="h-5 w-5 md:h-6 md:w-6" />
                ) : blocked ? (
                  <Lock className="h-4 w-4 md:h-5 md:w-5" />
                ) : (
                  <Icon className="h-5 w-5 md:h-6 md:w-6" />
                )}
              </div>

              <Card className={cn("p-4 md:p-5", blocked && "opacity-70")}>
                <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                  <div>
                    <h3 className="font-semibold text-base md:text-lg">{phase.title}</h3>
                    <p className="text-sm text-muted-foreground mt-0.5">{phase.goal}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {done && <Badge className="bg-primary/20 text-primary border-primary/40">Zrobione</Badge>}
                    {blocked && !done && (
                      <Badge variant="outline" className="text-muted-foreground">
                        Wymaga: {(phase.requires ?? []).map((r) => `#${PHASES.findIndex((p) => p.id === r) + 1}`).join(", ")}
                      </Badge>
                    )}
                    {count !== undefined && (
                      <Badge variant="secondary">{count} {count === 1 ? "rekord" : "rekordów"}</Badge>
                    )}
                  </div>
                </div>

                {count !== undefined && (
                  <div className="mb-3">
                    <Progress value={loading ? 0 : pct} className="h-1.5" />
                  </div>
                )}

                <div className="grid sm:grid-cols-2 gap-2">
                  {phase.tasks.map((t, i) => (
                    <Link
                      key={i}
                      to={t.path ?? "#"}
                      className="group flex items-center gap-2 rounded-md border border-border/60 bg-card/50 px-3 py-2 text-sm hover:border-primary/60 hover:bg-primary/5 transition"
                    >
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary shrink-0" />
                      <span className="flex-1">{t.label}</span>
                    </Link>
                  ))}
                </div>
              </Card>
            </div>
          );
        })}
      </div>
    </div>
  );
}
