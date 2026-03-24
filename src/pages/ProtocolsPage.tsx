import { useState, useMemo } from "react";
import { FileText, Plus, AlertCircle, FileDown, Eye, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useProtocols } from "@/hooks/useSupabaseData";
import { CreateProtocolDialog } from "@/components/CreateProtocolDialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function ProtocolsPage() {
  const { role } = useAuth();
  const { data: protocols, isLoading, error } = useProtocols();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredProtocols = useMemo(() => {
    if (!protocols) return [];
    if (!searchQuery) return protocols;
    const lower = searchQuery.toLowerCase();
    return protocols.filter((p: any) => 
      p.building_name?.toLowerCase().includes(lower) || 
      p.type?.toLowerCase().includes(lower) ||
      p.inspector_name?.toLowerCase().includes(lower)
    );
  }, [protocols, searchQuery]);

  if (error && (error as any).code === "42P01") {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Protokoły Serwisowe</h1>
        <Card className="border-destructive/50 bg-destructive/10">
          <CardContent className="flex items-center gap-4 py-6 text-destructive">
            <AlertCircle className="h-6 w-6" />
            <div>
              <p className="font-semibold">Baza danych nie jest gotowa</p>
              <p className="text-sm">Aby używać tego modułu, musisz najpierw wykonać migrację SQL `database_update_v2.sql` w panelu Supabase.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Protokoły Serwisowe</h1>
          <p className="text-muted-foreground">Rejestr i zarządzanie wynikami przeglądów PPOŻ.</p>
        </div>
        {role === 'super_admin' && (
          <Button onClick={() => setIsCreateOpen(true)} className="w-full sm:w-auto">
            <Plus className="mr-2 h-4 w-4" />
            Dodaj protokół
          </Button>
        )}
      </div>

      <CreateProtocolDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />

      <div className="flex items-center mt-2 max-w-sm relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input 
          placeholder="Szukaj po obiekcie lub typie..." 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      <Card className="flex-1 mt-4">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : filteredProtocols.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center text-center">
            <FileText className="mx-auto h-10 w-10 text-muted-foreground opacity-20" />
            <h3 className="mt-4 text-lg font-semibold">Brak wyników</h3>
            <p className="mt-1 text-sm text-muted-foreground">Spróbuj zmienić parametry wyszukiwania lub dodaj nowy protokół.</p>
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>Typ protokołu</TableHead>
                  <TableHead>Budynek / Obiekt</TableHead>
                  <TableHead>Data Przeglądu</TableHead>
                  <TableHead>Inspektor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Wynik</TableHead>
                  <TableHead className="text-right">Akcje</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProtocols.map((protocol: any) => (
                  <TableRow key={protocol.id} className="hover:bg-muted/50 cursor-pointer transition-colors group">
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        {protocol.type}
                      </div>
                    </TableCell>
                    <TableCell>{protocol.building_name}</TableCell>
                    <TableCell>{new Date(protocol.performed_at).toLocaleDateString("pl-PL")}</TableCell>
                    <TableCell>{protocol.inspector_name}</TableCell>
                    <TableCell>
                      <Badge variant={protocol.status === "zatwierdzony" ? "default" : "secondary"}>
                        {protocol.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className={`font-semibold ${protocol.overall_result?.toLowerCase() === 'pozytywny' ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {protocol.overall_result?.toUpperCase() || '-'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="sm" asChild>
                          <Link to={`/protocols/${protocol.id}`}>Szczegóły</Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
