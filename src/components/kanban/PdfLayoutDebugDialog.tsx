/**
 * PDF Layout Debug Dialog
 *
 * Pokazuje obok siebie:
 *  - lewy panel: wygenerowany PDF Kanban w `<iframe>` (renderowany przez przeglądarkę),
 *  - prawy panel: interaktywny `KanbanPdfLayoutReport` — sekcja po sekcji + per-strona,
 *    z agregatami totals i wartościami spacing.
 *
 * Cel: szybka diagnostyka różnic w odstępach / paginacji bez pobierania pliku
 * i bez czytania surowego JSON-a w testach snapshotowych.
 *
 * Uwaga: render PDF leci przez te same `buildKanbanPdf` co eksport produkcyjny —
 * dialog NIE duplikuje logiki układu.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Loader2, Download, RefreshCcw } from "lucide-react";
import {
  buildKanbanPdf,
  type KanbanPdfColumn,
  type KanbanPdfGroup,
  type KanbanPdfLayoutReport,
  type KanbanPdfSpacing,
} from "@/lib/kanbanPdfExport";
import { cn } from "@/lib/utils";

export type PdfLayoutDebugDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: KanbanPdfGroup[];
  columns: KanbanPdfColumn[];
  groupBy: string;
  groupByLabel: Record<string, string>;
  metaLines?: string[];
  spacing?: KanbanPdfSpacing;
};

export function PdfLayoutDebugDialog({
  open,
  onOpenChange,
  groups,
  columns,
  groupBy,
  groupByLabel,
  metaLines,
  spacing,
}: PdfLayoutDebugDialogProps) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [layout, setLayout] = useState<KanbanPdfLayoutReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activePage, setActivePage] = useState<number | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  // Generuj PDF + raport za każdym razem, gdy dialog się otwiera (lub zmienia config).
  const regenKey = useMemo(
    () =>
      JSON.stringify({
        n: groups.length,
        tasks: groups.reduce((a, g) => a + g.tasks.length, 0),
        groupBy,
        spacing,
        meta: metaLines?.length ?? 0,
      }),
    [groups, groupBy, spacing, metaLines],
  );

  const regenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const [{ default: jsPDF }, autoTableMod] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
      ]);
      const autoTable = (autoTableMod as any).default ?? (autoTableMod as any);
      const { doc, layout } = buildKanbanPdf(
        { jsPDF, autoTable },
        {
          groups,
          columns: columns as any,
          groupBy,
          groupByLabel,
          metaLines: metaLines ?? [],
          spacing,
          // Włączamy debug overlay w PDF, żeby wizualnie korelowało z raportem.
          debug: true,
        },
      );
      const blob: Blob = doc.output("blob");
      const url = URL.createObjectURL(blob);
      // Cleanup poprzedniego URL.
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = url;
      setPdfUrl(url);
      setLayout(layout);
      setActivePage(layout.pages[0]?.page ?? 1);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    void regenerate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, regenKey]);

  // Cleanup przy zamknięciu / unmount.
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, []);

  const downloadPdf = () => {
    if (!pdfUrl) return;
    const a = document.createElement("a");
    a.href = pdfUrl;
    a.download = `kanban-debug-layout.pdf`;
    a.click();
  };

  const downloadJson = () => {
    if (!layout) return;
    const blob = new Blob([JSON.stringify(layout, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kanban-layout-report.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-[95vw] h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-4 py-3 border-b">
          <div className="flex items-center justify-between gap-3">
            <div>
              <DialogTitle className="text-base">
                Debug układu PDF — raport sekcji i stron
              </DialogTitle>
              <DialogDescription className="text-xs">
                PDF jest renderowany z włączonym overlay-em debug (marginesy,
                strefy stopki, gap-y). Po prawej zobaczysz strukturalny raport
                <code className="mx-1 px-1 rounded bg-muted">KanbanPdfLayoutReport</code>
                generowany przez
                <code className="mx-1 px-1 rounded bg-muted">buildKanbanPdf</code>.
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button size="sm" variant="outline" onClick={regenerate} disabled={loading}>
                {loading ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <RefreshCcw className="h-3.5 w-3.5 mr-1.5" />
                )}
                Przelicz
              </Button>
              <Button size="sm" variant="outline" onClick={downloadPdf} disabled={!pdfUrl}>
                <Download className="h-3.5 w-3.5 mr-1.5" />
                PDF
              </Button>
              <Button size="sm" variant="outline" onClick={downloadJson} disabled={!layout}>
                <Download className="h-3.5 w-3.5 mr-1.5" />
                JSON
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 grid grid-cols-[3fr_2fr] min-h-0">
          {/* PDF preview */}
          <div className="border-r bg-muted/30 min-h-0 relative">
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/60 z-10">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}
            {error ? (
              <div className="p-4 text-sm text-destructive">Błąd: {error}</div>
            ) : pdfUrl ? (
              <iframe
                key={pdfUrl}
                src={pdfUrl}
                title="PDF debug preview"
                className="w-full h-full border-0"
              />
            ) : (
              <div className="p-4 text-sm text-muted-foreground">
                Brak danych do podglądu.
              </div>
            )}
          </div>

          {/* Layout report */}
          <ScrollArea className="min-h-0">
            <div className="p-4 space-y-4">
              {layout ? (
                <LayoutReportView
                  layout={layout}
                  activePage={activePage}
                  onSelectPage={setActivePage}
                />
              ) : (
                <div className="text-sm text-muted-foreground">
                  {loading ? "Generowanie raportu…" : "Brak raportu."}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Subkomponenty raportu ───────────────────────────────────────────────────

function fmtPt(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${Math.round(n * 10) / 10}pt`;
}

function LayoutReportView({
  layout,
  activePage,
  onSelectPage,
}: {
  layout: KanbanPdfLayoutReport;
  activePage: number | null;
  onSelectPage: (p: number) => void;
}) {
  return (
    <div className="space-y-4 text-xs">
      {/* Header — geometria i spacing */}
      <section className="rounded-md border p-3 space-y-2">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Geometria strony
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          <Kv label="Format" value={`${Math.round(layout.pageWidth)} × ${Math.round(layout.pageHeight)}pt`} />
          <Kv label="Stron" value={String(layout.totalPages)} />
          <Kv label="margin-top" value={fmtPt(layout.marginTop)} />
          <Kv label="margin-bottom" value={fmtPt(layout.marginBottom)} />
          <Kv label="margin-left" value={fmtPt(layout.marginLeft)} />
          <Kv label="sectionsCount" value={String(layout.totals.sectionsCount)} />
          <Kv label="spacing.headerToTable" value={fmtPt(layout.spacing.headerToTable)} />
          <Kv label="spacing.tableToNextHeader" value={fmtPt(layout.spacing.tableToNextHeader)} />
        </div>
      </section>

      {/* Totals */}
      <section className="rounded-md border p-3 space-y-2">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Sumy / agregaty
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          <Kv label="Σ headerHeight" value={fmtPt(layout.totals.totalHeaderHeight)} />
          <Kv label="Σ tableHeight (start)" value={fmtPt(layout.totals.totalTableHeightOnStartPage)} />
          <Kv label="Σ gapBeforeHeader" value={fmtPt(layout.totals.totalGapBeforeHeader)} />
          <Kv label="avg trailingWhitespace" value={fmtPt(layout.totals.avgTrailingWhitespace)} />
        </div>
      </section>

      {/* Pages */}
      <section className="rounded-md border p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Strony ({layout.pages.length})
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {layout.pages.map((p) => (
            <button
              key={p.page}
              type="button"
              onClick={() => onSelectPage(p.page)}
              className={cn(
                "px-2 py-1 rounded border text-[11px] transition-colors",
                activePage === p.page
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background hover:bg-muted",
              )}
            >
              str. {p.page}
              <span className="ml-1 text-[9px] opacity-70">
                ({p.sectionsStarting}/{p.sectionsEnding})
              </span>
            </button>
          ))}
        </div>
        {activePage != null &&
          (() => {
            const p = layout.pages.find((x) => x.page === activePage);
            if (!p) return null;
            return (
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 pt-1 border-t">
                <Kv label="sectionsStarting" value={String(p.sectionsStarting)} />
                <Kv label="sectionsEnding" value={String(p.sectionsEnding)} />
                <Kv label="firstUsedY" value={fmtPt(p.firstUsedY)} />
                <Kv label="lastUsedY" value={fmtPt(p.lastUsedY)} />
                <Kv
                  label="trailingWhitespace"
                  value={fmtPt(p.trailingWhitespace)}
                  hint={p.trailingWhitespace > 100 ? "duża pusta przestrzeń" : undefined}
                />
              </div>
            );
          })()}
      </section>

      {/* Sections */}
      <section className="rounded-md border p-3 space-y-2">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Sekcje ({layout.sections.length})
        </div>
        <div className="space-y-2">
          {layout.sections.map((s) => {
            const isOnActivePage =
              activePage != null && (s.page === activePage || s.tableEndPage === activePage);
            return (
              <div
                key={`${s.groupIndex}|${s.groupLabel}`}
                className={cn(
                  "rounded border p-2 space-y-1.5",
                  isOnActivePage && "ring-1 ring-primary/40 bg-primary/5",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium text-foreground truncate">
                    [{s.groupIndex}] {s.groupLabel || "(bez nazwy)"}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {s.startsNewPage && (
                      <Badge variant="outline" className="text-[9px] py-0 px-1.5">new page</Badge>
                    )}
                    {s.tablePageSpan > 1 && (
                      <Badge variant="outline" className="text-[9px] py-0 px-1.5">
                        span {s.tablePageSpan}p
                      </Badge>
                    )}
                    <Badge variant="secondary" className="text-[9px] py-0 px-1.5">
                      {s.taskCount} zad.
                    </Badge>
                  </div>
                </div>
                <Separator />
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                  <Kv label="page" value={`${s.page} → ${s.tableEndPage}`} />
                  <Kv label="indexOnPage" value={String(s.indexOnPage)} />
                  <Kv label="headerTop" value={fmtPt(s.headerTop)} />
                  <Kv label="headerBottom" value={fmtPt(s.headerBottom)} />
                  <Kv label="headerHeight" value={fmtPt(s.headerHeight)} />
                  <Kv label="tableStartY" value={fmtPt(s.tableStartY)} />
                  <Kv label="tableFinalY" value={fmtPt(s.tableFinalY)} />
                  <Kv label="tableHeight (1.str)" value={fmtPt(s.tableHeightFirstPage)} />
                  <Kv
                    label="gapBeforeHeader"
                    value={s.gapBeforeHeader == null ? "—" : fmtPt(s.gapBeforeHeader)}
                    hint={
                      s.gapBeforeHeader != null &&
                      Math.abs(s.gapBeforeHeader - layout.spacing.tableToNextHeader) > 0.5
                        ? `oczekiwane: ${layout.spacing.tableToNextHeader}pt`
                        : undefined
                    }
                  />
                  <Kv label="sectionHeight (start)" value={fmtPt(s.sectionHeightOnStartPage)} />
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Kv({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 leading-tight">
      <span className="text-muted-foreground text-[10px]">{label}</span>
      <span
        className={cn(
          "font-mono text-[11px] tabular-nums",
          hint && "text-amber-600 dark:text-amber-400",
        )}
        title={hint}
      >
        {value}
      </span>
    </div>
  );
}
