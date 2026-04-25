// BulkImportPage — Iter 9
// Bulk import obiektow / firm / urzadzen z plikow Excel (.xlsx) lub CSV.
// Pipeline:
//   1. user wybiera typ encji (companies | buildings)
//   2. wgrywa plik (SheetJS parsuje pierwszy sheet)
//   3. mapowanie kolumn -> pola encji (auto-detect po naglowku)
//   4. preview pierwszych N wierszy + walidacja (required fields)
//   5. import w batchach (chunk 50) z progress barem + skip-on-error
//   6. raport: zaimportowane / pominiete / bledy
//
// Tylko super_admin (role gate w komponencie).
import { useMemo, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import * as XLSX from "xlsx";
import { useAuth } from "@/hooks/useAuth";
import { useCompanies } from "@/hooks/useSupabaseData";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  ArrowLeft, FileSpreadsheet, Upload, CheckCircle2, XCircle, Loader2,
  AlertTriangle, Download,
} from "lucide-react";

type EntityType = "companies" | "buildings";

interface FieldDef {
  key: string;
  label: string;
  required: boolean;
  hint?: string;
  aliases?: string[];
}

const FIELD_DEFS: Record<EntityType, FieldDef[]> = {
  companies: [
    { key: "name", label: "Nazwa firmy", required: true, aliases: ["nazwa", "company", "firma"] },
    { key: "nip",  label: "NIP",         required: false, aliases: ["nip", "tax_id"] },
  ],
  buildings: [
    { key: "name",        label: "Nazwa obiektu",   required: true,  aliases: ["nazwa", "building", "obiekt"] },
    { key: "address",     label: "Adres",           required: false, aliases: ["adres", "ulica", "street"] },
    { key: "city",        label: "Miasto",          required: false, aliases: ["miasto", "city"] },
    { key: "postal_code", label: "Kod pocztowy",    required: false, aliases: ["kod", "zip", "postal"] },
    { key: "company_id",  label: "Firma (UUID lub nazwa)", required: false, aliases: ["company", "firma"] },
    { key: "area_m2",     label: "Powierzchnia (m2)", required: false, aliases: ["area", "powierzchnia", "m2"] },
    { key: "category",    label: "Klasa / kategoria", required: false, aliases: ["klasa", "category", "class"] },
  ],
};

interface ImportReport {
  inserted: number;
  skipped: number;
  errors: Array<{ row: number; reason: string }>;
}

