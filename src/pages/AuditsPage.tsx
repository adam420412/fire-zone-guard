import { useState, useMemo } from "react";
import { ClipboardCheck, Plus, AlertCircle, FileDown, Eye, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAudits } from "@/hooks/useSupabaseData";
import { CreateAuditDialog } from "@/components/CreateAuditDialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function AuditsPage() {
  const { role } = useAuth();
  const { data: audits, isLoading, error } = useAudits();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredAudits = useMemo(() => {
    if (!audits) return [];
    if (!searchQuery) return audits;
    const lower = searchQuery.toLowerCase();
    return audits.filter((a: any) => 
      a.building_name?.toLowerCase().includes(lower) || 
      a.auditor_name?.toLowerCase().includes(lower) ||
      a.status?.toLowerCase().includes(lower)
    );
  }, [audits, searchQuery]);

  if (error && (error as any).code === "42P01") {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Audyty PPOŻ</h1>
        <Card className="border-destructive/50 bg-destructive/10">
          <CardContent className="flex items-center gap-4 py-6 text-destructive">
            <AlertCircle className="h-6 w-6" />
            <div>
              <p className="font-semibold">Baza danych nie jest gotowa</p>
              <p className="text-sm">Uruchom migrację `database_update_v2.sql` w Supabase, aby odblokować Audyty.</p>
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
          <h1 className="text-2xl font-bold tracking-tight">Audyty PPOŻ</h1>
          <p className="text-muted-foreground">Ekspertyzy, audyty stanu bezpieczeństwa i raporty z wizji lokalnej.</p>
        </div>
        {role === 'super_admin' && (
          <Button onClick={() => setIsCreateOpen(true)} className="w-full sm:w-auto">
            <Plus className="mr-2 h-4 w-4" />
            Zaplanuj audyt
          </Button>
        )}
      </div>

      <CreateAuditDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />

      <div className="flex items-center mt-2 max-w-sm relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input 
          placeholder="Szukaj po obiekcie, audytorze lub statusie..." 
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
        ) : filteredAudits.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center text-center">
            <ClipboardCheck className="mx-auto h-10 w-10 text-muted-foreground opacity-20" />
            <h3 className="mt-4 text-lg font-semibold">Brak audytów</h3>
            <p className="mt-1 text-sm text-muted-foreground">Spróbuj zmienić parametry wyszukiwania lub zaplanuj nowy audyt.</p>
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>Typ dokumentu</TableHead>
                  <TableHead>Budynek / Obiekt</TableHead>
                  <TableHead>Data Audytu</TableHead>
                  <TableHead>Audytor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Wynik Cząstkowy</TableHead>
                  <TableHead className="text-right">Akcje</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAudits.map((audit: any) => (
                  <TableRow key={audit.id} className="hover:bg-muted/50 cursor-pointer transition-colors group">
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
                        {audit.type || 'Audyt / IBP'}
                      </div>
                    </TableCell>
                    <TableCell>{audit.building_name}</TableCell>
                    <TableCell>{new Date(audit.scheduled_for).toLocaleDateString("pl-PL")}</TableCell>
                    <TableCell>{audit.auditor_name}</TableCell>
                    <TableCell>
                      <Badge variant={audit.status === "zakończony" ? "default" : "secondary"}>
                        {audit.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="font-semibold text-muted-foreground">
                        {audit.overall_score || '-'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="sm" asChild>
                          <Link to={`/audits/${audit.id}`}>Karta</Link>
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
