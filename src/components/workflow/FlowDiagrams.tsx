import { Link } from "react-router-dom";
import { ArrowRight, ArrowDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { FLOWS } from "@/lib/workflowSteps";

const toneClasses: Record<string, string> = {
  default: "border-border bg-card",
  warn: "border-yellow-500/40 bg-yellow-500/5",
  danger: "border-destructive/40 bg-destructive/5",
  success: "border-primary/50 bg-primary/10",
};

export function FlowDiagrams() {
  return (
    <div className="space-y-6">
      {FLOWS.map((flow) => {
        const Icon = flow.icon;
        return (
          <Card key={flow.id} className="p-5">
            <div className="flex items-start gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary shrink-0">
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold">{flow.title}</h3>
                <p className="text-sm text-muted-foreground">{flow.description}</p>
              </div>
            </div>

            {/* Desktop: poziomo, Mobile: pionowo */}
            <div className="flex flex-wrap items-stretch gap-2 md:gap-3">
              {flow.nodes.map((node, i) => {
                const inner = (
                  <div
                    className={cn(
                      "h-full rounded-lg border-2 p-3 text-sm transition hover:shadow-md min-w-[140px] max-w-[200px] flex flex-col gap-1",
                      toneClasses[node.tone ?? "default"],
                      node.path && "hover:border-primary cursor-pointer",
                    )}
                  >
                    <div className="font-medium leading-tight">{node.label}</div>
                    {node.hint && (
                      <div className="text-xs text-muted-foreground leading-tight">{node.hint}</div>
                    )}
                    {node.path && (
                      <Badge variant="outline" className="self-start mt-auto text-[10px] uppercase tracking-wide">
                        Otwórz
                      </Badge>
                    )}
                  </div>
                );
                return (
                  <div key={i} className="flex items-center gap-2 md:gap-3">
                    {node.path ? <Link to={node.path}>{inner}</Link> : inner}
                    {i < flow.nodes.length - 1 && (
                      <>
                        <ArrowRight className="hidden md:block h-5 w-5 text-muted-foreground shrink-0" />
                        <ArrowDown className="md:hidden h-5 w-5 text-muted-foreground shrink-0 mx-auto" />
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
