import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ChevronLeft, Save, Plus, Printer, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAudits, useAuditChecklists, useCreateChecklist, useDeleteChecklist } from "@/hooks/useSupabaseData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { generateReportPDF } from "@/lib/pdfGenerator";
import { useAuth } from "@/hooks/useAuth";

export default function AuditDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: audits } = useAudits();
  const { data: checklists } = useAuditChecklists(id as string);
  const { mutate: createChecklist } = useCreateChecklist();
  const { mutate: deleteChecklist } = useDeleteChecklist();
  const { role } = useAuth();
  const isSuperAdmin = role === 'super_admin';

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newItem, setNewItem] = useState({
    category: "Ogólne",
    question: "",
    status: "OK",
    notes: ""
  });
  
  const audit = audits?.find(a => a.id === id);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createChecklist({
      audit_id: id,
      ...newItem
    }, {
      onSuccess: () => {
        toast.success("Punkt dodany do audytu");
        setIsAddOpen(false);
        setNewItem({ ...newItem, question: "", notes: "" });
      }
    });
  };

  const handleGeneratePDF = () => {
    if (!audit) return;

    const tableData = checklists?.map((c: any, index: number) => [
      index + 1,
      c.category,
      c.question,
      c.status,
      c.notes || "-"
    ]) || [];

    generateReportPDF({
      title: "EKSPERTYZA STANU BEZPIECZEŃSTWA",
      filename: `Audyt_${audit.building_name.replace(/\s+/g, '_')}_${audit.scheduled_for}.pdf`,
      metadata: [
        { label: "Obiekt", value: audit.building_name },
        { label: "Data wykonania", value: new Date(audit.scheduled_for).toLocaleDateString("pl-PL") },
        { label: "Audytor", value: audit.auditor_name || "Brak" },
        { label: "Status inspekcji", value: audit.status }
      ],
      tableColumns: ["Lp.", "Kategoria", "Wymaganie / Punkt", "Ocena", "Uwagi"],
      tableData,
      result: audit.overall_score || "Zakończony"
    });
  };

  if (!audit) return <div>Ładowanie...</div>;

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-10">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={() => navigate("/audits")}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Karta Audytu</h1>
          <p className="text-muted-foreground">{audit.building_name}</p>
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={handleGeneratePDF}>
            <Printer className="mr-2 h-4 w-4" />
            PDF
          </Button>
          {isSuperAdmin && (
            <Button>
              <Save className="mr-2 h-4 w-4" />
              Zapisz zmiany
            </Button>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Informacje podstawowe</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label>Status</Label>
              <Input value={audit.status} readOnly />
            </div>
            <div className="grid gap-2">
              <Label>Data planowana/wykonania</Label>
              <Input type="date" value={audit.scheduled_for} readOnly />
            </div>
            <div className="grid gap-2">
              <Label>Audytor</Label>
              <Input value={audit.auditor_name || ""} readOnly />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Lista kontrolna (Checklista)</CardTitle>
          {isSuperAdmin && (
            <Button size="sm" variant="secondary" onClick={() => setIsAddOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Dodaj punkt
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {(!checklists || checklists.length === 0) ? (
            <div className="text-center py-10 text-muted-foreground border-2 border-dashed rounded-md">
              <p>Checklista jest pusta.</p>
              <p className="text-sm">Kliknij "Dodaj punkt", aby przypisać zadania i pytania audytowe.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Kategoria</TableHead>
                  <TableHead>Sprawdzany element</TableHead>
                  <TableHead className="w-[100px]">Ocena</TableHead>
                  <TableHead>Uwagi i ocena ryzyka</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {checklists.map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.category}</TableCell>
                    <TableCell>{c.question}</TableCell>
                    <TableCell>
                      <Badge variant={c.status === "OK" ? "default" : c.status === "BŁĄD" ? "destructive" : "secondary"}>
                        {c.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{c.notes || "-"}</TableCell>
                    <TableCell>
                      {isSuperAdmin && (
                        <Button variant="ghost" size="icon" onClick={() => deleteChecklist({ id: c.id, audit_id: id as string })}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent>
          <form onSubmit={handleCreate}>
            <DialogHeader>
              <DialogTitle>Dodaj punkt audytowy</DialogTitle>
              <DialogDescription>Określ kategorię, wpisz sprawdzane zagadnienie i podaj wynik.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Kategoria</Label>
                  <Select value={newItem.category} onValueChange={v => setNewItem({...newItem, category: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Ogólne">Ogólne</SelectItem>
                      <SelectItem value="Dokumentacja">Dokumentacja</SelectItem>
                      <SelectItem value="Sprzęt gaśniczy">Sprzęt gaśniczy</SelectItem>
                      <SelectItem value="Ewakuacja">Ewakuacja</SelectItem>
                      <SelectItem value="Instalacje techniczne">Instalacje</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Stan faktyczny</Label>
                  <Select value={newItem.status} onValueChange={v => setNewItem({...newItem, status: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="OK">Zgodne (OK)</SelectItem>
                      <SelectItem value="BŁĄD">Niezgodne (BŁĄD)</SelectItem>
                      <SelectItem value="BRAK">Brak (N/A)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Zagadnienie / Element weryfikowany</Label>
                <Input value={newItem.question} onChange={e => setNewItem({...newItem, question: e.target.value})} placeholder="np. Oznakowanie dróg ewakuacyjnych..." required />
              </div>
              <div className="space-y-2">
                <Label>Uwagi / Zalecenia</Label>
                <Textarea value={newItem.notes} onChange={e => setNewItem({...newItem, notes: e.target.value})} placeholder="Zauważone usterki, wymiana baterii..." />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>Anuluj</Button>
              <Button type="submit">Zapisz odpowiedź</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
