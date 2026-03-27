import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ChevronLeft, Save, Plus, Printer, Trash2, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAudits, useAuditChecklists, useCreateChecklist, useDeleteChecklist, useUpdateChecklist, useBatchCreateChecklist } from "@/hooks/useSupabaseData";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { generateReportPDF } from "@/lib/pdfGenerator";
import { useAuth } from "@/hooks/useAuth";
import { AUDIT_TEMPLATES } from "@/lib/auditTemplates";
import { SignatureDialog } from "@/components/SignatureDialog";

export default function AuditDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: audits } = useAudits();
  const { data: checklists } = useAuditChecklists(id as string);
  const { mutate: createChecklist } = useCreateChecklist();
  const { mutate: deleteChecklist } = useDeleteChecklist();
  const { mutate: updateChecklist } = useUpdateChecklist();
  const { mutate: batchCreateChecklist } = useBatchCreateChecklist();
  
  const { role } = useAuth();
  const isSuperAdmin = role === 'super_admin' || role === 'inspektor' || role === 'audytor';

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isTemplateOpen, setIsTemplateOpen] = useState(false);
  const [isSignatureOpen, setIsSignatureOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [newItem, setNewItem] = useState({ category: "Ogólne", question: "", status: "BRAK", notes: "" });
  
  const audit = audits?.find(a => a.id === id);

  const stats = useMemo(() => {
    if (!checklists || checklists.length === 0) return { total: 0, completed: 0, percent: 0, ok: 0, error: 0 };
    const total = checklists.length;
    const completed = checklists.filter((c: any) => c.status !== "BRAK").length;
    const ok = checklists.filter((c: any) => c.status === "OK" || c.status === "Zgodne").length;
    const error = checklists.filter((c: any) => c.status === "BŁĄD" || c.status === "Niezgodne").length;
    const percent = Math.round((completed / total) * 100);
    return { total, completed, percent, ok, error };
  }, [checklists]);

  const groupedChecklists = useMemo(() => {
    if (!checklists) return {};
    return checklists.reduce((acc: any, item: any) => {
      if (!acc[item.category]) acc[item.category] = [];
      acc[item.category].push(item);
      return acc;
    }, {});
  }, [checklists]);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createChecklist({ audit_id: id, ...newItem }, {
      onSuccess: () => {
        toast.success("Punkt dodany do audytu");
        setIsAddOpen(false);
        setNewItem({ ...newItem, question: "", notes: "" });
      }
    });
  };

  const handleImportTemplate = () => {
    if (!selectedTemplate || !AUDIT_TEMPLATES[selectedTemplate as keyof typeof AUDIT_TEMPLATES]) {
      toast.error("Wybierz poprawny szablon");
      return;
    }
    const template = AUDIT_TEMPLATES[selectedTemplate as keyof typeof AUDIT_TEMPLATES];
    batchCreateChecklist({
      audit_id: id as string,
      items: template.items
    }, {
      onSuccess: () => {
        toast.success(`Wczytano szablon: ${template.name}`);
        setIsTemplateOpen(false);
      }
    });
  };

  const handleStatusChange = (itemId: string, newStatus: string) => {
    updateChecklist({ id: itemId, audit_id: id as string, updates: { status: newStatus } });
  };

  const handleNotesChange = (itemId: string, newNotes: string) => {
    updateChecklist({ id: itemId, audit_id: id as string, updates: { notes: newNotes } });
  };

  const handleStartPDF = () => {
    if (!audit) return;
    setIsSignatureOpen(true);
  };

  const handleGeneratePDF = (signatureDataUrl: string) => {
    setIsSignatureOpen(false);
    if (!audit) return;
    const tableData = checklists?.map((c: any, index: number) => [
      index + 1, c.category, c.question, c.status, c.notes || "-"
    ]) || [];
    generateReportPDF({
      title: "RAPORT Z AUDYTU",
      filename: `Audyt_${audit.building_name.replace(/\s+/g, '_')}_${audit.scheduled_for}.pdf`,
      metadata: [
        { label: "Obiekt", value: audit.building_name },
        { label: "Data wykonania", value: new Date(audit.scheduled_for).toLocaleDateString("pl-PL") },
        { label: "Audytor", value: audit.auditor_name || "Brak" },
        { label: "Status inspekcji", value: audit.status }
      ],
      tableColumns: ["Lp.", "Kategoria", "Spr. element", "Ocena", "Uwagi"],
      tableData,
      result: `Ukończono ${stats.percent}%. Zgodne: ${stats.ok}, Niezgodne: ${stats.error}`,
      signatureDataUrl
    });
  };

  if (!audit) return <div>Ładowanie...</div>;

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-10">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={() => navigate("/audits")}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Kreator Audytu</h1>
          <p className="text-muted-foreground">{audit.building_name} ({audit.type})</p>
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={handleStartPDF}>
            <Printer className="mr-2 h-4 w-4" /> Dowód audytu (PDF)
          </Button>
          <Button>
            <Save className="mr-2 h-4 w-4" /> Zakończ audyt
          </Button>
        </div>
      </div>

      <div className="grid md:grid-cols-4 gap-6">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>Postęp</CardTitle>
            <CardDescription>Ukończenie zagadnień</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm font-medium">
                <span>Wypełniono</span>
                <span>{stats.percent}% ({stats.completed}/{stats.total})</span>
              </div>
              <Progress value={stats.percent} className="h-2" />
            </div>
            <div className="grid grid-cols-2 gap-2 text-center text-sm pt-4">
              <div className="p-2 bg-green-100 text-green-800 rounded-md">
                <p className="font-bold text-lg">{stats.ok}</p>
                <p>Zgodne (OK)</p>
              </div>
              <div className="p-2 bg-red-100 text-red-800 rounded-md">
                <p className="font-bold text-lg">{stats.error}</p>
                <p>Niezgodne</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-3">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Checklista Audytu</CardTitle>
              <CardDescription>Odpowiadaj na pytania w poniższych kategoriach</CardDescription>
            </div>
            <div className="flex gap-2">
              {isSuperAdmin && (
                <>
                  <Button size="sm" variant="outline" onClick={() => setIsTemplateOpen(true)}>
                    <FileDown className="mr-2 h-4 w-4" /> Szablony
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setIsAddOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" /> Dodaj punkt
                  </Button>
                </>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {(!checklists || checklists.length === 0) ? (
              <div className="text-center py-10 text-muted-foreground border-2 border-dashed rounded-md">
                <p>Checklista jest pusta.</p>
                <p className="text-sm">Kliknij "Szablony" aby załadować predefiniowane pytania, lub "Dodaj punkt".</p>
              </div>
            ) : (
              <Accordion type="multiple" defaultValue={Object.keys(groupedChecklists)} className="w-full">
                {Object.entries(groupedChecklists).map(([category, items]: [string, any]) => {
                  const c_total = items.length;
                  const c_completed = items.filter((i:any) => i.status !== "BRAK").length;
                  return (
                    <AccordionItem value={category} key={category} className="border rounded-md mb-2 px-4 shadow-sm bg-white">
                      <AccordionTrigger className="hover:no-underline py-3">
                        <div className="flex items-center justify-between w-full pr-4">
                          <span className="font-semibold text-lg">{category}</span>
                          <span className="text-sm font-normal text-muted-foreground hover:bg-slate-100 px-2 py-1 rounded">
                            Wypełniono: {c_completed}/{c_total}
                          </span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[45%]">Sprawdzany element</TableHead>
                              <TableHead className="w-[20%]">Ocena</TableHead>
                              <TableHead className="w-[30%]">Uwagi</TableHead>
                              <TableHead className="w-[5%]"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {items.map((c: any) => (
                              <TableRow key={c.id}>
                                <TableCell className="font-medium align-top py-4">{c.question}</TableCell>
                                <TableCell className="align-top py-3">
                                  <Select 
                                    defaultValue={c.status} 
                                    onValueChange={(val) => handleStatusChange(c.id, val)}
                                  >
                                    <SelectTrigger className={`h-8 w-full ${c.status === 'OK' ? 'border-green-500 bg-green-50 text-green-700' : c.status === 'BŁĄD' ? 'border-red-500 bg-red-50 text-red-700' : 'bg-slate-50'}`}>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="OK" className="text-green-600 font-medium">Zgodne (OK)</SelectItem>
                                      <SelectItem value="BŁĄD" className="text-red-600 font-medium">Niezgodne (BŁĄD)</SelectItem>
                                      <SelectItem value="BRAK" className="text-slate-500">Brak decyzji (N/A)</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </TableCell>
                                <TableCell className="align-top py-3">
                                  <Input 
                                    defaultValue={c.notes || ""}
                                    placeholder="Wpisz uwagi..."
                                    className="h-8 text-sm"
                                    onBlur={(e) => {
                                      if (e.target.value !== c.notes) {
                                        handleNotesChange(c.id, e.target.value);
                                      }
                                    }}
                                  />
                                </TableCell>
                                <TableCell className="align-top py-3 text-right">
                                  {isSuperAdmin && (
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive opacity-50 hover:opacity-100" onClick={() => deleteChecklist({ id: c.id, audit_id: id as string })}>
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </AccordionContent>
                    </AccordionItem>
                  )
                })}
              </Accordion>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent>
          <form onSubmit={handleCreate}>
            <DialogHeader>
              <DialogTitle>Dodaj własny punkt audytowy</DialogTitle>
              <DialogDescription>Określ kategorię i zagadnienie, które nie znajduje się w standardowym szablonie.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Kategoria</Label>
                  <Input value={newItem.category} onChange={e => setNewItem({...newItem, category: e.target.value})} placeholder="np. Ogólne" required />
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
                <Input value={newItem.question} onChange={e => setNewItem({...newItem, question: e.target.value})} placeholder="np. Oznakowanie szyb..." required />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>Anuluj</Button>
              <Button type="submit">Zapisz punkt</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isTemplateOpen} onOpenChange={setIsTemplateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Wygeneruj z szablonu</DialogTitle>
            <DialogDescription>Wybierz standardowy szablon PPOŻ. Pytania zostaną dodane do obecnego audytu.</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label>Dostępne szablony</Label>
            <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
              <SelectTrigger className="mt-2">
                <SelectValue placeholder="Wybierz szablon..." />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(AUDIT_TEMPLATES).map(([key, template]) => (
                  <SelectItem key={key} value={key}>{template.name} ({template.items.length} pytań)</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsTemplateOpen(false)}>Anuluj</Button>
            <Button onClick={handleImportTemplate}>Importuj pytania</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SignatureDialog 
        open={isSignatureOpen} 
        onOpenChange={setIsSignatureOpen} 
        onConfirm={handleGeneratePDF} 
        title="Podpisz Raport Audytu" 
      />
    </div>
  );
}
