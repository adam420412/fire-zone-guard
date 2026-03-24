import { UsersRound } from "lucide-react";

export default function EmployeesPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Zarządzanie Zespołem</h1>
          <p className="text-muted-foreground">Onboarding, szkolenia i plany rozwoju.</p>
        </div>
      </div>
      <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-border bg-card">
        <div className="text-center text-muted-foreground">
          <UsersRound className="mx-auto h-10 w-10 opacity-20" />
          <p className="mt-2 text-sm">Moduł Pracowniczy w przygotowaniu.</p>
        </div>
      </div>
    </div>
  );
}
