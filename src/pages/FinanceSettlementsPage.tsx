import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Scale } from "lucide-react";

export default function FinanceSettlementsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Scale className="h-6 w-6 text-primary" /> Rozliczenia
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Saldo z kontrahentami, rozliczenia okresowe i podsumowania finansowe.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Brak rozliczeń</CardTitle>
          <CardDescription>
            Moduł rozliczeń zostanie wkrótce uruchomiony. Tu pojawią się salda firm,
            zestawienia miesięczne i rozliczenia z serwisantami.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">
            Planowane funkcje: bilans należności/zobowiązań, prowizje serwisantów,
            podsumowania okresowe (miesiąc/kwartał/rok), eksport do PDF i Excel.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
