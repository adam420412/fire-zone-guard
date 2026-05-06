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
  } = opts;

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginTop = 40;
  const marginBottom = 30;
  const marginLeft = 40;

  const drawFooter = () => {
    const str = `Strona ${doc.getNumberOfPages()}`;
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(str, pageWidth - 60, pageHeight - 14);
  };

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
  const GROUP_HEADER_GAP_BEFORE = 16;
  const GROUP_HEADER_GAP_AFTER = 6;

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

    if (cursorY + minSectionHeight > pageHeight - marginBottom) {
      doc.addPage();
      drawFooter();
      cursorY = marginTop;
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
