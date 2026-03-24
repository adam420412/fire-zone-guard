import { FileText } from "lucide-react";

export default function ProtocolsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Protokoły Serwisowe</h1>
          <p className="text-muted-foreground">Hydranty, zbiorniki, instalacje.</p>
        </div>
      </div>
      <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-border bg-card">
        <div className="text-center text-muted-foreground">
          <FileText className="mx-auto h-10 w-10 opacity-20" />
          <p className="mt-2 text-sm">Moduł Protokołów w przygotowaniu.</p>
        </div>
      </div>
    </div>
  );
}
