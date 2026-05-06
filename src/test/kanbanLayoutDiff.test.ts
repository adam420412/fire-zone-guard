/**
 * Testy jednostkowe helpera `diffKanbanLayouts` i matchera `toMatchKanbanLayout`.
 * Sprawdzają czytelność i kompletność raportu różnic.
 */

import { describe, it, expect } from "vitest";
import {
  diffKanbanLayouts,
  type AnyLayoutSnapshot,
} from "@/test/utils/kanbanLayoutDiff";

const baseLayout = (): AnyLayoutSnapshot => ({
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
      groupLabel: "Alfa",
      page: 1,
      headerTop: 78,
      headerBottom: 99,
      tableStartY: 99,
      tableFinalY: 250,
      tableEndPage: 1,
      headerHeight: 21,
      tableHeightFirstPage: 151,
      tablePageSpan: 1,
      sectionHeightOnStartPage: 172,
      gapBeforeHeader: null,
      startsNewPage: true,
      indexOnPage: 0,
      taskCount: 8,
    },
    {
      groupIndex: 1,
      groupLabel: "Beta",
      page: 1,
      headerTop: 268,
      headerBottom: 289,
      tableStartY: 289,
      tableFinalY: 500,
      tableEndPage: 2,
      headerHeight: 21,
      tableHeightFirstPage: 276,
      tablePageSpan: 2,
      sectionHeightOnStartPage: 297,
      gapBeforeHeader: 18,
      startsNewPage: false,
      indexOnPage: 1,
      taskCount: 12,
    },
  ],
  pages: [
    { page: 1, sectionsStarting: 2, sectionsEnding: 1, firstUsedY: 78, lastUsedY: 565, trailingWhitespace: 0 },
    { page: 2, sectionsStarting: 0, sectionsEnding: 1, firstUsedY: 40, lastUsedY: 500, trailingWhitespace: 65 },
  ],
  totals: {
    sectionsCount: 2,
    totalHeaderHeight: 42,
    totalTableHeightOnStartPage: 427,
    totalGapBeforeHeader: 18,
    avgTrailingWhitespace: 33,
  },
});

describe("diffKanbanLayouts", () => {
  it("zwraca pusty string dla identycznych layoutów", () => {
    expect(diffKanbanLayouts(baseLayout(), baseLayout())).toBe("");
  });

  it("wykrywa zmianę spacing.tableToNextHeader z deltą", () => {
    const a = baseLayout();
    const b = baseLayout();
    b.spacing!.tableToNextHeader = 24;
    const out = diffKanbanLayouts(a, b);
    expect(out).toContain("spacing.tableToNextHeader: 18pt → 24pt");
    expect(out).toContain("Δ +6pt");
  });

  it("wykrywa zmianę totalPages w nagłówku podsumowania", () => {
    const a = baseLayout();
    const b = baseLayout();
    b.totalPages = 3;
    const out = diffKanbanLayouts(a, b);
    expect(out).toContain("stron: 2 → 3");
    expect(out).toContain("totalPages: 2 → 3");
  });

  it("raportuje przesunięcie tableFinalY i ΔY w sekcji", () => {
    const a = baseLayout();
    const b = baseLayout();
    b.sections[0].tableFinalY = 270;
    const out = diffKanbanLayouts(a, b);
    expect(out).toContain("sekcja [0|Alfa]");
    expect(out).toContain("tableFinalY: 250pt → 270pt");
    expect(out).toContain("Δ +20pt");
  });

  it("wykrywa dodaną i usuniętą sekcję", () => {
    const a = baseLayout();
    const b = baseLayout();
    b.sections.push({
      groupIndex: 2,
      groupLabel: "Gamma",
      page: 2,
      headerTop: 100,
      headerBottom: 121,
      tableStartY: 121,
      tableFinalY: 200,
      tableEndPage: 2,
    });
    let out = diffKanbanLayouts(a, b);
    expect(out).toContain("nowa sekcja [2|Gamma]");
    expect(out).toContain("dodanych: 1");

    a.sections.push({
      groupIndex: 3,
      groupLabel: "Delta",
      page: 3,
      headerTop: 50,
      headerBottom: 70,
      tableStartY: 70,
      tableFinalY: 200,
      tableEndPage: 3,
    });
    out = diffKanbanLayouts(a, b);
    expect(out).toContain("usunięta sekcja [3|Delta]");
    expect(out).toContain("usuniętych: 1");
  });

  it("raportuje zmiany per-page (trailingWhitespace, sectionsEnding)", () => {
    const a = baseLayout();
    const b = baseLayout();
    b.pages![1].trailingWhitespace = 120;
    b.pages![1].sectionsEnding = 2;
    const out = diffKanbanLayouts(a, b);
    expect(out).toContain("strona 2");
    expect(out).toContain("trailingWhitespace: 65pt → 120pt");
    expect(out).toContain("sectionsEnding: 1 → 2");
  });

  it("zawiera wszystkie sekcje raportu (geometria/totals/strony/sekcje) gdy wszystko się zmienia", () => {
    const a = baseLayout();
    const b = baseLayout();
    b.marginTop = 50;
    b.totals!.totalHeaderHeight = 60;
    b.pages![0].lastUsedY = 580;
    b.sections[0].headerHeight = 30;
    const out = diffKanbanLayouts(a, b);
    expect(out).toContain("▼ Geometria strony / spacing");
    expect(out).toContain("▼ Sumy / agregaty");
    expect(out).toContain("▼ Strony (per-page)");
    expect(out).toContain("▼ Sekcje (per-grupa)");
  });
});

describe("toMatchKanbanLayout (custom matcher)", () => {
  it("przechodzi dla identycznych layoutów", () => {
    expect(baseLayout()).toMatchKanbanLayout(baseLayout());
  });

  it("zwraca czytelny raport gdy layouty się różnią", () => {
    const a = baseLayout();
    const b = baseLayout();
    b.sections[1].tableFinalY = 510;
    let captured = "";
    try {
      expect(b).toMatchKanbanLayout(a);
    } catch (err: any) {
      captured = String(err?.message ?? err);
    }
    expect(captured).toContain("Layouty PDF różnią się");
    expect(captured).toContain("sekcja [1|Beta]");
    expect(captured).toContain("tableFinalY: 500pt → 510pt");
  });
});
