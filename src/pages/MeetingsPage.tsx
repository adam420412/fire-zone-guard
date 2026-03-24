import { Users } from "lucide-react";

export default function MeetingsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Spotkania i Wizje Lokalnie</h1>
          <p className="text-muted-foreground">Zarządzanie notatkami ze spotkań.</p>
        </div>
      </div>
      <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-border bg-card">
        <div className="text-center text-muted-foreground">
          <Users className="mx-auto h-10 w-10 opacity-20" />
          <p className="mt-2 text-sm">Moduł Spotkań w przygotowaniu.</p>
        </div>
      </div>
    </div>
  );
}
