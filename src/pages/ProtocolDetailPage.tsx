import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ChevronLeft, Plus, Printer, Trash2, Sparkles, Loader2, Hammer, Wrench, PenLine, CheckCircle2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useProtocols, useHydrantMeasurements, useCreateHydrantMeasurement, useDeleteHydrantMeasurement, useToggleHydrantRepair } from "@/hooks/useSupabaseData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { generateProtocolPDF, detectProtocolType } from "@/lib/pdfProtocols";
import { useAuth } from "@/hooks/useAuth";
import { useAiProtocolDraft } from "@/hooks/useAiProtocolDraft";
import { SignatureDialog } from "@/components/SignatureDialog";

// ---- Iter 9: persist e-signature in storage + service_protocols row ----
function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, b64] = dataUrl.split(",");
  const mime = /data:(.*?);base64/.exec(meta)?.[1] ?? "image/png";
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

function useSaveProtocolSignature() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      protocolId: string;
      role: "inspector" | "client";
      dataUrl: string;
      signerName?: string;
    }) => {
      const blob = dataUrlToBlob(params.dataUrl);
      const fname = `${params.protocolId}/${params.role}-${crypto.randomUUID()}.png`;
      const { error: upErr } = await supabase.storage
        .from("protocol-signatures")
        .upload(fname, blob, { contentType: "image/png", upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("protocol-signatures").getPublicUrl(fname);
      const url = pub.publicUrl;

      const updates: Record<string, any> =
        params.role === "inspector"
          ? { inspector_signature_url: url, inspector_signed_at: new Date().toISOString() }
          : {
              client_signature_url: url,
              client_signed_at: new Date().toISOString(),
              client_signer_name: params.signerName ?? null,
            };
      const { error: dbErr } = await supabase
        .from("service_protocols")
        .update(updates as any)
        .eq("id", params.protocolId);
      if (dbErr) throw dbErr;
      return url;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["service_protocols"] });
    },
  });
}

