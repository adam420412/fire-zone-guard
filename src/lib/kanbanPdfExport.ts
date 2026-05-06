/**
 * Pure builder for the Kanban "Eksport zadań" PDF.
 *
 * Extracted from src/pages/KanbanPage.tsx so it can be unit-tested.
 * The function returns both the jsPDF document AND a structured layout
 * report describing where each group header / table was placed.
 *
 * Tests use the layout report to assert that group headers and tables
 * never overlap (even across page breaks).
 */

export type KanbanPdfColumn = {
  label: string;
  pdfShort?: string;
  pdfWidth?: number;
  accessor: (task: any) => string | number | null | undefined;
};

export type KanbanPdfGroup = {
  label: string;
  tasks: any[];
};

export type KanbanPdfLayoutSection = {
  groupIndex: number;
  groupLabel: string;
  page: number;
  /** Top of group header band (cursorY before drawing the header). */
  headerTop: number;
  /** Bottom of group header band (where the next element may start). */
  headerBottom: number;
  /** startY passed to autoTable. Must be >= headerBottom. */
  tableStartY: number;
  /** finalY reported by autoTable after rendering the table. */
  tableFinalY: number;
  /** Page number where the table finished. */
  tableEndPage: number;
};

export type KanbanPdfLayoutReport = {
  pageWidth: number;
  pageHeight: number;
  marginTop: number;
  marginBottom: number;
  totalPages: number;
  sections: KanbanPdfLayoutSection[];
};

export type BuildKanbanPdfDeps = {
  jsPDF: any;
  autoTable: (doc: any, options: any) => void;
};

export type BuildKanbanPdfOptions = {
  groups: KanbanPdfGroup[];
  columns: KanbanPdfColumn[];
  groupBy: "none" | "company" | "building" | "person" | string;
  groupByLabel: Record<string, string>;
  metaLines?: string[];
  title?: string;
  /** Rysuje obrysy marginesów, oś dolnego marginesu i adnotacje "miejsce do końca strony". */
  debug?: boolean;
};

