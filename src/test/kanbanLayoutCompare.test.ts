import { describe, it, expect } from "vitest";
import {
  compareKanbanLayouts,
  formatKanbanLayoutCompare,
} from "@/lib/kanbanLayoutCompare";
import type { KanbanPdfLayoutReport } from "@/lib/kanbanPdfExport";

function baselineLayout(): KanbanPdfLayoutReport {
  return {
    pageWidth: 842,
    pageHeight: 595,
    marginTop: 40,
    marginBottom: 30,
    marginLeft: 40,
    spacing: { headerToTable: 8, tableToNextHeader: 18 },
    totalPages: 2,
    sections: [
      {
        groupIndex: 0,
        groupLabel: "Alpha",
        page: 1,
        headerTop: 80,
        headerBottom: 100,
        tableStartY: 108,
        tableFinalY: 300,
        tableEndPage: 1,
        headerHeight: 20,
        tableHeightFirstPage: 192,
        tablePageSpan: 1,
        sectionHeightOnStartPage: 212,
        gapBeforeHeader: null,
        startsNewPage: true,
        indexOnPage: 0,
        taskCount: 5,
      },
      {
        groupIndex: 1,
        groupLabel: "Beta",
        page: 1,
        headerTop: 318,
        headerBottom: 338,
        tableStartY: 346,
        tableFinalY: 500,
        tableEndPage: 2,
        headerHeight: 20,
        tableHeightFirstPage: 219,
        tablePageSpan: 2,
        sectionHeightOnStartPage: 239,
        gapBeforeHeader: 18,
        startsNewPage: false,
        indexOnPage: 1,
        taskCount: 12,
      },
    ],
    pages: [
      {
        page: 1,
        sectionsStarting: 2,
        sectionsEnding: 1,
        firstUsedY: 80,
        lastUsedY: 565,
        trailingWhitespace: 0,
      },
      {
        page: 2,
        sectionsStarting: 0,
        sectionsEnding: 1,
        firstUsedY: 40,
        lastUsedY: 200,
        trailingWhitespace: 365,
      },
    ],
    totals: {
      sectionsCount: 2,
      totalHeaderHeight: 40,
      totalTableHeightOnStartPage: 411,
      totalGapBeforeHeader: 18,
      avgTrailingWhitespace: 182.5,
    },
  };
}

describe("compareKanbanLayouts", () => {
  it("returns identical=true for the same report", () => {
    const a = baselineLayout();
    const b = baselineLayout();
    const res = compareKanbanLayouts(a, b);
    expect(res.identical).toBe(true);
    expect(res.sections.changed).toHaveLength(0);
    expect(res.pages.changed).toHaveLength(0);
    expect(res.pagination.pageBreaksChanged).toBe(false);
    expect(formatKanbanLayoutCompare(res)).toContain("identyczny");
  });

  it("detects height regressions (header + first-page table)", () => {
    const a = baselineLayout();
    const b = baselineLayout();
    b.sections[0].headerHeight = 30;
    b.sections[0].sectionHeightOnStartPage = 222;
    b.sections[1].tableHeightFirstPage = 230;
    b.sections[1].sectionHeightOnStartPage = 250;

    const res = compareKanbanLayouts(a, b);
    expect(res.identical).toBe(false);
    expect(res.highlights.heightChanges).toHaveLength(2);
    const alpha = res.highlights.heightChanges.find((d) => d.groupLabel === "Alpha")!;
    expect(alpha.headerHeight.delta).toBeCloseTo(10);
    const beta = res.highlights.heightChanges.find((d) => d.groupLabel === "Beta")!;
    expect(beta.tableHeightFirstPage.delta).toBeCloseTo(11);
  });

  it("detects page-break flips and page moves", () => {
    const a = baselineLayout();
    const b = baselineLayout();
    // Beta now starts on a NEW page instead of sharing page 1 with Alpha.
    b.sections[1].page = 2;
    b.sections[1].tableEndPage = 3;
    b.sections[1].tablePageSpan = 2;
    b.sections[1].startsNewPage = true;
    b.sections[1].gapBeforeHeader = null;
    b.sections[1].indexOnPage = 0;
    b.totalPages = 3;

    const res = compareKanbanLayouts(a, b);
    expect(res.pagination.pageBreaksChanged).toBe(true);
    expect(res.pagination.totalPages.delta).toBe(1);
    const flips = res.pagination.pageBreakFlips;
    expect(flips.some((d) => d.groupLabel === "Beta" && d.startsNewPageFlipped)).toBe(true);
    expect(res.highlights.pageMoves.some((d) => d.groupLabel === "Beta")).toBe(true);
  });

  it("detects gap regressions", () => {
    const a = baselineLayout();
    const b = baselineLayout();
    b.sections[1].gapBeforeHeader = 30; // 18 → 30
    b.totals.totalGapBeforeHeader = 30;

    const res = compareKanbanLayouts(a, b);
    expect(res.highlights.gapChanges).toHaveLength(1);
    expect(res.highlights.gapChanges[0].gapBeforeHeader.delta).toBeCloseTo(12);
    expect(res.totals.totalGapBeforeHeader.delta).toBeCloseTo(12);
  });

  it("detects added and removed sections", () => {
    const a = baselineLayout();
    const b = baselineLayout();
    // Drop Beta, add Gamma.
    b.sections.pop();
    b.sections.push({
      groupIndex: 2,
      groupLabel: "Gamma",
      page: 2,
      headerTop: 80,
      headerBottom: 100,
      tableStartY: 108,
      tableFinalY: 200,
      tableEndPage: 2,
      headerHeight: 20,
      tableHeightFirstPage: 92,
      tablePageSpan: 1,
      sectionHeightOnStartPage: 112,
      gapBeforeHeader: null,
      startsNewPage: true,
      indexOnPage: 0,
      taskCount: 3,
    });

    const res = compareKanbanLayouts(a, b);
    expect(res.sections.added.map((d) => d.groupLabel)).toEqual(["Gamma"]);
    expect(res.sections.removed.map((d) => d.groupLabel)).toEqual(["Beta"]);
  });

  it("ignores sub-tolerance float noise from autoTable", () => {
    const a = baselineLayout();
    const b = baselineLayout();
    b.sections[0].tableFinalY = 300.0001; // < 5e-4 pt
    b.sections[1].headerTop = 318.0002;

    const res = compareKanbanLayouts(a, b);
    expect(res.identical).toBe(true);
  });

  it("formatKanbanLayoutCompare highlights heights, page-breaks and gaps", () => {
    const a = baselineLayout();
    const b = baselineLayout();
    b.sections[0].headerHeight = 30;
    b.sections[0].sectionHeightOnStartPage = 222;
    b.sections[1].gapBeforeHeader = 30;
    b.totals.totalHeaderHeight = 50;

    const text = formatKanbanLayoutCompare(compareKanbanLayouts(a, b));
    expect(text).toContain("KanbanPdfLayout COMPARE");
    expect(text).toContain("Wysokości sekcji");
    expect(text).toContain("Gaps");
    expect(text).toContain("Totals");
    expect(text).toContain("Δ");
  });
});