export default function ProtocolDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: protocols } = useProtocols();
  const { data: measurements } = useHydrantMeasurements(id as string);
  const { mutate: createMeasurement } = useCreateHydrantMeasurement();
  const { mutate: deleteMeasurement } = useDeleteHydrantMeasurement();
  const { mutate: toggleRepair, isPending: togglingRepair } = useToggleHydrantRepair();
  const [repairDialogFor, setRepairDialogFor] = useState<any | null>(null);
  const [repairNotes, setRepairNotes] = useState("");
  const { role } = useAuth();
  const isSuperAdmin = role === 'super_admin';

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isSignatureOpen, setIsSignatureOpen] = useState(false);
  // Iter 9: persistent dual e-signatures (inspector + client) on the protocol
  const saveSig = useSaveProtocolSignature();
  const [sigDialog, setSigDialog] = useState<{ open: boolean; role: "inspector" | "client" }>({ open: false, role: "inspector" });
  const [clientSignerName, setClientSignerName] = useState("");
  // Faza 4 — AI draft of "uwagi szczegółowe" + suggested overall_result.
  const [isDraftOpen, setIsDraftOpen] = useState(false);
  const draftMut = useAiProtocolDraft();
  const [newHydrant, setNewHydrant] = useState({
    hydrant_number: "HZ-1",
    type: "nadziemny",
    dn_diameter: "80",
    static_pressure_mpa: "",
    dynamic_pressure_mpa: "",
    flow_rate_dm3s: ""
  });
  
  const protocol = protocols?.find(p => p.id === id);
  const protocolsLoading = protocols === undefined;

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

  const handleAiDraft = async () => {
    if (!id) return;
    setIsDraftOpen(true);
    draftMut.reset();
    try {
      await draftMut.mutateAsync(id);
    } catch (err: any) {
      toast.error(err?.message ?? "AI draft nie powiódł się");
    }
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

  if (protocolsLoading) {
    return (
      <div className="flex h-64 items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Ładowanie protokołu...
      </div>
    );
  }
  if (!protocol) {
    return (
      <div className="space-y-4 p-6 text-center">
        <p className="text-sm text-muted-foreground">Nie znaleziono protokołu o tym identyfikatorze.</p>
        <Button variant="outline" onClick={() => navigate("/protocols")}>
          <ChevronLeft className="mr-2 h-4 w-4" /> Wróć do listy protokołów
        </Button>
      </div>
    );
  }

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
          {isSuperAdmin && (
            <Button variant="outline" onClick={handleAiDraft} disabled={draftMut.isPending} className="gap-2">
              {draftMut.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Sparkles className="h-4 w-4 text-orange-500" />}
              AI draft
            </Button>
          )}
          <Button variant="outline" onClick={handleStartPDF}>
            <Printer className="mr-2 h-4 w-4" />
            Pobierz PDF
          </Button>
          {/* Iter 8 audit: usunięto martwy przycisk „Zapisz zmiany" — wszystkie pola
              w tej karcie są readOnly, edycja danych protokołu odbywa się w
              `ProtocolsPage` (modal). */}
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

      {/* Iter 9 — E-podpisy protokołu (inspector + klient) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PenLine className="h-5 w-5 text-primary" />
            E-podpisy protokołu
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 gap-4">
            {/* Inspector signature */}
            <div className="rounded-md border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Inspektor</Label>
                {(protocol as any).inspector_signed_at && <CheckCircle2 className="h-4 w-4 text-success" />}
              </div>
              {(protocol as any).inspector_signature_url ? (
                <>
                  <img src={(protocol as any).inspector_signature_url} alt="Podpis inspektora" className="h-24 bg-white rounded border object-contain w-full" />
                  <div className="text-[10px] text-muted-foreground">
                    Podpisano: {new Date((protocol as any).inspector_signed_at).toLocaleString("pl")}
                  </div>
                </>
              ) : (
                <div className="h-24 rounded border-2 border-dashed flex items-center justify-center text-xs text-muted-foreground">
                  Brak podpisu
                </div>
              )}
              {isSuperAdmin && (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => setSigDialog({ open: true, role: "inspector" })}
                  disabled={saveSig.isPending}
                >
                  {(protocol as any).inspector_signature_url ? "Złóż ponownie" : "Złóż podpis inspektora"}
                </Button>
              )}
            </div>

            {/* Client signature */}
            <div className="rounded-md border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Klient</Label>
                {(protocol as any).client_signed_at && <CheckCircle2 className="h-4 w-4 text-success" />}
              </div>
              {(protocol as any).client_signature_url ? (
                <>
                  <img src={(protocol as any).client_signature_url} alt="Podpis klienta" className="h-24 bg-white rounded border object-contain w-full" />
                  <div className="text-[10px] text-muted-foreground">
                    {(protocol as any).client_signer_name && <>Podpisał(a): <strong>{(protocol as any).client_signer_name}</strong> · </>}
                    {new Date((protocol as any).client_signed_at).toLocaleString("pl")}
                  </div>
                </>
              ) : (
                <div className="h-24 rounded border-2 border-dashed flex items-center justify-center text-xs text-muted-foreground">
                  Brak podpisu
                </div>
              )}
              <div className="space-y-2">
                <Input
                  value={clientSignerName}
                  onChange={(e) => setClientSignerName(e.target.value)}
                  placeholder="Imię i nazwisko osoby podpisującej"
                  className="h-8 text-xs"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => setSigDialog({ open: true, role: "client" })}
                  disabled={saveSig.isPending || !clientSignerName.trim()}
                >
                  {(protocol as any).client_signature_url ? "Złóż ponownie" : "Złóż podpis klienta"}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

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
                  <TableHead className="text-center">NAPRAWA</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {measurements.map((m: any, index: number) => (
                  <TableRow key={m.id} className={m.repair_needed ? "bg-warning/5" : ""}>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell className="font-medium">{m.hydrant_number}</TableCell>
                    <TableCell>{m.type}</TableCell>
                    <TableCell>{m.dn_diameter}</TableCell>
                    <TableCell>{m.static_pressure_mpa || "-"}</TableCell>
                    <TableCell>{m.dynamic_pressure_mpa || "-"}</TableCell>
                    <TableCell>{m.flow_rate_dm3s || "-"}</TableCell>
                    <TableCell className="text-center">
                      {m.repair_needed ? (
                        <div className="flex items-center justify-center gap-1.5">
                          <Badge variant="destructive" className="gap-1">
                            <Hammer className="h-3 w-3" />
                            NAPRAWA
                          </Badge>
                          {m.repair_task_id && (
                            <Link
                              to="/repairs"
                              title="Otwórz w Naprawach"
                              className="text-[10px] text-primary hover:underline"
                            >
                              →
                            </Link>
                          )}
                        </div>
                      ) : (
                        isSuperAdmin && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setRepairNotes("");
                              setRepairDialogFor(m);
                            }}
                            className="text-warning hover:text-warning hover:bg-warning/10"
                          >
                            <Wrench className="h-4 w-4 mr-1" />
                            Zaznacz
                          </Button>
                        )
                      )}
                    </TableCell>
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
      
      {/* Faza 4 — AI draft dialog. Read-only preview; operator copy-paste'uje
          „Uwagi" do wybranych pól lub bazy. Faktyczny zapis może iść w
          następnej iteracji (mutacja na service_protocols.notes). */}
      <Dialog open={isDraftOpen} onOpenChange={(o) => { if (!o) { setIsDraftOpen(false); draftMut.reset(); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-orange-500" />
              AI: draft protokołu
            </DialogTitle>
            <DialogDescription>
              Wygenerowany przez gpt-4o-mini draft sekcji „Uwagi szczegółowe" + wynik końcowy.
            </DialogDescription>
          </DialogHeader>

          {draftMut.isPending && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Generowanie...
            </div>
          )}

          {draftMut.error && (
            <div className="rounded-md border border-critical/30 bg-critical/10 p-3 text-xs text-critical">
              {draftMut.error.message}
            </div>
          )}

          {draftMut.data && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Uwagi (notes)</Label>
                <Textarea readOnly value={draftMut.data.notes} rows={6} className="mt-1 text-sm" />
              </div>
              <div className="flex items-center gap-3">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Wynik:</Label>
                <span className="font-mono text-sm font-bold">{draftMut.data.overall_result}</span>
              </div>
              {draftMut.data.suggestions.length > 0 && (
                <div>
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Zalecenia</Label>
                  <ul className="mt-1 list-disc list-inside text-sm space-y-1">
                    {draftMut.data.suggestions.map((s, i) => <li key={i}>{s}</li>)}
                  </ul>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    await navigator.clipboard.writeText(draftMut.data!.notes);
                    toast.success("Skopiowano notatki do schowka.");
                  }}
                >
                  Skopiuj uwagi
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <SignatureDialog
        open={isSignatureOpen}
        onOpenChange={setIsSignatureOpen}
        onConfirm={handleGeneratePDF}
        title="Podpisz Protokół Serwisowy"
      />

      {/* Iter 9 — persistent dual signatures (saved to storage + DB) */}
      <SignatureDialog
        open={sigDialog.open}
        onOpenChange={(o) => setSigDialog((s) => ({ ...s, open: o }))}
        title={sigDialog.role === "inspector" ? "Podpis kontrolera" : `Podpis klienta — ${clientSignerName}`}
        onConfirm={(dataUrl) => {
          if (!id) return;
          saveSig.mutate(
            {
              protocolId: id,
              role: sigDialog.role,
              dataUrl,
              signerName: sigDialog.role === "client" ? clientSignerName : undefined,
            },
            {
              onSuccess: () => {
                toast.success("Podpis zapisany.");
                setSigDialog({ open: false, role: sigDialog.role });
                if (sigDialog.role === "client") setClientSignerName("");
              },
              onError: (e: any) => toast.error(e?.message ?? "Błąd zapisu podpisu"),
            }
          );
        }}
      />

      {/* NAPRAWA flag dialog — Faza 5 */}
      <Dialog open={!!repairDialogFor} onOpenChange={(o) => !o && setRepairDialogFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Hammer className="h-5 w-5 text-warning" />
              Zaznacz NAPRAWĘ — {repairDialogFor?.hydrant_number}
            </DialogTitle>
            <DialogDescription>
              Po potwierdzeniu, system automatycznie utworzy zadanie naprawcze w
              <Link to="/repairs" className="text-primary hover:underline ml-1">Naprawach</Link>{" "}
              (źródło: protokół serwisowy). Inspektor potwierdza, że urządzenie wymaga
              wymiany lub serwisu warsztatowego.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-3">
            <Label htmlFor="repair_notes">Uwagi inspektora (trafią do opisu zadania)</Label>
            <Textarea
              id="repair_notes"
              value={repairNotes}
              onChange={(e) => setRepairNotes(e.target.value)}
              placeholder="np. korpus skorodowany, brak ciśnienia, do wymiany wąż"
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRepairDialogFor(null)} disabled={togglingRepair}>
              Anuluj
            </Button>
            <Button
              variant="default"
              disabled={togglingRepair}
              onClick={() => {
                if (!repairDialogFor) return;
                toggleRepair(
                  {
                    id: repairDialogFor.id,
                    protocol_id: id as string,
                    repair_needed: true,
                    repair_notes: repairNotes || null,
                  },
                  {
                    onSuccess: () => {
                      toast.success("Zaznaczono NAPRAWĘ — zadanie utworzone w Naprawach.");
                      setRepairDialogFor(null);
                    },
                    onError: (e: any) => toast.error(e?.message ?? "Błąd"),
                  }
                );
              }}
            >
              {togglingRepair ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Hammer className="mr-2 h-4 w-4" />}
              Potwierdź NAPRAWĘ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
