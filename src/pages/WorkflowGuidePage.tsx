import { BookOpen, Map, ListChecks, GitBranch } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { ProcessMap } from "@/components/workflow/ProcessMap";
import { StepByStepGuide } from "@/components/workflow/StepByStepGuide";
import { FlowDiagrams } from "@/components/workflow/FlowDiagrams";
import { useWorkflowProgress } from "@/hooks/useWorkflowProgress";
import { useAuth } from "@/hooks/useAuth";

export default function WorkflowGuidePage() {
  const { data, isLoading } = useWorkflowProgress();
  const { role } = useAuth();
  const defaultRole = role === "client" ? "client" : role === "serviceman" ? "serviceman" : "admin";

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      <header className="flex items-start gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-primary shrink-0">
          <BookOpen className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Przewodnik Workflow</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            Cały proces pracy w Fire Zone — ułożony krok-po-kroku. Zobacz mapę procesu, samouczek i schematy flow,
            żeby wiedzieć <em>co</em>, <em>gdzie</em> i <em>w jakiej kolejności</em> robić.
          </p>
        </div>
      </header>

      <Tabs defaultValue="map" className="space-y-4">
        <TabsList className="grid grid-cols-3 w-full max-w-xl">
          <TabsTrigger value="map" className="gap-2"><Map className="h-4 w-4" /> Mapa procesu</TabsTrigger>
          <TabsTrigger value="steps" className="gap-2"><ListChecks className="h-4 w-4" /> Samouczek</TabsTrigger>
          <TabsTrigger value="flows" className="gap-2"><GitBranch className="h-4 w-4" /> Flow zadań</TabsTrigger>
        </TabsList>

        <TabsContent value="map">
          <Card className="p-4 md:p-6">
            <ProcessMap counts={data} loading={isLoading} />
          </Card>
        </TabsContent>

        <TabsContent value="steps">
          <Card className="p-4 md:p-6">
            <StepByStepGuide defaultRole={defaultRole} />
          </Card>
        </TabsContent>

        <TabsContent value="flows">
          <FlowDiagrams />
        </TabsContent>
      </Tabs>
    </div>
  );
}
