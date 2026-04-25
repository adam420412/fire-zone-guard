// =============================================================================
// TrainingAttendanceMatrix — tabela frekwencji uczestników szkoleń per obiekt.
// Pokazuje liczbę szkoleń, obecności, nieobecności i % frekwencji.
// Filtrowanie po typie szkolenia.
// =============================================================================
import { useState, useMemo } from "react";
import { useBuildingAttendance, TRAINING_TYPE_LABELS } from "@/hooks/useBuildingTrainings";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart3, Loader2, Search } from "lucide-react";

interface Props { buildingId: string; }

function pctVariant(pct: number, total: number): "default" | "secondary" | "destructive" | "outline" {
  if (total === 0) return "secondary";
  if (pct >= 80) return "default";
  if (pct >= 50) return "outline";
  return "destructive";
}

export default function TrainingAttendanceMatrix({ buildingId }: Props) {
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const { data: rows = [], isLoading } = useBuildingAttendance(buildingId, typeFilter);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) => r.name.toLowerCase().includes(q) || (r.email ?? "").toLowerCase().includes(q),
    );
  }, [rows, search]);

  const summary = useMemo(() => {
    const totals = filtered.reduce(
      (acc, r) => {
        acc.present += r.present;
        acc.absent += r.absent;
        acc.excused += r.excused;
        acc.planned += r.planned;
        return acc;
      },
      { present: 0, absent: 0, excused: 0, planned: 0 },
    );
    const denom = totals.present + totals.absent + totals.excused;
    const pct = denom > 0 ? Math.round((totals.present / denom) * 100) : 0;
    return { ...totals, pct };
  }, [filtered]);

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h4 className="text-base font-semibold flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            Frekwencja uczestników
          </h4>
          <p className="text-xs text-muted-foreground">
            Łączna obecność na szkoleniach PPOŻ w tym obiekcie.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Szukaj uczestnika..."
              className="h-9 pl-8 w-full sm:w-[220px]"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-9 w-full sm:w-[260px]">
              <SelectValue placeholder="Typ szkolenia" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Wszystkie typy szkoleń</SelectItem>
              {Object.entries(TRAINING_TYPE_LABELS).map(([v, l]) => (
                <SelectItem key={v} value={v}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
        <div className="rounded-md border border-border p-2">
          <div className="text-muted-foreground">Uczestników</div>
          <div className="text-lg font-semibold">{filtered.length}</div>
        </div>
        <div className="rounded-md border border-border p-2">
          <div className="text-muted-foreground">Obecności</div>
          <div className="text-lg font-semibold text-success">{summary.present}</div>
        </div>
        <div className="rounded-md border border-border p-2">
          <div className="text-muted-foreground">Nieobecności</div>
          <div className="text-lg font-semibold text-destructive">{summary.absent}</div>
        </div>
        <div className="rounded-md border border-border p-2">
          <div className="text-muted-foreground">Usprawiedliwione</div>
          <div className="text-lg font-semibold">{summary.excused}</div>
        </div>
        <div className="rounded-md border border-border p-2">
          <div className="text-muted-foreground">Średnia frekwencja</div>
          <div className="text-lg font-semibold">{summary.pct}%</div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Brak danych frekwencji {typeFilter !== "all" ? "dla wybranego typu szkolenia" : ""}.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Uczestnik</TableHead>
                <TableHead className="text-center">Szkolenia</TableHead>
                <TableHead className="text-center">Obecny</TableHead>
                <TableHead className="text-center">Nieobecny</TableHead>
                <TableHead className="text-center">Usprawiedl.</TableHead>
                <TableHead className="text-center">Zaplanowane</TableHead>
                <TableHead className="text-right">Frekwencja</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => {
                const denom = r.present + r.absent + r.excused;
                return (
                  <TableRow key={r.participantKey}>
                    <TableCell>
                      <div className="font-medium">{r.name}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2">
                        {r.email && <span>{r.email}</span>}
                        <Badge variant="outline" className="text-[10px] py-0 px-1.5">
                          {r.kind === "employee" ? "pracownik" : r.kind === "user" ? "konto" : "gość"}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">{r.total}</TableCell>
                    <TableCell className="text-center text-success font-medium">{r.present}</TableCell>
                    <TableCell className="text-center text-destructive">{r.absent}</TableCell>
                    <TableCell className="text-center">{r.excused}</TableCell>
                    <TableCell className="text-center text-muted-foreground">{r.planned}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={pctVariant(r.attendancePct, denom)}>
                        {denom > 0 ? `${r.attendancePct}%` : "—"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