export function buildKanbanPdf(
  deps: BuildKanbanPdfDeps,
  opts: BuildKanbanPdfOptions,
): { doc: any; layout: KanbanPdfLayoutReport } {
  const { jsPDF, autoTable } = deps;
  const {
    groups,
    columns,
    groupBy,
    groupByLabel,
    metaLines = [],
    title = "Fire Zone — Eksport zadań (Kanban)",
    debug = false,
  } = opts;

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginTop = 40;
  const marginBottom = 30;
  const marginLeft = 40;

  // Strony, na których stopka została już narysowana — gwarancja idempotencji
  // niezależnie od tego, czy wywoła nas manualny page-break czy autoTable.didDrawPage.
  const footeredPages = new Set<number>();
  const drawFooter = () => {
    const page = doc.getNumberOfPages();
    if (footeredPages.has(page)) return;
    footeredPages.add(page);
    const prevSize = doc.getFontSize();
    const prevText = (doc.getTextColor?.() as string) ?? "0";
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`Strona ${page}`, pageWidth - 60, pageHeight - 14);
    doc.setFontSize(prevSize);
    doc.setTextColor(prevText as any);
  };

  // ── Debug overlay ─────────────────────────────────────────────────────────
  const debugFramedPages = new Set<number>();
  const drawDebugFrame = () => {
    if (!debug) return;
    const page = doc.getNumberOfPages();
    if (debugFramedPages.has(page)) return;
    debugFramedPages.add(page);
    const prevDraw = (doc.getDrawColor?.() as string) ?? "0";
    const prevFill = (doc.getFillColor?.() as string) ?? "0";
    const prevText = (doc.getTextColor?.() as string) ?? "0";
    const prevSize = doc.getFontSize();
    const prevLW = doc.getLineWidth?.() ?? 0.2;

    // Obrys obszaru użytkowego (margin box).
    doc.setLineWidth(0.4);
    doc.setDrawColor(255, 80, 80);
    doc.setLineDashPattern?.([3, 3], 0);
    doc.rect(
      marginLeft,
      marginTop,
      pageWidth - 2 * marginLeft,
      pageHeight - marginTop - marginBottom,
    );
    // Linia dolnego marginesu (granica strefy stopki) — ciągła.
    doc.setLineDashPattern?.([], 0);
    doc.setDrawColor(255, 140, 0);
    doc.setLineWidth(0.6);
    const bottomY = pageHeight - marginBottom;
    doc.line(marginLeft, bottomY, pageWidth - marginLeft, bottomY);

    // Etykieta granicy.
    doc.setFontSize(7);
    doc.setTextColor(255, 80, 0);
    doc.text(
      `↑ margin-bottom = ${marginBottom}pt   page = ${pageWidth.toFixed(0)}×${pageHeight.toFixed(0)}pt`,
      marginLeft + 2,
      bottomY - 2,
    );
    doc.text(
      `margin-top = ${marginTop}pt`,
      marginLeft + 2,
      marginTop - 2,
    );

    // Reset.
    doc.setLineDashPattern?.([], 0);
    doc.setLineWidth(prevLW);
    doc.setDrawColor(prevDraw as any);
    doc.setFillColor(prevFill as any);
    doc.setTextColor(prevText as any);
    doc.setFontSize(prevSize);
  };

  /** Adnotacja przy aktualnym kursorze: ile pt zostało do dolnego marginesu i czy się mieści. */
  const drawDebugCursorAnnotation = (
    yTop: number,
    needed: number,
    label: string,
  ) => {
    if (!debug) return;
    const prevDraw = (doc.getDrawColor?.() as string) ?? "0";
    const prevText = (doc.getTextColor?.() as string) ?? "0";
    const prevSize = doc.getFontSize();
    const prevLW = doc.getLineWidth?.() ?? 0.2;

    const remaining = pageHeight - marginBottom - yTop;
    const fits = needed <= remaining;
    const color: [number, number, number] = fits ? [0, 140, 70] : [200, 0, 0];

    // Strzałka wzdłuż prawej krawędzi obszaru użytkowego.
    const x = pageWidth - marginLeft + 4;
    doc.setDrawColor(...color);
    doc.setLineWidth(0.4);
    doc.line(x, yTop, x, pageHeight - marginBottom);
    // Czapeczki strzałki.
    doc.line(x - 2, yTop + 2, x, yTop);
    doc.line(x + 2, yTop + 2, x, yTop);
    doc.line(x - 2, pageHeight - marginBottom - 2, x, pageHeight - marginBottom);
    doc.line(x + 2, pageHeight - marginBottom - 2, x, pageHeight - marginBottom);

    doc.setFontSize(6.5);
    doc.setTextColor(...color);
    doc.text(
      `${label} | potrzebne: ${needed.toFixed(0)}pt | wolne: ${remaining.toFixed(0)}pt ${fits ? "✓" : "✗ → nowa strona"}`,
      marginLeft + 2,
      yTop - 1,
    );

    doc.setLineWidth(prevLW);
    doc.setDrawColor(prevDraw as any);
    doc.setTextColor(prevText as any);
    doc.setFontSize(prevSize);
  };

  drawDebugFrame();

  doc.setFontSize(14);
  doc.setTextColor(0);
  doc.text(title, marginLeft, 36);
  doc.setFontSize(9);
  doc.setTextColor(110);
  metaLines.forEach((line, i) => doc.text(line, marginLeft, 54 + i * 12));
  let cursorY = metaLines.length ? 54 + metaLines.length * 12 + 8 : 50;

  const columnStyles: Record<number, { cellWidth: number }> = {};
  columns.forEach((c, i) => {
    if (c.pdfWidth) columnStyles[i] = { cellWidth: c.pdfWidth };
  });

  // ── Pomiary rzeczywistej wysokości elementów (zamiast stałych przybliżeń) ──
  // Style tabeli (zsynchronizowane z autoTable poniżej):
  const TABLE_FONT_SIZE = 8;
  const TABLE_CELL_PADDING = 3;
  const GROUP_HEADER_FONT = 11;
  // ── Sztywne odstępy pionowe (pt). Stałe i niezależne od pomiarów. ──
  /** Odstęp między końcem POPRZEDNIEJ tabeli a górą nagłówka KOLEJNEJ grupy. */
  const GAP_BETWEEN_TABLE_AND_NEXT_HEADER = 18;
  /** Odstęp między dolną krawędzią nagłówka grupy a pierwszym wierszem tabeli. */
  const GAP_BETWEEN_HEADER_AND_TABLE = 8;
  // Aliasy zachowane dla czytelności w istniejącym kodzie.
  const GROUP_HEADER_GAP_BEFORE = GAP_BETWEEN_TABLE_AND_NEXT_HEADER;
  const GROUP_HEADER_GAP_AFTER = GAP_BETWEEN_HEADER_AND_TABLE;

  /** Wysokość pojedynczej linii tekstu przy danym rozmiarze fontu (pt). */
  const measureLineHeight = (fontSize: number): number => {
    const prevSize = doc.getFontSize();
    doc.setFontSize(fontSize);
    // jsPDF: getLineHeight() = fontSize * lineHeightFactor; w razie braku — fallback.
    const lh =
      typeof doc.getLineHeight === "function"
        ? doc.getLineHeight()
        : fontSize * (doc.getLineHeightFactor?.() ?? 1.15);
    doc.setFontSize(prevSize);
    return lh;
  };

  /** Realna wysokość bloku tekstu nagłówka grupy (z marginesem na descender). */
  const measureGroupHeaderHeight = (text: string): number => {
    const prevSize = doc.getFontSize();
    doc.setFontSize(GROUP_HEADER_FONT);
    const dims =
      typeof doc.getTextDimensions === "function"
        ? doc.getTextDimensions(text)
        : { h: GROUP_HEADER_FONT * 1.25 };
    doc.setFontSize(prevSize);
    return dims.h;
  };

  /** Wysokość wiersza tabeli (head lub body) — autoTable: lineHeight + 2 * cellPadding. */
  const measureTableRowHeight = (): number =>
    measureLineHeight(TABLE_FONT_SIZE) + 2 * TABLE_CELL_PADDING;

  const sections: KanbanPdfLayoutSection[] = [];

  groups.forEach((g, idx) => {
    if (idx > 0) {
      const lastY = (doc as any).lastAutoTable?.finalY;
      cursorY = (typeof lastY === "number" ? lastY : cursorY) + GROUP_HEADER_GAP_BEFORE;
    }

    const groupHeaderText =
      groupBy !== "none"
        ? `${groupByLabel[groupBy] ?? groupBy}: ${g.label}  (${g.tasks.length})`
        : "";
    const groupHeaderHeight = groupBy !== "none" ? measureGroupHeaderHeight(groupHeaderText) : 0;
    const tableHeaderHeight = measureTableRowHeight();
    const tableRowHeight = measureTableRowHeight();
    // Minimum potrzebne, by w ogóle warto było zaczynać sekcję na bieżącej stronie:
    // nagłówek grupy (+ gap po) + nagłówek tabeli + co najmniej 1 wiersz danych.
    const minSectionHeight =
      (groupBy !== "none" ? groupHeaderHeight + GROUP_HEADER_GAP_AFTER : 0) +
      tableHeaderHeight +
      tableRowHeight;

    let headerTop = cursorY;
    let headerBottom = cursorY;

    // Adnotacja debug PRZED ewentualnym page-breakiem (pokazuje wynik decyzji).
    drawDebugCursorAnnotation(
      cursorY,
      minSectionHeight,
      `sekcja "${g.label}" (min ${minSectionHeight.toFixed(0)}pt)`,
    );

    if (cursorY + minSectionHeight > pageHeight - marginBottom) {
      doc.addPage();
      drawFooter();
      drawDebugFrame();
      cursorY = marginTop;
      // Po page-breaku dorysuj adnotację już na nowej stronie.
      drawDebugCursorAnnotation(
        cursorY,
        minSectionHeight,
        `sekcja "${g.label}" po page-break`,
      );
    }

    if (groupBy !== "none") {
      doc.setFontSize(GROUP_HEADER_FONT);
      doc.setTextColor(40);
      // Baseline = top + wysokość bloku tekstu (descender uwzględniony przez getTextDimensions).
      const headerBaseline = cursorY + groupHeaderHeight;
      doc.text(groupHeaderText, marginLeft, headerBaseline);
      headerTop = cursorY;
      headerBottom = headerBaseline + GROUP_HEADER_GAP_AFTER;
      cursorY = headerBottom;

      if (debug) {
        // Lekki obrys nagłówka grupy.
        const prevDraw = (doc.getDrawColor?.() as string) ?? "0";
        const prevLW = doc.getLineWidth?.() ?? 0.2;
        doc.setLineWidth(0.3);
        doc.setDrawColor(0, 120, 200);
        doc.setLineDashPattern?.([1.5, 1.5], 0);
        doc.rect(marginLeft - 1, headerTop, pageWidth - 2 * marginLeft + 2, headerBottom - headerTop);
        doc.setLineDashPattern?.([], 0);
        doc.setLineWidth(prevLW);
        doc.setDrawColor(prevDraw as any);
      }
    } else {
      headerTop = cursorY;
      headerBottom = cursorY;
    }

    const tableStartY = cursorY;
    const tableStartPage = doc.getNumberOfPages();

    autoTable(doc, {
      startY: tableStartY,
      margin: { top: marginTop, bottom: marginBottom, left: marginLeft, right: marginLeft },
      head: [columns.map((c) => c.pdfShort ?? c.label)],
      body: g.tasks.length
        ? g.tasks.map((t: any) => columns.map((c) => String(c.accessor(t) ?? "")))
        : [["(brak zadań w grupie)", ...columns.slice(1).map(() => "")]],
      styles: { fontSize: TABLE_FONT_SIZE, cellPadding: TABLE_CELL_PADDING, overflow: "linebreak" },
      headStyles: { fillColor: [220, 38, 38], textColor: 255 },
      alternateRowStyles: { fillColor: [248, 248, 248] },
      columnStyles,
      showHead: "everyPage",
      rowPageBreak: "avoid",
      didDrawPage: () => {
        drawFooter();
        drawDebugFrame();
      },
    });

    const tableFinalY = (doc as any).lastAutoTable?.finalY ?? tableStartY;
    const tableEndPage = doc.getNumberOfPages();
    cursorY = tableFinalY;

    sections.push({
      groupIndex: idx,
      groupLabel: g.label,
      page: tableStartPage,
      headerTop,
      headerBottom,
      tableStartY,
      tableFinalY,
      tableEndPage,
    });
  });

  // Sweep końcowy: gwarancja, że KAŻDA strona ma stopkę dokładnie raz
  // (np. gdy autoTable dodał stronę bez wywołania didDrawPage, albo gdy
  // pierwsza strona została utworzona implicite przez konstruktor jsPDF).
  const totalPagesFinal = doc.getNumberOfPages();
  for (let p = 1; p <= totalPagesFinal; p++) {
    if (footeredPages.has(p)) continue;
    doc.setPage(p);
    drawFooter();
  }
  doc.setPage(totalPagesFinal);

  return {
    doc,
    layout: {
      pageWidth,
      pageHeight,
      marginTop,
      marginBottom,
      totalPages: doc.getNumberOfPages(),
      sections,
    },
  };
}
