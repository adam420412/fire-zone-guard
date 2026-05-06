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

  const GROUP_HEADER_FONT = 11;
  const GROUP_HEADER_HEIGHT = GROUP_HEADER_FONT * 1.25;
  const GROUP_HEADER_GAP_BEFORE = 16;
  const GROUP_HEADER_GAP_AFTER = 6;
  const MIN_SECTION_HEIGHT = GROUP_HEADER_HEIGHT + 16 + 14;

  const sections: KanbanPdfLayoutSection[] = [];

  groups.forEach((g, idx) => {
    if (idx > 0) {
      const lastY = (doc as any).lastAutoTable?.finalY;
      cursorY = (typeof lastY === "number" ? lastY : cursorY) + GROUP_HEADER_GAP_BEFORE;
    }

    let headerTop = cursorY;
    let headerBottom = cursorY;

    if (groupBy !== "none") {
      if (cursorY + MIN_SECTION_HEIGHT > pageHeight - marginBottom) {
        doc.addPage();
        drawFooter();
        cursorY = marginTop;
      }
      doc.setFontSize(GROUP_HEADER_FONT);
      doc.setTextColor(40);
      const headerBaseline = cursorY + GROUP_HEADER_HEIGHT;
      doc.text(
        `${groupByLabel[groupBy] ?? groupBy}: ${g.label}  (${g.tasks.length})`,
        marginLeft,
        headerBaseline,
      );
      headerTop = cursorY;
      headerBottom = headerBaseline + GROUP_HEADER_GAP_AFTER;
      cursorY = headerBottom;
    } else {
      if (cursorY + MIN_SECTION_HEIGHT > pageHeight - marginBottom) {
        doc.addPage();
        drawFooter();
        cursorY = marginTop;
      }
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
      styles: { fontSize: 8, cellPadding: 3, overflow: "linebreak" },
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
