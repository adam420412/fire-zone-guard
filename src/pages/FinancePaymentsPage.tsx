import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CreditCard } from "lucide-react";

export default function FinancePaymentsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <CreditCard className="h-6 w-6 text-primary" /> Płatności
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Wpływy, przelewy i rozliczenia z kontrahentami.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Brak płatności</CardTitle>
          <CardDescription>
            Moduł płatności zostanie wkrótce uruchomiony. Tu pojawi się rejestr wpłat,
            powiązań z fakturami i statusów rozliczenia.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">
            Planowane funkcje: import wyciągów bankowych, dopasowanie do FV,
            przypomnienia o nieopłaconych fakturach, raport należności.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
