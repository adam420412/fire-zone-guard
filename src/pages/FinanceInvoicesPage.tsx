import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { FileText } from "lucide-react";

export default function FinanceInvoicesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <FileText className="h-6 w-6 text-primary" /> Faktury
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Wystawione i otrzymane faktury powiązane ze zleceniami i klientami.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Brak faktur</CardTitle>
          <CardDescription>
            Moduł faktur zostanie wkrótce uruchomiony. Aktualnie finansowe pozycje zleceń
            znajdziesz w sekcji „Finanse → Zlecenia”.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">
            Planowane funkcje: wystawianie FV, import PDF, integracja z księgowością,
            statusy płatności, eksport JPK.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