export default function BulkImportPage() {
  const { role } = useAuth();
  // All hooks BEFORE any conditional return (rules-of-hooks).
  const [entity, setEntity] = useState<EntityType>("buildings");
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({}); // field.key -> header
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [report, setReport] = useState<ImportReport | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { data: companies } = useCompanies();

  const fields = FIELD_DEFS[entity];

  // Auto-map after upload
  const autoMap = (hdrs: string[]): Record<string, string> => {
    const m: Record<string, string> = {};
    fields.forEach(f => {
      const lower = hdrs.map(h => String(h).toLowerCase().trim());
      // exact key match
      let idx = lower.findIndex(h => h === f.key);
      // alias match
      if (idx === -1 && f.aliases) {
        idx = lower.findIndex(h => f.aliases!.some(a => h.includes(a.toLowerCase())));
      }
      if (idx >= 0) m[f.key] = hdrs[idx];
    });
    return m;
  };

  const handleFile = async (file: File) => {
    setReport(null);
    setProgress(0);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });
      if (json.length === 0) {
        toast.error("Plik jest pusty.");
        return;
      }
      const hdrs = Object.keys(json[0] ?? {});
      setHeaders(hdrs);
      setRows(json);
      setMapping(autoMap(hdrs));
      toast.success(`Wczytano ${json.length} wierszy z ${file.name}`);
    } catch (err: any) {
      toast.error(`Blad parsowania: ${err.message}`);
    }
  };

  const previewRows = useMemo(() => rows.slice(0, 8), [rows]);

  // Resolve company by name -> UUID (cache lookup)
  const companiesByName = useMemo(() => {
    const m = new Map<string, string>();
    (companies ?? []).forEach((c: any) => m.set(String(c.name).toLowerCase().trim(), c.id));
    return m;
  }, [companies]);

  const buildPayload = (row: Record<string, any>): Record<string, any> | null => {
    const payload: Record<string, any> = {};
    for (const f of fields) {
      const col = mapping[f.key];
      const raw = col ? row[col] : undefined;
      let val: any = raw === "" || raw == null ? null : raw;

      // Type coercion
      if (val != null && f.key === "area_m2") {
        const n = Number(String(val).replace(",", "."));
        val = Number.isFinite(n) ? n : null;
      }
      if (val != null && f.key === "company_id") {
        // If looks like UUID, keep. Otherwise look up by name.
        const s = String(val).trim();
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(s)) {
          val = s;
        } else {
          val = companiesByName.get(s.toLowerCase()) ?? null;
        }
      }
      payload[f.key] = val;
    }
    // Validate required
    for (const f of fields) {
      if (f.required && (payload[f.key] == null || payload[f.key] === "")) {
        return null; // missing required
      }
    }
    return payload;
  };

  const runImport = async () => {
    setImporting(true);
    setReport(null);
    const rep: ImportReport = { inserted: 0, skipped: 0, errors: [] };
    const CHUNK = 50;
    const total = rows.length;

    try {
      for (let i = 0; i < total; i += CHUNK) {
        const slice = rows.slice(i, i + CHUNK);
        const payloads: Record<string, any>[] = [];

        slice.forEach((row, j) => {
          const p = buildPayload(row);
          if (!p) {
            rep.skipped += 1;
            rep.errors.push({ row: i + j + 2, reason: "Brak wymaganego pola" });
          } else {
            payloads.push(p);
          }
        });

        if (payloads.length > 0) {
          const { error, data } = await supabase
            .from(entity)
            .insert(payloads as any)
            .select("id");
          if (error) {
            rep.errors.push({ row: i + 2, reason: `Batch err: ${error.message}` });
            rep.skipped += payloads.length;
          } else {
            rep.inserted += data?.length ?? payloads.length;
          }
        }

        setProgress(Math.round(((i + slice.length) / total) * 100));
      }
      setReport(rep);
      if (rep.errors.length === 0) {
        toast.success(`Zaimportowano ${rep.inserted} rekordow.`);
      } else {
        toast.warning(`Zaimportowano ${rep.inserted}, pominieto ${rep.skipped}.`);
      }
    } catch (err: any) {
      toast.error(`Krytyczny blad: ${err.message}`);
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    const tmpl = fields.map(f => ({ [f.label]: f.required ? `<${f.key}>` : "" }))
      .reduce((acc, o) => ({ ...acc, ...o }), {});
    const ws = XLSX.utils.json_to_sheet([tmpl]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Szablon");
    XLSX.writeFile(wb, `szablon_${entity}.xlsx`);
  };

  const requiredOk = fields.filter(f => f.required).every(f => mapping[f.key]);
  const canImport = rows.length > 0 && requiredOk && !importing;

  // Guard AFTER all hooks (rules-of-hooks safe)
  if (role !== "super_admin") return <Navigate to="/" replace />;

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-10">
      <div className="flex items-center gap-4">
        <Link to="/admin">
          <Button variant="outline" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FileSpreadsheet className="h-6 w-6 text-primary" />
            Bulk import z Excela
          </h1>
          <p className="text-muted-foreground text-sm">
            Wgraj plik <code>.xlsx</code> lub <code>.csv</code> i zmapuj kolumny na pola w bazie.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={downloadTemplate} className="ml-auto">
          <Download className="mr-2 h-4 w-4" /> Pobierz szablon
        </Button>
      </div>

      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Typ encji</Label>
              <Select value={entity} onValueChange={(v) => { setEntity(v as EntityType); setRows([]); setMapping({}); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="buildings">Obiekty (buildings)</SelectItem>
                  <SelectItem value="companies">Firmy (companies)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Plik (.xlsx, .xls, .csv)</Label>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-primary-foreground file:cursor-pointer cursor-pointer"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {rows.length > 0 && (
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Mapowanie kolumn</h2>
              <Badge variant="outline">{rows.length} wierszy w pliku</Badge>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              {fields.map(f => (
                <div key={f.key} className="space-y-1">
                  <Label className="flex items-center gap-1.5 text-xs">
                    {f.label}
                    {f.required && <span className="text-critical">*</span>}
                  </Label>
                  <Select value={mapping[f.key] ?? "__none__"} onValueChange={(v) => setMapping(m => ({ ...m, [f.key]: v === "__none__" ? "" : v }))}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="-- nie mapuj --" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">-- nie mapuj --</SelectItem>
                      {headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            {!requiredOk && (
              <div className="flex items-center gap-2 text-xs text-warning bg-warning/10 border border-warning/30 rounded-md p-3">
                <AlertTriangle className="h-4 w-4" />
                Brakuje mapowania dla wymaganych pol: {fields.filter(f => f.required && !mapping[f.key]).map(f => f.label).join(", ")}
              </div>
            )}

            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {fields.map(f => <TableHead key={f.key} className="text-xs">{f.label}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewRows.map((row, i) => (
                    <TableRow key={i}>
                      {fields.map(f => {
                        const col = mapping[f.key];
                        const v = col ? row[col] : "";
                        return <TableCell key={f.key} className="text-xs">{String(v ?? "")}</TableCell>;
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {rows.length > previewRows.length && (
                <div className="p-2 text-center text-[11px] text-muted-foreground border-t">
                  ...i {rows.length - previewRows.length} kolejnych wierszy
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button onClick={runImport} disabled={!canImport}>
                {importing
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Importowanie...</>
                  : <><Upload className="mr-2 h-4 w-4" /> Importuj {rows.length} wierszy</>}
              </Button>
            </div>

            {importing && <Progress value={progress} className="h-2" />}
          </CardContent>
        </Card>
      )}

      {report && (
        <Card>
          <CardContent className="p-6 space-y-3">
            <h2 className="font-semibold flex items-center gap-2">
              {report.errors.length === 0
                ? <CheckCircle2 className="h-5 w-5 text-success" />
                : <AlertTriangle className="h-5 w-5 text-warning" />}
              Raport importu
            </h2>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="rounded-md border p-3 text-center">
                <div className="text-2xl font-bold text-success">{report.inserted}</div>
                <div className="text-xs text-muted-foreground mt-1">Zaimportowane</div>
              </div>
              <div className="rounded-md border p-3 text-center">
                <div className="text-2xl font-bold text-warning">{report.skipped}</div>
                <div className="text-xs text-muted-foreground mt-1">Pominiete</div>
              </div>
              <div className="rounded-md border p-3 text-center">
                <div className="text-2xl font-bold text-critical">{report.errors.length}</div>
                <div className="text-xs text-muted-foreground mt-1">Bledy</div>
              </div>
            </div>
            {report.errors.length > 0 && (
              <div className="rounded-md border border-critical/30 bg-critical/5 p-3 max-h-64 overflow-y-auto">
                <ul className="text-xs space-y-1">
                  {report.errors.slice(0, 50).map((e, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <XCircle className="h-3 w-3 text-critical shrink-0 mt-0.5" />
                      <span>Wiersz {e.row}: {e.reason}</span>
                    </li>
                  ))}
                  {report.errors.length > 50 && (
                    <li className="text-muted-foreground italic">...i {report.errors.length - 50} kolejnych</li>
                  )}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
