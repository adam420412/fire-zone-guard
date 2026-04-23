import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ChevronLeft, Save, Plus, Printer, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProtocols, useHydrantMeasurements, useCreateHydrantMeasurement, useDeleteHydrantMeasurement } from "@/hooks/useSupabaseData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { generateProtocolPDF, detectProtocolType } from "@/lib/pdfProtocols";
import { useAuth } from "@/hooks/useAuth";
import { SignatureDialog } from "@/components/SignatureDialog";

export default function ProtocolDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: protocols } = useProtocols();
  const { data: measurements } = useHydrantMeasurements(id as string);
  const { mutate: createMeasurement } = useCreateHydrantMeasurement();
  const { mutate: deleteMeasurement } = useDeleteHydrantMeasurement();
  const { role } = useAuth();
  const isSuperAdmin = role === 'super_admin';

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isSignatureOpen, setIsSignatureOpen] = useState(false);
  const [newHydrant, setNewHydrant] = useState({
    hydrant_number: "HZ-1",
    type: "nadziemny",
    dn_diameter: "80",
    static_pressure_mpa: "",
    dynamic_pressure_mpa: "",
    flow_rate_dm3s: ""
  });
  
  const protocol = protocols?.find(p => p.id === id);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createMeasurement({
      protocol_id: id,
      ...newHydrant,
      dn_diameter: parseInt(newHydrant.dn_diameter),
      static_pressure_mpa: parseFloat(newHydrant.static_pressure_mpa) || null,
      dynamic_pressure_mpa: parseFloat(newHydrant.dynamic_pressure_mpa) || null,
      flow_rate_dm3s: parseFloat(newHydrant.flow_rate_dm3s) || null
    }, {
      onSuccess: () => {
        toast.success("Punkt dodany");
        setIsAddOpen(false);
        // Auto-increment the hydrant number for the next one
        const match = newHydrant.hydrant_number.match(/^(.*?)(\d+)$/);
        if (match) {
          setNewHydrant(prev => ({ ...prev, hydrant_number: `${match[1]}${parseInt(match[2]) + 1}`, static_pressure_mpa: "", dynamic_pressure_mpa: "", flow_rate_dm3s: "" }));
        }
      }
    });
  };

  const handleStartPDF = () => {
    if (!protocol) return;
    setIsSignatureOpen(true);
  };

  const handleGeneratePDF = (signatureDataUrl: string) => {
    setIsSignatureOpen(false);
    if (!protocol) return;

    // Per-type dispatcher: picks the right column layout (hydranty / gaśnice /
    // SSP / oświetlenie / drzwi / klapy / DSO / oddymianie) based on
    // protocol.type, falling back to a generic table for unknown types.
    generateProtocolPDF({
      protocolType: detectProtocolType(protocol.type),
      protocol: {
        building_name:        (protocol as any).building_name ?? null,
        building_address:     (protocol as any).building_address ?? null,
        inspector_name:       protocol.inspector_name ?? null,
        performed_at:         protocol.performed_at ?? null,
        next_inspection_due:  (protocol as any).next_inspection_due ?? null,
        protocol_number:      (protocol as any).protocol_number ?? null,
        type:                 protocol.type ?? null,
        notes:                protocol.notes ?? null,
        overall_result:       protocol.overall_result ?? null,
      },
      measurements: (measurements ?? []) as Record<string, unknown>[],
      signatureDataUrl,
    });
  };

  if (!protocol) return <div>Ładowanie...</div>;

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-10">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={() => navigate("/protocols")}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Karta Protokołu</h1>
          <p className="text-muted-foreground">{protocol.type} - {protocol.building_name}</p>
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={handleStartPDF}>
            <Printer className="mr-2 h-4 w-4" />
            Pobierz PDF
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
              <Input value={protocol.status} readOnly />
            </div>
            <div className="grid gap-2">
              <Label>Data przeglądu</Label>
              <Input type="date" value={protocol.performed_at} readOnly />
            </div>
            <div className="grid gap-2">
              <Label>Inspektor</Label>
              <Input value={protocol.inspector_name || ""} readOnly />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Wnioski i wynik</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label>Wynik inspekcji</Label>
              <Input value={protocol.overall_result || ""} readOnly className="text-emerald-600 font-bold" />
            </div>
            <div className="grid gap-2">
              <Label>Uwagi</Label>
              <Input value={protocol.notes || "Brak uwag."} readOnly />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Tabela Pomiarów</CardTitle>
          {isSuperAdmin && (
            <Button size="sm" variant="secondary" onClick={() => setIsAddOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Kolejny punkt
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {(!measurements || measurements.length === 0) ? (
            <div className="text-center py-10 text-muted-foreground border-2 border-dashed rounded-md">
              <p>Brak punktów pomiarowych.</p>
              <p className="text-sm">Kliknij "Kolejny punkt", aby dodać pierwszy pomiar (np. HZ-1).</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lp.</TableHead>
                  <TableHead>Oznak.</TableHead>
                  <TableHead>Rodzaj</TableHead>
                  <TableHead>Średnica DN</TableHead>
                  <TableHead>Ciśnienie stat. (MPa)</TableHead>
                  <TableHead>Ciśnienie dynam. (MPa)</TableHead>
                  <TableHead>Wydajność (dm³/s)</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {measurements.map((m: any, index: number) => (
                  <TableRow key={m.id}>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell className="font-medium">{m.hydrant_number}</TableCell>
                    <TableCell>{m.type}</TableCell>
                    <TableCell>{m.dn_diameter}</TableCell>
                    <TableCell>{m.static_pressure_mpa || "-"}</TableCell>
                    <TableCell>{m.dynamic_pressure_mpa || "-"}</TableCell>
                    <TableCell>{m.flow_rate_dm3s || "-"}</TableCell>
                    <TableCell>
                      {isSuperAdmin && (
                        <Button variant="ghost" size="icon" onClick={() => deleteMeasurement({ id: m.id, protocol_id: id as string })}>
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
              <DialogTitle>Dodaj Punkt Pomiarowy</DialogTitle>
              <DialogDescription>Wprowadź dane z próby ciśnieniowej i wydajnościowej dla wybranego urządzenia.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Oznakowanie</Label>
                  <Input value={newHydrant.hydrant_number} onChange={e => setNewHydrant({...newHydrant, hydrant_number: e.target.value})} required />
                </div>
                <div className="space-y-2">
                  <Label>Rodzaj</Label>
                  <Select value={newHydrant.type} onValueChange={v => setNewHydrant({...newHydrant, type: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nadziemny">Nadziemny</SelectItem>
                      <SelectItem value="podziemny">Podziemny</SelectItem>
                      <SelectItem value="wewnętrzny">Wewnętrzny</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Średnica DN</Label>
                  <Select value={newHydrant.dn_diameter} onValueChange={v => setNewHydrant({...newHydrant, dn_diameter: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="33">33</SelectItem>
                      <SelectItem value="52">52</SelectItem>
                      <SelectItem value="80">80</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Statyczne (MPa)</Label>
                  <Input type="number" step="0.01" value={newHydrant.static_pressure_mpa} onChange={e => setNewHydrant({...newHydrant, static_pressure_mpa: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label>Dynamiczne (MPa)</Label>
                  <Input type="number" step="0.01" value={newHydrant.dynamic_pressure_mpa} onChange={e => setNewHydrant({...newHydrant, dynamic_pressure_mpa: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label>Wydajność (dm³/s)</Label>
                  <Input type="number" step="0.01" value={newHydrant.flow_rate_dm3s} onChange={e => setNewHydrant({...newHydrant, flow_rate_dm3s: e.target.value})} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>Anuluj</Button>
              <Button type="submit">Zapisz punkt</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      
      <SignatureDialog 
        open={isSignatureOpen} 
        onOpenChange={setIsSignatureOpen} 
        onConfirm={handleGeneratePDF} 
        title="Podpisz Protokół Serwisowy" 
      />
    </div>
  );
}
